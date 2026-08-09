import { YEARS_EXPERIENCE } from "@/consts";

// Curated OG cards for the main static pages. Single source of truth for
// both the generator endpoint (/og/page/[slug].png) and the per-page image
// resolution in Page.astro.

export interface PageOg {
  slug: string;
  path: string; // canonical pathname, trailing slash
  label: string; // eyebrow shown in the card pill
  title: string; // headline on the card
}

export const PAGE_OG: PageOg[] = [
  {
    slug: "home",
    path: "/",
    label: "ansezz",
    title: "Backends that survive production. AI that ships.",
  },
  {
    slug: "about",
    path: "/about/",
    label: "About",
    title: `Senior engineer. ${YEARS_EXPERIENCE}+ years. Remote-first.`,
  },
  {
    slug: "work",
    path: "/work/",
    label: "Work",
    title: "Things I built. Most still shipping.",
  },
  {
    slug: "services",
    path: "/services/",
    label: "Services",
    title: "Senior engineering, by the engagement.",
  },
  {
    slug: "blog",
    path: "/blog/",
    label: "Blog",
    title: "Notes from the trenches.",
  },
  {
    slug: "uses",
    path: "/uses/",
    label: "Uses",
    title: "The stack that earns its spot.",
  },
  {
    slug: "contact",
    path: "/contact/",
    label: "Contact",
    title: "Let's build something that ships.",
  },
  {
    slug: "now",
    path: "/now/",
    label: "Now",
    title: "What I'm doing right now.",
  },
  {
    slug: "tools",
    path: "/tools/",
    label: "Free tools",
    title: "Tools I built because I needed them.",
  },
  {
    slug: "library",
    path: "/library/",
    label: "Library",
    title: "Books, tools & repos I recommend.",
  },
  {
    slug: "series",
    path: "/blog/series/",
    label: "Blog series",
    title: "Read it as a series.",
  },

  // ── Individual tool pages ──
  {
    slug: "tool-llm-cost-calculator",
    path: "/tools/llm-cost-calculator/",
    label: "Free tool",
    title: "See the LLM bill before you ship.",
  },
  {
    slug: "tool-token-counter",
    path: "/tools/token-counter/",
    label: "Free tool",
    title: "Count the tokens. Then count the cost.",
  },
  {
    slug: "tool-cron-explainer",
    path: "/tools/cron-explainer/",
    label: "Free tool",
    title: "Cron, in plain English.",
  },
  {
    slug: "tool-jwt-decoder",
    path: "/tools/jwt-decoder/",
    label: "Free tool",
    title: "Read the token. Nothing leaves the tab.",
  },
  {
    slug: "tool-uuid-generator",
    path: "/tools/uuid-generator/",
    label: "Free tool",
    title: "Crypto-random UUIDs, in bulk.",
  },
  {
    slug: "tool-epoch-converter",
    path: "/tools/epoch-converter/",
    label: "Free tool",
    title: "Seconds or milliseconds? It knows.",
  },
  {
    slug: "tool-base64-encoder",
    path: "/tools/base64-encoder/",
    label: "Free tool",
    title: "Base64 that survives emoji.",
  },
  {
    slug: "tool-hash-generator",
    path: "/tools/hash-generator/",
    label: "Free tool",
    title: "SHA-256 and friends. No MD5.",
  },
  {
    slug: "tool-url-parser",
    path: "/tools/url-parser/",
    label: "Free tool",
    title: "Every part of the URL, editable.",
  },
  {
    slug: "tool-secret-generator",
    path: "/tools/secret-generator/",
    label: "Free tool",
    title: "Secrets from real randomness.",
  },
  {
    slug: "tool-transfer-time-calculator",
    path: "/tools/transfer-time-calculator/",
    label: "Free tool",
    title: "Bits vs bytes, settled.",
  },
  {
    slug: "tool-chmod-calculator",
    path: "/tools/chmod-calculator/",
    label: "Free tool",
    title: "755, and what it actually means.",
  },
  {
    slug: "tool-context-window-checker",
    path: "/tools/context-window-checker/",
    label: "Free tool",
    title: "Will the prompt fit? Find out first.",
  },
  {
    slug: "tool-rag-chunk-splitter",
    path: "/tools/rag-chunk-splitter/",
    label: "Free tool",
    title: "Chunk size is the RAG knob that matters.",
  },
  {
    slug: "tool-json-formatter",
    path: "/tools/json-formatter/",
    label: "Free tool",
    title: "JSON errors, with the line and column.",
  },
  {
    slug: "tool-json-to-typescript",
    path: "/tools/json-to-typescript/",
    label: "Free tool",
    title: "JSON in. Types and a Zod schema out.",
  },
  {
    slug: "tool-percentile-calculator",
    path: "/tools/percentile-calculator/",
    label: "Free tool",
    title: "The average lies. p99 doesn't.",
  },
  {
    slug: "tool-capacity-calculator",
    path: "/tools/capacity-calculator/",
    label: "Free tool",
    title: "How many workers do you actually need?",
  },
  {
    slug: "tool-shopify-hmac-verifier",
    path: "/tools/shopify-hmac-verifier/",
    label: "Free tool",
    title: "Verify the webhook before you trust it.",
  },
  {
    slug: "tool-shopify-gid-decoder",
    path: "/tools/shopify-gid-decoder/",
    label: "Free tool",
    title: "Shopify GIDs, decoded both ways.",
  },
  {
    slug: "tool-http-status-codes",
    path: "/tools/http-status-codes/",
    label: "Reference",
    title: "Every status code, and when to use it.",
  },
  {
    slug: "tool-http-headers",
    path: "/tools/http-headers/",
    label: "Reference",
    title: "The headers that matter in production.",
  },
  {
    slug: "tool-common-ports",
    path: "/tools/common-ports/",
    label: "Reference",
    title: "What's listening on that port?",
  },
];

const BY_PATH = new Map(PAGE_OG.map((p) => [p.path, p]));

/** Returns the generated OG image path for a pathname, or null if none. */
export function pageOgPath(pathname: string): string | null {
  const normalized = pathname.endsWith("/") ? pathname : `${pathname}/`;
  const match = BY_PATH.get(normalized) ?? BY_PATH.get(pathname);
  return match ? `/og/page/${match.slug}.png` : null;
}
