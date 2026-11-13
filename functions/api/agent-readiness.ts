// Public scan endpoint for /tools/agent-readiness-checker/.
// The browser cannot fetch a third-party site, so this function does.
// It only GETs a fixed list of paths on the submitted origin, after a
// DNS-over-HTTPS check that rejects private and metadata addresses.

import { ScanError } from "../../src/lib/agent-readiness/errors.ts";
import { takeRateLimit } from "../../src/lib/agent-readiness/rate-limit.ts";
import { scan } from "../../src/lib/agent-readiness/scan.ts";
import type { SiteType } from "../../src/lib/agent-readiness/types.ts";

interface HandlerContext {
  request: Request;
}

const SITE_TYPES = new Set<SiteType>([
  "content",
  "saas",
  "store",
  "everything",
]);

export const onRequest = async (context: HandlerContext): Promise<Response> => {
  const { request } = context;
  if (request.method !== "GET" && request.method !== "POST") {
    return json({ error: "Use GET or POST.", code: "method" }, 405);
  }

  const limit = takeRateLimit(clientIp(request));
  if (!limit.ok) {
    return json(
      {
        error: "Too many scans from this address. Wait and try again.",
        code: "rate",
        retryAfter: limit.retryAfter,
      },
      429,
      { "retry-after": String(limit.retryAfter) },
    );
  }

  try {
    const input = await readInput(request);
    if (input instanceof Response) return input;
    const report = await scan(input);
    return json(report, 200);
  } catch (error) {
    if (error instanceof ScanError) {
      return json(
        {
          error: error.message,
          code: error.code,
          fetches: error.fetches,
          blockedUrl: error.blockedUrl,
        },
        error.status,
      );
    }
    return json(
      { error: "The scan failed before it could finish.", code: "error" },
      500,
    );
  }
};

async function readInput(
  request: Request,
): Promise<{ url: string; siteType: SiteType } | Response> {
  let url = "";
  let siteTypeRaw: unknown = undefined;
  let typePresent = false;
  if (request.method === "GET") {
    const params = new URL(request.url).searchParams;
    url = params.get("url") ?? "";
    typePresent = params.has("type") || params.has("siteType");
    siteTypeRaw = params.get("type") ?? params.get("siteType");
  } else {
    const raw = await request.text();
    if (raw.length > 4000) {
      return json({ error: "The request is too large.", code: "input" }, 400);
    }
    if (!raw.trim()) {
      return json({ error: "Send a URL.", code: "input" }, 400);
    }
    try {
      const body = JSON.parse(raw) as {
        url?: unknown;
        siteType?: unknown;
        type?: unknown;
      };
      if (typeof body.url !== "string") {
        return json({ error: "Send a URL.", code: "input" }, 400);
      }
      url = body.url;
      typePresent = "siteType" in body || "type" in body;
      siteTypeRaw = body.siteType ?? body.type;
    } catch {
      return json({ error: "Send JSON with a url field.", code: "input" }, 400);
    }
  }
  if (!url.trim()) return json({ error: "Send a URL.", code: "input" }, 400);
  if (!typePresent || siteTypeRaw == null || siteTypeRaw === "") {
    return { url, siteType: "content" };
  }
  if (
    typeof siteTypeRaw !== "string" ||
    !SITE_TYPES.has(siteTypeRaw as SiteType)
  ) {
    return json(
      {
        error: "Site type must be content, saas, store, or everything.",
        code: "input",
      },
      400,
    );
  }
  return { url, siteType: siteTypeRaw as SiteType };
}

function clientIp(request: Request): string {
  const cf = request.headers.get("cf-connecting-ip")?.trim();
  if (cf) return cf;
  const forwarded = request.headers
    .get("x-forwarded-for")
    ?.split(",")[0]
    ?.trim();
  if (forwarded) return forwarded;
  return "local";
}

function json(
  data: unknown,
  status: number,
  extra?: Record<string, string>,
): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
      ...extra,
    },
  });
}
