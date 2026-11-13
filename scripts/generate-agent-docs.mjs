// Build-time Markdown for agents.
//
// public/llms.txt is a curated index, not generated. This script writes the
// expanded companion (dist/llms-full.txt) and a Markdown twin for the home
// page, about, contact, the blog index, and every published post. Astro and
// Pagefind run first; the twins are not part of the search index or sitemap.

import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import {
  parsePostSource,
  renderPostMarkdown,
  SITE_ORIGIN,
} from "../src/lib/agent-markdown.ts";
import { htmlMainToMarkdown } from "../src/lib/html-to-markdown.ts";

const root = process.cwd();
const dist = join(root, "dist");
const blogDir = join(root, "src/content/blog");

const keyPages = [
  {
    file: "index.html",
    url: `${SITE_ORIGIN}/`,
    out: "index.md",
    label: "Home",
  },
  {
    file: "about/index.html",
    url: `${SITE_ORIGIN}/about/`,
    out: "about/index.md",
    label: "About",
  },
  {
    file: "contact/index.html",
    url: `${SITE_ORIGIN}/contact/`,
    out: "contact/index.md",
    label: "Contact",
  },
  {
    file: "blog/index.html",
    url: `${SITE_ORIGIN}/blog/`,
    out: "blog/index.md",
    label: "Blog",
  },
];

function writeOut(rel, text) {
  const path = join(dist, rel);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, text.endsWith("\n") ? text : `${text}\n`);
}

const pageDocs = keyPages.map((page) => {
  const htmlPath = join(dist, page.file);
  let html;
  try {
    html = readFileSync(htmlPath, "utf8");
  } catch {
    throw new Error(`Missing ${page.file} in dist/. Run astro build first.`);
  }
  const markdown = htmlMainToMarkdown(html, page.url);
  if (markdown.length < 200) {
    throw new Error(
      `${page.out} is unexpectedly short (${markdown.length} chars)`,
    );
  }
  writeOut(page.out, markdown);
  return { ...page, markdown };
});

const posts = readdirSync(blogDir)
  .filter((name) => /\.(md|mdx)$/.test(name))
  .map((name) =>
    parsePostSource(name, readFileSync(join(blogDir, name), "utf8")),
  )
  .filter((post) => !post.draft)
  .sort(
    (a, b) =>
      b.publishDate.localeCompare(a.publishDate) ||
      a.slug.localeCompare(b.slug),
  );

const postDocs = posts.map((post) => {
  const markdown = renderPostMarkdown(post);
  writeOut(`blog/${post.slug}/index.md`, markdown);
  return { post, markdown };
});

const toc = [
  `# Anass Ez-zouaine`,
  "",
  `> Full text of the key pages and every blog post on ${SITE_ORIGIN}.`,
  `> The short reading list is ${SITE_ORIGIN}/llms.txt.`,
  "",
  `Generated at build time from the same sources as the site. ${postDocs.length} posts.`,
  "",
  "## Key pages",
  "",
  ...pageDocs.map((page) => `- [${page.label}](${page.url})`),
  "",
  "## Blog posts",
  "",
  ...postDocs.map(
    ({ post }) =>
      `- [${post.title}](${SITE_ORIGIN}/blog/${post.slug}/) — ${post.publishDate}`,
  ),
  "",
].join("\n");

const full = [
  toc,
  ...pageDocs.map((page) => page.markdown.trim()),
  ...postDocs.map(({ markdown }) => markdown.trim()),
].join("\n\n---\n\n");

writeOut("llms-full.txt", `${full.trim()}\n`);

const bytes = Buffer.byteLength(full);
console.log(
  `agent docs: ${pageDocs.length} pages, ${postDocs.length} posts, llms-full.txt ${(bytes / 1024).toFixed(0)} KiB`,
);
