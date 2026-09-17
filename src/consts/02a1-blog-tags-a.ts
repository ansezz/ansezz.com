export const BLOG_TAGS_A = {
  laravel: {
    label: "Laravel",
    description:
      "Laravel in production: Octane and Swoole under real traffic, queue design, multi-tenancy, and the parts of the framework that bite at scale.",
    related: ["databases", "multi-tenancy", "messaging", "performance"],
  },
  devops: {
    label: "DevOps",
    description:
      "The operational half of shipping software — CI/CD pipelines, infrastructure as code, and the boundary between building a system and running it.",
    related: ["ci-cd", "infrastructure", "deployment", "observability"],
  },
  ai: {
    label: "AI",
    description:
      "Applied AI engineering: shipping model-backed features that hold up in production, rather than demos that work once on a clean input.",
    related: ["llm", "agentic-ai", "rag", "ai-engineering"],
  },
  infrastructure: {
    label: "Infrastructure",
    description:
      "The layer under the app — compute, networking, storage sizing, and the cost and failure characteristics that arrive with each choice.",
    related: ["cloud-platforms", "self-hosting", "scaling", "networking"],
  },
  architecture: {
    label: "Architecture",
    description:
      "System design trade-offs written down honestly: what each option costs, where it breaks, and when the simpler answer is the right one.",
    related: ["microservices", "api-design", "messaging", "scaling"],
  },
  shopify: {
    label: "Shopify",
    description:
      "Shopify Plus development — apps, Liquid and headless storefronts, webhooks, and the platform limits you only discover under production load.",
    related: ["hydrogen", "agentic-commerce", "api-design", "security"],
  },
  rag: {
    label: "RAG",
    description:
      "Retrieval-augmented generation that survives production: chunking, hybrid search, reranking, and the failure modes that only appear at scale.",
    related: ["pgvector", "vector-search", "llm", "ai-engineering"],
  },
  llm: {
    label: "LLMs",
    description:
      "Working with large language models directly — context windows, prompt and context engineering, memory, and where the abstractions leak.",
    related: ["llm-inference", "rag", "claude", "agentic-ai"],
  },
  "agentic-ai": {
    label: "Agentic AI",
    description:
      "Agents that do real work: tool use, multi-step planning, the MCP/A2A/ACP protocol landscape, and keeping autonomy bounded enough to trust.",
    related: ["mcp", "claude", "llm", "code-quality"],
  },
  mcp: {
    label: "MCP",
    description:
      "Model Context Protocol in practice — building servers, wiring tools to Claude, and using MCP as the integration layer that agents plug into.",
    related: ["agentic-ai", "claude", "api-design", "ai-engineering"],
  },
  scaling: {
    label: "Scaling",
    description:
      "Making a system carry more load: horizontal versus vertical, autoscaling signals that track real demand, and the point where scaling stops helping.",
    related: ["kubernetes", "performance", "infrastructure", "messaging"],
  },
  docker: {
    label: "Docker",
    description:
      "Containers as a production tool — image design, Compose used in anger, and the actual difference between a container and a pod.",
    related: ["kubernetes", "deployment", "self-hosting", "coolify"],
  },
  networking: {
    label: "Networking",
    description:
      "How traffic actually reaches your app: DNS, service discovery, reverse proxies, load balancing, CDNs, and the latency each layer quietly adds.",
    related: ["infrastructure", "performance", "api-design", "kubernetes"],
  },
  "api-design": {
    label: "API design",
    description:
      "Designing APIs people can use — REST versus gRPC versus GraphQL, gateway responsibilities, rate limiting, and versioning without breaking clients.",
    related: ["architecture", "security", "networking", "microservices"],
  },
  "vector-search": {
    label: "Vector search",
    description:
      "Vector and hybrid retrieval — pgvector, Pinecone, Weaviate, Qdrant, graph search, and choosing one without regretting it six months later.",
    related: ["rag", "pgvector", "databases", "llm"],
  },
  claude: {
    label: "Claude",
    description:
      "Building on Anthropic's Claude: the API, MCP, agentic coding workflows, and what changes about a product when the model is the interface.",
    related: ["mcp", "agentic-ai", "llm", "vibe-coding"],
  },
  "machine-learning": {
    label: "Machine learning",
    description:
      "Classical ML next to generative AI — where each belongs, the MLOps around both, and the data engineering that decides whether either works.",
    related: ["ai", "ai-engineering", "llm-inference", "databases"],
  },
  "ci-cd": {
    label: "CI/CD",
    description:
      "Continuous integration and delivery that catches real problems: pipeline design, test gates, and shipping without a release ritual.",
    related: ["devops", "deployment", "code-quality", "docker"],
  },
} as const;
