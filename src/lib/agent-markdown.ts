/**
 * Pure helpers for the Markdown twins and Accept negotiation.
 *
 * Safe to import from the Cloudflare Pages middleware: no Node or DOM APIs.
 * SITE_ORIGIN matches SITE.URL in src/consts/01a-site.ts. The middleware
 * cannot import that module (it touches import.meta.env).
 */

export const SITE_ORIGIN = "https://ansezz.com";

/** Pages that get a Markdown file besides individual blog posts. */
const KEY_PAGES = new Set(["/", "/about/", "/contact/", "/blog/"]);

/** First segment under /blog/ that is a section, not a post. */
const BLOG_SECTIONS = new Set(["category", "tag", "page", "series"]);

const STATIC_EXT =
  /\.(?:css|js|mjs|map|png|jpe?g|gif|webp|avif|svg|ico|woff2?|ttf|otf|xml|json|webmanifest|pdf|txt|mp4|webm)$/i;

export interface ParsedPost {
  slug: string;
  title: string;
  description: string;
  publishDate: string;
  updatedDate?: string;
  category: string;
  tags: string[];
  draft: boolean;
  body: string;
}

export function normalizePath(pathname: string): string {
  let path = pathname.split("?")[0]?.split("#")[0] ?? "/";
  if (!path.startsWith("/")) path = `/${path}`;
  if (path.endsWith("/index.html")) path = path.slice(0, -"index.html".length);
  else if (path.endsWith(".html")) path = `${path.slice(0, -".html".length)}/`;
  if (path.length > 1 && path.endsWith("/")) return path;
  if (path === "/") return "/";
  if (/\.[a-z0-9]+$/i.test(path)) return path;
  return `${path}/`;
}

/**
 * Public path of the Markdown twin for an HTML URL, or null when this
 * page does not get one. `/` → `/index.md`, `/about/` → `/about/index.md`,
 * `/blog/<slug>/` → `/blog/<slug>/index.md`.
 */
export function markdownAlternatePath(pathname: string): string | null {
  if (pathname.split("?")[0]?.endsWith(".md")) return null;
  const path = normalizePath(pathname);
  if (path === "/") return "/index.md";
  if (KEY_PAGES.has(path)) return `${path}index.md`;
  const match = path.match(/^\/blog\/([^/]+)\/$/);
  if (!match) return null;
  const slug = match[1] ?? "";
  if (!slug || BLOG_SECTIONS.has(slug)) return null;
  return `/blog/${slug}/index.md`;
}

/** HTML path a Markdown asset is the twin of. Inverse of markdownAlternatePath. */
export function canonicalPathForMarkdown(assetPath: string): string | null {
  const path = assetPath.split("?")[0] ?? assetPath;
  if (path === "/index.md") return "/";
  const match = path.match(/^(.*)\/index\.md$/);
  if (!match?.[1]) return null;
  return `${match[1]}/`;
}

export function isStaticAssetPath(pathname: string): boolean {
  return STATIC_EXT.test(pathname.split("?")[0] ?? pathname);
}

interface AcceptQ {
  type: string;
  q: number;
}

function parseAccept(header: string): AcceptQ[] {
  const out: AcceptQ[] = [];
  for (const part of header.split(",")) {
    const bits = part.split(";").map((s) => s.trim());
    const type = (bits[0] ?? "").toLowerCase();
    if (!type) continue;
    let q = 1;
    for (const bit of bits.slice(1)) {
      const match = /^q\s*=\s*([0-9.]+)$/i.exec(bit);
      if (!match) continue;
      const n = Number(match[1]);
      q = Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0;
    }
    out.push({ type, q });
  }
  return out;
}

function qualityFor(parsed: AcceptQ[], types: string[]): number | null {
  let found: number | null = null;
  for (const item of parsed) {
    if (!types.includes(item.type)) continue;
    found = Math.max(found ?? 0, item.q);
  }
  return found;
}

/**
 * True when text/markdown outranks text/html (and `*`/`*`). A tie, a missing
 * markdown type, or q=0 keeps the HTML page.
 */
export function prefersMarkdown(accept: string | null | undefined): boolean {
  if (!accept) return false;
  const parsed = parseAccept(accept);
  const md = qualityFor(parsed, ["text/markdown"]);
  if (md === null || md <= 0) return false;
  const html = qualityFor(parsed, ["text/html", "application/xhtml+xml"]);
  const star = qualityFor(parsed, ["*/*"]);
  const htmlQ = html ?? star ?? 0;
  return md > htmlQ;
}

export function absoluteUrl(path: string): string {
  return new URL(path, SITE_ORIGIN).href;
}

/**
 * Link header for an HTML response. The markdown alternate is included only
 * when this path has a twin. `/llms.txt` is the site description.
 */
export function buildLinkHeader(
  pathname: string,
  includeMarkdown: boolean,
): string {
  const canonical = absoluteUrl(normalizePath(pathname));
  const parts = [`<${canonical}>; rel="canonical"`];
  if (includeMarkdown) {
    const md = markdownAlternatePath(pathname);
    if (md) {
      parts.push(`<${absoluteUrl(md)}>; rel="alternate"; type="text/markdown"`);
    }
  }
  parts.push(`<${absoluteUrl("/llms.txt")}>; rel="describedby"`);
  return parts.join(", ");
}

export function appendVary(current: string | null, token: string): string {
  if (!current) return token;
  const has = current
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .includes(token.toLowerCase());
  return has ? current : `${current}, ${token}`;
}

function tagSlug(tag: string): string {
  return tag.toLowerCase().replace(/\s+/g, "-");
}

function decodeEntities(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function parseScalar(raw: string): string | string[] {
  const value = raw.trim();
  if (value.startsWith('"') || value.startsWith("'")) {
    const quote = value[0];
    let out = "";
    for (let i = 1; i < value.length; i++) {
      const ch = value[i] ?? "";
      if (ch === "\\" && value[i + 1] === quote) {
        out += quote;
        i++;
        continue;
      }
      if (ch === quote) return out;
      out += ch;
    }
    return out;
  }
  if (value.startsWith("[")) {
    const end = value.lastIndexOf("]");
    const inner = value.slice(1, end === -1 ? undefined : end);
    return inner
      .split(",")
      .map((part) => part.trim().replace(/^["']|["']$/g, ""))
      .filter(Boolean);
  }
  return value;
}

export function parsePostSource(filename: string, raw: string): ParsedPost {
  const slug = filename.replace(/\.(md|mdx)$/i, "");
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) {
    throw new Error(`${filename}: missing frontmatter`);
  }
  const fields = new Map<string, string | string[]>();
  for (const line of (match[1] ?? "").split(/\r?\n/)) {
    if (!line || /^\s/.test(line)) continue;
    const field = /^([A-Za-z][\w]*):\s*(.*)$/.exec(line);
    if (!field) continue;
    fields.set(field[1] ?? "", parseScalar(field[2] ?? ""));
  }
  const title = fields.get("title");
  const description = fields.get("description");
  const publishDate = fields.get("publishDate");
  const category = fields.get("category");
  if (typeof title !== "string" || !title) {
    throw new Error(`${filename}: missing title`);
  }
  if (typeof description !== "string") {
    throw new Error(`${filename}: missing description`);
  }
  if (
    typeof publishDate !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(publishDate)
  ) {
    throw new Error(`${filename}: missing publishDate`);
  }
  if (typeof category !== "string" || !category) {
    throw new Error(`${filename}: missing category`);
  }
  const updated = fields.get("updatedDate");
  const tags = fields.get("tags");
  return {
    slug,
    title,
    description,
    publishDate,
    updatedDate: typeof updated === "string" && updated ? updated : undefined,
    category,
    tags: Array.isArray(tags) ? tags : [],
    draft: fields.get("draft") === "true",
    body: match[2] ?? "",
  };
}

interface Masked {
  text: string;
  blocks: string[];
}

/** Replace fenced and inline code so component parsing cannot see it. */
export function maskCode(src: string): Masked {
  const blocks: string[] = [];
  const put = (block: string) => {
    const token = `\u0000C${blocks.length}\u0000`;
    blocks.push(block);
    return token;
  };
  const lines = src.split("\n");
  const out: string[] = [];
  const isFenceClose = (line: string, marker: string, char: string) => {
    const trimmed = line.trim();
    return (
      trimmed.length >= marker.length &&
      trimmed.split("").every((c) => c === char)
    );
  };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";
    const open = /^ {0,3}(```+|~~~+)/.exec(line);
    if (!open) {
      out.push(line);
      continue;
    }
    const marker = open[1] ?? "```";
    const char = marker[0] ?? "`";
    const start = i;
    i++;
    while (i < lines.length && !isFenceClose(lines[i] ?? "", marker, char)) i++;
    const end = Math.min(i, lines.length - 1);
    out.push(put(lines.slice(start, end + 1).join("\n")));
    if (i >= lines.length) break;
  }
  const text = out.join("\n").replace(/`[^`\n]+`/g, (block) => put(block));
  return { text, blocks };
}

export function unmaskCode(text: string, blocks: string[]): string {
  return text.replace(
    /\u0000C(\d+)\u0000/g,
    (_, n: string) => blocks[Number(n)] ?? "",
  );
}

function stripJsxComments(src: string): string {
  let out = "";
  let i = 0;
  while (i < src.length) {
    if (src.startsWith("{/*", i)) {
      const end = src.indexOf("*/}", i + 3);
      if (end === -1) {
        out += src.slice(i);
        break;
      }
      i = end + 3;
      continue;
    }
    out += src[i];
    i++;
  }
  return out;
}

function stripImportLines(src: string): string {
  return src.replace(/^[ \t]*import\s.+$\n?/gm, "");
}

interface Tag {
  name: string;
  attrs: Record<string, string>;
  selfClosing: boolean;
  end: number;
}

function parseTagAt(src: string, i: number): Tag | null {
  if (src[i] !== "<") return null;
  const nameMatch = /^<([A-Za-z][\w.-]*)/.exec(src.slice(i));
  if (!nameMatch) return null;
  const name = nameMatch[1] ?? "";
  let j = i + 1 + name.length;
  const attrs: Record<string, string> = {};
  while (j < src.length) {
    const ch = src[j];
    if (ch === " " || ch === "\n" || ch === "\t" || ch === "\r") {
      j++;
      continue;
    }
    if (src.startsWith("/>", j)) {
      return { name, attrs, selfClosing: true, end: j + 2 };
    }
    if (ch === ">") return { name, attrs, selfClosing: false, end: j + 1 };
    const attr = /^([A-Za-z_:][\w:.-]*)/.exec(src.slice(j));
    if (!attr) return null;
    const key = attr[1] ?? "";
    j += key.length;
    while (
      src[j] === " " ||
      src[j] === "\n" ||
      src[j] === "\t" ||
      src[j] === "\r"
    ) {
      j++;
    }
    if (src[j] !== "=") {
      attrs[key] = "";
      continue;
    }
    j++;
    while (src[j] === " " || src[j] === "\n" || src[j] === "\t") j++;
    const quote = src[j];
    if (quote !== '"' && quote !== "'") return null;
    j++;
    let value = "";
    while (j < src.length && src[j] !== quote) {
      value += src[j];
      j++;
    }
    if (src[j] !== quote) return null;
    j++;
    attrs[key] = decodeEntities(value);
  }
  return null;
}

function findClose(
  src: string,
  name: string,
  from: number,
): { inner: string; end: number } | null {
  let depth = 1;
  let j = from;
  while (j < src.length) {
    const next = src.indexOf("<", j);
    if (next === -1) return null;
    const close = /^<\/([A-Za-z][\w.-]*)\s*>/.exec(src.slice(next));
    if (close && close[1] === name) {
      depth--;
      if (depth === 0) {
        const raw = close[0] ?? "";
        return { inner: src.slice(from, next), end: next + raw.length };
      }
      j = next + (close[0]?.length ?? 1);
      continue;
    }
    const open = parseTagAt(src, next);
    if (open && open.name === name && !open.selfClosing) {
      depth++;
      j = open.end;
      continue;
    }
    j = open ? open.end : next + 1;
  }
  return null;
}

function slotInner(src: string, slot: string): string | null {
  let i = 0;
  while (i < src.length) {
    const lt = src.indexOf("<", i);
    if (lt === -1) return null;
    const tag = parseTagAt(src, lt);
    if (
      tag &&
      tag.name === "div" &&
      tag.attrs.slot === slot &&
      !tag.selfClosing
    ) {
      const close = findClose(src, tag.name, tag.end);
      return close ? close.inner : null;
    }
    i = tag ? tag.end : lt + 1;
  }
  return null;
}

function tidyPlain(src: string): string {
  return (
    src
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim() + "\n"
  );
}

/** Collapse blank lines outside fenced code. */
export function tidyMarkdown(src: string): string {
  const { text, blocks } = maskCode(src);
  return unmaskCode(tidyPlain(text), blocks);
}

function labeled(title: string, inner: string): string {
  const body = renderRegion(inner).trim();
  return `\n\n**${title}**\n\n${body}\n\n`;
}

function asBlockquote(inner: string, cite?: string): string {
  const text = renderRegion(inner).trim();
  if (!text && !cite) return "";
  const quoted = text
    .split("\n")
    .map((line) => (line.trim() ? `> ${line}` : ">"))
    .join("\n");
  const credit = cite?.trim() ? `\n>\n> — ${cite.trim()}` : "";
  return `\n\n${quoted}${credit}\n\n`;
}

function renderFigure(attrs: Record<string, string>): string {
  const src = attrs.src?.trim();
  if (!src) return "";
  const alt = (attrs.alt ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[\[\]]/g, "");
  const caption = (attrs.caption ?? "").replace(/\s+/g, " ").trim();
  let out = `\n\n![${alt}](${src})\n`;
  if (caption) out += `\n*${caption}*\n`;
  return `${out}\n`;
}

function renderBeforeAfter(
  attrs: Record<string, string>,
  inner: string,
): string {
  const beforeLabel = attrs.beforeLabel || "Before";
  const afterLabel = attrs.afterLabel || "After";
  const before =
    attrs.before ??
    (slotInner(inner, "before") == null
      ? ""
      : renderRegion(slotInner(inner, "before") ?? "").trim());
  const after =
    attrs.after ??
    (slotInner(inner, "after") == null
      ? ""
      : renderRegion(slotInner(inner, "after") ?? "").trim());
  return `\n\n**${beforeLabel}:** ${before.trim()}\n\n**${afterLabel}:** ${after.trim()}\n\n`;
}

function renderPair(tag: Tag, inner: string): string {
  switch (tag.name) {
    case "Summary":
      return labeled(tag.attrs.title || "TL;DR", inner);
    case "TryThis":
      return labeled(tag.attrs.title || "Try this", inner);
    case "Takeaway":
      return labeled(tag.attrs.title || "Key takeaways", inner);
    case "Callout": {
      const fallback =
        tag.attrs.type === "warning"
          ? "Warning"
          : tag.attrs.type === "tip"
            ? "Tip"
            : "Note";
      return labeled(tag.attrs.title || fallback, inner);
    }
    case "PullQuote":
      return asBlockquote(inner, tag.attrs.cite);
    case "BeforeAfter":
      return renderBeforeAfter(tag.attrs, inner);
    case "div":
    case "span":
    case "section":
      return renderRegion(inner);
    default:
      return renderRegion(inner);
  }
}

function renderSelfClosing(tag: Tag): string {
  if (tag.name === "Figure") return renderFigure(tag.attrs);
  if (tag.name === "BeforeAfter") return renderBeforeAfter(tag.attrs, "");
  return "";
}

function renderRegion(src: string): string {
  let out = "";
  let i = 0;
  while (i < src.length) {
    const lt = src.indexOf("<", i);
    if (lt === -1) {
      out += src.slice(i);
      break;
    }
    if (lt > i) out += src.slice(i, lt);
    const tag = parseTagAt(src, lt);
    if (!tag) {
      out += "<";
      i = lt + 1;
      continue;
    }
    if (tag.selfClosing) {
      out += renderSelfClosing(tag);
      i = tag.end;
      continue;
    }
    const close = findClose(src, tag.name, tag.end);
    if (!close) {
      out += "<";
      i = lt + 1;
      continue;
    }
    out += renderPair(tag, close.inner);
    i = close.end;
  }
  return out;
}

/** Turn a post body into Markdown. Known MDX components become their text. */
export function flattenMdx(body: string): string {
  const { text, blocks } = maskCode(body);
  const stripped = stripJsxComments(stripImportLines(text));
  const rendered = tidyPlain(renderRegion(stripped));
  const leftover =
    /<(?:Summary|TryThis|BeforeAfter|PullQuote|Takeaway|Callout|Figure)\b/.exec(
      rendered,
    );
  if (leftover) {
    throw new Error(`MDX component survived flattening: ${leftover[0]}`);
  }
  // Unmask after tidy so blank lines inside code fences stay intact.
  return unmaskCode(rendered, blocks);
}

export function renderPostMarkdown(post: ParsedPost): string {
  const url = absoluteUrl(`/blog/${post.slug}/`);
  const lines = [
    `# ${post.title}`,
    "",
    `- Canonical: ${url}`,
    `- Markdown: ${absoluteUrl(`/blog/${post.slug}/index.md`)}`,
    `- Published: ${post.publishDate}`,
  ];
  if (post.updatedDate) lines.push(`- Updated: ${post.updatedDate}`);
  lines.push(`- Description: ${post.description}`);
  lines.push(
    `- Category: [${post.category}](${absoluteUrl(`/blog/category/${post.category}/`)})`,
  );
  if (post.tags.length > 0) {
    const tags = post.tags
      .map((tag) => `[${tag}](${absoluteUrl(`/blog/tag/${tagSlug(tag)}/`)})`)
      .join(", ");
    lines.push(`- Tags: ${tags}`);
  }
  lines.push("", flattenMdx(post.body).trim(), "");
  return tidyMarkdown(lines.join("\n"));
}

export function uniqueMarkdownLinks(
  markdown: string,
  limit = 30,
): { text: string; href: string }[] {
  const { text } = maskCode(markdown);
  const seen = new Set<string>();
  const out: { text: string; href: string }[] = [];
  const re = /\[([^\]\n]+)\]\(([^)\s]+)\)/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text))) {
    if (match.index > 0 && text[match.index - 1] === "!") continue;
    const label = (match[1] ?? "").replace(/\s+/g, " ").trim();
    const href = match[2] ?? "";
    if (!label || label.length < 2 || !href || href.startsWith("#")) continue;
    if (seen.has(href)) continue;
    seen.add(href);
    out.push({ text: label, href });
    if (out.length >= limit) break;
  }
  return out;
}
