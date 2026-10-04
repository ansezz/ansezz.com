/**
 * Prompt caching cost maths. Pure functions, no DOM.
 *
 * Model: every request sends a repeated prefix (P tokens) plus a part that
 * changes (U tokens) and gets O output tokens back.
 *   - Without caching, all P + U input tokens pay the base input price.
 *   - With caching, a hit reads the prefix at (1 - readDiscount) x base.
 *     A miss writes the prefix at (1 + writePremium) x base.
 *   - U and O are billed the same way in both cases.
 * Break even: a hit saves readDiscount x P, a miss costs writePremium x P
 * extra, so caching wins when hitRate > writePremium / (writePremium + readDiscount).
 */

export interface PromptCacheInputs {
  /** Base input price, $ per 1M tokens. */
  priceIn: number;
  /** Output price, $ per 1M tokens. */
  priceOut: number;
  /** Extra cost of a cache write, as a fraction of base input (0.25 = +25%). */
  writePremium: number;
  /** Discount on a cache read, as a fraction of base input (0.9 = 90% off). */
  readDiscount: number;
  /** Repeated prefix tokens per request. */
  prefixTokens: number;
  /** Tokens that change on every request (never cached). */
  uncachedTokens: number;
  /** Output tokens per request. */
  outputTokens: number;
  requestsPerDay: number;
  /** Share of requests that hit the cache, 0 to 1. */
  hitRate: number;
}

export interface CostLines {
  /** Prefix tokens billed at base price (no cache) or as hits and misses. */
  prefix: number;
  uncached: number;
  output: number;
  total: number;
}

export interface PromptCacheResult {
  /** Average cost of one request, $. */
  perRequestNoCache: number;
  perRequestCache: number;
  perDayNoCache: number;
  perDayCache: number;
  /** 30 day month. */
  perMonthNoCache: number;
  perMonthCache: number;
  /** Monthly savings, $ (negative when caching costs more). */
  savedPerMonth: number;
  /** Savings as a share of the no cache bill, 0 to 1 (can be negative). */
  savedShare: number;
  /** Hit rate above which caching is cheaper, 0 to 1. null if never cheaper. */
  breakEvenHitRate: number | null;
  /** Monthly line items. */
  monthNoCache: CostLines;
  monthCache: CostLines & { reads: number; writes: number };
}

export const DAYS_PER_MONTH = 30;

const clamp01 = (n: number): number => Math.min(1, Math.max(0, n));
const nonNeg = (n: number): number => (Number.isFinite(n) && n > 0 ? n : 0);

export function promptCacheCost(i: PromptCacheInputs): PromptCacheResult {
  const pin = nonNeg(i.priceIn) / 1e6;
  const pout = nonNeg(i.priceOut) / 1e6;
  const w = nonNeg(i.writePremium);
  const d = clamp01(nonNeg(i.readDiscount));
  const h = clamp01(nonNeg(i.hitRate));
  const P = nonNeg(i.prefixTokens);
  const U = nonNeg(i.uncachedTokens);
  const O = nonNeg(i.outputTokens);
  const reqMonth = nonNeg(i.requestsPerDay) * DAYS_PER_MONTH;

  const prefixNo = P * pin;
  const uncached = U * pin;
  const output = O * pout;
  const reads = h * P * pin * (1 - d);
  const writes = (1 - h) * P * pin * (1 + w);

  const perRequestNoCache = prefixNo + uncached + output;
  const perRequestCache = reads + writes + uncached + output;
  const perMonthNoCache = perRequestNoCache * reqMonth;
  const perMonthCache = perRequestCache * reqMonth;
  const savedPerMonth = perMonthNoCache - perMonthCache;

  const breakEvenHitRate =
    w === 0 ? (d > 0 ? 0 : null) : d === 0 ? null : w / (w + d);

  return {
    perRequestNoCache,
    perRequestCache,
    perDayNoCache: perMonthNoCache / DAYS_PER_MONTH,
    perDayCache: perMonthCache / DAYS_PER_MONTH,
    perMonthNoCache,
    perMonthCache,
    savedPerMonth,
    savedShare: perMonthNoCache > 0 ? savedPerMonth / perMonthNoCache : 0,
    breakEvenHitRate,
    monthNoCache: {
      prefix: prefixNo * reqMonth,
      uncached: uncached * reqMonth,
      output: output * reqMonth,
      total: perMonthNoCache,
    },
    monthCache: {
      prefix: (reads + writes) * reqMonth,
      reads: reads * reqMonth,
      writes: writes * reqMonth,
      uncached: uncached * reqMonth,
      output: output * reqMonth,
      total: perMonthCache,
    },
  };
}

/** Formats dollars with enough precision for tiny per-request costs. */
export function formatUsd(n: number): string {
  const sign = n < 0 ? "-" : "";
  const a = Math.abs(n);
  if (a === 0) return "$0";
  if (a < 0.000001) return `${sign}<$0.000001`;
  if (a < 1) return `${sign}$${Number(a.toPrecision(3)).toString()}`;
  if (a < 100)
    return `${sign}$${a.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  return `${sign}$${Math.round(a).toLocaleString("en-US")}`;
}
