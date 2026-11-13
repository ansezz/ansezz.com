import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import {
  buildLinkHeader,
  flattenMdx,
  markdownAlternatePath,
  parsePostSource,
  prefersMarkdown,
  renderPostMarkdown,
} from "../src/lib/agent-markdown.ts";
import { htmlMainToMarkdown } from "../src/lib/html-to-markdown.ts";

const browser =
  "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8";

test("prefersMarkdown only when text/markdown outranks HTML", () => {
  assert.equal(prefersMarkdown(null), false);
  assert.equal(prefersMarkdown(""), false);
  assert.equal(prefersMarkdown(browser), false);
  assert.equal(prefersMarkdown("*/*"), false);
  assert.equal(prefersMarkdown("text/markdown"), true);
  assert.equal(prefersMarkdown("text/markdown, text/html;q=0.9"), true);
  assert.equal(prefersMarkdown("text/html, text/markdown;q=0.9"), false);
  assert.equal(prefersMarkdown("text/markdown;q=0.5, text/html;q=0.5"), false);
  assert.equal(prefersMarkdown("text/markdown;q=0, text/html"), false);
  assert.equal(prefersMarkdown("text/plain"), false);
});

test("markdown paths cover key pages and posts only", () => {
  assert.equal(markdownAlternatePath("/"), "/index.md");
  assert.equal(markdownAlternatePath("/index.html"), "/index.md");
  assert.equal(markdownAlternatePath("/about"), "/about/index.md");
  assert.equal(markdownAlternatePath("/about/"), "/about/index.md");
  assert.equal(markdownAlternatePath("/contact/"), "/contact/index.md");
  assert.equal(markdownAlternatePath("/blog/"), "/blog/index.md");
  assert.equal(
    markdownAlternatePath("/blog/hello-world/"),
    "/blog/hello-world/index.md",
  );
  assert.equal(
    markdownAlternatePath("/blog/hello-world/index.html"),
    "/blog/hello-world/index.md",
  );
  assert.equal(markdownAlternatePath("/blog/category/ai/"), null);
  assert.equal(markdownAlternatePath("/blog/tag/laravel/"), null);
  assert.equal(markdownAlternatePath("/blog/page/2/"), null);
  assert.equal(markdownAlternatePath("/blog/series/"), null);
  assert.equal(markdownAlternatePath("/tools/"), null);
  assert.equal(markdownAlternatePath("/styleguide/"), null);
  assert.equal(markdownAlternatePath("/index.md"), null);
});

test("Link header names only real resources", () => {
  assert.equal(
    buildLinkHeader("/", true),
    '<https://ansezz.com/>; rel="canonical", <https://ansezz.com/index.md>; rel="alternate"; type="text/markdown", <https://ansezz.com/llms.txt>; rel="describedby"',
  );
  assert.equal(
    buildLinkHeader("/tools/", false),
    '<https://ansezz.com/tools/>; rel="canonical", <https://ansezz.com/llms.txt>; rel="describedby"',
  );
});

test("MDX components become text and code fences stay intact", () => {
  const src = [
    "Intro with `a < b`.",
    "",
    "```html",
    "<Summary>keep me</Summary>",
    "",
    "",
    "",
    "```",
    "",
    "<Summary>",
    "- First point",
    "- Second point",
    "</Summary>",
    "",
    "<PullQuote>Plain DNS is not health.</PullQuote>",
    "",
    "<Figure",
    '  src="/blog/hello-world/inline-1.webp"',
    '  alt="A robot writing"',
    '  caption="Notes, written down."',
    "/>",
    "",
    '<BeforeAfter beforeLabel="Plain DNS" afterLabel="Service discovery">',
    '  <div slot="before">The record stays until someone edits it.</div>',
    '  <div slot="after">The registry drops unhealthy instances.</div>',
    "</BeforeAfter>",
    "",
    "<TryThis>",
    "Subscribe via [RSS](/rss.xml).",
    "</TryThis>",
    "",
    "{/* prettier-ignore */}",
    "",
    "<Takeaway>",
    "- Ship the notes.",
    "</Takeaway>",
  ].join("\n");
  const out = flattenMdx(src);
  assert.match(out, /<Summary>keep me<\/Summary>/);
  assert.match(out, /\n\n\n/);
  assert.match(out, /\*\*TL;DR\*\*/);
  assert.match(out, /- First point/);
  assert.match(out, /> Plain DNS is not health\./);
  assert.match(
    out,
    /!\[A robot writing\]\(\/blog\/hello-world\/inline-1\.webp\)/,
  );
  assert.match(out, /\*Notes, written down\.\*/);
  assert.match(
    out,
    /\*\*Plain DNS:\*\* The record stays until someone edits it\./,
  );
  assert.match(
    out,
    /\*\*Service discovery:\*\* The registry drops unhealthy instances\./,
  );
  assert.match(out, /\*\*Try this\*\*/);
  assert.match(out, /\*\*Key takeaways\*\*/);
  assert.doesNotMatch(
    out.replace(/```[\s\S]*?```/g, ""),
    /<(?:Summary|Figure|BeforeAfter|div)\b/,
  );
  assert.doesNotMatch(out, /prettier-ignore/);
});

test("every published post flattens without raw components", () => {
  const dir = join(process.cwd(), "src/content/blog");
  const files = readdirSync(dir).filter((name) => /\.mdx?$/.test(name));
  assert.ok(files.length >= 80);
  let published = 0;
  for (const name of files) {
    const post = parsePostSource(name, readFileSync(join(dir, name), "utf8"));
    if (post.draft) continue;
    published++;
    const md = renderPostMarkdown(post);
    assert.match(md, new RegExp(`^# ${escapeRegExp(post.title)}\\n`));
    assert.match(
      md,
      new RegExp(`Canonical: https://ansezz.com/blog/${post.slug}/`),
    );
    const prose = md.replace(/```[\s\S]*?```/g, "");
    assert.doesNotMatch(
      prose,
      /<(?:Summary|TryThis|BeforeAfter|PullQuote|Takeaway|Callout|Figure|div)\b/,
      name,
    );
  }
  assert.ok(published >= 80);
});

test("html main becomes markdown with a title and links", () => {
  const html = `<!doctype html><html><head>
    <meta name="description" content="Say hello.">
    <title>Ignored | ansezz</title>
  </head><body>
    <header><a href="/secret/">Nav</a></header>
    <main id="main">
      <h1>Hello <span>there</span></h1>
      <p>Senior engineer. <a href="/contact/">Get in touch</a>.</p>
      <p aria-hidden="true">decorative</p>
      <form><input name="email"></form>
    </main>
    <footer><a href="/privacy/">Privacy</a></footer>
  </body></html>`;
  const md = htmlMainToMarkdown(html, "https://ansezz.com/about/");
  assert.match(md, /^# Hello there\n/);
  assert.match(md, /Canonical: https:\/\/ansezz.com\/about\//);
  assert.match(md, /Markdown: https:\/\/ansezz.com\/about\/index\.md/);
  assert.match(md, /Description: Say hello\./);
  assert.match(md, /\[Get in touch\]\(https:\/\/ansezz.com\/contact\/\)/);
  assert.match(md, /## Key links/);
  assert.doesNotMatch(md, /Nav/);
  assert.doesNotMatch(md, /Privacy/);
  assert.doesNotMatch(md, /decorative/);
});

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
