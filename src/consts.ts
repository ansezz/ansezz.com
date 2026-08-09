export const SITE = {
  URL: "https://ansezz.com",
  TITLE: "Anass Ez-zouaine — Backend, AI & Shopify Engineer",
  SHORT_TITLE: "ansezz",
  DESCRIPTION:
    "Senior backend, software architect, and AI engineer. 12+ years shipping Laravel SaaS, Shopify Plus apps, and AI features (Claude, MCP, RAG). Remote-first.",
  EMAIL: "me@ansezz.com",
  PHONE: "+212679405863",
  PHONE_DISPLAY: "+212 679 40 58 63",
  BOOKING_URL: "https://calendar.app.google/x1eeuSb9UuMGF4pD9",
  RESUME_URL: "/Anass-Ez-zouaine-Resume.pdf",
  LOCATION: "Meknes, Morocco",
  TZ: "GMT+1",
};

export const OWNER = {
  NAME: "Anass Ez-zouaine",
  ROLES: ["Senior Lead Backend Engineer", "Software Architect", "AI Engineer"],
  HIGHLIGHT: "AI Engineer",
  TAGLINE:
    "I ship production backends, Shopify Plus apps, and AI features that survive real users — Laravel + Anthropic Claude + pgvector, every day.",
  CURRENTLY:
    "Productionizing agentic commerce, MCP servers, and RAG pipelines on Laravel + Shopify.",
  YEARS_EXPERIENCE: 12,
  REMOTE_SINCE: 2014,
  CONSULTING_SINCE: 2022,
  STATUS: "Open for senior / lead / advisory engagements",
};

export const AVAILABLE_FOR = [
  "Senior / Staff Engineer",
  "Tech Lead",
  "Software Architect",
  "Fractional CTO",
  "Technical Co-Founder",
  "MVP Build",
  "AI Integration Sprint",
  "Architecture Audit",
];

export const STATS = [
  { value: "12+", label: "Years shipping" },
  { value: "60+", label: "Production builds" },
  { value: "3", label: "Continents served" },
  { value: "∞", label: "Bugs squashed" },
];

export const SOCIALS = [
  { NAME: "GitHub", HREF: "https://github.com/ansezz", ICON: "lucide:github" },
  {
    NAME: "LinkedIn",
    HREF: "https://linkedin.com/in/ansezz",
    ICON: "lucide:linkedin",
  },
  { NAME: "X", HREF: "https://x.com/ansezz", ICON: "lucide:twitter" },
  {
    NAME: "Threads",
    HREF: "https://www.threads.com/@ansezz",
    ICON: "lucide:at-sign",
  },
  {
    NAME: "Instagram",
    HREF: "https://instagram.com/ansezz",
    ICON: "lucide:instagram",
  },
  {
    NAME: "Facebook",
    HREF: "https://facebook.com/ansezz",
    ICON: "lucide:facebook",
  },
  { NAME: "Email", HREF: "mailto:me@ansezz.com", ICON: "lucide:mail" },
  { NAME: "Phone", HREF: "tel:+212679405863", ICON: "lucide:phone" },
  {
    NAME: "Book a call",
    HREF: "https://calendar.app.google/x1eeuSb9UuMGF4pD9",
    ICON: "lucide:calendar",
  },
  {
    NAME: "Resume (PDF)",
    HREF: "/Anass-Ez-zouaine-Resume.pdf",
    ICON: "lucide:file-text",
  },
  { NAME: "RSS", HREF: "/rss.xml", ICON: "lucide:rss" },
];

export const X_HANDLE = "ansezz";

export const NAV = [
  { LABEL: "Home", HREF: "/" },
  { LABEL: "About", HREF: "/about/" },
  { LABEL: "Work", HREF: "/work/" },
  { LABEL: "Services", HREF: "/services/" },
  { LABEL: "Blog", HREF: "/blog/" },
  { LABEL: "Uses", HREF: "/uses/" },
  { LABEL: "Contact", HREF: "/contact/" },
];

/** Secondary links surfaced in the footer (not the primary nav). */
export const FOOTER_MORE = [
  { LABEL: "Now", HREF: "/now/" },
  { LABEL: "Tools", HREF: "/tools/" },
  { LABEL: "Library", HREF: "/library/" },
  { LABEL: "Series", HREF: "/blog/series/" },
];

export const HOME = {
  TITLE: "Home",
  DESCRIPTION:
    "Senior backend, software architect, and AI engineer. 12+ years shipping Laravel SaaS, Shopify Plus apps, and AI features — Claude, MCP, RAG, agentic systems.",
};

export const ABOUT = {
  TITLE: "About",
  DESCRIPTION:
    "Senior backend engineer and AI engineer with 12+ years of remote-only experience. Multi-tenant B2B SaaS, Shopify Plus apps, and production AI on Laravel.",
};

export const WORK = {
  TITLE: "Work",
  DESCRIPTION:
    "Selected projects across AI engineering, Shopify Plus, and multi-tenant SaaS — what I've shipped, what I learned, and what survived production.",
};

export const BLOG = {
  TITLE: "Blog",
  DESCRIPTION:
    "Notes on Laravel internals, AI engineering with Anthropic Claude and MCP, RAG pipelines, Shopify Plus, DevOps, and software architecture.",
};

// Minimum posts a tag needs before it gets its own generated OG card.
// Below this, the tag page reuses the generic blog card — avoids
// generating a PNG per long-tail tag.
export const TAG_OG_MIN_POSTS = 3;

// Curated entry points for new readers (post IDs = filename w/o extension).
export const START_HERE = [
  "why-your-rag-is-failing",
  "laravel-octane-high-traffic",
  "claude-mcp-dev-tools",
  "coolify-self-hosted-saas",
];

export const USES = {
  TITLE: "Uses",
  DESCRIPTION:
    "My production stack: Laravel, PostgreSQL, pgvector, Anthropic Claude, MCP, Shopify Plus, Coolify. Tools earn their spot by shipping, not hype.",
};

export const CONTACT = {
  TITLE: "Contact",
  DESCRIPTION:
    "Hire me for senior / lead / fractional CTO / advisory work — Laravel SaaS, Shopify Plus apps, AI feature integration, architecture audits, MVP builds.",
};

// Web3Forms-backed contact form (no backend). Get a free access key at
// https://web3forms.com, paste it here, and the form replaces the mailto CTA.
// Empty key => form is hidden, mailto stays. CSP already allows the endpoint.
export const CONTACT_FORM = {
  ACCESS_KEY: "06e57a3e-7478-4447-b601-9cd3bd46e211",
  ENDPOINT: "https://api.web3forms.com/submit",
};

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
      "docker-vs-kubernetes",
      "container-vs-pod",
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
];

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

export const CARD_TONES = [
  "paper",
  "yellow",
  "cyan",
  "green",
  "pink",
  "red",
  "purple",
] as const;
export type CardTone = (typeof CARD_TONES)[number];

export const WHAT_I_DO = [
  {
    icon: "lucide:server",
    tone: "red" as const,
    title: "Laravel SaaS that scales",
    body: "Multi-tenant B2B platforms, Octane workers, Horizon queues, Filament admins, idempotency, event sourcing, observability. Production-ready from day one.",
    href: "/work/",
    cta: "See builds",
  },
  {
    icon: "lucide:shopping-bag",
    tone: "green" as const,
    title: "Shopify Plus apps",
    body: "Public + private apps, App Bridge admin UI, GraphQL Admin & Catalog API, billing, webhooks, protected customer data, Shopify Functions, agentic commerce.",
    href: "/work/",
    cta: "See apps",
  },
  {
    icon: "lucide:brain-circuit",
    tone: "purple" as const,
    title: "AI engineering",
    body: "Anthropic Claude + MCP servers, OpenAI SDK, RAG on pgvector, agentic workflows, evaluation harnesses. Pragmatic AI that ships, not vibes.",
    href: "/blog/category/ai/",
    cta: "Read the posts",
  },
  {
    icon: "lucide:compass",
    tone: "cyan" as const,
    title: "Architecture & leadership",
    body: "Tech lead, fractional CTO, architecture reviews, hiring, mentorship. Senior engineers in a shipping mindset, not a tech-debt spiral.",
    href: "/contact/",
    cta: "Talk to me",
  },
];

export const SERVICES = [
  {
    title: "MVP Build (4-12 weeks)",
    tone: "yellow" as const,
    body: "From whiteboard to production. Auth, multi-tenancy, billing, dashboards, deployment. Laravel + your stack.",
    bullets: [
      "Architecture & schema design",
      "Auth + RBAC + tenancy",
      "Stripe / Paddle billing",
      "CI/CD + zero-downtime deploy",
    ],
  },
  {
    title: "AI Integration Sprint (2-4 weeks)",
    tone: "purple" as const,
    body: "Add real AI to an existing product. Claude, MCP, RAG, agents, with evals — not a demo, a feature.",
    bullets: [
      "Claude API + tool use",
      "MCP server build",
      "RAG on pgvector + hybrid search",
      "Eval harness + cost guardrails",
    ],
  },
  {
    title: "Shopify Plus App",
    tone: "green" as const,
    body: "Public or private app — embedded admin, billing, webhooks, App Bridge, GraphQL, billing, Shopify Functions.",
    bullets: [
      "Embedded admin (App Bridge)",
      "Billing + dunning + analytics",
      "Catalog / Orders / Customer APIs",
      "Protected customer data review",
    ],
  },
  {
    title: "Architecture Audit",
    tone: "cyan" as const,
    body: "A senior set of eyes on your stack, before you scale. Code, schema, infra, deployment, risk.",
    bullets: [
      "1-week deep audit",
      "Risk + cost report",
      "12-week remediation plan",
      "Optional pair-programming follow-up",
    ],
  },
];

export const LANGUAGES = [
  { label: "Arabic", level: "Native" },
  { label: "English", level: "Professional" },
  { label: "French", level: "Basic" },
];

// ── Services page ─────────────────────────────────────────
export const SERVICES_PAGE = {
  TITLE: "Services",
  DESCRIPTION:
    "Senior engineering by the engagement — Laravel SaaS MVPs, AI integration sprints, Shopify Plus apps, and architecture audits. Fixed-scope, senior-only.",
  HOW: [
    {
      step: "01",
      title: "Discovery call",
      body: "Free 15-minute call. We scope the problem, I tell you honestly if I'm the right fit and what it'll take.",
      icon: "lucide:phone-call",
      tone: "yellow" as const,
    },
    {
      step: "02",
      title: "Fixed proposal",
      body: "You get a written scope, milestones, and a flat price or weekly rate. No open-ended hourly surprises.",
      icon: "lucide:file-text",
      tone: "cyan" as const,
    },
    {
      step: "03",
      title: "Build in the open",
      body: "Short async updates, a shared board, demos every few days. You see progress, not a black box.",
      icon: "lucide:git-commit-horizontal",
      tone: "green" as const,
    },
    {
      step: "04",
      title: "Ship + handoff",
      body: "Deployed, documented, tested. I hand off clean code your team can own — or stay on retainer.",
      icon: "lucide:rocket",
      tone: "pink" as const,
    },
  ],
};

export const SERVICES_FAQ = [
  {
    question: "What's your rate?",
    answer:
      "Most work is fixed-scope per engagement (MVP build, AI sprint, audit). For ongoing or advisory work I bill a weekly retainer. Book a discovery call and I'll quote against your actual scope — no hourly meter.",
  },
  {
    question: "Do you work solo or with a team?",
    answer:
      "Solo for most builds — you get a senior engineer, not a layer of juniors. For larger scopes I bring in vetted specialists I've shipped with, and stay accountable for the whole delivery.",
  },
  {
    question: "What time zones do you cover?",
    answer:
      "Based in Morocco (GMT+1). I overlap EU mornings and US-East afternoons daily, and work async-first with replies within 24 hours.",
  },
  {
    question: "Can you take over an existing / messy codebase?",
    answer:
      "Yes. Start with an Architecture Audit — one week, a written risk report, and a remediation plan. From there we either fix forward together or I lead the cleanup.",
  },
  {
    question: "Do you sign NDAs and work under contract?",
    answer:
      "Always. NDA up front if you need it, then a simple statement of work covering scope, milestones, IP assignment, and payment terms before any code is written.",
  },
];

// ── Testimonials ──────────────────────────────────────────
// TODO(owner): Replace these with REAL, attributable testimonials
// before publishing. Each should be something a named client/colleague
// actually said and is happy to be quoted on. Empty array => section
// auto-hides. Do NOT ship fabricated social proof.
export interface Testimonial {
  quote: string;
  name: string;
  role: string;
  tone: "yellow" | "pink" | "cyan" | "green";
}

export const TESTIMONIALS: Testimonial[] = [];

// ── /now page ─────────────────────────────────────────────
export const NOW = {
  TITLE: "Now",
  DESCRIPTION:
    "What Anass Ez-zouaine is building right now — current projects in agentic AI, MCP, and RAG, what I'm learning, and the engagements I'm open to this season.",
  // Keep this honest and current. Update the date when you edit it.
  UPDATED: "2026-05-29",
  FOCUS: [
    {
      icon: "lucide:brain-circuit",
      tone: "purple" as const,
      title: "Building",
      body: "Productionizing agentic commerce, MCP servers, and RAG pipelines on Laravel + Shopify Plus — evals and cost guardrails included.",
    },
    {
      icon: "lucide:book-open",
      tone: "cyan" as const,
      title: "Learning",
      body: "Deeper on agent evaluation harnesses, context engineering, and squeezing latency out of pgvector hybrid search at scale.",
    },
    {
      icon: "lucide:pen-line",
      tone: "yellow" as const,
      title: "Writing",
      body: "Shipping posts on RAG failure modes, Laravel Octane under load, and self-hosting SaaS on Coolify. New one roughly every week.",
    },
    {
      icon: "lucide:handshake",
      tone: "green" as const,
      title: "Available for",
      body: "Senior / lead / fractional CTO and advisory work. Selective on fit — a free discovery call tells us both fast.",
    },
  ],
};

// ── Free tools ────────────────────────────────────────────
export const TOOLS = {
  TITLE: "Tools",
  DESCRIPTION:
    "Free, no-signup engineering tools that run in your browser — LLM cost calculator, token counter, cron explainer, JWT decoder, and a UUID generator.",
};

export interface ToolEntry {
  title: string;
  blurb: string;
  href: string;
  icon: string;
  tone: "yellow" | "pink" | "cyan" | "green" | "purple";
  status: "live" | "soon";
}

export const TOOL_LIST: ToolEntry[] = [
  {
    title: "LLM Cost Calculator",
    blurb:
      "Estimate API spend across Claude, GPT, and friends. Tokens in/out × requests × model price — see the monthly bill before you ship.",
    href: "/tools/llm-cost-calculator/",
    icon: "lucide:calculator",
    tone: "yellow",
    status: "live",
  },
  {
    title: "Token Counter",
    blurb:
      "Paste any text and estimate token count for Claude and GPT models — plus characters, words, and a rough per-call cost. All in your browser.",
    href: "/tools/token-counter/",
    icon: "lucide:hash",
    tone: "cyan",
    status: "live",
  },
  {
    title: "Cron Explainer",
    blurb:
      "Decode a cron expression into plain English, field by field. Built it for my own schedulers — paste a 5-field cron and read what it actually does.",
    href: "/tools/cron-explainer/",
    icon: "lucide:clock",
    tone: "pink",
    status: "live",
  },
  {
    title: "JWT Decoder",
    blurb:
      "Paste a JWT and read its header and payload — claims, algorithm, and expiry decoded in your browser. Decode-only; nothing is sent anywhere.",
    href: "/tools/jwt-decoder/",
    icon: "lucide:key-round",
    tone: "purple",
    status: "live",
  },
  {
    title: "UUID Generator",
    blurb:
      "Generate v4 UUIDs in bulk, copy with one click. Crypto-random, instant, offline. Handy for seeds, fixtures, and quick IDs.",
    href: "/tools/uuid-generator/",
    icon: "lucide:fingerprint",
    tone: "green",
    status: "live",
  },
];

// ── Library / reading list ────────────────────────────────
// Things I recommend. Edit freely — these are starting picks
// aligned to the stack; swap in your own favorites and notes.
export const LIBRARY = {
  TITLE: "Library",
  DESCRIPTION:
    "Books, tools, and resources I recommend for backend engineering, AI, and shipping production software — curated, not exhaustive.",
};

export interface LibraryItem {
  name: string;
  by?: string;
  note: string;
  url?: string;
}
export interface LibraryGroup {
  heading: string;
  icon: string;
  tone: "yellow" | "pink" | "cyan" | "green" | "purple" | "blue";
  items: LibraryItem[];
}

export const LIBRARY_GROUPS: LibraryGroup[] = [
  {
    heading: "Books",
    icon: "lucide:book",
    tone: "yellow",
    items: [
      {
        name: "Designing Data-Intensive Applications",
        by: "Martin Kleppmann",
        note: "The reference for how real systems store, move, and break data. Re-read it.",
        url: "https://dataintensive.net/",
      },
      {
        name: "A Philosophy of Software Design",
        by: "John Ousterhout",
        note: "Deep modules, shallow interfaces. Changed how I scope abstractions.",
      },
      {
        name: "Clean Architecture",
        by: "Robert C. Martin",
        note: "Take the boundaries, leave the dogma. Still the clearest layering primer.",
      },
    ],
  },
  {
    heading: "Docs worth reading cover-to-cover",
    icon: "lucide:file-text",
    tone: "cyan",
    items: [
      {
        name: "Anthropic Claude docs",
        note: "Tool use, prompt caching, agents, MCP — the source of truth for building on Claude.",
        url: "https://docs.anthropic.com/",
      },
      {
        name: "Laravel docs",
        note: "Queues, Octane, Horizon — the parts most people skip are the ones that scale.",
        url: "https://laravel.com/docs",
      },
      {
        name: "Model Context Protocol",
        note: "The standard for wiring tools into LLMs. Short spec, big implications.",
        url: "https://modelcontextprotocol.io/",
      },
    ],
  },
  {
    heading: "Tools I reach for",
    icon: "lucide:wrench",
    tone: "green",
    items: [
      {
        name: "Coolify",
        note: "Self-hosted PaaS. Ship SaaS on your own boxes without the platform bill.",
        url: "https://coolify.io/",
      },
      {
        name: "pgvector",
        note: "Vector search inside Postgres — one database instead of two for most RAG.",
        url: "https://github.com/pgvector/pgvector",
      },
      {
        name: "Filament",
        note: "Laravel admin panels that don't feel like 2012. Ships internal tooling fast.",
        url: "https://filamentphp.com/",
      },
    ],
  },
];

// ── Comments (giscus) ─────────────────────────────────────
// Fill these from https://giscus.app after enabling GitHub
// Discussions on the repo, then set ENABLED = true.
export const COMMENTS = {
  ENABLED: true,
  REPO: "ansezz/ansezz.com",
  REPO_ID: "MDEwOlJlcG9zaXRvcnk0MDM4ODA0NDE=",
  CATEGORY: "General",
  CATEGORY_ID: "DIC_kwDOGBK5-c4C-GwR",
  MAPPING: "pathname",
  REACTIONS: true,
};

export interface OtherProjectLink {
  name: string;
  url: string;
  note: string;
  tone:
    | "yellow"
    | "pink"
    | "cyan"
    | "green"
    | "red"
    | "blue"
    | "purple"
    | "ink";
}

export const OTHER_SHOPIFY_STOREFRONTS: OtherProjectLink[] = [
  {
    name: "Inked Shop",
    url: "https://www.inkedshop.com/",
    note: "Apparel + lifestyle DTC",
    tone: "pink",
  },
  {
    name: "Pure Craft CBD",
    url: "https://pure-craft-cbd.myshopify.com/",
    note: "CBD DTC w/ age-gate + compliance",
    tone: "green",
  },
  {
    name: "Freestyle USA",
    url: "https://www.freestyleusa.com/",
    note: "Watches + lifestyle goods",
    tone: "yellow",
  },
  {
    name: "Neven Eyewear",
    url: "https://neveneyewear.com/",
    note: "Sunglasses + Rx flow",
    tone: "cyan",
  },
  {
    name: "Naví Eyewear",
    url: "https://navieyewear.com/",
    note: "Prescription eyewear",
    tone: "blue",
  },
  {
    name: "Mike Tyson Store",
    url: "https://miketyson.com/",
    note: "Celebrity DTC, spike-ready",
    tone: "red",
  },
  {
    name: "Montrichard",
    url: "https://www.montrichardwatch.com/",
    note: "Watches DTC",
    tone: "purple",
  },
  {
    name: "Printworks Market US",
    url: "https://printworksmarket.us/",
    note: "Print on demand storefront",
    tone: "yellow",
  },
  {
    name: "Printworks Market",
    url: "https://printworksmarket.com/",
    note: "Print on demand storefront",
    tone: "cyan",
  },
  {
    name: "Encrouter",
    url: "https://www.encrouter.com/",
    note: "DTC storefront",
    tone: "pink",
  },
  {
    name: "Mina Basta Polare",
    url: "https://minabastapolare.se/",
    note: "Swedish DTC",
    tone: "green",
  },
  {
    name: "LiveFresh",
    url: "http://livefresh.de/",
    note: "German DTC",
    tone: "red",
  },
  {
    name: "Makan Home",
    url: "https://makanhome.ae/",
    note: "UAE home goods, bilingual",
    tone: "purple",
  },
  {
    name: "Kurtains",
    url: "https://kurtains.ae/",
    note: "UAE home goods, RTL",
    tone: "blue",
  },
  {
    name: "Moroccan Goods",
    url: "https://moroccangoods.shop/",
    note: "DTC heritage goods",
    tone: "yellow",
  },
];

export const OTHER_SHOPIFY_APPS: OtherProjectLink[] = [
  {
    name: "Protect App",
    url: "https://apps.shopify.com/protect-app",
    note: "Shipping protection at checkout",
    tone: "red",
  },
  {
    name: "XCO Agency partner page",
    url: "https://apps.shopify.com/partners/xco-agency-llc",
    note: "Full Shopify app portfolio",
    tone: "ink",
  },
];

export const OTHER_PLATFORMS: OtherProjectLink[] = [
  {
    name: "Medi1",
    url: "https://www.medi1.com/",
    note: "Radio + live stream",
    tone: "cyan",
  },
  {
    name: "Edigrains",
    url: "https://edigrains.mobiletic.com/",
    note: "Content-creation SaaS",
    tone: "green",
  },
  {
    name: "Tekency",
    url: "https://tekency.com/",
    note: "Agency portal",
    tone: "yellow",
  },
  {
    name: "LE Ventures",
    url: "https://leventures.com/",
    note: "Studio + product portfolio",
    tone: "pink",
  },
  {
    name: "Proxify profile",
    url: "https://proxify.io/",
    note: "Vetted senior developer",
    tone: "purple",
  },
  {
    name: "Upwork profile",
    url: "https://www.upwork.com/freelancers/~011077fb7451836916",
    note: "Top-rated freelance history",
    tone: "green",
  },
];
