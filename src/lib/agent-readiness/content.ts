/** Small, linear parsers. No HTML library: the Workers free plan has a tight CPU budget. */

import { looksLikeHtml } from "./robots.ts";

export function visibleText(html: string): { title: string; text: string } {
  const capped = html.slice(0, 300_000);
  const titleRaw = /<title[^>]*>([^<]{0,300})/i.exec(capped)?.[1] ?? "";
  const stripped = stripTags(
    stripBlocks(
      stripBlocks(stripBlocks(capped, "script"), "style"),
      "noscript",
    ),
  );
  const text = decodeBasic(stripped).replace(/\s+/g, " ").trim().slice(0, 8000);
  return {
    title: decodeBasic(titleRaw).replace(/\s+/g, " ").trim().slice(0, 200),
    text,
  };
}

function stripBlocks(html: string, tag: string): string {
  const open = `<${tag}`;
  const close = `</${tag}`;
  const lower = html.toLowerCase();
  let out = "";
  let i = 0;
  while (i < html.length) {
    const start = lower.indexOf(open, i);
    if (start < 0) {
      out += html.slice(i);
      break;
    }
    out += html.slice(i, start);
    const gt = lower.indexOf(">", start);
    if (gt < 0) break;
    const end = lower.indexOf(close, gt);
    if (end < 0) break;
    i = lower.indexOf(">", end);
    if (i < 0) break;
    i += 1;
  }
  return out;
}

function stripTags(html: string): string {
  let out = "";
  let i = 0;
  while (i < html.length) {
    const start = html.indexOf("<", i);
    if (start < 0) {
      out += html.slice(i);
      break;
    }
    out += `${html.slice(i, start)} `;
    const end = html.indexOf(">", start + 1);
    if (end < 0) break;
    i = end + 1;
  }
  return out;
}

function decodeBasic(value: string): string {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'");
}

export interface JsonLdRead {
  blocks: number;
  broken: number;
  types: string[];
}

export function readJsonLd(html: string): JsonLdRead {
  const lower = html.toLowerCase();
  const types: string[] = [];
  let blocks = 0;
  let broken = 0;
  let i = 0;
  while (blocks < 8 && i < html.length) {
    const start = lower.indexOf("<script", i);
    if (start < 0) break;
    const gt = html.indexOf(">", start);
    if (gt < 0) break;
    const tag = lower.slice(start, gt);
    const close = lower.indexOf("</script", gt);
    i = close < 0 ? html.length : close + 9;
    if (!tag.includes("application/ld+json") || close < 0) continue;
    blocks += 1;
    const raw = html
      .slice(gt + 1, close)
      .trim()
      .slice(0, 50_000);
    try {
      collectTypes(JSON.parse(raw), types, { n: 0 }, 0);
    } catch {
      broken += 1;
    }
  }
  return { blocks, broken, types: [...new Set(types)] };
}

function collectTypes(
  node: unknown,
  out: string[],
  budget: { n: number },
  depth: number,
): void {
  if (budget.n > 200 || depth > 8 || node == null) return;
  budget.n += 1;
  if (Array.isArray(node)) {
    for (const item of node) collectTypes(item, out, budget, depth + 1);
    return;
  }
  if (typeof node !== "object") return;
  const record = node as Record<string, unknown>;
  const kind = record["@type"];
  const push = (value: string) => {
    const short = value.split(/[/:]/).pop() ?? value;
    if (short) out.push(short);
  };
  if (typeof kind === "string") push(kind);
  else if (Array.isArray(kind)) {
    for (const item of kind) if (typeof item === "string") push(item);
  }
  if ("@graph" in record)
    collectTypes(record["@graph"], out, budget, depth + 1);
}

export function hasMarkdownAlternate(
  html: string,
  linkHeader: string | null,
): boolean {
  if (
    linkHeader &&
    /text\/markdown/i.test(linkHeader) &&
    /alternate/i.test(linkHeader)
  ) {
    return true;
  }
  return (
    /<link\b[^>]*rel=["']?alternate["']?[^>]*>/i.test(html) &&
    /text\/markdown/i.test(html)
  );
}

export interface LinkRel {
  url: string;
  rel: string[];
  type: string | null;
}

export function parseLinkHeader(header: string | null): LinkRel[] {
  if (!header) return [];
  const parts: string[] = [];
  let current = "";
  let angle = false;
  let quote = false;
  for (const char of header) {
    if (char === "<") angle = true;
    else if (char === ">") angle = false;
    else if (char === '"') quote = !quote;
    if (char === "," && !angle && !quote) {
      parts.push(current);
      current = "";
      continue;
    }
    current += char;
  }
  if (current.trim()) parts.push(current);
  const out: LinkRel[] = [];
  for (const part of parts) {
    const url = /<([^>]+)>/.exec(part)?.[1]?.trim();
    if (!url) continue;
    const relRaw = /;\s*rel\s*=\s*"?([^";]+)"?/i.exec(part)?.[1] ?? "";
    const type = /;\s*type\s*=\s*"?([^";]+)"?/i.exec(part)?.[1]?.trim() ?? null;
    const rel = relRaw
      .split(/\s+/)
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean);
    out.push({ url, rel, type });
  }
  return out;
}

export interface LlmsLink {
  title: string;
  url: string;
  notes: string;
}

export interface LlmsAssessment {
  status: "pass" | "warn" | "fail" | "could-not-verify";
  summary: string;
  issues: string[];
  links: LlmsLink[];
}

export function assessLlmsTxt(
  body: string,
  contentType: string | null,
  status: number | null,
): LlmsAssessment {
  if (status === 404 || status === 410) {
    return {
      status: "fail",
      summary: "No llms.txt was found at /llms.txt.",
      issues: [],
      links: [],
    };
  }
  if (status == null) {
    return {
      status: "could-not-verify",
      summary: "llms.txt could not be fetched.",
      issues: [],
      links: [],
    };
  }
  if (looksLikeHtml(body, contentType)) {
    return {
      status: "fail",
      summary: "The llms.txt URL returned HTML, not a text file.",
      issues: ["The body looks like an HTML page."],
      links: [],
    };
  }
  const lines = body.replace(/^\uFEFF/, "").split(/\r?\n/);
  let i = 0;
  while (i < lines.length && lines[i]!.trim() === "") i += 1;
  const issues: string[] = [];
  const links: LlmsLink[] = [];
  const title = lines[i] ?? "";
  if (!/^#\s+\S/.test(title) || /^#{2,}\s/.test(title)) {
    issues.push("The file needs an H1 with the site or project name.");
  } else {
    i += 1;
  }
  while (i < lines.length && lines[i]!.trim().startsWith(">")) i += 1;
  let inSection = false;
  const seen = new Set<string>();
  for (; i < lines.length; i++) {
    const line = lines[i] ?? "";
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (/^#\s+\S/.test(trimmed) && !/^#{2,}\s/.test(trimmed)) {
      issues.push("Only one H1 is allowed, and it has to be the first line.");
      continue;
    }
    if (/^#{3,}\s/.test(trimmed)) {
      issues.push(
        "Use H2 for link sections. Deeper headings are out of order.",
      );
      inSection = true;
      continue;
    }
    if (/^##\s+\S/.test(trimmed)) {
      inSection = true;
      continue;
    }
    const link = /^- \[([^\]]+)\]\(([^)\s]+)\)\s*(?::\s*(.*))?$/.exec(trimmed);
    if (link) {
      if (!inSection) {
        issues.push("Link lines belong under an H2 section.");
      }
      const href = link[2] ?? "";
      links.push({
        title: link[1] ?? "",
        url: href,
        notes: (link[3] ?? "").trim(),
      });
      if (!/^https?:\/\//i.test(href)) {
        issues.push(`Link is not absolute: ${href}`);
      }
      const key = href.trim();
      if (seen.has(key)) issues.push(`Duplicate link: ${href}`);
      seen.add(key);
      continue;
    }
    if (inSection && trimmed.startsWith("- ")) {
      issues.push("A list line is not in the form - [name](url).");
      continue;
    }
    if (/^#{1,6}\s/.test(trimmed)) {
      issues.push(
        "Headings in the detail block have to wait until the H2 sections.",
      );
    }
  }
  const uniqueIssues = [...new Set(issues)].slice(0, 8);
  if (!body.trim()) {
    return {
      status: "warn",
      summary: "llms.txt is empty.",
      issues: uniqueIssues,
      links,
    };
  }
  if (uniqueIssues.length === 0 && links.length > 0) {
    return {
      status: "pass",
      summary: `llms.txt is text with an H1 and ${links.length} link${links.length === 1 ? "" : "s"}.`,
      issues: [],
      links,
    };
  }
  if (links.length === 0 && uniqueIssues.length === 0) {
    uniqueIssues.push("Add at least one H2 section of links.");
  }
  return {
    status: "warn",
    summary:
      "llms.txt is present, but it does not follow the llmstxt.org v2 shape.",
    issues: uniqueIssues,
    links,
  };
}

export function markdownType(contentType: string | null): boolean {
  const type = (contentType ?? "").toLowerCase();
  return type.includes("text/markdown") || type.includes("text/x-markdown");
}

export function varyAccepts(vary: string | null): boolean {
  if (!vary) return false;
  return vary
    .split(",")
    .map((part) => part.trim().toLowerCase())
    .includes("accept");
}

export function sameOrigin(left: string, right: string): boolean {
  try {
    return new URL(left).origin === new URL(right).origin;
  } catch {
    return false;
  }
}

export function mdCandidates(pageUrl: string): string[] {
  let url: URL;
  try {
    url = new URL(pageUrl);
  } catch {
    return [];
  }
  const path = url.pathname || "/";
  const out: string[] = [];
  const push = (next: string) => {
    const href = new URL(next, url.origin).href;
    if (!out.includes(href)) out.push(href);
  };
  if (path.endsWith("/")) {
    push(`${path}index.md`);
    push(`${path}index.html.md`);
  } else {
    push(`${path}.md`);
    if (path.endsWith(".html")) push(`${path.slice(0, -".html".length)}.md`);
  }
  return out.slice(0, 2);
}

export function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}
