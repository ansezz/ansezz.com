// Live filter for the ports reference. Each row is indexed once at init from its
// own cell text plus a hidden synonym list; the query is split into tokens and a
// row survives only when every token appears somewhere in that index. Empty
// groups collapse with their rows. Nothing else on the page is scripted.

interface IndexedRow {
  readonly el: HTMLTableRowElement;
  readonly haystack: string;
}

interface IndexedGroup {
  readonly el: HTMLElement;
  readonly rows: readonly IndexedRow[];
}

function normalize(value: string): string {
  return value.replace(/\s+/g, " ").trim().toLowerCase();
}

/** " :5432, Redis " -> ["5432", "redis"] — people paste ports with a colon. */
function tokenize(query: string): string[] {
  return normalize(query)
    .split(/[\s,]+/)
    .map((token) => token.replace(/^:+/, ""))
    .filter((token) => token.length > 0);
}

function matches(haystack: string, tokens: readonly string[]): boolean {
  return tokens.every((token) => haystack.includes(token));
}

function setHidden(el: HTMLElement, hidden: boolean): void {
  if (el.hidden !== hidden) el.hidden = hidden;
}

function countLabel(shown: number, total: number, term: string): string {
  if (term === "") return `Showing all ${total} ports.`;
  if (shown === 0) return `No port matches “${term}”.`;
  if (shown === 1) return `1 of ${total} ports matches “${term}”.`;
  return `${shown} of ${total} ports match “${term}”.`;
}

function init(): void {
  const root = document.getElementById("common-ports-root");
  if (!root || root.dataset.bound === "1") return;
  root.dataset.bound = "1";

  const inputNode = document.getElementById("common-ports-input");
  if (!(inputNode instanceof HTMLInputElement)) return;
  // Keep the declared type — the closures below outlive the narrowing.
  const input: HTMLInputElement = inputNode;

  const controls = document.getElementById("common-ports-controls");
  const countEl = document.getElementById("common-ports-count");
  const emptyEl = document.getElementById("common-ports-empty");
  const termEl = document.getElementById("common-ports-term");
  const clearBtn = document.getElementById("common-ports-clear");

  const groups: IndexedGroup[] = Array.from(
    root.querySelectorAll<HTMLElement>("[data-port-group]"),
  ).map((groupEl) => ({
    el: groupEl,
    rows: Array.from(
      groupEl.querySelectorAll<HTMLTableRowElement>("tr[data-port-row]"),
    ).map((rowEl) => ({
      el: rowEl,
      haystack: normalize(
        `${rowEl.textContent ?? ""} ${rowEl.dataset.portKeywords ?? ""}`,
      ),
    })),
  }));

  const total = groups.reduce((sum, group) => sum + group.rows.length, 0);
  if (total === 0) return;

  // Progressive enhancement: the box ships hidden so a visitor without this
  // script never sees an input that does nothing.
  if (controls) setHidden(controls, false);

  function apply(): void {
    const tokens = tokenize(input.value);
    const filtering = tokens.length > 0;
    let shown = 0;

    for (const group of groups) {
      let groupShown = 0;
      for (const row of group.rows) {
        const visible = !filtering || matches(row.haystack, tokens);
        setHidden(row.el, !visible);
        if (visible) groupShown += 1;
      }
      setHidden(group.el, groupShown === 0);
      shown += groupShown;
    }

    const term = input.value.trim();
    if (countEl) countEl.textContent = countLabel(shown, total, term);
    if (termEl) termEl.textContent = term;
    if (emptyEl) setHidden(emptyEl, !filtering || shown > 0);
    if (clearBtn) setHidden(clearBtn, !filtering);
  }

  input.addEventListener("input", apply);

  input.addEventListener("keydown", (event) => {
    if (event.key !== "Escape" || input.value === "") return;
    event.preventDefault();
    input.value = "";
    apply();
  });

  clearBtn?.addEventListener("click", () => {
    input.value = "";
    apply();
    input.focus();
  });

  // A restored value (bfcache, back navigation, autofill) has to be honoured.
  apply();
}

init();
document.addEventListener("astro:after-swap", init);

export {};
