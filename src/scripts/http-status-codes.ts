// Live filter for the HTTP status code reference. Every row is indexed once at
// init from its visible text plus a hidden data-status-keywords synonym list;
// a query is split on whitespace and a row survives only when every token
// appears somewhere in that index. Nothing else on the page is scripted.

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

function tokenize(query: string): string[] {
  const normalized = normalize(query);
  return normalized === "" ? [] : normalized.split(" ");
}

function isMatch(haystack: string, tokens: readonly string[]): boolean {
  return tokens.every((token) => haystack.includes(token));
}

function setHidden(el: HTMLElement, hidden: boolean): void {
  if (el.hidden !== hidden) el.hidden = hidden;
}

function init(): void {
  const root = document.getElementById("http-status-root");
  if (!root || root.dataset.bound === "1") return;
  root.dataset.bound = "1";

  const inputNode = document.getElementById("http-status-input");
  if (!(inputNode instanceof HTMLInputElement)) return;
  // Declared type, not the narrowed one — the closures below need it.
  const input: HTMLInputElement = inputNode;

  const controls = document.getElementById("http-status-controls");
  const countEl = document.getElementById("http-status-count");
  const emptyEl = document.getElementById("http-status-empty");
  const termEl = document.getElementById("http-status-term");
  const clearBtn = document.getElementById("http-status-clear");

  const groups: IndexedGroup[] = Array.from(
    root.querySelectorAll<HTMLElement>("[data-status-group]"),
  ).map((groupEl) => ({
    el: groupEl,
    rows: Array.from(
      groupEl.querySelectorAll<HTMLTableRowElement>("tr[data-status-row]"),
    ).map((rowEl) => ({
      el: rowEl,
      haystack: normalize(
        `${rowEl.textContent ?? ""} ${rowEl.dataset.statusKeywords ?? ""}`,
      ),
    })),
  }));

  const total = groups.reduce((sum, group) => sum + group.rows.length, 0);
  if (total === 0) return;

  // Progressive enhancement: the box ships hidden so a visitor without this
  // script never sees an input that does nothing.
  if (controls) setHidden(controls, false);

  function apply(): void {
    const query = input.value;
    const tokens = tokenize(query);
    const filtering = tokens.length > 0;
    let shown = 0;

    for (const group of groups) {
      let groupShown = 0;
      for (const row of group.rows) {
        const visible = !filtering || isMatch(row.haystack, tokens);
        setHidden(row.el, !visible);
        if (visible) groupShown += 1;
      }
      setHidden(group.el, groupShown === 0);
      shown += groupShown;
    }

    const term = query.trim();
    if (countEl) {
      if (!filtering) {
        countEl.textContent = `Showing all ${total} status codes.`;
      } else if (shown === 0) {
        countEl.textContent = `No status code matches “${term}”.`;
      } else {
        countEl.textContent = `${shown} of ${total} status codes match “${term}”.`;
      }
    }
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

  // A restored value (bfcache, back navigation) has to be honoured on load.
  apply();
}

init();
document.addEventListener("astro:after-swap", init);

export {};
