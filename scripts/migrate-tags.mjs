/**
 * One-shot frontmatter migration. Rewrites ONLY the `tags:` line of each blog
 * post. Idempotent — running it twice produces no further change.
 *
 *   node scripts/migrate-tags.mjs --dry   # report, write nothing
 *   node scripts/migrate-tags.mjs         # apply
 */
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolveTags, applyCap } from "./tag-map.mjs";

const DRY = process.argv.includes("--dry");
const dir = "src/content/blog";

const posts = [];
for (const file of readdirSync(dir).filter((f) => /\.mdx?$/.test(f))) {
  const id = file.replace(/\.mdx?$/, "");
  const src = readFileSync(`${dir}/${file}`, "utf8");
  const fmMatch = src.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!fmMatch) {
    console.error(`✗ ${id}: no frontmatter`);
    process.exit(1);
  }

  const tagsLine = fmMatch[1].match(/^tags:\s*\[[\s\S]*?\]\s*$/m);
  if (!tagsLine) {
    console.error(`✗ ${id}: no inline "tags: [...]" line`);
    process.exit(1);
  }

  const raw = tagsLine[0]
    .slice(tagsLine[0].indexOf("[") + 1, tagsLine[0].lastIndexOf("]"))
    .split(",")
    .map((x) => x.trim().replace(/^["']|["']$/g, ""))
    .filter(Boolean);

  const r = resolveTags(id, raw);
  posts.push({
    id,
    file,
    src,
    raw,
    oldLine: tagsLine[0],
    fmStart: fmMatch.index,
    fmBlock: fmMatch[0],
    ...r,
  });
}

const unmapped = [...new Set(posts.flatMap((p) => p.unmapped))];
if (unmapped.length) {
  console.error(
    `✗ ${unmapped.length} tag(s) have no canonical home:`,
    unmapped.join(", "),
  );
  process.exit(1);
}

applyCap(posts);

let changed = 0;
for (const p of posts) {
  const newLine = `tags: [${p.tags.join(", ")}]`;
  if (newLine === p.oldLine.trim()) continue;
  changed++;
  console.log(
    `${p.id}\n  - ${p.raw.join(", ")}\n  + ${p.tags.join(", ")}${p.dropped.length ? `\n  ! capped, dropped: ${p.dropped.join(", ")}` : ""}`,
  );
  if (!DRY) {
    const newFmBlock = p.fmBlock.replace(p.oldLine, newLine);
    const newSrc =
      p.src.slice(0, p.fmStart) +
      newFmBlock +
      p.src.slice(p.fmStart + p.fmBlock.length);
    writeFileSync(`${dir}/${p.file}`, newSrc, "utf8");
  }
}

console.log(
  `\n${DRY ? "[dry run] " : ""}${changed} of ${posts.length} posts ${DRY ? "would change" : "changed"}`,
);
