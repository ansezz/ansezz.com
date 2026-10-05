import { pickTier, type ManagedPlatform } from "../data/hosting-prices.ts";

// Monthly cost of running an app on Coolify plus VPS versus a managed PaaS.
// Prices come from @/data/hosting-prices, but every number arrives here as
// an input so the page can let people edit it.

export interface Workload {
  apps: number;
  appRamGb: number;
  workers: number;
  workerRamGb: number;
  databases: number;
  dbRamGb: number;
  dbStorageGb: number;
  redis: number;
  redisRamGb: number;
  egressGb: number;
  /** Average vCPU each service really uses (only usage-billed platforms need it). */
  cpuPerService: number;
}

export interface SelfHostInput {
  serverPrice: number;
  serverRamGb: number;
  /** 0 means work it out from the workload. */
  serversOverride: number;
  ipv4: number;
  backupPct: number;
  includedGbPerServer: number;
  overagePerGb: number;
  coolify: "self" | "cloud";
  coolifyRamGb: number;
  cloudBase: number;
  cloudIncludedServers: number;
  cloudPerExtraServer: number;
  /** Off-site backup storage and anything else, per month. */
  extras: number;
  /** Share of each server's RAM you plan to use. */
  usablePct: number;
}

export interface ManagedInput {
  platformFee: number;
  includedCredit: number;
  appPrice: number;
  workerPrice: number;
  dbPrice: number;
  redisPrice: number;
  dbStoragePerGb: number;
  includedGb: number;
  overagePerGb: number;
}

export interface OpsInput {
  selfHours: number;
  managedHours: number;
  rate: number;
}

export interface Line {
  label: string;
  amount: number;
}

export interface CostResult {
  servers: number;
  ramNeeded: number;
  self: { lines: Line[]; infra: number; ops: number; total: number };
  managed: { lines: Line[]; infra: number; ops: number; total: number };
  /** managed.total - self.total; positive means self-hosting is cheaper. */
  diff: number;
  /** Ops hours a month at which both cost the same. */
  breakEvenHours: number | null;
}

const n = (v: number) => (Number.isFinite(v) && v > 0 ? v : 0);

export function ramNeeded(w: Workload, s: SelfHostInput): number {
  return (
    n(w.apps) * n(w.appRamGb) +
    n(w.workers) * n(w.workerRamGb) +
    n(w.databases) * n(w.dbRamGb) +
    n(w.redis) * n(w.redisRamGb) +
    (s.coolify === "self" ? n(s.coolifyRamGb) : 0)
  );
}

export function computeCost(
  w: Workload,
  s: SelfHostInput,
  m: ManagedInput,
  o: OpsInput,
): CostResult {
  const need = ramNeeded(w, s);
  const usablePerServer = n(s.serverRamGb) * Math.min(1, n(s.usablePct) / 100);
  const auto =
    usablePerServer > 0
      ? Math.max(1, Math.ceil(need / usablePerServer - 1e-9))
      : 1;
  const servers = Math.max(1, Math.floor(n(s.serversOverride)) || auto);

  const selfLines: Line[] = [
    {
      label: `${servers} server${servers === 1 ? "" : "s"}`,
      amount: servers * n(s.serverPrice),
    },
  ];
  if (n(s.ipv4))
    selfLines.push({ label: "Public IPv4", amount: servers * n(s.ipv4) });
  if (n(s.backupPct))
    selfLines.push({
      label: `Server backups (${n(s.backupPct)}%)`,
      amount: (servers * n(s.serverPrice) * n(s.backupPct)) / 100,
    });
  if (s.coolify === "cloud") {
    const extra = Math.max(0, servers - n(s.cloudIncludedServers));
    selfLines.push({
      label: "Coolify Cloud",
      amount: n(s.cloudBase) + extra * n(s.cloudPerExtraServer),
    });
  } else selfLines.push({ label: "Coolify (self-hosted)", amount: 0 });
  const selfOver = Math.max(
    0,
    n(w.egressGb) - servers * n(s.includedGbPerServer),
  );
  if (selfOver > 0)
    selfLines.push({
      label: "Traffic over included",
      amount: selfOver * n(s.overagePerGb),
    });
  if (n(s.extras))
    selfLines.push({
      label: "Off-site backups and extras",
      amount: n(s.extras),
    });
  const selfInfra = sum(selfLines);
  const selfOps = n(o.selfHours) * n(o.rate);

  const usage: Line[] = [
    {
      label: `${n(w.apps)} web service${n(w.apps) === 1 ? "" : "s"}`,
      amount: n(w.apps) * n(m.appPrice),
    },
    {
      label: `${n(w.workers)} worker${n(w.workers) === 1 ? "" : "s"}`,
      amount: n(w.workers) * n(m.workerPrice),
    },
    {
      label: `${n(w.databases)} Postgres`,
      amount: n(w.databases) * n(m.dbPrice),
    },
    {
      label: `${n(w.redis)} Redis / key value`,
      amount: n(w.redis) * n(m.redisPrice),
    },
  ];
  const storage = n(w.databases) * n(w.dbStorageGb) * n(m.dbStoragePerGb);
  if (storage) usage.push({ label: "Database storage", amount: storage });
  const over = Math.max(0, n(w.egressGb) - n(m.includedGb));
  if (over * n(m.overagePerGb))
    usage.push({
      label: "Bandwidth over included",
      amount: over * n(m.overagePerGb),
    });
  const usageTotal = sum(usage);
  const credit = Math.min(usageTotal, n(m.includedCredit));
  const managedLines: Line[] = [
    { label: "Plan fee", amount: n(m.platformFee) },
    ...usage,
    { label: "Included usage credit", amount: -credit },
  ].filter((l) => l.amount !== 0);
  const managedInfra = sum(managedLines);
  const managedOps = n(o.managedHours) * n(o.rate);

  const selfTotal = selfInfra + selfOps;
  const managedTotal = managedInfra + managedOps;
  // Self-hosting ops hours a month at which both totals are equal.
  const breakEvenHours =
    n(o.rate) > 0
      ? n(o.managedHours) + (managedInfra - selfInfra) / n(o.rate)
      : null;

  return {
    servers,
    ramNeeded: need,
    self: {
      lines: selfLines,
      infra: selfInfra,
      ops: selfOps,
      total: selfTotal,
    },
    managed: {
      lines: managedLines,
      infra: managedInfra,
      ops: managedOps,
      total: managedTotal,
    },
    diff: managedTotal - selfTotal,
    breakEvenHours,
  };
}

function sum(lines: Line[]): number {
  return lines.reduce((s, l) => s + l.amount, 0);
}

/** Unit prices for a platform and workload, used to fill the editable fields. */
export function managedDefaults(p: ManagedPlatform, w: Workload): ManagedInput {
  const linear = (ram: number) =>
    round2(n(ram) * (p.perGbRam ?? 0) + n(w.cpuPerService) * (p.perVcpu ?? 0));
  const tier = (tiers: ManagedPlatform["service"], ram: number) =>
    pickTier(tiers, n(ram))?.price ?? 0;
  const isLinear = p.perGbRam !== undefined;
  return {
    platformFee: p.platformFee,
    includedCredit: p.includedCredit,
    appPrice: isLinear ? linear(w.appRamGb) : tier(p.service, w.appRamGb),
    workerPrice: isLinear
      ? linear(w.workerRamGb)
      : tier(p.service, w.workerRamGb),
    dbPrice: isLinear ? linear(w.dbRamGb) : tier(p.postgres, w.dbRamGb),
    redisPrice: isLinear ? linear(w.redisRamGb) : tier(p.redis, w.redisRamGb),
    dbStoragePerGb: p.dbStoragePerGb,
    includedGb: p.includedGb,
    overagePerGb: p.overagePerGb,
  };
}

/** Tier names behind the filled prices, for the hint under the fields. */
export function tierLabels(p: ManagedPlatform, w: Workload): string[] {
  if (p.perGbRam !== undefined)
    return [
      `Usage: RAM × $${p.perGbRam}/GB + ${n(w.cpuPerService)} vCPU × $${p.perVcpu}/vCPU per service`,
    ];
  const t = (tiers: ManagedPlatform["service"], ram: number, what: string) => {
    const x = pickTier(tiers, n(ram));
    return x
      ? `${what}: ${x.label}${n(ram) > x.ramGb ? " (top tier listed)" : ""}`
      : "";
  };
  return [
    t(p.service, w.appRamGb, "Web"),
    t(p.service, w.workerRamGb, "Worker"),
    t(p.postgres, w.dbRamGb, "Postgres"),
    t(p.redis, w.redisRamGb, "Redis"),
  ].filter(Boolean);
}

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}
