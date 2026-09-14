import { BLOG_TAGS } from "./02a-blog-tags-data";

export type BlogTag = keyof typeof BLOG_TAGS;

/** Tuple form required by `z.enum()` in src/content.config.ts. */
export const TAG_KEYS = Object.keys(BLOG_TAGS) as [BlogTag, ...BlogTag[]];

export const CARD_TONES = [
  "paper",
  "yellow",
  "cyan",
  "green",
  "pink",
  "red",
  "purple",
] as const;
