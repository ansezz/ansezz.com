/**
 * SEO topic hubs (/topics/<slug>/) and how-I-work (/how-i-work/).
 * Copy lives here; pages stay thin.
 * Voice: simple English, confident. No em dashes, no fabricated metrics.
 */

import type {
  ServiceLanderFaq,
  ServiceLanderTone,
  ServicePackageId,
} from "./05-service-landers";
import { SERVICES_PAGE } from "./03-services-now";

export interface TopicHubLink {
  href: string;
  label: string;
  note: string;
  kind: "Page" | "Post" | "Series";
}

export interface TopicHubCta extends TopicHubLink {
  /** Primary button style in the paths section */
  primary?: boolean;
}

export interface TopicHub {
  /** URL segment under /topics/ */
  slug: string;
  packageId: ServicePackageId;
  title: string;
  description: string;
  eyebrow: string;
  heading: string;
  intro: string;
  tone: ServiceLanderTone;
  icon: string;
  editorialTitle: string;
  editorial: string[];
  readingTitle: string;
  reading: TopicHubLink[];
  pathsTitle: string;
  paths: TopicHubCta[];
  faq: ServiceLanderFaq[];
  ctaHeading: string;
  ctaBody: string;
  ctaLabel: string;
}

export const TOPIC_HUBS: TopicHub[] = [
  {
    slug: "mcp",
    packageId: "ai",
    title: "MCP for Product Teams | Topic Hub",
    description:
      "Model Context Protocol for product teams: safe tool use, Laravel SaaS patterns, and curated reading. Links to posts, series, and the AI & MCP package.",
    eyebrow: "Topic · MCP",
    heading: "MCP for product teams who ship.",
    intro:
      "Agents that call your product are useful. Agents that ignore tenancy, auth, and audit logs are a liability. This hub collects the MCP writing and engagement paths I use with Laravel SaaS teams.",
    tone: "purple",
    icon: "lucide:waypoints",
    editorialTitle: "Why MCP matters on a product team",
    editorial: [
      "Chat UIs without tools are demos. MCP turns the model into something that can read and write through boundaries you control: auth, tenancy, idempotent mutations, structured errors.",
      "Most teams do not need a new platform. They need a small set of tools wired into the SaaS they already run, with the same RBAC and audit trail their HTTP API already enforces.",
      "I write and build for that shape: multi-tenant Laravel, Claude (and friends) via MCP, evals before users see the agent. Start with the posts below, then pick a problem page or the AI sprint when you are ready to ship.",
    ],
    readingTitle: "Curated MCP reading",
    reading: [
      {
        href: "/blog/mcp-first-is-the-new-mobile-first/",
        label: "MCP first is the new mobile first",
        note: "Why tools, skills, and permissions come before another chat UI.",
        kind: "Post",
      },
      {
        href: "/blog/api-vs-mcp/",
        label: "API vs MCP",
        note: "When a classic API is enough, and when MCP earns its keep.",
        kind: "Post",
      },
      {
        href: "/blog/mcp-vs-a2a-vs-acp/",
        label: "MCP vs A2A vs ACP",
        note: "How the agent protocol stack fits together in plain terms.",
        kind: "Post",
      },
      {
        href: "/blog/mcp-context-aware-agents/",
        label: "MCP tool-use: context-aware agents",
        note: "Building agents that use tools with the right context, not noise.",
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
        label: "Idempotency for MCP mutations",
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
        href: "/blog/claude-mcp-dev-tools/",
        label: "Claude MCP and your dev tools",
        note: "Connecting day-to-day tools to LLMs with MCP.",
        kind: "Post",
      },
      {
        href: "/blog/series/laravel-at-scale/",
        label: "Laravel at Scale series",
        note: "Includes the MCP safety trilogy for multi-tenant SaaS.",
        kind: "Series",
      },
      {
        href: "/blog/series/ai-architecture/",
        label: "AI Architecture Decisions series",
        note: "Where MCP sits next to RAG, agents, and protocol choices.",
        kind: "Series",
      },
    ],
    pathsTitle: "Ship next",
    paths: [
      {
        href: "/services/ai-mcp/",
        label: "AI & MCP Integration package",
        note: "Fixed-scope sprint: Claude, MCP, RAG, and evals on your product.",
        kind: "Page",
        primary: true,
      },
      {
        href: "/mcp-for-laravel-saas/",
        label: "MCP for Laravel SaaS",
        note: "Problem page: multi-tenant safe tools, auth, audit, idempotency.",
        kind: "Page",
      },
      {
        href: "/work/mcp-saas-server/",
        label: "MCP SaaS server case study",
        note: "How a production MCP surface looked in a real build.",
        kind: "Page",
      },
      {
        href: "/contact/?package=ai",
        label: "Start an AI sprint",
        note: "Tell me about the product and which tools the agent should own.",
        kind: "Page",
      },
    ],
    faq: [
      {
        question: "Is this hub the same as the AI & MCP package?",
        answer:
          "No. This page is a reading and navigation hub. The package is the engagement: scoped delivery on your product with Claude, MCP, RAG, and evals.",
      },
      {
        question: "Do I need Laravel to use these posts?",
        answer:
          "No. The ideas travel. The deepest implementation notes are Laravel-shaped because that is where I ship most MCP work.",
      },
      {
        question: "Where should I start if I only have an hour?",
        answer:
          "Read MCP first is the new mobile first, then API vs MCP. If you already run multi-tenant Laravel, jump to the auth and audit post next.",
      },
      {
        question: "Can you add MCP to an existing SaaS?",
        answer:
          "Yes. That is the default path. See the MCP for Laravel SaaS problem page, then the AI & MCP package for how the sprint is scoped.",
      },
    ],
    ctaHeading: "Ready to wire MCP into the product?",
    ctaBody:
      "Free discovery call. We map tools, tenancy, and whether MCP belongs in v1.",
    ctaLabel: "Start AI sprint →",
  },
  {
    slug: "rag",
    packageId: "ai",
    title: "Production RAG | Topic Hub",
    description:
      "Retrieval-augmented generation for product teams: failure modes, stack choices, Laravel + pgvector, and curated reading. Links to posts, series, and the AI package.",
    eyebrow: "Topic · RAG",
    heading: "RAG that survives past the demo.",
    intro:
      "Demo RAG looks fine on three happy PDFs. Production RAG fails on chunking, retrieval, cost, and silent regressions. This hub collects the RAG writing and engagement paths I use with product teams.",
    tone: "cyan",
    icon: "lucide:database",
    editorialTitle: "What product teams get wrong about RAG",
    editorial: [
      'Most RAG failures are not "the model is dumb." They are bad chunks, weak retrieval, missing keyword fallback, and no eval gate before release.',
      "You do not need every vector vendor on the market. Many SaaS teams can keep documents next to the app with PostgreSQL and pgvector, Laravel jobs for ingest, and hybrid search when pure vectors miss obvious keywords.",
      "Measure before you scale. A small golden set and cost guardrails beat another prompt rewrite. Start with the posts below, then the production RAG problem page or the AI sprint when you are ready to ship.",
    ],
    readingTitle: "Curated RAG reading",
    reading: [
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
        href: "/blog/rag-vs-fine-tuning/",
        label: "RAG vs fine-tuning",
        note: "When retrieval is enough, and when weights need to change.",
        kind: "Post",
      },
      {
        href: "/blog/redis-semantic-caching-rag/",
        label: "Redis semantic caching for RAG",
        note: "Cut repeat cost without serving stale answers forever.",
        kind: "Post",
      },
      {
        href: "/blog/circuit-breakers-vector-db/",
        label: "Circuit breakers for vector DBs",
        note: "Stop cascading failures when retrieval falls over.",
        kind: "Post",
      },
      {
        href: "/blog/series/rag-in-production/",
        label: "RAG in Production series",
        note: "Ordered path from failure modes through stack and caching.",
        kind: "Series",
      },
    ],
    pathsTitle: "Ship next",
    paths: [
      {
        href: "/production-rag-laravel/",
        label: "Production RAG on Laravel",
        note: "Problem page: pgvector, hybrid search, evals, cost guardrails.",
        kind: "Page",
        primary: true,
      },
      {
        href: "/services/ai-mcp/",
        label: "AI & MCP Integration package",
        note: "The engagement that covers RAG, Claude, MCP, and evals.",
        kind: "Page",
      },
      {
        href: "/work/rag-hybrid-search/",
        label: "Hybrid search case study",
        note: "A RAG pipeline that held up past the demo.",
        kind: "Page",
      },
      {
        href: "/contact/?package=ai",
        label: "Start an AI sprint",
        note: "One corpus, one answer surface, measure before we scale.",
        kind: "Page",
      },
    ],
    faq: [
      {
        question: "Is this hub the same as the production RAG page?",
        answer:
          "No. This hub is for orientation and reading. The production RAG page is the problem framing for a build engagement on Laravel and pgvector.",
      },
      {
        question: "Do I need Laravel and pgvector?",
        answer:
          "Not to learn from the posts. For a build with me, Laravel + PostgreSQL is the default when that is already your stack. A hosted vector DB is fine when the constraints say so.",
      },
      {
        question: "Will an engagement include evals?",
        answer:
          "Yes. Shipping without evals is how demo quality dies quietly. See the production RAG page and the AI & MCP package for how that is scoped.",
      },
      {
        question: "Can RAG sit beside MCP?",
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

export const TOPIC_HUBS_BY_SLUG: Record<string, TopicHub> = Object.fromEntries(
  TOPIC_HUBS.map((h) => [h.slug, h]),
);

export interface HowIWorkStep {
  step: string;
  title: string;
  body: string;
  detail: string;
  icon: string;
  tone: ServiceLanderTone;
}

export interface HowIWorkTimeline {
  label: string;
  body: string;
}

/** Dedicated /how-i-work/ page. Steps reuse SERVICES_PAGE.HOW, expanded. */
export const HOW_I_WORK = {
  title: "How I Work | Discovery to Handoff",
  description:
    "How engagements run with Anass Ez-zouaine: discovery, fixed proposal, build in the open, ship and handoff. Timelines, what I take, and packages on /services/.",
  eyebrow: "Engage",
  heading: "How I work with you.",
  intro:
    "No black box. Fixed scope or a clear weekly rate, short updates, and a handoff your team can own. Below is the full path from first call to deploy.",
  tone: "yellow" as ServiceLanderTone,
  icon: "lucide:route",
  stepsTitle: "The path",
  steps: SERVICES_PAGE.HOW.map((s, i) => {
    const details = [
      "Bring the problem, constraints, and what \"done\" looks like. I say yes, no, or not yet with reasons. No pressure pitch.",
      "Written scope, milestones, and price (or weekly rate) before code. Change control is explicit when the goal moves.",
      "Shared board, async notes, demos every few days. You can pull the repo and see progress without chasing status meetings.",
      "Deployed where we agreed, docs and tests that match the build, and a clean exit or optional retainer. IP assignment is in the SOW.",
    ];
    return {
      step: s.step,
      title: s.title,
      body: s.body,
      detail: details[i]!,
      icon: s.icon,
      tone: s.tone,
    } satisfies HowIWorkStep;
  }),
  timelinesTitle: "Typical timelines",
  timelines: [
    {
      label: "AI Integration Sprint",
      body: "Usually 2-4 weeks once scope is locked. One surface (MCP tools, RAG path, or Claude feature), evals, and handoff.",
    },
    {
      label: "MVP Build",
      body: "Usually 4-12 weeks depending on tenancy, billing, and admin depth. Discovery still comes first so the quote is honest.",
    },
    {
      label: "Shopify Plus App",
      body: "Scoped per app surface: embedded admin, billing, webhooks, Catalog. Timeline follows the review and compliance path you need.",
    },
    {
      label: "Architecture Audit",
      body: "About one focused week for code, schema, infra, and risk, then a written remediation plan. Optional pair follow-up.",
    },
  ] satisfies HowIWorkTimeline[],
  takeTitle: "What I take",
  take: [
    "Fixed-scope builds on Laravel SaaS, AI (Claude, MCP, RAG), and Shopify Plus apps",
    "Architecture audits and remediation plans on messy or scaling codebases",
    "Senior / Staff / Tech Lead or fractional CTO work when the mandate is clear",
    "Remote-first teams who want async updates and written decisions",
  ],
  dontTakeTitle: "What I do not take",
  dontTake: [
    "Open-ended hourly \"just start coding\" with no scope or decision owner",
    "Junior relay work where I am asked to babysit a large unscoped team",
    "Pure design-only or marketing-site projects with no product engineering",
    "Anything that needs me to invent fake metrics or over-promise a demo as production",
  ],
  packagesTitle: "Packages",
  packagesBody:
    "Pick a package on the services page, or come with a problem and we map it on the discovery call. Same process either way.",
  packagesHref: "/services/",
  packagesLabel: "See packages on /services/",
  faq: [
    {
      question: "Is discovery really free?",
      answer:
        "Yes. Fifteen minutes to scope the problem and say honestly if I am the right fit. If not, I will say so early.",
    },
    {
      question: "Fixed price or weekly rate?",
      answer:
        "Most builds are fixed-scope after discovery. Ongoing or advisory work is a weekly retainer when that fits better. No invented hourly floor on the site.",
    },
    {
      question: "Do you work solo?",
      answer:
        "Solo for most builds. For larger scopes I bring in vetted specialists I have shipped with, and stay accountable for delivery.",
    },
    {
      question: "What time zones do you cover?",
      answer:
        "Based in Morocco (GMT+1). Overlap with EU mornings and US-East afternoons, async-first with replies within 24 hours.",
    },
    {
      question: "NDAs and contracts?",
      answer:
        "Always. NDA up front if you need it, then a simple SOW covering scope, milestones, IP assignment, and payment before code starts.",
    },
  ] satisfies ServiceLanderFaq[],
  ctaHeading: "Ready when you are.",
  ctaBody:
    "Free discovery call. I will tell you honestly if it is a fit, then send a written proposal.",
  ctaLabel: "Contact →",
};
