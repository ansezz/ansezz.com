/**
 * SEO problem / intent pages (/<slug>/). Copy lives here; pages stay thin.
 * Voice: simple English, confident. No em dashes, no fabricated metrics.
 * Distinct from service landers: problem-first, approach-specific, links to package.
 */

import type {
  ServiceLanderFaq,
  ServiceLanderRelated,
  ServiceLanderTone,
  ServicePackageId,
} from "./05-service-landers";

export interface ProblemApproachStep {
  title: string;
  body: string;
}

export interface ProblemPage {
  /** URL segment at site root, e.g. "mcp-for-laravel-saas" */
  slug: string;
  packageId: ServicePackageId;
  /** Related service lander path */
  serviceHref: string;
  serviceLabel: string;
  /** Document title, keep ≤60 chars */
  title: string;
  /** Meta description, aim ~155 chars */
  description: string;
  eyebrow: string;
  heading: string;
  intro: string;
  tone: ServiceLanderTone;
  icon: string;
  problemTitle: string;
  problem: string[];
  whoForTitle: string;
  whoFor: string[];
  approachTitle: string;
  approach: ProblemApproachStep[];
  whatYouGetTitle: string;
  whatYouGet: string[];
  related: ServiceLanderRelated[];
  faq: ServiceLanderFaq[];
  ctaHeading: string;
  ctaBody: string;
  ctaLabel: string;
}

export const PROBLEM_PAGES: ProblemPage[] = [
  {
    slug: "mcp-for-laravel-saas",
    packageId: "ai",
    serviceHref: "/services/ai-mcp/",
    serviceLabel: "AI & MCP Integration package",
    title: "MCP for Laravel SaaS | Multi-tenant Safe",
    description:
      "Add MCP to an existing multi-tenant Laravel SaaS without leaking tenants. Auth, audit logs, idempotent tools, and evals. Senior AI integration sprint.",
    eyebrow: "Problem · MCP + Laravel",
    heading: "Add MCP to your Laravel SaaS without breaking tenancy.",
    intro:
      "Agents that can call your product are useful. Agents that can see another tenant are a career-ending bug. This page is for teams who already ship Laravel SaaS and need MCP done the boring, safe way.",
    tone: "purple",
    icon: "lucide:shield-check",
    problemTitle: "The problem",
    problem: [
      "Most MCP demos assume a single user and a toy database. Your app has tenants, roles, billing states, and mutations that must never run twice.",
      "Dropping a chat UI on top of existing controllers skips auth boundaries, audit trails, and structured tool errors. The first production incident is usually a silent cross-tenant read, not a model quality issue.",
      "You need tools that respect the same tenancy and RBAC your HTTP API already enforces, plus logs that prove who called what.",
    ],
    whoForTitle: "Who this is for",
    whoFor: [
      "Teams with a live multi-tenant Laravel product who want Claude or other agents to act inside it.",
      "Engineering leads who will not ship MCP without tenant isolation, audit logging, and idempotent mutations.",
      "Founders past the prototype who need a focused sprint, not a rewrite of the whole SaaS.",
    ],
    approachTitle: "How I approach it",
    approach: [
      {
        title: "Map the blast radius",
        body: "We list which tools read vs write, which tenants they can touch, and which existing policies already cover them. No new surface without an owner.",
      },
      {
        title: "Auth and audit first",
        body: "MCP calls inherit your tenancy and RBAC. Every tool invocation gets an audit row: who, which tenant, which tool, what args, what result.",
      },
      {
        title: "Safe mutations",
        body: "Writes get idempotency keys and structured errors so agents can retry without double charges, double invites, or half-applied state.",
      },
      {
        title: "Ship with evals",
        body: "A small harness covers happy paths and the failure modes that matter (wrong tenant, expired auth, malformed args) before users see them.",
      },
    ],
    whatYouGetTitle: "What you get",
    whatYouGet: [
      "MCP server (or hardening pass) wired into your Laravel app",
      "Tenant-scoped auth, RBAC checks, and audit logging on every tool call",
      "Idempotent mutation patterns and structured tool errors agents can handle",
      "Eval cases for isolation and failure modes, plus handoff docs for your team",
      "A clear link into the broader AI & MCP package if you want Claude tool use or RAG next",
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
        label: "MCP auth and audit logging in Laravel",
        note: "Tenant-safe MCP: who called what, and how you prove it.",
        kind: "Post",
      },
      {
        href: "/blog/mcp-idempotency-laravel-mutations/",
        label: "MCP idempotency for Laravel mutations",
        note: "Stop double writes when agents retry tool calls.",
        kind: "Post",
      },
      {
        href: "/blog/mcp-structured-tool-errors-laravel/",
        label: "Structured MCP tool errors",
        note: "Errors agents can parse instead of opaque 500s.",
        kind: "Post",
      },
      {
        href: "/blog/api-vs-mcp/",
        label: "API vs MCP",
        note: "When a classic API is enough, and when MCP earns its keep.",
        kind: "Post",
      },
      {
        href: "/services/ai-mcp/",
        label: "AI & MCP Integration package",
        note: "The engagement that covers Claude, MCP, RAG, and evals.",
        kind: "Page",
      },
    ],
    faq: [
      {
        question: "Can you add MCP to an existing Laravel SaaS?",
        answer:
          "Yes. That is the default. We wire tools into the product you already run, reuse tenancy and policies where they are solid, and only invent new boundaries when the current ones are wrong.",
      },
      {
        question: "Will agents be able to see other tenants?",
        answer:
          "Not if we do the job. Tool handlers resolve the acting tenant and user before any query runs. Isolation failures are treated as release blockers, covered in evals.",
      },
      {
        question: "How long does this take?",
        answer:
          "A focused MCP surface usually fits a 2-4 week AI integration sprint. Scope is locked after a free discovery call so we are not inventing tools mid-flight.",
      },
      {
        question: "Do you only support Claude?",
        answer:
          "Claude is a strong default for tool use. The MCP surface itself stays client-agnostic so other agents can call the same tools later.",
      },
    ],
    ctaHeading: "Ready to add MCP safely?",
    ctaBody:
      "Free discovery call. We pick one high-value tool surface and the isolation rules it must never break.",
    ctaLabel: "Start AI sprint →",
  },
  {
    slug: "agentic-commerce",
    packageId: "shopify",
    serviceHref: "/services/shopify-plus-apps/",
    serviceLabel: "Shopify Plus Apps package",
    title: "Agentic Commerce on Shopify | Secure Agents",
    description:
      "Make your Shopify store agent-ready without opening the door to unsafe buys. Scopes, catalog surfaces, and UCP patterns for secure agentic commerce.",
    eyebrow: "Problem · Agentic commerce",
    heading: "Secure agentic commerce on Shopify, not a demo checkout.",
    intro:
      "Agents will shop. The question is whether they hit a safe catalog surface with real auth, or a half-wired endpoint that burns trust. This page is for merchants and app teams who want agentic commerce without rewriting the store overnight.",
    tone: "green",
    icon: "lucide:bot",
    problemTitle: "The problem",
    problem: [
      "Agentic commerce is not \"put ChatGPT on the product page.\" It is catalog discovery, constrained actions, and checkout paths that respect customer identity and payment rules.",
      "Public writeups and blog experiments skip the hard parts: scopes, protected customer data, idempotent cart mutations, and what happens when an agent retries a buy.",
      "You need a store or app that agents can read and act on safely, with a clear path from UCP readiness to production ops.",
    ],
    whoForTitle: "Who this is for",
    whoFor: [
      "Shopify Plus brands that want agents to discover and buy without a fragile custom stack.",
      "App founders adding agent-ready catalog or admin surfaces to a public or private app.",
      "Teams who have read the blog posts and now need an implementation plan, not another essay.",
    ],
    approachTitle: "How I approach it",
    approach: [
      {
        title: "Separate read from buy",
        body: "Catalog and discovery surfaces come first. Purchase and customer-mutating actions get stricter auth, clearer scopes, and explicit human or policy gates where needed.",
      },
      {
        title: "Respect Shopify's review bar",
        body: "Scopes, protected customer data, and billing UX are designed for Partner review from day one, not patched in after a rejection.",
      },
      {
        title: "Idempotent cart and order flows",
        body: "Agent retries are normal. Cart and checkout mutations must survive duplicate calls without double charges or ghost line items.",
      },
      {
        title: "Ship a thin vertical slice",
        body: "One agent path end to end (discover → constrain → act) beats a kitchen-sink agent platform. Expand only after the slice is boring and observable.",
      },
    ],
    whatYouGetTitle: "What you get",
    whatYouGet: [
      "An agent-ready catalog or app surface shaped for how agents actually call APIs",
      "Auth, scopes, and safety patterns aligned with Shopify Plus and Partner expectations",
      "Optional UCP / agentic commerce scaffolding so you are not starting from zero later",
      "Webhook-safe and idempotent mutation paths for cart and order side effects",
      "Handoff into the Shopify Plus Apps package for public or private delivery",
    ],
    related: [
      {
        href: "/blog/secure-agentic-commerce-shopify/",
        label: "Secure agentic commerce on Shopify",
        note: "Auth, scopes, and safety when agents buy on behalf of customers.",
        kind: "Post",
      },
      {
        href: "/blog/agentic-commerce-shopify/",
        label: "Agentic commerce on Shopify",
        note: "The broader playbook: why agents change storefront and app design.",
        kind: "Post",
      },
      {
        href: "/blog/shopify-ucp-quick-start/",
        label: "Shopify UCP quick-start",
        note: "Make the store agent-ready without rewriting everything.",
        kind: "Post",
      },
      {
        href: "/work/agent-commerce-suite/",
        label: "Agent Commerce Suite",
        note: "AI optimization surfaces for Shopify merchants and catalogs.",
        kind: "Page",
      },
      {
        href: "/services/shopify-plus-apps/",
        label: "Shopify Plus Apps package",
        note: "Embedded apps, App Bridge, billing, and agentic readiness.",
        kind: "Page",
      },
    ],
    faq: [
      {
        question: "Is this the same as your blog posts?",
        answer:
          "No. The posts explain the ideas. This page is the problem framing for a build engagement: scoped delivery on your store or app, with CTA into the Shopify package.",
      },
      {
        question: "Do I need Shopify Plus?",
        answer:
          "Plus helps for deeper merchant workflows, but many agent-ready surfaces ship as public or private apps on standard plans. Fit is confirmed on the discovery call.",
      },
      {
        question: "Can agents check out for a customer today?",
        answer:
          "Carefully. We design constrained paths with the right identity and payment boundaries. Unrestricted \"agent buys anything\" is usually the wrong v1.",
      },
      {
        question: "Public app or private build?",
        answer:
          "Either. Public apps need listing and review discipline. Private Plus apps prioritize deep merchant workflows. The engineering bar is the same.",
      },
    ],
    ctaHeading: "Ready to make agents shop safely?",
    ctaBody:
      "Free discovery call. We map catalog vs checkout risk and whether agentic commerce belongs in v1.",
    ctaLabel: "Start Shopify app →",
  },
  {
    slug: "production-rag-laravel",
    packageId: "ai",
    serviceHref: "/services/ai-mcp/",
    serviceLabel: "AI & MCP Integration package",
    title: "Production RAG on Laravel | pgvector + Evals",
    description:
      "Ship RAG on Laravel and pgvector that survives evals, not just demos. Hybrid search, cost guardrails, and a harness your team can run every deploy.",
    eyebrow: "Problem · Production RAG",
    heading: "RAG on Laravel that still works after the demo.",
    intro:
      "Demo RAG answers look fine on three happy PDFs. Production RAG fails on chunking, retrieval, cost, and silent regressions. This page is for teams who need Laravel + pgvector RAG that holds up under evals.",
    tone: "cyan",
    icon: "lucide:database",
    problemTitle: "The problem",
    problem: [
      "Most RAG failures are not \"the model is dumb.\" They are bad chunks, weak retrieval, missing keyword fallback, and no eval gate before release.",
      "A notebook pipeline does not become a product feature. You need ingest jobs, tenant isolation, caching, token budgets, and a way to catch quality drops when someone changes a prompt.",
      "Laravel and PostgreSQL with pgvector are enough for many SaaS RAG paths if the architecture is honest about hybrid search and measurement.",
    ],
    whoForTitle: "Who this is for",
    whoFor: [
      "Product teams adding search-and-answer to an existing Laravel SaaS.",
      "Engineering leads who refuse to ship RAG without evals and cost limits.",
      "Founders burned by a vendor demo who want an owned pgvector pipeline instead.",
    ],
    approachTitle: "How I approach it",
    approach: [
      {
        title: "Fix retrieval before prompts",
        body: "Chunking, metadata filters, and hybrid (vector + keyword) search get attention first. Fancy prompts on bad retrieval just fail more confidently.",
      },
      {
        title: "Keep it in your stack",
        body: "pgvector on PostgreSQL, Laravel jobs for ingest, and Redis caching where it earns its keep. Fewer mystery services to debug at 2am.",
      },
      {
        title: "Eval before users",
        body: "A small golden set and regression checks run in CI or on a schedule. Quality drops block release the same way a failing test would.",
      },
      {
        title: "Guard the bill",
        body: "Token budgets, cache hits, and rate limits are part of the design so a viral query pattern cannot empty the API wallet overnight.",
      },
    ],
    whatYouGetTitle: "What you get",
    whatYouGet: [
      "Ingest and retrieval pipeline on Laravel + PostgreSQL / pgvector",
      "Hybrid search when pure vectors miss obvious keyword hits",
      "Eval harness and cost guardrails your team can keep running",
      "Tenant-aware document isolation when the SaaS is multi-tenant",
      "Handoff docs and a path into the AI & MCP package for tool use next",
    ],
    related: [
      {
        href: "/blog/why-your-rag-is-failing/",
        label: "Why your RAG is failing",
        note: "Common production failure modes and fixes that move quality.",
        kind: "Post",
      },
      {
        href: "/blog/7-rag-mistakes-production/",
        label: "7 RAG mistakes in production",
        note: "The mistakes that keep showing up after the demo stage.",
        kind: "Post",
      },
      {
        href: "/blog/picking-the-right-rag-stack/",
        label: "Picking the right RAG stack",
        note: "How to choose storage, retrieval, and orchestration without hype.",
        kind: "Post",
      },
      {
        href: "/blog/rag-architectures-traditional-agentic-corrective/",
        label: "RAG architectures compared",
        note: "Traditional, agentic, and corrective patterns in plain terms.",
        kind: "Post",
      },
      {
        href: "/blog/redis-semantic-caching-rag/",
        label: "Redis semantic caching for RAG",
        note: "Cut repeat cost without serving stale answers forever.",
        kind: "Post",
      },
      {
        href: "/work/rag-hybrid-search/",
        label: "Production RAG on pgvector",
        note: "A hybrid search pipeline that held up past the demo.",
        kind: "Page",
      },
      {
        href: "/services/ai-mcp/",
        label: "AI & MCP Integration package",
        note: "Claude, MCP, RAG, and evals as a fixed-scope sprint.",
        kind: "Page",
      },
    ],
    faq: [
      {
        question: "Why Laravel and pgvector instead of a vector SaaS?",
        answer:
          "If your product already runs on Laravel and PostgreSQL, pgvector keeps documents, tenants, and retrieval next to the rest of the app. Fewer sync bugs. A hosted vector DB is still fine when the constraints say so.",
      },
      {
        question: "Will this include an eval harness?",
        answer:
          "Yes. Shipping without evals is how demo quality dies quietly. You get a starter golden set and a way to run it on a schedule or in CI.",
      },
      {
        question: "How long is the engagement?",
        answer:
          "A focused RAG path usually fits the 2-4 week AI integration sprint. Larger corpora or multi-collection setups get a longer proposal after discovery.",
      },
      {
        question: "Can this sit beside MCP or Claude tool use?",
        answer:
          "Yes. Many teams start with retrieval, then expose tools over MCP. Same package family; we sequence so each piece earns its place.",
      },
    ],
    ctaHeading: "Ready for RAG that survives evals?",
    ctaBody:
      "Free discovery call. We pick one corpus and one answer surface, then measure before we scale.",
    ctaLabel: "Start AI sprint →",
  },
];

export const PROBLEM_PAGES_BY_SLUG: Record<string, ProblemPage> =
  Object.fromEntries(PROBLEM_PAGES.map((p) => [p.slug, p]));
