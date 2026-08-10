import { BLOG_SERIES, type BlogSeries } from "@/consts";

export interface SeriesContext {
  series: BlogSeries;
  index: number; // zero-based position
  total: number;
  prevId?: string;
  nextId?: string;
}

const POST_TO_SERIES = new Map<string, BlogSeries>();
for (const s of BLOG_SERIES) {
  for (const id of s.posts) POST_TO_SERIES.set(id, s);
}

export function getSeriesForPost(postId: string): SeriesContext | null {
  const series = POST_TO_SERIES.get(postId);
  if (!series) return null;
  const index = series.posts.indexOf(postId);
  return {
    series,
    index,
    total: series.posts.length,
    prevId: index > 0 ? series.posts[index - 1] : undefined,
    nextId:
      index < series.posts.length - 1 ? series.posts[index + 1] : undefined,
  };
}
