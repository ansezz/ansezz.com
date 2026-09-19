// ── Blog series ───────────────────────────────────────────
// Ordered reading paths across related posts. Post IDs = filename
// without extension. A post may belong to at most one series.
export interface BlogSeries {
  slug: string;
  title: string;
  description: string;
  tone: "cyan" | "green" | "yellow" | "pink" | "purple" | "blue";
  posts: string[];
}

export const BLOG_SERIES: BlogSeries[] = [
  {
    slug: "rag-in-production",
    title: "RAG in Production",
    description:
      "Everything that breaks when retrieval-augmented generation meets real users — and how to fix it.",
    tone: "cyan",
    posts: [
      "why-your-rag-is-failing",
      "7-rag-mistakes-production",
      "picking-the-right-rag-stack",
      "rag-architectures-traditional-agentic-corrective",
      "redis-semantic-caching-rag",
      "circuit-breakers-vector-db",
    ],
  },
  {
    slug: "self-hosting-saas",
    title: "Self-Hosting SaaS with Coolify",
    description:
      "Ship and scale a SaaS on your own infrastructure with Coolify and Docker — without a platform bill.",
    tone: "green",
    posts: [
      "coolify-2026-self-hosted-paas",
      "coolify-self-hosted-saas",
      "coolify-docker-saas-hosting",
      "scaling-with-coolify",
    ],
  },
  {
    slug: "shopify-plus",
    title: "Shopify Plus, Deep",
    description:
      "Themes, headless, web components, and agentic commerce — building serious storefronts and apps on Shopify Plus.",
    tone: "pink",
    posts: [
      "shopify-liquid-vs-headless",
      "shopify-storefront-web-components",
      "shopify-ucp-quick-start",
      "agentic-commerce-shopify",
      "secure-agentic-commerce-shopify",
    ],
  },
  {
    slug: "ai-architecture",
    title: "AI Architecture Decisions",
    description:
      "The architectural forks every AI product hits — ML vs GenAI, RAG vs fine-tuning, context vs memory, vectors vs graphs, and where MCP fits.",
    tone: "purple",
    posts: [
      "ml-vs-genai",
      "ai-vs-machine-learning",
      "llm-vs-ai-agent",
      "rag-vs-fine-tuning",
      "vector-search-vs-graph-search",
      "context-window-vs-memory",
      "prompt-engineering-vs-context-engineering",
      "api-vs-mcp",
      "mcp-vs-a2a-vs-acp",
      "mcp-context-aware-agents",
      "training-vs-inference",
    ],
  },
  {
    slug: "infrastructure-decisions",
    title: "Infrastructure Decisions",
    description:
      "Load balancers, proxies, gateways, containers, and scaling — the infrastructure trade-offs behind a system that stays up.",
    tone: "blue",
    posts: [
      "horizontal-vs-vertical-scaling",
      "load-balancer-vs-reverse-proxy",
      "load-balancer-vs-api-gateway",
      "forward-proxy-vs-reverse-proxy",
      "api-gateway-ai-stack",
      "rest-vs-grpc",
      "docker-vs-kubernetes",
      "container-vs-pod",
      "dns-vs-service-discovery",
      "serverless-vs-containers",
      "stateless-vs-stateful-apps",
    ],
  },
  {
    slug: "async-and-messaging",
    title: "Async & Messaging",
    description:
      "Queues, brokers, and event-driven patterns — how to move the heavy work off the request path without losing data.",
    tone: "yellow",
    posts: [
      "synchronous-vs-asynchronous-communication",
      "message-queues-document-processing",
      "scaling-with-rabbitmq",
      "event-driven-pubsub",
    ],
  },
  {
    slug: "vibe-coding-to-agentic",
    title: "From Vibe Coding to Agentic Engineering",
    description:
      "How AI-assisted development grows up — from conversational vibes, to MCP-driven agentic loops, to the review and verification gates that let it ship to production.",
    tone: "yellow",
    posts: [
      "vibe-coding",
      "ai-vs-traditional-development",
      "agentic-workflows-vibe-coding",
      "vibe-coding-vs-agentic-engineering",
      "claude-mcp-dev-tools",
      "ai-coding-workflow-levels",
      "stop-reading-code-ai-review",
      "testing-ai-generated-code",
    ],
  },
  {
    slug: "engineering-roles",
    title: "Engineering Roles, Compared",
    description:
      "DevOps vs MLOps, SRE vs platform, cloud vs DevOps, data engineer vs scientist — who does what, and which role you actually need.",
    tone: "cyan",
    posts: [
      "devops-vs-mlops",
      "sre-vs-platform-engineer",
      "cloud-engineer-vs-devops-engineer",
      "data-engineer-vs-data-scientist",
      "ml-engineer-vs-ai-engineer",
      "solutions-architect-vs-forward-deployed-engineer",
    ],
  },
  {
    slug: "monolith-and-modularity",
    title: "Monolith and Modularity",
    description:
      "Choose an architecture, keep the modules honest, and only split when the friction earns it — the full monolith-to-services arc.",
    tone: "purple",
    posts: [
      "monolith-vs-microservices",
      "modular-monolith-first",
      "monolith-to-microservices",
    ],
  },
  {
    slug: "serving-ai-in-production",
    title: "Serving AI in Production",
    description:
      "GPU-aware routing, scaling triggers that actually track LLM load, and the rate limits that stop one agent loop from burning your margin.",
    tone: "cyan",
    posts: [
      "gpu-aware-load-balancing",
      "smart-auto-scaling-ai",
      "rate-limiting-ai-wallet",
    ],
  },
  {
    slug: "production-operations",
    title: "Production Operations",
    description:
      "Ship it, provision it, and see inside it — the CI/CD, infrastructure-as-code, and observability disciplines behind a system you can debug at 3am.",
    tone: "blue",
    posts: ["ci-vs-cd", "terraform-vs-ansible", "logging-vs-monitoring"],
  },
  {
    slug: "performance-and-limits",
    title: "Performance and Limits",
    description:
      "Diagnose the real bottleneck, cut the distance with edge delivery and caching, then cap the traffic before it caps you.",
    tone: "green",
    posts: [
      "bandwidth-vs-throughput",
      "cdn-vs-cache",
      "rate-limiting-vs-throttling",
    ],
  },
  {
    slug: "laravel-at-scale",
    title: "Laravel at Scale",
    description:
      "Multi-tenant isolation, Octane workers that stay warm, and the replication-plus-backup setup that survives both hardware failure and human error.",
    tone: "pink",
    posts: [
      "laravel-multi-tenancy",
      "laravel-octane-high-traffic",
      "replication-vs-backup-laravel",
      "mcp-auth-audit-logging-laravel",
      "mcp-idempotency-laravel-mutations",
      "mcp-structured-tool-errors-laravel",
    ],
  },
];