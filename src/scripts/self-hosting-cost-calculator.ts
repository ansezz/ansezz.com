// Self-hosting cost calculator. Prices live in @/data/hosting-prices and the
// maths in @/lib/hosting-cost; this file reads the form and renders results.
// Preset selects only fill fields on a real user change, so shared links
// keep their own edited prices.

import { bindUrlState } from "@/lib/url-state";
import { MANAGED, VPS_PLANS } from "@/data/hosting-prices";
import {
  computeCost,
  managedDefaults,
  tierLabels,
  type Line,
  type ManagedInput,
  type OpsInput,
  type SelfHostInput,
  type Workload,
} from "@/lib/hosting-cost";

const P = "self-hosting-cost-calculator-";

const money = (v: number): string =>
  `${v < 0 ? "-" : ""}$${Math.abs(v).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const WORKLOAD_KEYS = [
  "apps",
  "appRamGb",
  "workers",
  "workerRamGb",
  "databases",
  "dbRamGb",
  "dbStorageGb",
  "redis",
  "redisRamGb",
  "egressGb",
  "cpuPerService",
] as const;
// Fields that change which managed tier fits.
const TIER_KEYS = new Set([
  "appRamGb",
  "workerRamGb",
  "dbRamGb",
  "redisRamGb",
  "cpuPerService",
]);

function init(): void {
  const root = document.getElementById(`${P}root`);
  if (!root || root.dataset.bound === "1") return;
  root.dataset.bound = "1";

  const $ = <T extends HTMLElement>(id: string): T =>
    document.getElementById(P + id) as T;
  const num = (id: string): number => {
    const el = $<HTMLInputElement>(id);
    const v = Number(el?.value);
    return !el || el.value.trim() === "" || !Number.isFinite(v)
      ? 0
      : Math.max(0, v);
  };
  const setNum = (id: string, v: number) => {
    const el = $<HTMLInputElement>(id);
    if (el) el.value = String(v);
  };
  const planSel = $<HTMLSelectElement>("plan");
  const platformSel = $<HTMLSelectElement>("platform");
  const coolifyMode = (): "self" | "cloud" =>
    root.querySelector<HTMLInputElement>(`input[name="${P}coolify"]:checked`)
      ?.value === "cloud"
      ? "cloud"
      : "self";

  const workload = (): Workload => {
    const w = {} as Workload;
    for (const k of WORKLOAD_KEYS) w[k] = num(k);
    return w;
  };
  const platform = () =>
    MANAGED.find((p) => p.id === platformSel.value) ?? MANAGED[0];

  function fillPlan(): void {
    const plan = VPS_PLANS.find((p) => p.id === planSel.value);
    $<HTMLElement>("plan-note").textContent = plan?.note ?? "";
    if (!plan) return;
    setNum("serverPrice", plan.price);
    setNum("serverRamGb", plan.ramGb);
    setNum("ipv4", plan.ipv4);
    setNum("backupPct", plan.backupPct);
    setNum("includedGbPerServer", plan.includedGb);
    setNum("overagePerGb", plan.overagePerGb);
  }

  function fillManaged(): void {
    const d = managedDefaults(platform(), workload());
    setNum("platformFee", d.platformFee);
    setNum("includedCredit", d.includedCredit);
    setNum("appPrice", d.appPrice);
    setNum("workerPrice", d.workerPrice);
    setNum("dbPrice", d.dbPrice);
    setNum("redisPrice", d.redisPrice);
    setNum("dbStoragePerGb", d.dbStoragePerGb);
    setNum("includedGb", d.includedGb);
    setNum("m-overagePerGb", d.overagePerGb);
  }

  const lines = (
    target: HTMLElement,
    items: Line[],
    ops: number,
    rate: number,
    hours: number,
  ) => {
    const rows = [
      ...items.map((l) => [l.label, money(l.amount)]),
      [`Your time (${hours} h × ${money(rate)})`, money(ops)],
    ];
    target.replaceChildren(
      ...rows.map(([k, v]) => {
        const div = document.createElement("div");
        div.className = "flex flex-wrap items-baseline justify-between gap-x-3";
        const dt = document.createElement("dt");
        dt.className = "min-w-0 break-words";
        dt.textContent = k;
        const dd = document.createElement("dd");
        dd.className = "font-mono font-bold";
        dd.textContent = v;
        div.append(dt, dd);
        return div;
      }),
    );
  };

  function render(): void {
    const w = workload();
    const p = platform();
    const s: SelfHostInput = {
      serverPrice: num("serverPrice"),
      serverRamGb: num("serverRamGb"),
      serversOverride: num("serversOverride"),
      ipv4: num("ipv4"),
      backupPct: num("backupPct"),
      includedGbPerServer: num("includedGbPerServer"),
      overagePerGb: num("overagePerGb"),
      coolify: coolifyMode(),
      coolifyRamGb: num("coolifyRamGb"),
      cloudBase: num("cloudBase"),
      cloudIncludedServers: num("cloudIncludedServers"),
      cloudPerExtraServer: num("cloudPerExtraServer"),
      extras: num("extras"),
      usablePct: num("usablePct"),
    };
    const m: ManagedInput = {
      platformFee: num("platformFee"),
      includedCredit: num("includedCredit"),
      appPrice: num("appPrice"),
      workerPrice: num("workerPrice"),
      dbPrice: num("dbPrice"),
      redisPrice: num("redisPrice"),
      dbStoragePerGb: num("dbStoragePerGb"),
      includedGb: num("includedGb"),
      overagePerGb: num("m-overagePerGb"),
    };
    const o: OpsInput = {
      selfHours: num("selfHours"),
      managedHours: num("managedHours"),
      rate: num("rate"),
    };
    const r = computeCost(w, s, m, o);
    const name = p.label.replace(/ \(.*\)$/, "");

    $<HTMLElement>("self-total").textContent = money(r.self.total);
    $<HTMLElement>("managed-total").textContent = money(r.managed.total);
    $<HTMLElement>("managed-name").textContent = name;
    $<HTMLElement>("tiers").textContent = tierLabels(p, w).join(" · ");
    $<HTMLElement>("servers").textContent =
      `${r.ramNeeded.toLocaleString("en-US", { maximumFractionDigits: 2 })} GB RAM needed, on ${r.servers} server${r.servers === 1 ? "" : "s"}. Infrastructure ${money(r.self.infra)}.`;
    lines(
      $<HTMLElement>("self-lines"),
      r.self.lines,
      r.self.ops,
      o.rate,
      o.selfHours,
    );
    lines(
      $<HTMLElement>("managed-lines"),
      r.managed.lines,
      r.managed.ops,
      o.rate,
      o.managedHours,
    );

    const abs = money(Math.abs(r.diff));
    let verdict =
      Math.abs(r.diff) < 0.005
        ? "Both come out the same per month."
        : r.diff > 0
          ? `Coolify + VPS is ${abs} a month cheaper, with your time counted.`
          : `${name} is ${abs} a month cheaper, with your time counted.`;
    if (r.breakEvenHours !== null && o.rate > 0)
      verdict +=
        r.breakEvenHours > 0
          ? ` Break-even: ${r.breakEvenHours.toLocaleString("en-US", { maximumFractionDigits: 1 })} self-hosting hours a month.`
          : " The servers alone cost more than the managed platform here.";
    $<HTMLElement>("verdict").textContent = verdict;

    const plan = VPS_PLANS.find((x) => x.id === planSel.value);
    const notes = [
      ...(r.servers === 1
        ? [
            "One server is one point of failure. Budget off-site backups in extras.",
          ]
        : []),
      ...(plan?.note ? [plan.note] : []),
      ...p.notes,
    ];
    $<HTMLElement>("notes").replaceChildren(
      ...notes.map((t) => {
        const li = document.createElement("li");
        li.className =
          "border-ink bg-paper text-ink rounded-[4px] border-[2px] p-2 break-words";
        li.textContent = t;
        return li;
      }),
    );
  }

  planSel.addEventListener("change", (e) => {
    if (e.isTrusted) fillPlan();
    else
      $<HTMLElement>("plan-note").textContent =
        VPS_PLANS.find((p) => p.id === planSel.value)?.note ?? "";
  });
  platformSel.addEventListener("change", (e) => {
    if (e.isTrusted) fillManaged();
  });
  root.addEventListener("input", (e) => {
    const t = e.target as HTMLElement;
    if (e.isTrusted && t.id && TIER_KEYS.has(t.id.slice(P.length)))
      fillManaged();
    render();
  });
  root.addEventListener("change", () => window.setTimeout(render, 0));

  render();
}

init();
document.addEventListener("astro:after-swap", init);
bindUrlState("self-hosting-cost-calculator-root");
