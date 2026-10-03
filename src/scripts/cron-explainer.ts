// Client-side 5-field cron explainer. Describes each field in plain English,
// lists the next run times (browser time zone or UTC) and suggests the
// matching Laravel scheduler call. Supports *, */n, ranges a-b, lists a,b,c,
// month and weekday names (JAN, MON) and the @hourly style shortcuts.

const SHORTCUTS: Record<string, string> = {
  "@yearly": "0 0 1 1 *",
  "@annually": "0 0 1 1 *",
  "@monthly": "0 0 1 * *",
  "@weekly": "0 0 * * 0",
  "@daily": "0 0 * * *",
  "@midnight": "0 0 * * *",
  "@hourly": "0 * * * *",
};

const MONTH_NAMES = [
  "jan",
  "feb",
  "mar",
  "apr",
  "may",
  "jun",
  "jul",
  "aug",
  "sep",
  "oct",
  "nov",
  "dec",
];
const DOW_NAMES = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

/** Replaces JAN..DEC and SUN..SAT with numbers in the month and dow fields. */
function normaliseNames(tokens: string[]): string[] {
  const out = [...tokens];
  out[3] = out[3].replace(/[a-z]{3}/gi, (m) => {
    const i = MONTH_NAMES.indexOf(m.toLowerCase());
    return i === -1 ? m : String(i + 1);
  });
  out[4] = out[4].replace(/[a-z]{3}/gi, (m) => {
    const i = DOW_NAMES.indexOf(m.toLowerCase());
    return i === -1 ? m : String(i);
  });
  return out;
}

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];
const DOW = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

interface FieldSpec {
  min: number;
  max: number;
  name: string;
  labels?: string[];
}

const SPECS: FieldSpec[] = [
  { min: 0, max: 59, name: "minute" },
  { min: 0, max: 23, name: "hour" },
  { min: 1, max: 31, name: "day-of-month" },
  { min: 1, max: 12, name: "month", labels: MONTHS },
  // Day-of-week allows 0-7, where both 0 and 7 mean Sunday (crontab(5)).
  { min: 0, max: 7, name: "day-of-week", labels: DOW },
];

function label(spec: FieldSpec, n: number): string {
  if (spec.labels) {
    const idx = spec.name === "month" ? n - 1 : n % 7;
    return spec.labels[idx] ?? String(n);
  }
  return String(n);
}

// Returns a human phrase for a single field, or throws on invalid input.
function describeField(raw: string, spec: FieldSpec): string {
  if (raw === "*") return `every ${spec.name}`;

  const parts = raw.split(",");
  const phrases = parts.map((part) => {
    const step = part.match(/^(\*|\d+(?:-\d+)?)\/(\d+)$/);
    if (step) {
      const n = Number(step[2]);
      if (!Number.isInteger(n) || n < 1)
        throw new Error(`bad step in "${raw}"`);
      // Validate the step base (the part before "/") against field bounds.
      const base = step[1];
      let range = "";
      if (base !== "*") {
        const bounds = base.match(/^(\d+)-(\d+)$/);
        if (bounds) {
          assertIn(Number(bounds[1]), spec, raw);
          assertIn(Number(bounds[2]), spec, raw);
        } else {
          assertIn(Number(base), spec, raw);
        }
        range = ` (within ${base})`;
      }
      return `every ${n} ${spec.name}s${range}`;
    }
    const range = part.match(/^(\d+)-(\d+)$/);
    if (range) {
      const a = Number(range[1]);
      const b = Number(range[2]);
      assertIn(a, spec, raw);
      assertIn(b, spec, raw);
      return `${label(spec, a)} through ${label(spec, b)}`;
    }
    if (/^\d+$/.test(part)) {
      const n = Number(part);
      assertIn(n, spec, raw);
      return label(spec, n);
    }
    throw new Error(`can't parse "${part}"`);
  });
  return phrases.join(", ");
}

function assertIn(n: number, spec: FieldSpec, raw: string): void {
  if (n < spec.min || n > spec.max) {
    throw new Error(
      `${spec.name} "${raw}" out of range (${spec.min}-${spec.max})`,
    );
  }
}

interface Explanation {
  ok: boolean;
  summary: string;
  fields: { name: string; value: string; desc: string }[];
}

function explain(expr: string): Explanation {
  const tokens = expr.trim().split(/\s+/);
  if (tokens.length === 5) {
    const named = normaliseNames(tokens);
    tokens.splice(0, 5, ...named);
  }
  if (tokens.length !== 5) {
    return {
      ok: false,
      summary: `Expected 5 fields, got ${tokens.length || 0}. Format: minute hour day-of-month month day-of-week.`,
      fields: [],
    };
  }

  try {
    const fields = tokens.map((t, i) => ({
      name: SPECS[i].name,
      value: t,
      desc: describeField(t, SPECS[i]),
    }));

    const [minute, hour, dom, month, dow] = tokens;
    let time: string;
    if (minute === "*" && hour === "*") time = "every minute";
    else if (hour === "*")
      time = /^\d+$/.test(minute)
        ? `at minute ${minute} past every hour`
        : `at ${describeField(minute, SPECS[0])} past every hour`;
    else if (minute === "0" && /^\d+$/.test(hour))
      time = `at ${hour.padStart(2, "0")}:00`;
    else if (/^\d+$/.test(minute) && /^\d+$/.test(hour))
      time = `at ${hour.padStart(2, "0")}:${minute.padStart(2, "0")}`;
    else
      time = `at minute ${describeField(minute, SPECS[0])} of hour ${describeField(hour, SPECS[1])}`;

    let day = "";
    const domStar = dom === "*";
    const dowStar = dow === "*";
    if (domStar && dowStar) day = "every day";
    else if (!dowStar && domStar) day = `on ${describeField(dow, SPECS[4])}`;
    else if (dowStar && !domStar)
      day = `on day-of-month ${describeField(dom, SPECS[2])}`;
    else
      day = `on ${describeField(dow, SPECS[4])} and day-of-month ${describeField(dom, SPECS[2])}`;

    const mon = month === "*" ? "" : ` in ${describeField(month, SPECS[3])}`;

    return {
      ok: true,
      summary: `Runs ${time}, ${day}${mon}.`,
      fields,
    };
  } catch (e) {
    return {
      ok: false,
      summary: `Invalid: ${e instanceof Error ? e.message : "could not parse"}.`,
      fields: [],
    };
  }
}

/* ── next runs ─────────────────────────────────────────── */

/** Expands one field into the sorted set of values it matches. */
function expand(raw: string, spec: FieldSpec): Set<number> {
  const out = new Set<number>();
  const max = spec.name === "day-of-week" ? 6 : spec.max;
  for (const part of raw.split(",")) {
    let base = part;
    let step = 1;
    const slash = part.indexOf("/");
    if (slash !== -1) {
      base = part.slice(0, slash);
      step = Number(part.slice(slash + 1));
    }
    let lo: number;
    let hi: number;
    if (base === "*") {
      lo = spec.min;
      hi = spec.max;
    } else if (base.includes("-")) {
      const [a, b] = base.split("-").map(Number);
      lo = a;
      hi = b;
    } else {
      lo = Number(base);
      hi = slash !== -1 ? spec.max : lo;
    }
    for (let v = lo; v <= hi; v += step) {
      out.add(spec.name === "day-of-week" ? v % 7 : v);
    }
  }
  for (const v of out)
    if (v > max && spec.name !== "day-of-week") out.delete(v);
  return out;
}

/** Next `count` run times after `from`, in local time or UTC. */
function nextRuns(
  tokens: string[],
  from: Date,
  count: number,
  utc: boolean,
): Date[] {
  const [mi, ho, dm, mo, dw] = tokens.map((t, i) => expand(t, SPECS[i]));
  const minutes = [...mi].sort((a, b) => a - b);
  const hours = [...ho].sort((a, b) => a - b);
  const domStar = tokens[2] === "*";
  const dowStar = tokens[4] === "*";
  const runs: Date[] = [];

  const g = (d: Date) =>
    utc
      ? {
          y: d.getUTCFullYear(),
          m: d.getUTCMonth(),
          d: d.getUTCDate(),
          w: d.getUTCDay(),
        }
      : { y: d.getFullYear(), m: d.getMonth(), d: d.getDate(), w: d.getDay() };
  const make = (y: number, m: number, d: number, h: number, min: number) =>
    utc ? new Date(Date.UTC(y, m, d, h, min)) : new Date(y, m, d, h, min);

  const start = g(from);
  // Walk day by day, up to about 30 years, so Feb 29 schedules still list five runs.
  for (let i = 0; i < 366 * 30 && runs.length < count; i += 1) {
    const day = g(make(start.y, start.m, start.d + i, 12, 0));
    if (!mo.has(day.m + 1)) continue;
    const domOk = dm.has(day.d);
    const dowOk = dw.has(day.w);
    // Vixie cron: when both fields are restricted, either one matching is enough.
    const dayOk =
      domStar && dowStar
        ? true
        : domStar
          ? dowOk
          : dowStar
            ? domOk
            : domOk || dowOk;
    if (!dayOk) continue;
    for (const h of hours) {
      for (const m of minutes) {
        const t = make(day.y, day.m, day.d, h, m);
        // Skip times a DST jump does not have, and anything not in the future.
        const back = g(t);
        if (back.d !== day.d) continue;
        if ((utc ? t.getUTCHours() : t.getHours()) !== h) continue;
        if (t.getTime() <= from.getTime()) continue;
        runs.push(t);
        if (runs.length >= count) return runs;
      }
    }
  }
  return runs;
}

/* ── Laravel scheduler ─────────────────────────────────── */

const EVERY_MINUTES: Record<string, string> = {
  "2": "everyTwoMinutes()",
  "3": "everyThreeMinutes()",
  "4": "everyFourMinutes()",
  "5": "everyFiveMinutes()",
  "10": "everyTenMinutes()",
  "15": "everyFifteenMinutes()",
  "30": "everyThirtyMinutes()",
};
const EVERY_HOURS: Record<string, string> = {
  "2": "everyTwoHours()",
  "3": "everyThreeHours()",
  "4": "everyFourHours()",
  "6": "everySixHours()",
};
const DOW_CONST = [
  "Schedule::SUNDAY",
  "Schedule::MONDAY",
  "Schedule::TUESDAY",
  "Schedule::WEDNESDAY",
  "Schedule::THURSDAY",
  "Schedule::FRIDAY",
  "Schedule::SATURDAY",
];

const isNum = (v: string) => /^\d+$/.test(v);
const hhmm = (h: string, m: string) =>
  `'${h.padStart(2, "0")}:${m.padStart(2, "0")}'`;

/** The fluent Laravel frequency for a 5-field expression. */
function laravelFor(tokens: string[]): string {
  const [mi, ho, dm, mo, dwRaw] = tokens;
  const dw = dwRaw === "7" ? "0" : dwRaw;
  const allDays = dm === "*" && mo === "*" && dw === "*";
  const at = isNum(mi) && isNum(ho) ? hhmm(ho, mi) : "";

  if (allDays) {
    if (mi === "*" && ho === "*") return "everyMinute()";
    const step = mi.match(/^\*\/(\d+)$/);
    if (step && ho === "*" && EVERY_MINUTES[step[1]])
      return EVERY_MINUTES[step[1]];
    if (mi === "0" && ho === "*") return "hourly()";
    if (isNum(mi) && ho === "*") return `hourlyAt(${mi})`;
    const hstep = ho.match(/^\*\/(\d+)$/);
    if (mi === "0" && hstep && EVERY_HOURS[hstep[1]])
      return EVERY_HOURS[hstep[1]];
    if (mi === "0" && ho === "0") return "daily()";
    if (at) return `dailyAt(${at})`;
    const two = ho.match(/^(\d+),(\d+)$/);
    if (isNum(mi) && two)
      return mi === "0"
        ? `twiceDaily(${two[1]}, ${two[2]})`
        : `twiceDailyAt(${two[1]}, ${two[2]}, ${mi})`;
  }
  if (at && dm === "*" && mo === "*") {
    if (dw === "1-5") return `weekdays()->at(${at})`;
    if (dw === "0,6" || dw === "6,0") return `weekends()->at(${at})`;
    if (isNum(dw)) {
      if (dw === "0" && at === "'00:00'") return "weekly()";
      return `weeklyOn(${DOW_CONST[Number(dw)] ?? dw}, ${at})`;
    }
  }
  if (at && isNum(dm) && mo === "*" && dw === "*") {
    if (dm === "1" && at === "'00:00'") return "monthly()";
    return `monthlyOn(${dm}, ${at})`;
  }
  if (at && isNum(dm) && isNum(mo) && dw === "*") {
    if (dm === "1" && mo === "1" && at === "'00:00'") return "yearly()";
    return `yearlyOn(${mo}, ${dm}, ${at})`;
  }
  return `cron('${tokens.join(" ")}')`;
}

function resolve(raw: string): { tokens: string[] | null; reboot: boolean } {
  const v = raw.trim().toLowerCase();
  if (v === "@reboot") return { tokens: null, reboot: true };
  const expr = SHORTCUTS[v] ?? raw.trim();
  const tokens = expr.split(/\s+/);
  return {
    tokens: tokens.length === 5 ? normaliseNames(tokens) : null,
    reboot: false,
  };
}

function init(): void {
  const root = document.getElementById("cron-root");
  const input = document.getElementById(
    "cron-input",
  ) as HTMLInputElement | null;
  if (!root || !input || root.dataset.bound === "1") return;
  root.dataset.bound = "1";

  const summaryEl = document.getElementById("cron-summary");
  const fieldsEl = document.getElementById("cron-fields");
  const runsEl = document.getElementById("cron-runs");
  const laravelEl = document.getElementById("cron-laravel");
  const tzSel = document.getElementById("cron-tz") as HTMLSelectElement | null;
  const shareBtn = document.getElementById("cron-share");
  const shareStatus = document.getElementById("cron-share-status");

  const localZone = Intl.DateTimeFormat().resolvedOptions().timeZone || "local";
  const localOpt = tzSel?.querySelector<HTMLOptionElement>(
    'option[value="local"]',
  );
  if (localOpt) localOpt.textContent = `Your time zone (${localZone})`;

  const fmtLocal = new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
  const fmtUtc = new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
  });

  function render(): void {
    const raw = input!.value;
    const { tokens, reboot } = resolve(raw);
    const expanded = SHORTCUTS[raw.trim().toLowerCase()];
    const r = reboot
      ? {
          ok: true,
          summary:
            "Runs once, when the cron daemon starts. That is not the same as when the machine boots.",
          fields: [],
        }
      : explain(tokens ? tokens.join(" ") : raw);
    if (summaryEl)
      summaryEl.textContent =
        expanded && r.ok
          ? `${r.summary} (${raw.trim()} is ${expanded})`
          : r.summary;
    if (fieldsEl) {
      fieldsEl.replaceChildren();
      for (const f of r.fields) {
        const li = document.createElement("li");
        li.className = "flex gap-3";
        const code = document.createElement("code");
        code.className = "font-mono font-bold shrink-0 w-16 break-all";
        code.textContent = f.value;
        const span = document.createElement("span");
        span.className = "min-w-0 opacity-90";
        span.textContent = `${f.name}: ${f.desc}`;
        li.append(code, span);
        fieldsEl.appendChild(li);
      }
    }

    if (runsEl) {
      runsEl.replaceChildren();
      const utc = tzSel?.value === "utc";
      if (r.ok && tokens && !reboot) {
        const runs = nextRuns(tokens, new Date(), 5, utc);
        if (runs.length === 0) {
          const li = document.createElement("li");
          li.textContent =
            "No run in the next 30 years. Check the day and month fields.";
          runsEl.appendChild(li);
        }
        for (const t of runs) {
          const li = document.createElement("li");
          li.className = "flex flex-wrap justify-between gap-x-3";
          const main = document.createElement("span");
          main.className = "font-mono font-bold";
          main.textContent = utc
            ? `${fmtUtc.format(t)} UTC`
            : fmtLocal.format(t);
          const alt = document.createElement("span");
          alt.className = "font-mono text-xs opacity-75";
          alt.textContent = utc
            ? `${fmtLocal.format(t)} your time`
            : `${fmtUtc.format(t)} UTC`;
          li.append(main, alt);
          runsEl.appendChild(li);
        }
      } else {
        const li = document.createElement("li");
        li.className = "opacity-80";
        li.textContent = reboot
          ? "No fixed times. It runs whenever the daemon restarts."
          : "Fix the expression to see run times.";
        runsEl.appendChild(li);
      }
    }

    if (laravelEl) {
      laravelEl.textContent =
        r.ok && tokens && !reboot
          ? `Schedule::command('app:your-command')->${laravelFor(tokens)};`
          : reboot
            ? "// Laravel has no @reboot. Run the command from your process manager instead."
            : "-";
    }

    const url = new URL(window.location.href);
    if (raw.trim()) url.searchParams.set("cron", raw.trim());
    else url.searchParams.delete("cron");
    window.history.replaceState(window.history.state, "", url);
  }

  const fromUrl = new URLSearchParams(window.location.search).get("cron");
  if (fromUrl) input.value = fromUrl;

  input.addEventListener("input", () => {
    if (shareStatus) shareStatus.textContent = "";
    render();
  });
  tzSel?.addEventListener("change", render);
  root
    .querySelectorAll<HTMLButtonElement>("[data-cron-preset]")
    .forEach((btn) => {
      btn.addEventListener("click", () => {
        input.value = btn.dataset.cronPreset ?? "";
        render();
      });
    });
  shareBtn?.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      if (shareStatus) shareStatus.textContent = "Link copied";
    } catch {
      if (shareStatus) shareStatus.textContent = "Link is in the address bar";
    }
  });
  render();
}

init();
document.addEventListener("astro:after-swap", init);

export {};
