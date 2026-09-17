export const BLOG_CATEGORIES = [
  "laravel",
  "ai",
  "shopify",
  "devops",
  "architecture",
  "career",
] as const;

export type BlogCategory = (typeof BLOG_CATEGORIES)[number];

export const CATEGORY_LABEL: Record<BlogCategory, string> = {
  laravel: "Laravel",
  ai: "AI",
  shopify: "Shopify",
  devops: "DevOps",
  architecture: "Architecture",
  career: "Career",
};

export const CATEGORY_TONE: Record<
  BlogCategory,
  "red" | "cyan" | "green" | "blue" | "yellow" | "pink"
> = {
  laravel: "red",
  ai: "cyan",
  shopify: "green",
  devops: "blue",
  architecture: "yellow",
  career: "pink",
};
