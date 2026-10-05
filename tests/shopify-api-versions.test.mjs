// Checks the computed calendar against the table on
// https://shopify.dev/docs/api/usage/versioning as read on 2026-10-05.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  calendar,
  checkVersion,
  latestStable,
  oldestAccessible,
  parseVersion,
  monthsAndDays,
} from "../src/lib/shopify-api-versions.ts";

const NOW = new Date("2026-10-05T08:00:00Z");

test("matches the shopify.dev table on 2026-10-05", () => {
  const rows = Object.fromEntries(calendar(NOW, 6).map((r) => [r.name, r]));
  const expected = {
    "2025-04": [
      "2025-04-01T17:00:00.000Z",
      "2026-04-16T15:00:00.000Z",
      "retired",
    ],
    "2025-07": [
      "2025-07-01T17:00:00.000Z",
      "2026-07-16T15:00:00.000Z",
      "retired",
    ],
    "2025-10": [
      "2025-10-01T17:00:00.000Z",
      "2026-10-16T15:00:00.000Z",
      "unsupported",
    ],
    "2026-01": [
      "2026-01-01T17:00:00.000Z",
      "2027-01-16T15:00:00.000Z",
      "supported",
    ],
    "2026-04": [
      "2026-04-01T17:00:00.000Z",
      "2027-04-16T15:00:00.000Z",
      "supported",
    ],
    "2026-07": [
      "2026-07-01T17:00:00.000Z",
      "2027-07-16T15:00:00.000Z",
      "supported",
    ],
    "2026-10": [
      "2026-10-01T17:00:00.000Z",
      "2027-10-16T15:00:00.000Z",
      "latest",
    ],
    "2027-01": [
      "2027-01-01T17:00:00.000Z",
      "2028-01-16T15:00:00.000Z",
      "release-candidate",
    ],
  };
  for (const [name, [rel, acc, status]] of Object.entries(expected)) {
    assert.equal(rows[name].releasedAt.toISOString(), rel, name);
    assert.equal(rows[name].accessibleUntil.toISOString(), acc, name);
    assert.equal(rows[name].status, status, name);
  }
});

test("release moment is 17:00 UTC on the first day of the quarter", () => {
  assert.equal(latestStable(new Date("2026-10-01T16:59:59Z")).name, "2026-07");
  assert.equal(latestStable(new Date("2026-10-01T17:00:00Z")).name, "2026-10");
  assert.equal(latestStable(new Date("2027-01-01T10:00:00Z")).name, "2026-10");
});

test("retired versions fall forward to the oldest accessible one", () => {
  assert.equal(oldestAccessible(NOW).name, "2025-10");
  assert.equal(
    oldestAccessible(new Date("2026-10-16T15:00:00Z")).name,
    "2026-01",
  );
  const c = checkVersion(parseVersion("2024-10"), NOW);
  assert.equal(c.status, "retired");
  assert.equal(c.fallsForwardTo.name, "2025-10");
});

test("months left", () => {
  const c = checkVersion(parseVersion("2026-01"), NOW);
  assert.equal(c.status, "supported");
  assert.equal(c.supportLeft, "2 months, 27 days");
  assert.deepEqual(
    monthsAndDays(
      new Date("2026-01-31T00:00:00Z"),
      new Date("2026-03-01T00:00:00Z"),
    ),
    { months: 1, days: 1 },
  );
});

test("parseVersion rejects non-quarter months", () => {
  assert.equal(parseVersion("2026-02"), null);
  assert.equal(parseVersion("unstable"), null);
  assert.equal(parseVersion(" 2026-07 ").name, "2026-07");
});
