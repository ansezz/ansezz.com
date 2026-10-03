// Client-side LLM cost estimator with prompt-cache maths.
// Pure DOM, no framework. Re-binds on Astro view-transition navigations.
//
// Model per request:
//   uncached input  = (input tokens - cached prefix) x input price
//   cached prefix   = hit rate x prefix x read price
//                   + (1 - hit rate) x prefix x write price
//   output          = output tokens x output price
// Plus, for explicit (Gemini style) caches, storage per hour per 1M tokens.

interface Model {
  id: string;
  provider: string;
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  cacheWrite1h?: number;
  cacheStoragePerHour?: number;
}

const FIELDS = [
  "priceIn",
  "priceOut",
  "priceRead",
  "priceWrite",
  "tokIn",
  "tokCached",
  "tokOut",
  "reqs",
  "hitRate",
  "storage",
  "storageHours",
] as const;

// Short URL keys for shareable links.
const KEYS: Record<(typeof FIELDS)[number], string> = {
  priceIn: "pi",
  priceOut: "po",
  priceRead: "pr",
  priceWrite: "pw",
  tokIn: "ti",
  tokCached: "tc",
  tokOut: "to",
  reqs: "r",
  hitRate: "h",
  storage: "s",
  storageHours: "sh",
};

function input(id: string): HTMLInputElement | null {
  return document.getElementById(id) as HTMLInputElement | null;
}

function num(id: string): number {
  const el = input(id);
  const v = el ? parseFloat(el.value) : 0;
  return Number.isFinite(v) && v >= 0 ? v : 0;
}

function fmt(n: number): string {
  if (n === 0) return "$0";
  if (n < 0.01) return "<$0.01";
  if (n < 1000)
    return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  return `$${n.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}

function setText(id: string, v: string): void {
  const el = document.getElementById(id);
  if (el) el.textContent = v;
}

function init(): void {
  const form = document.getElementById("cost-form") as HTMLFormElement | null;
  if (!form || form.dataset.bound === "1") return;
  form.dataset.bound = "1";

  let models: Model[] = [];
  try {
    models = JSON.parse(form.dataset.models ?? "[]");
  } catch {
    models = [];
  }

  const modelSel = document.getElementById("model") as HTMLSelectElement;
  const ttlSel = document.getElementById("cacheTtl") as HTMLSelectElement;

  function current(): Model | undefined {
    return models.find((x) => x.id === modelSel.value);
  }

  function writePrice(m: Model): number {
    return ttlSel.value === "1h" && m.cacheWrite1h != null
      ? m.cacheWrite1h
      : m.cacheWrite;
  }

  function syncTtl(): void {
    const m = current();
    const hasTtl = m ? m.cacheWrite1h != null : true;
    ttlSel.disabled = !hasTtl;
    if (!hasTtl) ttlSel.value = "5m";
  }

  function applyModel(): void {
    syncTtl();
    const m = current();
    if (!m) return;
    const set = (id: string, v: number) => {
      const el = input(id);
      if (el) el.value = String(v);
    };
    set("priceIn", m.input);
    set("priceOut", m.output);
    set("priceRead", m.cacheRead);
    set("priceWrite", writePrice(m));
    set("storage", m.cacheStoragePerHour ?? 0);
    compute();
  }

  function compute(): void {
    const pin = num("priceIn");
    const pout = num("priceOut");
    const pread = num("priceRead");
    const pwrite = num("priceWrite");
    const tin = num("tokIn");
    const tout = num("tokOut");
    const prefix = Math.min(num("tokCached"), tin);
    const reqs = num("reqs");
    const hit = Math.min(num("hitRate"), 100) / 100;
    const storage = num("storage");
    const storageHours = Math.min(num("storageHours"), 24);

    const M = 1_000_000;
    const uncachedIn = ((tin - prefix) / M) * pin;
    const reads = ((hit * prefix) / M) * pread;
    const writes = (((1 - hit) * prefix) / M) * pwrite;
    const out = (tout / M) * pout;
    const perReq = uncachedIn + reads + writes + out;
    const storagePerDay =
      prefix > 0 ? (prefix / M) * storage * storageHours : 0;
    const perDay = perReq * reqs + storagePerDay;
    const perMonth = perDay * 30;

    const baseline = ((tin / M) * pin + out) * reqs * 30;
    const saved = baseline - perMonth;

    setText("out-req", fmt(perReq));
    setText("out-day", fmt(perDay));
    setText("out-month", fmt(perMonth));
    setText("out-nocache", fmt(baseline));
    setText(
      "out-saved",
      prefix === 0
        ? "No cached prefix set"
        : saved >= 0
          ? `${fmt(saved)} saved (${baseline > 0 ? Math.round((saved / baseline) * 100) : 0}%)`
          : `${fmt(-saved)} more than no cache`,
    );
    setText("br-in", fmt(uncachedIn * reqs * 30));
    setText("br-read", fmt(reads * reqs * 30));
    setText("br-write", fmt(writes * reqs * 30));
    setText("br-store", fmt(storagePerDay * 30));
    setText("br-out", fmt(out * reqs * 30));

    // Traffic hint: are requests close enough together to keep the cache warm?
    const ttlSec = ttlSel.value === "1h" ? 3600 : 300;
    let hint = "";
    if (prefix > 0 && reqs > 0) {
      const gap = 86400 / reqs;
      const gapText =
        gap < 60
          ? `${Math.max(1, Math.round(gap))} s`
          : gap < 3600
            ? `${Math.round(gap / 60)} min`
            : `${(gap / 3600).toFixed(1)} h`;
      hint =
        gap < ttlSec
          ? `Evenly spread, that is one request every ${gapText}, inside the cache lifetime. Steady traffic can hit 90% or more.`
          : `Evenly spread, that is one request every ${gapText}, longer than the cache lifetime. Most requests will miss unless traffic comes in bursts.`;
    }
    setText("cache-hint", hint);
  }

  function readUrl(): void {
    const params = new URLSearchParams(window.location.search);
    if (![...params.keys()].length) return;
    const m = params.get("m");
    if (m && models.some((x) => x.id === m)) modelSel.value = m;
    const ttl = params.get("ttl");
    if (ttl === "1h" || ttl === "5m") ttlSel.value = ttl;
    syncTtl();
    for (const f of FIELDS) {
      const v = params.get(KEYS[f]);
      const el = input(f);
      if (el && v !== null && Number.isFinite(parseFloat(v))) el.value = v;
    }
  }

  function shareUrl(): string {
    const params = new URLSearchParams();
    params.set("m", modelSel.value);
    params.set("ttl", ttlSel.value);
    for (const f of FIELDS) params.set(KEYS[f], input(f)?.value ?? "");
    return `${window.location.origin}${window.location.pathname}?${params}`;
  }

  const shareBtn = document.getElementById("cost-share");
  shareBtn?.addEventListener("click", async () => {
    const url = shareUrl();
    window.history.replaceState(null, "", url);
    try {
      await navigator.clipboard.writeText(url);
      setText("cost-share-status", "Link copied");
    } catch {
      setText("cost-share-status", "Link is in the address bar");
    }
  });

  modelSel.addEventListener("change", applyModel);
  ttlSel.addEventListener("change", () => {
    const m = current();
    const el = input("priceWrite");
    if (m && el) el.value = String(writePrice(m));
    compute();
  });
  form.addEventListener("input", (e) => {
    if ((e.target as HTMLElement).id === "model") return;
    setText("cost-share-status", "");
    compute();
  });
  form.addEventListener("submit", (e) => e.preventDefault());

  if (window.location.search) {
    readUrl();
    compute();
  } else {
    applyModel();
  }
}

init();
document.addEventListener("astro:after-swap", init);

export {};
