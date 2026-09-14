export const BLOG_TAGS_B = {
  kubernetes: {
    label: "Kubernetes",
    description:
      "Kubernetes when it earns its complexity — pods and sidecars, KEDA-driven autoscaling, and the many cases where Docker Compose was already enough.",
    related: ["docker", "scaling", "infrastructure", "networking"],
  },
  microservices: {
    label: "Microservices",
    description:
      "Service boundaries and the cost of crossing them: modular monoliths, strangler-fig migrations, and when splitting the system is the wrong move.",
    related: ["architecture", "messaging", "api-design", "scaling"],
  },
  pgvector: {
    label: "pgvector",
    description:
      "Postgres as a vector database — pgvector indexing, recall tuning, and running retrieval next to your relational data instead of beside it.",
    related: ["rag", "vector-search", "databases", "laravel"],
  },
  "vibe-coding": {
    label: "Vibe coding",
    description:
      "AI-assisted development as a discipline: where model-driven coding earns real speed, where it quietly costs you, and how taste survives it.",
    related: ["claude", "code-quality", "agentic-ai", "ai"],
  },
  "multi-tenancy": {
    label: "Multi-tenancy",
    description:
      "Multi-tenant SaaS architecture — tenant isolation, per-tenant data boundaries, and the Laravel patterns that keep it maintainable past ten customers.",
    related: ["laravel", "databases", "architecture", "security"],
  },
  messaging: {
    label: "Messaging & queues",
    description:
      "Asynchronous work: queues and brokers, pub/sub, event-driven design, dead-letter handling, batching, and back-pressure that actually holds.",
    related: ["architecture", "redis", "microservices", "scaling"],
  },
  performance: {
    label: "Performance",
    description:
      "Making software faster where it counts — measuring first, telling bandwidth from throughput, and fixing the bottleneck that exists rather than the one you assumed.",
    related: ["scaling", "networking", "redis", "observability"],
  },
  redis: {
    label: "Redis",
    description:
      "Redis beyond a cache: semantic caching for LLM calls, rate-limit counters, queue backing, and recognising when the cache has become the bug.",
    related: ["messaging", "performance", "databases", "rag"],
  },
  career: {
    label: "Career",
    description:
      "Engineering roles compared honestly — what SREs, platform, cloud, data and forward-deployed engineers actually do, and how hiring reads each title.",
    related: ["devops", "architecture", "ai-engineering", "code-quality"],
  },
  "ai-engineering": {
    label: "AI engineering",
    description:
      "AI engineering as its own discipline: evaluation, retrieval, cost control, and the operational work separating a working demo from a product.",
    related: ["ai", "rag", "llm-inference", "production"],
  },
  "agentic-commerce": {
    label: "Agentic commerce",
    description:
      "Commerce that agents can transact against — UCP, checkout flows built for machine buyers, and making a storefront legible to a model.",
    related: ["shopify", "hydrogen", "agentic-ai", "security"],
  },
  hydrogen: {
    label: "Hydrogen",
    description:
      "Headless Shopify with Hydrogen and the Storefront API: when leaving Liquid pays for itself, and when it quietly does not.",
    related: ["shopify", "agentic-commerce", "performance", "api-design"],
  },
  "code-quality": {
    label: "Code quality",
    description:
      "Holding quality when a model writes the first draft — testing AI-generated code, reviewing at the right altitude, and what CI has to catch.",
    related: ["ci-cd", "vibe-coding", "agentic-ai", "career"],
  },
  security: {
    label: "Security",
    description:
      "Security for systems that talk to models and to money: authentication, webhook verification, and denial-of-wallet on metered AI endpoints.",
    related: ["api-design", "shopify", "multi-tenancy", "infrastructure"],
  },
  coolify: {
    label: "Coolify",
    description:
      "Coolify as a self-hosted PaaS — running production SaaS on hardware you own, and how it actually compares to Dokploy and the managed platforms.",
    related: ["self-hosting", "docker", "deployment", "devops"],
  },
  "self-hosting": {
    label: "Self-hosting",
    description:
      "Running your own infrastructure deliberately: VPS and ARM economics, what you gain in cost and control, and what you take on in exchange.",
    related: ["coolify", "infrastructure", "docker", "deployment"],
  },
  production: {
    label: "Production",
    description:
      "The gap between working and production-ready — the operational realities that only surface once real users and real load arrive.",
    related: ["observability", "ai-engineering", "devops", "scaling"],
  },
  observability: {
    label: "Observability",
    description:
      "Knowing what your system is doing: logging versus monitoring, circuit breakers, graceful fallbacks, and designing for the failure you will get.",
    related: ["production", "devops", "performance", "infrastructure"],
  },
  "cloud-platforms": {
    label: "Cloud platforms",
    description:
      "Working across GCP and AWS — the managed services worth paying for, the lock-in worth accepting, and the bill you should model before committing.",
    related: ["infrastructure", "devops", "kubernetes", "self-hosting"],
  },
  deployment: {
    label: "Deployment",
    description:
      "Getting code into production repeatably: deployment strategies, PaaS trade-offs, and a rollback path you could actually execute under pressure.",
    related: ["ci-cd", "docker", "coolify", "devops"],
  },
  databases: {
    label: "Databases",
    description:
      "Data that has to survive — Postgres in production, replication versus backup, high availability, and the recovery procedure nobody has tested.",
    related: ["laravel", "pgvector", "multi-tenancy", "redis"],
  },
  "llm-inference": {
    label: "LLM inference",
    description:
      "Serving models efficiently: prefill and decode, KV cache, GPU-aware load balancing, vLLM, and the latency budget behind time-to-first-token.",
    related: ["llm", "scaling", "performance", "ai-engineering"],
  },
} as const;
