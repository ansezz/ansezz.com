import {
  CHECK_META,
  DO_NOT,
  isScored,
  siteTypeLabel,
  weightFor,
} from "./catalog.ts";
import {
  assessLlmsTxt,
  hasMarkdownAlternate,
  markdownType,
  parseLinkHeader,
  readJsonLd,
  shellQuote,
  varyAccepts,
  visibleText,
} from "./content.ts";
import {
  crawlerReport,
  looksLikeHtml,
  parseRobots,
  type ContentSignal,
  type RobotsFile,
} from "./robots.ts";
import type {
  Check,
  CheckStatus,
  Evidence,
  Report,
  ScanData,
  ScoreGroup,
  Subscore,
} from "./types.ts";
import type { Doc } from "./types.ts";

interface Draft {
  id: string;
  status: CheckStatus;
  summary: string;
  detail: string;
  evidence: Evidence[];
  manual: string;
  snippet: string;
  doNot: string | null;
}

interface Built extends Check {
  manual: string;
  snippet: string;
}

const CONTENT_TYPES = new Set([
  "Person",
  "WebSite",
  "BlogPosting",
  "Article",
  "NewsArticle",
  "Blog",
  "BreadcrumbList",
  "Organization",
  "ProfilePage",
  "WebPage",
  "ItemList",
  "CollectionPage",
  "FAQPage",
  "AboutPage",
  "ContactPage",
  "SoftwareApplication",
  "WebAPI",
  "Service",
  "TechArticle",
]);

const PRODUCT_TYPES = new Set([
  "Product",
  "Offer",
  "AggregateOffer",
  "ProductGroup",
]);

export function assemble(data: ScanData): Report {
  const origin = originOf(data.finalUrl);
  const host = hostOf(data.finalUrl);
  const robots =
    data.robots.status != null && !data.robots.error
      ? parseRobots(data.robots.body, data.robots.contentType)
      : null;
  const drafts: Draft[] = [
    httpsCheck(data),
    robotsCheck(data),
    sitemapCheck(data),
    crawlerCheck(data, robots),
    signalCheck(data, robots),
    htmlCheck(data),
    llmsCheck(data, origin),
    llmsFullCheck(data),
    negotiationCheck(data),
    variantCheck(data),
    linkCheck(data, origin),
    jsonLdCheck(data),
    mcpCheck(data),
    a2aCheck(data),
    apiCatalogCheck(data),
    openApiCheck(data),
    oauthResourceCheck(data),
    oauthServerCheck(data),
    authAgentsCheck(data),
    poppyCheck(data, host),
    agentSkillsCheck(data),
    webBotAuthCheck(data),
    webMcpCheck(),
    ardCheck(),
    dnsAidCheck(data),
    ucpCheck(data),
    x402Check(data),
    acpCheck(data),
    mppCheck(data),
    ap2Check(data),
    securityCheck(data),
  ];
  return finish(data, drafts);
}

function finish(data: ScanData, drafts: Draft[]): Report {
  const label = siteTypeLabel(data.siteType);
  const checks: Built[] = drafts.map((draft) => {
    const meta = CHECK_META[draft.id];
    if (!meta) throw new Error(`Unknown check ${draft.id}`);
    const scoped = isScored(draft.id, data.siteType);
    let status = draft.status;
    let summary = draft.summary;
    let manual = draft.manual;
    let snippet = draft.snippet;
    let doNot = draft.doNot;
    if (!scoped && status === "fail") {
      status = "skip";
      summary = `${draft.summary} This check is not part of the ${label} score.`;
      manual = "";
      snippet = "";
      doNot = doNot ?? DO_NOT;
    }
    const weight = weightFor(meta.impact);
    return {
      id: draft.id,
      title: meta.title,
      impact: meta.impact,
      group: meta.group,
      stability: meta.stability,
      specUrl: meta.specUrl,
      specLabel: meta.specLabel,
      weight,
      scored: scoped,
      status,
      summary,
      detail: draft.detail,
      evidence: draft.evidence,
      fix: null,
      doNot,
      recoverable: 0,
      manual,
      snippet,
    };
  });

  const applicable = checks.filter((check) => inScore(check));
  const possible = applicable.reduce((sum, check) => sum + check.weight, 0);
  const earned = applicable.reduce((sum, check) => sum + earnedOf(check), 0);
  const rows: Check[] = checks.map((check) => {
    const { manual, snippet, ...rest } = check;
    if (!inScore(check)) {
      return {
        ...rest,
        fix:
          manual || snippet
            ? {
                manual,
                snippet,
                prompt: promptFor(
                  check.title,
                  check.summary,
                  manual,
                  snippet,
                  check.evidence,
                ),
              }
            : null,
      };
    }
    const lost = check.weight - earnedOf(check);
    const recoverable = possible > 0 ? Math.round((100 * lost) / possible) : 0;
    const withPoints =
      recoverable > 0
        ? `${manual} Fixing it would raise this score by about ${recoverable} points.`.trim()
        : manual;
    return {
      ...rest,
      recoverable,
      fix:
        withPoints || snippet
          ? {
              manual: withPoints,
              snippet,
              prompt: promptFor(
                check.title,
                check.summary,
                withPoints,
                snippet,
                check.evidence,
              ),
            }
          : null,
    };
  });
  const score = possible > 0 ? Math.round((100 * earned) / possible) : 0;
  const band = bandFor(score);
  const subscores = {
    access: subscore(applicable, "access"),
    readable: subscore(applicable, "readable"),
    act: subscore(applicable, "act"),
  };
  const counts = {
    passed: applicable.filter((check) => check.status === "pass").length,
    warned: applicable.filter((check) => check.status === "warn").length,
    failed: applicable.filter((check) => check.status === "fail").length,
    applicable: applicable.length,
  };
  const report: Report = {
    schemaVersion: 1,
    inputUrl: data.inputUrl,
    finalUrl: data.finalUrl,
    siteType: data.siteType,
    siteTypeLabel: label,
    scannedAt: data.scannedAt,
    elapsedMs: data.elapsedMs,
    fetches: data.fetches,
    score,
    band: band.band,
    bandLabel: band.bandLabel,
    verdict: verdictFor(score, data.siteType, counts.failed),
    scoring:
      "The score is 100 times points earned divided by points possible, rounded. A pass earns full weight, a warn earns half, and a fail earns zero. High impact weighs 3, medium 2, low 1. Skipped checks and checks that could not be verified are left out.",
    counts,
    subscores,
    checks: rows,
    curl: `curl -sI -H ${shellQuote("Accept: text/markdown")} ${shellQuote(data.finalUrl)}`,
    agentPrompt: "",
  };
  report.agentPrompt = agentPrompt(report);
  return report;
}

function inScore(check: Check): boolean {
  return (
    check.scored &&
    (check.status === "pass" ||
      check.status === "warn" ||
      check.status === "fail")
  );
}

function earnedOf(check: Check): number {
  if (check.status === "pass") return check.weight;
  if (check.status === "warn") return check.weight / 2;
  return 0;
}

function subscore(checks: Check[], group: ScoreGroup): Subscore | null {
  const rows = checks.filter((check) => check.group === group);
  if (rows.length === 0) return null;
  const possible = rows.reduce((sum, check) => sum + check.weight, 0);
  const earned = rows.reduce((sum, check) => sum + earnedOf(check), 0);
  return {
    earned,
    possible,
    score: possible > 0 ? Math.round((100 * earned) / possible) : 0,
  };
}

function bandFor(score: number): Pick<Report, "band" | "bandLabel"> {
  if (score >= 90) return { band: "excellent", bandLabel: "Excellent" };
  if (score >= 75) return { band: "good", bandLabel: "Good" };
  if (score >= 50) return { band: "needs-work", bandLabel: "Needs work" };
  return { band: "blocked", bandLabel: "Blocked on basics" };
}

function verdictFor(
  score: number,
  siteType: ScanData["siteType"],
  failed: number,
): string {
  const lead =
    score >= 90
      ? "Agents can find and read this site."
      : score >= 75
        ? "Agents can mostly find and read this site."
        : score >= 50
          ? "Agents can reach some of this site, with gaps that cost them context."
          : "Agents are blocked on the basics.";
  if (siteType === "content") {
    return `${lead} Optional protocol files are not part of this score. Only publish one if the service it describes is real.`;
  }
  if (failed > 0) {
    return `${lead} This score includes the ${siteTypeLabel(siteType)} checks. Do not publish a file for a service this site does not run.`;
  }
  return `${lead} The scored checks for this site type passed, or they only need small fixes.`;
}

function agentPrompt(report: Report): string {
  const lines = [
    `Site: ${report.finalUrl}`,
    `Site type: ${report.siteTypeLabel}`,
    `Score: ${report.score} (${report.bandLabel}). Only checks that apply to this site type are in the score.`,
    "",
    "Do not publish an MCP card, an A2A card, an API catalog, OAuth metadata, a Poppy file, DNS-AID records, or a payment file unless this site really runs that service.",
    "",
  ];
  for (const check of report.checks) {
    if (check.status !== "fail" && check.status !== "warn") continue;
    if (!check.fix) continue;
    lines.push(`## ${check.title} (${check.status})`);
    lines.push(check.summary);
    if (check.detail) lines.push(check.detail);
    lines.push(check.fix.manual);
    if (check.fix.snippet) {
      lines.push("Starting point:");
      lines.push(check.fix.snippet);
    }
    lines.push("");
  }
  return lines.join("\n").trim();
}

function promptFor(
  title: string,
  summary: string,
  manual: string,
  snippet: string,
  evidence: Evidence[],
): string {
  const shown = evidence
    .map(
      (item) =>
        `${item.method} ${item.url} -> ${item.status ?? "no response"} ${item.contentType ?? ""}\n${item.snippet}`,
    )
    .join("\n");
  return [
    `Check: ${title}`,
    summary,
    shown ? `Evidence:\n${shown}` : "",
    manual,
    snippet ? `Starting point:\n${snippet}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");
}

function httpsCheck(data: ScanData): Draft {
  const secure = data.finalUrl.startsWith("https://");
  return draft({
    id: "https",
    status: secure ? "pass" : "fail",
    summary: secure
      ? "The final page is served over HTTPS."
      : "The final page is not HTTPS. Agents should not be sent to a site over plain HTTP.",
    detail: data.finalUrl,
    evidence: [
      {
        method: "GET",
        url: data.finalUrl,
        status: data.home.status,
        contentType: data.home.contentType,
        snippet: data.finalUrl,
      },
    ],
    manual: secure
      ? ""
      : "Serve the site on HTTPS and redirect HTTP to it. Use the standard port 443.",
    snippet: secure ? "" : `https://${hostOf(data.finalUrl)}/`,
  });
}

function robotsCheck(data: ScanData): Draft {
  const doc = data.robots;
  if (doc.error || doc.status == null) {
    return missingNet("robots", doc, "robots.txt could not be fetched.");
  }
  if (doc.status === 404 || doc.status === 410) {
    return draft({
      id: "robots",
      status: "fail",
      summary:
        "No robots.txt was found. Crawlers are allowed by default, but the file is how you say so.",
      detail: "",
      evidence: evidenceOf(doc),
      manual:
        "Publish a text robots.txt at /robots.txt. Name your sitemap and your content preferences.",
      snippet: robotsSnippet(originOf(data.finalUrl)),
    });
  }
  if (looksLikeHtml(doc.body, doc.contentType)) {
    return draft({
      id: "robots",
      status: "fail",
      summary:
        "robots.txt returned HTML. That is usually a soft 404, and crawlers cannot parse it.",
      detail: "",
      evidence: evidenceOf(doc),
      manual:
        "Serve a real text file at /robots.txt, with a text/plain content type.",
      snippet: robotsSnippet(originOf(data.finalUrl)),
    });
  }
  if (doc.status >= 200 && doc.status < 300) {
    return draft({
      id: "robots",
      status: "pass",
      summary: "robots.txt is a text file and is not an HTML error page.",
      detail: "",
      evidence: evidenceOf(doc),
      manual: "",
      snippet: "",
    });
  }
  return draft({
    id: "robots",
    status: "warn",
    summary: `robots.txt responded with status ${doc.status}.`,
    detail: "",
    evidence: evidenceOf(doc),
    manual: "Make /robots.txt return 200 and a text body.",
    snippet: robotsSnippet(originOf(data.finalUrl)),
  });
}

function sitemapCheck(data: ScanData): Draft {
  const doc = data.sitemap;
  const note = data.sitemapNote ? ` ${data.sitemapNote}` : "";
  if (!doc) {
    return draft({
      id: "sitemap",
      status: "fail",
      summary: `No sitemap was fetched.${note}`,
      detail: "",
      evidence: [],
      manual:
        "Publish a sitemap and point at it with a Sitemap line in robots.txt.",
      snippet: `Sitemap: ${originOf(data.finalUrl)}/sitemap.xml`,
    });
  }
  if (doc.error || doc.status == null) {
    return missingNet(
      "sitemap",
      doc,
      `The sitemap could not be fetched.${note}`,
    );
  }
  if (doc.status === 404 || doc.status === 410) {
    return draft({
      id: "sitemap",
      status: "fail",
      summary: `The sitemap URL returned ${doc.status}.${note}`,
      detail: "",
      evidence: evidenceOf(doc),
      manual:
        "Publish an XML sitemap on this host and name it from robots.txt.",
      snippet: `Sitemap: ${originOf(data.finalUrl)}/sitemap.xml`,
    });
  }
  const sample = doc.body.slice(0, 4000).toLowerCase();
  const xml = sample.includes("<urlset") || sample.includes("<sitemapindex");
  if (looksLikeHtml(doc.body, doc.contentType) || !xml) {
    return draft({
      id: "sitemap",
      status: "warn",
      summary: `The sitemap URL responded, but the body is not a urlset or a sitemap index.${note}`,
      detail: "",
      evidence: evidenceOf(doc),
      manual: "Serve XML that starts with a urlset or sitemapindex element.",
      snippet: `Sitemap: ${doc.url}`,
    });
  }
  return draft({
    id: "sitemap",
    status: "pass",
    summary: `The sitemap is reachable and looks like XML.${note}`,
    detail: "",
    evidence: evidenceOf(doc),
    manual: "",
    snippet: "",
  });
}

function crawlerCheck(data: ScanData, robots: RobotsFile | null): Draft {
  if (data.robots.status === 404 || data.robots.status === 410) {
    const rows = crawlerReport(null);
    return draft({
      id: "crawlers",
      status: "pass",
      summary:
        "There is no robots.txt, so these crawlers are allowed by default. That is not a block.",
      detail: formatCrawlers(rows),
      evidence: evidenceOf(data.robots),
      manual: "",
      snippet: "",
    });
  }
  if (
    data.robots.error ||
    data.robots.status == null ||
    looksLikeHtml(data.robots.body, data.robots.contentType)
  ) {
    return draft({
      id: "crawlers",
      status: "could-not-verify",
      summary:
        "Crawler rules were not read because robots.txt was missing or was HTML.",
      detail: "",
      evidence: evidenceOf(data.robots),
      manual: "",
      snippet: "",
    });
  }
  const rows = crawlerReport(robots);
  const gate = rows.filter(
    (row) => row.role === "search" || row.role === "user",
  );
  const blocked = gate.filter((row) => !row.allowed);
  const trainingBlocked = rows.filter(
    (row) => row.role === "training" && !row.allowed,
  );
  const trainingNote =
    trainingBlocked.length > 0
      ? " Training crawlers that are blocked are listed below. That is a preference, not a failure."
      : "";
  const status: CheckStatus =
    blocked.length === 0
      ? "pass"
      : blocked.length === gate.length
        ? "fail"
        : "warn";
  return draft({
    id: "crawlers",
    status,
    summary:
      status === "pass"
        ? `Search and user-triggered crawlers can fetch /. ${gate.length} of them are allowed.${trainingNote}`
        : `${blocked.length} of ${gate.length} search or user-triggered crawlers are blocked.${trainingNote}`,
    detail: formatCrawlers(rows),
    evidence: evidenceOf(data.robots),
    manual:
      status === "pass"
        ? ""
        : "Allow search and user-triggered crawlers in robots.txt. Blocking a training crawler is a choice and does not fail this check.",
    snippet: status === "pass" ? "" : robotsSnippet(originOf(data.finalUrl)),
  });
}

function signalCheck(data: ScanData, robots: RobotsFile | null): Draft {
  const signals: ContentSignal[] = [];
  if (robots) {
    signals.push(...robots.signals);
    for (const group of robots.groups) signals.push(...group.signals);
  }
  const valid = signals.filter((signal) => signal.pairs.length > 0);
  const broken = signals.filter((signal) => signal.broken);
  if (data.robots.status === 404 || data.robots.error) {
    return draft({
      id: "content-signal",
      status: "fail",
      summary:
        "No Content-Signal line was found. A missing key is an unstated preference, not a no.",
      detail: "",
      evidence: evidenceOf(data.robots),
      manual:
        "Add one Content-Signal line to a user-agent group. Set search, ai-input, and ai-train to yes or no. Choosing no is valid.",
      snippet: "Content-Signal: search=yes, ai-input=yes, ai-train=no",
    });
  }
  if (valid.length === 0) {
    return draft({
      id: "content-signal",
      status: broken.length ? "warn" : "fail",
      summary: broken.length
        ? "A Content-Signal line is present, but the grammar is broken."
        : "No Content-Signal line was found. A missing key is an unstated preference, not a no.",
      detail: broken.map((signal) => signal.raw).join("\n"),
      evidence: evidenceOf(data.robots),
      manual:
        "Use comma-separated key=yes or key=no pairs. The keys are search, ai-input, and ai-train. A path may come first.",
      snippet: "Content-Signal: search=yes, ai-input=yes, ai-train=no",
    });
  }
  const described = valid
    .map(
      (signal) =>
        `${signal.path ? `${signal.path} ` : ""}${signal.pairs.map((pair) => `${pair.key}=${pair.value}`).join(", ")}`,
    )
    .join("; ");
  return draft({
    id: "content-signal",
    status: broken.length ? "warn" : "pass",
    summary: broken.length
      ? `A valid Content-Signal is present (${described}), and another line is broken.`
      : `Content-Signal is present: ${described}. A value of no is still a pass.`,
    detail: "This is a preference. robots.txt cannot enforce it.",
    evidence: evidenceOf(data.robots),
    manual: broken.length
      ? "Keep the valid line and fix the broken one so every pair is key=yes or key=no."
      : "",
    snippet: broken.length
      ? "Content-Signal: search=yes, ai-input=yes, ai-train=no"
      : "",
  });
}

function htmlCheck(data: ScanData): Draft {
  const doc = data.home;
  if (doc.error || doc.status == null) {
    return missingNet(
      "raw-html",
      doc,
      "The page could not be fetched, so its text was not checked.",
    );
  }
  const { title, text } = visibleText(doc.body);
  const words = text ? text.split(/\s+/).filter(Boolean).length : 0;
  const lower = text.toLowerCase();
  const challenge =
    doc.status === 401 ||
    (/just a moment|checking your browser|cf-browser-verification|enable javascript/.test(
      lower,
    ) &&
      words < 80);
  if (challenge) {
    return draft({
      id: "raw-html",
      status: "fail",
      summary:
        "The response looks like a login wall or a bot challenge. Most agents do not run JavaScript.",
      detail: title ? `Title: ${title}` : "",
      evidence: evidenceOf(doc),
      manual:
        "Serve the main text in the first HTML response, without a challenge page.",
      snippet: "",
    });
  }
  if (title && words >= 40) {
    return draft({
      id: "raw-html",
      status: "pass",
      summary: `The raw HTML already has a title and about ${words} words of text.`,
      detail: `Title: ${title}`,
      evidence: evidenceOf(doc),
      manual: "",
      snippet: "",
    });
  }
  if (title || words >= 15) {
    return draft({
      id: "raw-html",
      status: "warn",
      summary: `The raw HTML is thin (${words} words${title ? `, title "${title}"` : ", no title"}).`,
      detail: "",
      evidence: evidenceOf(doc),
      manual:
        "Put the title and the main text in the server HTML. Do not wait for JavaScript to draw it.",
      snippet: "",
    });
  }
  return draft({
    id: "raw-html",
    status: "fail",
    summary:
      "The raw HTML has almost no text. An agent that does not run JavaScript will see an empty page.",
    detail: title ? `Title: ${title}` : "",
    evidence: evidenceOf(doc),
    manual: "Render the title and the body text on the server.",
    snippet: "",
  });
}

function llmsCheck(data: ScanData, origin: string): Draft {
  const doc = data.llms;
  if (doc.error)
    return missingNet("llms-txt", doc, "llms.txt could not be fetched.");
  const assessment = assessLlmsTxt(doc.body, doc.contentType, doc.status);
  const issues = [...assessment.issues];
  let status = assessment.status;
  for (const probe of data.linkProbes) {
    if (probe.status === 404 || probe.status === 410) {
      issues.push(`Linked URL returned ${probe.status}: ${probe.url}`);
      if (status === "pass") status = "warn";
    }
  }
  const summary =
    issues.length > assessment.issues.length && status === "warn"
      ? `${assessment.summary} One or more linked URLs on this host returned 404.`
      : assessment.summary;
  return draft({
    id: "llms-txt",
    status,
    summary,
    detail: issues.slice(0, 6).join("\n"),
    evidence: evidenceOf(doc),
    manual:
      status === "pass"
        ? ""
        : "Publish /llms.txt as text or Markdown: one H1, an optional blockquote, then H2 sections of absolute links. The generator at /tools/llms-txt-generator/ will draft it.",
    snippet:
      status === "pass"
        ? ""
        : `# Example\n\n> What this site is, in one or two sentences.\n\n## Docs\n\n- [Home](${origin}/): Start here.\n`,
  });
}

function llmsFullCheck(data: ScanData): Draft {
  const doc = data.llmsFull;
  if (doc.error)
    return missingNet("llms-full", doc, "llms-full.txt could not be fetched.");
  if (doc.status === 404 || doc.status === 410 || doc.status == null) {
    return draft({
      id: "llms-full",
      status: "warn",
      summary:
        "No llms-full.txt. This companion is recommended, not required. A solid llms.txt does not need it.",
      detail: "",
      evidence: evidenceOf(doc),
      manual:
        "Optional: publish a longer Markdown file at /llms-full.txt if you want one download of the whole site.",
      snippet: "",
    });
  }
  if (looksLikeHtml(doc.body, doc.contentType)) {
    return draft({
      id: "llms-full",
      status: "warn",
      summary:
        "llms-full.txt returned HTML rather than a text or Markdown document.",
      detail: "",
      evidence: evidenceOf(doc),
      manual: "Serve the expanded text with a text or Markdown content type.",
      snippet: "",
    });
  }
  const size = doc.body.trim().length;
  if (!doc.truncated && size < 400) {
    return draft({
      id: "llms-full",
      status: "warn",
      summary:
        "llms-full.txt is very short, so it does not look like a full companion.",
      detail: `${size} characters were read.`,
      evidence: evidenceOf(doc),
      manual:
        "Put a real extract of the site in the file, or remove the tiny placeholder.",
      snippet: "",
    });
  }
  return draft({
    id: "llms-full",
    status: "pass",
    summary: doc.truncated
      ? "llms-full.txt is a substantial text file. The scan read the start and stopped."
      : "llms-full.txt is a text document.",
    detail: "",
    evidence: evidenceOf(doc),
    manual: "",
    snippet: "",
  });
}

function negotiationCheck(data: ScanData): Draft {
  const doc = data.markdown;
  if (doc.error || doc.status == null) {
    return missingNet(
      "markdown-negotiation",
      doc,
      "The Markdown request could not be completed.",
    );
  }
  if (doc.status >= 300 && doc.status < 400) {
    return draft({
      id: "markdown-negotiation",
      status: "fail",
      summary:
        "Accept: text/markdown was redirected. Negotiation should return the Markdown itself, not a redirect.",
      detail: doc.headers.location ? `Location: ${doc.headers.location}` : "",
      evidence: evidenceOf(doc),
      manual:
        "When Accept prefers text/markdown, respond 200 with content-type text/markdown and Vary: Accept. Do not redirect to the .md URL.",
      snippet: markdownSnippet(),
    });
  }
  const html = looksLikeHtml(doc.body, doc.contentType);
  const typed = markdownType(doc.contentType);
  if (doc.status === 200 && typed && !html) {
    const vary = varyAccepts(doc.headers.vary ?? null);
    return draft({
      id: "markdown-negotiation",
      status: vary ? "pass" : "warn",
      summary: vary
        ? "The homepage returns Markdown for Accept: text/markdown, and Vary includes Accept."
        : "The homepage returns Markdown, but Vary does not include Accept, so caches may mix the two copies.",
      detail: "",
      evidence: evidenceOf(doc),
      manual: vary
        ? ""
        : "Add Vary: Accept on both the HTML and the Markdown responses.",
      snippet: vary ? "" : "Vary: Accept",
    });
  }
  return draft({
    id: "markdown-negotiation",
    status: "fail",
    summary: html
      ? "Accept: text/markdown still returned HTML."
      : `Accept: text/markdown returned status ${doc.status} and content type ${doc.contentType ?? "unknown"}.`,
    detail: "",
    evidence: evidenceOf(doc),
    manual:
      "Return a 200 text/markdown body for that Accept value, and send Vary: Accept. A redirect to a .md URL does not pass.",
    snippet: markdownSnippet(),
  });
}

function variantCheck(data: ScanData): Draft {
  const good = data.mdVariants.find(
    (doc) =>
      doc.status === 200 &&
      markdownType(doc.contentType) &&
      !looksLikeHtml(doc.body, doc.contentType),
  );
  const evidence = data.mdVariants.flatMap((doc) => evidenceOf(doc));
  const linked = hasMarkdownAlternate(
    data.home.body,
    data.home.headers.link ?? null,
  );
  if (!good) {
    return draft({
      id: "markdown-variant",
      status: "fail",
      summary:
        "No stable .md URL returned Markdown. Tried the .md suffix and index.md.",
      detail: data.mdVariants.map((doc) => doc.url).join("\n"),
      evidence,
      manual:
        "Publish a Markdown twin, for example /index.md, and point at it with rel=alternate and type text/markdown.",
      snippet: `Link: <${originOf(data.finalUrl)}/index.md>; rel="alternate"; type="text/markdown"`,
    });
  }
  return draft({
    id: "markdown-variant",
    status: linked ? "pass" : "warn",
    summary: linked
      ? `Markdown is available at ${good.url}, and the page advertises it.`
      : `Markdown is available at ${good.url}, but the HTML and Link header do not advertise it as an alternate.`,
    detail: "",
    evidence,
    manual: linked
      ? ""
      : "Add a Link header or a link tag: rel=alternate and type=text/markdown.",
    snippet: linked
      ? ""
      : `Link: <${good.url}>; rel="alternate"; type="text/markdown"`,
  });
}

function linkCheck(data: ScanData, origin: string): Draft {
  const header = data.home.headers.link ?? "";
  const rels = parseLinkHeader(header);
  const has = (name: string) => rels.some((item) => item.rel.includes(name));
  const useful = has("canonical") || has("alternate") || has("describedby");
  if (useful) {
    const found = ["canonical", "alternate", "describedby"]
      .filter(has)
      .join(", ");
    return draft({
      id: "link-headers",
      status: "pass",
      summary: `The homepage Link header includes ${found}.`,
      detail: header.slice(0, 300),
      evidence: evidenceOf(data.home),
      manual: "",
      snippet: "",
    });
  }
  return draft({
    id: "link-headers",
    status: rels.length ? "warn" : "fail",
    summary: rels.length
      ? "The homepage sends a Link header, but not canonical, alternate, or describedby."
      : "The homepage has no Link header.",
    detail: "",
    evidence: evidenceOf(data.home),
    manual:
      "Send a Link header with the canonical URL, the Markdown alternate, and describedby pointing at /llms.txt. An api-catalog link is a plus only when you have an API.",
    snippet: `Link: <${origin}/>; rel="canonical", <${origin}/index.md>; rel="alternate"; type="text/markdown", <${origin}/llms.txt>; rel="describedby"`,
  });
}

function jsonLdCheck(data: ScanData): Draft {
  if (data.home.error || !data.home.body) {
    return missingNet(
      "json-ld",
      data.home,
      "JSON-LD was not checked because the page was not read.",
    );
  }
  const read = readJsonLd(data.home.body);
  if (read.blocks === 0) {
    return draft({
      id: "json-ld",
      status: "fail",
      summary: "No application/ld+json block was found in the raw HTML.",
      detail: "",
      evidence: evidenceOf(data.home),
      manual:
        "Add a JSON-LD block whose type matches the page. A content site wants WebSite, Person, Article, or BreadcrumbList. Do not add Product data unless you sell something.",
      snippet: jsonLdSnippet(originOf(data.finalUrl), data.siteType),
    });
  }
  if (read.types.length === 0 && read.broken > 0) {
    return draft({
      id: "json-ld",
      status: "warn",
      summary: "A JSON-LD block is present, but it did not parse.",
      detail: "",
      evidence: evidenceOf(data.home),
      manual: "Fix the JSON in the ld+json script.",
      snippet: "",
    });
  }
  const useful = new Set([
    ...CONTENT_TYPES,
    ...(data.siteType === "content" ? [] : PRODUCT_TYPES),
  ]);
  const matched = read.types.filter((type) => useful.has(type));
  const onlyProduct =
    read.types.length > 0 &&
    read.types.every((type) => PRODUCT_TYPES.has(type));
  if (data.siteType === "content" && onlyProduct) {
    return draft({
      id: "json-ld",
      status: "warn",
      summary: `JSON-LD parsed, but the only types are ${read.types.join(", ")}, which do not match a content page.`,
      detail: "",
      evidence: evidenceOf(data.home),
      manual:
        "Describe the site or the article. Do not require product schema on a blog.",
      snippet: jsonLdSnippet(originOf(data.finalUrl), data.siteType),
    });
  }
  if (matched.length === 0) {
    return draft({
      id: "json-ld",
      status: "warn",
      summary: `JSON-LD parsed with types ${read.types.join(", ") || "none"}, which are a weak match for this page.`,
      detail: "",
      evidence: evidenceOf(data.home),
      manual:
        "Use a type that matches the page, such as WebSite, Article, Person, or Product on a store.",
      snippet: "",
    });
  }
  return draft({
    id: "json-ld",
    status: read.broken > 0 ? "warn" : "pass",
    summary:
      read.broken > 0
        ? `Useful types ${matched.join(", ")} parsed, and another block was broken JSON.`
        : `JSON-LD parsed. Types include ${matched.join(", ")}.`,
    detail: read.types.join(", "),
    evidence: evidenceOf(data.home),
    manual:
      read.broken > 0
        ? "Remove or fix the JSON-LD block that does not parse."
        : "",
    snippet: "",
  });
}

function mcpCheck(data: ScanData): Draft {
  return jsonFamily(data, "mcp", ["ai-catalog", "mcp-card", "mcp-json"], {
    miss: "No MCP discovery file was found at /.well-known/ai-catalog.json or the older card paths.",
    bad: "An MCP discovery file was found, but it is not valid JSON with an identity and an endpoint.",
    good: "An MCP discovery file is JSON and names an identity and an endpoint. The discovery spec is still moving, so both the AI Catalog and the older card paths were checked.",
    manual:
      "Only if this site really runs an MCP server: publish an AI Catalog at /.well-known/ai-catalog.json, or a server card that names the server and its endpoint. Do not invent a card for a site with no server.",
    snippet: `{
  "entries": [
    {
      "identifier": "urn:air:example.com:mcp:main",
      "type": "application/mcp-server-card+json",
      "url": "https://example.com/server-card"
    }
  ]
}`,
    accept: (value) => catalogHasEntries(value) || recordHasIdentity(value),
  });
}

function a2aCheck(data: ScanData): Draft {
  return jsonFamily(data, "a2a", ["agent-card"], {
    miss: "No A2A agent card was found at /.well-known/agent-card.json.",
    bad: "The agent card is not valid JSON with a name and a service URL or supported interfaces.",
    good: "The A2A agent card names the agent and how to reach it.",
    manual:
      "Only if this site really hosts an A2A agent: publish /.well-known/agent-card.json with a name and a service URL or supportedInterfaces.",
    snippet: `{
  "name": "Example",
  "url": "https://example.com/agent",
  "skills": []
}`,
    accept: (value) => {
      if (!isRecord(value)) return false;
      const name =
        typeof value.name === "string" && value.name.trim().length > 0;
      const reach = Boolean(
        value.url ||
        value.supportedInterfaces ||
        value.serviceEndpoint ||
        value.endpoints,
      );
      return name && reach;
    },
  });
}

function apiCatalogCheck(data: ScanData): Draft {
  return jsonFamily(data, "api-catalog", ["api-catalog"], {
    miss: "No API catalog was found at /.well-known/api-catalog.",
    bad: "The API catalog URL responded, but it is not a JSON linkset.",
    good: "The API catalog is a JSON linkset.",
    manual:
      "Only if this site really has an API: publish /.well-known/api-catalog as application/linkset+json, and add Link rel=api-catalog on the homepage.",
    snippet: `{
  "linkset": [
    { "anchor": "https://example.com/", "service-desc": [{ "href": "https://example.com/openapi.json" }] }
  ]
}`,
    accept: (value) =>
      isRecord(value) &&
      (Array.isArray(value.linkset) || Array.isArray(value.links)),
  });
}

function openApiCheck(data: ScanData): Draft {
  return jsonFamily(data, "openapi", ["openapi"], {
    miss: "No OpenAPI document was found at /openapi.json.",
    bad: "openapi.json is not a JSON document with an openapi or swagger version.",
    good: "An OpenAPI document is published at /openapi.json.",
    manual:
      "Only if this site really has an HTTP API: publish its OpenAPI document.",
    snippet: `{
  "openapi": "3.1.0",
  "info": { "title": "Example", "version": "1.0.0" },
  "paths": {}
}`,
    accept: (value) =>
      isRecord(value) &&
      (typeof value.openapi === "string" || typeof value.swagger === "string"),
  });
}

function oauthResourceCheck(data: ScanData): Draft {
  return jsonFamily(data, "oauth-protected-resource", ["oauth-resource"], {
    miss: "No OAuth protected resource metadata was found.",
    bad: "The protected resource document is not valid metadata.",
    good: "OAuth protected resource metadata is present.",
    manual:
      "Only if this site really protects an API with OAuth: publish /.well-known/oauth-protected-resource (RFC 9728).",
    snippet: `{
  "resource": "https://example.com/api",
  "authorization_servers": ["https://example.com"]
}`,
    accept: (value) =>
      isRecord(value) &&
      (typeof value.resource === "string" ||
        Array.isArray(value.authorization_servers)),
  });
}

function oauthServerCheck(data: ScanData): Draft {
  return jsonFamily(
    data,
    "oauth-authorization-server",
    ["oauth-as", "openid"],
    {
      miss: "No OAuth authorization server or OpenID configuration was found.",
      bad: "An OAuth metadata URL responded, but it has no issuer.",
      good: "OAuth authorization server metadata (or OpenID configuration) names an issuer.",
      manual:
        "Only if this site really is an authorization server: publish RFC 8414 metadata or OpenID configuration.",
      snippet: `{
  "issuer": "https://example.com",
  "authorization_endpoint": "https://example.com/authorize",
  "token_endpoint": "https://example.com/token"
}`,
      accept: (value) => isRecord(value) && typeof value.issuer === "string",
    },
  );
}

function authAgentsCheck(data: ScanData): Draft {
  const docs = ["auth-md", "agents-wk", "agents-root"]
    .map((id) => data.extras[id])
    .filter((doc): doc is Doc => Boolean(doc));
  const evidence = docs.flatMap((doc) => evidenceOf(doc));
  const auth = data.extras["auth-md"];
  const authOk =
    auth &&
    auth.status === 200 &&
    !looksLikeHtml(auth.body, auth.contentType) &&
    auth.body.trim().length > 40;
  const agents = [data.extras["agents-wk"], data.extras["agents-root"]].some(
    (doc) => {
      const parsed = parseJson(doc);
      return parsed.kind === "json" && isRecord(parsed.value);
    },
  );
  if (authOk || agents) {
    return draft({
      id: "auth-agents",
      status: "pass",
      summary:
        "A community auth.md or agents.json file is present. These files are not an RFC.",
      detail: "",
      evidence,
      manual: "",
      snippet: "",
      doNot: DO_NOT,
    });
  }
  const broken = docs.some(
    (doc) => doc.status === 200 && looksLikeHtml(doc.body, doc.contentType),
  );
  return draft({
    id: "auth-agents",
    status: broken ? "warn" : "fail",
    summary: broken
      ? "auth.md or agents.json returned HTML."
      : "No auth.md or agents.json was found. These community files are optional.",
    detail: "",
    evidence,
    manual:
      "Only if you already publish one of these community files: keep it as text or JSON that describes a real API. Do not add one just to pass a scan.",
    snippet: "",
    doNot: DO_NOT,
  });
}

function poppyCheck(data: ScanData, host: string): Draft {
  return jsonFamily(data, "poppy", ["poppy"], {
    miss: "No Personal Agent Protocol file was found at /.well-known/poppy.json.",
    bad: "poppy.json is not valid JSON with protocol_version and organization.domain matching this host.",
    good: "poppy.json matches this host. The protocol is still a draft.",
    manual:
      "Only if you really speak this protocol: serve /.well-known/poppy.json over HTTPS with protocol_version and organization.domain set to this host.",
    snippet: `{
  "protocol_version": "1.0",
  "organization": { "domain": "${host}" }
}`,
    accept: (value) => {
      if (!isRecord(value) || typeof value.protocol_version !== "string")
        return false;
      const org = value.organization;
      if (!isRecord(org) || typeof org.domain !== "string") return false;
      return (
        org.domain.toLowerCase().replace(/^www\./, "") ===
        host.replace(/^www\./, "")
      );
    },
  });
}

function agentSkillsCheck(data: ScanData): Draft {
  return infoFile(data, "agent-skills", "agent-skills", "Agent Skills index");
}

function webBotAuthCheck(data: ScanData): Draft {
  const found = infoFile(
    data,
    "web-bot-auth",
    "web-bot-auth",
    "Web Bot Auth directory",
  );
  return {
    ...found,
    summary: `${found.summary} This matters when the site's own bots sign requests to other sites. It is not scored.`,
  };
}

function webMcpCheck(): Draft {
  return draft({
    id: "webmcp",
    status: "could-not-verify",
    summary:
      "WebMCP needs a browser to see navigator.modelContext. This scan only reads HTTP, so it was not scored.",
    detail: "",
    evidence: [],
    manual: "",
    snippet: "",
  });
}

function ardCheck(): Draft {
  return draft({
    id: "ard",
    status: "could-not-verify",
    summary:
      "Agentic resource discovery has no single stable URL yet, so it was not fetched and it is not scored.",
    detail: "",
    evidence: [],
    manual: "",
    snippet: "",
  });
}

function dnsAidCheck(data: ScanData): Draft {
  const evidence: Evidence[] = data.dnsAid.map((query) => ({
    method: "DNS",
    url: `${query.type} ${query.name}`,
    status: query.error ? null : query.found ? 0 : 3,
    contentType: null,
    snippet: query.error
      ? query.error
      : query.found
        ? `AD=${query.ad ? "yes" : "no"} ${query.data.join(" | ") || "present"}`
        : "No record.",
  }));
  const errored =
    data.dnsAid.length > 0 && data.dnsAid.every((query) => query.error);
  if (errored) {
    return draft({
      id: "dns-aid",
      status: "could-not-verify",
      summary:
        "DNS-AID records could not be checked. The draft is experimental and was not scored as a failure.",
      detail: "",
      evidence,
      manual: "",
      snippet: "",
    });
  }
  const found = data.dnsAid.filter((query) => query.found);
  if (found.length > 0) {
    const ad = found.some((query) => query.ad);
    return draft({
      id: "dns-aid",
      status: "pass",
      summary: `DNS-AID records were found (${found.length}). ${ad ? "The resolver set the AD flag." : "The resolver did not set the AD flag."} The draft is experimental and the record shape has changed before.`,
      detail: found.map((query) => `${query.type} ${query.name}`).join("\n"),
      evidence,
      manual: "",
      snippet: "",
      doNot:
        "Do not add DNS-AID records unless you mean to publish agent endpoints.",
    });
  }
  return draft({
    id: "dns-aid",
    status: "fail",
    summary:
      "No SVCB or HTTPS record was found under _index._agents, _a2a._agents, or _mcp._agents. This individual draft is not a finished standard.",
    detail: "",
    evidence,
    manual:
      "Only if you really publish agent endpoints in DNS: add the records from the current draft. Do not add them for a normal content site.",
    snippet: "",
    doNot:
      "Do not add DNS-AID records unless you mean to publish agent endpoints.",
  });
}

function ucpCheck(data: ScanData): Draft {
  return jsonFamily(data, "ucp", ["ucp"], {
    miss: "No UCP profile was found at /.well-known/ucp.",
    bad: "The UCP URL responded, but it is not a JSON profile.",
    good: "A JSON UCP profile is published at /.well-known/ucp.",
    manual:
      "Only if this site really is a store that speaks UCP: publish the profile.",
    snippet: `{ "ucp": { "version": "1" } }`,
    accept: (value) => isRecord(value),
  });
}

function x402Check(data: ScanData): Draft {
  return jsonFamily(data, "x402", ["x402"], {
    miss: "No x402 manifest was found at /.well-known/x402.",
    bad: "The x402 URL responded, but it is not a JSON manifest.",
    good: "An x402 JSON manifest is published.",
    manual:
      "Only if this site really charges with HTTP 402: publish the manifest.",
    snippet: `{ "version": 1 }`,
    accept: (value) => isRecord(value),
  });
}

function acpCheck(data: ScanData): Draft {
  return jsonFamily(data, "acp", ["acp"], {
    miss: "No ACP discovery document was found at /.well-known/acp.json.",
    bad: "acp.json is not a JSON document with a protocol, transports, or services.",
    good: "ACP discovery is published.",
    manual:
      "Only if this site really offers agent checkout: publish /.well-known/acp.json.",
    snippet: `{
  "protocol": "acp",
  "transports": ["rest"],
  "services": ["checkout"]
}`,
    accept: (value) =>
      isRecord(value) &&
      (value.protocol != null ||
        value.transports != null ||
        value.services != null),
  });
}

function mppCheck(data: ScanData): Draft {
  const openapi = data.extras.openapi;
  const inSpec = Boolean(
    openapi &&
    openapi.status === 200 &&
    /x-payment/i.test(openapi.body.slice(0, 100_000)),
  );
  const file = jsonFamily(data, "mpp", ["mpp"], {
    miss: "No MPP file was found at /.well-known/mpp, and the OpenAPI document has no x-payment metadata.",
    bad: "The MPP URL responded, but it is not JSON.",
    good: "MPP payment metadata was found.",
    manual:
      "Only if API calls on this site really require payment: describe them with x-payment metadata in OpenAPI, or publish /.well-known/mpp.",
    snippet: "",
    accept: (value) => isRecord(value),
  });
  if (inSpec && file.status !== "pass") {
    return draft({
      id: "mpp",
      status: "pass",
      summary: "The OpenAPI document includes x-payment metadata.",
      detail: "",
      evidence: [...(openapi ? evidenceOf(openapi) : []), ...file.evidence],
      manual: "",
      snippet: "",
      doNot: DO_NOT,
    });
  }
  return file;
}

function ap2Check(data: ScanData): Draft {
  const card = data.extras["agent-card"];
  const blob = (card?.body ?? "").toLowerCase();
  const found =
    /ap2|agent payments|agent-payments/.test(blob) && card?.status === 200;
  if (found) {
    return draft({
      id: "ap2",
      status: "pass",
      summary: "The agent card mentions agent payments (AP2).",
      detail:
        "AP2 is declared inside the agent card. It does not have its own well-known file.",
      evidence: card ? evidenceOf(card) : [],
      manual: "",
      snippet: "",
      doNot: DO_NOT,
    });
  }
  return draft({
    id: "ap2",
    status: "fail",
    summary:
      "The agent card does not declare agent payments. AP2 has no separate well-known file.",
    detail: "",
    evidence: card ? evidenceOf(card) : [],
    manual:
      "Only if this store really accepts agent payment mandates: declare that in a real agent card. Do not publish a card just for this check.",
    snippet: "",
    doNot: DO_NOT,
  });
}

function securityCheck(data: ScanData): Draft {
  const headers = data.home.headers;
  const hsts = Boolean(headers["strict-transport-security"]);
  const frame = Boolean(
    headers["x-frame-options"] ||
    /frame-ancestors/i.test(headers["content-security-policy"] ?? ""),
  );
  const nosniff = /nosniff/i.test(headers["x-content-type-options"] ?? "");
  const hits = [hsts, frame, nosniff].filter(Boolean).length;
  return draft({
    id: "security-headers",
    status: hits === 3 ? "pass" : hits === 0 ? "warn" : "warn",
    summary:
      hits === 3
        ? "HSTS, a frame policy, and nosniff are present. Security headers are shown and not scored."
        : "Some baseline security headers are missing. They are shown here and not scored.",
    detail: `HSTS ${hsts ? "yes" : "no"}, frame protection ${frame ? "yes" : "no"}, nosniff ${nosniff ? "yes" : "no"}.`,
    evidence: evidenceOf(data.home),
    manual: "",
    snippet: "",
  });
}

function infoFile(
  data: ScanData,
  id: string,
  extraId: string,
  label: string,
): Draft {
  const doc = data.extras[extraId];
  if (!doc || doc.error || doc.status == null) {
    return draft({
      id,
      status: "could-not-verify",
      summary: `${label} could not be fetched. It is not scored.`,
      detail: "",
      evidence: doc ? evidenceOf(doc) : [],
      manual: "",
      snippet: "",
    });
  }
  if (doc.status === 404 || doc.status === 410) {
    return draft({
      id,
      status: "skip",
      summary: `No ${label} was found. It is informational and not scored.`,
      detail: "",
      evidence: evidenceOf(doc),
      manual: "",
      snippet: "",
      doNot: DO_NOT,
    });
  }
  if (
    doc.status === 200 &&
    !looksLikeHtml(doc.body, doc.contentType) &&
    doc.body.trim()
  ) {
    return draft({
      id,
      status: "pass",
      summary: `${label} is present. It is informational and not scored.`,
      detail: "",
      evidence: evidenceOf(doc),
      manual: "",
      snippet: "",
    });
  }
  return draft({
    id,
    status: "warn",
    summary: `${label} responded with status ${doc.status}, but it does not look like a real document. It is not scored.`,
    detail: "",
    evidence: evidenceOf(doc),
    manual: "",
    snippet: "",
    doNot: DO_NOT,
  });
}

interface FamilyCopy {
  miss: string;
  bad: string;
  good: string;
  manual: string;
  snippet: string;
  accept: (value: unknown) => boolean;
}

function jsonFamily(
  data: ScanData,
  id: string,
  extraIds: string[],
  copy: FamilyCopy,
): Draft {
  const docs = extraIds
    .map((extraId) => data.extras[extraId])
    .filter((doc): doc is Doc => Boolean(doc));
  const evidence = docs.flatMap((doc) => evidenceOf(doc));
  let sawJson = false;
  let sawBad = false;
  let sawError = false;
  for (const doc of docs) {
    if (doc.error || doc.status == null) {
      sawError = true;
      continue;
    }
    const parsed = parseJson(doc);
    if (parsed.kind === "json") {
      sawJson = true;
      if (copy.accept(parsed.value)) {
        return draft({
          id,
          status: "pass",
          summary: copy.good,
          detail: "",
          evidence,
          manual: "",
          snippet: "",
          doNot: DO_NOT,
        });
      }
      sawBad = true;
    } else if (parsed.kind === "html" || parsed.kind === "bad") {
      if (doc.status === 200) sawBad = true;
    }
  }
  if (!sawJson && !sawBad) {
    if (sawError && docs.every((doc) => doc.error || doc.status == null)) {
      return missingNet(id, docs[0], `${copy.miss} The request failed.`);
    }
    return draft({
      id,
      status: "fail",
      summary: copy.miss,
      detail: "",
      evidence,
      manual: copy.manual,
      snippet: copy.snippet,
      doNot: DO_NOT,
    });
  }
  return draft({
    id,
    status: "warn",
    summary: copy.bad,
    detail: "",
    evidence,
    manual: copy.manual,
    snippet: copy.snippet,
    doNot: DO_NOT,
  });
}

function parseJson(doc: Doc | undefined): {
  kind: "missing" | "html" | "bad" | "json";
  value?: unknown;
} {
  if (!doc || doc.status == null) return { kind: "missing" };
  if (doc.status === 404 || doc.status === 410) return { kind: "missing" };
  if (looksLikeHtml(doc.body, doc.contentType)) return { kind: "html" };
  const text = doc.body.trim();
  if (!text) return { kind: "missing" };
  try {
    return { kind: "json", value: JSON.parse(text) };
  } catch {
    return { kind: "bad" };
  }
}

function catalogHasEntries(value: unknown): boolean {
  if (Array.isArray(value)) return value.length > 0;
  if (!isRecord(value)) return false;
  for (const key of ["entries", "items", "artifacts", "catalog"]) {
    const item = value[key];
    if (Array.isArray(item) && item.length > 0) return true;
  }
  return false;
}

function recordHasIdentity(value: unknown): boolean {
  if (!isRecord(value)) return false;
  const blob = JSON.stringify(value).toLowerCase();
  const identity = ["name", "title", "serverinfo", "identifier"].some((key) =>
    blob.includes(`"${key}"`),
  );
  const endpoint = [
    "url",
    "endpoint",
    "transport",
    "remotes",
    "serverurl",
  ].some((key) => blob.includes(`"${key}"`));
  return identity && endpoint;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function missingNet(id: string, doc: Doc | undefined, summary: string): Draft {
  return draft({
    id,
    status: "could-not-verify",
    summary,
    detail: doc?.error ?? "",
    evidence: doc ? evidenceOf(doc) : [],
    manual: "",
    snippet: "",
  });
}

function evidenceOf(doc: Doc): Evidence[] {
  const lines = [
    doc.error ? `error: ${doc.error}` : "",
    doc.headers.link ? `link: ${doc.headers.link}` : "",
    doc.headers.vary ? `vary: ${doc.headers.vary}` : "",
    doc.headers.location ? `location: ${doc.headers.location}` : "",
  ].filter(Boolean);
  const body = doc.body.replace(/\s+/g, " ").trim().slice(0, 240);
  return [
    {
      method: "GET",
      url: doc.url || doc.requestedUrl,
      status: doc.status,
      contentType: doc.contentType,
      snippet: [...lines, body].filter(Boolean).join("\n").slice(0, 480),
    },
  ];
}

function formatCrawlers(
  rows: {
    token: string;
    role: string;
    lab: string;
    allowed: boolean;
    group: string;
  }[],
): string {
  return rows
    .map(
      (row) =>
        `${row.token} (${row.role}, ${row.lab}): ${row.allowed ? "allowed" : "blocked"} via ${row.group}`,
    )
    .join("\n");
}

function robotsSnippet(origin: string): string {
  return `User-agent: *\nContent-Signal: search=yes, ai-input=yes, ai-train=no\nAllow: /\n\nSitemap: ${origin}/sitemap.xml\n`;
}

function markdownSnippet(): string {
  return `export const onRequest = async (context) => {
  const accept = context.request.headers.get("accept") ?? "";
  if (accept.includes("text/markdown")) {
    return new Response("# Title\\n\\nThe page, in Markdown.\\n", {
      headers: {
        "content-type": "text/markdown; charset=utf-8",
        vary: "Accept",
      },
    });
  }
  return context.next();
};`;
}

function jsonLdSnippet(origin: string, siteType: ScanData["siteType"]): string {
  if (siteType === "store") {
    return `<script type="application/ld+json">
{ "@context": "https://schema.org", "@type": "Product", "name": "Example" }
</script>`;
  }
  return `<script type="application/ld+json">
{ "@context": "https://schema.org", "@type": "WebSite", "name": "Example", "url": "${origin}/" }
</script>`;
}

function originOf(url: string): string {
  try {
    return new URL(url).origin;
  } catch {
    return url;
  }
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function draft(input: {
  id: string;
  status: CheckStatus;
  summary: string;
  detail: string;
  evidence: Evidence[];
  manual: string;
  snippet: string;
  doNot?: string | null;
}): Draft {
  return {
    id: input.id,
    status: input.status,
    summary: input.summary,
    detail: input.detail,
    evidence: input.evidence,
    manual: input.manual,
    snippet: input.snippet,
    doNot: input.doNot ?? null,
  };
}
