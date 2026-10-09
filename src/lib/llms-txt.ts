/**
 * Build and check llms.txt files against the llmstxt.org proposal (v2,
 * August 2026). The format, in order:
 *
 *   1. optional BOM
 *   2. an H1 with the site or project name (the only required part)
 *   3. a blockquote with a short summary
 *   4. zero or more markdown blocks of any kind except headings
 *   5. zero or more H2 sections, each a markdown list of
 *      "[name](url)" links, optionally followed by ": notes"
 *
 * Pure functions only, so they run in the browser and in node:test.
 */

export interface LlmsLink {
  title: string;
  url: string;
  notes: string;
}

export interface LlmsSection {
  name: string;
  links: LlmsLink[];
}

export interface LlmsInput {
  name: string;
  summary: string;
  details: string;
  sections: LlmsSection[];
}

export type IssueLevel = "error" | "warning" | "info";

export interface Issue {
  level: IssueLevel;
  line: number | null;
  message: string;
}

export interface ParsedLink extends LlmsLink {
  line: number;
}

export interface ParsedSection {
  name: string;
  line: number;
  links: ParsedLink[];
}

export interface ValidationResult {
  valid: boolean;
  title: string | null;
  summary: string | null;
  sections: ParsedSection[];
  linkCount: number;
  approxTokens: number;
  issues: Issue[];
}

const oneLine = (s: string): string => s.replace(/\s+/g, " ").trim();

/** Escape characters that would end a markdown link label early. */
export function escapeLinkText(s: string): string {
  return oneLine(s)
    .replace(/\\/g, "\\\\")
    .replace(/([[\]])/g, "\\$1");
}

/** Make a URL safe inside "(...)": no spaces, balanced parens. */
export function escapeLinkUrl(s: string): string {
  return s
    .trim()
    .replace(/ /g, "%20")
    .replace(/\(/g, "%28")
    .replace(/\)/g, "%29");
}

/** Turns the form into llms.txt text. Empty links and sections are skipped. */
export function buildLlmsTxt(input: LlmsInput): string {
  const out: string[] = [];
  out.push(`# ${oneLine(input.name) || "Untitled"}`);

  const summary = input.summary.trim();
  if (summary) {
    out.push("");
    for (const line of summary.split(/\r?\n/)) {
      out.push(line.trim() ? `> ${line.trim()}` : ">");
    }
  }

  const details = input.details.replace(/\r\n/g, "\n").trim();
  if (details) {
    out.push("", details);
  }

  for (const section of input.sections) {
    const links = section.links.filter((l) => l.url.trim());
    const name = oneLine(section.name);
    // A section with no links would be an empty H2, which the format does
    // not expect, so it only appears once it has a URL.
    if (links.length === 0) continue;
    out.push("", `## ${name || "Links"}`, "");
    for (const l of links) {
      const title = escapeLinkText(l.title) || escapeLinkText(l.url);
      const notes = oneLine(l.notes);
      out.push(
        `- [${title}](${escapeLinkUrl(l.url)})${notes ? `: ${notes}` : ""}`,
      );
    }
  }

  return out.join("\n") + "\n";
}

// "- [name](url)" with an optional ": notes". The label may contain escaped
// brackets; the URL may not contain spaces or a closing paren.
const LINK_ITEM =
  /^[-*+]\s+\[((?:\\.|[^\]\\])*)\]\(\s*<?([^)\s>]*)>?(?:\s+"[^"]*")?\s*\)(.*)$/;
const LIST_ITEM = /^\s*([-*+]|\d+[.)])\s+/;
const HEADING = /^(#{1,6})(?:\s+(.*?))?\s*#*\s*$/;

function checkUrl(url: string): {
  ok: boolean;
  absolute: boolean;
  web: boolean;
} {
  if (!url) return { ok: false, absolute: false, web: false };
  try {
    const u = new URL(url);
    return {
      ok: true,
      absolute: true,
      web: u.protocol === "http:" || u.protocol === "https:",
    };
  } catch {
    // Relative URLs are allowed by markdown. Resolve against a dummy base to
    // make sure they at least parse.
    try {
      new URL(url, "https://example.invalid/");
      return { ok: true, absolute: false, web: true };
    } catch {
      return { ok: false, absolute: false, web: false };
    }
  }
}

/** Checks a pasted llms.txt and returns issues with line numbers. */
export function validateLlmsTxt(raw: string): ValidationResult {
  const issues: Issue[] = [];
  const add = (level: IssueLevel, line: number | null, message: string) =>
    issues.push({ level, line, message });

  const text = raw.replace(/^\uFEFF/, "");
  const lines = text.replace(/\r\n?/g, "\n").split("\n");

  let title: string | null = null;
  let titleLine = 0;
  let summary: string | null = null;
  const summaryLines: string[] = [];
  const sections: ParsedSection[] = [];
  let current: ParsedSection | null = null;
  // phase: before-h1 -> after-h1 (summary allowed) -> body -> sections
  let phase: "start" | "afterTitle" | "body" | "sections" = "start";
  let inFence = false;
  let fenceMarker = "";
  let sawBodyBeforeSummary = false;
  const seenUrls = new Map<string, number>();
  const seenSections = new Map<string, number>();
  let markdownLinks = 0;

  if (!text.trim()) {
    add("error", null, "The file is empty. It needs at least an H1 title.");
    return {
      valid: false,
      title,
      summary,
      sections,
      linkCount: 0,
      approxTokens: 0,
      issues,
    };
  }

  for (let i = 0; i < lines.length; i++) {
    const n = i + 1;
    const line = lines[i] ?? "";
    const trimmed = line.trim();

    // Fenced code is content, never structure.
    const fence = trimmed.match(/^(`{3,}|~{3,})/);
    if (fence) {
      if (!inFence) {
        inFence = true;
        fenceMarker = fence[1]?.[0] ?? "`";
      } else if (trimmed.startsWith(fenceMarker)) {
        inFence = false;
      }
      if (phase === "start") {
        add(
          "error",
          n,
          "Content before the H1 title. The file must start with '# Name'.",
        );
        phase = "body";
      } else if (phase === "afterTitle") phase = "body";
      continue;
    }
    if (inFence) continue;
    if (!trimmed) continue;

    const h = line.match(HEADING);
    if (h && !line.startsWith(" ")) {
      const level = h[1]?.length ?? 0;
      const textOf = (h[2] ?? "").trim();
      if (level === 1) {
        if (title === null && phase === "start") {
          if (!textOf)
            add(
              "error",
              n,
              "The H1 is empty. Put the site or project name after '# '.",
            );
          title = textOf;
          titleLine = n;
          phase = "afterTitle";
        } else {
          add("error", n, "A second H1. The spec allows one H1, at the top.");
        }
        continue;
      }
      if (phase === "start") {
        add(
          "error",
          n,
          "The first heading must be an H1 ('# Name'), not an H" + level + ".",
        );
        phase = "body";
      }
      if (level === 2) {
        const key = textOf.toLowerCase();
        if (!textOf) add("error", n, "An H2 with no name.");
        if (seenSections.has(key) && textOf)
          add(
            "warning",
            n,
            `Section "${textOf}" appears twice (first on line ${seenSections.get(key)}). Merge them.`,
          );
        else seenSections.set(key, n);
        current = { name: textOf, line: n, links: [] };
        sections.push(current);
        phase = "sections";
        continue;
      }
      add(
        phase === "sections" ? "warning" : "error",
        n,
        phase === "sections"
          ? `H${level} inside a file list. The spec only uses H2 sections; most parsers will ignore this heading.`
          : `H${level} before the first H2. The details part may not contain headings.`,
      );
      continue;
    }

    if (phase === "start") {
      add(
        "error",
        n,
        "Content before the H1 title. The file must start with '# Name'.",
      );
      phase = "body";
      continue;
    }

    if (trimmed.startsWith(">") && phase !== "sections") {
      if (phase === "afterTitle") {
        summaryLines.push(trimmed.replace(/^>\s?/, ""));
        // Keep reading continuation lines of the same blockquote.
        let j = i + 1;
        while (j < lines.length && (lines[j] ?? "").trim().startsWith(">")) {
          summaryLines.push((lines[j] ?? "").trim().replace(/^>\s?/, ""));
          j++;
        }
        i = j - 1;
        summary = summaryLines.join(" ").replace(/\s+/g, " ").trim();
        phase = "body";
        continue;
      }
      if (summary === null && sawBodyBeforeSummary) {
        add(
          "warning",
          n,
          "This blockquote comes after other text. Put the summary right under the H1.",
        );
      }
      continue;
    }

    if (phase === "afterTitle") {
      sawBodyBeforeSummary = true;
      phase = "body";
      continue;
    }
    if (phase === "body") continue;

    // Inside an H2 section: expect a markdown list of links.
    if (!LIST_ITEM.test(line)) {
      if (/^\s{2,}\S/.test(line)) continue; // wrapped continuation of an item
      add(
        "warning",
        n,
        `Text that is not a list item in section "${current?.name ?? ""}". File lists should be "- [name](url): notes" items.`,
      );
      continue;
    }
    const m = trimmed.match(LINK_ITEM);
    if (!m) {
      add(
        "error",
        n,
        'List item without a markdown link at the start. Use "- [name](url)" and an optional ": notes".',
      );
      continue;
    }
    const name = (m[1] ?? "").replace(/\\(.)/g, "$1").trim();
    const url = (m[2] ?? "").trim();
    const rest = m[3] ?? "";
    if (!name)
      add(
        "error",
        n,
        "Link with an empty name. Put a short title inside the [ ].",
      );
    const check = checkUrl(url);
    if (!url) add("error", n, "Link with an empty URL.");
    else if (!check.ok) add("error", n, `"${url}" is not a valid URL.`);
    else if (!check.web)
      add(
        "warning",
        n,
        `"${url}" is not an http or https link, so an agent cannot fetch it.`,
      );
    else if (!check.absolute)
      add(
        "warning",
        n,
        `"${url}" is relative. Agents may read the file out of context, so absolute URLs are safer.`,
      );
    let notes = "";
    if (rest.trim()) {
      const nm = rest.match(/^\s*:\s*(.*)$/);
      if (nm) notes = (nm[1] ?? "").trim();
      else
        add(
          "warning",
          n,
          'Notes after a link should start with ": ". Other separators may not be read as notes.',
        );
    }
    if (url) {
      const key = url.replace(/\/$/, "");
      if (seenUrls.has(key))
        add("warning", n, `Duplicate link, also on line ${seenUrls.get(key)}.`);
      else seenUrls.set(key, n);
      if (/\.md(\?|#|$)/i.test(url)) markdownLinks++;
    }
    current?.links.push({ title: name, url, notes, line: n });
  }

  if (inFence) add("error", null, "A code fence is never closed.");
  if (title !== null && summary === null)
    add(
      "warning",
      titleLine,
      "No summary blockquote ('> ...') under the H1. It is optional, but it is the first thing an agent reads.",
    );
  if (summary && summary.length > 600)
    add(
      "info",
      titleLine + 1,
      `The summary is ${summary.length} characters. Keep it to a few sentences and move detail into the body.`,
    );

  for (const s of sections) {
    if (s.links.length === 0)
      add("warning", s.line, `Section "${s.name}" has no links.`);
    if (s.name.toLowerCase() === "optional")
      add(
        "info",
        s.line,
        'An "Optional" section is a convention for secondary links an agent can skip. Since v2 of the proposal it has no special processing meaning.',
      );
  }

  const linkCount = sections.reduce((n, s) => n + s.links.length, 0);
  if (linkCount > 0 && markdownLinks < linkCount)
    add(
      "info",
      null,
      `${markdownLinks} of ${linkCount} links point to .md files. The proposal suggests linking to markdown versions of pages (page.md or page.html.md) when you have them.`,
    );

  const approxTokens = Math.ceil(text.length / 4);
  if (approxTokens > 20000)
    add(
      "info",
      null,
      `About ${approxTokens.toLocaleString("en-US")} tokens. The file should stay small enough to fit in an agent's context; move detail behind links.`,
    );

  issues.sort(
    (a, b) =>
      (a.line ?? Number.MAX_SAFE_INTEGER) - (b.line ?? Number.MAX_SAFE_INTEGER),
  );

  return {
    valid: !issues.some((i) => i.level === "error"),
    title,
    summary,
    sections,
    linkCount,
    approxTokens,
    issues,
  };
}

/**
 * Pulls URLs out of a pasted sitemap.xml or a plain list and groups them by
 * first path segment, so a site can start from its sitemap. No network.
 */
export function sectionsFromUrls(raw: string, max = 200): LlmsSection[] {
  const found: string[] = [];
  const locs = [...raw.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)].map(
    (m) => m[1] ?? "",
  );
  const source = locs.length
    ? locs
    : raw.split(/\s+/).filter((s) => /^https?:\/\//i.test(s));
  for (const s of source) {
    const url = s.replace(/&amp;/g, "&").trim();
    if (url && !found.includes(url)) found.push(url);
    if (found.length >= max) break;
  }
  const groups = new Map<string, LlmsLink[]>();
  for (const url of found) {
    let seg = "";
    let leaf = "";
    try {
      const u = new URL(url);
      const parts = u.pathname.split("/").filter(Boolean);
      seg = parts.length > 1 ? (parts[0] ?? "") : "";
      leaf = parts[parts.length - 1] ?? u.hostname;
    } catch {
      continue;
    }
    const name = seg ? titleCase(seg) : "Pages";
    const title = titleCase(leaf.replace(/\.(html?|md|php)$/i, ""));
    if (!groups.has(name)) groups.set(name, []);
    groups.get(name)?.push({ title, url, notes: "" });
  }
  return [...groups.entries()].map(([name, links]) => ({ name, links }));
}

function titleCase(slug: string): string {
  const words = decodeURIComponentSafe(slug).replace(/[-_]+/g, " ").trim();
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : "Home";
}

function decodeURIComponentSafe(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}
