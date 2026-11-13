/** RFC 9309 robots.txt, plus the Content-Signal line from contentsignals.org. */

export interface RobotRule {
  type: "allow" | "disallow";
  path: string;
}

export interface ContentSignal {
  path: string | null;
  pairs: { key: string; value: "yes" | "no" }[];
  broken: boolean;
  raw: string;
}

export interface RobotGroup {
  agents: string[];
  rules: RobotRule[];
  signals: ContentSignal[];
}

export interface RobotsFile {
  groups: RobotGroup[];
  sitemaps: string[];
  signals: ContentSignal[];
  html: boolean;
}

const SIGNAL_KEYS = new Set(["search", "ai-input", "ai-train"]);

export function looksLikeHtml(
  body: string,
  contentType: string | null,
): boolean {
  const type = (contentType ?? "").toLowerCase();
  if (type.includes("text/html") || type.includes("application/xhtml"))
    return true;
  const start = body.trimStart().slice(0, 240).toLowerCase();
  return (
    start.startsWith("<!doctype html") ||
    start.startsWith("<html") ||
    start.startsWith("<head") ||
    start.startsWith("<body")
  );
}

export function parseRobots(
  body: string,
  contentType: string | null,
): RobotsFile {
  const html = looksLikeHtml(body, contentType);
  const groups: RobotGroup[] = [];
  const sitemaps: string[] = [];
  const loose: ContentSignal[] = [];
  let current: RobotGroup | null = null;

  const flush = () => {
    if (!current) return;
    if (current.agents.length === 0) {
      loose.push(...current.signals);
    } else {
      groups.push(current);
    }
    current = null;
  };

  for (const rawLine of body.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, "").trim();
    if (!line) continue;
    const split = line.indexOf(":");
    if (split === -1) continue;
    const field = line.slice(0, split).trim().toLowerCase();
    const value = line.slice(split + 1).trim();
    if (field === "user-agent") {
      if (!current || current.rules.length > 0 || current.signals.length > 0) {
        flush();
        current = { agents: [], rules: [], signals: [] };
      }
      current.agents.push(value);
      continue;
    }
    if (field === "sitemap") {
      if (value) sitemaps.push(value);
      continue;
    }
    if (field === "content-signal") {
      const signal = parseSignal(value);
      if (!current) loose.push(signal);
      else current.signals.push(signal);
      continue;
    }
    if (field === "allow" || field === "disallow") {
      if (!current) current = { agents: ["*"], rules: [], signals: [] };
      if (current.agents.length === 0) current.agents.push("*");
      current.rules.push({ type: field, path: value });
    }
  }
  flush();
  return { groups, sitemaps, signals: loose, html };
}

export function parseSignal(value: string): ContentSignal {
  let rest = value.trim();
  let path: string | null = null;
  if (rest.startsWith("/")) {
    const space = rest.search(/\s/);
    if (space === -1) {
      return { path: rest, pairs: [], broken: true, raw: value };
    }
    path = rest.slice(0, space);
    rest = rest.slice(space).trim();
  }
  if (!rest) return { path, pairs: [], broken: true, raw: value };
  const pairs: { key: string; value: "yes" | "no" }[] = [];
  let broken = false;
  for (const part of rest.split(",")) {
    const piece = part.trim();
    if (!piece) continue;
    const match = /^([a-z0-9-]+)\s*=\s*(yes|no)$/i.exec(piece);
    if (!match) {
      broken = true;
      continue;
    }
    const key = match[1]!.toLowerCase();
    const answer = match[2]!.toLowerCase() as "yes" | "no";
    if (!SIGNAL_KEYS.has(key)) {
      broken = true;
      continue;
    }
    pairs.push({ key, value: answer });
  }
  if (pairs.length === 0) broken = true;
  return { path, pairs, broken, raw: value };
}

export interface CrawlerDecision {
  token: string;
  role: "training" | "search" | "user";
  lab: string;
  allowed: boolean;
  group: string;
}

export const CRAWLERS: {
  token: string;
  role: "training" | "search" | "user";
  lab: string;
}[] = [
  { token: "GPTBot", role: "training", lab: "OpenAI" },
  { token: "OAI-SearchBot", role: "search", lab: "OpenAI" },
  { token: "ChatGPT-User", role: "user", lab: "OpenAI" },
  { token: "ClaudeBot", role: "training", lab: "Anthropic" },
  { token: "Claude-SearchBot", role: "search", lab: "Anthropic" },
  { token: "PerplexityBot", role: "search", lab: "Perplexity" },
  { token: "Perplexity-User", role: "user", lab: "Perplexity" },
  { token: "Google-Extended", role: "training", lab: "Google" },
  { token: "meta-externalagent", role: "training", lab: "Meta" },
];

function ruleMatchLength(pattern: string, path: string): number {
  if (!pattern) return -1;
  const end = pattern.endsWith("$");
  const core = end ? pattern.slice(0, -1) : pattern;
  if (!core.includes("*")) {
    if (end) return path === core ? core.length : -1;
    return path.startsWith(core) ? core.length : -1;
  }
  const parts = core.split("*");
  let index = 0;
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i] ?? "";
    if (!part) continue;
    const found = path.indexOf(part, index);
    if (found < 0) return -1;
    if (i === 0 && !core.startsWith("*") && found !== 0) return -1;
    index = found + part.length;
  }
  if (end && index !== path.length) return -1;
  return core.length;
}

function groupAllows(group: RobotGroup, path: string): boolean {
  let best = -1;
  let allowed = true;
  for (const rule of group.rules) {
    const length = ruleMatchLength(rule.path, path);
    if (length < 0) continue;
    if (length > best || (length === best && rule.type === "allow")) {
      best = length;
      allowed = rule.type === "allow";
    }
  }
  return allowed;
}

/** How one crawler token would be treated for a path. No file means allow. */
export function decideCrawler(
  file: RobotsFile | null,
  token: string,
  path = "/",
): { allowed: boolean; group: string } {
  if (!file || file.groups.length === 0)
    return { allowed: true, group: "none" };
  const needle = token.toLowerCase();
  let bestLen = -1;
  const matched: RobotGroup[] = [];
  let star: RobotGroup[] = [];
  for (const group of file.groups) {
    let groupBest = -1;
    let starHit = false;
    for (const agent of group.agents) {
      const name = agent.toLowerCase();
      if (name === "*") {
        starHit = true;
        continue;
      }
      if (needle === name || needle.includes(name)) {
        groupBest = Math.max(groupBest, name.length);
      }
    }
    if (groupBest > bestLen) {
      bestLen = groupBest;
      matched.length = 0;
      matched.push(group);
    } else if (groupBest === bestLen && groupBest >= 0) {
      matched.push(group);
    }
    if (starHit) star.push(group);
  }
  const chosen = bestLen >= 0 ? matched : star;
  if (chosen.length === 0) return { allowed: true, group: "none" };
  const rules: RobotRule[] = [];
  const names: string[] = [];
  for (const group of chosen) {
    rules.push(...group.rules);
    names.push(...group.agents);
  }
  const allowed = groupAllows({ agents: names, rules, signals: [] }, path);
  const label = bestLen >= 0 ? names.filter((n) => n !== "*").join(", ") : "*";
  return { allowed, group: label || "*" };
}

export function crawlerReport(file: RobotsFile | null): CrawlerDecision[] {
  return CRAWLERS.map((crawler) => {
    const decision = decideCrawler(file, crawler.token, "/");
    return { ...crawler, allowed: decision.allowed, group: decision.group };
  });
}
