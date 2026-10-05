// Postgres connection pool calculator. The maths lives in
// @/lib/pg-connections; this file reads the form and renders results.

import { bindUrlState } from "@/lib/url-state";
import {
  bouncerIni,
  planConnections,
  type PgInput,
  type WebMode,
} from "@/lib/pg-connections";

const P = "postgres-connection-calculator-";

const NUM_KEYS = [
  "webServers",
  "webProcesses",
  "queueServers",
  "queueProcesses",
  "schedulerProcesses",
  "connsPerProcess",
  "otherClients",
  "maxConnections",
  "superuserReserved",
  "reserved",
  "dbCores",
  "pools",
] as const;

const fmt = (n: number) => n.toLocaleString("en-US");

const LARAVEL = `'pgsql' => [
    'driver' => 'pgsql',
    'host' => env('DB_HOST', '127.0.0.1'),
    // PgBouncer listens on 6432 by default
    'port' => env('DB_PORT', '6432'),
    'database' => env('DB_DATABASE', 'app'),
    'username' => env('DB_USERNAME'),
    'password' => env('DB_PASSWORD'),
    'charset' => 'utf8',
    'search_path' => 'public',
    'sslmode' => 'prefer',
    'options' => [
        // Only needed on PgBouncer older than 1.21, or with
        // max_prepared_statements = 0
        // PDO::ATTR_EMULATE_PREPARES => true,
    ],
],`;

function init(): void {
  const root = document.getElementById(`${P}root`);
  if (!root || root.dataset.bound === "1") return;
  root.dataset.bound = "1";

  const $ = <T extends HTMLElement>(id: string): T =>
    document.getElementById(P + id) as T;
  const set = (id: string, text: string) => {
    const el = $<HTMLElement>(id);
    if (el) el.textContent = text;
  };
  const modeRadios = Array.from(
    root.querySelectorAll<HTMLInputElement>(`input[name="${P}mode"]`),
  );
  const mode = (): WebMode =>
    (modeRadios.find((r) => r.checked)?.value as WebMode) ?? "fpm";

  function read(): PgInput {
    const out = { webMode: mode() } as PgInput;
    for (const k of NUM_KEYS) {
      const el = $<HTMLInputElement>(k);
      const v = Number(el.value);
      out[k] = el.value.trim() === "" || !Number.isFinite(v) ? 0 : v;
    }
    return out;
  }

  function render(): void {
    const input = read();
    const r = planConnections(input);
    const octane = input.webMode === "octane";
    set(
      "webProcesses-label",
      octane ? "Octane workers each" : "pm.max_children each",
    );
    set(
      "web-hint",
      octane
        ? "Octane starts one worker per CPU core unless you pass --workers. Each keeps its connection open."
        : "A child holds a connection only while it serves a request.",
    );

    set("total", `${fmt(r.totalClients)} / ${fmt(r.usable)}`);
    set(
      "load",
      Number.isFinite(r.load) ? `${Math.round(r.load * 100)}%` : "No slots",
    );
    set("needed", fmt(r.maxConnectionsNeeded));
    set("pool", fmt(r.poolSize));
    set("reserve", fmt(r.reservePool));
    set("maxclient", fmt(r.maxClientConn));
    set("server", `${fmt(r.bouncerServerConns)} of ${fmt(r.usable)}`);
    set(
      "verdict",
      r.direct === "over"
        ? "Over the limit. Put PgBouncer in front or raise max_connections."
        : r.direct === "tight"
          ? "Fits, but with little room. PgBouncer gives you headroom."
          : "Fits without a pooler. PgBouncer still helps as you add servers.",
    );

    const msgs = $<HTMLElement>("msgs");
    const items = [
      ...r.warnings.map((m) => ({ m, cls: "bg-yellow" })),
      {
        m: "Transaction mode: use PgBouncer 1.21+ with max_prepared_statements above 0, or turn on PDO::ATTR_EMULATE_PREPARES.",
        cls: "bg-paper",
      },
    ];
    msgs.replaceChildren(
      ...items.map(({ m, cls }) => {
        const li = document.createElement("li");
        li.className = `border-ink rounded-[4px] border-[2px] p-2 break-words text-ink ${cls}`;
        li.textContent = m;
        return li;
      }),
    );

    const rows = $<HTMLElement>("rows");
    rows.replaceChildren(
      ...r.lines.map((l) => {
        const tr = document.createElement("tr");
        tr.className = "border-ink border-t-[2px] align-top";
        const cells = [
          l.role,
          l.servers ? fmt(l.servers) : "",
          fmt(l.processes),
          fmt(l.connections),
        ];
        cells.forEach((c, i) => {
          const td = document.createElement("td");
          td.className = i === 0 ? "p-2" : "p-2 text-right font-mono";
          if (i === 0) {
            const b = document.createElement("strong");
            b.textContent = c;
            const note = document.createElement("span");
            note.className = "block text-xs opacity-80";
            note.textContent = l.note;
            td.append(b, note);
          } else td.textContent = c;
          tr.append(td);
        });
        return tr;
      }),
    );
    set("ini", bouncerIni(r));
    set("laravel", LARAVEL);
  }

  root.addEventListener("input", render);
  root.addEventListener("change", render);

  root
    .querySelectorAll<HTMLButtonElement>("[data-copy-target]")
    .forEach((btn) => {
      btn.addEventListener("click", async () => {
        const target = document.getElementById(btn.dataset.copyTarget ?? "");
        if (!target?.textContent) return;
        const label = btn.textContent;
        try {
          await navigator.clipboard.writeText(target.textContent);
          btn.textContent = "Copied";
        } catch {
          btn.textContent = "Copy failed";
        }
        window.setTimeout(() => (btn.textContent = label), 1500);
      });
    });

  render();
}

init();
document.addEventListener("astro:after-swap", init);
bindUrlState("postgres-connection-calculator-root");
