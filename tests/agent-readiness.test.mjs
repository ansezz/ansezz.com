import assert from "node:assert/strict";
import test from "node:test";
import { assemble } from "../src/lib/agent-readiness/assemble.ts";
import { createBudget, safeGet } from "../src/lib/agent-readiness/fetch.ts";
import {
  resetRateLimit,
  takeRateLimit,
} from "../src/lib/agent-readiness/rate-limit.ts";
import {
  crawlerReport,
  decideCrawler,
  parseRobots,
  parseSignal,
} from "../src/lib/agent-readiness/robots.ts";
import {
  assessDnsAnswers,
  blockReasonForIp,
  parseIp,
  parseTarget,
} from "../src/lib/agent-readiness/ssrf.ts";

function reason(host) {
  const ip = parseIp(host);
  assert.ok(ip, host);
  return blockReasonForIp(host, ip);
}

test("blocks private, loopback, link-local, metadata, and mapped addresses", () => {
  for (const host of [
    "127.0.0.1",
    "10.1.2.3",
    "192.168.1.9",
    "172.16.0.4",
    "100.64.0.1",
    "169.254.169.254",
    "0.0.0.0",
    "::1",
    "fc00::1",
    "fd12:3456::1",
    "fe80::1",
    "::ffff:127.0.0.1",
    "::ffff:8.8.8.8",
  ]) {
    assert.ok(reason(host), host);
  }
  assert.match(reason("169.254.169.254"), /metadata/);
  assert.match(reason("127.0.0.1"), /loopback/);
  assert.equal(reason("1.1.1.1"), null);
  assert.equal(reason("8.8.8.8"), null);
  assert.equal(reason("2001:4860:4860::8888"), null);
});

test("rejects non-public URLs before a fetch would be allowed", () => {
  assert.match(parseTarget("http://127.0.0.1/").reason ?? "", /loopback/);
  assert.match(
    parseTarget("http://169.254.169.254/latest").reason ?? "",
    /metadata/,
  );
  assert.match(
    parseTarget("http://localhost/").reason ?? "",
    /local or internal/,
  );
  assert.match(
    parseTarget("http://metadata.google.internal/").reason ?? "",
    /internal/,
  );
  assert.match(
    parseTarget("http://example.com:8080/").reason ?? "",
    /ports 80 and 443/,
  );
  assert.match(
    parseTarget("http://user:pass@example.com/").reason ?? "",
    /username/,
  );
  assert.match(
    parseTarget("file:///etc/passwd").reason ?? "",
    /http and https/,
  );
  assert.equal(parseTarget("https://example.com/docs").ok, true);
  assert.equal(parseTarget("example.com").ok, true);
});

test("a hostname that resolves to a private address is blocked", () => {
  const judged = assessDnsAnswers("localtest.me", [
    { type: 1, data: "127.0.0.1" },
  ]);
  assert.equal(judged.ok, false);
  assert.match(judged.reason, /localtest\.me/);
  assert.match(judged.reason, /127\.0\.0\.1/);
  const pub = assessDnsAnswers("example.com", [
    { type: 1, data: "1.1.1.1" },
    { type: 28, data: "2606:4700:4700::1111" },
  ]);
  assert.equal(pub.ok, true);
});

test("a redirect to a private address is not fetched", async () => {
  const calls = [];
  const net = {
    async fetch(url) {
      calls.push(String(url));
      return new Response(null, {
        status: 302,
        headers: { location: "http://127.0.0.1/" },
      });
    },
  };
  const budget = createBudget(net);
  await assert.rejects(
    () =>
      safeGet(
        budget,
        async () => ({ ok: true, reason: "", addresses: ["1.1.1.1"] }),
        {
          id: "home",
          url: "https://example.com/",
          accept: "*/*",
          follow: true,
          maxBytes: 1000,
        },
      ),
    /127\.0\.0\.1/,
  );
  assert.deepEqual(calls, ["https://example.com/"]);
});

test("an IP literal is rejected with no request", async () => {
  const calls = [];
  const budget = createBudget({
    async fetch(url) {
      calls.push(String(url));
      return new Response("nope");
    },
  });
  await assert.rejects(
    () =>
      safeGet(budget, async () => ({ ok: true, reason: "", addresses: [] }), {
        id: "home",
        url: "http://169.254.169.254/",
        accept: "*/*",
        follow: true,
        maxBytes: 1000,
      }),
    /metadata/,
  );
  assert.deepEqual(calls, []);
});

test("robots groups and Content-Signal lines", () => {
  const file = parseRobots(
    [
      "User-agent: *",
      "Content-Signal: /blog/ ai-train=no, search=yes",
      "Allow: /",
      "",
      "User-agent: GPTBot",
      "Disallow: /",
      "",
      "Sitemap: https://example.com/sitemap.xml",
    ].join("\n"),
    "text/plain",
  );
  assert.equal(decideCrawler(file, "GPTBot").allowed, false);
  assert.equal(decideCrawler(file, "OAI-SearchBot").allowed, true);
  assert.equal(decideCrawler(null, "GPTBot").allowed, true);
  const signal = parseSignal("/blog/ ai-train=no, search=yes");
  assert.equal(signal.broken, false);
  assert.equal(signal.path, "/blog/");
  assert.equal(signal.pairs.length, 2);
  assert.equal(parseSignal("train=maybe").broken, true);
  const report = crawlerReport(file);
  assert.equal(report.find((row) => row.token === "GPTBot")?.role, "training");
});

test("content score ignores a missing MCP card, SaaS does not", () => {
  const content = assemble(fixture("content"));
  const saas = assemble(fixture("saas"));
  const mcp = content.checks.find((check) => check.id === "mcp");
  assert.equal(mcp?.status, "skip");
  assert.equal(mcp?.scored, false);
  assert.equal(mcp?.fix, null);
  assert.match(mcp?.doNot ?? "", /unless the service/i);
  assert.equal(content.score, 100);
  assert.ok(saas.score < content.score);
  assert.equal(saas.checks.find((check) => check.id === "mcp")?.status, "fail");
  assert.equal(saas.subscores.act?.score != null, true);
  assert.equal(content.subscores.act, null);
});

test("rate limit allows 10 scans an hour and then waits", () => {
  resetRateLimit();
  for (let i = 0; i < 10; i++)
    assert.equal(takeRateLimit("203.0.113.8", 1_000).ok, true);
  const blocked = takeRateLimit("203.0.113.8", 1_000);
  assert.equal(blocked.ok, false);
  assert.ok(blocked.retryAfter > 0);
  assert.equal(takeRateLimit("203.0.113.9", 1_000).ok, true);
  resetRateLimit();
});

function doc(id, url, status, body, headers = {}, contentType = "text/plain") {
  return {
    id,
    requestedUrl: url,
    url,
    status,
    contentType,
    headers,
    body,
    truncated: false,
    error: null,
  };
}

function fixture(siteType) {
  const origin = "https://example.com";
  const html = `<!doctype html><html><head><title>Example</title>
    <script type="application/ld+json">{"@context":"https://schema.org","@type":"WebSite","name":"Example","url":"${origin}/"}</script>
    </head><body><h1>Example</h1><p>${"Useful public text for agents. ".repeat(30)}</p></body></html>`;
  const robots = [
    "User-agent: *",
    "Content-Signal: search=yes, ai-input=yes, ai-train=no",
    "Allow: /",
    "",
    "Sitemap: https://example.com/sitemap.xml",
  ].join("\n");
  const llms = [
    "# Example",
    "",
    "> A small site.",
    "",
    "## Docs",
    "",
    "- [Home](https://example.com/): Start here.",
  ].join("\n");
  const missing = (id, path) =>
    doc(id, `${origin}${path}`, 404, "missing", {}, "text/plain");
  const extras = {};
  for (const [id, path] of [
    ["ai-catalog", "/.well-known/ai-catalog.json"],
    ["mcp-card", "/.well-known/mcp/server-card.json"],
    ["mcp-json", "/.well-known/mcp.json"],
    ["agent-card", "/.well-known/agent-card.json"],
    ["api-catalog", "/.well-known/api-catalog"],
    ["openapi", "/openapi.json"],
    ["oauth-resource", "/.well-known/oauth-protected-resource"],
    ["oauth-as", "/.well-known/oauth-authorization-server"],
    ["openid", "/.well-known/openid-configuration"],
    ["auth-md", "/auth.md"],
    ["agents-wk", "/.well-known/agents.json"],
    ["agents-root", "/agents.json"],
    ["poppy", "/.well-known/poppy.json"],
    ["agent-skills", "/.well-known/agent-skills/index.json"],
    ["web-bot-auth", "/.well-known/http-message-signatures-directory"],
    ["ucp", "/.well-known/ucp"],
    ["x402", "/.well-known/x402"],
    ["acp", "/.well-known/acp.json"],
    ["mpp", "/.well-known/mpp"],
  ]) {
    extras[id] = missing(id, path);
  }
  return {
    inputUrl: `${origin}/`,
    finalUrl: `${origin}/`,
    siteType,
    scannedAt: "2026-11-14T00:00:00.000Z",
    elapsedMs: 10,
    fetches: 3,
    home: doc(
      "home",
      `${origin}/`,
      200,
      html,
      {
        link: '<https://example.com/>; rel="canonical", <https://example.com/index.md>; rel="alternate"; type="text/markdown", <https://example.com/llms.txt>; rel="describedby"',
        "strict-transport-security": "max-age=60",
        "x-frame-options": "DENY",
        "x-content-type-options": "nosniff",
      },
      "text/html",
    ),
    robots: doc("robots", `${origin}/robots.txt`, 200, robots),
    sitemap: doc(
      "sitemap",
      `${origin}/sitemap.xml`,
      200,
      '<?xml version="1.0"?><urlset></urlset>',
      {},
      "application/xml",
    ),
    sitemapNote: null,
    llms: doc("llms", `${origin}/llms.txt`, 200, llms, {}, "text/plain"),
    llmsFull: doc(
      "llms-full",
      `${origin}/llms-full.txt`,
      200,
      `# Full\n\n${"Paragraph. ".repeat(80)}`,
      {},
      "text/plain",
    ),
    markdown: doc(
      "markdown",
      `${origin}/`,
      200,
      "# Example\n\nHello.\n",
      { vary: "Accept" },
      "text/markdown; charset=utf-8",
    ),
    mdVariants: [
      doc(
        "md-1",
        `${origin}/index.md`,
        200,
        "# Example\n\nHello.\n",
        {},
        "text/markdown",
      ),
    ],
    extras,
    linkProbes: [],
    dnsAid: [
      {
        name: "_index._agents.example.com",
        type: "HTTPS",
        found: false,
        ad: false,
        data: [],
        error: null,
      },
    ],
  };
}
