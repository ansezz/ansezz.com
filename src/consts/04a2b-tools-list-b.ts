import type { ToolEntry } from "./04a1-tools-meta";

export const TOOL_LIST_B: ToolEntry[] = [
  {
    title: "JSON to TypeScript & Zod",
    blurb:
      "Paste a JSON sample, get typed interfaces plus a Zod v4 schema — unions merged, optionals inferred, dates and emails detected.",
    href: "/tools/json-to-typescript/",
    icon: "lucide:file-code",
    tone: "purple",
    status: "live",
    group: "data",
    tags: ["api-design", "code-quality"],
  },

  // ── Infrastructure ──
  {
    title: "Cron Explainer",
    blurb:
      "Decode a cron expression into plain English, field by field. Built it for my own schedulers — paste a 5-field cron and read what it actually does.",
    href: "/tools/cron-explainer/",
    icon: "lucide:clock",
    tone: "pink",
    status: "live",
    group: "infra",
    tags: ["devops", "messaging"],
  },
  {
    title: "Epoch Converter",
    blurb:
      "Unix timestamp in, human date out — UTC, local, ISO 8601, relative. Auto-detects seconds vs milliseconds, which is the bug you actually had.",
    href: "/tools/epoch-converter/",
    icon: "lucide:calendar-clock",
    tone: "yellow",
    status: "live",
    group: "infra",
    tags: ["devops", "databases"],
  },
  {
    title: "Chmod Calculator",
    blurb:
      "Tick boxes or type 755 — both stay in sync. Setuid, setgid and sticky included, with the S/T rendering most calculators get wrong.",
    href: "/tools/chmod-calculator/",
    icon: "lucide:lock",
    tone: "purple",
    status: "live",
    group: "infra",
    tags: ["devops", "self-hosting"],
  },
  {
    title: "Transfer Time Calculator",
    blurb:
      "How long to move X at Y bandwidth. Bits vs bytes, GB vs GiB, and the protocol overhead that line-rate maths always forgets.",
    href: "/tools/transfer-time-calculator/",
    icon: "lucide:gauge",
    tone: "cyan",
    status: "live",
    group: "infra",
    tags: ["networking", "performance", "infrastructure"],
  },
  {
    title: "Latency Percentile Calculator",
    blurb:
      "Paste response times, get p50 through p99.9 with a histogram — and a warning when your sample is too small for the percentile you asked for.",
    href: "/tools/percentile-calculator/",
    icon: "lucide:activity",
    tone: "green",
    status: "live",
    group: "infra",
    tags: ["performance", "observability"],
  },
  {
    title: "Server Capacity Calculator",
    blurb:
      "Little's Law sizing: requests/sec × latency → workers you actually need. Includes the Erlang C queue math for what happens near full utilization.",
    href: "/tools/capacity-calculator/",
    icon: "lucide:server",
    tone: "pink",
    status: "live",
    group: "infra",
    tags: ["infrastructure", "scaling", "performance"],
  },

  // ── Shopify ──
  {
    title: "Shopify Webhook HMAC Verifier",
    blurb:
      "Check a webhook signature against your client secret, constant-time, in the browser. When it fails, it tells you which of the usual causes it was.",
    href: "/tools/shopify-hmac-verifier/",
    icon: "lucide:store",
    tone: "purple",
    status: "live",
    group: "shopify",
    tags: ["shopify", "security"],
  },
  {
    title: "Shopify GID Decoder",
    blurb:
      "gid://shopify/Product/123 in, resource type and legacy numeric ID out — or the reverse. Handles the base64-encoded IDs older APIs still return.",
    href: "/tools/shopify-gid-decoder/",
    icon: "lucide:shopping-bag",
    tone: "green",
    status: "live",
    group: "shopify",
    tags: ["shopify", "hydrogen"],
  },

  // ── Reference ──
  {
    title: "HTTP Status Codes",
    blurb:
      "Every 1xx–5xx code with what it means and when to actually use it — including 307 vs 302, 401 vs 403, and the non-standard ones. Filterable.",
    href: "/tools/http-status-codes/",
    icon: "lucide:list-ordered",
    tone: "yellow",
    status: "live",
    group: "reference",
    tags: ["api-design", "networking"],
  },
  {
    title: "HTTP Headers Cheat Sheet",
    blurb:
      "Request and response headers that matter in production — caching, CORS, security, forwarding — each with a real example value. Filterable.",
    href: "/tools/http-headers/",
    icon: "lucide:network",
    tone: "cyan",
    status: "live",
    group: "reference",
    tags: ["api-design", "networking", "security"],
  },
  {
    title: "Common Ports",
    blurb:
      "TCP and UDP ports for web, databases, caches, Docker, Kubernetes and dev servers — each with a practical note on what listens there and why.",
    href: "/tools/common-ports/",
    icon: "lucide:plug",
    tone: "pink",
    status: "live",
    group: "reference",
    tags: ["networking", "devops"],
  },
];
