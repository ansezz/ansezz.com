// SHA-1 / SHA-256 / SHA-384 / SHA-512 digests computed locally with the Web
// Crypto API. Text is UTF-8 encoded with TextEncoder; a file is read into an
// ArrayBuffer and handed straight to crypto.subtle.digest(). Nothing is
// uploaded. MD5 is absent because Web Crypto deliberately does not implement it.
// With a key filled in, every row switches to HMAC with that hash
// (crypto.subtle.importKey + sign). The key is never stored or sent.

type Format = "hex" | "base64";
type KeyEncoding = "utf8" | "hex" | "base64";

/** Decodes the HMAC key field. Returns null when the encoding is invalid. */
function keyBytes(
  value: string,
  enc: KeyEncoding,
): Uint8Array<ArrayBuffer> | null {
  if (enc === "utf8") return new TextEncoder().encode(value);
  if (enc === "hex") {
    const clean = value.replace(/\s+/g, "").replace(/^0x/i, "");
    if (clean.length % 2 !== 0 || !/^[0-9a-f]*$/i.test(clean)) return null;
    const out = new Uint8Array(clean.length / 2);
    for (let i = 0; i < out.length; i += 1) {
      out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
    }
    return out;
  }
  try {
    const clean = value.trim().replace(/-/g, "+").replace(/_/g, "/");
    const binary = atob(clean);
    const out = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
    return out;
  } catch {
    return null;
  }
}

// crypto.subtle.digest() has no streaming interface, so the whole payload has
// to be resident in memory. Refuse politely past this instead of killing the tab.
const MAX_FILE_BYTES = 512 * 1024 * 1024;
const DEBOUNCE_MS = 150;
const BUSY_DELAY_MS = 120;
const COPY_RESET_MS = 1500;

const ENCODER = new TextEncoder();

function toHex(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i += 1) {
    out += bytes[i].toString(16).padStart(2, "0");
  }
  return out;
}

function toBase64(bytes: Uint8Array): string {
  // Digests top out at 64 bytes, so a straight loop is safe here.
  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function formatSize(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`;
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

function flash(label: HTMLElement | null, text: string): void {
  if (!label) return;
  const idle = label.dataset.idle ?? label.textContent ?? "Copy";
  label.dataset.idle = idle;
  label.textContent = text;
  window.setTimeout(() => {
    label.textContent = idle;
  }, COPY_RESET_MS);
}

function init(): void {
  const root = document.getElementById("hash-root");
  if (!root || root.dataset.bound === "1") return;
  root.dataset.bound = "1";

  const inputNode = document.getElementById("hash-input");
  const fileNode = document.getElementById("hash-file");
  if (!(inputNode instanceof HTMLTextAreaElement)) return;
  if (!(fileNode instanceof HTMLInputElement)) return;
  // Declared types, not narrowed ones — hoisted helpers below need them.
  const input: HTMLTextAreaElement = inputNode;
  const fileInput: HTMLInputElement = fileNode;

  const fileInfo = document.getElementById("hash-file-info");
  const clearBtn = document.getElementById("hash-file-clear");
  const statusEl = document.getElementById("hash-status");
  const errorEl = document.getElementById("hash-error");
  const base64Radio = document.getElementById("hash-format-base64");
  const keyInput = document.getElementById(
    "hash-key",
  ) as HTMLInputElement | null;
  const keyEnc = document.getElementById(
    "hash-key-enc",
  ) as HTMLSelectElement | null;
  const keyToggle = document.getElementById("hash-key-toggle");
  const titleEl = document.getElementById("hash-title");

  const rows = Array.from(
    root.querySelectorAll<HTMLElement>("[data-hash-row]"),
  );
  const algorithms = rows
    .map((row) => row.dataset.hashRow)
    .filter((name): name is string => typeof name === "string" && name !== "");

  function setStatus(text: string): void {
    if (statusEl) statusEl.textContent = text;
  }

  function setError(message: string | null): void {
    if (!errorEl) return;
    errorEl.textContent = message ?? "";
    errorEl.hidden = message === null;
  }

  function clearValues(placeholder: string): void {
    for (const row of rows) {
      const valueEl = row.querySelector<HTMLElement>("[data-hash-value]");
      if (valueEl) valueEl.textContent = placeholder;
    }
  }

  // crypto.subtle is undefined outside a secure context (https or localhost).
  const subtle: SubtleCrypto | undefined =
    typeof crypto === "undefined" ? undefined : crypto.subtle;

  if (!subtle) {
    input.readOnly = true;
    fileInput.disabled = true;
    clearValues("unavailable");
    setStatus("Web Crypto unavailable");
    setError(
      "crypto.subtle is not available on this page. The Web Crypto API is only exposed in a secure context — load this page over https:// or from localhost and it will work.",
    );
    return;
  }

  const digest = subtle;

  let fileBuffer: ArrayBuffer | null = null;
  let fileName = "";
  let cache: Map<string, Uint8Array> | null = null;
  let token = 0;
  let debounceId = 0;

  function currentFormat(): Format {
    return base64Radio instanceof HTMLInputElement && base64Radio.checked
      ? "base64"
      : "hex";
  }

  function render(): void {
    const format = currentFormat();
    for (const row of rows) {
      const algorithm = row.dataset.hashRow;
      const valueEl = row.querySelector<HTMLElement>("[data-hash-value]");
      if (!algorithm || !valueEl) continue;
      const bytes = cache?.get(algorithm);
      if (!bytes) {
        valueEl.textContent = "—";
        continue;
      }
      valueEl.textContent = format === "hex" ? toHex(bytes) : toBase64(bytes);
    }
  }

  function syncFileUi(): void {
    const hasFile = fileBuffer !== null;
    if (fileInfo) {
      fileInfo.textContent = hasFile
        ? `Hashing file: ${fileName} · ${formatSize(fileBuffer?.byteLength ?? 0)}`
        : "";
      fileInfo.hidden = !hasFile;
    }
    if (clearBtn) clearBtn.hidden = !hasFile;
    input.readOnly = hasFile;
    input.classList.toggle("opacity-50", hasFile);
  }

  async function run(): Promise<void> {
    const mine = ++token;
    const bytes: BufferSource = fileBuffer ?? ENCODER.encode(input.value);
    const label =
      fileBuffer !== null
        ? `${fileName} (${formatSize(bytes.byteLength)})`
        : `${formatSize(bytes.byteLength)} of text`;

    const busyTimer = window.setTimeout(() => {
      if (mine === token) setStatus("Hashing…");
    }, BUSY_DELAY_MS);

    const keyText = keyInput?.value ?? "";
    const hmac = keyText !== "";
    let key: Uint8Array<ArrayBuffer> | null = null;
    if (hmac) {
      key = keyBytes(keyText, (keyEnc?.value ?? "utf8") as KeyEncoding);
      if (!key || key.length === 0) {
        window.clearTimeout(busyTimer);
        cache = null;
        render();
        setError("That key is not valid for the chosen key encoding.");
        setStatus("Bad key");
        return;
      }
    }
    root!.querySelectorAll<HTMLElement>("[data-hash-name]").forEach((el) => {
      el.textContent = `${hmac ? "HMAC-" : ""}${el.dataset.hashName}`;
    });
    if (titleEl) titleEl.textContent = hmac ? "▸ HMAC tags" : "▸ Digests";

    try {
      const pairs = await Promise.all(
        algorithms.map(async (algorithm) => {
          if (key) {
            const k = await digest.importKey(
              "raw",
              key,
              { name: "HMAC", hash: algorithm },
              false,
              ["sign"],
            );
            const buffer = await digest.sign("HMAC", k, bytes);
            return [algorithm, new Uint8Array(buffer)] as const;
          }
          const buffer = await digest.digest(algorithm, bytes);
          return [algorithm, new Uint8Array(buffer)] as const;
        }),
      );
      if (mine !== token) return;
      cache = new Map(pairs);
      setError(null);
      render();
      setStatus(
        key ? `HMAC of ${label}, ${key.length}-byte key` : `Hashed ${label}`,
      );
    } catch (err) {
      if (mine !== token) return;
      cache = null;
      render();
      setError(`Could not hash that input: ${messageOf(err)}.`);
      setStatus("Failed");
    } finally {
      window.clearTimeout(busyTimer);
    }
  }

  function clearFile(rehash: boolean): void {
    token += 1; // Invalidate any in-flight file read or digest.
    fileBuffer = null;
    fileName = "";
    fileInput.value = "";
    syncFileUi();
    if (rehash) void run();
  }

  async function loadFile(file: File): Promise<void> {
    const mine = ++token;
    setStatus(`Reading ${file.name}…`);
    try {
      const buffer = await file.arrayBuffer();
      if (mine !== token) return;
      fileBuffer = buffer;
      fileName = file.name;
      setError(null);
      syncFileUi();
      await run();
    } catch (err) {
      if (mine !== token) return;
      fileInput.value = "";
      setError(`Could not read that file: ${messageOf(err)}.`);
      setStatus("Failed");
    }
  }

  function scheduleRun(): void {
    window.clearTimeout(debounceId);
    debounceId = window.setTimeout(() => void run(), DEBOUNCE_MS);
  }

  input.addEventListener("input", () => {
    if (input.readOnly) return;
    scheduleRun();
  });

  fileInput.addEventListener("change", () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    if (file.size > MAX_FILE_BYTES) {
      fileInput.value = "";
      setError(
        `That file is ${formatSize(file.size)}. Web Crypto has no streaming digest, so the whole file has to sit in memory — this page stops at ${formatSize(MAX_FILE_BYTES)}. Use shasum, certutil, or Get-FileHash for anything larger.`,
      );
      setStatus("File too large");
      return;
    }
    void loadFile(file);
  });

  clearBtn?.addEventListener("click", () => clearFile(true));
  keyInput?.addEventListener("input", scheduleRun);
  keyEnc?.addEventListener("change", () => void run());
  keyToggle?.addEventListener("click", () => {
    if (!keyInput) return;
    const reveal = keyInput.type === "password";
    keyInput.type = reveal ? "text" : "password";
    keyToggle.setAttribute("aria-pressed", reveal ? "true" : "false");
    keyToggle.textContent = reveal ? "Hide" : "Show";
  });

  root
    .querySelectorAll<HTMLInputElement>("[name='hash-format']")
    .forEach((el) => el.addEventListener("change", render));

  root.querySelectorAll<HTMLElement>("[data-hash-preset]").forEach((btn) =>
    btn.addEventListener("click", () => {
      clearFile(false);
      input.value = btn.dataset.hashPreset ?? "";
      window.clearTimeout(debounceId);
      void run();
    }),
  );

  for (const row of rows) {
    const button = row.querySelector<HTMLButtonElement>("[data-hash-copy]");
    const valueEl = row.querySelector<HTMLElement>("[data-hash-value]");
    if (!button || !valueEl) continue;
    const label = button.querySelector<HTMLElement>("[data-hash-copy-label]");
    button.addEventListener("click", async () => {
      const text = (valueEl.textContent ?? "").trim();
      if (text === "" || text === "—") {
        flash(label, "Nothing yet");
        return;
      }
      try {
        await navigator.clipboard.writeText(text);
        flash(label, "Copied!");
      } catch {
        selectContents(valueEl);
        flash(label, "Selected");
      }
    });
  }

  syncFileUi();
  void run();
}

init();
document.addEventListener("astro:after-swap", init);

export {};
