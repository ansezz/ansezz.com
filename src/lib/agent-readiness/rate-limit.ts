/**
 * Per-isolate rate limit. Workers free has no key-value store here, so the
 * counter lives in memory: 10 scans an hour and 30 a day for one IP.
 * A new isolate starts fresh. That is enough to blunt a tight loop.
 */

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const HOUR_MAX = 10;
const DAY_MAX = 30;

interface Bucket {
  hourStart: number;
  hour: number;
  dayStart: number;
  day: number;
}

const buckets = new Map<string, Bucket>();

export interface RateResult {
  ok: boolean;
  retryAfter: number;
}

export function takeRateLimit(ip: string, now = Date.now()): RateResult {
  if (buckets.size > 2000) {
    for (const [key, bucket] of buckets) {
      if (now - bucket.dayStart >= DAY_MS) buckets.delete(key);
    }
  }
  let bucket = buckets.get(ip);
  if (!bucket) {
    bucket = { hourStart: now, hour: 0, dayStart: now, day: 0 };
    buckets.set(ip, bucket);
  }
  if (now - bucket.hourStart >= HOUR_MS) {
    bucket.hourStart = now;
    bucket.hour = 0;
  }
  if (now - bucket.dayStart >= DAY_MS) {
    bucket.dayStart = now;
    bucket.day = 0;
  }
  if (bucket.hour >= HOUR_MAX) {
    return {
      ok: false,
      retryAfter: Math.max(
        1,
        Math.ceil((bucket.hourStart + HOUR_MS - now) / 1000),
      ),
    };
  }
  if (bucket.day >= DAY_MAX) {
    return {
      ok: false,
      retryAfter: Math.max(
        1,
        Math.ceil((bucket.dayStart + DAY_MS - now) / 1000),
      ),
    };
  }
  bucket.hour += 1;
  bucket.day += 1;
  return { ok: true, retryAfter: 0 };
}

/** Test helper. Production code never needs to reset the table. */
export function resetRateLimit(): void {
  buckets.clear();
}
