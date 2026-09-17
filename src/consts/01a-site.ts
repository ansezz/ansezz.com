// ── Career timeline ───────────────────────────────────────
// Single source of truth for every "N+ years" claim on the site.
// Derived, not hardcoded, so the numbers can't drift out of date.
export const CAREER_SINCE = 2012;
export const REMOTE_SINCE = 2014;

const currentYear = new Date().getFullYear();
export const YEARS_EXPERIENCE = currentYear - CAREER_SINCE;
export const YEARS_REMOTE = currentYear - REMOTE_SINCE;

export const SITE = {
  URL: "https://ansezz.com",
  TITLE: "Anass Ez-zouaine — Backend, AI & Shopify Engineer",
  SHORT_TITLE: "ansezz",
  DESCRIPTION: `Senior backend, software architect, and AI engineer. ${YEARS_EXPERIENCE}+ years shipping Laravel SaaS, Shopify Plus apps, and AI features (Claude, MCP, RAG). Remote-first.`,
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
  YEARS_EXPERIENCE,
  REMOTE_SINCE,
  CONSULTING_SINCE: 2022,
  STATUS: "Open for scoped builds — MVP, AI sprint, Shopify app, architecture audit",
};

export const AVAILABLE_FOR = [
  "MVP Build",
  "AI Integration Sprint",
  "Shopify Plus App",
  "Architecture Audit",
  // Employment / advisory — secondary; surfaced on about/resume more than hero.
  "Senior / Staff Engineer",
  "Tech Lead",
  "Fractional CTO",
  "Advisory",
];

export const STATS = [
  { value: `${YEARS_EXPERIENCE}+`, label: "Years shipping" },
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
  DESCRIPTION: `Senior backend, software architect, and AI engineer. ${YEARS_EXPERIENCE}+ years shipping Laravel SaaS, Shopify Plus apps, and AI features — Claude, MCP, RAG, agentic systems.`,
};

export const ABOUT = {
  TITLE: "About",
  DESCRIPTION: `Senior backend engineer and AI engineer with ${YEARS_EXPERIENCE}+ years of experience, remote-only since ${REMOTE_SINCE}. Multi-tenant B2B SaaS, Shopify Plus apps, and production AI on Laravel.`,
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
    "Scoped builds first — MVP, AI Integration Sprint, Shopify Plus app, architecture audit. Book a free intro and I'll quote fixed-scope. Senior / lead / advisory also available when it's a fit.",
};

// Web3Forms-backed contact form (no backend). Prefer PUBLIC_WEB3FORMS_ACCESS_KEY
// in Cloudflare Pages env (or .env) so rotation does not require a code edit.
// Fallback keeps the live form working until the env var is set. Empty string
// hides the form and leaves mailto. CSP already allows the endpoint.
// Also lock the key to ansezz.com in the Web3Forms dashboard.
export const CONTACT_FORM = {
  ACCESS_KEY:
    import.meta.env.PUBLIC_WEB3FORMS_ACCESS_KEY ??
    "06e57a3e-7478-4447-b601-9cd3bd46e211",
  ENDPOINT: "https://api.web3forms.com/submit",
};
