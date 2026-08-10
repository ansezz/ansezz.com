// Latency percentiles over a pasted sample. Two estimators are computed for
// every percentile: nearest-rank (index = ceil(p/100 × n)) and linear R-7
// (the numpy / Excel PERCENTILE.INC default, h = (n−1) × p/100). Also reports
// how much of the paste was usable, whether the sample is large enough for the
// percentile you asked for (~10 ÷ (1 − p) values), and a bucketed histogram.
// Everything runs on the values in the textarea; nothing is transmitted.

type Method = "nearest" | "linear";
type Scale = "linear" | "log";
type UnitKey = "ms" | "s" | "us" | "none";
type Level = "ok" | "noisy" | "max";
type SampleKind = "healthy" | "tail" | "small";
type MarkerKey = 50 | 95 | 99;

const MAX_VALUES = 250_000;
const FIXED_PERCENTILES: readonly number[] = [50, 75, 90, 95, 99, 99.9];
const MARKER_PERCENTILES: readonly MarkerKey[] = [50, 95, 99];
const INPUT_DEBOUNCE_MS = 80;

const UNIT_LABEL: Record<UnitKey, string> = {
  ms: "ms",
  s: "s",
  us: "µs",
  none: "",
};

const BADGE_CLASS: Record<Level, string> = {
  ok: "bg-green text-on-accent",
  noisy: "bg-yellow text-on-accent",
  max: "bg-red text-on-accent",
};

const BADGE_TEXT: Record<Level, string> = {
  ok: "ok",
  noisy: "noisy",
  max: "= your max",
};

const MARKER_LINE: Record<MarkerKey, string> = {
  50: "bg-cyan",
  95: "bg-pink",
  99: "bg-purple",
};

const MARKER_CHIP: Record<MarkerKey, string> = {
  50: "bg-cyan text-on-accent",
  95: "bg-pink text-on-accent",
  99: "bg-purple text-on-deep",
};

/* ── parsing ───────────────────────────────────────────────────────────── */

// A token is a value only if the whole thing is a number with an optional
// time-unit suffix. "p95" and "latency_ms" deliberately fail: they are labels.
const VALUE_RE =
  /^([+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?)(ms|msec|msecs|millis|millisecond|milliseconds|s|sec|secs|second|seconds|us|µs|μs|microsecond|microseconds|ns|nanosecond|nanoseconds)?$/i;

// Commas, semicolons and pipes are separators, never thousands grouping —
// "120,340,180" is three latencies far more often than it is one number.
const SPLIT_RE = /[\s,;|]+/;
const LEAD_PUNCT_RE = /^[\s"'`[\](){}<>:=]+/;
const TAIL_PUNCT_RE = /[\s"'`[\](){}<>:=]+$/;

interface Parsed {
  values: number[];
  skipped: number;
  examples: string[];
  units: string[];
  negatives: number;
  truncated: boolean;
}

function unitFamily(suffix: string): string {
  const s = suffix.toLowerCase();
  if (s.startsWith("ms") || s.startsWith("milli")) return "ms";
  if (s.startsWith("ns") || s.startsWith("nano")) return "ns";
  if (s === "us" || s === "µs" || s === "μs" || s.startsWith("micro")) {
    return "µs";
  }
  return "s";
}

function parseSample(text: string): Parsed {
  const values: number[] = [];
  const examples: string[] = [];
  const units = new Set<string>();
  let skipped = 0;
  let negatives = 0;
  let truncated = false;

  for (const rawToken of text.split(SPLIT_RE)) {
    if (rawToken === "") continue;
    const token = rawToken
      .replace(LEAD_PUNCT_RE, "")
      .replace(TAIL_PUNCT_RE, "");
    if (token === "") continue;

    const match = VALUE_RE.exec(token);
    const parsed = match ? Number(match[1]) : Number.NaN;

    if (!match || !Number.isFinite(parsed)) {
      skipped += 1;
      if (examples.length < 3 && !examples.includes(token)) {
        examples.push(token.length > 16 ? `${token.slice(0, 16)}…` : token);
      }
      continue;
    }

    if (values.length >= MAX_VALUES) {
      truncated = true;
      break;
    }

    const suffix = match[2];
    if (suffix) units.add(unitFamily(suffix));
    if (parsed < 0) negatives += 1;
    values.push(parsed);
  }

  return {
    values,
    skipped,
    examples,
    units: Array.from(units),
    negatives,
    truncated,
  };
}

/* ── statistics ────────────────────────────────────────────────────────── */

interface Stats {
  n: number;
  min: number;
  max: number;
  mean: number;
  median: number;
  stddev: number | null;
}

// Welford's online algorithm: one pass, stable mean and variance even when the
// values are large and the spread is small. Sample stddev (n−1 denominator).
function summarize(sorted: readonly number[]): Stats | null {
  const n = sorted.length;
  if (n === 0) return null;

  let mean = 0;
  let m2 = 0;
  let seen = 0;
  for (const value of sorted) {
    seen += 1;
    const delta = value - mean;
    mean += delta / seen;
    m2 += delta * (value - mean);
  }

  const mid = n >> 1;
  const median =
    n % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;

  return {
    n,
    min: sorted[0],
    max: sorted[n - 1],
    mean,
    median,
    stddev: n > 1 ? Math.sqrt(m2 / (n - 1)) : null,
  };
}

function clamp(value: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, value));
}

// Nearest-rank: always returns a value that is actually in the sample.
function nearestRank(sorted: readonly number[], p: number): number {
  const n = sorted.length;
  if (n === 0) return Number.NaN;
  const rank = Math.ceil((clamp(p, 0, 100) / 100) * n);
  return sorted[clamp(rank - 1, 0, n - 1)];
}

// Linear interpolation, R-7 / numpy default / Excel PERCENTILE.INC.
function linearR7(sorted: readonly number[], p: number): number {
  const n = sorted.length;
  if (n === 0) return Number.NaN;
  if (n === 1) return sorted[0];
  const h = ((n - 1) * clamp(p, 0, 100)) / 100;
  const low = Math.floor(h);
  const high = Math.min(n - 1, low + 1);
  const frac = h - low;
  return sorted[low] + (sorted[high] - sorted[low]) * frac;
}

function quantile(
  sorted: readonly number[],
  p: number,
  method: Method,
): number {
  return method === "nearest" ? nearestRank(sorted, p) : linearR7(sorted, p);
}

interface Confidence {
  level: Level;
  needed: number;
}

// You cannot resolve a percentile whose tail probability is smaller than one
// sample: below n = 1/(1−p) the answer is simply the maximum. Ten samples in
// the tail is the usual "stable enough to trend" threshold.
function confidence(n: number, p: number): Confidence {
  const target = clamp(p, 0, 100);
  const tail = (100 - target) / 100;
  if (tail <= 0) return { level: "max", needed: Number.POSITIVE_INFINITY };
  // Rounded, not ceiled: binary floats make 10 / (1 - 0.9) land on 100.000…2,
  // and this is a rule of thumb, not a boundary worth being precise about.
  const comfortable = Math.round(10 / tail);
  // "No headroom" is derived from the rank the tool actually uses, so the badge
  // can never contradict the value printed next to it.
  if (n === 0 || Math.ceil((target / 100) * n) >= n) {
    return { level: "max", needed: comfortable };
  }
  if (n < comfortable) return { level: "noisy", needed: comfortable };
  return { level: "ok", needed: comfortable };
}

/* ── formatting ────────────────────────────────────────────────────────── */

function formatNumber(value: number): string {
  if (!Number.isFinite(value)) return "—";
  const abs = Math.abs(value);
  const digits =
    abs >= 1000 ? 0 : abs >= 100 ? 1 : abs >= 1 ? 2 : abs >= 0.001 ? 3 : 6;
  return value.toLocaleString("en-US", { maximumFractionDigits: digits });
}

function withUnit(value: number, unit: UnitKey): string {
  const label = UNIT_LABEL[unit];
  const text = formatNumber(value);
  return label ? `${text} ${label}` : text;
}

function formatCount(value: number): string {
  return value.toLocaleString("en-US");
}

function percentileLabel(p: number): string {
  return `p${Number(p.toFixed(6))}`;
}

function plural(count: number, one: string, many: string): string {
  return count === 1 ? one : many;
}

function joinList(items: readonly string[]): string {
  if (items.length === 0) return "";
  if (items.length === 1) return items[0];
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

/* ── sample data (seeded, so the examples never change under you) ──────── */

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function gaussian(rng: () => number): number {
  const u = 1 - rng(); // in (0, 1] so log() is always finite
  const v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function lognormal(rng: () => number, median: number, sigma: number): number {
  return median * Math.exp(sigma * gaussian(rng));
}

const SAMPLE_SEEDS: Record<SampleKind, number> = {
  healthy: 20240611,
  tail: 91827364,
  small: 55512345,
};

const SAMPLE_SIZES: Record<SampleKind, number> = {
  healthy: 800,
  tail: 800,
  small: 40,
};

function buildSample(kind: SampleKind): string {
  const rng = mulberry32(SAMPLE_SEEDS[kind]);
  const size = SAMPLE_SIZES[kind];
  const values: number[] = [];
  for (let i = 0; i < size; i += 1) {
    const slow = kind !== "healthy" && rng() < 0.04;
    const value = slow
      ? lognormal(rng, 850, 0.45)
      : lognormal(
          rng,
          kind === "healthy" ? 42 : 38,
          kind === "healthy" ? 0.4 : 0.35,
        );
    values.push(Math.round(value * 10) / 10);
  }
  return values.join("\n");
}

/* ── DOM wiring ────────────────────────────────────────────────────────── */

interface Controls {
  input: HTMLTextAreaElement;
  unit: HTMLSelectElement;
  method: HTMLSelectElement;
  scale: HTMLSelectElement;
  custom: HTMLInputElement;
}

function readControls(): Controls | null {
  const input = document.getElementById("percentile-calculator-input");
  const unit = document.getElementById("percentile-calculator-unit");
  const method = document.getElementById("percentile-calculator-method");
  const scale = document.getElementById("percentile-calculator-scale");
  const custom = document.getElementById("percentile-calculator-custom");

  if (
    !(input instanceof HTMLTextAreaElement) ||
    !(unit instanceof HTMLSelectElement) ||
    !(method instanceof HTMLSelectElement) ||
    !(scale instanceof HTMLSelectElement) ||
    !(custom instanceof HTMLInputElement)
  ) {
    return null;
  }
  return { input, unit, method, scale, custom };
}

function isUnitKey(value: string): value is UnitKey {
  return value === "ms" || value === "s" || value === "us" || value === "none";
}

function isMethod(value: string): value is Method {
  return value === "nearest" || value === "linear";
}

function isScale(value: string): value is Scale {
  return value === "linear" || value === "log";
}

function isSampleKind(value: string): value is SampleKind {
  return value === "healthy" || value === "tail" || value === "small";
}

interface CustomRead {
  p: number | null;
  message: string;
}

function readCustom(el: HTMLInputElement): CustomRead {
  const raw = el.value.trim();
  if (raw === "") return { p: null, message: "" };
  const value = Number(raw);
  if (!Number.isFinite(value)) {
    return { p: null, message: "Not a number — try 99.5." };
  }
  if (value < 0 || value > 100) {
    return { p: null, message: "Percentiles run from 0 to 100." };
  }
  return { p: value, message: "" };
}

interface TableRow {
  p: number;
  custom: boolean;
  nearest: number;
  linear: number;
  level: Level;
  needed: number;
}

function buildRows(
  sorted: readonly number[],
  customP: number | null,
): TableRow[] {
  const wanted =
    customP === null ? [...FIXED_PERCENTILES] : [...FIXED_PERCENTILES, customP];
  const rows = wanted.map((p, index) => ({
    p,
    custom: customP !== null && index === FIXED_PERCENTILES.length,
    nearest: nearestRank(sorted, p),
    linear: linearR7(sorted, p),
    ...confidence(sorted.length, p),
  }));
  // Array.prototype.sort is stable, so a custom percentile equal to a fixed one
  // keeps the fixed row first.
  return rows.sort((a, b) => a.p - b.p);
}

function bucketCountFor(n: number): number {
  return Math.min(28, Math.max(10, Math.round(Math.sqrt(n))));
}

function init(): void {
  const root = document.getElementById("percentile-calculator-root");
  if (!root || root.dataset.bound === "1") return;

  const controls = readControls();
  if (!controls) return;
  const { input, unit, method, scale, custom } = controls;

  root.dataset.bound = "1";

  const byId = (id: string): HTMLElement | null => document.getElementById(id);
  const setText = (el: HTMLElement | null, value: string): void => {
    if (el) el.textContent = value;
  };

  const parseEl = byId("percentile-calculator-parse");
  const notesEl = byId("percentile-calculator-notes");
  const customHintEl = byId("percentile-calculator-custom-hint");
  const emptyEl = byId("percentile-calculator-empty");
  const statsEl = byId("percentile-calculator-stats");
  const countEl = byId("percentile-calculator-count");
  const minEl = byId("percentile-calculator-min");
  const maxEl = byId("percentile-calculator-max");
  const meanEl = byId("percentile-calculator-mean");
  const medianEl = byId("percentile-calculator-median");
  const stddevEl = byId("percentile-calculator-stddev");
  const rowsEl = byId("percentile-calculator-rows");
  const thNearest = byId("percentile-calculator-th-nearest");
  const thLinear = byId("percentile-calculator-th-linear");
  const warningEl = byId("percentile-calculator-warning");
  const warningTextEl = byId("percentile-calculator-warning-text");
  const plotEl = byId("percentile-calculator-plot");
  const histEl = byId("percentile-calculator-hist");
  const markersEl = byId("percentile-calculator-markers");
  const axisMinEl = byId("percentile-calculator-axis-min");
  const axisMidEl = byId("percentile-calculator-axis-mid");
  const axisMaxEl = byId("percentile-calculator-axis-max");
  const histNoteEl = byId("percentile-calculator-hist-note");
  const copyBtn = byId("percentile-calculator-copy");
  const copyLabel = byId("percentile-calculator-copy-label");

  let report = "";
  let copyTimer = 0;
  let renderTimer = 0;

  function renderNotes(parsed: Parsed): void {
    if (!notesEl) return;
    const notes: string[] = [];

    if (parsed.units.length > 1) {
      notes.push(
        `Mixed unit suffixes in the paste (${parsed.units.join(", ")}). Every value is treated as the same unit — convert first, or the percentiles are meaningless.`,
      );
    }
    if (parsed.negatives > 0) {
      notes.push(
        `${formatCount(parsed.negatives)} negative ${plural(parsed.negatives, "value", "values")} included. Latency is never negative — check the source column.`,
      );
    }
    if (parsed.truncated) {
      notes.push(
        `Stopped at ${formatCount(MAX_VALUES)} values to keep the page responsive. The rest was ignored.`,
      );
    }
    if (parsed.skipped > 0) {
      const examples = parsed.examples.length
        ? ` (${parsed.examples.join(", ")})`
        : "";
      notes.push(
        `Skipped ${formatCount(parsed.skipped)} non-numeric ${plural(parsed.skipped, "token", "tokens")}${examples}.`,
      );
    }

    notesEl.replaceChildren();
    notesEl.hidden = notes.length === 0;
    for (const note of notes) {
      const li = document.createElement("li");
      li.className = "flex gap-2 leading-snug";
      const marker = document.createElement("span");
      marker.className = "shrink-0";
      marker.textContent = "▸";
      marker.setAttribute("aria-hidden", "true");
      const text = document.createElement("span");
      text.textContent = note;
      li.append(marker, text);
      notesEl.appendChild(li);
    }
  }

  function renderTable(
    rows: readonly TableRow[],
    unitKey: UnitKey,
    current: Method,
  ): void {
    if (!rowsEl) return;
    rowsEl.replaceChildren();

    thNearest?.classList.toggle("bg-yellow", current === "nearest");
    thNearest?.classList.toggle("bg-bg-alt", current !== "nearest");
    thLinear?.classList.toggle("bg-yellow", current === "linear");
    thLinear?.classList.toggle("bg-bg-alt", current !== "linear");

    rows.forEach((row, index) => {
      const tr = document.createElement("tr");
      tr.className = row.custom
        ? "bg-cyan"
        : index % 2
          ? "bg-bg-alt"
          : "bg-paper";

      const label = document.createElement("th");
      label.scope = "row";
      label.className =
        "border-ink border-r-[3px] border-b-[2px] p-3 text-left font-mono font-bold whitespace-nowrap";
      label.textContent = percentileLabel(row.p);
      if (row.custom) {
        const tag = document.createElement("span");
        tag.className =
          "mono ml-2 text-[10px] font-bold tracking-widest uppercase opacity-70";
        tag.textContent = "custom";
        label.appendChild(tag);
      }
      tr.appendChild(label);

      const nearestCell = document.createElement("td");
      nearestCell.className = `border-ink border-r-[3px] border-b-[2px] p-3 font-mono text-sm whitespace-nowrap ${
        current === "nearest" ? "font-black" : "opacity-60"
      }`;
      nearestCell.textContent = withUnit(row.nearest, unitKey);
      tr.appendChild(nearestCell);

      const linearCell = document.createElement("td");
      linearCell.className = `border-ink border-r-[3px] border-b-[2px] p-3 font-mono text-sm whitespace-nowrap ${
        current === "linear" ? "font-black" : "opacity-60"
      }`;
      linearCell.textContent = withUnit(row.linear, unitKey);
      tr.appendChild(linearCell);

      const checkCell = document.createElement("td");
      checkCell.className = "border-ink border-b-[2px] p-3 text-sm";
      const badge = document.createElement("span");
      badge.className = `mono border-ink inline-block rounded-full border-[2px] px-2 py-0.5 text-[10px] font-bold tracking-widest uppercase ${BADGE_CLASS[row.level]}`;
      badge.textContent = BADGE_TEXT[row.level];
      checkCell.appendChild(badge);
      const need = document.createElement("span");
      need.className =
        "mono ml-2 text-[10px] tracking-widest uppercase opacity-70";
      need.textContent = Number.isFinite(row.needed)
        ? `need ~${formatCount(row.needed)}`
        : "max by definition";
      checkCell.appendChild(need);
      tr.appendChild(checkCell);

      rowsEl.appendChild(tr);
    });
  }

  function renderWarning(rows: readonly TableRow[], n: number): void {
    if (!warningEl || !warningTextEl) return;
    const atMax = rows
      .filter((r) => r.level === "max")
      .map((r) => percentileLabel(r.p));
    const noisy = rows
      .filter((r) => r.level === "noisy")
      .map((r) => percentileLabel(r.p));

    if (atMax.length === 0 && noisy.length === 0) {
      warningEl.hidden = true;
      warningTextEl.textContent = "";
      return;
    }

    const parts: string[] = [];
    if (atMax.length > 0) {
      parts.push(
        `${joinList(atMax)} ${plural(atMax.length, "lands", "land")} on your largest sample — with n=${formatCount(n)} there is nothing above ${plural(atMax.length, "it", "them")} to measure.`,
      );
    }
    if (noisy.length > 0) {
      parts.push(
        `${joinList(noisy)} ${plural(noisy.length, "rests", "rest")} on a handful of points and will move on the next run.`,
      );
    }
    parts.push(
      "Rule of thumb: you want about 10 ÷ (1 − p) values, so ~200 for p95, ~1,000 for p99, ~10,000 for p99.9.",
    );

    warningEl.hidden = false;
    warningTextEl.textContent = parts.join(" ");
  }

  function renderHistogram(
    sorted: readonly number[],
    stats: Stats,
    unitKey: UnitKey,
    current: Method,
    scaleMode: Scale,
  ): void {
    if (!histEl || !markersEl) return;

    // Latency is right-skewed: on a linear axis one slow request can push 95%
    // of the sample into a single bucket. A log axis spreads the tail out, and
    // it is only available when every value is above zero.
    const logPossible = stats.min > 0;
    const useLog = scaleMode === "log" && logPossible;
    const toAxis = (v: number): number => (useLog ? Math.log10(v) : v);
    const fromAxis = (t: number): number => (useLog ? 10 ** t : t);

    const low = toAxis(stats.min);
    const high = toAxis(stats.max);
    const span = high - low;
    const buckets = span > 0 ? bucketCountFor(stats.n) : 1;
    const counts = new Array<number>(buckets).fill(0);

    if (span > 0) {
      for (const value of sorted) {
        const index = clamp(
          Math.floor(((toAxis(value) - low) / span) * buckets),
          0,
          buckets - 1,
        );
        counts[index] += 1;
      }
    } else {
      counts[0] = stats.n;
    }

    const tallest = counts.reduce((a, b) => Math.max(a, b), 0);

    histEl.replaceChildren();
    counts.forEach((count, index) => {
      const from =
        span > 0 ? fromAxis(low + (span * index) / buckets) : stats.min;
      const to =
        span > 0 ? fromAxis(low + (span * (index + 1)) / buckets) : stats.max;
      const bar = document.createElement("div");
      bar.className = "bg-ink flex-1";
      bar.style.height =
        tallest > 0 ? `${((count / tallest) * 100).toFixed(2)}%` : "0%";
      if (count > 0) bar.style.minHeight = "3px";
      bar.title = `${withUnit(from, unitKey)} – ${withUnit(to, unitKey)} · ${formatCount(count)} ${plural(count, "value", "values")}`;
      histEl.appendChild(bar);
    });

    markersEl.replaceChildren();
    const markerText: string[] = [];
    MARKER_PERCENTILES.forEach((p, index) => {
      const value = quantile(sorted, p, current);
      const position =
        span > 0 ? clamp(((toAxis(value) - low) / span) * 100, 0, 100) : 50;

      const line = document.createElement("div");
      line.className = `absolute top-0 bottom-0 w-[2px] ${MARKER_LINE[p]}`;
      line.style.left = `${position.toFixed(2)}%`;

      const chip = document.createElement("div");
      chip.className = `mono border-ink absolute rounded-[3px] border-[2px] px-1 text-[10px] font-bold tracking-widest whitespace-nowrap uppercase ${MARKER_CHIP[p]}`;
      chip.style.left = `${position.toFixed(2)}%`;
      chip.style.top = `${4 + index * 20}px`;
      chip.style.transform =
        position > 78
          ? "translateX(-100%)"
          : position < 22
            ? "translateX(0)"
            : "translateX(-50%)";
      chip.textContent = `${percentileLabel(p)} ${withUnit(value, unitKey)}`;

      markersEl.append(line, chip);
      markerText.push(`${percentileLabel(p)} ${withUnit(value, unitKey)}`);
    });

    plotEl?.setAttribute(
      "aria-label",
      `Histogram of ${formatCount(stats.n)} values from ${withUnit(stats.min, unitKey)} to ${withUnit(stats.max, unitKey)} across ${buckets} ${useLog ? "logarithmic" : "equal-width"} ${plural(buckets, "bucket", "buckets")}. Tallest bucket holds ${formatCount(tallest)} ${plural(tallest, "value", "values")}. Markers: ${markerText.join(", ")}.`,
    );

    setText(axisMinEl, withUnit(stats.min, unitKey));
    setText(axisMidEl, withUnit(fromAxis(low + span / 2), unitKey));
    setText(axisMaxEl, withUnit(stats.max, unitKey));

    const spacing =
      buckets === 1 ? "" : useLog ? "log-spaced " : "equal-width ";
    const scaleNote =
      scaleMode === "log" && !logPossible
        ? "log scale needs every value above zero — showing linear"
        : `${buckets} ${spacing}${plural(buckets, "bucket", "buckets")}`;
    setText(
      histNoteEl,
      `${scaleNote} · tallest holds ${formatCount(tallest)} ${plural(tallest, "value", "values")} · bars are counts, not time`,
    );
  }

  function clearOutputs(message: string): void {
    report = "";
    if (statsEl) statsEl.hidden = true;
    if (emptyEl) {
      emptyEl.hidden = false;
      emptyEl.textContent = message;
    }
    if (warningEl) warningEl.hidden = true;
    rowsEl?.replaceChildren();
    histEl?.replaceChildren();
    markersEl?.replaceChildren();
    plotEl?.setAttribute("aria-label", "Histogram — no data yet");
    setText(axisMinEl, "—");
    setText(axisMidEl, "—");
    setText(axisMaxEl, "—");
    setText(histNoteEl, "Paste values to draw the distribution.");
    if (copyBtn instanceof HTMLButtonElement) copyBtn.disabled = true;
  }

  function buildReport(
    stats: Stats,
    rows: readonly TableRow[],
    unitKey: UnitKey,
    current: Method,
  ): string {
    const suffix = UNIT_LABEL[unitKey] || "unitless";
    const lines = [
      `Latency percentiles — n=${formatCount(stats.n)}, unit ${suffix}, method ${current === "nearest" ? "nearest-rank" : "linear (R-7)"}`,
      `min ${formatNumber(stats.min)}  max ${formatNumber(stats.max)}  mean ${formatNumber(stats.mean)}  median ${formatNumber(stats.median)}  stddev ${stats.stddev === null ? "n/a" : formatNumber(stats.stddev)}`,
      "",
    ];
    for (const row of rows) {
      const value = current === "nearest" ? row.nearest : row.linear;
      lines.push(
        `${percentileLabel(row.p).padEnd(8)}${formatNumber(value).padStart(12)}   ${BADGE_TEXT[row.level]}`,
      );
    }
    lines.push("", "ansezz.com/tools/percentile-calculator/");
    return lines.join("\n");
  }

  function render(): void {
    const unitKey = isUnitKey(unit.value) ? unit.value : "ms";
    const current = isMethod(method.value) ? method.value : "nearest";
    const scaleMode = isScale(scale.value) ? scale.value : "linear";
    const customRead = readCustom(custom);

    if (customHintEl) {
      customHintEl.hidden = customRead.message === "";
      customHintEl.textContent = customRead.message;
    }

    const parsed = parseSample(input.value);
    renderNotes(parsed);
    setText(
      parseEl,
      `Parsed ${formatCount(parsed.values.length)} ${plural(parsed.values.length, "value", "values")} · skipped ${formatCount(parsed.skipped)}`,
    );

    const sorted = [...parsed.values].sort((a, b) => a - b);
    const stats = summarize(sorted);

    if (!stats) {
      clearOutputs(
        input.value.trim() === ""
          ? "Paste response times above — one per line, or comma separated."
          : "Nothing in that paste parsed as a number. Values need to look like 142, 142ms, or 0.142s.",
      );
      return;
    }

    if (emptyEl) emptyEl.hidden = true;
    if (statsEl) statsEl.hidden = false;
    if (copyBtn instanceof HTMLButtonElement) copyBtn.disabled = false;

    setText(countEl, formatCount(stats.n));
    setText(minEl, withUnit(stats.min, unitKey));
    setText(maxEl, withUnit(stats.max, unitKey));
    setText(meanEl, withUnit(stats.mean, unitKey));
    setText(medianEl, withUnit(stats.median, unitKey));
    setText(
      stddevEl,
      stats.stddev === null ? "— (need 2+)" : withUnit(stats.stddev, unitKey),
    );

    const rows = buildRows(sorted, customRead.p);
    renderTable(rows, unitKey, current);
    renderWarning(rows, stats.n);
    renderHistogram(sorted, stats, unitKey, current, scaleMode);
    report = buildReport(stats, rows, unitKey, current);
  }

  function scheduleRender(): void {
    window.clearTimeout(renderTimer);
    renderTimer = window.setTimeout(render, INPUT_DEBOUNCE_MS);
  }

  input.addEventListener("input", scheduleRender);
  for (const el of [unit, method, scale, custom]) {
    el.addEventListener("input", render);
    el.addEventListener("change", render);
  }

  root.querySelectorAll<HTMLButtonElement>("[data-sample]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const kind = btn.dataset.sample ?? "";
      input.value = isSampleKind(kind) ? buildSample(kind) : "";
      window.clearTimeout(renderTimer);
      render();
    });
  });

  function flashCopyLabel(text: string): void {
    if (!copyLabel) return;
    copyLabel.textContent = text;
    window.clearTimeout(copyTimer);
    copyTimer = window.setTimeout(() => {
      copyLabel.textContent = "Copy report";
    }, 1500);
  }

  copyBtn?.addEventListener("click", async () => {
    if (!report) return;
    try {
      await navigator.clipboard.writeText(report);
      flashCopyLabel("Copied!");
    } catch {
      flashCopyLabel("Copy blocked");
    }
  });

  render();
}

init();
document.addEventListener("astro:after-swap", init);

export {};
