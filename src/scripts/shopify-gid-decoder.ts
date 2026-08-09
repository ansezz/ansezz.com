// Shopify GraphQL global ID (GID) decoder / builder.
// Parses gid://<namespace>/<Type>/<id> plus any query params, decodes the
// legacy base64 form the Storefront API returned before API version 2022-04
// (UTF-8 safe: atob -> bytes -> TextDecoder in fatal mode), lifts numeric IDs
// out of Shopify admin URLs, and converts newline-separated lists in bulk.
// Pure string work in the browser — no network calls, no dependencies.

type Source = "gid" | "base64" | "admin-url" | "numeric";

interface GidParam {
  key: string;
  value: string;
}

interface Analysis {
  source: Source;
  namespace: string;
  type: string;
  id: string;
  rawQuery: string;
  params: GidParam[];
  canonical: string;
  notes: string[];
}

type Result<T> = { ok: true; value: T } | { ok: false; error: string };

// Types the builder offers, plus a wider set used only to decide whether a
// parsed type deserves a "check the spelling" note. Shopify has hundreds more —
// an unknown name here is a nudge, never an error.
const KNOWN_TYPES = [
  "Product",
  "ProductVariant",
  "Order",
  "Customer",
  "Collection",
  "DraftOrder",
  "Fulfillment",
  "InventoryItem",
  "InventoryLevel",
  "Location",
  "Metafield",
  "MediaImage",
  "Shop",
  "DiscountCodeNode",
  "PriceRule",
  "Refund",
  "AppSubscription",
  "Company",
  "Market",
  "App",
  "AppSubscriptionLineItem",
  "Article",
  "Blog",
  "Cart",
  "Checkout",
  "CompanyLocation",
  "DeliveryProfile",
  "DiscountAutomaticNode",
  "DraftOrderLineItem",
  "FulfillmentOrder",
  "FulfillmentService",
  "GiftCard",
  "Image",
  "LineItem",
  "Menu",
  "Metaobject",
  "MetaobjectDefinition",
  "Model3d",
  "OnlineStoreTheme",
  "OrderTransaction",
  "Page",
  "Payout",
  "ProductImage",
  "Publication",
  "Return",
  "Segment",
  "SellingPlan",
  "SellingPlanGroup",
  "StaffMember",
  "SubscriptionContract",
  "UrlRedirect",
  "Video",
];

// Admin URL path segment -> GraphQL type. The last match in the path wins, so
// /products/1/variants/2 resolves to ProductVariant 2.
const ADMIN_PATH_TYPES: Record<string, string> = {
  products: "Product",
  variants: "ProductVariant",
  orders: "Order",
  draft_orders: "DraftOrder",
  customers: "Customer",
  collections: "Collection",
  companies: "Company",
  locations: "Location",
  price_rules: "PriceRule",
  discounts: "DiscountCodeNode",
  inventory_items: "InventoryItem",
  fulfillments: "Fulfillment",
};

const BINARY_CHUNK = 0x8000;
const BASE64_ALPHABET = /^[A-Za-z0-9+/_-]+={0,2}$/;

/* ── base64 (UTF-8 safe) ─────────────────────────────────── */

function bytesToBinary(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += BINARY_CHUNK) {
    binary += String.fromCharCode(
      ...Array.from(bytes.subarray(i, i + BINARY_CHUNK)),
    );
  }
  return binary;
}

function encodeBase64(text: string): string {
  return btoa(bytesToBinary(new TextEncoder().encode(text)));
}

// Accepts the standard and URL-safe alphabets, padded or not. Returns null on
// anything that isn't decodable UTF-8 — callers turn that into a message.
function decodeBase64(raw: string): string | null {
  const normalized = raw
    .replace(/-/g, "+")
    .replace(/_/g, "/")
    .replace(/=+$/, "");
  if (normalized.length % 4 === 1) return null;
  const padding = (4 - (normalized.length % 4)) % 4;
  let binary: string;
  try {
    binary = atob(normalized.padEnd(normalized.length + padding, "="));
  } catch {
    return null;
  }
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
}

function looksBase64(value: string): boolean {
  if (value.length < 8) return false;
  if (!BASE64_ALPHABET.test(value)) return false;
  return value.replace(/=+$/, "").length % 4 !== 1;
}

/* ── parsing ─────────────────────────────────────────────── */

function truncate(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max)}…` : value;
}

function plural(n: number, word: string): string {
  return n === 1 ? word : `${word}s`;
}

function buildNotes(a: Omit<Analysis, "notes" | "canonical">): string[] {
  const notes: string[] = [];

  if (a.source === "base64") {
    notes.push(
      "Input was base64. The Storefront API returned encoded IDs until API version 2022-04 — the plain form below is what current APIs use.",
    );
  }
  if (a.source === "admin-url") {
    notes.push(
      `Pulled out of an admin URL. The URL gives you the numeric ID for certain; the type (${a.type}) is this tool's mapping of the path segment — sanity-check it.`,
    );
  }
  if (a.namespace !== "shopify") {
    notes.push(
      `Namespace is "${a.namespace}", not "shopify". Every ID Shopify hands you uses the shopify namespace.`,
    );
  }
  if (a.type && a.type[0] !== a.type[0]?.toUpperCase()) {
    notes.push(
      `Resource types are PascalCase — "${a.type}" should almost certainly be "${a.type[0]?.toUpperCase() ?? ""}${a.type.slice(1)}". The API rejects the wrong case.`,
    );
  } else if (a.type && !KNOWN_TYPES.includes(a.type)) {
    notes.push(
      `"${a.type}" isn't in this tool's common-type list. Shopify has hundreds of types, so it may well be valid — but check the spelling before you query it.`,
    );
  }
  if (!/^\d+$/.test(a.id)) {
    notes.push(
      "The ID isn't numeric. That's normal for Cart, Checkout and a handful of other resources; for Product, Order or Customer it usually means the string got mangled.",
    );
  } else if (a.id.length > 1 && a.id.startsWith("0")) {
    notes.push(
      `Leading zero in "${a.id}". Shopify IDs are unsigned 64-bit integers with no padding, so this one is suspect.`,
    );
  }
  if (
    a.type === "InventoryLevel" &&
    !a.params.some((p) => p.key === "inventory_item_id")
  ) {
    notes.push(
      "InventoryLevel GIDs normally carry ?inventory_item_id=… — the level is the pair (location, inventory item), so the bare ID may not resolve.",
    );
  }
  if (a.params.length > 0) {
    notes.push(
      `Carries ${a.params.length} query ${plural(a.params.length, "parameter")}. Those are part of the ID — strip them and the API may not find the resource.`,
    );
  }
  return notes;
}

function finalize(
  base: Omit<Analysis, "notes" | "canonical">,
): Result<Analysis> {
  const canonical = `gid://${base.namespace}/${base.type}/${base.id}${
    base.rawQuery ? `?${base.rawQuery}` : ""
  }`;
  return { ok: true, value: { ...base, canonical, notes: buildNotes(base) } };
}

function parseGid(value: string, source: Source): Result<Analysis> {
  if (/\s/.test(value)) {
    return {
      ok: false,
      error:
        "A GID can't contain whitespace. Strip the space, tab or newline in the middle of the string.",
    };
  }
  if (value.includes("#")) {
    return {
      ok: false,
      error:
        'A GID has no fragment — the "#" and everything after it isn\'t part of the ID. Something concatenated a URL onto it.',
    };
  }

  const lower = value.toLowerCase();
  if (!lower.startsWith("gid://")) {
    if (lower.startsWith("gid:/")) {
      return {
        ok: false,
        error: 'Missing a slash — the scheme is "gid://", with two.',
      };
    }
    return {
      ok: false,
      error: 'Not a GID: it has to start with "gid://".',
    };
  }

  const rest = value.slice("gid://".length);
  const queryAt = rest.indexOf("?");
  const path = queryAt === -1 ? rest : rest.slice(0, queryAt);
  const rawQuery = queryAt === -1 ? "" : rest.slice(queryAt + 1);
  const segments = path.split("/");

  if (segments.length < 3) {
    return {
      ok: false,
      error: `Expected gid://<namespace>/<Type>/<id> — found ${segments.length} ${plural(
        segments.length,
        "segment",
      )} after "gid://" instead of 3.`,
    };
  }
  if (segments.length > 3) {
    return {
      ok: false,
      error: `Too many path segments (${segments.length}). A GID is exactly namespace / type / id — a stray slash usually means a URL got pasted in.`,
    };
  }

  const [namespace, type, id] = segments;
  if (!namespace) {
    return {
      ok: false,
      error: 'The namespace segment is empty. Expected "shopify".',
    };
  }
  if (!type) {
    return {
      ok: false,
      error:
        'The resource type segment is empty. Expected something like "Product".',
    };
  }
  if (!id) {
    return {
      ok: false,
      error: "The ID segment is empty — the GID stops after the resource type.",
    };
  }

  const params = Array.from(
    new URLSearchParams(rawQuery).entries(),
    ([key, value_]) => ({ key, value: value_ }),
  );

  return finalize({ source, namespace, type, id, rawQuery, params });
}

function fromAdminUrl(value: string): { type: string; id: string } | null {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  const host = url.hostname.toLowerCase();
  if (host !== "admin.shopify.com" && !host.endsWith(".myshopify.com")) {
    return null;
  }

  const segments = url.pathname.split("/").filter(Boolean);
  let found: { type: string; id: string } | null = null;
  for (let i = 0; i < segments.length - 1; i += 1) {
    const type = ADMIN_PATH_TYPES[segments[i]];
    const next = segments[i + 1];
    if (type && /^\d+$/.test(next)) found = { type, id: next };
  }
  return found;
}

// One entry point for every accepted input shape. `numericType` is the type to
// assume for a bare numeric ID; pass null to reject those instead.
function analyze(raw: string, numericType: string | null): Result<Analysis> {
  const value = raw.trim();
  if (!value) {
    return { ok: false, error: "Nothing to parse yet." };
  }
  if (value.toLowerCase().startsWith("gid:")) {
    return parseGid(value, "gid");
  }

  const admin = fromAdminUrl(value);
  if (admin) {
    return finalize({
      source: "admin-url",
      namespace: "shopify",
      type: admin.type,
      id: admin.id,
      rawQuery: "",
      params: [],
    });
  }

  if (/^\d+$/.test(value)) {
    if (!numericType) {
      return {
        ok: false,
        error:
          "That's a bare numeric ID with no type attached. Use the builder below — pick the resource type and it becomes a GID.",
      };
    }
    return finalize({
      source: "numeric",
      namespace: "shopify",
      type: numericType,
      id: value,
      rawQuery: "",
      params: [],
    });
  }

  if (looksBase64(value)) {
    const decoded = decodeBase64(value);
    if (decoded === null) {
      return {
        ok: false,
        error:
          "Looks like base64, but it doesn't decode to text — check for a truncated ending or a stray character.",
      };
    }
    if (!decoded.toLowerCase().startsWith("gid:")) {
      return {
        ok: false,
        error: `Decoded from base64 fine, but the result isn't a GID — got "${truncate(decoded, 48)}".`,
      };
    }
    return parseGid(decoded.trim(), "base64");
  }

  if (/^https?:\/\//i.test(value)) {
    return {
      ok: false,
      error:
        "That's a URL, but not a Shopify admin URL with a recognised resource and numeric ID in the path.",
    };
  }

  return {
    ok: false,
    error:
      "Not recognised. Paste a GID (gid://shopify/Product/1234567890), a base64-encoded GID, a Shopify admin URL, or a bare numeric ID.",
  };
}

/* ── DOM helpers ─────────────────────────────────────────── */

function textareaById(id: string): HTMLTextAreaElement | null {
  const el = document.getElementById(id);
  return el instanceof HTMLTextAreaElement ? el : null;
}

function inputById(id: string): HTMLInputElement | null {
  const el = document.getElementById(id);
  return el instanceof HTMLInputElement ? el : null;
}

function selectById(id: string): HTMLSelectElement | null {
  const el = document.getElementById(id);
  return el instanceof HTMLSelectElement ? el : null;
}

function setText(el: HTMLElement | null, value: string): void {
  if (el) el.textContent = value;
}

function setMessage(el: HTMLElement | null, message: string | null): void {
  if (!el) return;
  el.hidden = message === null;
  el.textContent = message ?? "";
}

function wireCopy(
  buttonId: string,
  labelId: string,
  read: () => string,
  fallbackFocus?: HTMLTextAreaElement,
): void {
  const button = document.getElementById(buttonId);
  const label = document.getElementById(labelId);
  if (!(button instanceof HTMLButtonElement)) return;
  const idle = label?.textContent ?? "Copy";
  button.addEventListener("click", () => {
    const text = read();
    if (!text) return;
    void navigator.clipboard
      .writeText(text)
      .then(() => {
        if (!label) return;
        label.textContent = "Copied!";
        window.setTimeout(() => {
          label.textContent = idle;
        }, 1500);
      })
      .catch(() => {
        // Clipboard blocked or unavailable — let the user copy by hand.
        if (!fallbackFocus) return;
        fallbackFocus.focus();
        fallbackFocus.select();
      });
  });
}

function renderList(host: HTMLElement | null, items: string[]): void {
  if (!host) return;
  host.replaceChildren();
  for (const item of items) {
    const li = document.createElement("li");
    li.className = "flex gap-2 text-sm leading-snug";
    const marker = document.createElement("span");
    marker.textContent = "▸";
    marker.setAttribute("aria-hidden", "true");
    marker.className = "shrink-0 opacity-60";
    const body = document.createElement("span");
    body.textContent = item;
    li.append(marker, body);
    host.appendChild(li);
  }
}

function renderParams(host: HTMLElement | null, params: GidParam[]): void {
  if (!host) return;
  host.replaceChildren();
  for (const param of params) {
    const row = document.createElement("div");
    row.className = "flex flex-wrap gap-x-2 gap-y-0.5 font-mono text-sm";
    const key = document.createElement("span");
    key.className = "font-bold";
    key.textContent = `${param.key} =`;
    const value = document.createElement("span");
    value.className = "break-all";
    value.textContent = param.value === "" ? "(empty)" : param.value;
    row.append(key, value);
    host.appendChild(row);
  }
}

/* ── panel: decode ───────────────────────────────────────── */

function initDecoder(root: HTMLElement): void {
  const input = textareaById("shopify-gid-input");
  if (!input) return;

  const errorEl = document.getElementById("shopify-gid-error");
  const sourceEl = document.getElementById("shopify-gid-source");
  const namespaceEl = document.getElementById("shopify-gid-namespace");
  const typeEl = document.getElementById("shopify-gid-type");
  const legacyEl = document.getElementById("shopify-gid-legacy");
  const paramsEl = document.getElementById("shopify-gid-params");
  const paramsEmptyEl = document.getElementById("shopify-gid-params-empty");
  const notesEl = document.getElementById("shopify-gid-notes");
  const notesWrap = document.getElementById("shopify-gid-notes-wrap");
  const plainEl = textareaById("shopify-gid-plain");
  const b64El = textareaById("shopify-gid-b64");

  const SOURCE_LABEL: Record<Source, string> = {
    gid: "Plain GID",
    base64: "Base64-encoded GID",
    "admin-url": "Shopify admin URL",
    numeric: "Numeric legacy ID",
  };

  function clear(): void {
    setText(sourceEl, "—");
    setText(namespaceEl, "—");
    setText(typeEl, "—");
    setText(legacyEl, "—");
    renderParams(paramsEl, []);
    setMessage(paramsEmptyEl, "—");
    renderList(notesEl, []);
    if (notesWrap) notesWrap.hidden = true;
    if (plainEl) plainEl.value = "";
    if (b64El) b64El.value = "";
  }

  function render(): void {
    const raw = input?.value ?? "";
    if (!raw.trim()) {
      setMessage(errorEl, null);
      clear();
      return;
    }

    const result = analyze(raw, null);
    if (!result.ok) {
      setMessage(errorEl, result.error);
      clear();
      return;
    }

    const a = result.value;
    setMessage(errorEl, null);
    setText(sourceEl, SOURCE_LABEL[a.source]);
    setText(namespaceEl, a.namespace);
    setText(typeEl, a.type);
    setText(legacyEl, a.id);
    renderParams(paramsEl, a.params);
    setMessage(paramsEmptyEl, a.params.length ? null : "none");
    renderList(notesEl, a.notes);
    if (notesWrap) notesWrap.hidden = a.notes.length === 0;
    if (plainEl) plainEl.value = a.canonical;
    if (b64El) b64El.value = encodeBase64(a.canonical);
  }

  input.addEventListener("input", render);

  root
    .querySelectorAll<HTMLButtonElement>("[data-shopify-gid-preset]")
    .forEach((button) => {
      button.addEventListener("click", () => {
        input.value = button.dataset.shopifyGidPreset ?? "";
        render();
      });
    });

  wireCopy(
    "shopify-gid-plain-copy",
    "shopify-gid-plain-copy-label",
    () => plainEl?.value ?? "",
    plainEl ?? undefined,
  );
  wireCopy(
    "shopify-gid-b64-copy",
    "shopify-gid-b64-copy-label",
    () => b64El?.value ?? "",
    b64El ?? undefined,
  );

  render();
}

/* ── panel: build ────────────────────────────────────────── */

function initBuilder(): void {
  const typeEl = selectById("shopify-gid-build-type");
  const idEl = inputById("shopify-gid-build-id");
  const queryEl = inputById("shopify-gid-build-query");
  const outEl = textareaById("shopify-gid-build-out");
  const b64El = textareaById("shopify-gid-build-b64");
  if (!typeEl || !idEl || !queryEl || !outEl || !b64El) return;

  const errorEl = document.getElementById("shopify-gid-build-error");

  function render(): void {
    if (!typeEl || !idEl || !queryEl || !outEl || !b64El) return;
    const id = idEl.value.trim();
    const query = queryEl.value.trim().replace(/^\?/, "");

    if (!id) {
      setMessage(errorEl, null);
      outEl.value = "";
      b64El.value = "";
      return;
    }
    if (/[\s/?#]/.test(id)) {
      setMessage(
        errorEl,
        'The ID can\'t contain a space, "/", "?" or "#". Paste just the identifier — query parameters go in the field next to it.',
      );
      outEl.value = "";
      b64El.value = "";
      return;
    }
    if (query.includes("#") || /\s/.test(query)) {
      setMessage(
        errorEl,
        'Query parameters can\'t contain whitespace or "#". Use the form key=value&key2=value2.',
      );
      outEl.value = "";
      b64El.value = "";
      return;
    }

    const gid = `gid://shopify/${typeEl.value}/${id}${query ? `?${query}` : ""}`;
    const parsed = parseGid(gid, "gid");
    if (!parsed.ok) {
      setMessage(errorEl, parsed.error);
      outEl.value = "";
      b64El.value = "";
      return;
    }

    setMessage(
      errorEl,
      /^\d+$/.test(id)
        ? null
        : "Heads up: that ID isn't numeric. Valid for Cart and Checkout, unusual anywhere else.",
    );
    outEl.value = parsed.value.canonical;
    b64El.value = encodeBase64(parsed.value.canonical);
  }

  typeEl.addEventListener("change", render);
  idEl.addEventListener("input", render);
  queryEl.addEventListener("input", render);

  wireCopy(
    "shopify-gid-build-copy",
    "shopify-gid-build-copy-label",
    () => outEl.value,
    outEl,
  );
  wireCopy(
    "shopify-gid-build-b64-copy",
    "shopify-gid-build-b64-copy-label",
    () => b64El.value,
    b64El,
  );

  render();
}

/* ── panel: bulk ─────────────────────────────────────────── */

const BULK_MODES = ["id", "gid", "base64"] as const;
type BulkMode = (typeof BULK_MODES)[number];

function isBulkMode(value: string): value is BulkMode {
  return (BULK_MODES as readonly string[]).includes(value);
}

function convertLine(
  line: string,
  mode: BulkMode,
  numericType: string,
): Result<string> {
  const result = analyze(line, numericType);
  if (!result.ok) return result;
  const a = result.value;
  if (mode === "id") return { ok: true, value: a.id };
  if (mode === "gid") return { ok: true, value: a.canonical };
  return { ok: true, value: encodeBase64(a.canonical) };
}

function initBulk(root: HTMLElement): void {
  const input = textareaById("shopify-gid-bulk-input");
  const output = textareaById("shopify-gid-bulk-output");
  const typeEl = selectById("shopify-gid-bulk-type");
  if (!input || !output || !typeEl) return;

  const statusEl = document.getElementById("shopify-gid-bulk-status");
  const modeButtons = Array.from(
    root.querySelectorAll<HTMLButtonElement>("[data-shopify-gid-bulk-mode]"),
  );

  let mode: BulkMode = "id";

  function render(): void {
    if (!input || !output || !typeEl) return;
    const lines = input.value.split(/\r?\n/);
    const converted: string[] = [];
    const failures: { line: number; reason: string }[] = [];
    let ok = 0;
    let total = 0;

    lines.forEach((line, index) => {
      if (!line.trim()) {
        converted.push("");
        return;
      }
      total += 1;
      const result = convertLine(line, mode, typeEl.value);
      if (result.ok) {
        converted.push(result.value);
        ok += 1;
      } else {
        converted.push("");
        failures.push({ line: index + 1, reason: result.error });
      }
    });

    // Trailing blank lines would look like silent failures — drop them.
    while (converted.length > 0 && converted[converted.length - 1] === "") {
      converted.pop();
    }
    output.value = converted.join("\n");

    if (total === 0) {
      setText(statusEl, "Paste one ID per line.");
      return;
    }
    if (failures.length === 0) {
      setText(
        statusEl,
        `${ok} of ${total} ${plural(total, "line")} converted.`,
      );
      return;
    }
    const named = failures
      .slice(0, 2)
      .map((f) => `line ${f.line}: ${f.reason}`)
      .join(" · ");
    const more =
      failures.length > 2 ? ` · and ${failures.length - 2} more.` : "";
    setText(
      statusEl,
      `${ok} of ${total} ${plural(total, "line")} converted. Failed rows are left blank so the order still lines up — ${named}${more}`,
    );
  }

  function setMode(next: BulkMode): void {
    mode = next;
    for (const button of modeButtons) {
      const active = button.dataset.shopifyGidBulkMode === next;
      button.setAttribute("aria-pressed", active ? "true" : "false");
      button.classList.toggle("bg-yellow", active);
      button.classList.toggle("bg-paper", !active);
    }
  }

  for (const button of modeButtons) {
    button.addEventListener("click", () => {
      const next = button.dataset.shopifyGidBulkMode ?? "";
      if (!isBulkMode(next)) return;
      setMode(next);
      render();
    });
  }

  input.addEventListener("input", render);
  typeEl.addEventListener("change", render);

  wireCopy(
    "shopify-gid-bulk-copy",
    "shopify-gid-bulk-copy-label",
    () => output.value,
    output,
  );

  setMode("id");
  render();
}

/* ── boot ────────────────────────────────────────────────── */

function init(): void {
  const root = document.getElementById("shopify-gid-root");
  if (!root || root.dataset.bound === "1") return;
  root.dataset.bound = "1";

  initDecoder(root);
  initBuilder();
  initBulk(root);
}

init();
document.addEventListener("astro:after-swap", init);

export {};
