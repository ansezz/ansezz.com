/**
 * Emit 301s for every tag slug retired by the taxonomy migration.
 *
 * Rules are PREPENDED. public/_redirects ends with a `/*` catch-all, and
 * Cloudflare Pages stops at the first match — anything below `/*` is dead.
 *
 * Idempotent: strips its own previously generated block (bounded by the
 * marker comments) before writing, so re-running never duplicates rules.
 *
 *   node scripts/gen-tag-redirects.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";
import { ALIAS } from "./tag-map.mjs";

const MARKER_START = "# --- generated: retired tag slugs ---";
const MARKER_END = "# --- end generated ---";

const rules = [...ALIAS.entries()]
  .filter(([alias, canonical]) => alias !== canonical)
  .sort(([a], [b]) => a.localeCompare(b))
  .map(
    ([alias, canonical]) => `/blog/tag/${alias}/  /blog/tag/${canonical}/  301`,
  );

const path = "public/_redirects";
const existing = readFileSync(path, "utf8");

// Strip any previous generated block so this script is idempotent.
const cleaned = existing
  .replace(new RegExp(`${MARKER_START}[\\s\\S]*?${MARKER_END}\\n*`), "")
  .trimStart();

const block = [MARKER_START, ...rules, MARKER_END, "", cleaned].join("\n");
writeFileSync(path, block, "utf8");

console.log(
  `✓ wrote ${rules.length} redirect rules above the existing ${cleaned.split("\n").filter(Boolean).length} rule(s)`,
);
