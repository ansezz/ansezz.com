export type SiteType = "content" | "saas" | "store" | "everything";

export type CheckStatus =
  | "pass"
  | "warn"
  | "fail"
  | "skip"
  | "could-not-verify";

export type Impact = "high" | "medium" | "low";
export type ScoreGroup = "access" | "readable" | "act";
export type Stability = "stable" | "emerging" | "experimental";

export interface Evidence {
  method: "GET" | "DNS";
  url: string;
  status: number | null;
  contentType: string | null;
  snippet: string;
}

export interface CheckFix {
  manual: string;
  snippet: string;
  prompt: string;
}

export interface Check {
  id: string;
  title: string;
  impact: Impact;
  group: ScoreGroup;
  stability: Stability;
  specUrl: string | null;
  specLabel: string | null;
  weight: number;
  scored: boolean;
  status: CheckStatus;
  summary: string;
  detail: string;
  evidence: Evidence[];
  fix: CheckFix | null;
  doNot: string | null;
  recoverable: number;
}

export interface Subscore {
  earned: number;
  possible: number;
  score: number;
}

export interface Report {
  schemaVersion: 1;
  inputUrl: string;
  finalUrl: string;
  siteType: SiteType;
  siteTypeLabel: string;
  scannedAt: string;
  elapsedMs: number;
  fetches: number;
  score: number;
  band: "excellent" | "good" | "needs-work" | "blocked";
  bandLabel: string;
  verdict: string;
  scoring: string;
  counts: {
    passed: number;
    warned: number;
    failed: number;
    applicable: number;
  };
  subscores: {
    access: Subscore | null;
    readable: Subscore | null;
    act: Subscore | null;
  };
  checks: Check[];
  curl: string;
  agentPrompt: string;
}

export interface Doc {
  id: string;
  requestedUrl: string;
  url: string;
  status: number | null;
  contentType: string | null;
  headers: Record<string, string>;
  body: string;
  truncated: boolean;
  error: string | null;
}

export interface DnsAidQuery {
  name: string;
  type: "HTTPS" | "SVCB";
  found: boolean;
  ad: boolean;
  data: string[];
  error: string | null;
}

export interface LinkProbe {
  url: string;
  status: number | null;
  contentType: string | null;
}

export interface ScanData {
  inputUrl: string;
  finalUrl: string;
  siteType: SiteType;
  scannedAt: string;
  elapsedMs: number;
  fetches: number;
  home: Doc;
  robots: Doc;
  sitemap: Doc | null;
  sitemapNote: string | null;
  llms: Doc;
  llmsFull: Doc;
  markdown: Doc;
  mdVariants: Doc[];
  extras: Record<string, Doc | undefined>;
  linkProbes: LinkProbe[];
  dnsAid: DnsAidQuery[];
}
