// Context window checker. Estimates prompt tokens (~4 chars/token blended with
// a word count, same heuristic as the token counter), sums the four prompt
// parts, subtracts an output reserve, and grades every model window as
// fits / tight / overflow. Pure arithmetic, no network.

type Mode = "compose" | "count";
type Status = "fits" | "tight" | "overflow";

// A window is "tight" once the prompt alone passes this share of it — the zone
// where recall starts sagging even though the request is still legal.
const TIGHT_RATIO = 0.75;
// …or once the leftover headroom drops below this share of the window.
const SLACK_RATIO = 0.1;
// Nothing sane goes past this; keeps formatting and bar maths bounded.
const MAX_TOKENS = 1_000_000_000;

const PARTS = [
  { id: "system", label: "System prompt" },
  { id: "context", label: "Retrieved context" },
  { id: "history", label: "Chat history" },
  { id: "user", label: "User turn" },
] as const;

const STATUS_BASE =
  "mono inline-block rounded-full border-[2px] border-ink px-2.5 py-1 text-[10px] font-bold tracking-widest whitespace-nowrap uppercase";
const STATUS_CLASS: Record<Status, string> = {
  fits: `${STATUS_BASE} bg-green`,
  tight: `${STATUS_BASE} bg-yellow`,
  overflow: `${STATUS_BASE} bg-red`,
};
const STATUS_LABEL: Record<Status, string> = {
  fits: "Fits",
  tight: "Tight",
  overflow: "Overflow",
};

const FILL_OK = "bg-pink h-full";
const FILL_OVER = "bg-red h-full";

const MODE_BASE =
  "mono border-ink rounded-full border-[2px] px-3 py-1 text-[10px] font-bold tracking-widest uppercase transition-all";
const MODE_ON = `${MODE_BASE} bg-ink text-paper shadow-neo-xs`;
const MODE_OFF = `${MODE_BASE} bg-bg-alt shadow-neo-xs hover:bg-yellow hover:shadow-neo-sm hover:-translate-x-0.5 hover:-translate-y-0.5`;

const COPY_LABEL = "Copy the breakdown";

// ---------------------------------------------------------------- estimation

function estimateTokens(text: string): number {
  if (!text) return 0;
  const words = (text.trim().match(/\S+/g) ?? []).length;
  const byChars = text.length / 4;
  const byWords = words * 1.33;
  // Lean on characters — handles code, JSON, and punctuation far better.
  return Math.round(byChars * 0.7 + byWords * 0.3);
}

function grade(used: number, reserve: number, windowSize: number): Status {
  const slack = windowSize - used - reserve;
  if (slack < 0) return "overflow";
  if (used / windowSize >= TIGHT_RATIO) return "tight";
  if (slack < windowSize * SLACK_RATIO) return "tight";
  return "fits";
}

// ---------------------------------------------------------------- formatting

function fmt(n: number): string {
  if (!Number.isFinite(n)) return "—";
  return Math.round(n).toLocaleString("en-US");
}

function pctText(x: number): string {
  if (!Number.isFinite(x) || x <= 0) return "0%";
  if (x < 1) return "<1%";
  if (x >= 1000) return "999%+";
  return `${Math.round(x)}%`;
}

function clampPct(x: number): number {
  if (!Number.isFinite(x) || x <= 0) return 0;
  return Math.min(100, x);
}

// ------------------------------------------------------------------ DOM refs

interface PartRef {
  label: string;
  area: HTMLTextAreaElement;
  count: HTMLElement | null;
  segment: HTMLElement | null;
}

interface RowRef {
  label: string;
  windowSize: number;
  used: HTMLElement | null;
  fill: HTMLElement | null;
  reserveBar: HTMLElement | null;
  pct: HTMLElement | null;
  left: HTMLElement | null;
  status: HTMLElement | null;
  note: HTMLElement | null;
}

interface RowsResult {
  fitting: number;
  lines: string[];
}

function el(id: string): HTMLElement | null {
  return document.getElementById(id);
}

function collectParts(root: HTMLElement): PartRef[] {
  const refs: PartRef[] = [];
  for (const part of PARTS) {
    const area = el(`context-window-checker-part-${part.id}`);
    if (!(area instanceof HTMLTextAreaElement)) continue;
    refs.push({
      label: part.label,
      area,
      count: el(`context-window-checker-count-${part.id}`),
      segment: root.querySelector<HTMLElement>(`[data-cw-split="${part.id}"]`),
    });
  }
  return refs;
}

function collectRows(root: HTMLElement): RowRef[] {
  const rows: RowRef[] = [];
  root.querySelectorAll<HTMLElement>("[data-cw-row]").forEach((row) => {
    const windowSize = Number(row.dataset.cwWindow);
    if (!Number.isFinite(windowSize) || windowSize <= 0) return;
    rows.push({
      label: row.dataset.cwLabel ?? "Model",
      windowSize,
      used: row.querySelector<HTMLElement>("[data-cw-used]"),
      fill: row.querySelector<HTMLElement>("[data-cw-fill]"),
      reserveBar: row.querySelector<HTMLElement>("[data-cw-reserve-bar]"),
      pct: row.querySelector<HTMLElement>("[data-cw-pct]"),
      left: row.querySelector<HTMLElement>("[data-cw-left]"),
      status: row.querySelector<HTMLElement>("[data-cw-status]"),
      note: row.querySelector<HTMLElement>("[data-cw-note]"),
    });
  });
  return rows;
}

// Reads a non-negative integer field. Returns the clamped value plus a message
// when the raw input had to be corrected, so callers can surface it.
function readCount(
  input: HTMLInputElement,
  fieldName: string,
): { value: number; message: string | null } {
  const raw = input.value.trim();
  if (raw === "") return { value: 0, message: null };

  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) {
    return { value: 0, message: `${fieldName} isn't a number — using 0.` };
  }
  if (parsed < 0) {
    return { value: 0, message: `${fieldName} can't be negative — using 0.` };
  }
  if (parsed > MAX_TOKENS) {
    return {
      value: MAX_TOKENS,
      message: `${fieldName} capped at ${fmt(MAX_TOKENS)} — no model takes more.`,
    };
  }
  return { value: Math.round(parsed), message: null };
}

interface Controls {
  reserveInput: HTMLInputElement;
  tokensInput: HTMLInputElement;
  composePane: HTMLElement;
  countPane: HTMLElement;
}

// Returns the always-required controls only when every one is present and the
// right kind of element, so callers never have to re-check for null.
function readControls(): Controls | null {
  const reserveInput = el("context-window-checker-reserve");
  const tokensInput = el("context-window-checker-tokens");
  const composePane = el("context-window-checker-compose");
  const countPane = el("context-window-checker-count-pane");

  if (
    !(reserveInput instanceof HTMLInputElement) ||
    !(tokensInput instanceof HTMLInputElement) ||
    !composePane ||
    !countPane
  ) {
    return null;
  }

  return { reserveInput, tokensInput, composePane, countPane };
}

// ----------------------------------------------------------------- init

function init(): void {
  const root = el("context-window-checker-root");
  if (!root || root.dataset.bound === "1") return;

  const controls = readControls();
  if (!controls) return;
  const { reserveInput, tokensInput, composePane, countPane } = controls;

  const parts = collectParts(root);
  const rows = collectRows(root);
  if (parts.length === 0 || rows.length === 0) return;

  root.dataset.bound = "1";
  const modeButtons =
    root.querySelectorAll<HTMLButtonElement>("[data-cw-mode]");

  const totalEl = el("context-window-checker-total");
  const reservedEl = el("context-window-checker-reserved");
  const neededEl = el("context-window-checker-needed");
  const charsEl = el("context-window-checker-chars");
  const fitCountEl = el("context-window-checker-fitcount");
  const legendEl = el("context-window-checker-split-legend");
  const errorEl = el("context-window-checker-error");
  const errorTextEl = el("context-window-checker-error-text");
  const copyBtn = el("context-window-checker-copy");
  const copyLabelEl = el("context-window-checker-copy-label");
  const clearBtn = el("context-window-checker-clear");

  let mode: Mode = "compose";
  let summary = "";
  let copyResetTimer = 0;

  const setText = (node: HTMLElement | null, value: string): void => {
    if (node) node.textContent = value;
  };

  function setMode(next: Mode): void {
    mode = next;
    composePane.hidden = next !== "compose";
    countPane.hidden = next !== "count";
    modeButtons.forEach((btn) => {
      const on = btn.dataset.cwMode === next;
      btn.className = on ? MODE_ON : MODE_OFF;
      btn.setAttribute("aria-pressed", on ? "true" : "false");
    });
    render();
  }

  function renderSplit(counts: number[], total: number): void {
    const pieces: string[] = [];
    parts.forEach((part, i) => {
      const value = counts[i] ?? 0;
      const share = total > 0 ? (value / total) * 100 : 0;
      if (part.segment) part.segment.style.width = `${share.toFixed(2)}%`;
      if (share >= 0.5) {
        pieces.push(`${part.label} ${Math.round(share)}%`);
      }
    });
    setText(
      legendEl,
      total > 0 && pieces.length > 0
        ? pieces.join(" · ")
        : "Nothing pasted yet.",
    );
  }

  function renderRows(used: number, reserve: number): RowsResult {
    let fitting = 0;
    const lines: string[] = [];

    for (const row of rows) {
      const status = grade(used, reserve, row.windowSize);
      if (status === "fits") fitting += 1;

      const usedPct = (used / row.windowSize) * 100;
      const fillPct = clampPct(usedPct);
      const reservePct = Math.min(
        100 - fillPct,
        clampPct((reserve / row.windowSize) * 100),
      );
      const left = row.windowSize - used - reserve;

      setText(row.used, fmt(used));
      setText(row.pct, pctText(usedPct));
      setText(row.left, fmt(left));
      if (row.fill) {
        row.fill.style.width = `${fillPct.toFixed(2)}%`;
        row.fill.className = status === "overflow" ? FILL_OVER : FILL_OK;
      }
      if (row.reserveBar) {
        row.reserveBar.style.width = `${reservePct.toFixed(2)}%`;
      }
      if (row.status) {
        row.status.textContent = STATUS_LABEL[status];
        row.status.className = STATUS_CLASS[status];
      }

      // Say which rule fired — "past 75%" and "barely any slack" are different
      // problems with different fixes.
      let note = "";
      if (status === "overflow") {
        note =
          used > row.windowSize
            ? `prompt over by ${fmt(used - row.windowSize)}`
            : "no room for the reply";
      } else if (status === "tight") {
        note =
          used / row.windowSize >= TIGHT_RATIO
            ? `past ${Math.round(TIGHT_RATIO * 100)}% of the window`
            : `only ${fmt(left)} spare`;
      }
      setText(row.note, note);

      lines.push(
        `${row.label.padEnd(26)} ${fmt(row.windowSize).padStart(9)}  ` +
          `${pctText(usedPct).padStart(6)} used  ` +
          `${fmt(left).padStart(11)} left  ${STATUS_LABEL[status].toUpperCase()}` +
          (note ? ` (${note})` : ""),
      );
    }

    return { fitting, lines };
  }

  function render(): void {
    const messages: string[] = [];

    const reserveRead = readCount(reserveInput, "Output reserve");
    if (reserveRead.message) messages.push(reserveRead.message);
    const reserve = reserveRead.value;

    let used = 0;
    let chars = 0;
    let partSummary = "";

    if (mode === "compose") {
      const counts = parts.map((part) => {
        const text = part.area.value;
        chars += text.length;
        const tokens = estimateTokens(text);
        setText(part.count, `${fmt(tokens)} tok`);
        return tokens;
      });
      used = counts.reduce((sum, n) => sum + n, 0);
      if (used > MAX_TOKENS) {
        used = MAX_TOKENS;
        messages.push(`Prompt capped at ${fmt(MAX_TOKENS)} tokens.`);
      }
      renderSplit(counts, used);
      partSummary = parts
        .map((part, i) => `${part.label.toLowerCase()} ${fmt(counts[i] ?? 0)}`)
        .join(" · ");
      setText(charsEl, fmt(chars));
    } else {
      const tokensRead = readCount(tokensInput, "Prompt tokens");
      if (tokensRead.message) messages.push(tokensRead.message);
      used = tokensRead.value;
      setText(charsEl, "—");
    }

    setText(totalEl, fmt(used));
    setText(reservedEl, fmt(reserve));
    setText(neededEl, fmt(used + reserve));

    const { fitting, lines } = renderRows(used, reserve);
    setText(fitCountEl, `${fitting} of ${rows.length}`);

    summary = [
      `Prompt: ${fmt(used)} tokens (est.)`,
      ...(partSummary ? [`  ${partSummary}`] : []),
      `Reserved for output: ${fmt(reserve)} tokens`,
      `Window needed: ${fmt(used + reserve)} tokens`,
      "",
      ...lines,
      "",
      "Estimated at ansezz.com/tools/context-window-checker/",
    ].join("\n");

    if (errorEl) errorEl.hidden = messages.length === 0;
    setText(errorTextEl, messages[0] ?? "");
  }

  function flashCopyLabel(text: string): void {
    if (!copyLabelEl) return;
    copyLabelEl.textContent = text;
    window.clearTimeout(copyResetTimer);
    copyResetTimer = window.setTimeout(() => {
      copyLabelEl.textContent = COPY_LABEL;
    }, 1500);
  }

  for (const part of parts) {
    part.area.addEventListener("input", render);
  }
  reserveInput.addEventListener("input", render);
  tokensInput.addEventListener("input", render);

  modeButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const next = btn.dataset.cwMode;
      if (next === "compose" || next === "count") setMode(next);
    });
  });

  root
    .querySelectorAll<HTMLButtonElement>("[data-cw-preset]")
    .forEach((btn) => {
      btn.addEventListener("click", () => {
        const value = btn.dataset.cwPreset;
        if (!value) return;
        tokensInput.value = value;
        setMode("count");
      });
    });

  clearBtn?.addEventListener("click", () => {
    for (const part of parts) part.area.value = "";
    render();
  });

  copyBtn?.addEventListener("click", async () => {
    if (!summary) return;
    try {
      await navigator.clipboard.writeText(summary);
      flashCopyLabel("Copied!");
    } catch {
      flashCopyLabel("Copy blocked");
    }
  });

  setMode("compose");
}

init();
document.addEventListener("astro:after-swap", init);

export {};
