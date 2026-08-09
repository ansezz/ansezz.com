// Bidirectional Unix timestamp converter. Detects seconds / milliseconds /
// microseconds / nanoseconds from the magnitude of the number, converts to a
// JS Date, then renders through Intl.DateTimeFormat (viewer's IANA zone) and
// Intl.RelativeTimeFormat. Also converts a wall-clock date back to epoch.
// Everything is computed locally — no network calls.

type Unit = "seconds" | "milliseconds" | "microseconds" | "nanoseconds";

const UNITS: readonly Unit[] = [
  "seconds",
  "milliseconds",
  "microseconds",
  "nanoseconds",
];

// Milliseconds contained in one unit of each scale.
const MS_PER_UNIT: Record<Unit, number> = {
  seconds: 1000,
  milliseconds: 1,
  microseconds: 1e-3,
  nanoseconds: 1e-6,
};

// ECMA-262 time-value limit: ±8.64e15 ms around the epoch.
const MAX_TIME_MS = 8.64e15;
const DAY_MS = 86_400_000;

const RFC_DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const RFC_MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

function pad(n: number, width = 2): string {
  return String(n).padStart(width, "0");
}

function year4(y: number): string {
  return y < 0 ? `-${String(-y).padStart(6, "0")}` : String(y).padStart(4, "0");
}

function detectTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

const LOCAL_TZ = detectTimeZone();

function makeFormatter(
  timeZone: string,
  options: Intl.DateTimeFormatOptions,
): Intl.DateTimeFormat {
  try {
    return new Intl.DateTimeFormat(undefined, { ...options, timeZone });
  } catch {
    return new Intl.DateTimeFormat(undefined, { ...options, timeZone: "UTC" });
  }
}

const FULL_OPTS: Intl.DateTimeFormatOptions = {
  weekday: "short",
  year: "numeric",
  month: "short",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
};

const UTC_FULL = makeFormatter("UTC", FULL_OPTS);
const LOCAL_FULL = makeFormatter(LOCAL_TZ, FULL_OPTS);
const UTC_WEEKDAY = makeFormatter("UTC", { weekday: "long" });
const LOCAL_WEEKDAY = makeFormatter(LOCAL_TZ, { weekday: "long" });

function makeRelativeFormatter(): Intl.RelativeTimeFormat {
  try {
    return new Intl.RelativeTimeFormat(undefined, { numeric: "always" });
  } catch {
    return new Intl.RelativeTimeFormat("en", { numeric: "always" });
  }
}

const RTF = makeRelativeFormatter();

// Largest-first so the biggest sensible unit wins.
const RELATIVE_STEPS: { unit: Intl.RelativeTimeFormatUnit; ms: number }[] = [
  { unit: "year", ms: 31_556_952_000 },
  { unit: "month", ms: 2_629_746_000 },
  { unit: "week", ms: 604_800_000 },
  { unit: "day", ms: DAY_MS },
  { unit: "hour", ms: 3_600_000 },
  { unit: "minute", ms: 60_000 },
  { unit: "second", ms: 1000 },
];

function isUnit(value: string): value is Unit {
  return (UNITS as readonly string[]).includes(value);
}

// 10-digit numbers are seconds until year 5138; 13-digit are milliseconds; and
// so on. The thresholds are the points where each scale would otherwise land
// past year 5138.
function detectUnit(magnitude: number): Unit {
  if (magnitude < 1e11) return "seconds";
  if (magnitude < 1e14) return "milliseconds";
  if (magnitude < 1e17) return "microseconds";
  return "nanoseconds";
}

interface Parsed {
  ms: number;
  unit: Unit;
  digits: number;
  fromDateString: boolean;
}

type ParseResult = { ok: true; value: Parsed } | { ok: false; error: string };

function parseTimestamp(raw: string, forced: Unit | "auto"): ParseResult {
  const trimmed = raw.trim();
  // Allow thousands separators people paste from logs and code.
  const cleaned = trimmed.replace(/[_,\s]/g, "");

  if (/^[+-]?\d+(?:\.\d+)?$/.test(cleaned)) {
    const n = Number(cleaned);
    if (!Number.isFinite(n)) {
      return { ok: false, error: "That number is too large to represent." };
    }
    const digits = cleaned.replace(/^[+-]/, "").split(".")[0].length;
    const unit = forced === "auto" ? detectUnit(Math.abs(n)) : forced;
    const ms = n * MS_PER_UNIT[unit];
    if (!Number.isFinite(ms) || Math.abs(ms) > MAX_TIME_MS) {
      return {
        ok: false,
        error: `Read as ${unit}, that lands outside the range a JavaScript Date can hold (±8.64e15 ms, roughly ±273,790 years around 1970). Try a different unit.`,
      };
    }
    return { ok: true, value: { ms, unit, digits, fromDateString: false } };
  }

  // Fall back to date-string parsing so pasting an ISO string still works.
  const fromString = Date.parse(trimmed);
  if (Number.isFinite(fromString)) {
    return {
      ok: true,
      value: {
        ms: fromString,
        unit: "milliseconds",
        digits: 0,
        fromDateString: true,
      },
    };
  }

  return {
    ok: false,
    error:
      "Not a number and not a date string I can parse. Try 1700000000, 1700000000000, or 2023-11-14T22:13:20Z.",
  };
}

function isoUtc(d: Date): string {
  return d.toISOString();
}

function isoLocal(d: Date): string {
  const offsetMinutes = -d.getTimezoneOffset();
  const sign = offsetMinutes < 0 ? "-" : "+";
  const abs = Math.abs(offsetMinutes);
  return (
    `${year4(d.getFullYear())}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}` +
    `.${pad(d.getMilliseconds(), 3)}` +
    `${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`
  );
}

function rfc2822(d: Date): string {
  return (
    `${RFC_DAYS[d.getUTCDay()]}, ${pad(d.getUTCDate())} ` +
    `${RFC_MONTHS[d.getUTCMonth()]} ${year4(d.getUTCFullYear())} ` +
    `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())} +0000`
  );
}

function offsetLabel(d: Date): string {
  const offsetMinutes = -d.getTimezoneOffset();
  const sign = offsetMinutes < 0 ? "-" : "+";
  const abs = Math.abs(offsetMinutes);
  return `UTC${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
}

function relativePhrase(targetMs: number, nowMs: number): string {
  const diff = targetMs - nowMs;
  const abs = Math.abs(diff);
  if (abs < 1000) return "right now";
  for (const step of RELATIVE_STEPS) {
    if (abs >= step.ms)
      return RTF.format(Math.round(diff / step.ms), step.unit);
  }
  return RTF.format(Math.round(diff / 1000), "second");
}

function humanDuration(absMs: number): string {
  const totalSeconds = Math.floor(absMs / 1000);
  const days = Math.floor(totalSeconds / 86_400);
  if (days >= 730) {
    const years = Math.floor(days / 365.2425);
    const restDays = Math.max(0, days - Math.round(years * 365.2425));
    return `${years}y ${restDays}d`;
  }
  const hours = Math.floor((totalSeconds % 86_400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const parts: string[] = [];
  if (days) parts.push(`${days}d`);
  if (hours) parts.push(`${hours}h`);
  if (minutes) parts.push(`${minutes}m`);
  if (seconds || parts.length === 0) parts.push(`${seconds}s`);
  return parts.join(" ");
}

function dayOfYear(d: Date): number {
  const start = Date.UTC(d.getUTCFullYear(), 0, 1);
  const current = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  return Math.round((current - start) / DAY_MS) + 1;
}

// ISO-8601 week date (weeks start Monday, week 1 contains the first Thursday).
function isoWeek(d: Date): string {
  const t = new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()),
  );
  const weekday = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - weekday);
  const yearStart = Date.UTC(t.getUTCFullYear(), 0, 1);
  const week = Math.ceil(((t.getTime() - yearStart) / DAY_MS + 1) / 7);
  return `${t.getUTCFullYear()}-W${pad(week)}`;
}

function localInputValue(d: Date): string {
  return (
    `${year4(d.getFullYear())}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
  );
}

function utcInputValue(d: Date): string {
  return (
    `${year4(d.getUTCFullYear())}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}` +
    `T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`
  );
}

const DATETIME_LOCAL =
  /^(\d{4,6})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?$/;

function wallClockToMs(value: string, asUtc: boolean): number | null {
  const match = DATETIME_LOCAL.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = match[6] ? Number(match[6]) : 0;
  const millis = match[7] ? Number(match[7].padEnd(3, "0")) : 0;

  if (asUtc) {
    const d = new Date(
      Date.UTC(year, month - 1, day, hour, minute, second, millis),
    );
    // Date.UTC maps years 0-99 into 1900-1999; undo that.
    if (year >= 0 && year < 100) d.setUTCFullYear(year);
    const ms = d.getTime();
    return Number.isFinite(ms) ? ms : null;
  }

  const d = new Date(year, month - 1, day, hour, minute, second, millis);
  if (year >= 0 && year < 100) d.setFullYear(year);
  const ms = d.getTime();
  return Number.isFinite(ms) ? ms : null;
}

async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

// Fallback when the Clipboard API is unavailable (insecure origin, denied
// permission): highlight the value so the keyboard shortcut still works.
function selectElementText(node: Element): boolean {
  try {
    const selection = window.getSelection();
    if (!selection) return false;
    const range = document.createRange();
    range.selectNodeContents(node);
    selection.removeAllRanges();
    selection.addRange(range);
    return true;
  } catch {
    return false;
  }
}

function flashButton(button: HTMLButtonElement, message: string): void {
  const original = button.dataset.epochLabel ?? button.textContent ?? "Copy";
  button.dataset.epochLabel = original;
  button.textContent = message;
  window.setTimeout(() => {
    button.textContent = button.dataset.epochLabel ?? original;
  }, 1500);
}

function init(): void {
  const root = document.getElementById("epoch-root");
  if (!root || root.dataset.bound === "1") return;

  const tsNode = document.getElementById("epoch-ts-input");
  const unitNode = document.getElementById("epoch-ts-unit");
  const dtNode = document.getElementById("epoch-dt-input");
  const zoneNode = document.getElementById("epoch-dt-zone");
  if (
    !(tsNode instanceof HTMLInputElement) ||
    !(unitNode instanceof HTMLSelectElement) ||
    !(dtNode instanceof HTMLInputElement) ||
    !(zoneNode instanceof HTMLSelectElement)
  ) {
    return;
  }
  root.dataset.bound = "1";

  // Re-bind with explicit types so the narrowing survives into the closures
  // below (control-flow narrowing does not cross a function boundary).
  const rootEl: HTMLElement = root;
  const tsInput: HTMLInputElement = tsNode;
  const unitSelect: HTMLSelectElement = unitNode;
  const dtInput: HTMLInputElement = dtNode;
  const zoneSelect: HTMLSelectElement = zoneNode;

  const tsError = document.getElementById("epoch-ts-error");
  const dtError = document.getElementById("epoch-dt-error");

  // Only touch the DOM when the value actually changed — the results block is
  // an aria-live region and rewriting identical text would announce it again.
  function setText(id: string, text: string): void {
    const node = document.getElementById(id);
    if (node && node.textContent !== text) node.textContent = text;
  }

  const TS_OUTPUT_IDS = [
    "epoch-out-detected",
    "epoch-out-utc",
    "epoch-out-local",
    "epoch-out-relative",
    "epoch-out-relative-exact",
    "epoch-out-iso",
    "epoch-out-isolocal",
    "epoch-out-rfc",
    "epoch-out-weekday",
    "epoch-out-calendar",
    "epoch-out-normalized",
  ];

  function clearTimestampOutput(): void {
    for (const id of TS_OUTPUT_IDS) setText(id, "—");
  }

  function showTimestampError(message: string | null): void {
    if (!tsError) return;
    tsError.hidden = message === null;
    tsError.textContent = message ?? "";
  }

  function showDateError(message: string | null): void {
    if (!dtError) return;
    dtError.hidden = message === null;
    dtError.textContent = message ?? "";
  }

  function currentForcedUnit(): Unit | "auto" {
    return isUnit(unitSelect.value) ? unitSelect.value : "auto";
  }

  function renderTimestamp(): void {
    try {
      if (!tsInput.value.trim()) {
        showTimestampError(null);
        clearTimestampOutput();
        return;
      }

      const result = parseTimestamp(tsInput.value, currentForcedUnit());
      if (!result.ok) {
        showTimestampError(result.error);
        clearTimestampOutput();
        return;
      }
      showTimestampError(null);

      const { ms, unit, digits, fromDateString } = result.value;
      const date = new Date(ms);

      setText(
        "epoch-out-detected",
        fromDateString
          ? "Parsed as a date string, not a number"
          : `${currentForcedUnit() === "auto" ? "Auto-detected" : "Forced"}: ${unit} · ${digits} digits`,
      );
      setText("epoch-out-utc", `${UTC_FULL.format(date)} UTC`);
      setText("epoch-out-local", `${LOCAL_FULL.format(date)} (${LOCAL_TZ})`);

      const now = Date.now();
      setText("epoch-out-relative", relativePhrase(ms, now));
      const delta = ms - now;
      setText(
        "epoch-out-relative-exact",
        Math.abs(delta) < 1000
          ? "less than a second from now"
          : `${humanDuration(Math.abs(delta))} ${delta < 0 ? "before" : "after"} now`,
      );

      setText("epoch-out-iso", isoUtc(date));
      setText("epoch-out-isolocal", isoLocal(date));
      setText("epoch-out-rfc", rfc2822(date));

      const localDay = LOCAL_WEEKDAY.format(date);
      const utcDay = UTC_WEEKDAY.format(date);
      setText(
        "epoch-out-weekday",
        localDay === utcDay ? localDay : `${localDay} local · ${utcDay} UTC`,
      );
      setText(
        "epoch-out-calendar",
        `Day ${dayOfYear(date)} of ${date.getUTCFullYear()} · ISO week ${isoWeek(date)}`,
      );

      const seconds = Math.floor(ms / 1000);
      // Sub-millisecond input (µs / ns) keeps its fraction here rather than
      // silently rounding — the Date itself truncates to whole milliseconds.
      const msLabel = String(ms);
      setText("epoch-out-normalized", `${seconds} s · ${msLabel} ms`);
    } catch {
      showTimestampError(
        "Could not convert that value. Try a plain integer like 1700000000.",
      );
      clearTimestampOutput();
    }
  }

  function clearDateOutput(): void {
    for (const id of [
      "epoch-dt-seconds",
      "epoch-dt-ms",
      "epoch-dt-iso",
      "epoch-dt-echo",
    ]) {
      setText(id, "—");
    }
  }

  function renderDate(): void {
    try {
      if (!dtInput.value) {
        showDateError(null);
        clearDateOutput();
        return;
      }
      const asUtc = zoneSelect.value === "utc";
      const ms = wallClockToMs(dtInput.value, asUtc);
      if (ms === null || Math.abs(ms) > MAX_TIME_MS) {
        showDateError(
          "That date is either incomplete or outside the range a JavaScript Date can hold.",
        );
        clearDateOutput();
        return;
      }
      showDateError(null);
      const date = new Date(ms);
      setText("epoch-dt-seconds", String(Math.floor(ms / 1000)));
      setText("epoch-dt-ms", String(ms));
      setText("epoch-dt-iso", isoUtc(date));
      setText(
        "epoch-dt-echo",
        asUtc
          ? `${LOCAL_FULL.format(date)} in ${LOCAL_TZ}`
          : `${UTC_FULL.format(date)} UTC`,
      );
    } catch {
      showDateError("Could not read that date and time.");
      clearDateOutput();
    }
  }

  // ---- presets -------------------------------------------------------------

  function presetMs(kind: string, base: number): number | null {
    const now = Date.now();
    switch (kind) {
      case "now":
        return now;
      case "today-utc": {
        const d = new Date(now);
        return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
      }
      case "plus-1d":
        return base + DAY_MS;
      case "plus-30d":
        return base + 30 * DAY_MS;
      case "y2038":
        return 2_147_483_647 * 1000;
      case "zero":
        return 0;
      default:
        return null;
    }
  }

  function applyPreset(kind: string): void {
    const forced = currentForcedUnit();
    const parsed = tsInput.value.trim()
      ? parseTimestamp(tsInput.value, forced)
      : null;
    const base = parsed && parsed.ok ? parsed.value.ms : Date.now();
    const currentUnit =
      parsed && parsed.ok && !parsed.value.fromDateString
        ? parsed.value.unit
        : "seconds";

    const ms = presetMs(kind, base);
    if (ms === null) return;

    // Absolute presets are defined in seconds; relative ones keep whatever
    // scale the box is already using so stepping doesn't change units.
    const absolutePreset = kind === "y2038" || kind === "zero";
    const unit: Unit =
      forced !== "auto"
        ? forced
        : absolutePreset || currentUnit !== "milliseconds"
          ? "seconds"
          : "milliseconds";

    tsInput.value = String(Math.round(ms / MS_PER_UNIT[unit]));
    renderTimestamp();
  }

  // ---- ticker --------------------------------------------------------------

  let paused = false;
  let lastTickAt = 0;
  let lastRelativeAt = 0;
  const pauseButton = document.getElementById("epoch-pause");

  function tick(): void {
    // The element is gone after a view transition — let the loop die.
    if (!rootEl.isConnected) return;
    const now = Date.now();

    // 10 fps is plenty for a readout and keeps the DOM churn negligible.
    if (!paused && now - lastTickAt >= 100) {
      lastTickAt = now;
      setText("epoch-now-seconds", String(Math.floor(now / 1000)));
      setText("epoch-now-ms", String(now));
      setText("epoch-now-iso", new Date(now).toISOString());
    }

    // "3 hours ago" would otherwise go stale the moment it is rendered.
    if (now - lastRelativeAt >= 10_000) {
      lastRelativeAt = now;
      renderTimestamp();
    }
    window.requestAnimationFrame(tick);
  }

  if (pauseButton instanceof HTMLButtonElement) {
    pauseButton.addEventListener("click", () => {
      paused = !paused;
      pauseButton.textContent = paused ? "Resume" : "Pause";
      pauseButton.setAttribute("aria-pressed", String(paused));
    });
  }

  // ---- wiring --------------------------------------------------------------

  tsInput.addEventListener("input", renderTimestamp);
  unitSelect.addEventListener("change", renderTimestamp);
  dtInput.addEventListener("input", renderDate);
  zoneSelect.addEventListener("change", renderDate);

  rootEl
    .querySelectorAll<HTMLButtonElement>("[data-epoch-preset]")
    .forEach((b) => {
      b.addEventListener("click", () =>
        applyPreset(b.dataset.epochPreset ?? ""),
      );
    });

  rootEl.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const button = target.closest("button[data-epoch-copy]");
    if (!(button instanceof HTMLButtonElement)) return;
    const sourceId = button.dataset.epochCopy;
    if (!sourceId) return;
    const source = document.getElementById(sourceId);
    if (!source) return;
    const text = source.textContent?.trim() ?? "";
    if (!text || text === "—") {
      flashButton(button, "Nothing yet");
      return;
    }
    void copyToClipboard(text).then((ok) => {
      if (ok) {
        flashButton(button, "Copied!");
        return;
      }
      flashButton(button, selectElementText(source) ? "Press ⌘C" : "Blocked");
    });
  });

  const useNowButton = document.getElementById("epoch-dt-now");
  useNowButton?.addEventListener("click", () => {
    const now = new Date();
    dtInput.value =
      zoneSelect.value === "utc" ? utcInputValue(now) : localInputValue(now);
    renderDate();
  });

  const sendButton = document.getElementById("epoch-dt-send");
  sendButton?.addEventListener("click", () => {
    const asUtc = zoneSelect.value === "utc";
    const ms = wallClockToMs(dtInput.value, asUtc);
    if (ms === null) {
      showDateError("Pick a complete date and time first.");
      return;
    }
    unitSelect.value = "auto";
    tsInput.value = String(Math.floor(ms / 1000));
    renderTimestamp();
    tsInput.focus();
  });

  // ---- initial state -------------------------------------------------------

  setText("epoch-tz", LOCAL_TZ);
  setText("epoch-offset", offsetLabel(new Date()));

  const bootNow = new Date();
  if (!tsInput.value.trim()) {
    tsInput.value = String(Math.floor(bootNow.getTime() / 1000));
  }
  if (!dtInput.value) {
    dtInput.value = localInputValue(bootNow);
  }

  renderTimestamp();
  renderDate();
  window.requestAnimationFrame(tick);
}

init();
document.addEventListener("astro:after-swap", init);

export {};
