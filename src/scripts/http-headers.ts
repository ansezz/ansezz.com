// Live filter for the HTTP headers reference. Every row is indexed once at init
// from its visible text plus a hidden data-header-keywords synonym list; a query
// is split on whitespace and a row survives only when every token appears in that
// index. Tables with no surviving rows collapse, then sections with no surviving
// tables, and the explanatory prose steps aside while a filter is active.
// Nothing else on the page is scripted.

interface IndexedRow {
  readonly el: HTMLTableRowElement;
  readonly haystack: string;
}

interface IndexedTable {
  readonly el: HTMLElement;
  readonly rows: readonly IndexedRow[];
}

interface IndexedGroup {
  readonly el: HTMLElement;
  readonly tables: readonly IndexedTable[];
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
  const root = document.getElementById("http-headers-root");
  if (!root || root.dataset.bound === "1") return;
  root.dataset.bound = "1";

  const inputNode = document.getElementById("http-headers-input");
  if (!(inputNode instanceof HTMLInputElement)) return;
  // Declared type, not the narrowed one — the closures below need it.
  const input: HTMLInputElement = inputNode;

  const controls = document.getElementById("http-headers-controls");
  const countEl = document.getElementById("http-headers-count");
  const emptyEl = document.getElementById("http-headers-empty");
  const termEl = document.getElementById("http-headers-term");
  const clearBtn = document.getElementById("http-headers-clear");

  const groups: IndexedGroup[] = Array.from(
    root.querySelectorAll<HTMLElement>("[data-header-group]"),
  ).map((groupEl) => ({
    el: groupEl,
    tables: Array.from(
      groupEl.querySelectorAll<HTMLElement>("[data-header-table]"),
    ).map((tableEl) => ({
      el: tableEl,
      rows: Array.from(
        tableEl.querySelectorAll<HTMLTableRowElement>("tr[data-header-row]"),
      ).map((rowEl) => ({
        el: rowEl,
        haystack: normalize(
          `${rowEl.textContent ?? ""} ${rowEl.dataset.headerKeywords ?? ""}`,
        ),
      })),
    })),
  }));

  const prose = Array.from(
    root.querySelectorAll<HTMLElement>("[data-header-prose]"),
  );

  const total = groups.reduce(
    (sum, group) =>
      sum + group.tables.reduce((n, table) => n + table.rows.length, 0),
    0,
  );
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
      for (const table of group.tables) {
        let tableShown = 0;
        for (const row of table.rows) {
          const visible = !filtering || isMatch(row.haystack, tokens);
          setHidden(row.el, !visible);
          if (visible) tableShown += 1;
        }
        setHidden(table.el, tableShown === 0);
        groupShown += tableShown;
      }
      setHidden(group.el, groupShown === 0);
      shown += groupShown;
    }

    // The prose is context, not results — it only gets in the way mid-search.
    for (const el of prose) setHidden(el, filtering);

    const term = query.trim();
    if (countEl) {
      if (!filtering) {
        countEl.textContent = `Showing all ${total} entries.`;
      } else if (shown === 0) {
        countEl.textContent = `No entry matches “${term}”.`;
      } else {
        countEl.textContent = `${shown} of ${total} entries match “${term}”.`;
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
