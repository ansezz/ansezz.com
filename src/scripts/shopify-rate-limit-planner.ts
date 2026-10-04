// Shopify API rate-limit planner. The maths lives in
// @/lib/shopify-rate-limits; this file reads the form and renders results.

import { bindUrlState } from "@/lib/url-state";
import {
  GRAPHQL_RATE,
  REST_RATE,
  defaultBucket,
  formatDuration,
  parseCostExtension,
  planSync,
  type ShopifyApi,
  type ShopifyPlan,
} from "@/lib/shopify-rate-limits";

const P = "shopify-rate-limit-planner-";

const num = (el: HTMLInputElement): number => {
  const v = Number(el.value);
  return el.value.trim() === "" || !Number.isFinite(v) ? 0 : Math.max(0, v);
};

const fmt = (n: number, digits = 2): string =>
  Number.isFinite(n)
    ? n.toLocaleString("en-US", { maximumFractionDigits: digits })
    : "No limit";

function init(): void {
  const root = document.getElementById(`${P}root`);
  if (!root || root.dataset.bound === "1") return;
  root.dataset.bound = "1";

  const $ = <T extends HTMLElement>(id: string): T =>
    document.getElementById(P + id) as T;

  const apiRadios = Array.from(
    root.querySelectorAll<HTMLInputElement>(`input[name="${P}api"]`),
  );
  const plan = $<HTMLSelectElement>("plan");
  const rate = $<HTMLInputElement>("rate");
  const bucket = $<HTMLInputElement>("bucket");
  const records = $<HTMLInputElement>("records");
  const perreq = $<HTMLInputElement>("perreq");
  const reqcost = $<HTMLInputElement>("reqcost");
  const actcost = $<HTMLInputElement>("actcost");
  const latency = $<HTMLInputElement>("latency");
  const conc = $<HTMLInputElement>("conc");
  const paste = $<HTMLTextAreaElement>("paste");
  const pasteMsg = $<HTMLElement>("paste-msg");
  const bucketNote = $<HTMLElement>("bucket-note");
  const msgs = $<HTMLElement>("msgs");

  const api = (): ShopifyApi =>
    (apiRadios.find((r) => r.checked)?.value as ShopifyApi) ?? "graphql";

  const set = (id: string, text: string): void => {
    const el = $<HTMLElement>(id);
    if (el) el.textContent = text;
  };

  /** Fills rate and bucket from the plan. Only on real user changes, so a
   *  shared link keeps its own numbers. */
  function applyPlan(): void {
    const a = api();
    if (a === "storefront") return;
    const p = plan.value as ShopifyPlan;
    rate.value = String(a === "rest" ? REST_RATE[p] : GRAPHQL_RATE[p]);
    bucket.value = String(defaultBucket(a, p).size);
    if (a === "rest") {
      reqcost.value = "1";
      actcost.value = "1";
    }
  }

  function render(): void {
    const a = api();
    const isSf = a === "storefront";
    $<HTMLElement>("admin").classList.toggle("hidden", isSf);
    $<HTMLElement>("result").classList.toggle("hidden", isSf);
    $<HTMLElement>("sf").classList.toggle("hidden", !isSf);
    root!
      .querySelectorAll<HTMLElement>("[data-graphql-only]")
      .forEach((el) => el.classList.toggle("hidden", a !== "graphql"));
    if (isSf) return;

    const unit = a === "graphql" ? "points" : "requests";
    set(
      "rate-label",
      a === "graphql" ? "Restore rate, points/s" : "Leak rate, requests/s",
    );
    set("bucket-label", `Bucket size, ${unit}`);
    const p = plan.value as ShopifyPlan;
    const def = defaultBucket(a, p);
    bucketNote.textContent = def.documented
      ? `Shopify documents a ${def.size} request bucket for this plan.`
      : a === "graphql"
        ? "Shopify does not list the GraphQL bucket size per plan. The default is 20 times the restore rate. Paste a response or read throttleStatus.maximumAvailable for your real number."
        : "Shopify documents 40 (Standard) and 400 (Plus). This default assumes the same 20 seconds of leak.";

    const r = planSync({
      api: a,
      rate: num(rate),
      bucket: num(bucket),
      records: num(records),
      perRequest: num(perreq),
      requestedCost: a === "graphql" ? num(reqcost) : 1,
      actualCost: a === "graphql" ? num(actcost) : 1,
      latency: num(latency),
      concurrency: num(conc),
    });

    set("time", r.errors.length ? "Blocked" : formatDuration(r.seconds));
    set("requests", fmt(r.requests, 0));
    set("rps", fmt(r.rps));
    set("recps", fmt(r.recordsPerSecond, 1));
    set("burst", fmt(r.burstRequests, 0));
    set("sconc", fmt(r.suggestedConcurrency, 0));
    set("sbatch", fmt(r.suggestedBatch, 0));

    let verdict = "";
    if (r.errors.length)
      verdict = "This request cannot run as it is. See below.";
    else if (r.requests === 0) verdict = "Enter the number of records to sync.";
    else if (r.bottleneck === "rate")
      verdict = `The rate limit is the bottleneck. More than ${r.suggestedConcurrency} request${r.suggestedConcurrency === 1 ? "" : "s"} at once will only get throttled.`;
    else
      verdict = `Your concurrency is the bottleneck. You could run up to ${r.suggestedConcurrency} at once before Shopify throttles you.`;
    set("verdict", verdict);

    const items = [
      ...r.errors.map((m) => ({ m, cls: "bg-pink" })),
      ...r.warnings.map((m) => ({ m, cls: "bg-yellow" })),
    ];
    msgs.replaceChildren(
      ...items.map(({ m, cls }) => {
        const li = document.createElement("li");
        li.className = `border-ink rounded-[4px] border-[2px] p-2 break-words ${cls}`;
        li.textContent = m;
        return li;
      }),
    );
  }

  function readPaste(): void {
    if (!paste.value.trim()) {
      pasteMsg.textContent =
        "Fills in cost, restore rate and bucket from extensions.cost. Not saved in the share link.";
      return;
    }
    try {
      const c = parseCostExtension(paste.value);
      const filled: string[] = [];
      if (c.requested !== null) {
        reqcost.value = String(c.requested);
        filled.push("requested cost");
      }
      if (c.actual !== null) {
        actcost.value = String(c.actual);
        filled.push("actual cost");
      }
      if (c.restoreRate !== null) {
        rate.value = String(c.restoreRate);
        filled.push("restore rate");
      }
      if (c.maximumAvailable !== null) {
        bucket.value = String(c.maximumAvailable);
        filled.push("bucket");
      }
      pasteMsg.textContent = filled.length
        ? `Filled in ${filled.join(", ")}.`
        : "Found extensions.cost, but no numbers in it.";
      // Let the share link pick up the new values.
      rate.dispatchEvent(new Event("change", { bubbles: true }));
    } catch (e) {
      pasteMsg.textContent = (e as Error).message;
    }
    render();
  }

  const inputs = [
    rate,
    bucket,
    records,
    perreq,
    reqcost,
    actcost,
    latency,
    conc,
  ];
  for (const el of inputs) {
    el.addEventListener("input", render);
    el.addEventListener("change", render);
  }
  plan.addEventListener("change", (e) => {
    if (e.isTrusted) applyPlan();
    render();
  });
  for (const r of apiRadios)
    r.addEventListener("change", (e) => {
      if (e.isTrusted) applyPlan();
      render();
    });
  paste.addEventListener("input", readPaste);

  render();
}

init();
document.addEventListener("astro:after-swap", init);
bindUrlState("shopify-rate-limit-planner-root", { exclude: [`${P}paste`] });
