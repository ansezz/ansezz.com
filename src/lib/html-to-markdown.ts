/**
 * Turn a built page's <main> into Markdown. Used for the Astro pages that
 * have no Markdown source (home, about, contact, blog index).
 */
import { parseHTML } from "linkedom";
import { tidyMarkdown, uniqueMarkdownLinks } from "./agent-markdown.ts";

interface NodeLike {
  nodeType: number;
  textContent: string | null;
  childNodes: ArrayLike<NodeLike>;
}

interface El extends NodeLike {
  tagName: string;
  children: ArrayLike<El>;
  getAttribute(name: string): string | null;
  querySelector(sel: string): El | null;
  querySelectorAll(sel: string): ArrayLike<El>;
  remove(): void;
}

const SKIP = new Set([
  "script",
  "style",
  "svg",
  "noscript",
  "form",
  "button",
  "template",
  "iframe",
]);

function abs(href: string, origin: string): string {
  if (
    href.startsWith("https://") ||
    href.startsWith("http://") ||
    href.startsWith("mailto:") ||
    href.startsWith("tel:")
  ) {
    return href;
  }
  if (href.startsWith("/")) return origin + href;
  return href;
}

function inline(el: El, origin: string): string {
  let out = "";
  for (const child of Array.from(el.childNodes))
    out += inlineNode(child, origin);
  return out.replace(/[ \t]+/g, " ").replace(/ *\n */g, " ");
}

function inlineNode(node: NodeLike, origin: string): string {
  if (node.nodeType === 3) return (node.textContent ?? "").replace(/\s+/g, " ");
  if (node.nodeType !== 1) return "";
  const el = node as El;
  const tag = el.tagName.toLowerCase();
  if (SKIP.has(tag) || el.getAttribute("aria-hidden") === "true") return "";
  if (tag === "a") return link(el, origin);
  if (tag === "br") return " ";
  if (tag === "code") {
    const text = (el.textContent ?? "").trim();
    return text ? `\`${text}\`` : "";
  }
  if (tag === "strong" || tag === "b") {
    const text = inline(el, origin).trim();
    return text ? `**${text}**` : "";
  }
  if (tag === "em" || tag === "i") {
    const text = inline(el, origin).trim();
    return text ? `*${text}*` : "";
  }
  return inline(el, origin);
}

function link(el: El, origin: string): string {
  const href = el.getAttribute("href")?.trim() ?? "";
  let text = "";
  for (const child of Array.from(el.childNodes))
    text += inlineNode(child, origin);
  text = text.replace(/\s+/g, " ").trim();
  if (!text) text = el.getAttribute("aria-label")?.trim() ?? "";
  if (!text) return "";
  if (!href || href.startsWith("#")) return text;
  return `[${text}](${abs(href, origin)})`;
}

function renderTable(el: El, origin: string): string {
  const rows = Array.from(el.querySelectorAll("tr"));
  if (rows.length === 0) return "";
  const cells = (row: El) =>
    Array.from(row.querySelectorAll("th, td")).map((cell) =>
      inline(cell, origin).trim().replace(/\|/g, "\\|").replace(/\n/g, " "),
    );
  const header = cells(rows[0] as El);
  if (header.length === 0) return "";
  const lines = [
    `| ${header.join(" | ")} |`,
    `| ${header.map(() => "---").join(" | ")} |`,
    ...rows.slice(1).map((row) => `| ${cells(row as El).join(" | ")} |`),
  ];
  return `\n\n${lines.join("\n")}\n\n`;
}

function render(node: NodeLike, origin: string): string {
  if (node.nodeType === 3) return (node.textContent ?? "").replace(/\s+/g, " ");
  if (node.nodeType !== 1) return "";
  const el = node as El;
  const tag = el.tagName.toLowerCase();
  if (SKIP.has(tag) || el.getAttribute("aria-hidden") === "true") return "";
  if (el.getAttribute("hidden") !== null) return "";
  if (tag === "br") return "\n";
  if (tag === "hr") return "\n\n---\n\n";
  if (/^h[1-6]$/.test(tag)) {
    const text = inline(el, origin).trim();
    if (!text) return "";
    return `\n\n${"#".repeat(Number(tag[1]))} ${text}\n\n`;
  }
  if (tag === "p") {
    const text = inline(el, origin).trim();
    return text ? `\n\n${text}\n\n` : "";
  }
  if (tag === "a") return link(el, origin);
  if (tag === "ul" || tag === "ol") {
    const items = Array.from(el.children).filter(
      (child) => child.tagName.toLowerCase() === "li",
    );
    const lines = items
      .map((item, index) => {
        const text = render(item, origin).trim().replace(/\n+/g, " ");
        if (!text) return "";
        return `${tag === "ol" ? `${index + 1}. ` : "- "}${text}`;
      })
      .filter(Boolean);
    return lines.length ? `\n\n${lines.join("\n")}\n\n` : "";
  }
  if (tag === "pre") {
    const codeEl = el.querySelector("code");
    const lang =
      codeEl?.getAttribute("class")?.match(/language-([\w-]+)/)?.[1] ?? "";
    const code = (el.textContent ?? "").replace(/\n$/, "");
    return `\n\n\`\`\`${lang}\n${code}\n\`\`\`\n\n`;
  }
  if (tag === "img") {
    const alt = el.getAttribute("alt")?.trim() ?? "";
    const src = el.getAttribute("src")?.trim() ?? "";
    if (!alt || !src) return "";
    return `\n\n![${alt}](${abs(src, origin)})\n\n`;
  }
  if (tag === "blockquote") {
    const text = renderChildren(el, origin).trim();
    if (!text) return "";
    return `\n\n${text
      .split("\n")
      .map((line) => (line.trim() ? `> ${line}` : ">"))
      .join("\n")}\n\n`;
  }
  if (tag === "table") return renderTable(el, origin);
  return renderChildren(el, origin);
}

function renderChildren(el: El, origin: string): string {
  let out = "";
  for (const child of Array.from(el.childNodes)) out += render(child, origin);
  return out;
}

export function htmlMainToMarkdown(html: string, canonicalUrl: string): string {
  const origin = new URL(canonicalUrl).origin;
  const { document } = parseHTML(html);
  const doc = document as unknown as El;
  const description =
    doc
      .querySelector('meta[name="description"]')
      ?.getAttribute("content")
      ?.trim() ?? "";
  const main = doc.querySelector("main");
  if (!main) throw new Error(`No <main> in ${canonicalUrl}`);
  for (const el of Array.from(
    main.querySelectorAll(
      "script, style, svg, noscript, form, button, template, iframe",
    ),
  )) {
    el.remove();
  }
  for (const el of Array.from(main.querySelectorAll("[aria-hidden='true']"))) {
    el.remove();
  }
  const title =
    main.querySelector("h1")?.textContent?.replace(/\s+/g, " ").trim() ||
    doc.querySelector("title")?.textContent?.split("|")[0]?.trim() ||
    canonicalUrl;
  main.querySelector("h1")?.remove();
  const body = renderChildren(main, origin).trim();
  const links = uniqueMarkdownLinks(body, 30);
  const page = new URL(canonicalUrl);
  const markdownUrl =
    page.pathname === "/"
      ? `${page.origin}/index.md`
      : `${page.origin}${page.pathname.endsWith("/") ? page.pathname : `${page.pathname}/`}index.md`;
  const lines = [
    `# ${title}`,
    "",
    `- Canonical: ${canonicalUrl}`,
    `- Markdown: ${markdownUrl}`,
  ];
  if (description) lines.push(`- Description: ${description}`);
  lines.push("", body);
  if (links.length > 0) {
    lines.push(
      "",
      "## Key links",
      "",
      ...links.map((item) => `- [${item.text}](${item.href})`),
      "",
    );
  }
  return tidyMarkdown(lines.join("\n"));
}
