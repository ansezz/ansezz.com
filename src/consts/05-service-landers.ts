/**
 * SEO service landers (/services/<slug>/). Copy lives here; pages stay thin.
 * Voice: simple English, confident. No em dashes, no fabricated metrics.
 */

export type ServiceLanderTone =
  | "yellow"
  | "pink"
  | "cyan"
  | "green"
  | "red"
  | "purple";

export type ServicePackageId = "mvp" | "ai" | "shopify" | "audit";

export interface ServiceLanderRelated {
  href: string;
  label: string;
  note: string;
  kind: "Post" | "Page";
}

export interface ServiceLanderFaq {
  question: string;
  answer: string;
}

export interface ServiceLander {
  /** URL segment under /services/ */
  slug: string;
  packageId: ServicePackageId;
  /** Document title, keep ≤60 chars */
  title: string;
  /** Meta description, aim ~155 chars */
  description: string;
  eyebrow: string;
  heading: string;
  intro: string;
  tone: ServiceLanderTone;
  icon: string;
  whoForTitle: string;
  whoFor: string[];
  whatYouGetTitle: string;
  whatYouGet: string[];
  related: ServiceLanderRelated[];
  faq: ServiceLanderFaq[];
  ctaHeading: string;
  ctaBody: string;
  ctaLabel: string;
}

export const SERVICE_LANDERS: ServiceLander[] = [
  {
    slug: "laravel-saas",
    packageId: "mvp",
    title: "Laravel SaaS MVP | Multi-tenant, Octane, Billing",
    description:
      "Ship a multi-tenant Laravel SaaS MVP with auth, billing, Octane, and CI/CD. Fixed-scope senior build in 4-12 weeks. Free discovery call first.",
    eyebrow: "MVP Build · Laravel",
    heading: "Multi-tenant Laravel SaaS, built to ship.",
    intro:
      "From whiteboard to production: tenancy, RBAC, billing, Octane workers, and a deploy pipeline your team can own. Senior-only, fixed scope, no junior relay.",
    tone: "yellow",
    icon: "lucide:server",
    whoForTitle: "Who this is for",
    whoFor: [
      "Founders who need a B2B SaaS MVP in weeks, not a year of agency churn.",
      "Product teams replacing a fragile prototype with a tenancy-safe Laravel core.",
      "CTO / tech leads who want architecture decisions written down before scale.",
    ],
    whatYouGetTitle: "What you get",
    whatYouGet: [
      "Architecture and schema designed for multi-tenant isolation from day one",
      "Auth, RBAC, and tenancy (single-DB or multi-DB) wired for real customers",
      "Stripe or Paddle billing with webhooks you can trust",
      "Octane / Horizon where load actually needs it, not cargo-culted",
      "CI/CD, zero-downtime deploys, and docs so your team can extend it",
    ],
    related: [
      {
        href: "/blog/laravel-multi-tenancy/",
        label: "Laravel multi-tenancy architecture",
        note: "Single DB vs multi-DB, scopes that stop leaks, and production tenancy patterns.",
        kind: "Post",
      },
      {
        href: "/blog/laravel-octane-high-traffic/",
        label: "Laravel Octane for high traffic",
        note: "When Octane helps, when it hurts, and how to run it safely.",
        kind: "Post",
      },
      {
        href: "/blog/modular-monolith-first/",
        label: "Modular monoliths first",
        note: "Why most SaaS teams should ship a modular monolith before microservices.",
        kind: "Post",
      },
      {
        href: "/work/order-protection-saas/",
        label: "Order protection SaaS",
        note: "A Shopify-adjacent SaaS build: billing, ops, and merchant workflows.",
        kind: "Page",
      },
    ],
    faq: [
      {
        question: "How long does an MVP build take?",
        answer:
          "Most Laravel SaaS MVPs land in 4-12 weeks depending on tenancy model, billing depth, and how many admin surfaces you need. We lock scope after a free discovery call, then work to a written proposal.",
      },
      {
        question: "Do you start greenfield or take over an existing app?",
        answer:
          "Both. Greenfield gets a clean modular layout. Existing apps usually start with a short architecture pass so we do not rebuild the wrong parts.",
      },
      {
        question: "What stack do you default to?",
        answer:
          "Laravel, PostgreSQL, Redis, Horizon, Filament or a lean Inertia/Vue admin when that fits, Stripe or Paddle for billing, and Coolify or your preferred host for deploys. We adapt to your constraints.",
      },
      {
        question: "Will my team be able to own the code?",
        answer:
          "Yes. Hand-off includes structure docs, env runbooks, and a clear module map. The goal is that your engineers ship the next feature without me.",
      },
    ],
    ctaHeading: "Ready to scope your SaaS MVP?",
    ctaBody:
      "Free 15-minute discovery call. I will say honestly if Laravel SaaS is the right package, or if an audit should come first.",
    ctaLabel: "Start MVP build →",
  },
  {
    slug: "shopify-plus-apps",
    packageId: "shopify",
    title: "Shopify Plus Apps | App Bridge & Agentic Commerce",
    description:
      "Build public or private Shopify Plus apps with App Bridge, GraphQL, billing, and agentic commerce readiness. Fixed-scope senior delivery.",
    eyebrow: "Shopify Plus · Apps",
    heading: "Shopify Plus apps that merchants actually use.",
    intro:
      "Embedded admin, solid billing, webhook-safe data flows, and a path toward agentic commerce. Public app or private Plus build, same senior bar.",
    tone: "green",
    icon: "lucide:shopping-bag",
    whoForTitle: "Who this is for",
    whoFor: [
      "Merchants and Plus brands that need a private app deeper than an app-store template.",
      "Founders shipping a public Shopify app with billing, review readiness, and real ops.",
      "Teams adding App Bridge admin UI, Functions, or agent-ready catalog surfaces.",
    ],
    whatYouGetTitle: "What you get",
    whatYouGet: [
      "Embedded admin with App Bridge and Polaris that feels native to Shopify",
      "GraphQL Admin / Catalog API integration with idempotent webhooks",
      "Billing, dunning, and analytics hooks that match your pricing model",
      "Protected customer data review support when your app needs it",
      "Optional agentic commerce / UCP readiness so agents can shop safely",
    ],
    related: [
      {
        href: "/blog/secure-agentic-commerce-shopify/",
        label: "Secure agentic commerce on Shopify",
        note: "Auth, scopes, and safety patterns when agents buy on behalf of customers.",
        kind: "Post",
      },
      {
        href: "/blog/shopify-ucp-quick-start/",
        label: "Shopify UCP quick-start",
        note: "Make your store agent-ready without rewriting the whole stack.",
        kind: "Post",
      },
      {
        href: "/work/claimify-warranty-claims/",
        label: "Claimify warranty claims",
        note: "Embedded admin queue for warranty and returns inside Shopify Admin.",
        kind: "Page",
      },
      {
        href: "/work/agent-commerce-suite/",
        label: "Agent Commerce Suite",
        note: "AI optimization surfaces for Shopify merchants and catalogs.",
        kind: "Page",
      },
    ],
    faq: [
      {
        question: "Public app or private Plus app?",
        answer:
          "Either. Public apps need billing, listing, and review discipline. Private Plus apps prioritize deep merchant workflows and data access. The engagement shape changes; the engineering bar does not.",
      },
      {
        question: "Do you handle App Store review?",
        answer:
          "I build to Shopify's review expectations (scopes, protected customer data, billing UX) and help you prepare the submission. You own the Partner account and final submit.",
      },
      {
        question: "Can you work with an existing Remix or Laravel app?",
        answer:
          "Yes. Many projects extend an in-progress app: fix webhook reliability, finish billing, or add App Bridge surfaces without a full rewrite.",
      },
      {
        question: "What about agentic commerce / UCP?",
        answer:
          "If your roadmap includes agents shopping or catalog tools for AI clients, we can design those surfaces into the same engagement or as a follow-on sprint.",
      },
    ],
    ctaHeading: "Ready to build the Shopify app?",
    ctaBody:
      "Free discovery call. We map public vs private, scopes, and whether agentic commerce belongs in v1.",
    ctaLabel: "Start Shopify app →",
  },
  {
    slug: "ai-mcp",
    packageId: "ai",
    title: "AI & MCP Integration | Claude, RAG, and Evals",
    description:
      "Add Claude, MCP servers, RAG, and evals to your existing product. A 2-4 week AI integration sprint with cost guardrails and production handoff.",
    eyebrow: "AI Integration Sprint",
    heading: "AI that ships into your product, not a demo.",
    intro:
      "Claude tool use, MCP servers, RAG on pgvector, and an eval harness your team can run. Pragmatic AI wired into the product you already have.",
    tone: "purple",
    icon: "lucide:brain-circuit",
    whoForTitle: "Who this is for",
    whoFor: [
      "Product teams that want Claude or MCP capabilities inside an existing SaaS.",
      "Engineering leads who need RAG that survives production traffic and cost limits.",
      "Founders past the prototype who need evals, auth, and audit trails before launch.",
    ],
    whatYouGetTitle: "What you get",
    whatYouGet: [
      "Claude API integration with tool use shaped to your domain",
      "MCP server build or hardening (auth, audit logging, structured errors)",
      "RAG on pgvector with hybrid search when keyword recall still matters",
      "Eval harness and cost guardrails so regressions and spend stay visible",
      "Handoff docs so your team can extend tools and prompts safely",
    ],
    related: [
      {
        href: "/blog/mcp-first-is-the-new-mobile-first/",
        label: "MCP first is the new mobile first",
        note: "Why tools, skills, and permissions come before another chat UI.",
        kind: "Post",
      },
      {
        href: "/blog/mcp-auth-audit-logging-laravel/",
        label: "MCP auth and audit logging",
        note: "Tenant-safe MCP in Laravel: who called what, and how you prove it.",
        kind: "Post",
      },
      {
        href: "/blog/why-your-rag-is-failing/",
        label: "Why RAG fails in production",
        note: "Common failure modes and the fixes that actually move quality.",
        kind: "Post",
      },
      {
        href: "/work/mcp-saas-server/",
        label: "MCP server for internal SaaS",
        note: "A production MCP surface wired into a real multi-tenant product.",
        kind: "Page",
      },
      {
        href: "/work/rag-hybrid-search/",
        label: "Production RAG on pgvector",
        note: "Hybrid search pipeline that held up past the demo stage.",
        kind: "Page",
      },
    ],
    faq: [
      {
        question: "How long is the AI integration sprint?",
        answer:
          "Usually 2-4 weeks for a focused feature: one MCP surface, a RAG path, or Claude tool use with evals. Larger agent platforms get a longer proposal after discovery.",
      },
      {
        question: "Do you only work with Laravel?",
        answer:
          "Laravel is my deepest stack for multi-tenant SaaS and MCP, but the patterns transfer. We meet your product where it is and keep the integration boring and testable.",
      },
      {
        question: "Will this burn my API budget?",
        answer:
          "Cost guardrails are part of the sprint: caching, rate limits, token budgets, and eval gates so you see spend and quality before users do.",
      },
      {
        question: "What about model lock-in?",
        answer:
          "I default to Claude where tool use is strong, and keep provider boundaries thin so you can swap or dual-run later. No opaque SDK spaghetti.",
      },
    ],
    ctaHeading: "Ready to add real AI?",
    ctaBody:
      "Free discovery call. We pick one high-value surface, not a kitchen-sink agent rewrite.",
    ctaLabel: "Start AI sprint →",
  },
  {
    slug: "architecture-audit",
    packageId: "audit",
    title: "Architecture Audit | Risk Report & Remediation",
    description:
      "One-week senior architecture audit covering code, schema, infra, and deploy risk. Written report plus a 12-week remediation plan you can run.",
    eyebrow: "Architecture Audit",
    heading: "A senior set of eyes before you scale.",
    intro:
      "One focused week on your stack: code, schema, infra, and deploy path. You leave with a risk report and a 12-week remediation plan, not a slide deck of vibes.",
    tone: "cyan",
    icon: "lucide:compass",
    whoForTitle: "Who this is for",
    whoFor: [
      "Teams about to raise, hire, or rewrite and need an honest risk picture first.",
      "Founders inheriting a messy codebase who want a prioritized fix plan.",
      "CTOs who want an outside senior review before a big migration bet.",
    ],
    whatYouGetTitle: "What you get",
    whatYouGet: [
      "One-week deep audit across app code, data model, infra, and deploys",
      "Written risk and cost report ranked by severity and blast radius",
      "A 12-week remediation plan your team can execute without me",
      "Optional pair-programming follow-up on the highest-risk items",
      "Clear call on build vs buy vs wait for the next architecture decision",
    ],
    related: [
      {
        href: "/blog/modular-monolith-first/",
        label: "Modular monoliths first",
        note: "A practical lens for whether microservices are premature.",
        kind: "Post",
      },
      {
        href: "/blog/laravel-multi-tenancy/",
        label: "Laravel multi-tenancy",
        note: "Isolation patterns that show up often in SaaS audit findings.",
        kind: "Post",
      },
      {
        href: "/blog/mcp-auth-audit-logging-laravel/",
        label: "MCP auth and audit logging",
        note: "Security and audit gaps that appear when AI surfaces hit multi-tenant apps.",
        kind: "Post",
      },
      {
        href: "/services/",
        label: "All service packages",
        note: "MVP, AI sprint, Shopify app, or stay on audit follow-up.",
        kind: "Page",
      },
    ],
    faq: [
      {
        question: "What does the week look like?",
        answer:
          "Access and context on day one, deep review mid-week, and a written report plus walkthrough at the end. Async updates so you are never in the dark.",
      },
      {
        question: "Do you need full repo access?",
        answer:
          "Read access to the main repos, infra diagrams or IaC, and a short architecture tour from someone who knows the system. NDA first if you need it.",
      },
      {
        question: "What happens after the audit?",
        answer:
          "You can run the remediation plan in-house, bring me back for a scoped build, or keep a light advisory retainer. No pressure either way.",
      },
      {
        question: "Is this only for Laravel?",
        answer:
          "Laravel and Shopify-adjacent stacks are where I go deepest, but the audit method applies to any modern web backend. Fit is confirmed on the discovery call.",
      },
    ],
    ctaHeading: "Ready for an honest audit?",
    ctaBody:
      "Free discovery call. If an audit is not the right first move, I will say so.",
    ctaLabel: "Start architecture audit →",
  },
];

export const SERVICE_LANDERS_BY_SLUG: Record<string, ServiceLander> =
  Object.fromEntries(SERVICE_LANDERS.map((l) => [l.slug, l]));

export const SERVICE_LANDERS_BY_PACKAGE: Record<
  ServicePackageId,
  ServiceLander
> = Object.fromEntries(
  SERVICE_LANDERS.map((l) => [l.packageId, l]),
) as Record<ServicePackageId, ServiceLander>;
