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
