// Postgres connection budget for a Laravel app, with and without PgBouncer.
//
// Facts used (checked 2026-10-05):
// - Postgres max_connections defaults to 100, superuser_reserved_connections
//   to 3 and reserved_connections (Postgres 16+) to 0.
//   https://www.postgresql.org/docs/current/runtime-config-connection.html
// - PgBouncer defaults: pool_mode session, default_pool_size 20,
//   max_client_conn 100, reserve_pool_size 0, max_prepared_statements 200
//   (prepared statement support since 1.21, on by default since 1.24).
//   https://www.pgbouncer.org/config.html, https://www.pgbouncer.org/changelog.html
// - Pool size rule of thumb: active connections near (cores × 2) +
//   effective spindles, from the PostgreSQL wiki.
//   https://wiki.postgresql.org/wiki/Number_Of_Database_Connections
// - Octane starts one worker per CPU core by default.
//   https://laravel.com/docs/12.x/octane#specifying-the-worker-count

export type WebMode = "fpm" | "octane";

export interface PgInput {
  /** App servers (or containers) that serve web traffic. */
  webServers: number;
  webMode: WebMode;
  /** pm.max_children per server, or Octane workers per server. */
  webProcesses: number;
  /** Servers running Horizon or queue:work. */
  queueServers: number;
  /** Worker processes per queue server (Horizon maxProcesses summed over supervisors). */
  queueProcesses: number;
  /** Scheduled commands that can run at the same time (runInBackground, withoutOverlapping). */
  schedulerProcesses: number;
  /** DB connections one PHP process opens (2 with a read/write split, more with several connections). */
  connsPerProcess: number;
  /** Anything else: migrations, psql, backups, monitoring, a second app. */
  otherClients: number;
  maxConnections: number;
  superuserReserved: number;
  reserved: number;
  /** CPU cores on the database server (not hyperthreads). */
  dbCores: number;
  /** PgBouncer pools: database × user pairs that clients use. */
  pools: number;
}

export const PG_DEFAULTS: PgInput = {
  webServers: 2,
  webMode: "fpm",
  webProcesses: 20,
  queueServers: 1,
  queueProcesses: 10,
  schedulerProcesses: 2,
  connsPerProcess: 1,
  otherClients: 5,
  maxConnections: 100,
  superuserReserved: 3,
  reserved: 0,
  dbCores: 4,
  pools: 1,
};

export interface RoleLine {
  role: string;
  servers: number;
  processes: number;
  connections: number;
  note: string;
}

export interface PgResult {
  lines: RoleLine[];
  /** Peak client connections if every process holds its connections. */
  totalClients: number;
  /** Slots normal roles can use: max_connections - reserved slots. */
  usable: number;
  /** totalClients / usable. */
  load: number;
  direct: "ok" | "tight" | "over";
  /** Suggested PgBouncer settings. */
  poolSize: number;
  reservePool: number;
  maxClientConn: number;
  /** Server connections PgBouncer can open: pools × (pool + reserve). */
  bouncerServerConns: number;
  bouncerFits: boolean;
  /** max_connections you need for direct connections with 20% headroom. */
  maxConnectionsNeeded: number;
  warnings: string[];
}

const pos = (n: number) => (Number.isFinite(n) && n > 0 ? n : 0);
const int = (n: number) => Math.floor(pos(n));

export function planConnections(raw: PgInput): PgResult {
  const i: PgInput = {
    ...raw,
    webServers: int(raw.webServers),
    webProcesses: int(raw.webProcesses),
    queueServers: int(raw.queueServers),
    queueProcesses: int(raw.queueProcesses),
    schedulerProcesses: int(raw.schedulerProcesses),
    connsPerProcess: Math.max(1, int(raw.connsPerProcess)),
    otherClients: int(raw.otherClients),
    maxConnections: int(raw.maxConnections),
    superuserReserved: int(raw.superuserReserved),
    reserved: int(raw.reserved),
    dbCores: Math.max(1, int(raw.dbCores)),
    pools: Math.max(1, int(raw.pools)),
  };
  const c = i.connsPerProcess;
  const lines: RoleLine[] = [
    {
      role: i.webMode === "octane" ? "Octane workers" : "PHP-FPM children",
      servers: i.webServers,
      processes: i.webProcesses,
      connections: i.webServers * i.webProcesses * c,
      note:
        i.webMode === "octane"
          ? "Each worker keeps its connection open between requests."
          : "A child holds a connection only while it serves a request, so this is the peak when every child is busy.",
    },
    {
      role: "Horizon / queue workers",
      servers: i.queueServers,
      processes: i.queueProcesses,
      connections: i.queueServers * i.queueProcesses * c,
      note: "Long-running workers keep their connection open.",
    },
    {
      role: "Scheduler",
      servers: i.schedulerProcesses > 0 ? 1 : 0,
      processes: i.schedulerProcesses,
      connections: i.schedulerProcesses * c,
      note: "Scheduled commands running at the same time.",
    },
    {
      role: "Other clients",
      servers: 0,
      processes: i.otherClients,
      connections: i.otherClients,
      note: "Migrations, psql, backups, monitoring.",
    },
  ];
  const totalClients = lines.reduce((s, l) => s + l.connections, 0);
  const usable = Math.max(
    0,
    i.maxConnections - i.superuserReserved - i.reserved,
  );
  const load = usable > 0 ? totalClients / usable : Infinity;
  const direct = load > 1 ? "over" : load > 0.8 ? "tight" : "ok";

  // PgBouncer: a small pool of busy server connections serves many clients.
  const poolSize = Math.max(2, i.dbCores * 2);
  const reservePool = Math.max(1, Math.ceil(poolSize / 4));
  const maxClientConn = Math.max(
    100,
    Math.ceil((totalClients * 1.2) / 10) * 10,
  );
  const bouncerServerConns = i.pools * (poolSize + reservePool);
  const bouncerFits = bouncerServerConns + i.otherClients <= usable;
  const maxConnectionsNeeded =
    Math.ceil(totalClients * 1.2) + i.superuserReserved + i.reserved;

  const warnings: string[] = [];
  if (direct === "over")
    warnings.push(
      `Without a pooler you can hit "too many clients already" (SQLSTATE 53300): ${totalClients} possible connections for ${usable} usable slots.`,
    );
  else if (direct === "tight")
    warnings.push(
      `Direct connections use ${Math.round(load * 100)}% of the usable slots. A deploy that starts new workers before old ones stop can push you over.`,
    );
  if (!bouncerFits)
    warnings.push(
      `${i.pools} pool${i.pools === 1 ? "" : "s"} × (${poolSize} + ${reservePool} reserve) = ${bouncerServerConns} server connections, plus ${i.otherClients} other clients, is more than the ${usable} usable slots. Lower the pool size or raise max_connections.`,
    );
  if (totalClients > 100)
    warnings.push(
      `PgBouncer's max_client_conn defaults to 100. Set it to at least ${maxClientConn} or clients will be refused. Raise the open file limit (ulimit -n) to match.`,
    );
  if (i.webMode === "octane" && i.webProcesses === 0)
    warnings.push(
      "Octane starts one worker per CPU core when you do not pass --workers.",
    );
  if (i.maxConnections > 500)
    warnings.push(
      "Postgres sizes some shared memory from max_connections, and every connection is its own backend process. Very high values cost memory even when idle. A pooler is usually the better fix.",
    );
  return {
    lines,
    totalClients,
    usable,
    load,
    direct,
    poolSize,
    reservePool,
    maxClientConn,
    bouncerServerConns,
    bouncerFits,
    maxConnectionsNeeded,
    warnings,
  };
}

/** A pgbouncer.ini snippet for the result. */
export function bouncerIni(r: PgResult, dbName = "app"): string {
  return [
    "[databases]",
    `${dbName} = host=127.0.0.1 port=5432 dbname=${dbName}`,
    "",
    "[pgbouncer]",
    "listen_port = 6432",
    "pool_mode = transaction",
    `default_pool_size = ${r.poolSize}`,
    `reserve_pool_size = ${r.reservePool}`,
    "reserve_pool_timeout = 3",
    `max_client_conn = ${r.maxClientConn}`,
    "; PgBouncer 1.21+ keeps PDO prepared statements working in transaction mode",
    "max_prepared_statements = 200",
  ].join("\n");
}
