// Shopify API version calendar, computed from the documented rule on
// https://shopify.dev/docs/api/usage/versioning (checked 2026-10-05):
//
// - A new version ships every three months, at 17:00 UTC on the first day of
//   the quarter (January, April, July, October). Names are YYYY-MM.
// - Each stable version is supported for at least 12 months, with at least
//   nine months of overlap between consecutive versions.
// - Shopify's table lists each version as accessible until the 16th of the
//   month 12 months after release, at 15:00 UTC. After that, requests fall
//   forward to the oldest accessible stable version.
// - The next quarter's release candidate is published on the same day as
//   each stable release.

export const QUARTER_MONTHS = [1, 4, 7, 10] as const;

export type VersionStatus =
  | "release-candidate"
  | "latest"
  | "supported"
  | "unsupported"
  | "retired"
  | "future";

export interface ApiVersion {
  name: string;
  year: number;
  month: number;
  releasedAt: Date;
  /** End of the 12 month support window (the next year's same-quarter release). */
  supportEndsAt: Date;
  /** Last moment Shopify still answers requests that name this version. */
  accessibleUntil: Date;
}

export function versionName(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, "0")}`;
}

export function parseVersion(name: string): ApiVersion | null {
  const m = /^\s*(\d{4})-(\d{2})\s*$/.exec(name);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  if (!(QUARTER_MONTHS as readonly number[]).includes(month)) return null;
  if (year < 2019 || year > 2100) return null;
  return makeVersion(year, month);
}

export function makeVersion(year: number, month: number): ApiVersion {
  return {
    name: versionName(year, month),
    year,
    month,
    releasedAt: new Date(Date.UTC(year, month - 1, 1, 17, 0, 0)),
    supportEndsAt: new Date(Date.UTC(year + 1, month - 1, 1, 17, 0, 0)),
    accessibleUntil: new Date(Date.UTC(year + 1, month - 1, 16, 15, 0, 0)),
  };
}

/** The version released most recently at `now` (the latest stable). */
export function latestStable(now: Date): ApiVersion {
  let y = now.getUTCFullYear();
  let q = Math.floor(now.getUTCMonth() / 3);
  let v = makeVersion(y, q * 3 + 1);
  if (v.releasedAt.getTime() > now.getTime()) {
    q -= 1;
    if (q < 0) {
      q = 3;
      y -= 1;
    }
    v = makeVersion(y, q * 3 + 1);
  }
  return v;
}

export function shiftQuarters(v: ApiVersion, n: number): ApiVersion {
  const idx = v.year * 4 + (v.month - 1) / 3 + n;
  return makeVersion(Math.floor(idx / 4), (idx % 4) * 3 + 1);
}

export function statusAt(v: ApiVersion, now: Date): VersionStatus {
  const t = now.getTime();
  const latest = latestStable(now);
  if (v.name === shiftQuarters(latest, 1).name) return "release-candidate";
  if (t < v.releasedAt.getTime()) return "future";
  if (v.name === latest.name) return "latest";
  if (t < v.supportEndsAt.getTime()) return "supported";
  if (t < v.accessibleUntil.getTime()) return "unsupported";
  return "retired";
}

/** The oldest version Shopify still answers at `now`; retired versions fall forward to it. */
export function oldestAccessible(now: Date): ApiVersion {
  let v = shiftQuarters(latestStable(now), -4);
  while (v.accessibleUntil.getTime() <= now.getTime()) v = shiftQuarters(v, 1);
  return v;
}

export interface CalendarRow extends ApiVersion {
  status: VersionStatus;
}

/** From `back` quarters before the latest stable to the release candidate. */
export function calendar(now: Date, back = 6): CalendarRow[] {
  const latest = latestStable(now);
  const rows: CalendarRow[] = [];
  for (let i = -back; i <= 1; i++) {
    const v = shiftQuarters(latest, i);
    rows.push({ ...v, status: statusAt(v, now) });
  }
  return rows.reverse();
}

export const STATUS_LABEL: Record<VersionStatus, string> = {
  "release-candidate": "Release candidate",
  latest: "Latest stable",
  supported: "Supported",
  unsupported: "Unsupported, still answers",
  retired: "Retired, falls forward",
  future: "Not released yet",
};

const DAY = 86_400_000;

/** Whole calendar months and leftover days from a to b (b > a). */
export function monthsAndDays(
  a: Date,
  b: Date,
): { months: number; days: number } {
  if (b.getTime() <= a.getTime()) return { months: 0, days: 0 };
  let months =
    (b.getUTCFullYear() - a.getUTCFullYear()) * 12 +
    (b.getUTCMonth() - a.getUTCMonth());
  // Same day of month m months later, clamped to the month's last day.
  const anchor = (m: number) => {
    const y = a.getUTCFullYear();
    const mo = a.getUTCMonth() + m;
    const last = new Date(Date.UTC(y, mo + 1, 0)).getUTCDate();
    return Date.UTC(
      y,
      mo,
      Math.min(a.getUTCDate(), last),
      a.getUTCHours(),
      a.getUTCMinutes(),
    );
  };
  if (anchor(months) > b.getTime()) months -= 1;
  const days = Math.floor((b.getTime() - anchor(months)) / DAY);
  return { months, days };
}

export function formatSpan(a: Date, b: Date): string {
  const { months, days } = monthsAndDays(a, b);
  const parts: string[] = [];
  if (months) parts.push(`${months} month${months === 1 ? "" : "s"}`);
  if (days || !months) parts.push(`${days} day${days === 1 ? "" : "s"}`);
  return parts.join(", ");
}

export function formatUtc(d: Date, withTime = false): string {
  const date = d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
  if (!withTime) return date;
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mm = String(d.getUTCMinutes()).padStart(2, "0");
  return `${date}, ${hh}:${mm} UTC`;
}

export interface VersionCheck {
  version: ApiVersion;
  status: VersionStatus;
  latest: ApiVersion;
  /** Support time left (0 when already unsupported). */
  supportLeft: string;
  accessibleLeft: string;
  fallsForwardTo: ApiVersion | null;
  verdict: string;
}

export function checkVersion(v: ApiVersion, now: Date): VersionCheck {
  const status = statusAt(v, now);
  const latest = latestStable(now);
  const supportLeft = formatSpan(now, v.supportEndsAt);
  const accessibleLeft = formatSpan(now, v.accessibleUntil);
  let verdict: string;
  let fallsForwardTo: ApiVersion | null = null;
  switch (status) {
    case "future":
      verdict = `${v.name} is not out yet. It ships on ${formatUtc(v.releasedAt, true)}.`;
      break;
    case "release-candidate":
      verdict = `${v.name} is the release candidate. It can still change, so do not use it in production. It becomes stable on ${formatUtc(v.releasedAt, true)}.`;
      break;
    case "latest":
      verdict = `${v.name} is the latest stable version. Supported for ${supportLeft} more, until ${formatUtc(v.supportEndsAt)}.`;
      break;
    case "supported":
      verdict = `${v.name} is supported for ${supportLeft} more, until ${formatUtc(v.supportEndsAt)}. Plan the move to ${latest.name}.`;
      break;
    case "unsupported":
      verdict = `${v.name} is out of support. Shopify still answers it for ${accessibleLeft}, until ${formatUtc(v.accessibleUntil, true)}. Upgrade now.`;
      break;
    case "retired":
      fallsForwardTo = oldestAccessible(now);
      verdict = `${v.name} is retired. Requests that name it are answered by ${fallsForwardTo.name}, the oldest version still accessible, so your app already runs on a version you did not test.`;
      break;
  }
  return {
    version: v,
    status,
    latest,
    supportLeft:
      status === "unsupported" || status === "retired" ? "0 days" : supportLeft,
    accessibleLeft: status === "retired" ? "0 days" : accessibleLeft,
    fallsForwardTo,
    verdict,
  };
}
