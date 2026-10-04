// pgvector size calculator. All maths lives in @/lib/pgvector-size; this file
// only reads the form, renders the result and keeps the URL in sync.

import { bindUrlState } from "@/lib/url-state";
import {
  INDEX_DIM_LIMIT,
  STORE_DIM_LIMIT,
  datumBytes,
  estimatePgvector,
  prettySize,
  suggestedLists,
  suggestedProbes,
  type IndexType,
  type VectorType,
} from "@/lib/pgvector-size";

const P = "pgvector-calculator-";

const num = (el: HTMLInputElement, fallback: number): number => {
  const v = Number(el.value);
  return el.value.trim() === "" || !Number.isFinite(v) ? fallback : v;
};

const fmtInt = (n: number): string => Math.round(n).toLocaleString("en-US");

function init(): void {
  const root = document.getElementById(`${P}root`);
  if (!root || root.dataset.bound === "1") return;
  root.dataset.bound = "1";

  const $ = <T extends HTMLElement>(id: string): T =>
    document.getElementById(P + id) as T;

  const rows = $<HTMLInputElement>("rows");
  const dims = $<HTMLInputElement>("dims");
  const type = $<HTMLSelectElement>("type");
  const index = $<HTMLSelectElement>("index");
  const m = $<HTMLInputElement>("m");
  const lists = $<HTMLInputElement>("lists");
  const extra = $<HTMLInputElement>("extra");
  const hnswOpts = $<HTMLElement>("hnsw-opts");
  const ivfOpts = $<HTMLElement>("ivf-opts");
  const suggestBtn = $<HTMLButtonElement>("suggest");
  const suggestText = $<HTMLElement>("suggest-text");
  const outTable = $<HTMLElement>("out-table");
  const outIndex = $<HTMLElement>("out-index");
  const outTotal = $<HTMLElement>("out-total");
  const outRam = $<HTMLElement>("out-ram");
  const outBuild = $<HTMLElement>("out-build");
  const warn = $<HTMLElement>("warn");
  const details = $<HTMLElement>("details");

  function detail(label: string, value: string): string {
    return `<div class="flex flex-wrap justify-between gap-x-3"><dt>${label}</dt><dd class="font-mono font-bold">${value}</dd></div>`;
  }

  function render(): void {
    const t = type.value as VectorType;
    const idx = index.value as IndexType;
    const r = Math.max(0, Math.floor(num(rows, 0)));
    const d = Math.min(
      STORE_DIM_LIMIT[t],
      Math.max(1, Math.floor(num(dims, 1))),
    );

    hnswOpts.hidden = idx !== "hnsw";
    ivfOpts.hidden = idx !== "ivfflat";
    const sl = suggestedLists(r);
    suggestText.textContent = `Suggested for ${fmtInt(r)} rows: ${fmtInt(sl)} lists, probes ${fmtInt(suggestedProbes(sl))}`;

    const e = estimatePgvector({
      rows: r,
      dims: d,
      type: t,
      index: idx,
      m: num(m, 16),
      lists: num(lists, sl),
      extraBytes: Math.max(0, num(extra, 0)),
    });

    outTable.textContent = prettySize(e.tableBytes);
    outIndex.textContent = idx === "none" ? "None" : prettySize(e.indexBytes);
    outTotal.textContent = prettySize(e.totalBytes);
    outRam.textContent = idx === "none" ? "n/a" : prettySize(e.ramIndex);
    outBuild.textContent = idx === "none" ? "n/a" : prettySize(e.buildBytes);

    const warnings: string[] = [];
    if (num(dims, 1) > STORE_DIM_LIMIT[t])
      warnings.push(
        `A ${t} column stores at most ${fmtInt(STORE_DIM_LIMIT[t])} dimensions.`,
      );
    if (idx !== "none" && !e.indexable)
      warnings.push(
        `pgvector can index ${t} up to ${fmtInt(INDEX_DIM_LIMIT[t])} dimensions. Use halfvec, fewer dimensions, or no index.`,
      );
    if (idx === "ivfflat" && num(lists, sl) > Math.max(1, r))
      warnings.push("More lists than rows. Most lists will be empty.");
    warn.hidden = warnings.length === 0;
    warn.textContent = warnings.join(" ");

    const tb = e.table;
    const lines = [
      detail("One vector value", `${fmtInt(datumBytes(t, d))} bytes`),
      detail(
        "Vector stored",
        tb.toasted ? "Out of line, in TOAST" : "Inline in the row",
      ),
      detail("Heap row incl. pointer", `${fmtInt(tb.rowBytes)} bytes`),
      detail("Rows per 8 KB page", fmtInt(tb.rowsPerPage)),
      detail("Heap", prettySize(tb.heap)),
      detail("TOAST + its index", prettySize(tb.toast + tb.toastIndex)),
      detail("Primary key index", prettySize(tb.pkIndex)),
    ];
    if (e.hnsw) {
      lines.push(
        detail("HNSW element tuple", `${fmtInt(e.hnsw.elementTuple)} bytes`),
        detail(
          "HNSW neighbor tuple (level 0)",
          `${fmtInt(e.hnsw.neighborTuple)} bytes`,
        ),
        detail("HNSW bytes per row", fmtInt(e.hnsw.bytesPerRow)),
        detail("Build memory, parallel", prettySize(e.hnsw.buildParallel)),
      );
    }
    if (e.ivfflat) {
      lines.push(
        detail("IVFFlat bytes per row", fmtInt(e.ivfflat.bytesPerRow)),
        detail("k-means sample rows", fmtInt(e.ivfflat.samples)),
      );
    }
    details.innerHTML = lines.join("");
  }

  for (const el of [rows, dims, type, index, m, lists, extra]) {
    el.addEventListener("input", render);
    el.addEventListener("change", render);
  }

  root.querySelectorAll<HTMLButtonElement>("[data-dims]").forEach((btn) => {
    btn.addEventListener("click", () => {
      dims.value = btn.dataset.dims ?? dims.value;
      render();
    });
  });

  suggestBtn.addEventListener("click", () => {
    lists.value = String(suggestedLists(Math.max(0, Math.floor(num(rows, 0)))));
    render();
  });

  render();
}

init();
document.addEventListener("astro:after-swap", init);
bindUrlState("pgvector-calculator-root");
