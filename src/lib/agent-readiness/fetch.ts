/**
 * GET/HEAD-only fetcher with a hard stop on private, loopback, link-local,
 * and metadata targets. DNS is checked through DNS-over-HTTPS before connect,
 * and every redirect is checked again.
 */

import { ScanError } from "./errors.ts";
import {
  assessDnsAnswers,
  blockReasonForIp,
  hostnameBlockReason,
  parseIp,
  parseTarget,
  type DnsAnswer,
} from "./ssrf.ts";
import type { Doc } from "./types.ts";

export const USER_AGENT =
  "ansezz-agent-readiness/1.0 (+https://ansezz.com/tools/agent-readiness-checker/; public site scan)";

export const REQUEST_TIMEOUT_MS = 8000;
export const MAX_REDIRECTS = 3;
export const MAX_FETCHES = 45;

// Tried in order. A Worker on a Cloudflare zone often cannot complete a fetch
// to cloudflare-dns.com (the request is counted, then the body is not JSON).
// The next resolver is not on that network. If every one fails, the hostname
// is not fetched.
const DOH_ENDPOINTS = [
  "https://cloudflare-dns.com/dns-query",
  "https://dns.google/resolve",
];

const HEADER_KEEP = [
  "content-type",
  "content-length",
  "location",
  "link",
  "vary",
  "strict-transport-security",
  "x-frame-options",
  "content-security-policy",
  "x-content-type-options",
  "server",
  "www-authenticate",
];

export interface Net {
  fetch(url: string, init: RequestInit): Promise<Response>;
}

export interface ResolveResult {
  ok: boolean;
  reason: string;
  addresses: string[];
  /** dns: no resolver answered. blocked: a resolver answered with a non-public address. */
  kind?: "dns" | "blocked";
}

export interface Budget {
  readonly fetches: number;
  fetch(url: string, init: RequestInit): Promise<Response>;
}

class BudgetError extends Error {
  constructor() {
    super("budget");
    this.name = "BudgetError";
  }
}

export function createBudget(net: Net, max = MAX_FETCHES): Budget {
  let fetches = 0;
  return {
    get fetches() {
      return fetches;
    },
    fetch(url, init) {
      if (fetches >= max) return Promise.reject(new BudgetError());
      fetches += 1;
      return net.fetch(url, init);
    },
  };
}

export function defaultNet(): Net {
  return {
    fetch: (url, init) => fetch(url, init),
  };
}

interface DohQuery {
  error: string | null;
  answers: DnsAnswer[];
  ad: boolean;
}

export function parseDohJson(body: string): DohQuery | null {
  try {
    const data = JSON.parse(body) as {
      Status?: number;
      AD?: boolean;
      Answer?: { type?: number; data?: string }[];
    };
    const status = data.Status;
    if (status == null || status === 2 || status === 5) {
      return { error: "resolver", answers: [], ad: false };
    }
    const answers: DnsAnswer[] = [];
    for (const item of data.Answer ?? []) {
      if (typeof item.type !== "number" || typeof item.data !== "string")
        continue;
      answers.push({ type: item.type, data: item.data });
    }
    return { error: null, answers, ad: data.AD === true };
  } catch {
    return null;
  }
}

export async function dohQuery(
  name: string,
  type: string,
  fetchImpl: Budget["fetch"],
): Promise<DohQuery & { statusCode: number | null }> {
  let last: DohQuery & { statusCode: number | null } = {
    error: "resolver",
    answers: [],
    ad: false,
    statusCode: null,
  };
  for (const base of DOH_ENDPOINTS) {
    const result = await dohQueryOne(base, name, type, fetchImpl);
    if (!result.error) return result;
    last = result;
  }
  return last;
}

async function dohQueryOne(
  base: string,
  name: string,
  type: string,
  fetchImpl: Budget["fetch"],
): Promise<DohQuery & { statusCode: number | null }> {
  const url = `${base}?name=${encodeURIComponent(name)}&type=${encodeURIComponent(type)}`;
  const timer = timeout();
  try {
    const response = await workerFetch(fetchImpl, url, {
      method: "GET",
      redirect: "manual",
      signal: timer.signal,
      headers: { accept: "application/dns-json", "user-agent": USER_AGENT },
    });
    if (response.status >= 300 && response.status < 400) {
      await response.body?.cancel();
      return {
        error: "resolver",
        answers: [],
        ad: false,
        statusCode: response.status,
      };
    }
    const text = await readCapped(response, 64 * 1024);
    const parsed = parseDohJson(text.text);
    if (!parsed || response.status >= 400) {
      return {
        error: "resolver",
        answers: [],
        ad: false,
        statusCode: response.status,
      };
    }
    return { ...parsed, statusCode: response.status };
  } catch {
    return { error: "resolver", answers: [], ad: false, statusCode: null };
  } finally {
    timer.cancel();
  }
}

export async function resolvePublicHost(
  hostname: string,
  fetchImpl: Budget["fetch"],
): Promise<ResolveResult> {
  const [v4, v6] = await Promise.all([
    dohQuery(hostname, "A", fetchImpl),
    dohQuery(hostname, "AAAA", fetchImpl),
  ]);
  if (v4.error || v6.error) {
    return {
      ok: false,
      kind: "dns",
      reason: `DNS lookup failed for ${hostname}, so it was not fetched.`,
      addresses: [],
    };
  }
  const judged = assessDnsAnswers(hostname, [...v4.answers, ...v6.answers]);
  if (!judged.ok) {
    return { ok: false, kind: "blocked", reason: judged.reason, addresses: [] };
  }
  return { ok: true, reason: "", addresses: judged.addresses };
}

export interface GetOptions {
  id: string;
  url: string;
  accept: string;
  follow: boolean;
  maxBytes: number;
}

export async function safeGet(
  budget: Budget,
  resolve: (hostname: string) => Promise<ResolveResult>,
  options: GetOptions,
): Promise<Doc> {
  let current = options.url;
  const seen = new Set<string>();
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const first = hop === 0;
    const parsed = parseTarget(current);
    if (!parsed.ok) {
      const reason = parsed.reason.includes("not fetched")
        ? parsed.reason
        : `${parsed.reason} It was not fetched.`;
      throw blocked(
        first
          ? reason
          : `A redirect pointed at ${current}. That target was not fetched. ${parsed.reason}`,
        budget.fetches,
        current,
      );
    }
    const host = parsed.url.hostname.replace(/^\[|\]$/g, "");
    try {
      await assertPublic(host, resolve, budget.fetches);
    } catch (error) {
      if (error instanceof ScanError && !first) {
        throw refusal(
          `A redirect pointed at ${current}. That target was not fetched. ${error.message}`,
          budget.fetches,
          current,
          error.code === "dns" ? "dns" : "blocked",
        );
      }
      if (error instanceof ScanError) {
        throw refusal(
          error.message,
          budget.fetches,
          current,
          error.code === "dns" ? "dns" : "blocked",
        );
      }
      throw error;
    }
    const href = parsed.url.href;
    if (seen.has(href)) {
      return emptyDoc(options, href, "The URL redirected to itself.");
    }
    seen.add(href);
    const timer = timeout();
    let response: Response;
    try {
      response = await workerFetch(budget.fetch.bind(budget), href, {
        method: "GET",
        redirect: "manual",
        signal: timer.signal,
        headers: {
          accept: options.accept,
          "user-agent": USER_AGENT,
          "accept-language": "en",
        },
      });
    } catch (error) {
      if (error instanceof BudgetError) {
        return emptyDoc(
          options,
          href,
          "Not fetched. The scan reached its request budget.",
        );
      }
      if (error instanceof ScanError) throw error;
      const aborted = error instanceof Error && error.name === "AbortError";
      return emptyDoc(
        options,
        href,
        aborted
          ? "The request timed out after 8 seconds."
          : "The request failed before a response arrived.",
      );
    } finally {
      timer.cancel();
    }
    const location = response.headers.get("location");
    const redirecting =
      options.follow &&
      response.status >= 300 &&
      response.status < 400 &&
      location &&
      hop < MAX_REDIRECTS;
    if (redirecting) {
      await response.body?.cancel();
      try {
        current = new URL(location, href).href;
      } catch {
        throw blocked(
          `A redirect from ${href} had a bad Location header. That target was not fetched.`,
          budget.fetches,
          href,
        );
      }
      continue;
    }
    const body = await readCapped(response, options.maxBytes);
    return {
      id: options.id,
      requestedUrl: options.url,
      url: href,
      status: response.status,
      contentType: response.headers.get("content-type"),
      headers: pickHeaders(response.headers),
      body: body.text,
      truncated: body.truncated,
      error: null,
    };
  }
  return emptyDoc(options, current, "Too many redirects.");
}

async function assertPublic(
  hostname: string,
  resolve: (hostname: string) => Promise<ResolveResult>,
  fetches: number,
): Promise<void> {
  const named = hostnameBlockReason(hostname);
  if (named) throw blocked(named, fetches, hostname);
  const ip = parseIp(hostname);
  if (ip) {
    const reason = blockReasonForIp(hostname, ip);
    if (reason) throw blocked(reason, fetches, hostname);
    return;
  }
  const result = await resolve(hostname);
  if (!result.ok) {
    throw refusal(
      result.reason,
      fetches,
      hostname,
      result.kind === "dns" ? "dns" : "blocked",
    );
  }
}

function blocked(message: string, fetches: number, url: string): ScanError {
  return refusal(message, fetches, url, "blocked");
}

function refusal(
  message: string,
  fetches: number,
  url: string,
  code: "blocked" | "dns",
): ScanError {
  return new ScanError(message, 400, code, fetches, url);
}

// Older Workers runtimes throw if Request.cache is set. Retry once without it.
// redirect: "manual" stays. Following a redirect here would skip the SSRF check.
async function workerFetch(
  fetchImpl: Budget["fetch"],
  url: string,
  init: RequestInit,
): Promise<Response> {
  try {
    return await fetchImpl(url, init);
  } catch (error) {
    if (!init.cache) throw error;
    const message = error instanceof Error ? error.message : "";
    if (!/cache/i.test(message)) throw error;
    const next: RequestInit = { ...init };
    delete next.cache;
    return await fetchImpl(url, next);
  }
}

function emptyDoc(options: GetOptions, url: string, error: string): Doc {
  return {
    id: options.id,
    requestedUrl: options.url,
    url,
    status: null,
    contentType: null,
    headers: {},
    body: "",
    truncated: false,
    error,
  };
}

function pickHeaders(headers: Headers): Record<string, string> {
  const out: Record<string, string> = {};
  for (const name of HEADER_KEEP) {
    const value = headers.get(name);
    if (value) out[name] = value.slice(0, 400);
  }
  return out;
}

export async function readCapped(
  response: Response,
  maxBytes: number,
): Promise<{ text: string; truncated: boolean }> {
  const reader = response.body?.getReader();
  if (!reader) {
    const text = await response.text();
    return {
      text: text.slice(0, maxBytes),
      truncated: text.length > maxBytes,
    };
  }
  const decoder = new TextDecoder();
  let received = 0;
  let text = "";
  let truncated = false;
  while (received < maxBytes) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    received += value.byteLength;
    if (received > maxBytes) {
      const keep = value.byteLength - (received - maxBytes);
      text += decoder.decode(value.subarray(0, Math.max(0, keep)), {
        stream: true,
      });
      truncated = true;
      break;
    }
    text += decoder.decode(value, { stream: true });
  }
  text += decoder.decode();
  try {
    await reader.cancel();
  } catch {
    // The body may already be finished.
  }
  return { text, truncated };
}

function timeout(ms = REQUEST_TIMEOUT_MS): {
  signal: AbortSignal;
  cancel: () => void;
} {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  return {
    signal: ctrl.signal,
    cancel: () => clearTimeout(timer),
  };
}

export function makeResolver(
  budget: Budget,
): (hostname: string) => Promise<ResolveResult> {
  const cache = new Map<string, Promise<ResolveResult>>();
  return (hostname: string) => {
    const key = hostname.toLowerCase().replace(/\.$/, "");
    const hit = cache.get(key);
    if (hit) return hit;
    const pending = resolvePublicHost(key, (url, init) =>
      budget.fetch(url, init),
    );
    cache.set(key, pending);
    return pending;
  };
}
