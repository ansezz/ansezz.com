/**
 * Picks the "related tools" shown at the foot of each blog post.
 *
 * The old picker ranked by tag overlap with an alphabetical tie-break, so the
 * same few tools won every tie and some tools never appeared on any post.
 * This one assigns tools across all posts at once and spreads them out:
 *
 * - Only tools that share at least one tag with the post are candidates.
 * - Slot 1 is the most relevant tool (highest overlap). Ties go to the tool
 *   that has been shown on the fewest posts so far.
 * - The other slots go to the least-shown candidates, then highest overlap.
 * - Remaining ties use a stable hash of post id + tool href, so the result is
 *   deterministic across builds but not alphabetical.
 *
 * Posts are processed oldest first, so adding a new post never reshuffles the
 * picks on older posts' pages much.
 */

export interface RelatedToolCandidate {
  href: string;
  tags: readonly string[];
}

export interface RelatedToolPost {
  id: string;
  tags: readonly string[];
  publishDate: Date;
}

function stableHash(input: string): number {
  // FNV-1a, 32-bit.
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export function assignRelatedTools<T extends RelatedToolCandidate>(
  posts: readonly RelatedToolPost[],
  tools: readonly T[],
  perPost = 3,
): Map<string, T[]> {
  const load = new Map<string, number>(tools.map((t) => [t.href, 0]));
  const result = new Map<string, T[]>();

  const ordered = [...posts].sort(
    (a, b) =>
      a.publishDate.getTime() - b.publishDate.getTime() ||
      a.id.localeCompare(b.id),
  );

  for (const post of ordered) {
    const postTags = new Set(post.tags);
    const candidates = tools
      .map((tool) => ({
        tool,
        overlap: tool.tags.filter((t) => postTags.has(t)).length,
        hash: stableHash(`${post.id}|${tool.href}`),
      }))
      .filter((c) => c.overlap > 0);

    const loadOf = (href: string) => load.get(href) ?? 0;
    const picks: typeof candidates = [];

    if (candidates.length > 0) {
      const first = [...candidates].sort(
        (a, b) =>
          b.overlap - a.overlap ||
          loadOf(a.tool.href) - loadOf(b.tool.href) ||
          a.hash - b.hash,
      )[0];
      picks.push(first);

      const rest = candidates
        .filter((c) => c !== first)
        .sort(
          (a, b) =>
            loadOf(a.tool.href) - loadOf(b.tool.href) ||
            b.overlap - a.overlap ||
            a.hash - b.hash,
        );
      picks.push(...rest.slice(0, perPost - 1));
    }

    for (const p of picks) load.set(p.tool.href, loadOf(p.tool.href) + 1);
    result.set(
      post.id,
      picks.map((p) => p.tool),
    );
  }

  return result;
}
