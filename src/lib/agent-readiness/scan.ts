import { assemble } from "./assemble.ts";
import {
  assessLlmsTxt,
  markdownType,
  mdCandidates,
  sameOrigin,
} from "./content.ts";
import { looksLikeHtml, parseRobots } from "./robots.ts";
import { ScanError } from "./errors.ts";
import {
  createBudget,
  defaultNet,
  dohQuery,
  makeResolver,
  safeGet,
  type GetOptions,
  type Net,
} from "./fetch.ts";
import { parseTarget } from "./ssrf.ts";
import type { Doc, DnsAidQuery, Report, ScanData, SiteType } from "./types.ts";

const HTML_ACCEPT = "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8";
const TEXT_ACCEPT = "text/plain,text/markdown,*/*;q=0.1";
const MARKDOWN_ACCEPT = "text/markdown";
const JSON_ACCEPT =
  "application/json, application/linkset+json, application/ai-catalog+json, */*;q=0.1";

const EXTRA_PATHS: { id: string; path: string; accept: string }[] = [
  {
    id: "ai-catalog",
    path: "/.well-known/ai-catalog.json",
    accept: JSON_ACCEPT,
  },
  {
    id: "mcp-card",
    path: "/.well-known/mcp/server-card.json",
    accept: JSON_ACCEPT,
  },
  { id: "mcp-json", path: "/.well-known/mcp.json", accept: JSON_ACCEPT },
  {
    id: "agent-card",
    path: "/.well-known/agent-card.json",
    accept: JSON_ACCEPT,
  },
  { id: "api-catalog", path: "/.well-known/api-catalog", accept: JSON_ACCEPT },
  { id: "openapi", path: "/openapi.json", accept: JSON_ACCEPT },
  {
    id: "oauth-resource",
    path: "/.well-known/oauth-protected-resource",
    accept: JSON_ACCEPT,
  },
  {
    id: "oauth-as",
    path: "/.well-known/oauth-authorization-server",
    accept: JSON_ACCEPT,
  },
  {
    id: "openid",
    path: "/.well-known/openid-configuration",
    accept: JSON_ACCEPT,
  },
  { id: "auth-md", path: "/auth.md", accept: TEXT_ACCEPT },
  { id: "agents-wk", path: "/.well-known/agents.json", accept: JSON_ACCEPT },
  { id: "agents-root", path: "/agents.json", accept: JSON_ACCEPT },
  { id: "poppy", path: "/.well-known/poppy.json", accept: JSON_ACCEPT },
  {
    id: "agent-skills",
    path: "/.well-known/agent-skills/index.json",
    accept: JSON_ACCEPT,
  },
  {
    id: "web-bot-auth",
    path: "/.well-known/http-message-signatures-directory",
    accept: JSON_ACCEPT,
  },
  { id: "ucp", path: "/.well-known/ucp", accept: JSON_ACCEPT },
  { id: "x402", path: "/.well-known/x402", accept: JSON_ACCEPT },
  { id: "acp", path: "/.well-known/acp.json", accept: JSON_ACCEPT },
  { id: "mpp", path: "/.well-known/mpp", accept: JSON_ACCEPT },
];

export async function scan(
  input: { url: string; siteType: SiteType },
  net: Net = defaultNet(),
): Promise<Report> {
  const started = Date.now();
  const parsed = parseTarget(input.url);
  if (!parsed.ok) {
    const reason = parsed.reason.includes("not fetched")
      ? parsed.reason
      : `${parsed.reason} It was not fetched.`;
    throw new ScanError(reason, 400, "blocked", 0, input.url);
  }

  const budget = createBudget(net);
  const resolve = makeResolver(budget);
  const home = await grab(
    budget,
    resolve,
    {
      id: "home",
      url: parsed.url.href,
      accept: HTML_ACCEPT,
      follow: true,
      maxBytes: 512 * 1024,
    },
    true,
  );
  if (home.status == null) {
    throw new ScanError(
      home.error ?? "Could not fetch that site.",
      502,
      "fetch",
      budget.fetches,
    );
  }

  const final = new URL(home.url || parsed.url.href);
  const origin = final.origin;
  const mdUrls = mdCandidates(final.href);
  const jobs: GetOptions[] = [
    {
      id: "robots",
      url: new URL("/robots.txt", origin).href,
      accept: TEXT_ACCEPT,
      follow: true,
      maxBytes: 256 * 1024,
    },
    {
      id: "llms",
      url: new URL("/llms.txt", origin).href,
      accept: TEXT_ACCEPT,
      follow: true,
      maxBytes: 256 * 1024,
    },
    {
      id: "llms-full",
      url: new URL("/llms-full.txt", origin).href,
      accept: TEXT_ACCEPT,
      follow: true,
      maxBytes: 64 * 1024,
    },
    {
      id: "markdown",
      url: final.href,
      accept: MARKDOWN_ACCEPT,
      follow: false,
      maxBytes: 256 * 1024,
    },
    ...EXTRA_PATHS.map((item) => ({
      id: item.id,
      url: new URL(item.path, origin).href,
      accept: item.accept,
      follow: true,
      maxBytes: 128 * 1024,
    })),
  ];
  if (mdUrls[0]) {
    jobs.push({
      id: "md-1",
      url: mdUrls[0],
      accept: MARKDOWN_ACCEPT,
      follow: true,
      maxBytes: 256 * 1024,
    });
  }

  const docs = new Map<string, Doc>();
  const dnsAid: DnsAidQuery[] = [];
  const host = final.hostname;
  await pool(
    [
      ...jobs.map((job) => async () => {
        docs.set(job.id, await grab(budget, resolve, job, false));
      }),
      ...dnsJobs(host).map((job) => async () => {
        dnsAid.push(await job(budget));
      }),
    ],
    6,
  );

  const robots = docs.get("robots");
  const sitemap = await fetchSitemap(budget, resolve, origin, robots);
  const mdVariants = [docs.get("md-1")].filter((doc): doc is Doc =>
    Boolean(doc),
  );
  if (mdUrls[1] && !goodMarkdown(mdVariants[0])) {
    mdVariants.push(
      await grab(
        budget,
        resolve,
        {
          id: "md-2",
          url: mdUrls[1],
          accept: MARKDOWN_ACCEPT,
          follow: true,
          maxBytes: 256 * 1024,
        },
        false,
      ),
    );
  }

  const llms = docs.get("llms");
  const linkProbes = await probeLlmsLinks(budget, resolve, origin, llms);

  const required = (id: string): Doc =>
    docs.get(id) ?? {
      id,
      requestedUrl: "",
      url: "",
      status: null,
      contentType: null,
      headers: {},
      body: "",
      truncated: false,
      error: "Not fetched.",
    };

  const data: ScanData = {
    inputUrl: parsed.url.href,
    finalUrl: final.href,
    siteType: input.siteType,
    scannedAt: new Date().toISOString(),
    elapsedMs: Date.now() - started,
    fetches: budget.fetches,
    home,
    robots: required("robots"),
    sitemap: sitemap.doc,
    sitemapNote: sitemap.note,
    llms: required("llms"),
    llmsFull: required("llms-full"),
    markdown: required("markdown"),
    mdVariants,
    extras: Object.fromEntries(
      EXTRA_PATHS.map((item) => [item.id, docs.get(item.id)]),
    ),
    linkProbes,
    dnsAid,
  };
  return assemble(data);
}

async function fetchSitemap(
  budget: ReturnType<typeof createBudget>,
  resolve: ReturnType<typeof makeResolver>,
  origin: string,
  robots: Doc | undefined,
): Promise<{ doc: Doc | null; note: string | null }> {
  let note: string | null = null;
  let chosen: string | null = null;
  if (
    robots &&
    robots.status != null &&
    !robots.error &&
    !looksLikeHtml(robots.body, robots.contentType)
  ) {
    const file = parseRobots(robots.body, robots.contentType);
    for (const item of file.sitemaps) {
      try {
        const url = new URL(item, origin);
        if (
          url.origin === origin &&
          (url.protocol === "http:" || url.protocol === "https:")
        ) {
          chosen = url.href;
          break;
        }
        note = `robots.txt names ${item}, which is on another host, so it was not fetched.`;
      } catch {
        // Ignore a sitemap line that is not a URL.
      }
    }
  }
  const targets = chosen
    ? [chosen]
    : [
        new URL("/sitemap.xml", origin).href,
        new URL("/sitemap-index.xml", origin).href,
      ];
  let last: Doc | null = null;
  for (const url of targets) {
    last = await grab(
      budget,
      resolve,
      {
        id: "sitemap",
        url,
        accept: "application/xml,text/xml,*/*;q=0.1",
        follow: true,
        maxBytes: 256 * 1024,
      },
      false,
    );
    if (last.status && last.status !== 404 && last.status !== 410) break;
  }
  return { doc: last, note };
}

async function probeLlmsLinks(
  budget: ReturnType<typeof createBudget>,
  resolve: ReturnType<typeof makeResolver>,
  origin: string,
  llms: Doc | undefined,
): Promise<ScanData["linkProbes"]> {
  if (!llms || llms.status !== 200 || budget.fetches > 40) return [];
  const assessment = assessLlmsTxt(llms.body, llms.contentType, llms.status);
  const hrefs: string[] = [];
  for (const link of assessment.links) {
    try {
      const url = new URL(link.url, origin);
      if (url.origin !== origin) continue;
      if (!sameOrigin(url.href, origin)) continue;
      if (!hrefs.includes(url.href)) hrefs.push(url.href);
    } catch {
      // Skip a link that does not parse.
    }
    if (hrefs.length === 2) break;
  }
  const probes: ScanData["linkProbes"] = [];
  for (const url of hrefs) {
    const doc = await grab(
      budget,
      resolve,
      {
        id: "llms-link",
        url,
        accept: HTML_ACCEPT,
        follow: true,
        maxBytes: 16 * 1024,
      },
      false,
    );
    probes.push({
      url: doc.url || url,
      status: doc.status,
      contentType: doc.contentType,
    });
  }
  return probes;
}

function dnsJobs(
  host: string,
): ((budget: ReturnType<typeof createBudget>) => Promise<DnsAidQuery>)[] {
  const names: [string, "HTTPS" | "SVCB"][] = [
    [`_index._agents.${host}`, "HTTPS"],
    [`_index._agents.${host}`, "SVCB"],
    [`_a2a._agents.${host}`, "HTTPS"],
    [`_mcp._agents.${host}`, "HTTPS"],
  ];
  return names.map(([name, type]) => async (budget) => {
    const query = await dohQuery(name, type, (url, init) =>
      budget.fetch(url, init),
    );
    const data = query.answers.map((answer) => answer.data).slice(0, 4);
    return {
      name,
      type,
      found: query.error == null && query.answers.length > 0,
      ad: query.ad,
      data,
      error: query.error ? "The DNS query failed." : null,
    };
  });
}

async function grab(
  budget: ReturnType<typeof createBudget>,
  resolve: ReturnType<typeof makeResolver>,
  options: GetOptions,
  required: boolean,
): Promise<Doc> {
  try {
    return await safeGet(budget, resolve, options);
  } catch (error) {
    if (error instanceof ScanError && error.code === "blocked" && !required) {
      return {
        id: options.id,
        requestedUrl: options.url,
        url: error.blockedUrl ?? options.url,
        status: null,
        contentType: null,
        headers: {},
        body: "",
        truncated: false,
        error: error.message,
      };
    }
    throw error;
  }
}

function goodMarkdown(doc: Doc | undefined): boolean {
  if (!doc || doc.status !== 200) return false;
  return (
    markdownType(doc.contentType) && !looksLikeHtml(doc.body, doc.contentType)
  );
}

async function pool(
  tasks: (() => Promise<void>)[],
  limit: number,
): Promise<void> {
  let cursor = 0;
  const workers = Math.min(limit, tasks.length);
  await Promise.all(
    Array.from({ length: workers }, async () => {
      while (cursor < tasks.length) {
        const index = cursor;
        cursor += 1;
        await tasks[index]!();
      }
    }),
  );
}
