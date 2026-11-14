import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { onRequest } from "../functions/_middleware.ts";

const SIGNAL = "search=yes, ai-input=yes, ai-train=no";

function context(url, { accept, method = "GET", assets, next } = {}) {
  const headers = accept ? { accept } : undefined;
  return {
    request: new Request(url, { method, headers }),
    env: { ASSETS: assets },
    next:
      next ??
      (async () =>
        new Response("<html></html>", {
          headers: { "content-type": "text/html; charset=utf-8" },
        })),
  };
}

test("HTML responses send Content-Signal and keep the Link header", async () => {
  const res = await onRequest(context("https://ansezz.com/about/"));
  assert.equal(res.headers.get("Content-Signal"), SIGNAL);
  assert.match(res.headers.get("Vary") ?? "", /Accept/);
  assert.match(res.headers.get("Link") ?? "", /rel="alternate"/);
  assert.match(res.headers.get("Link") ?? "", /text\/markdown/);
  assert.equal(await res.text(), "<html></html>");
});

test("a HEAD of an HTML page sends the header and no body", async () => {
  const res = await onRequest(
    context("https://ansezz.com/blog/ship-your-own-markdown-for-agents/", {
      method: "HEAD",
    }),
  );
  assert.equal(res.headers.get("Content-Signal"), SIGNAL);
  assert.equal(await res.text(), "");
});

test("Accept text/markdown sends the header on the twin", async () => {
  const assets = {
    async fetch() {
      return new Response("# Hello\n", {
        headers: { "content-type": "text/markdown; charset=utf-8" },
      });
    },
  };
  const res = await onRequest(
    context("https://ansezz.com/", {
      accept: "text/markdown",
      assets,
    }),
  );
  assert.equal(res.headers.get("content-type"), "text/markdown; charset=utf-8");
  assert.equal(res.headers.get("Content-Signal"), SIGNAL);
  assert.match(res.headers.get("Vary") ?? "", /Accept/);
  assert.match(res.headers.get("Link") ?? "", /rel="canonical"/);
  assert.equal(await res.text(), "# Hello\n");
});

test("a direct Markdown URL sends the header", async () => {
  const res = await onRequest(
    context("https://ansezz.com/blog/hello/index.md", {
      next: async () =>
        new Response("# Hello\n", {
          headers: { "content-type": "text/markdown; charset=utf-8" },
        }),
    }),
  );
  assert.equal(res.headers.get("content-type"), "text/markdown; charset=utf-8");
  assert.equal(res.headers.get("Content-Signal"), SIGNAL);
});

test("an HTML 404, including one served for a missing .md, sends the header", async () => {
  const html404 = async () =>
    new Response("<html>missing</html>", {
      status: 404,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  const page = await onRequest(
    context("https://ansezz.com/missing/", { next: html404 }),
  );
  const twin = await onRequest(
    context("https://ansezz.com/missing.md", { next: html404 }),
  );
  assert.equal(page.status, 404);
  assert.equal(page.headers.get("Content-Signal"), SIGNAL);
  assert.equal(page.headers.get("Link"), null);
  assert.equal(twin.status, 404);
  assert.equal(twin.headers.get("Content-Signal"), SIGNAL);
});

test("non-HTML responses are left alone", async () => {
  const res = await onRequest(
    context("https://ansezz.com/tools/token-counter/", {
      next: async () =>
        new Response("{}", {
          headers: { "content-type": "application/json" },
        }),
    }),
  );
  assert.equal(res.headers.get("Content-Signal"), null);
  assert.equal(res.headers.get("Link"), null);
});

test("/api/ is not negotiated and does not gain Content-Signal", async () => {
  let calls = 0;
  const res = await onRequest(
    context("https://ansezz.com/api/agent-readiness", {
      accept: "text/markdown",
      method: "POST",
      next: async () => {
        calls += 1;
        return new Response('{"ok":true}', {
          headers: { "content-type": "application/json" },
        });
      },
    }),
  );
  assert.equal(calls, 1);
  assert.equal(res.headers.get("Content-Signal"), null);
  assert.equal(res.headers.get("Link"), null);
  assert.equal(res.headers.get("Vary"), null);
  assert.equal(await res.text(), '{"ok":true}');
});

test("a redirect is not rewritten", async () => {
  const res = await onRequest(
    context("https://ansezz.com/old/", {
      next: async () =>
        new Response(null, {
          status: 301,
          headers: {
            location: "https://ansezz.com/new/",
            "content-type": "text/html; charset=utf-8",
          },
        }),
    }),
  );
  assert.equal(res.status, 301);
  assert.equal(res.headers.get("Content-Signal"), null);
  assert.equal(res.headers.get("location"), "https://ansezz.com/new/");
});

test("static assets bypass the middleware", async () => {
  const res = await onRequest(
    context(
      "https://ansezz.com/blog/ship-your-own-markdown-for-agents/hero.webp",
      {
        next: async () =>
          new Response("img", { headers: { "content-type": "image/webp" } }),
      },
    ),
  );
  assert.equal(res.headers.get("Content-Signal"), null);
});

test("robots.txt and Markdown _headers use the same Content-Signal", () => {
  const robots = readFileSync("public/robots.txt", "utf8");
  const headers = readFileSync("public/_headers", "utf8");
  const line = `Content-Signal: ${SIGNAL}`;
  assert.match(robots, new RegExp(line.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  for (const block of [
    "/llms-full.txt",
    "/index.md",
    "/about/index.md",
    "/contact/index.md",
    "/blog/index.md",
    "/blog/*/index.md",
  ]) {
    const start = headers.indexOf(`\n${block}\n`);
    assert.notEqual(start, -1, block);
    const next = headers.slice(start + block.length);
    const rule = next.slice(0, next.search(/\n\/|\n#|$/));
    assert.match(rule, new RegExp(line), block);
  }
});
