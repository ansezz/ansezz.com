// Client-side 5-field cron explainer. Describes each field in plain English.
// Supports *, */n, ranges a-b, and lists a,b,c.

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

function init(): void {
  const root = document.getElementById("cron-root");
  const input = document.getElementById(
    "cron-input",
  ) as HTMLInputElement | null;
  if (!root || !input || root.dataset.bound === "1") return;
  root.dataset.bound = "1";

  const summaryEl = document.getElementById("cron-summary");
  const fieldsEl = document.getElementById("cron-fields");

  function render(): void {
    const r = explain(input!.value);
    if (summaryEl) summaryEl.textContent = r.summary;
    if (!fieldsEl) return;
    fieldsEl.replaceChildren();
    for (const f of r.fields) {
      const li = document.createElement("li");
      li.className = "flex gap-3";
      const code = document.createElement("code");
      code.className = "font-mono font-bold shrink-0 w-16";
      code.textContent = f.value;
      const span = document.createElement("span");
      span.className = "opacity-90";
      span.textContent = `${f.name}: ${f.desc}`;
      li.append(code, span);
      fieldsEl.appendChild(li);
    }
  }

  input.addEventListener("input", render);
  root
    .querySelectorAll<HTMLButtonElement>("[data-cron-preset]")
    .forEach((btn) => {
      btn.addEventListener("click", () => {
        input.value = btn.dataset.cronPreset ?? "";
        render();
      });
    });
  render();
}

init();
document.addEventListener("astro:after-swap", init);

export {};
