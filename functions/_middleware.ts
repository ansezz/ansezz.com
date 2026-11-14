// Content negotiation for the Markdown twins written into dist/ at build time.
// A request whose Accept header prefers text/markdown gets that file, with
// the HTML page as the fallback. Direct *.md URLs are still files. Nothing
// here redirects or 404s when a twin is missing.

import {
  appendVary,
  buildLinkHeader,
  canonicalPathForMarkdown,
  absoluteUrl,
  isStaticAssetPath,
  markdownAlternatePath,
  prefersMarkdown,
} from "../src/lib/agent-markdown.ts";

// Same line as public/robots.txt. Markdown for Agents keeps an origin
// Content-Signal. If the origin is silent, Cloudflare writes ai-train=yes.
const CONTENT_SIGNAL = "search=yes, ai-input=yes, ai-train=no";

function applyContentSignal(headers: Headers): void {
  headers.set("Content-Signal", CONTENT_SIGNAL);
}

interface AssetBinding {
  fetch(input: Request | string): Promise<Response>;
}

interface MiddlewareContext {
  request: Request;
  env: { ASSETS?: AssetBinding };
  next: () => Promise<Response>;
}

function withMarkdownType(
  headers: Headers,
  canonicalPath: string | null,
): Headers {
  const next = new Headers(headers);
  next.set("Content-Type", "text/markdown; charset=utf-8");
  next.set("X-Content-Type-Options", "nosniff");
  applyContentSignal(next);
  next.set("Vary", appendVary(next.get("Vary"), "Accept"));
  if (canonicalPath) {
    next.append(
      "Link",
      `<${absoluteUrl(canonicalPath)}>; rel="canonical", <${absoluteUrl("/llms.txt")}>; rel="describedby"`,
    );
  }
  return next;
}

async function markdownAsset(
  request: Request,
  env: MiddlewareContext["env"],
  mdPath: string,
): Promise<Response | null> {
  if (!env.ASSETS) return null;
  const assetUrl = new URL(mdPath, request.url);
  const asset = await env.ASSETS.fetch(assetUrl.toString());
  if (!asset.ok) return null;
  const type = asset.headers.get("content-type") ?? "";
  // A missing asset can come back as the HTML 404 page.
  if (type.includes("text/html")) return null;
  const headers = withMarkdownType(
    asset.headers,
    canonicalPathForMarkdown(mdPath),
  );
  if (request.method === "HEAD")
    return new Response(null, { status: 200, headers });
  return new Response(asset.body, { status: 200, headers });
}

function decorate(request: Request, response: Response): Response {
  const path = new URL(request.url).pathname;
  if (response.status >= 300 && response.status < 400) return response;

  if (path.endsWith(".md")) {
    const type = response.headers.get("content-type") ?? "";
    // A missing twin can come back as the HTML 404 page. Treat that as HTML
    // so it still gets the signal. A real Markdown file is rewritten below.
    if (response.ok && !type.includes("text/html")) {
      const headers = withMarkdownType(
        response.headers,
        canonicalPathForMarkdown(path),
      );
      return new Response(request.method === "HEAD" ? null : response.body, {
        status: response.status,
        statusText: response.statusText,
        headers,
      });
    }
    if (!type.includes("text/html")) return response;
  }

  const type = response.headers.get("content-type") ?? "";
  if (!type.includes("text/html")) return response;
  const headers = new Headers(response.headers);
  applyContentSignal(headers);
  headers.set("Vary", appendVary(headers.get("Vary"), "Accept"));
  if (response.status === 200) {
    headers.append(
      "Link",
      buildLinkHeader(path, markdownAlternatePath(path) !== null),
    );
  }
  return new Response(request.method === "HEAD" ? null : response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export const onRequest = async (
  context: MiddlewareContext,
): Promise<Response> => {
  const { request } = context;
  const path = new URL(request.url).pathname;
  // The agent readiness scan lives under /api/. Do not negotiate Markdown
  // for it, and do not add Link headers to its JSON.
  if (path === "/api" || path.startsWith("/api/")) return context.next();
  if (request.method !== "GET" && request.method !== "HEAD")
    return context.next();
  if (isStaticAssetPath(path)) return context.next();

  if (prefersMarkdown(request.headers.get("accept"))) {
    const mdPath = markdownAlternatePath(path);
    if (mdPath) {
      try {
        const md = await markdownAsset(request, context.env, mdPath);
        if (md) return md;
      } catch {
        // No twin, or the asset binding failed: serve the HTML page.
      }
    }
  }

  const response = await context.next();
  try {
    return decorate(request, response);
  } catch {
    return response;
  }
};
