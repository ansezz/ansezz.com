// Shopify signature check, three schemes, all HMAC-SHA256 keyed with the app's
// client secret via crypto.subtle.importKey + crypto.subtle.sign:
//   - webhook: over the raw body bytes, base64, in X-Shopify-Hmac-Sha256.
//   - app proxy: over the sorted query params joined with no separator
//     (multi-values joined by ","), hex, in the `signature` param.
//   - OAuth / install / admin link: over the sorted query params, form
//     encoded and joined with "&", hex, in the `hmac` param.
// Compared with a constant-time loop. The secret is read from the field and
// handed straight to Web Crypto. It is never stored, logged, or transmitted.

type Mode = "webhook" | "proxy" | "oauth";

type Verdict = "idle" | "info" | "pass" | "fail" | "error";
type SignalLevel = "ok" | "warn";

interface Signal {
  level: SignalLevel;
  text: string;
}

const ENCODER = new TextEncoder();
const DEBOUNCE_MS = 120;
const COPY_RESET_MS = 1500;
const DIGEST_BYTES = 32;
const BASE64_CHARS = /^[A-Za-z0-9+/]+={0,2}$/;
const HEX_DIGEST = /^[0-9a-f]{64}$/i;

// Static lookup — dynamic class strings never reach Tailwind.
const VERDICT_TONE: Record<Verdict, string> = {
  idle: "bg-bg-alt",
  info: "bg-yellow",
  pass: "bg-green",
  fail: "bg-red",
  error: "bg-red",
};
const TONE_CLASSES = ["bg-bg-alt", "bg-yellow", "bg-green", "bg-red"];

type IconKey = "idle" | "pass" | "fail";
const ICON_KEYS: readonly IconKey[] = ["idle", "pass", "fail"];
const VERDICT_ICON: Record<Verdict, IconKey> = {
  idle: "idle",
  info: "idle",
  pass: "pass",
  fail: "fail",
  error: "fail",
};

/**
 * Compares two byte strings without leaking where they diverge.
 *
 * Every byte pair is XOR-ed and OR-ed into an accumulator that is only read at
 * the end, so the loop runs the same number of iterations whether the first
 * byte differs or none of them do. The length difference is folded in first, so
 * a truncated value cannot win by being short. This is what hash_equals() does
 * in PHP, crypto.timingSafeEqual() in Node, and hmac.compare_digest() in
 * Python — and what `===` conspicuously does not.
 */
function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  const len = a.length > b.length ? a.length : b.length;
  let diff = a.length ^ b.length;
  for (let i = 0; i < len; i += 1) {
    const x = i < a.length ? a[i] : 0;
    const y = i < b.length ? b[i] : 0;
    diff |= x ^ y;
  }
  return diff === 0;
}

function toBase64(bytes: Uint8Array): string {
  // A SHA-256 digest is 32 bytes, so a straight loop is safe here.
  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function decodeBase64(value: string): Uint8Array | null {
  if (value.length === 0 || value.length % 4 !== 0) return null;
  if (!BASE64_CHARS.test(value)) return null;
  try {
    const binary = atob(value);
    const out = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      out[i] = binary.charCodeAt(i);
    }
    return out;
  } catch {
    return null;
  }
}

/** Debug-only readout. Never used to decide anything. */
function firstDifference(a: string, b: string): number {
  const shared = Math.min(a.length, b.length);
  for (let i = 0; i < shared; i += 1) {
    if (a[i] !== b[i]) return i;
  }
  return a.length === b.length ? -1 : shared;
}

function toHex(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i += 1) {
    out += bytes[i].toString(16).padStart(2, "0");
  }
  return out;
}

interface QueryParse {
  supplied: string;
  message: string;
  keys: string[];
}

/** Turns a full URL, "?a=b" or "a=b" into the message Shopify signed. */
function parseQuery(raw: string, mode: "proxy" | "oauth"): QueryParse {
  let query = raw.trim();
  const q = query.indexOf("?");
  if (q !== -1) query = query.slice(q + 1);
  const hash = query.indexOf("#");
  if (hash !== -1) query = query.slice(0, hash);

  const params = new URLSearchParams(query);
  const sigKey = mode === "proxy" ? "signature" : "hmac";
  const supplied = (params.get(sigKey) ?? "").trim();

  const grouped = new Map<string, string[]>();
  for (const [k, v] of params) {
    if (k === sigKey || (mode === "oauth" && k === "signature")) continue;
    const list = grouped.get(k);
    if (list) list.push(v);
    else grouped.set(k, [v]);
  }
  const keys = [...grouped.keys()].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));

  let message: string;
  if (mode === "proxy") {
    message = keys
      .map((k) => `${k}=${(grouped.get(k) ?? []).join(",")}`)
      .join("");
  } else {
    const out = new URLSearchParams();
    for (const k of keys) {
      for (const v of grouped.get(k) ?? []) out.append(k, v);
    }
    message = out.toString();
  }
  return { supplied, message, keys };
}

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : "unknown error";
}

function selectContents(el: HTMLElement): void {
  const selection = window.getSelection();
  if (!selection) return;
  const range = document.createRange();
  range.selectNodeContents(el);
  selection.removeAllRanges();
  selection.addRange(range);
}

function describeBody(body: string): Signal[] {
  const signals: Signal[] = [];
  const byteLength = ENCODER.encode(body).length;

  if (body.length === 0) {
    signals.push({
      level: "warn",
      text: "The body is empty. Shopify never sends an empty webhook body, so this digest is not going to match anything real.",
    });
    return signals;
  }

  signals.push({
    level: "ok",
    text:
      byteLength === body.length
        ? `Body: ${byteLength} bytes, ASCII only.`
        : `Body: ${byteLength} bytes of UTF-8 from ${body.length} characters — it contains non-ASCII text, which is hashed as its UTF-8 encoding.`,
  });

  try {
    JSON.parse(body);
    signals.push({ level: "ok", text: "Body parses as JSON." });
  } catch {
    signals.push({
      level: "warn",
      text: "Body does not parse as JSON. That is not fatal — HMAC signs bytes, not structure — but a Shopify webhook body is always valid JSON, so something is probably truncated.",
    });
  }

  if (/[\n\r]\s*$/.test(body)) {
    signals.push({
      level: "warn",
      text: "Body ends with a line break. Shopify does not send one; a copy/paste or an editor almost certainly added it. Delete it and try again.",
    });
  } else if (body !== body.trim()) {
    signals.push({
      level: "warn",
      text: "Body has leading or trailing whitespace. Every byte is signed, including that one.",
    });
  }

  if (/\n[ \t]+\S/.test(body)) {
    signals.push({
      level: "warn",
      text: "Body contains indented line breaks — this looks pretty-printed. Shopify sends compact JSON, so a reformatted payload can never match.",
    });
  }

  if (body.includes("\n")) {
    signals.push({
      level: "warn",
      text: "This textarea normalises CRLF to LF, so a body that arrived with \\r\\n line endings cannot be reproduced by pasting it here. Verify that one on the server.",
    });
  }

  return signals;
}

function describeHeader(raw: string, trimmed: string): Signal[] {
  const signals: Signal[] = [];
  if (trimmed.length === 0) {
    signals.push({
      level: "warn",
      text: "No header supplied — nothing to compare the digest against.",
    });
    return signals;
  }

  if (raw !== trimmed) {
    signals.push({
      level: "warn",
      text: "Whitespace was trimmed from the header value before comparing.",
    });
  }

  if (HEX_DIGEST.test(trimmed)) {
    signals.push({
      level: "warn",
      text: "That is 64 hex characters, not base64. X-Shopify-Hmac-Sha256 is always base64 — a hex digest means you are holding an app proxy signature, which is signed over sorted query parameters instead of the body.",
    });
    return signals;
  }

  const decoded = decodeBase64(trimmed);
  if (!decoded) {
    signals.push({
      level: "warn",
      text: "Header is not valid base64, so it cannot be a Shopify webhook signature. Check for a truncated copy/paste.",
    });
    return signals;
  }

  if (decoded.length !== DIGEST_BYTES) {
    signals.push({
      level: "warn",
      text: `Header decodes to ${decoded.length} bytes; a SHA-256 digest is ${DIGEST_BYTES}. Whatever this value is, it is not an HMAC-SHA256 digest.`,
    });
    return signals;
  }

  signals.push({
    level: "ok",
    text: `Header is valid base64 and decodes to ${DIGEST_BYTES} bytes.`,
  });
  return signals;
}

function init(): void {
  const root = document.getElementById("shmac-root");
  if (!root || root.dataset.bound === "1") return;
  root.dataset.bound = "1";

  const bodyNode = document.getElementById("shmac-body");
  const headerNode = document.getElementById("shmac-header");
  const secretNode = document.getElementById("shmac-secret");
  if (!(bodyNode instanceof HTMLTextAreaElement)) return;
  if (!(headerNode instanceof HTMLInputElement)) return;
  if (!(secretNode instanceof HTMLInputElement)) return;
  const bodyInput: HTMLTextAreaElement = bodyNode;
  const headerInput: HTMLInputElement = headerNode;
  const secretInput: HTMLInputElement = secretNode;

  const statusEl = document.getElementById("shmac-status");
  const errorEl = document.getElementById("shmac-error");
  const verdictEl = document.getElementById("shmac-verdict");
  const verdictLabel = document.getElementById("shmac-verdict-label");
  const verdictNote = document.getElementById("shmac-verdict-note");
  const computedEl = document.getElementById("shmac-computed");
  const suppliedEl = document.getElementById("shmac-supplied");
  const signalsEl = document.getElementById("shmac-signals");
  const causesEl = document.getElementById("shmac-causes");
  const copyBtn = document.getElementById("shmac-copy");
  const copyLabel = document.getElementById("shmac-copy-label");
  const clearBtn = document.getElementById("shmac-clear");
  const toggleBtn = document.getElementById("shmac-secret-toggle");
  const toggleLabel = document.getElementById("shmac-secret-toggle-label");
  const bodyLabel = document.getElementById("shmac-body-label");
  const headerGroup = document.getElementById("shmac-header-group");
  const schemeEl = document.getElementById("shmac-scheme");
  const suppliedLabel = document.getElementById("shmac-supplied-label");
  const modeButtons =
    root.querySelectorAll<HTMLButtonElement>("[data-shmac-mode]");
  let mode: Mode = "webhook";
  const icons: Record<IconKey, HTMLElement | null> = {
    idle: document.getElementById("shmac-icon-idle"),
    pass: document.getElementById("shmac-icon-pass"),
    fail: document.getElementById("shmac-icon-fail"),
  };

  function setStatus(text: string): void {
    if (statusEl) statusEl.textContent = text;
  }

  function setError(message: string | null): void {
    if (!errorEl) return;
    errorEl.textContent = message ?? "";
    errorEl.hidden = message === null;
  }

  function setVerdict(state: Verdict, label: string, note: string): void {
    if (verdictEl) {
      verdictEl.classList.remove(...TONE_CLASSES);
      verdictEl.classList.add(VERDICT_TONE[state]);
    }
    if (verdictLabel) verdictLabel.textContent = label;
    if (verdictNote) verdictNote.textContent = note;

    const shown = VERDICT_ICON[state];
    for (const key of ICON_KEYS) {
      icons[key]?.classList.toggle("hidden", key !== shown);
    }
    if (causesEl) causesEl.hidden = state !== "fail";
  }

  function renderSignals(signals: Signal[]): void {
    if (!signalsEl) return;
    signalsEl.replaceChildren();
    for (const signal of signals) {
      const li = document.createElement("li");
      li.className = "flex items-start gap-2";

      const marker = document.createElement("span");
      marker.className = "mono mt-px shrink-0 text-[11px] font-bold";
      marker.setAttribute("aria-hidden", "true");
      marker.textContent = signal.level === "warn" ? "▲" : "▪";

      const text = document.createElement("span");
      text.className =
        signal.level === "warn" ? "font-bold" : "font-medium opacity-80";
      text.textContent = signal.text;

      li.append(marker, text);
      signalsEl.append(li);
    }
  }

  // crypto.subtle is undefined outside a secure context (https or localhost).
  const subtle: SubtleCrypto | undefined =
    typeof crypto === "undefined" ? undefined : crypto.subtle;

  if (!subtle) {
    bodyInput.readOnly = true;
    headerInput.readOnly = true;
    secretInput.disabled = true;
    setStatus("Web Crypto unavailable");
    setVerdict(
      "error",
      "Cannot compute",
      "The Web Crypto API is not available on this page.",
    );
    setError(
      "crypto.subtle is only exposed in a secure context. Load this page over https:// or from localhost and the verifier will work.",
    );
    return;
  }

  const webcrypto = subtle;

  async function sign(secret: string, message: string): Promise<Uint8Array> {
    const key = await webcrypto.importKey(
      "raw",
      ENCODER.encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false, // Not extractable. The key material never comes back out.
      ["sign"],
    );
    const signature = await webcrypto.sign(
      "HMAC",
      key,
      ENCODER.encode(message),
    );
    return new Uint8Array(signature);
  }

  async function computeDigest(secret: string, body: string): Promise<string> {
    return toBase64(await sign(secret, body));
  }

  const MODE_COPY: Record<
    Mode,
    { label: string; placeholder: string; scheme: string; supplied: string }
  > = {
    webhook: {
      label: "Raw request body",
      placeholder:
        "Paste the body exactly as it arrived, no reformatting, no trailing newline",
      scheme: "HMAC-SHA256 · base64 · recomputed as you type",
      supplied: "From the header",
    },
    proxy: {
      label: "App proxy request URL or query string",
      placeholder:
        "https://shop.example.com/apps/proxy/path?shop=...&timestamp=...&signature=...",
      scheme: "HMAC-SHA256 · hex · sorted params, no separator",
      supplied: "From the signature param",
    },
    oauth: {
      label: "OAuth, install or admin link URL or query string",
      placeholder:
        "https://your-app.example.com/auth/callback?code=...&hmac=...&shop=...&timestamp=...",
      scheme: "HMAC-SHA256 · hex · sorted params joined with &",
      supplied: "From the hmac param",
    },
  };

  function applyMode(next: Mode): void {
    mode = next;
    const copy = MODE_COPY[next];
    if (bodyLabel) bodyLabel.textContent = copy.label;
    bodyInput.placeholder = copy.placeholder;
    bodyInput.rows = next === "webhook" ? 7 : 4;
    if (headerGroup) headerGroup.hidden = next !== "webhook";
    if (schemeEl) schemeEl.textContent = copy.scheme;
    if (suppliedLabel) suppliedLabel.textContent = copy.supplied;
    modeButtons.forEach((btn) => {
      const on = btn.dataset.shmacMode === next;
      btn.setAttribute("aria-pressed", on ? "true" : "false");
      btn.classList.toggle("bg-ink", on);
      btn.classList.toggle("text-bg", on);
      btn.classList.toggle("bg-bg-alt", !on);
    });
    root!
      .querySelectorAll<HTMLElement>("[data-shmac-example]")
      .forEach((el) => {
        el.hidden = el.dataset.shmacExample !== next;
      });
  }

  async function runQuery(mine: number, scheme: "proxy" | "oauth") {
    const raw = bodyInput.value;
    const secret = secretInput.value;
    const parsed = parseQuery(raw, scheme);
    const sigName = scheme === "proxy" ? "signature" : "hmac";
    if (suppliedEl) suppliedEl.textContent = parsed.supplied || "—";

    const signals: Signal[] = [];
    if (raw.trim() === "") {
      signals.length = 0;
    } else {
      signals.push({
        level: parsed.keys.length ? "ok" : "warn",
        text: parsed.keys.length
          ? `Signed message (${parsed.keys.length} params, sorted): ${parsed.message}`
          : "No query parameters found. Paste the full URL or everything after the ?.",
      });
      if (!parsed.supplied) {
        signals.push({
          level: "warn",
          text: `No ${sigName} parameter in the query, so there is nothing to compare against.`,
        });
      } else if (!HEX_DIGEST.test(parsed.supplied)) {
        signals.push({
          level: "warn",
          text: `The ${sigName} value is not 64 hex characters, so it is not an HMAC-SHA256 hex digest.`,
        });
      }
      if (scheme === "proxy" && parsed.keys.includes("hmac")) {
        signals.push({
          level: "warn",
          text: "This query has an hmac param. That looks like an OAuth or admin link, so try the OAuth mode.",
        });
      }
      if (
        scheme === "oauth" &&
        raw.includes("signature=") &&
        !raw.includes("hmac=")
      ) {
        signals.push({
          level: "warn",
          text: "This query has a signature param and no hmac. That looks like an app proxy request, so try the app proxy mode.",
        });
      }
      const ts = Number(
        new URLSearchParams(raw.slice(raw.indexOf("?") + 1)).get("timestamp"),
      );
      if (Number.isFinite(ts) && ts > 0) {
        const age = Math.round(Date.now() / 1000 - ts);
        if (Math.abs(age) > 300) {
          signals.push({
            level: "warn",
            text: `The timestamp is ${Math.round(Math.abs(age) / 60)} minutes ${age > 0 ? "old" : "in the future"}. The signature can still be valid, but your server should reject stale requests to stop replays.`,
          });
        }
      }
    }

    if (secret === "") {
      if (computedEl) computedEl.textContent = "—";
      setError(null);
      setStatus("Waiting for a secret");
      setVerdict(
        "idle",
        "Awaiting input",
        "Add the app client secret. It is the HMAC key, so nothing can be computed without it.",
      );
      renderSignals(signals);
      return;
    }

    let digest: string;
    try {
      digest = toHex(await sign(secret, parsed.message));
    } catch (err) {
      if (mine !== token) return;
      setStatus("Failed");
      setVerdict(
        "error",
        "Cannot compute",
        "Web Crypto refused to sign with this input.",
      );
      setError(`HMAC computation failed: ${messageOf(err)}.`);
      renderSignals([]);
      return;
    }
    if (mine !== token) return;
    setError(null);
    if (computedEl) computedEl.textContent = digest;

    if (!parsed.supplied) {
      setStatus("Digest computed");
      setVerdict(
        "info",
        "Digest computed",
        `There is no ${sigName} param to compare against yet. Paste the full URL as it arrived.`,
      );
      renderSignals(signals);
      return;
    }

    const supplied = parsed.supplied.toLowerCase();
    if (constantTimeEqual(ENCODER.encode(digest), ENCODER.encode(supplied))) {
      setStatus("Verified");
      setVerdict(
        "pass",
        "Signature valid",
        `The computed digest matches the ${sigName} param. Shopify signed these exact parameters with this secret.`,
      );
      renderSignals(signals);
      return;
    }

    setStatus("Mismatch");
    setVerdict(
      "fail",
      "Signature mismatch",
      `The digest computed from these parameters and this secret is not the ${sigName} value. Check the secret, and paste the URL exactly as it arrived.`,
    );
    renderSignals(signals);
  }

  let token = 0;
  let debounceId = 0;

  async function run(): Promise<void> {
    const mine = ++token;
    if (mode !== "webhook") {
      await runQuery(mine, mode);
      return;
    }
    const body = bodyInput.value;
    const rawHeader = headerInput.value;
    const header = rawHeader.trim();
    const secret = secretInput.value;

    if (suppliedEl) suppliedEl.textContent = header === "" ? "—" : header;

    if (secret === "") {
      if (computedEl) computedEl.textContent = "—";
      setError(null);
      setStatus("Waiting for a secret");
      setVerdict(
        "idle",
        "Awaiting input",
        "Add the app client secret — it is the HMAC key, so nothing can be computed without it.",
      );
      renderSignals(
        body === "" && header === ""
          ? []
          : [...describeBody(body), ...describeHeader(rawHeader, header)],
      );
      return;
    }

    let digest: string;
    try {
      digest = await computeDigest(secret, body);
    } catch (err) {
      if (mine !== token) return;
      if (computedEl) computedEl.textContent = "—";
      setStatus("Failed");
      setVerdict(
        "error",
        "Cannot compute",
        "Web Crypto refused to sign with this input.",
      );
      setError(`HMAC computation failed: ${messageOf(err)}.`);
      renderSignals([]);
      return;
    }
    if (mine !== token) return;

    setError(null);
    if (computedEl) computedEl.textContent = digest;

    const signals = [
      ...describeBody(body),
      ...describeHeader(rawHeader, header),
    ];

    if (header === "") {
      setStatus("Digest computed");
      setVerdict(
        "info",
        "Digest computed",
        "There is no header to compare against yet. Paste the X-Shopify-Hmac-Sha256 value and this becomes a pass or a fail.",
      );
      renderSignals(signals);
      return;
    }

    const matches = constantTimeEqual(
      ENCODER.encode(digest),
      ENCODER.encode(header),
    );

    if (matches) {
      setStatus("Verified");
      setVerdict(
        "pass",
        "Signature valid",
        "The computed digest matches the header. This body was signed with this secret and not one byte of it changed in transit.",
      );
      renderSignals(signals);
      return;
    }

    const at = firstDifference(digest, header);
    signals.unshift({
      level: "warn",
      text:
        at === -1
          ? "The two values differ in length but share every compared character."
          : `Digests diverge at character ${at + 1} of ${digest.length}. (Shown for debugging only — the pass/fail decision above came from the constant-time loop, which never reveals this.)`,
    });

    setStatus("Mismatch");
    setVerdict(
      "fail",
      "Signature mismatch",
      "The digest computed from this body and secret is not the value in the header. Something below differs from what Shopify actually signed.",
    );
    renderSignals(signals);
  }

  function schedule(): void {
    window.clearTimeout(debounceId);
    debounceId = window.setTimeout(() => void run(), DEBOUNCE_MS);
  }

  bodyInput.addEventListener("input", schedule);
  headerInput.addEventListener("input", schedule);
  secretInput.addEventListener("input", schedule);

  modeButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const next = btn.dataset.shmacMode;
      if (next !== "webhook" && next !== "proxy" && next !== "oauth") return;
      if (next === mode) return;
      applyMode(next);
      bodyInput.value = "";
      headerInput.value = "";
      window.clearTimeout(debounceId);
      void run();
    });
  });

  root.querySelectorAll<HTMLElement>("[data-shmac-body]").forEach((btn) => {
    btn.addEventListener("click", () => {
      bodyInput.value = btn.dataset.shmacBody ?? "";
      headerInput.value = btn.dataset.shmacHeader ?? "";
      secretInput.value = btn.dataset.shmacSecret ?? "";
      window.clearTimeout(debounceId);
      void run();
    });
  });

  clearBtn?.addEventListener("click", () => {
    bodyInput.value = "";
    headerInput.value = "";
    secretInput.value = "";
    window.clearTimeout(debounceId);
    void run();
    bodyInput.focus();
  });

  toggleBtn?.addEventListener("click", () => {
    const reveal = secretInput.type === "password";
    secretInput.type = reveal ? "text" : "password";
    toggleBtn.setAttribute("aria-pressed", reveal ? "true" : "false");
    if (toggleLabel) toggleLabel.textContent = reveal ? "Hide" : "Show";
  });

  copyBtn?.addEventListener("click", async () => {
    if (!computedEl) return;
    const value = (computedEl.textContent ?? "").trim();
    const reset = (text: string): void => {
      if (!copyLabel) return;
      copyLabel.textContent = text;
      window.setTimeout(() => {
        copyLabel.textContent = "Copy";
      }, COPY_RESET_MS);
    };
    if (value === "" || value === "—") {
      reset("Nothing yet");
      return;
    }
    try {
      await navigator.clipboard.writeText(value);
      reset("Copied!");
    } catch {
      selectContents(computedEl);
      reset("Selected");
    }
  });

  applyMode("webhook");
  void run();
}

init();
document.addEventListener("astro:after-swap", init);

export {};
