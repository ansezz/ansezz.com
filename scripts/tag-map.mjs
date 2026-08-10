/**
 * The 188 -> 40 tag merge map. Single source of truth for the migration,
 * the redirect generator, and the assertion harness.
 *
 * Verified against the corpus: zero unmapped tags, every canonical tag at or
 * above the 3-post floor, exactly 3 posts hitting the 7-tag cap.
 */
export const MAP = {
  ai: ["ai", "genai"],
  llm: ["llm", "context-window", "context", "memory"],
  // "llm-inference", "databases", and "cloud-platforms" are new canonical
  // names invented by this taxonomy — no corpus post ever carried a tag
  // spelled exactly that way (the corpus had "database" singular and no
  // "cloud-platforms"/"llm-inference" tag at all). Without a self-alias,
  // re-running the migration against already-canonicalized frontmatter
  // can't resolve these back to themselves and the script wrongly reports
  // them as unmapped. Every other canonical below self-aliases naturally
  // because it already existed as a corpus tag with that spelling.
  "llm-inference": [
    "llm-inference",
    "inference",
    "training",
    "vllm",
    "prefill",
    "decode",
    "kv-cache",
    "ttft",
    "gpu",
  ],
  rag: ["rag", "crag", "bm25", "evals", "hybrid-search", "reranker"],
  "vector-search": [
    "vector-search",
    "vector-databases",
    "graphrag",
    "pinecone",
    "weaviate",
    "qdrant",
  ],
  pgvector: ["pgvector"],
  "agentic-ai": [
    "agentic-ai",
    "ai-agents",
    "tool-use",
    "a2a",
    "acp",
    "protocols",
  ],
  mcp: ["mcp"],
  claude: ["claude", "anthropic", "cursor"],
  "machine-learning": [
    "machine-learning",
    "mlops",
    "data-science",
    "data-engineering",
    "python",
    "fine-tuning",
  ],
  "ai-engineering": ["ai-engineering"],
  "vibe-coding": ["vibe-coding", "ai-coding", "taste", "dx", "productivity"],
  "code-quality": [
    "testing",
    "code-review",
    "quality",
    "code-quality",
    "ai-code-review",
  ],

  laravel: [
    "laravel",
    "octane",
    "swoole",
    "roadrunner",
    "php",
    "stancl-tenancy",
    "laravel-queues",
    "backend",
  ],
  databases: [
    "databases",
    "database",
    "postgres",
    "replication",
    "backup",
    "high-availability",
    "sql",
  ],

  devops: [
    "devops",
    "cloud-engineering",
    "platform-engineering",
    "sre",
    "iac",
    "terraform",
    "ansible",
    "automation",
    "engineering",
  ],
  infrastructure: [
    "infrastructure",
    "cloud",
    "cloud-infrastructure",
    "cloud-computing",
    "serverless",
  ],
  docker: ["docker", "containers", "pods", "sidecar"],
  kubernetes: ["kubernetes", "keda", "orchestration"],
  "ci-cd": ["ci-cd"],
  deployment: ["deployment", "paas"],
  coolify: ["coolify", "dokploy"],
  "self-hosting": [
    "self-hosting",
    "vps",
    "hetzner",
    "arm",
    "cost-optimization",
  ],
  scaling: [
    "scaling",
    "auto-scaling",
    "high-traffic",
    "scalability",
    "queue-depth",
  ],
  networking: [
    "networking",
    "dns",
    "service-discovery",
    "consul",
    "nginx",
    "load-balancing",
    "load-balancer",
    "cdn",
    "latency",
    "traefik",
  ],
  observability: [
    "observability",
    "logging",
    "monitoring",
    "reliability",
    "resilience",
    "circuit-breakers",
    "fallback",
  ],
  performance: ["performance", "web-performance"],
  redis: ["redis", "caching", "semantic-cache", "redisvl"],
  "cloud-platforms": ["cloud-platforms", "gcp", "google-cloud", "aws"],
  security: ["security", "denial-of-wallet"],

  architecture: [
    "architecture",
    "software-architecture",
    "strategy",
    "hybrid",
    "business",
    "decision-making",
  ],
  microservices: [
    "microservices",
    "monolith",
    "modular-monolith",
    "strangler-fig",
    "decoupling",
  ],
  messaging: [
    "messaging",
    "queues",
    "message-queues",
    "rabbitmq",
    "message-broker",
    "pub-sub",
    "event-driven",
    "async",
    "bullmq",
    "dlq",
    "batching",
    "document-processing",
    "streaming",
  ],
  "api-design": [
    "api",
    "api-design",
    "rest",
    "grpc",
    "graphql",
    "api-gateway",
    "rate-limiting",
  ],
  "multi-tenancy": ["multi-tenancy", "saas"],
  production: ["production"],

  shopify: ["shopify", "shopify-plus", "liquid", "ecommerce"],
  hydrogen: ["hydrogen", "headless", "storefront-api", "web-components"],
  "agentic-commerce": [
    "agentic-commerce",
    "ucp",
    "checkout",
    "metaobjects",
    "seo",
    "llms-txt",
  ],

  career: ["career", "hiring", "enterprise", "meta", "intro"],
};

/** Too incidental to keep, and with no honest canonical home. */
export const DROP = new Set(["typescript", "dev-tools", "integrations"]);

/**
 * Tags a post should always have carried. Without these, `career` and
 * `code-quality` sit at two posts and fail the floor — and merging them away
 * would delete two legitimate topic pages to avoid adding six correct tags.
 */
export const ADD = {
  "cloud-engineer-vs-devops-engineer": ["career"],
  "data-engineer-vs-data-scientist": ["career"],
  "sre-vs-platform-engineer": ["career"],
  "hello-world": ["career"],
  "ai-coding-workflow-levels": ["code-quality"],
  "vibe-coding-vs-agentic-engineering": ["code-quality"],
};

export const MAX_TAGS = 7;

/**
 * Never dropped by the cap. Laravel is 30 posts and Shopify 19 — the two
 * largest topics on the site. Ranking purely by rarity stripped `laravel`
 * off three Laravel posts, which is the wrong trade.
 */
export const PINNED = new Set(["laravel", "shopify"]);

/** alias -> canonical. Built once, exported for the redirect generator. */
export const ALIAS = new Map();
for (const [canonical, aliases] of Object.entries(MAP)) {
  for (const a of aliases) {
    if (ALIAS.has(a)) {
      throw new Error(
        `alias "${a}" mapped twice: ${ALIAS.get(a)} and ${canonical}`,
      );
    }
    ALIAS.set(a, canonical);
  }
}

/**
 * Resolve a post's raw tags to canonical ones.
 * Returns { tags, dropped, unmapped }. Original ordering is preserved; the
 * cap only re-sorts posts that actually exceed MAX_TAGS.
 */
export function resolveTags(id, rawTags) {
  const unmapped = [];
  const out = [];
  for (const raw of rawTags) {
    if (DROP.has(raw)) continue;
    const canonical = ALIAS.get(raw);
    if (!canonical) {
      unmapped.push(raw);
      continue;
    }
    if (!out.includes(canonical)) out.push(canonical);
  }
  for (const extra of ADD[id] ?? []) {
    if (!out.includes(extra)) out.push(extra);
  }
  return { tags: out, dropped: [], unmapped };
}

/**
 * Apply the cap across the whole corpus. Needs global frequency, so it runs
 * after every post has been resolved.
 */
export function applyCap(resolved) {
  const freq = {};
  for (const r of resolved)
    for (const t of r.tags) freq[t] = (freq[t] ?? 0) + 1;

  for (const r of resolved) {
    if (r.tags.length <= MAX_TAGS) continue;
    const ranked = [...r.tags].sort(
      (a, b) =>
        Number(PINNED.has(b)) - Number(PINNED.has(a)) || freq[a] - freq[b],
    );
    r.dropped = ranked.slice(MAX_TAGS);
    r.tags = ranked.slice(0, MAX_TAGS);
  }
  return resolved;
}
