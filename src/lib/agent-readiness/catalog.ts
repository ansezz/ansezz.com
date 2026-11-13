import type { Impact, ScoreGroup, SiteType, Stability } from "./types.ts";

export interface CheckMeta {
  title: string;
  impact: Impact;
  group: ScoreGroup;
  stability: Stability;
  specUrl: string | null;
  specLabel: string | null;
}

export const CHECK_META: Record<string, CheckMeta> = {
  https: {
    title: "HTTPS",
    impact: "high",
    group: "access",
    stability: "stable",
    specUrl: "https://www.rfc-editor.org/rfc/rfc9110",
    specLabel: "RFC 9110",
  },
  robots: {
    title: "robots.txt",
    impact: "high",
    group: "access",
    stability: "stable",
    specUrl: "https://www.rfc-editor.org/rfc/rfc9309",
    specLabel: "RFC 9309",
  },
  sitemap: {
    title: "XML sitemap",
    impact: "high",
    group: "readable",
    stability: "stable",
    specUrl: "https://www.sitemaps.org/protocol.html",
    specLabel: "Sitemap protocol",
  },
  crawlers: {
    title: "AI crawler access",
    impact: "high",
    group: "access",
    stability: "stable",
    specUrl: "https://www.rfc-editor.org/rfc/rfc9309",
    specLabel: "RFC 9309",
  },
  "content-signal": {
    title: "Content-Signal",
    impact: "high",
    group: "access",
    stability: "emerging",
    specUrl: "https://contentsignals.org/",
    specLabel: "contentsignals.org",
  },
  "raw-html": {
    title: "Content in the raw HTML",
    impact: "high",
    group: "readable",
    stability: "stable",
    specUrl: null,
    specLabel: null,
  },
  "llms-txt": {
    title: "llms.txt",
    impact: "medium",
    group: "readable",
    stability: "emerging",
    specUrl: "https://llmstxt.org/",
    specLabel: "llmstxt.org",
  },
  "llms-full": {
    title: "llms-full.txt",
    impact: "medium",
    group: "readable",
    stability: "emerging",
    specUrl: "https://llmstxt.org/",
    specLabel: "llmstxt.org",
  },
  "markdown-negotiation": {
    title: "Markdown negotiation",
    impact: "medium",
    group: "readable",
    stability: "emerging",
    specUrl: "https://llmstxt.org/",
    specLabel: "llmstxt.org",
  },
  "markdown-variant": {
    title: "Stable Markdown URL",
    impact: "medium",
    group: "readable",
    stability: "emerging",
    specUrl: "https://llmstxt.org/",
    specLabel: "llmstxt.org",
  },
  "link-headers": {
    title: "HTTP Link headers",
    impact: "medium",
    group: "readable",
    stability: "stable",
    specUrl: "https://www.rfc-editor.org/rfc/rfc8288",
    specLabel: "RFC 8288",
  },
  "json-ld": {
    title: "JSON-LD",
    impact: "medium",
    group: "readable",
    stability: "stable",
    specUrl: "https://json-ld.org/",
    specLabel: "JSON-LD",
  },
  mcp: {
    title: "MCP discovery",
    impact: "low",
    group: "act",
    stability: "experimental",
    specUrl: "https://modelcontextprotocol.io/seps/2127-mcp-server-cards",
    specLabel: "SEP-2127",
  },
  a2a: {
    title: "A2A agent card",
    impact: "low",
    group: "act",
    stability: "emerging",
    specUrl: "https://a2a-protocol.org/latest/topics/agent-discovery/",
    specLabel: "A2A discovery",
  },
  "api-catalog": {
    title: "API catalog",
    impact: "low",
    group: "act",
    stability: "stable",
    specUrl: "https://www.rfc-editor.org/rfc/rfc9727",
    specLabel: "RFC 9727",
  },
  openapi: {
    title: "OpenAPI document",
    impact: "low",
    group: "act",
    stability: "stable",
    specUrl: "https://spec.openapis.org/oas/latest.html",
    specLabel: "OpenAPI",
  },
  "oauth-protected-resource": {
    title: "OAuth protected resource",
    impact: "low",
    group: "act",
    stability: "stable",
    specUrl: "https://www.rfc-editor.org/rfc/rfc9728",
    specLabel: "RFC 9728",
  },
  "oauth-authorization-server": {
    title: "OAuth authorization server",
    impact: "low",
    group: "act",
    stability: "stable",
    specUrl: "https://www.rfc-editor.org/rfc/rfc8414",
    specLabel: "RFC 8414",
  },
  "auth-agents": {
    title: "auth.md and agents.json",
    impact: "low",
    group: "act",
    stability: "experimental",
    specUrl: null,
    specLabel: null,
  },
  poppy: {
    title: "Personal Agent Protocol",
    impact: "low",
    group: "act",
    stability: "experimental",
    specUrl: "https://personalagentprotocol.org/docs/1.0/spec",
    specLabel: "Poppy 1.0",
  },
  "agent-skills": {
    title: "Agent Skills index",
    impact: "low",
    group: "act",
    stability: "experimental",
    specUrl: null,
    specLabel: null,
  },
  "web-bot-auth": {
    title: "Web Bot Auth directory",
    impact: "low",
    group: "act",
    stability: "experimental",
    specUrl: "https://www.rfc-editor.org/rfc/rfc9421",
    specLabel: "RFC 9421",
  },
  webmcp: {
    title: "WebMCP",
    impact: "low",
    group: "act",
    stability: "experimental",
    specUrl: null,
    specLabel: null,
  },
  ard: {
    title: "Agentic resource discovery",
    impact: "low",
    group: "act",
    stability: "experimental",
    specUrl: null,
    specLabel: null,
  },
  "dns-aid": {
    title: "DNS-AID",
    impact: "low",
    group: "act",
    stability: "experimental",
    specUrl:
      "https://datatracker.ietf.org/doc/html/draft-mozleywilliams-dawn-dnsaid-00",
    specLabel: "draft-mozleywilliams-dawn-dnsaid-00",
  },
  ucp: {
    title: "UCP profile",
    impact: "low",
    group: "act",
    stability: "experimental",
    specUrl: null,
    specLabel: null,
  },
  x402: {
    title: "x402 payment manifest",
    impact: "low",
    group: "act",
    stability: "experimental",
    specUrl:
      "https://www.ietf.org/archive/id/draft-hawkins-x402-dns-discovery-00.html",
    specLabel: "draft-hawkins-x402-dns-discovery-00",
  },
  acp: {
    title: "ACP discovery",
    impact: "low",
    group: "act",
    stability: "experimental",
    specUrl: null,
    specLabel: null,
  },
  mpp: {
    title: "MPP payment metadata",
    impact: "low",
    group: "act",
    stability: "experimental",
    specUrl: null,
    specLabel: null,
  },
  ap2: {
    title: "AP2 agent payments",
    impact: "low",
    group: "act",
    stability: "experimental",
    specUrl: null,
    specLabel: null,
  },
  "security-headers": {
    title: "Security headers",
    impact: "low",
    group: "access",
    stability: "stable",
    specUrl: null,
    specLabel: null,
  },
};

const API_IDS = new Set([
  "mcp",
  "a2a",
  "api-catalog",
  "openapi",
  "oauth-protected-resource",
  "oauth-authorization-server",
  "auth-agents",
  "poppy",
]);

const STORE_IDS = new Set(["ucp", "x402", "acp", "mpp", "ap2"]);

const INFO_IDS = new Set([
  "agent-skills",
  "web-bot-auth",
  "webmcp",
  "ard",
  "security-headers",
]);

export function weightFor(impact: Impact): number {
  if (impact === "high") return 3;
  if (impact === "medium") return 2;
  return 1;
}

/** Protocol and commerce checks count only for the site type that has them. */
export function isScored(id: string, siteType: SiteType): boolean {
  if (INFO_IDS.has(id)) return false;
  if (API_IDS.has(id)) return siteType === "saas" || siteType === "everything";
  if (id === "dns-aid") return siteType !== "content";
  if (STORE_IDS.has(id))
    return siteType === "store" || siteType === "everything";
  return true;
}

export function siteTypeLabel(siteType: SiteType): string {
  if (siteType === "saas") return "SaaS";
  if (siteType === "store") return "Store";
  if (siteType === "everything") return "Everything";
  return "Content";
}

export const DO_NOT =
  "Do not publish this file unless the service it describes is real.";
