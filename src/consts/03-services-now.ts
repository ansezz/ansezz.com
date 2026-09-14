export const WHAT_I_DO = [
  {
    icon: "lucide:server",
    tone: "red" as const,
    title: "Laravel SaaS that scales",
    body: "Multi-tenant B2B platforms, Octane workers, Horizon queues, Filament admins, idempotency, event sourcing, observability. Production-ready from day one.",
    href: "/work/?lane=saas",
    cta: "See builds",
  },
  {
    icon: "lucide:shopping-bag",
    tone: "green" as const,
    title: "Shopify Plus apps",
    body: "Public + private apps, App Bridge admin UI, GraphQL Admin & Catalog API, billing, webhooks, protected customer data, Shopify Functions, agentic commerce.",
    href: "/work/?lane=shopify",
    cta: "See apps",
  },
  {
    icon: "lucide:brain-circuit",
    tone: "purple" as const,
    title: "AI engineering",
    body: "Anthropic Claude + MCP servers, OpenAI SDK, RAG on pgvector, agentic workflows, evaluation harnesses. Pragmatic AI that ships, not vibes.",
    href: "/work/?lane=ai",
    cta: "See AI work",
  },
  {
    icon: "lucide:compass",
    tone: "cyan" as const,
    title: "Architecture & leadership",
    body: "Tech lead, fractional CTO, architecture reviews, hiring, mentorship. Senior engineers in a shipping mindset, not a tech-debt spiral.",
    href: "/work/?lane=architecture",
    cta: "Talk architecture",
  },
];

export const SERVICES = [
  {
    id: "mvp" as const,
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
    id: "ai" as const,
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
    id: "shopify" as const,
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
    id: "audit" as const,
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

/** Package query param → display label for contact-form microcopy. */
export const PACKAGE_LABEL: Record<(typeof SERVICES)[number]["id"], string> = {
  mvp: "MVP Build",
  ai: "AI Integration Sprint",
  shopify: "Shopify Plus App",
  audit: "Architecture Audit",
};

/** Optional lane→package alias when someone lands with ?lane=… */
export const LANE_TO_PACKAGE: Record<string, (typeof SERVICES)[number]["id"]> = {
  saas: "mvp",
  ai: "ai",
  shopify: "shopify",
  architecture: "audit",
  audit: "audit",
  mvp: "mvp",
};

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
      "Most work is fixed-scope per engagement (MVP build, AI sprint, Shopify app, audit). I'll quote a fixed price after the intro once we nail scope — no invented floors here, no hourly meter. Ongoing / advisory work is a weekly retainer when that's the better fit.",
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
// Keep empty until you have 2–3 REAL, named quotes a client/colleague
// is happy to put their name on. Shape: { quote, name, role, tone }.
// Home Testimonials.astro already hides the quote grid when length === 0
// and still shows the "Shipped for" brand strip. Do NOT invent quotes.
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
    "What Anass Ez-zouaine is building right now — agentic commerce, MCP, RAG, and the scoped builds I'm taking this season.",
  // Keep this honest and current. Update the date when you edit it.
  UPDATED: "2026-09-14",
  FOCUS: [
    {
      icon: "lucide:brain-circuit",
      tone: "purple" as const,
      title: "Building",
      body: "Still in the trenches on agentic commerce (Shopify Catalog / UCP), MCP servers wired into real SaaS surfaces, and RAG pipelines that don't melt under evals. Laravel + Claude + pgvector, every day.",
    },
    {
      icon: "lucide:book-open",
      tone: "cyan" as const,
      title: "Learning",
      body: "Context engineering vs prompt theater. Agent eval harnesses that catch regressions before users do. Hybrid search latency when the index actually has product data in it.",
    },
    {
      icon: "lucide:pen-line",
      tone: "yellow" as const,
      title: "Writing",
      body: "August 2026 stretch covered agentic commerce, MCP vs A2A/ACP, RAG failure modes, and vibe-coding → agentic engineering. More of that — from the build, not the brochure.",
    },
    {
      icon: "lucide:handshake",
      tone: "green" as const,
      title: "Available for",
      body: "Scoped builds first: MVP, AI Integration Sprint, Shopify Plus app, architecture audit. Lead / advisory when the fit is real — free discovery call either way.",
    },
  ],
};
