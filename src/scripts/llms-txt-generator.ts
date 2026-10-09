// llms.txt generator and validator. Building and checking live in
// @/lib/llms-txt; this file only wires the form. The form state goes into
// ?s= as base64url JSON so the address bar is always a share link. Pasted
// files in the validator never touch the URL.

import {
  buildLlmsTxt,
  sectionsFromUrls,
  validateLlmsTxt,
  type Issue,
  type LlmsInput,
  type LlmsSection,
  type ValidationResult,
} from "@/lib/llms-txt";
import { downloadText } from "@/lib/download";

const P = "llms-txt-generator-";
const MAX_URL = 6000;

const EXAMPLE: LlmsInput = {
  name: "Example Docs",
  summary:
    "Example Docs is the documentation for the Example API, a REST API for sending invoices. All endpoints use JSON and bearer tokens.",
  details:
    "Read the quick start first. Prices and limits are in the Plans page, not in the API reference.\n\n- The API is versioned by date, for example 2026-10-01\n- Sandbox keys start with test_",
  sections: [
    {
      name: "Docs",
      links: [
        {
          title: "Quick start",
          url: "https://docs.example.com/start.md",
          notes: "Create a key and send a first invoice in five minutes",
        },
        {
          title: "API reference",
          url: "https://docs.example.com/api.md",
          notes: "Every endpoint with request and response fields",
        },
      ],
    },
    {
      name: "Guides",
      links: [
        {
          title: "Webhooks",
          url: "https://docs.example.com/webhooks.md",
          notes: "Events, retries and signature checks",
        },
      ],
    },
    {
      name: "Optional",
      links: [
        {
          title: "Changelog",
          url: "https://docs.example.com/changelog.md",
          notes: "",
        },
      ],
    },
  ],
};

// ── URL state ─────────────────────────────────────────────
type Packed = [string, string, string, [string, [string, string, string][]][]];

function toB64Url(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromB64Url(s: string): string {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/");
  const pad = b64.length % 4 ? "=".repeat(4 - (b64.length % 4)) : "";
  const bin = atob(b64 + pad);
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}

export function pack(input: LlmsInput): string {
  const data: Packed = [
    input.name,
    input.summary,
    input.details,
    input.sections.map((s) => [
      s.name,
      s.links.map((l) => [l.title, l.url, l.notes]),
    ]),
  ];
  return toB64Url(JSON.stringify(data));
}

export function unpack(s: string): LlmsInput | null {
  try {
    const d = JSON.parse(fromB64Url(s)) as unknown;
    if (!Array.isArray(d) || d.length < 4) return null;
    const str = (v: unknown) => (typeof v === "string" ? v : "");
    const sections = Array.isArray(d[3]) ? d[3] : [];
    return {
      name: str(d[0]),
      summary: str(d[1]),
      details: str(d[2]),
      sections: sections.slice(0, 50).map((sec: unknown) => {
        const arr = Array.isArray(sec) ? sec : [];
        const links = Array.isArray(arr[1]) ? arr[1] : [];
        return {
          name: str(arr[0]),
          links: links.slice(0, 300).map((l: unknown) => {
            const la = Array.isArray(l) ? l : [];
            return { title: str(la[0]), url: str(la[1]), notes: str(la[2]) };
          }),
        };
      }),
    };
  } catch {
    return null;
  }
}

// ── DOM helpers ───────────────────────────────────────────
function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  cls = "",
  text?: string,
): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

function renderIssues(list: HTMLElement, issues: Issue[], max = 50): void {
  list.replaceChildren(
    ...issues.slice(0, max).map((i) => {
      const li = el(
        "li",
        `border-ink rounded-[4px] border-[2px] p-3 text-on-accent ${
          i.level === "error"
            ? "bg-pink"
            : i.level === "warning"
              ? "bg-yellow"
              : "bg-cyan"
        }`,
      );
      li.append(
        el(
          "p",
          "mono text-[10px] font-bold tracking-widest uppercase",
          `${i.level}${i.line ? ` · line ${i.line}` : ""}`,
        ),
        el("p", "mt-1 break-words", i.message),
      );
      return li;
    }),
  );
  if (issues.length > max) {
    list.append(
      el("li", "text-sm opacity-80", `${issues.length - max} more not shown.`),
    );
  }
}

function summaryLine(r: ValidationResult): string {
  const errors = r.issues.filter((i) => i.level === "error").length;
  const warnings = r.issues.filter((i) => i.level === "warning").length;
  if (errors)
    return `Not valid: ${errors} error${errors === 1 ? "" : "s"}${warnings ? `, ${warnings} warning${warnings === 1 ? "" : "s"}` : ""}.`;
  if (warnings)
    return `Valid, with ${warnings} warning${warnings === 1 ? "" : "s"}.`;
  return "Valid llms.txt.";
}

function init(): void {
  const root = document.getElementById(`${P}root`);
  if (!root || root.dataset.bound === "1") return;
  root.dataset.bound = "1";

  const $ = <T extends HTMLElement>(id: string) =>
    document.getElementById(P + id) as T | null;

  const nameEl = $<HTMLInputElement>("name");
  const summaryEl = $<HTMLTextAreaElement>("summary");
  const detailsEl = $<HTMLTextAreaElement>("details");
  const sectionsEl = $<HTMLElement>("sections");
  const sectionTpl = $<HTMLTemplateElement>("section-tpl");
  const linkTpl = $<HTMLTemplateElement>("link-tpl");
  const outEl = $<HTMLElement>("output");
  const outStatus = $<HTMLElement>("out-status");
  const outIssues = $<HTMLElement>("out-issues");
  const copyLabel = $<HTMLElement>("copy-label");
  const shareNote = $<HTMLElement>("share-note");
  const vtext = $<HTMLTextAreaElement>("vtext");
  const vsummary = $<HTMLElement>("vsummary");
  const vstats = $<HTMLElement>("vstats");
  const vissues = $<HTMLElement>("vissues");
  const importEl = $<HTMLTextAreaElement>("import");
  const importStatus = $<HTMLElement>("import-status");
  if (
    !nameEl ||
    !summaryEl ||
    !detailsEl ||
    !sectionsEl ||
    !sectionTpl ||
    !linkTpl ||
    !outEl ||
    !outStatus ||
    !outIssues ||
    !vtext ||
    !vsummary ||
    !vstats ||
    !vissues
  )
    return;

  const addLink = (
    list: HTMLElement,
    data = { title: "", url: "", notes: "" },
  ) => {
    const frag = linkTpl.content.cloneNode(true) as DocumentFragment;
    const li = frag.querySelector<HTMLElement>("[data-link]");
    if (!li) return null;
    for (const k of ["title", "url", "notes"] as const) {
      const input = li.querySelector<HTMLInputElement>(`[data-field="${k}"]`);
      if (input) input.value = data[k];
    }
    list.append(li);
    return li;
  };

  const addSection = (data: LlmsSection = { name: "", links: [] }) => {
    const frag = sectionTpl.content.cloneNode(true) as DocumentFragment;
    const fs = frag.querySelector<HTMLElement>("[data-section]");
    if (!fs) return null;
    const nameInput = fs.querySelector<HTMLInputElement>('[data-field="name"]');
    if (nameInput) nameInput.value = data.name;
    const list = fs.querySelector<HTMLElement>("[data-links]");
    if (list) {
      const links = data.links.length
        ? data.links
        : [{ title: "", url: "", notes: "" }];
      for (const l of links) addLink(list, l);
    }
    sectionsEl.append(fs);
    return fs;
  };

  const read = (): LlmsInput => ({
    name: nameEl.value,
    summary: summaryEl.value,
    details: detailsEl.value,
    sections: Array.from(
      sectionsEl.querySelectorAll<HTMLElement>("[data-section]"),
    ).map((fs) => ({
      name:
        fs.querySelector<HTMLInputElement>('[data-field="name"]')?.value ?? "",
      links: Array.from(fs.querySelectorAll<HTMLElement>("[data-link]")).map(
        (li) => ({
          title:
            li.querySelector<HTMLInputElement>('[data-field="title"]')?.value ??
            "",
          url:
            li.querySelector<HTMLInputElement>('[data-field="url"]')?.value ??
            "",
          notes:
            li.querySelector<HTMLInputElement>('[data-field="notes"]')?.value ??
            "",
        }),
      ),
    })),
  });

  const fill = (input: LlmsInput) => {
    nameEl.value = input.name;
    summaryEl.value = input.summary;
    detailsEl.value = input.details;
    sectionsEl.replaceChildren();
    for (const s of input.sections) addSection(s);
    if (input.sections.length === 0) addSection({ name: "Docs", links: [] });
  };

  const isEmpty = (input: LlmsInput) =>
    !input.name.trim() &&
    !input.summary.trim() &&
    !input.details.trim() &&
    input.sections.every((s) =>
      s.links.every((l) => !l.url.trim() && !l.title.trim()),
    );

  let latest = "";
  let urlTimer = 0;

  const writeUrl = (input: LlmsInput): void => {
    const url = new URL(window.location.href);
    if (isEmpty(input)) {
      url.searchParams.delete("s");
    } else {
      const packed = pack(input);
      if (packed.length <= MAX_URL) {
        url.searchParams.set("s", packed);
        if (shareNote)
          shareNote.textContent =
            "The link stores the form in the URL. Do not put anything private in it.";
      } else {
        url.searchParams.delete("s");
        if (shareNote)
          shareNote.textContent =
            "This form is too long for a link. Download the file instead.";
      }
    }
    try {
      window.history.replaceState(window.history.state, "", url);
    } catch {
      // Some embedded browsers block history writes; the tool still works.
    }
  };

  const render = (): void => {
    const input = read();
    latest = buildLlmsTxt(input);
    outEl.textContent = latest;
    const r = validateLlmsTxt(latest);
    const shown = r.issues.filter(
      (i) => i.level !== "info" || !/\.md files/.test(i.message),
    );
    outStatus.textContent = `${summaryLine(r)} ${r.sections.length} section${r.sections.length === 1 ? "" : "s"}, ${r.linkCount} link${r.linkCount === 1 ? "" : "s"}.`;
    renderIssues(
      outIssues,
      input.name.trim()
        ? shown
        : [
            {
              level: "warning",
              line: 1,
              message: "Add a site or project name. It becomes the H1.",
            },
            ...shown,
          ],
    );
    window.clearTimeout(urlTimer);
    urlTimer = window.setTimeout(() => writeUrl(input), 250);
  };

  const check = (): void => {
    const text = vtext.value;
    if (!text.trim()) {
      vsummary.textContent = "Paste a file to check it.";
      vstats.hidden = true;
      vissues.replaceChildren();
      return;
    }
    const r = validateLlmsTxt(text);
    vsummary.textContent = summaryLine(r);
    const stat = (k: string, v: string) => {
      const d = el(
        "div",
        "border-ink bg-bg-alt min-w-0 rounded-[4px] border-[2px] p-2",
      );
      d.append(
        el(
          "dt",
          "mono text-[10px] font-bold tracking-widest uppercase opacity-80",
          k,
        ),
        el("dd", "font-bold break-words", v),
      );
      return d;
    };
    vstats.replaceChildren(
      stat("Title", r.title || "none"),
      stat("Sections", String(r.sections.length)),
      stat("Links", String(r.linkCount)),
      stat("About", `${r.approxTokens.toLocaleString("en-US")} tokens`),
    );
    vstats.hidden = false;
    renderIssues(vissues, r.issues);
  };

  // ── Events ──
  root.addEventListener("input", (e) => {
    const t = e.target as HTMLElement | null;
    if (!t) return;
    if (t === vtext) check();
    else if (t !== importEl) render();
  });

  root.addEventListener("click", (e) => {
    const t = (e.target as HTMLElement | null)?.closest("button");
    if (!t) return;
    if (t.matches("[data-add-link]")) {
      const list = t
        .closest("[data-section]")
        ?.querySelector<HTMLElement>("[data-links]");
      if (list)
        addLink(list)?.querySelector<HTMLInputElement>("input")?.focus();
      render();
    } else if (t.matches("[data-remove-link]")) {
      const li = t.closest("[data-link]");
      const list = li?.parentElement;
      li?.remove();
      if (list && list.childElementCount === 0) addLink(list);
      render();
    } else if (t.matches("[data-remove-section]")) {
      t.closest("[data-section]")?.remove();
      if (!sectionsEl.querySelector("[data-section]")) addSection();
      render();
    }
  });

  $("add-section")?.addEventListener("click", () => {
    addSection()?.querySelector<HTMLInputElement>("input")?.focus();
    render();
  });
  $("add-optional")?.addEventListener("click", () => {
    addSection({ name: "Optional", links: [] })
      ?.querySelector<HTMLInputElement>('[data-field="title"]')
      ?.focus();
    render();
  });
  $("example")?.addEventListener("click", () => {
    fill(EXAMPLE);
    render();
  });
  $("reset")?.addEventListener("click", () => {
    fill({ name: "", summary: "", details: "", sections: [] });
    render();
  });

  $("import-btn")?.addEventListener("click", () => {
    const found = sectionsFromUrls(importEl?.value ?? "");
    const total = found.reduce((n, s) => n + s.links.length, 0);
    if (!total) {
      if (importStatus)
        importStatus.textContent = "No http or https URLs found.";
      return;
    }
    // Drop the starter section if it is still empty.
    for (const fs of Array.from(
      sectionsEl.querySelectorAll<HTMLElement>("[data-section]"),
    )) {
      const empty = Array.from(
        fs.querySelectorAll<HTMLInputElement>("input"),
      ).every((i) => !i.value.trim() || i.dataset.field === "name");
      if (empty) fs.remove();
    }
    for (const s of found) addSection(s);
    if (importStatus)
      importStatus.textContent = `Added ${total} link${total === 1 ? "" : "s"} in ${found.length} section${found.length === 1 ? "" : "s"}. Rename and trim them.`;
    render();
  });

  $("copy")?.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(latest);
      if (copyLabel) copyLabel.textContent = "Copied";
    } catch {
      if (copyLabel) copyLabel.textContent = "Copy blocked";
    }
    window.setTimeout(() => {
      if (copyLabel) copyLabel.textContent = "Copy";
    }, 1500);
  });
  $("download")?.addEventListener("click", () =>
    downloadText("llms.txt", latest),
  );
  $("to-check")?.addEventListener("click", () => {
    vtext.value = latest;
    check();
    vtext.scrollIntoView({ behavior: "smooth", block: "center" });
  });

  $("load-own")?.addEventListener("click", async () => {
    vsummary.textContent = "Loading /llms.txt…";
    try {
      const res = await fetch("/llms.txt", { cache: "no-store" });
      if (!res.ok) throw new Error(String(res.status));
      vtext.value = await res.text();
      check();
    } catch {
      vsummary.textContent = "Could not load /llms.txt.";
    }
  });
  $("vclear")?.addEventListener("click", () => {
    vtext.value = "";
    check();
  });

  const shareBtn = root.querySelector<HTMLButtonElement>("[data-share-link]");
  const shareStatus = root.querySelector<HTMLElement>("[data-share-status]");
  shareBtn?.addEventListener("click", async () => {
    window.clearTimeout(urlTimer);
    writeUrl(read());
    try {
      await navigator.clipboard.writeText(window.location.href);
      if (shareStatus) shareStatus.textContent = "Link copied";
    } catch {
      if (shareStatus) shareStatus.textContent = "Link is in the address bar";
    }
  });

  // ── Start ──
  const fromUrl = new URLSearchParams(window.location.search).get("s");
  const restored = fromUrl ? unpack(fromUrl) : null;
  fill(restored ?? { name: "", summary: "", details: "", sections: [] });
  render();
  check();
}

init();
document.addEventListener("astro:after-swap", init);
