import { defineCollection } from "astro:content";
import { z } from "astro/zod";
import { glob } from "astro/loaders";

import { BLOG_CATEGORIES, TAG_KEYS } from "./consts";

const blog = defineCollection({
  loader: glob({ pattern: "**/*.{md,mdx}", base: "./src/content/blog" }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    publishDate: z.coerce.date(),
    updatedDate: z.coerce.date().optional(),
    category: z.enum(BLOG_CATEGORIES),
    // Closed vocabulary — see BLOG_TAGS in consts.ts. An unknown tag fails
    // the build on purpose: an open vocabulary is how this site reached 188
    // tags, 150 of them with fewer than three posts.
    tags: z.array(z.enum(TAG_KEYS)).default([]),
    featured: z.boolean().default(false),
    draft: z.boolean().default(false),
    heroImage: z
      .object({
        url: z.string(),
        alt: z.string(),
      })
      .optional(),
  }),
});

const work = defineCollection({
  loader: glob({ pattern: "**/*.{md,mdx}", base: "./src/content/work" }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    category: z.enum(["ai", "shopify", "saas"]),
    stack: z.array(z.string()).default([]),
    outcome: z.string().optional(),
    liveUrl: z.url().optional(),
    githubUrl: z.url().optional(),
    order: z.number().default(0),
    featured: z.boolean().default(false),
  }),
});

export const collections = { blog, work };
