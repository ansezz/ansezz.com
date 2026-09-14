import type { ToolEntry } from "./04a1-tools-meta";

export const TOOL_LIST_A: ToolEntry[] = [
  // ── AI & LLM ──
  {
    title: "LLM Cost Calculator",
    blurb:
      "Estimate API spend across Claude, GPT, and friends. Tokens in/out × requests × model price — see the monthly bill before you ship.",
    href: "/tools/llm-cost-calculator/",
    icon: "lucide:calculator",
    tone: "yellow",
    status: "live",
    group: "ai",
    tags: ["llm", "ai-engineering", "llm-inference"],
  },
  {
    title: "Token Counter",
    blurb:
      "Paste any text and estimate token count for Claude and GPT models — plus characters, words, and a rough per-call cost. All in your browser.",
    href: "/tools/token-counter/",
    icon: "lucide:hash",
    tone: "cyan",
    status: "live",
    group: "ai",
    tags: ["llm", "rag", "ai-engineering"],
  },
  {
    title: "Context Window Checker",
    blurb:
      "Will the prompt fit? Paste it and see tokens used, headroom left, and what's still free for the answer across Claude, GPT and Gemini windows.",
    href: "/tools/context-window-checker/",
    icon: "lucide:ruler",
    tone: "purple",
    status: "live",
    group: "ai",
    tags: ["llm", "rag", "agentic-ai"],
  },
  {
    title: "RAG Chunk Splitter",
    blurb:
      "Split text into retrieval chunks — fixed, sentence, paragraph, or markdown-heading aware — and see every chunk's token count and overlap seam.",
    href: "/tools/rag-chunk-splitter/",
    icon: "lucide:scissors",
    tone: "pink",
    status: "live",
    group: "ai",
    tags: ["rag", "vector-search", "pgvector"],
  },

  // ── Encoding & secrets ──
  {
    title: "JWT Decoder",
    blurb:
      "Paste a JWT and read its header and payload — claims, algorithm, and expiry decoded in your browser. Decode-only; nothing is sent anywhere.",
    href: "/tools/jwt-decoder/",
    icon: "lucide:key-round",
    tone: "purple",
    status: "live",
    group: "encoding",
    tags: ["security", "api-design"],
  },
  {
    title: "Base64 Encoder / Decoder",
    blurb:
      "Encode and decode base64 without the UTF-8 bugs — emoji and accents round-trip correctly. base64url and file-to-data-URI included.",
    href: "/tools/base64-encoder/",
    icon: "lucide:binary",
    tone: "cyan",
    status: "live",
    group: "encoding",
    tags: ["api-design"],
  },
  {
    title: "SHA Hash Generator",
    blurb:
      "SHA-1, SHA-256, SHA-384 and SHA-512 for text or a file, in hex or base64. Web Crypto, in your browser. No MD5 — on purpose.",
    href: "/tools/hash-generator/",
    icon: "lucide:shield-check",
    tone: "green",
    status: "live",
    group: "encoding",
    tags: ["security"],
  },
  {
    title: "Secret & API Key Generator",
    blurb:
      "Keys, hex secrets and passphrases from crypto.getRandomValues — never Math.random. Unbiased sampling, entropy readout, nothing logged.",
    href: "/tools/secret-generator/",
    icon: "lucide:key-square",
    tone: "pink",
    status: "live",
    group: "encoding",
    tags: ["security"],
  },
  {
    title: "UUID Generator",
    blurb:
      "Generate v4 UUIDs in bulk, copy with one click. Crypto-random, instant, offline. Handy for seeds, fixtures, and quick IDs.",
    href: "/tools/uuid-generator/",
    icon: "lucide:fingerprint",
    tone: "green",
    status: "live",
    group: "encoding",
    tags: ["databases", "api-design"],
  },

  // ── Data & APIs ──
  {
    title: "URL Parser & Encoder",
    blurb:
      "Break a URL into every part, edit query params and watch it rebuild. Plus the four encode/decode functions people keep mixing up.",
    href: "/tools/url-parser/",
    icon: "lucide:link",
    tone: "yellow",
    status: "live",
    group: "data",
    tags: ["api-design", "networking"],
  },
  {
    title: "JSON Formatter & Validator",
    blurb:
      "Format, minify, sort keys — and when it breaks, get the line, the column, and a caret under the exact character, not just “Unexpected token”.",
    href: "/tools/json-formatter/",
    icon: "lucide:braces",
    tone: "cyan",
    status: "live",
    group: "data",
    tags: ["api-design"],
  },
];
