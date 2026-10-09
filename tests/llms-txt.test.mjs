// Checks the llms.txt builder and validator against the format on
// https://llmstxt.org/ (v2, August 2026), read on 2026-10-10.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  buildLlmsTxt,
  validateLlmsTxt,
  sectionsFromUrls,
} from "../src/lib/llms-txt.ts";

// The cut-down FastHTML example from llmstxt.org.
const SPEC_EXAMPLE = `# FastHTML

> FastHTML is a python library which brings together Starlette, Uvicorn, HTMX, and fastcore's \`FT\` "FastTags" into a library for creating server-rendered hypermedia applications.

Important notes:

- Although parts of its API are inspired by FastAPI, it is *not* compatible with FastAPI syntax and is not targeted at creating API services
- FastHTML is compatible with JS-native web components and any vanilla JS library, but not with React, Vue, or Svelte.

## Docs

- [FastHTML quick start](https://fastht.ml/docs/tutorials/quickstart_for_web_devs.html.md): A brief overview of many FastHTML features
- [HTMX reference](https://github.com/bigskysoftware/htmx/blob/master/www/content/reference.md): Brief description of all HTMX attributes, CSS classes, headers, events, extensions, js lib methods, and config options

## Examples

- [Todo list application](https://github.com/AnswerDotAI/fasthtml/blob/main/examples/adv_app.py): Detailed walk-thru of a complete CRUD app in FastHTML showing idiomatic use of FastHTML and HTMX patterns.

## Optional

- [Starlette full documentation](https://gist.githubusercontent.com/jph00/809e4a4808d4510be0e3dc9565e9cbd3/raw/9b717589ca44cedc8aaf00b2b8cacef922964c0f/starlette-sml.md): A subset of the Starlette documentation useful for FastHTML development.
`;

const errors = (r) => r.issues.filter((i) => i.level === "error");
const warnings = (r) => r.issues.filter((i) => i.level === "warning");

test("the spec example is valid and parses into sections", () => {
  const r = validateLlmsTxt(SPEC_EXAMPLE);
  assert.equal(r.valid, true, JSON.stringify(errors(r)));
  assert.deepEqual(warnings(r), []);
  assert.equal(r.title, "FastHTML");
  assert.match(r.summary, /^FastHTML is a python library/);
  assert.deepEqual(
    r.sections.map((s) => [s.name, s.links.length]),
    [
      ["Docs", 2],
      ["Examples", 1],
      ["Optional", 1],
    ],
  );
  assert.equal(
    r.sections[0].links[0].notes,
    "A brief overview of many FastHTML features",
  );
});

test("only the H1 is required, a BOM is allowed", () => {
  const r = validateLlmsTxt("\uFEFF# Just a title\n");
  assert.equal(r.valid, true);
  assert.equal(r.title, "Just a title");
  assert.ok(warnings(r).some((w) => /summary/.test(w.message)));
});

test("structure errors are caught with line numbers", () => {
  assert.equal(validateLlmsTxt("").valid, false);
  const noH1 = validateLlmsTxt("## Docs\n\n- [A](https://a.dev)\n");
  assert.equal(noH1.valid, false);
  const twoH1 = validateLlmsTxt("# A\n\n# B\n");
  assert.equal(errors(twoH1)[0].line, 3);
  const h3InBody = validateLlmsTxt("# A\n\n> s\n\n### Sub\n");
  assert.equal(h3InBody.valid, false);
  const badItem = validateLlmsTxt(
    "# A\n\n## Docs\n\n- just text\n- [Ok](https://ok.dev)\n",
  );
  assert.equal(errors(badItem).length, 1);
  assert.equal(errors(badItem)[0].line, 5);
  const badUrl = validateLlmsTxt("# A\n\n## Docs\n\n- [Bad](http://)\n");
  assert.equal(badUrl.valid, false);
  const mail = validateLlmsTxt(
    "# A\n\n> s\n\n## Docs\n\n- [Mail](mailto:a@b.c)\n",
  );
  assert.equal(mail.valid, true);
  assert.match(warnings(mail)[0].message, /cannot fetch/);
});

test("warnings for relative, duplicate and badly separated links", () => {
  const r = validateLlmsTxt(
    "# A\n\n> s\n\n## Docs\n\n- [One](/one/)\n- [Two](https://a.dev/two) - no colon\n- [Again](https://a.dev/two/)\n\n## Empty\n",
  );
  assert.equal(r.valid, true);
  const msgs = warnings(r)
    .map((w) => w.message)
    .join("\n");
  assert.match(msgs, /relative/);
  assert.match(msgs, /": "/);
  assert.match(msgs, /Duplicate/);
  assert.match(msgs, /no links/);
});

test("headings inside code fences are ignored", () => {
  const r = validateLlmsTxt(
    "# A\n\n> s\n\n```md\n# not a heading\n## nor this\n```\n",
  );
  assert.equal(r.valid, true, JSON.stringify(r.issues));
  assert.equal(r.sections.length, 0);
});

test("builder output round-trips through the validator", () => {
  const input = {
    name: "Example Docs",
    summary: "Short summary.\nSecond line.",
    details: "Read the guides first.\n\n- Prices are in USD",
    sections: [
      {
        name: "Guides",
        links: [
          {
            title: "Start [here]",
            url: "https://example.com/start (v2).md",
            notes: "First steps",
          },
          { title: "", url: "https://example.com/api.md", notes: "" },
          { title: "Skipped", url: "  ", notes: "" },
        ],
      },
      { name: "", links: [] },
      {
        name: "Optional",
        links: [
          {
            title: "Changelog",
            url: "https://example.com/changes.md",
            notes: "",
          },
        ],
      },
    ],
  };
  const out = buildLlmsTxt(input);
  assert.equal(
    out,
    "# Example Docs\n\n> Short summary.\n> Second line.\n\nRead the guides first.\n\n- Prices are in USD\n\n## Guides\n\n- [Start \\[here\\]](https://example.com/start%20%28v2%29.md): First steps\n- [https://example.com/api.md](https://example.com/api.md)\n\n## Optional\n\n- [Changelog](https://example.com/changes.md)\n",
  );
  const r = validateLlmsTxt(out);
  assert.equal(r.valid, true, JSON.stringify(r.issues));
  assert.equal(r.summary, "Short summary. Second line.");
  assert.equal(r.sections[0].links[0].title, "Start [here]");
  assert.equal(r.linkCount, 3);
});

test("the site's own /llms.txt passes", () => {
  const own = readFileSync(
    new URL("../public/llms.txt", import.meta.url),
    "utf8",
  );
  const r = validateLlmsTxt(own);
  assert.equal(r.valid, true, JSON.stringify(errors(r)));
  assert.deepEqual(warnings(r), []);
});

test("sitemap import groups URLs by first path segment", () => {
  const xml = `<?xml version="1.0"?><urlset><url><loc>https://a.dev/</loc></url><url><loc>https://a.dev/blog/hello-world/</loc></url><url><loc>https://a.dev/blog/second-post/</loc></url><url><loc>https://a.dev/about/</loc></url></urlset>`;
  const s = sectionsFromUrls(xml);
  assert.deepEqual(
    s.map((x) => [x.name, x.links.map((l) => l.title)]),
    [
      ["Pages", ["A.dev", "About"]],
      ["Blog", ["Hello world", "Second post"]],
    ],
  );
  assert.equal(
    sectionsFromUrls("https://x.dev/docs/a\nhttps://x.dev/docs/b")[0].name,
    "Docs",
  );
});
