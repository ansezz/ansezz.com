// Little's Law sizing: L = lambda * W. Workers = ceil(L / concurrency / target
// utilization), or the same equation run backwards to get a sustainable arrival
// rate from a fixed worker count. The queueing table is exact Erlang C for the
// M/M/c model (Erlang B recursion), which is a model, not a promise.

type Mode = "fleet" | "load";
type RateUnit = "sec" | "min";

const UTILIZATION_STEPS = [50, 70, 80, 90, 95, 99] as const;

// Erlang B recurses once per server, so cap the pool the model runs on. Wait
// time falls monotonically with c at fixed rho, so clamping overstates the
// queueing rather than hiding it.
const MODEL_MAX_SLOTS = 10_000;

const MAX_WORKERS = 1_000_000;
const MAX_CONCURRENCY = 100_000;
const MAX_RPS = 1_000_000_000;
const MAX_LATENCY_MS = 3_600_000;

interface Inputs {
  mode: Mode;
  rate: number;
  rateUnit: RateUnit;
  workers: number;
  latencyMs: number;
  concurrency: number;
  utilizationPct: number;
}

interface QueueRow {
  utilization: number;
  waitMultiplier: number;
  waitMs: number;
  totalMs: number;
}

interface Result {
  mode: Mode;
  rps: number;
  serviceSeconds: number;
  concurrency: number;
  utilization: number;
  inFlight: number;
  workers: number;
  workersAtFull: number;
  slots: number;
  actualUtilization: number;
  ceilingRps: number;
  targetRps: number;
  headroom: number;
  perWorkerRps: number;
  modelSlots: number;
  modelClamped: boolean;
  queue: QueueRow[];
}

type Outcome = { ok: true; value: Result } | { ok: false; message: string };

/* ── maths ─────────────────────────────────────────────────────────────── */

// Erlang B via the numerically stable recursion B(n) = a*B(n-1) / (n + a*B(n-1)).
function erlangB(servers: number, load: number): number {
  let b = 1;
  for (let n = 1; n <= servers; n += 1) {
    const scaled = load * b;
    b = scaled / (n + scaled);
  }
  return b;
}

// Probability an arriving request finds every server busy and has to queue.
function erlangC(servers: number, load: number): number {
  if (servers < 1) return 1;
  if (load <= 0) return 0;
  if (load >= servers) return 1;
  const b = erlangB(servers, load);
  const rho = load / servers;
  const denominator = 1 - rho * (1 - b);
  if (!(denominator > 0)) return 1;
  const c = b / denominator;
  if (!Number.isFinite(c)) return 1;
  return Math.min(1, Math.max(0, c));
}

// Expected queue wait expressed in service times: Wq / S = C / (c * (1 - rho)).
function waitMultiplier(servers: number, utilization: number): number {
  if (utilization <= 0) return 0;
  if (utilization >= 1) return Number.POSITIVE_INFINITY;
  const c = erlangC(servers, utilization * servers);
  const value = c / (servers * (1 - utilization));
  return Number.isFinite(value) && value > 0 ? value : 0;
}

// Ceil that tolerates float dust, so 36 / 40 / 0.9 lands on 1 and not 2.
function ceilExact(value: number): number {
  return Math.ceil(value - 1e-9);
}

function compute(input: Inputs): Outcome {
  const { latencyMs, concurrency, utilizationPct } = input;

  if (Number.isNaN(latencyMs)) {
    return { ok: false, message: "Enter an average latency in milliseconds." };
  }
  if (latencyMs <= 0) {
    return {
      ok: false,
      message:
        "Latency has to be above zero — free requests don't need workers.",
    };
  }
  if (latencyMs > MAX_LATENCY_MS) {
    return {
      ok: false,
      message:
        "Over an hour per request isn't a web service, it's a batch job.",
    };
  }
  if (Number.isNaN(concurrency)) {
    return {
      ok: false,
      message: "Enter how many requests one worker handles at once.",
    };
  }
  if (concurrency < 1) {
    return {
      ok: false,
      message: "Concurrency per worker has to be at least 1.",
    };
  }
  if (concurrency > MAX_CONCURRENCY) {
    return {
      ok: false,
      message:
        "Above 100,000 slots per worker the number stops meaning anything.",
    };
  }
  if (Number.isNaN(utilizationPct)) {
    return {
      ok: false,
      message: "Enter a target utilization between 1 and 99 percent.",
    };
  }
  if (utilizationPct < 1 || utilizationPct > 99) {
    return {
      ok: false,
      message:
        "Target utilization has to be between 1% and 99%. At 100% the queue never drains.",
    };
  }

  const serviceSeconds = latencyMs / 1000;
  const utilization = utilizationPct / 100;
  const slotsPerWorker = Math.floor(concurrency);

  let rps: number;
  let workers: number;

  if (input.mode === "fleet") {
    if (Number.isNaN(input.rate)) {
      return { ok: false, message: "Enter a target throughput." };
    }
    if (input.rate <= 0) {
      return { ok: false, message: "Throughput has to be above zero." };
    }
    rps = input.rateUnit === "min" ? input.rate / 60 : input.rate;
    if (rps > MAX_RPS) {
      return {
        ok: false,
        message: "That throughput is past a billion req/s — check the unit.",
      };
    }
    const inFlight = rps * serviceSeconds;
    const needed = ceilExact(inFlight / (slotsPerWorker * utilization));
    if (needed > MAX_WORKERS) {
      return {
        ok: false,
        message:
          "That needs over a million workers. One of latency or concurrency is off by orders of magnitude.",
      };
    }
    workers = Math.max(1, needed);
  } else {
    if (Number.isNaN(input.workers)) {
      return { ok: false, message: "Enter how many workers you're running." };
    }
    if (input.workers < 1) {
      return { ok: false, message: "You need at least one worker." };
    }
    if (input.workers > MAX_WORKERS) {
      return {
        ok: false,
        message: "Above a million workers this stops being a sizing question.",
      };
    }
    workers = Math.floor(input.workers);
    rps = (workers * slotsPerWorker * utilization) / serviceSeconds;
  }

  const slots = workers * slotsPerWorker;
  const inFlight = rps * serviceSeconds;
  const ceilingRps = slots / serviceSeconds;

  if (!Number.isFinite(slots) || !Number.isFinite(ceilingRps)) {
    return { ok: false, message: "Those numbers are too large to be useful." };
  }

  const modelSlots = Math.max(1, Math.min(MODEL_MAX_SLOTS, Math.round(slots)));
  const queue: QueueRow[] = UTILIZATION_STEPS.map((pct) => {
    const rho = pct / 100;
    const multiplier = waitMultiplier(modelSlots, rho);
    return {
      utilization: pct,
      waitMultiplier: multiplier,
      waitMs: multiplier * latencyMs,
      totalMs: (1 + multiplier) * latencyMs,
    };
  });

  return {
    ok: true,
    value: {
      mode: input.mode,
      rps,
      serviceSeconds,
      concurrency: slotsPerWorker,
      utilization,
      inFlight,
      workers,
      workersAtFull: Math.max(1, ceilExact(inFlight / slotsPerWorker)),
      slots,
      actualUtilization: slots > 0 ? inFlight / slots : 0,
      ceilingRps,
      targetRps: ceilingRps * utilization,
      headroom: rps > 0 ? ceilingRps / rps - 1 : 0,
      perWorkerRps: slotsPerWorker / serviceSeconds,
      modelSlots,
      modelClamped: Math.round(slots) > MODEL_MAX_SLOTS,
      queue,
    },
  };
}

/* ── formatting ────────────────────────────────────────────────────────── */

function formatInteger(n: number): string {
  if (!Number.isFinite(n)) return "—";
  return Math.round(n).toLocaleString("en-US");
}

// Locale formatting rather than toFixed, so whole numbers don't grow a ".0".
function formatDecimal(n: number): string {
  if (!Number.isFinite(n)) return "—";
  if (n === 0) return "0";
  const abs = Math.abs(n);
  if (abs >= 1000)
    return n.toLocaleString("en-US", { maximumFractionDigits: 0 });
  if (abs >= 10) return n.toLocaleString("en-US", { maximumFractionDigits: 1 });
  if (abs >= 0.01)
    return n.toLocaleString("en-US", { maximumFractionDigits: 2 });
  return n.toExponential(2);
}

function formatRate(rps: number): string {
  if (!Number.isFinite(rps)) return "—";
  return `${formatDecimal(rps)} req/s`;
}

function formatMs(ms: number): string {
  if (!Number.isFinite(ms)) return "—";
  if (ms <= 0) return "0 ms";
  if (ms < 1) return `${ms.toFixed(2)} ms`;
  if (ms < 10) return `${ms.toFixed(1)} ms`;
  if (ms < 1000) return `${Math.round(ms)} ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)} s`;
  return `${(ms / 60_000).toFixed(1)} min`;
}

function formatMultiplier(m: number): string {
  if (!Number.isFinite(m)) return "∞";
  if (m === 0) return "0×";
  if (m < 0.01) return "<0.01×";
  if (m < 10) return `${m.toFixed(2)}×`;
  if (m < 100) return `${m.toFixed(1)}×`;
  return `${Math.round(m).toLocaleString("en-US")}×`;
}

function formatPercent(fraction: number): string {
  if (!Number.isFinite(fraction)) return "—";
  const pct = fraction * 100;
  // Whole numbers stay whole: "70%", not "70.0%".
  if (Math.abs(pct - Math.round(pct)) < 0.05) {
    return `${Math.round(pct).toLocaleString("en-US")}%`;
  }
  if (Math.abs(pct) >= 10) return `${pct.toFixed(1)}%`;
  return `${pct.toFixed(2)}%`;
}

function pluralWorkers(n: number): string {
  return `${formatInteger(n)} ${n === 1 ? "worker" : "workers"}`;
}

function pluralSlots(n: number): string {
  return `${formatInteger(n)} ${n === 1 ? "slot" : "slots"}`;
}

/* ── DOM ───────────────────────────────────────────────────────────────── */

interface Controls {
  root: HTMLElement;
  rateField: HTMLElement;
  rate: HTMLInputElement;
  rateUnit: HTMLSelectElement;
  workersField: HTMLElement;
  workers: HTMLInputElement;
  latency: HTMLInputElement;
  concurrency: HTMLInputElement;
  utilization: HTMLInputElement;
}

function readNumber(el: HTMLInputElement): number {
  const raw = el.value.trim();
  if (raw === "") return Number.NaN;
  const n = Number(raw);
  return Number.isFinite(n) ? n : Number.NaN;
}

function byId(id: string): HTMLElement | null {
  return document.getElementById(id);
}

// Returns every control only when all of them exist and are the right element,
// so the render path never has to re-check for null.
function readControls(): Controls | null {
  const root = byId("capacity-calculator-root");
  const rateField = byId("capacity-calculator-rate-field");
  const rate = byId("capacity-calculator-rate");
  const rateUnit = byId("capacity-calculator-rate-unit");
  const workersField = byId("capacity-calculator-workers-field");
  const workers = byId("capacity-calculator-workers");
  const latency = byId("capacity-calculator-latency");
  const concurrency = byId("capacity-calculator-concurrency");
  const utilization = byId("capacity-calculator-utilization");

  if (
    !root ||
    !rateField ||
    !workersField ||
    !(rate instanceof HTMLInputElement) ||
    !(rateUnit instanceof HTMLSelectElement) ||
    !(workers instanceof HTMLInputElement) ||
    !(latency instanceof HTMLInputElement) ||
    !(concurrency instanceof HTMLInputElement) ||
    !(utilization instanceof HTMLInputElement)
  ) {
    return null;
  }

  return {
    root,
    rateField,
    rate,
    rateUnit,
    workersField,
    workers,
    latency,
    concurrency,
    utilization,
  };
}

function setText(el: HTMLElement | null, value: string): void {
  if (el) el.textContent = value;
}

function init(): void {
  const controls = readControls();
  if (!controls) return;

  // Destructured so the narrowed element types survive into the closures below.
  const {
    root,
    rateField,
    rate: rateEl,
    rateUnit: rateUnitEl,
    workersField,
    workers: workersEl,
    latency: latencyEl,
    concurrency: concurrencyEl,
    utilization: utilizationEl,
  } = controls;
  if (root.dataset.bound === "1") return;
  root.dataset.bound = "1";

  const resultsEl = byId("capacity-calculator-results");
  const errorEl = byId("capacity-calculator-error");
  const errorTextEl = byId("capacity-calculator-error-text");
  const headlineEl = byId("capacity-calculator-headline");
  const headlineLabelEl = byId("capacity-calculator-headline-label");
  const headlineSubEl = byId("capacity-calculator-headline-sub");
  const inFlightEl = byId("capacity-calculator-inflight");
  const slotsEl = byId("capacity-calculator-slots");
  const altLabelEl = byId("capacity-calculator-alt-label");
  const altEl = byId("capacity-calculator-alt");
  const actualUtilEl = byId("capacity-calculator-actual-util");
  const headroomEl = byId("capacity-calculator-headroom");
  const perWorkerEl = byId("capacity-calculator-per-worker");
  const queueCaptionEl = byId("capacity-calculator-queue-caption");
  const copyBtn = byId("capacity-calculator-copy");
  const copyLabelEl = byId("capacity-calculator-copy-label");

  const modeButtons = Array.from(
    root.querySelectorAll<HTMLButtonElement>("[data-capacity-mode]"),
  );

  let mode: Mode = "fleet";
  let summary = "";
  let copyResetTimer = 0;

  function readInputs(): Inputs {
    return {
      mode,
      rate: readNumber(rateEl),
      rateUnit: rateUnitEl.value === "min" ? "min" : "sec",
      workers: readNumber(workersEl),
      latencyMs: readNumber(latencyEl),
      concurrency: readNumber(concurrencyEl),
      utilizationPct: readNumber(utilizationEl),
    };
  }

  function clearQueue(): void {
    for (const pct of UTILIZATION_STEPS) {
      setText(byId(`capacity-calculator-q-${pct}-wait`), "—");
      setText(byId(`capacity-calculator-q-${pct}-total`), "—");
      setText(byId(`capacity-calculator-q-${pct}-mult`), "—");
      const bar = byId(`capacity-calculator-q-${pct}-bar`);
      if (bar) bar.style.width = "0%";
    }
    setText(queueCaptionEl, "—");
  }

  function renderQueue(result: Result): void {
    // Bars are scaled against the worst row so the shape of the knee is visible
    // whatever the pool size — the absolute numbers sit next to them.
    const peak = result.queue.reduce(
      (max, row) =>
        Number.isFinite(row.waitMultiplier) && row.waitMultiplier > max
          ? row.waitMultiplier
          : max,
      0,
    );

    for (const row of result.queue) {
      setText(
        byId(`capacity-calculator-q-${row.utilization}-wait`),
        formatMs(row.waitMs),
      );
      setText(
        byId(`capacity-calculator-q-${row.utilization}-total`),
        formatMs(row.totalMs),
      );
      setText(
        byId(`capacity-calculator-q-${row.utilization}-mult`),
        formatMultiplier(row.waitMultiplier),
      );
      const bar = byId(`capacity-calculator-q-${row.utilization}-bar`);
      if (bar) {
        const share = peak > 0 ? (row.waitMultiplier / peak) * 100 : 0;
        // Keep a hairline for non-zero rows so "small" still reads as non-zero.
        const width = row.waitMultiplier > 0 ? Math.max(1.5, share) : 0;
        bar.style.width = `${Math.min(100, width).toFixed(2)}%`;
      }
    }

    const caption =
      `▸ Modelled at c = ${formatInteger(result.modelSlots)} shared slots, ` +
      `service time ${formatMs(result.serviceSeconds * 1000)}.` +
      (result.modelClamped
        ? ` Pool capped at ${formatInteger(MODEL_MAX_SLOTS)} for the model — real waits are lower.`
        : "");
    setText(queueCaptionEl, caption);
  }

  function showError(message: string): void {
    summary = "";
    if (resultsEl) resultsEl.hidden = true;
    if (errorEl) errorEl.hidden = false;
    setText(errorTextEl, message);
    if (copyBtn instanceof HTMLButtonElement) copyBtn.disabled = true;
    clearQueue();
  }

  function render(): void {
    const outcome = compute(readInputs());

    if (!outcome.ok) {
      showError(outcome.message);
      return;
    }

    if (errorEl) errorEl.hidden = true;
    if (resultsEl) resultsEl.hidden = false;
    if (copyBtn instanceof HTMLButtonElement) copyBtn.disabled = false;

    const r = outcome.value;
    const targetPct = formatPercent(r.utilization);

    if (r.mode === "fleet") {
      setText(headlineLabelEl, "Workers needed");
      setText(headlineEl, formatInteger(r.workers));
      setText(
        headlineSubEl,
        `${targetPct} target · ${formatRate(r.rps)} · ${pluralSlots(r.concurrency)} each`,
      );
      setText(altLabelEl, "Workers at 100% (no headroom)");
      setText(altEl, pluralWorkers(r.workersAtFull));
    } else {
      setText(headlineLabelEl, "Sustainable throughput");
      setText(headlineEl, formatDecimal(r.rps));
      setText(
        headlineSubEl,
        `req/s at ${targetPct} · ${formatDecimal(r.rps * 60)} req/min · ${pluralWorkers(r.workers)}`,
      );
      setText(altLabelEl, "Ceiling at 100% (the cliff)");
      setText(altEl, formatRate(r.ceilingRps));
    }

    setText(inFlightEl, formatDecimal(r.inFlight));
    setText(slotsEl, formatInteger(r.slots));
    setText(actualUtilEl, formatPercent(r.actualUtilization));
    const spareRps = r.ceilingRps - r.rps;
    setText(
      headroomEl,
      `${r.headroom >= 0 ? "+" : ""}${formatPercent(r.headroom)} · ${formatRate(spareRps)} spare`,
    );
    setText(perWorkerEl, formatRate(r.perWorkerRps));

    renderQueue(r);

    const shape =
      r.mode === "fleet"
        ? `${formatRate(r.rps)} at ${formatMs(r.serviceSeconds * 1000)} needs ${pluralWorkers(r.workers)}`
        : `${pluralWorkers(r.workers)} at ${formatMs(r.serviceSeconds * 1000)} sustain ${formatRate(r.rps)}`;

    summary =
      `${shape} (${pluralSlots(r.concurrency)} per worker, ${targetPct} target utilization). ` +
      `In flight L = ${formatDecimal(r.inFlight)}, pool = ${pluralSlots(r.slots)}, ` +
      `ceiling = ${formatRate(r.ceilingRps)}, real utilization = ${formatPercent(r.actualUtilization)}.`;
  }

  function setMode(next: Mode): void {
    mode = next;
    for (const btn of modeButtons) {
      const active = btn.dataset.capacityMode === next;
      btn.setAttribute("aria-pressed", active ? "true" : "false");
      btn.classList.toggle("bg-yellow", active);
      btn.classList.toggle("bg-paper", !active);
    }
    rateField.hidden = next !== "fleet";
    workersField.hidden = next !== "load";
    render();
  }

  for (const btn of modeButtons) {
    btn.addEventListener("click", () => {
      const next = btn.dataset.capacityMode;
      if (next !== "fleet" && next !== "load") return;
      setMode(next);
    });
  }

  const fields: (HTMLInputElement | HTMLSelectElement)[] = [
    rateEl,
    rateUnitEl,
    workersEl,
    latencyEl,
    concurrencyEl,
    utilizationEl,
  ];
  for (const field of fields) {
    field.addEventListener("input", render);
    field.addEventListener("change", render);
  }

  root
    .querySelectorAll<HTMLButtonElement>("[data-preset-concurrency]")
    .forEach((btn) => {
      btn.addEventListener("click", () => {
        const { presetConcurrency, presetLatency } = btn.dataset;
        if (presetConcurrency) concurrencyEl.value = presetConcurrency;
        if (presetLatency) latencyEl.value = presetLatency;
        render();
      });
    });

  function flashCopyLabel(text: string): void {
    if (!copyLabelEl) return;
    copyLabelEl.textContent = text;
    window.clearTimeout(copyResetTimer);
    copyResetTimer = window.setTimeout(() => {
      copyLabelEl.textContent = "Copy sizing";
    }, 1500);
  }

  copyBtn?.addEventListener("click", async () => {
    if (!summary) return;
    try {
      await navigator.clipboard.writeText(summary);
      flashCopyLabel("Copied!");
    } catch {
      flashCopyLabel("Copy blocked");
    }
  });

  setMode("fleet");
}

init();
document.addEventListener("astro:after-swap", init);

export {};
