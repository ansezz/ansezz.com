// Verification harness for the tag taxonomy. This repo has no test runner —
// this script is the test. Run it after any taxonomy change.
import { readdirSync, readFileSync, existsSync } from "node:fs";

const problems = [];
const fail = (msg) => problems.push(msg);

// Vocabulary floor: every tag in BLOG_TAGS must carry at least this many
// posts. Deliberately NOT TAG_OG_MIN_POSTS from consts.ts — that is the
// noindex/sitemap threshold. The two are equal today and mean different
// things; coupling them would make raising the indexing threshold fail the
// build across legitimate tags.
const MIN_POSTS_PER_TAG = 3;

// ── 1. Vocabulary shape ────────────────────────────────────────────────
const constsSrc = readFileSync("src/consts.ts", "utf8");
if (!constsSrc.includes("export const BLOG_TAGS")) {
  fail("consts.ts: BLOG_TAGS is not exported");
}

const { BLOG_TAGS } = await import("../src/consts.ts");
const keys = Object.keys(BLOG_TAGS);

if (keys.length !== 40) fail(`expected 40 tags, found ${keys.length}`);

const seenDescriptions = new Set();
for (const [key, entry] of Object.entries(BLOG_TAGS)) {
  if (!/^[a-z][a-z0-9-]*$/.test(key))
    fail(`tag key "${key}" is not lowercase-kebab`);
  if (!entry.label) fail(`${key}: missing label`);
  const d = entry.description ?? "";
  if (d.length < 80 || d.length > 200) {
    fail(`${key}: description is ${d.length} chars, must be 80-200`);
  }
  if (/^posts about/i.test(d)) fail(`${key}: boilerplate description`);
  if (seenDescriptions.has(d)) fail(`${key}: duplicate description`);
  seenDescriptions.add(d);
  const rel = entry.related ?? [];
  if (rel.length < 3 || rel.length > 5) {
    fail(`${key}: has ${rel.length} related tags, must be 3-5`);
  }
  for (const r of rel) {
    if (!(r in BLOG_TAGS))
      fail(`${key}: related tag "${r}" is not in BLOG_TAGS`);
    if (r === key) fail(`${key}: lists itself as related`);
  }
}

// ── 2. Corpus conformance (skipped until Task 3 has run) ───────────────
const dir = "src/content/blog";
const counts = Object.fromEntries(keys.map((k) => [k, 0]));
let migrated = true;
const files = readdirSync(dir).filter((f) => /\.mdx?$/.test(f));

for (const file of files) {
  const id = file.replace(/\.mdx?$/, "");
  const fm =
    readFileSync(`${dir}/${file}`, "utf8").match(
      /^---\r?\n([\s\S]*?)\r?\n---/,
    )?.[1] ?? "";
  const seg = fm.slice(fm.indexOf("tags:"));
  const o = seg.indexOf("["),
    c = seg.indexOf("]");
  const tags =
    o > -1 && c > -1
      ? seg
          .slice(o + 1, c)
          .split(",")
          .map((x) => x.trim().replace(/^["']|["']$/g, ""))
          .filter(Boolean)
      : [];

  const unknown = tags.filter((t) => !(t in BLOG_TAGS));
  if (unknown.length) {
    migrated = false;
    continue;
  }

  if (tags.length < 2) fail(`${id}: has ${tags.length} tag(s), minimum is 2`);
  if (tags.length > 7) fail(`${id}: has ${tags.length} tags, maximum is 7`);
  if (new Set(tags).size !== tags.length) fail(`${id}: duplicate tags`);
  for (const t of tags) counts[t]++;
}

if (!migrated) {
  console.log(
    "⚠  corpus not migrated yet — skipping floor/cap checks (expected before Task 3)",
  );
} else {
  for (const [tag, n] of Object.entries(counts)) {
    if (n < MIN_POSTS_PER_TAG)
      fail(`tag "${tag}" has ${n} post(s), floor is ${MIN_POSTS_PER_TAG}`);
  }
}

// ── 3. Redirect coverage (skipped until Task 5 has run) ────────────────
if (existsSync("public/_redirects")) {
  const redirects = readFileSync("public/_redirects", "utf8");
  const lines = redirects
    .split("\n")
    .filter((l) => l.trim() && !l.startsWith("#"));
  const catchAllAt = lines.findIndex((l) => l.trim().startsWith("/*"));
  const tagRuleIdxs = lines
    .map((l, i) => (l.includes("/blog/tag/") ? i : -1))
    .filter((i) => i > -1);
  if (tagRuleIdxs.length && catchAllAt > -1) {
    const late = tagRuleIdxs.filter((i) => i > catchAllAt);
    if (late.length) {
      fail(
        `${late.length} tag redirect(s) sit below the /* catch-all and will never fire`,
      );
    }
  }
}

// ── Report ─────────────────────────────────────────────────────────────
if (problems.length) {
  console.error(`\n✗ ${problems.length} problem(s):\n`);
  for (const p of problems) console.error("  -", p);
  process.exit(1);
}
console.log(
  `✓ taxonomy OK — ${keys.length} tags, ${files.length} posts checked`,
);
