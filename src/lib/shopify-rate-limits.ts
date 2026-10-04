/**
 * Shopify API rate-limit planner. Pure functions, no DOM.
 *
 * Limits checked on shopify.dev on 4 October 2026:
 *   - GraphQL Admin API (shopify.dev/docs/apps/build/apis/graphql-admin/rate-limits):
 *     restore rate per app and store by plan: Standard 100 points/s,
 *     Advanced 200, Plus 1,000, Enterprise (Commerce Components) 2,000.
 *     A single query may not exceed a requested cost of 1,000 points. The
 *     bucket must hold the requested cost before a query runs; the
 *     difference to the actual cost is refunded afterwards. Bulk operations
 *     have no cost or rate limits.
 *   - REST Admin API (shopify.dev/docs/api/admin-rest/usage/rate-limits),
 *     legacy since October 1, 2024: Standard 2 requests/s, Advanced 4,
 *     Plus 20, Enterprise 40. Bucket 40 requests (400 on Plus).
 *   - Storefront API (shopify.dev/docs/api/storefront#rate-limits): no fixed
 *     limit for buyer traffic; bots and checkout creation are throttled;
 *     tokenless access has a query complexity limit of 1,000.
 *   - All APIs (shopify.dev/docs/api/usage/limits): input arrays max 250
 *     items; pagination caps at 25,000 objects; 1 second backoff advised.
 * The GraphQL bucket size is not listed per plan. Read it from
 * extensions.cost.throttleStatus.maximumAvailable. The default here is an
 * assumption: 20 times the restore rate, the ratio in the docs' example
 * response (maximumAvailable 1000, restoreRate 50). It is editable.
 */

export type ShopifyApi = "graphql" | "rest" | "storefront";
export type ShopifyPlan = "standard" | "advanced" | "plus" | "enterprise";

export const PLAN_LABEL: Record<ShopifyPlan, string> = {
  standard: "Standard",
  advanced: "Advanced",
  plus: "Shopify Plus",
  enterprise: "Enterprise (Commerce Components)",
};

/** GraphQL Admin restore rate, points per second. */
export const GRAPHQL_RATE: Record<ShopifyPlan, number> = {
  standard: 100,
  advanced: 200,
  plus: 1000,
  enterprise: 2000,
};

/** REST Admin leak rate, requests per second. */
export const REST_RATE: Record<ShopifyPlan, number> = {
  standard: 2,
  advanced: 4,
  plus: 20,
  enterprise: 40,
};

/**
 * Bucket sizes. REST standard (40) and Plus (400) are documented. The rest
 * assume 20 seconds of leak or restore, the ratio the documented values use.
 */
export function defaultBucket(
  api: ShopifyApi,
  plan: ShopifyPlan,
): { size: number; documented: boolean } {
  if (api === "rest") {
    if (plan === "standard") return { size: 40, documented: true };
    if (plan === "plus") return { size: 400, documented: true };
    return { size: REST_RATE[plan] * 20, documented: false };
  }
  return { size: GRAPHQL_RATE[plan] * 20, documented: false };
}

export const SINGLE_QUERY_MAX = 1000;
export const MAX_PAGE_SIZE = 250;
export const PAGINATION_CAP = 25000;

export interface PlanInputs {
  api: "graphql" | "rest";
  /** Restore rate: points/s (GraphQL) or requests/s (REST). */
  rate: number;
  /** Bucket size: points (GraphQL) or requests (REST). */
  bucket: number;
  /** Records to sync. */
  records: number;
  /** Records returned or written per request. */
  perRequest: number;
  /** GraphQL only: requested cost of one request. */
  requestedCost: number;
  /** GraphQL only: actual cost of one request. */
  actualCost: number;
  /** Average response time of one request, seconds. */
  latency: number;
  /** Requests in flight at once. */
  concurrency: number;
}

export interface PlanResult {
  requests: number;
  /** Requests per second the rate limit allows at steady state. */
  rateLimitedRps: number;
  /** Requests per second your concurrency and latency allow. */
  latencyLimitedRps: number;
  /** Requests per second you actually get. */
  rps: number;
  recordsPerSecond: number;
  /** Seconds to finish, including the initial burst from a full bucket. */
  seconds: number;
  /** Which side limits you. */
  bottleneck: "rate" | "latency";
  /** Smallest concurrency that keeps the rate limit busy. */
  suggestedConcurrency: number;
  /** GraphQL: biggest page under the 1,000 point cap (and 250 max). */
  suggestedBatch: number;
  /** Requests that run right away from a full bucket. */
  burstRequests: number;
  errors: string[];
  warnings: string[];
}

const pos = (n: number): number => (Number.isFinite(n) && n > 0 ? n : 0);

export function planSync(i: PlanInputs): PlanResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const rate = pos(i.rate);
  const bucket = pos(i.bucket);
  const records = Math.ceil(pos(i.records));
  const perReq = Math.max(1, Math.floor(pos(i.perRequest)));
  const latency = pos(i.latency);
  const conc = Math.max(1, Math.floor(pos(i.concurrency)));
  const requests = records > 0 ? Math.ceil(records / perReq) : 0;

  if (perReq > MAX_PAGE_SIZE)
    warnings.push(
      `Shopify caps pages and input arrays at ${MAX_PAGE_SIZE} items, so ${perReq} per request will not work.`,
    );

  let costPerReq = 1; // REST: every request is one marble
  let upfront = 1;
  let suggestedBatch = Math.min(MAX_PAGE_SIZE, perReq);
  if (i.api === "graphql") {
    upfront = pos(i.requestedCost);
    costPerReq = pos(i.actualCost) || upfront;
    if (upfront === 0)
      errors.push(
        "Enter the requested cost of one request (from extensions.cost.requestedQueryCost).",
      );
    if (upfront > SINGLE_QUERY_MAX)
      errors.push(
        `Requested cost ${upfront} is over the ${SINGLE_QUERY_MAX} point single query limit. Shopify rejects it before it runs. Ask for fewer records per request.`,
      );
    if (upfront > bucket && bucket > 0)
      errors.push(
        `Requested cost ${upfront} is bigger than the bucket (${bucket}). It can never run.`,
      );
    if (costPerReq > upfront)
      warnings.push(
        "Actual cost is usually equal to or lower than requested cost. Check the numbers.",
      );
    const perRecord = upfront / perReq;
    suggestedBatch =
      perRecord > 0
        ? Math.max(
            1,
            Math.min(MAX_PAGE_SIZE, Math.floor(SINGLE_QUERY_MAX / perRecord)),
          )
        : perReq;
  }

  const rateLimitedRps = costPerReq > 0 ? rate / costPerReq : 0;
  const latencyLimitedRps = latency > 0 ? conc / latency : Infinity;
  const rps = Math.min(rateLimitedRps, latencyLimitedRps);
  const bottleneck = rateLimitedRps <= latencyLimitedRps ? "rate" : "latency";

  // A full bucket lets the first requests through without waiting.
  const burstRequests =
    costPerReq > 0 && bucket >= upfront
      ? Math.floor((bucket - upfront) / costPerReq) + 1
      : 0;
  const rateSeconds =
    rate > 0
      ? Math.max(0, requests * costPerReq - Math.max(0, bucket - upfront)) /
        rate
      : Infinity;
  const latencySeconds = latency > 0 ? Math.ceil(requests / conc) * latency : 0;
  const seconds =
    requests === 0
      ? 0
      : errors.length
        ? Infinity
        : Math.max(rateSeconds, latencySeconds);

  const suggestedConcurrency = Math.max(1, Math.ceil(rateLimitedRps * latency));

  if (records > PAGINATION_CAP)
    warnings.push(
      `Shopify stops paginating after ${PAGINATION_CAP.toLocaleString("en-US")} objects. For reads this big, use a bulk operation, which has no cost or rate limits.`,
    );
  if (i.api === "rest")
    warnings.push(
      "The REST Admin API is legacy since October 1, 2024. New apps should use the GraphQL Admin API.",
    );

  return {
    requests,
    rateLimitedRps,
    latencyLimitedRps,
    rps,
    recordsPerSecond: rps * perReq,
    seconds,
    bottleneck,
    suggestedConcurrency,
    suggestedBatch,
    burstRequests,
    errors,
    warnings,
  };
}

/** "2 h 5 min", "3 min 20 s", "42 s". */
export function formatDuration(s: number): string {
  if (!Number.isFinite(s)) return "Never";
  if (s < 1) return "under 1 s";
  const t = Math.round(s);
  const d = Math.floor(t / 86400);
  const h = Math.floor((t % 86400) / 3600);
  const m = Math.floor((t % 3600) / 60);
  const sec = t % 60;
  if (d) return `${d} d ${h} h`;
  if (h) return `${h} h ${m} min`;
  if (m) return `${m} min ${sec} s`;
  return `${sec} s`;
}

export interface CostInfo {
  requested: number | null;
  actual: number | null;
  maximumAvailable: number | null;
  currentlyAvailable: number | null;
  restoreRate: number | null;
}

/**
 * Reads the cost block from a GraphQL Admin response. Accepts the whole
 * response, the "extensions" object or just "cost".
 */
export function parseCostExtension(text: string): CostInfo {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(
      "That is not valid JSON. Paste the whole response or its extensions.cost block.",
    );
  }
  const o = data as Record<string, any>;
  const cost =
    o?.extensions?.cost ??
    o?.cost ??
    (o && "requestedQueryCost" in o ? o : null);
  if (!cost || typeof cost !== "object")
    throw new Error(
      'No "extensions.cost" found. Shopify returns it on every GraphQL Admin response.',
    );
  const n = (v: unknown): number | null =>
    typeof v === "number" && Number.isFinite(v) ? v : null;
  const t = cost.throttleStatus ?? {};
  return {
    requested: n(cost.requestedQueryCost),
    actual: n(cost.actualQueryCost),
    maximumAvailable: n(t.maximumAvailable),
    currentlyAvailable: n(t.currentlyAvailable),
    restoreRate: n(t.restoreRate),
  };
}
