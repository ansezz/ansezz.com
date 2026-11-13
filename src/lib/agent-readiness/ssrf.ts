/**
 * Address checks for the agent readiness fetcher.
 * A blocked target must be rejected before any request to it.
 */

export interface ParsedIp {
  version: 4 | 6;
  bytes: number[];
}

export function parseIp(input: string): ParsedIp | null {
  const raw = input
    .trim()
    .toLowerCase()
    .replace(/^\[|\]$/g, "");
  if (!raw) return null;
  if (raw.includes(":")) return parseV6(raw);
  return parseV4(raw);
}

function parseV4(raw: string): ParsedIp | null {
  const parts = raw.split(".");
  if (parts.length !== 4) return null;
  const bytes: number[] = [];
  for (const part of parts) {
    if (!/^[0-9]{1,3}$/.test(part)) return null;
    if (part.length > 1 && part.startsWith("0")) return null;
    const n = Number(part);
    if (n > 255) return null;
    bytes.push(n);
  }
  return { version: 4, bytes };
}

function parseV6(raw: string): ParsedIp | null {
  if (raw.includes("%")) return null;
  let v4bytes: number[] | null = null;
  let main = raw;
  const lastColon = raw.lastIndexOf(":");
  if (lastColon >= 0 && raw.slice(lastColon + 1).includes(".")) {
    const v4 = parseV4(raw.slice(lastColon + 1));
    if (!v4) return null;
    v4bytes = v4.bytes;
    main = raw.slice(0, lastColon);
  }
  const halves = main.split("::");
  if (halves.length > 2) return null;
  const toGroups = (s: string): number[] | null => {
    if (s === "") return [];
    const out: number[] = [];
    for (const part of s.split(":")) {
      if (!/^[0-9a-f]{1,4}$/i.test(part)) return null;
      out.push(Number.parseInt(part, 16));
    }
    return out;
  };
  const left = toGroups(halves[0] ?? "");
  if (!left) return null;
  const right = halves.length === 2 ? toGroups(halves[1] ?? "") : [];
  if (!right) return null;
  const tail = v4bytes
    ? [
        ((v4bytes[0] ?? 0) << 8) | (v4bytes[1] ?? 0),
        ((v4bytes[2] ?? 0) << 8) | (v4bytes[3] ?? 0),
      ]
    : [];
  let groups: number[];
  if (halves.length === 1) {
    groups = [...left, ...tail];
    if (groups.length !== 8) return null;
  } else {
    const missing = 8 - (left.length + right.length + tail.length);
    if (missing < 1) return null;
    groups = [...left, ...Array<number>(missing).fill(0), ...right, ...tail];
  }
  const bytes: number[] = [];
  for (const group of groups) bytes.push((group >> 8) & 0xff, group & 0xff);
  return { version: 6, bytes };
}

/** Why an address must not be fetched, or null when it is a normal public address. */
export function ipBlockKind(ip: ParsedIp): string | null {
  if (ip.version === 4) return ipV4Kind(ip.bytes);
  return ipV6Kind(ip.bytes);
}

function ipV4Kind(bytes: number[]): string | null {
  const a = bytes[0] ?? 0;
  const b = bytes[1] ?? 0;
  const c = bytes[2] ?? 0;
  if (a === 0) return "unspecified";
  if (a === 10) return "private";
  if (a === 100 && b >= 64 && b <= 127) return "cgnat";
  if (a === 127) return "loopback";
  if (a === 169 && b === 254) return "link-local";
  if (a === 172 && b >= 16 && b <= 31) return "private";
  if (a === 192 && b === 168) return "private";
  if (a === 192 && b === 0 && c <= 2) return "reserved";
  if (a === 198 && (b === 18 || b === 19)) return "reserved";
  if (a === 198 && b === 51 && c === 100) return "reserved";
  if (a === 203 && b === 0 && c === 113) return "reserved";
  if (a >= 224) return "reserved";
  return null;
}

function ipV6Kind(bytes: number[]): string | null {
  const allZero = bytes.every((b) => b === 0);
  if (allZero) return "unspecified";
  if (bytes[15] === 1 && bytes.slice(0, 15).every((b) => b === 0))
    return "loopback";
  // IPv4-mapped (::ffff:0:0/96) is blocked even when the v4 part is public.
  if (
    bytes[10] === 0xff &&
    bytes[11] === 0xff &&
    bytes.slice(0, 10).every((b) => b === 0)
  ) {
    return "ipv4-mapped";
  }
  // Unique local fc00::/7.
  if ((bytes[0] & 0xfe) === 0xfc) return "unique-local";
  // Link local fe80::/10.
  if (bytes[0] === 0xfe && ((bytes[1] ?? 0) & 0xc0) === 0x80)
    return "link-local";
  if (bytes[0] === 0xff) return "reserved";
  // Documentation 2001:db8::/32 and discard-only 100::/64.
  if (
    bytes[0] === 0x20 &&
    bytes[1] === 0x01 &&
    bytes[2] === 0x0d &&
    bytes[3] === 0xb8
  ) {
    return "reserved";
  }
  if (
    bytes[0] === 0x01 &&
    bytes[1] === 0x00 &&
    bytes.slice(2, 8).every((b) => b === 0)
  ) {
    return "reserved";
  }
  return null;
}

export function blockReasonForIp(host: string, ip: ParsedIp): string | null {
  const kind = ipBlockKind(ip);
  if (!kind) return null;
  const shown = host.replace(/^\[|\]$/g, "");
  if (shown === "169.254.169.254") {
    return "169.254.169.254 is a link-local metadata address. It was not fetched.";
  }
  if (kind === "loopback")
    return `${shown} is a loopback address. It was not fetched.`;
  if (kind === "link-local")
    return `${shown} is a link-local address. It was not fetched.`;
  if (kind === "private" || kind === "cgnat" || kind === "unique-local") {
    return `${shown} is a private address. It was not fetched.`;
  }
  if (kind === "ipv4-mapped") {
    return `${shown} is an IPv4-mapped IPv6 address. It was not fetched.`;
  }
  return `${shown} is not a public address. It was not fetched.`;
}

const BLOCKED_HOSTS = new Set([
  "localhost",
  "localhost.localdomain",
  "metadata",
  "metadata.google",
  "metadata.google.internal",
  "instance-data",
  "kubernetes",
  "kubernetes.default",
  "kubernetes.default.svc",
]);

export function hostnameBlockReason(hostname: string): string | null {
  const host = hostname
    .trim()
    .toLowerCase()
    .replace(/^\[|\]$/g, "")
    .replace(/\.$/, "");
  if (!host) return "That URL has no host. It was not fetched.";
  if (
    BLOCKED_HOSTS.has(host) ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host.endsWith(".internal") ||
    host.endsWith(".localdomain")
  ) {
    return `${host} is a local or internal hostname. It was not fetched.`;
  }
  return null;
}

export interface TargetOk {
  ok: true;
  url: URL;
}

export interface TargetNo {
  ok: false;
  reason: string;
}

/** Accept only http(s) on ports 80 and 443, with no userinfo and no private host. */
export function parseTarget(input: string): TargetOk | TargetNo {
  let raw = input.trim();
  if (!raw) return { ok: false, reason: "Enter a URL." };
  if (raw.length > 2000) {
    return { ok: false, reason: "That URL is too long." };
  }
  if (!/^[a-z][a-z0-9+.-]*:/i.test(raw)) raw = `https://${raw}`;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { ok: false, reason: "That is not a valid URL." };
  }
  url.hash = "";
  if (url.username || url.password) {
    return {
      ok: false,
      reason: "URLs with a username or password are not allowed.",
    };
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { ok: false, reason: "Only http and https URLs are allowed." };
  }
  if (url.port && url.port !== "80" && url.port !== "443") {
    return { ok: false, reason: "Only ports 80 and 443 are allowed." };
  }
  if (
    (url.protocol === "http:" && url.port === "443") ||
    (url.protocol === "https:" && url.port === "80")
  ) {
    return { ok: false, reason: "Only ports 80 and 443 are allowed." };
  }
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (!host) return { ok: false, reason: "That URL has no host." };
  const named = hostnameBlockReason(host);
  if (named) return { ok: false, reason: named };
  if (/^\d+$/.test(host) || /0x/i.test(host) || host.includes("%")) {
    return {
      ok: false,
      reason: "That host is not a normal public name or address.",
    };
  }
  const ip = parseIp(host);
  if (ip) {
    const reason = blockReasonForIp(host, ip);
    if (reason) return { ok: false, reason };
  } else if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) {
    return {
      ok: false,
      reason: "That IP address is not in a normal form. It was not fetched.",
    };
  }
  return { ok: true, url };
}

export interface DnsAnswer {
  type: number;
  data: string;
}

/** Reject the hostname when any A or AAAA answer is non-public, or when none exist. */
export function assessDnsAnswers(
  hostname: string,
  answers: DnsAnswer[],
): { ok: true; addresses: string[] } | { ok: false; reason: string } {
  const addresses: string[] = [];
  for (const answer of answers) {
    if (answer.type !== 1 && answer.type !== 28) continue;
    const data = answer.data.trim().replace(/^\[|\]$/g, "");
    const ip = parseIp(data);
    if (!ip) {
      return {
        ok: false,
        reason: `The address ${data} could not be read, so ${hostname} was not fetched.`,
      };
    }
    const reason = blockReasonForIp(data, ip);
    if (reason) {
      return {
        ok: false,
        reason: `${hostname} resolves to a blocked address. ${reason}`,
      };
    }
    addresses.push(data);
  }
  if (addresses.length === 0) {
    return {
      ok: false,
      reason: `${hostname} has no public address, so it was not fetched.`,
    };
  }
  return { ok: true, addresses };
}
