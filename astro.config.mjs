import tailwindcss from "@tailwindcss/vite";
import { defineConfig, fontProviders } from "astro/config";
import mdx from "@astrojs/mdx";
import sitemap from "@astrojs/sitemap";
import icon from "astro-icon";
import AstroPWA from "@vite-pwa/astro";
import rehypeExternalLinks from "rehype-external-links";
import rehypeSlug from "rehype-slug";
import rehypeAutolinkHeadings from "rehype-autolink-headings";
import { unified } from "@astrojs/markdown-remark";
import rehypeImageDims from "./src/lib/rehype-image-dims.mjs";

import { SITE, TAG_OG_MIN_POSTS } from "./src/consts";

const siteHost = new URL(SITE.URL).hostname;

// Build a { "<post-url>": ISO-date } map from blog frontmatter so the sitemap
// can emit <lastmod>. astro:content isn't available in the config, so read the
// files directly and pull updatedDate ?? publishDate.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

function blogLastmod() {
  const dir = join(process.cwd(), "src/content/blog");
  const map = {};
  for (const file of readdirSync(dir)) {
    if (!/\.(md|mdx)$/.test(file)) continue;
    const id = file.replace(/\.(md|mdx)$/, "");
    const src = readFileSync(join(dir, file), "utf8");
    const updated = src.match(/^updatedDate:\s*"?([0-9-]+)"?/m)?.[1];
    const published = src.match(/^publishDate:\s*"?([0-9-]+)"?/m)?.[1];
    const date = updated ?? published;
    if (date) map[`${SITE.URL}/blog/${id}/`] = new Date(date).toISOString();
  }
  return map;
}
const LASTMOD = blogLastmod();

// Tag pages below TAG_OG_MIN_POSTS are noindex,follow (see
// src/pages/blog/tag/[tag].astro) — keep them out of the sitemap too so we
// aren't submitting URLs we've asked Google not to index.
function thinTagPaths() {
  const dir = join(process.cwd(), "src/content/blog");
  const counts = new Map();
  for (const file of readdirSync(dir)) {
    if (!/\.(md|mdx)$/.test(file)) continue;
    const src = readFileSync(join(dir, file), "utf8");
    const fm = src.match(/^---\r?\n([\s\S]*?)\r?\n---/)?.[1] ?? "";
    if (/^draft:\s*true/m.test(fm)) continue;
    const list = fm.slice(fm.indexOf("tags:"));
    const open = list.indexOf("[");
    const close = list.indexOf("]");
    if (open === -1 || close === -1) continue;
    for (const raw of list.slice(open + 1, close).split(",")) {
      const tag = raw.trim().replace(/^["']|["']$/g, "");
      if (!tag) continue;
      const slug = tag.toLowerCase().replace(/\s+/g, "-");
      counts.set(slug, (counts.get(slug) ?? 0) + 1);
    }
  }
  return new Set(
    [...counts.entries()]
      .filter(([, n]) => n < TAG_OG_MIN_POSTS)
      .map(([slug]) => `/blog/tag/${slug}/`),
  );
}
const THIN_TAGS = thinTagPaths();

// Concatenate the text content of a hast heading node (for anchor aria-labels).
function headingText(node) {
  if (!node) return "";
  if (node.type === "text") return node.value;
  if (Array.isArray(node.children)) {
    return node.children.map(headingText).join("");
  }
  return "";
}

// https://astro.build/config
export default defineConfig({
  site: SITE.URL,
  prefetch: { defaultStrategy: "hover" },
  vite: {
    plugins: [tailwindcss()],
  },
  fonts: [
    {
      name: "Archivo Black",
      cssVariable: "--font-display",
      provider: fontProviders.google(),
      weights: [400],
      styles: ["normal"],
    },
    {
      name: "Inter",
      cssVariable: "--font-sans",
      provider: fontProviders.google(),
      weights: [400, 500, 600, 700, 800],
      styles: ["normal"],
    },
    {
      name: "JetBrains Mono",
      cssVariable: "--font-mono",
      provider: fontProviders.google(),
      weights: [400, 500, 700],
      styles: ["normal"],
    },
  ],
  markdown: {
    shikiConfig: {
      theme: "github-dark",
      wrap: true,
    },
    // Astro 6.4+: plugins go through the unified() processor, not the
    // deprecated markdown.rehypePlugins option.
    processor: unified({
      rehypePlugins: [
        rehypeSlug,
        [
          rehypeAutolinkHeadings,
          {
            behavior: "append",
            // Build a per-heading aria-label from the heading's text.
            properties: (node) => {
              const text = headingText(node);
              return {
                className: ["heading-anchor"],
                ariaLabel: text
                  ? `Link to section: ${text}`
                  : "Link to section",
              };
            },
          },
        ],
        rehypeImageDims,
        [
          rehypeExternalLinks,
          {
            target: "_blank",
            rel: ["noopener", "noreferrer"],
            test: (node) => {
              const href = node.properties?.href;
              if (typeof href !== "string") return false;
              if (href.startsWith("#") || href.startsWith("/")) return false;
              if (
                href.startsWith("mailto:") ||
                href.startsWith("tel:") ||
                href.startsWith("sms:")
              ) {
                return false;
              }
              try {
                return new URL(href).hostname !== siteHost;
              } catch {
                return false;
              }
            },
          },
        ],
      ],
    }),
  },
  integrations: [
    mdx(),
    sitemap({
      filter: (page) =>
        !page.includes("/styleguide") &&
        !page.includes("/404") &&
        !page.includes("/og/") &&
        !THIN_TAGS.has(new URL(page).pathname),
      changefreq: "weekly",
      priority: 0.7,
      serialize(item) {
        const lastmod = LASTMOD[item.url];
        if (item.url === SITE.URL || item.url === `${SITE.URL}/`) {
          return { ...item, priority: 1.0, changefreq: "weekly" };
        }
        if (item.url.includes("/blog/") && item.url !== `${SITE.URL}/blog/`) {
          return {
            ...item,
            priority: 0.8,
            changefreq: "monthly",
            ...(lastmod ? { lastmod } : {}),
          };
        }
        if (item.url.endsWith("/blog/")) {
          return { ...item, priority: 0.9, changefreq: "daily" };
        }
        return item;
      },
    }),
    icon(),
    AstroPWA({
      registerType: "autoUpdate",
      // Keep the hand-authored public/manifest.webmanifest; don't generate one.
      manifest: false,
      // We register /sw.js ourselves in BaseLayout (Astro head control).
      injectRegister: false,
      workbox: {
        // Precache the app shell assets; pages are cached at runtime.
        globPatterns: ["**/*.{js,css,svg,woff2}"],
        navigateFallback: null,
        cleanupOutdatedCaches: true,
        runtimeCaching: [
          {
            urlPattern: ({ request }) => request.mode === "navigate",
            handler: "NetworkFirst",
            options: {
              cacheName: "pages",
              networkTimeoutSeconds: 3,
              expiration: { maxEntries: 60, maxAgeSeconds: 60 * 60 * 24 * 30 },
            },
          },
          {
            urlPattern: ({ request }) =>
              request.destination === "image" || request.destination === "font",
            handler: "StaleWhileRevalidate",
            options: {
              cacheName: "assets",
              expiration: { maxEntries: 120, maxAgeSeconds: 60 * 60 * 24 * 60 },
            },
          },
        ],
      },
    }),
  ],
});
