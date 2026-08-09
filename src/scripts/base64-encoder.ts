// UTF-8 safe base64 encode/decode. Encoding goes string -> TextEncoder bytes ->
// binary string -> btoa (naive btoa() throws above U+00FF and silently emits
// Latin-1 bytes between U+0080 and U+00FF). Decoding reverses it: atob ->
// Uint8Array -> TextDecoder in fatal mode, so bad UTF-8 surfaces as an error.
// Also builds data: URIs from a local file via FileReader. Nothing is uploaded.

type Direction = "encode" | "decode";

type DecodeResult =
  | { ok: true; text: string; bytes: number }
  | { ok: false; message: string };

const BINARY_CHUNK = 0x8000;
const FILE_WARN_BYTES = 100 * 1024;
const FILE_MAX_BYTES = 5 * 1024 * 1024;

function fmt(n: number): string {
  return n.toLocaleString("en-US");
}

function plural(n: number, word: string): string {
  return n === 1 ? word : `${word}s`;
}

function fmtBytes(n: number): string {
  if (n < 1024) return `${fmt(n)} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

function bytesToBinary(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += BINARY_CHUNK) {
    binary += String.fromCharCode(
      ...Array.from(bytes.subarray(i, i + BINARY_CHUNK)),
    );
  }
  return binary;
}

function toUrlSafe(b64: string): string {
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function encodeText(text: string, urlSafe: boolean): string {
  const b64 = btoa(bytesToBinary(new TextEncoder().encode(text)));
  return urlSafe ? toUrlSafe(b64) : b64;
}

// Accepts both alphabets (standard and base64url) and any whitespace.
function decodeToText(raw: string): DecodeResult {
  const cleaned = raw.replace(/\s+/g, "");
  if (!cleaned) return { ok: true, text: "", bytes: 0 };

  const normalized = cleaned.replace(/-/g, "+").replace(/_/g, "/");
  const bad = normalized.match(/[^A-Za-z0-9+/=]/);
  if (bad) {
    return {
      ok: false,
      message: `"${bad[0]}" is not a base64 character. Allowed: A–Z a–z 0–9 + / (or - _ for base64url), plus = padding.`,
    };
  }

  const body = normalized.replace(/=+$/, "");
  if (body.includes("=")) {
    return {
      ok: false,
      message: "Padding (=) is only allowed at the very end of the string.",
    };
  }
  if (body.length % 4 === 1) {
    return {
      ok: false,
      message: `Truncated input — ${fmt(body.length)} base64 ${plural(body.length, "character")} can't map to whole bytes. Valid lengths leave a remainder of 0, 2 or 3 when divided by 4.`,
    };
  }

  const padding = (4 - (body.length % 4)) % 4;
  let binary: string;
  try {
    binary = atob(body.padEnd(body.length + padding, "="));
  } catch {
    return {
      ok: false,
      message:
        "The browser rejected this string as base64. Check for stray characters or a cut-off ending.",
    };
  }

  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return { ok: true, text, bytes: bytes.length };
  } catch {
    return {
      ok: false,
      message: `Decoded ${fmt(bytes.length)} ${plural(bytes.length, "byte")}, but the result isn't valid UTF-8 text — this payload is probably binary (an image, a key, a compressed blob) rather than a string.`,
    };
  }
}

function flashCopied(label: HTMLElement, original: string): void {
  label.textContent = "Copied!";
  window.setTimeout(() => {
    label.textContent = original;
  }, 1500);
}

function wireCopy(
  button: HTMLElement | null,
  label: HTMLElement | null,
  source: HTMLTextAreaElement,
): void {
  if (!button || !label) return;
  const original = label.textContent ?? "Copy";
  button.addEventListener("click", async () => {
    if (!source.value) return;
    try {
      await navigator.clipboard.writeText(source.value);
      flashCopied(label, original);
    } catch {
      source.select();
    }
  });
}

function textareaById(id: string): HTMLTextAreaElement | null {
  const el = document.getElementById(id);
  return el instanceof HTMLTextAreaElement ? el : null;
}

function inputById(id: string): HTMLInputElement | null {
  const el = document.getElementById(id);
  return el instanceof HTMLInputElement ? el : null;
}

interface Panes {
  textEl: HTMLTextAreaElement;
  b64El: HTMLTextAreaElement;
  urlSafeEl: HTMLInputElement;
}

function findPanes(): Panes | null {
  const textEl = textareaById("base64-text");
  const b64El = textareaById("base64-b64");
  const urlSafeEl = inputById("base64-urlsafe");
  if (!textEl || !b64El || !urlSafeEl) return null;
  return { textEl, b64El, urlSafeEl };
}

function init(): void {
  const root = document.getElementById("base64-root");
  if (!root || root.dataset.bound === "1") return;

  const panes = findPanes();
  if (!panes) return;
  const { textEl, b64El, urlSafeEl } = panes;
  root.dataset.bound = "1";

  const textStats = document.getElementById("base64-text-stats");
  const b64Stats = document.getElementById("base64-b64-stats");
  const errorEl = document.getElementById("base64-error");
  const dirButtons = Array.from(
    root.querySelectorAll<HTMLButtonElement>("[data-base64-dir]"),
  );

  let direction: Direction = "encode";

  function setError(message: string | null): void {
    if (!errorEl) return;
    errorEl.hidden = message === null;
    errorEl.textContent = message ?? "";
  }

  function setStat(el: HTMLElement | null, value: string): void {
    if (el) el.textContent = value;
  }

  function render(): void {
    if (direction === "encode") {
      const text = textEl.value;
      const bytes = new TextEncoder().encode(text).length;
      const output = encodeText(text, urlSafeEl.checked);
      b64El.value = output;
      setError(null);
      setStat(
        textStats,
        `${fmt(text.length)} characters · ${fmt(bytes)} bytes UTF-8`,
      );
      setStat(
        b64Stats,
        bytes === 0
          ? "0 characters"
          : `${fmt(output.length)} characters · +${Math.round(
              ((output.length - bytes) / bytes) * 100,
            )}% over the raw bytes`,
      );
      return;
    }

    const raw = b64El.value;
    const result = decodeToText(raw);
    setStat(b64Stats, `${fmt(raw.replace(/\s+/g, "").length)} characters in`);
    if (result.ok) {
      textEl.value = result.text;
      setError(null);
      setStat(
        textStats,
        `${fmt(result.text.length)} characters · ${fmt(result.bytes)} bytes decoded`,
      );
    } else {
      textEl.value = "";
      setError(result.message);
      setStat(textStats, "—");
    }
  }

  function setDirection(next: Direction): void {
    direction = next;
    for (const btn of dirButtons) {
      const active = btn.dataset.base64Dir === next;
      btn.setAttribute("aria-pressed", active ? "true" : "false");
      btn.classList.toggle("bg-yellow", active);
      btn.classList.toggle("bg-paper", !active);
    }
  }

  textEl.addEventListener("input", () => {
    setDirection("encode");
    render();
  });
  b64El.addEventListener("input", () => {
    setDirection("decode");
    render();
  });
  urlSafeEl.addEventListener("change", render);

  for (const btn of dirButtons) {
    btn.addEventListener("click", () => {
      const next = btn.dataset.base64Dir;
      if (next !== "encode" && next !== "decode") return;
      setDirection(next);
      render();
    });
  }

  root
    .querySelectorAll<HTMLButtonElement>("[data-base64-sample]")
    .forEach((btn) => {
      btn.addEventListener("click", () => {
        textEl.value = btn.dataset.base64Sample ?? "";
        setDirection("encode");
        render();
      });
    });

  document.getElementById("base64-clear")?.addEventListener("click", () => {
    textEl.value = "";
    b64El.value = "";
    setDirection("encode");
    render();
  });

  wireCopy(
    document.getElementById("base64-copy-text"),
    document.getElementById("base64-copy-text-label"),
    textEl,
  );
  wireCopy(
    document.getElementById("base64-copy-b64"),
    document.getElementById("base64-copy-b64-label"),
    b64El,
  );

  initFileToDataUri();

  setDirection("encode");
  render();
}

interface FilePanel {
  fileEl: HTMLInputElement;
  outEl: HTMLTextAreaElement;
}

function findFilePanel(): FilePanel | null {
  const fileEl = inputById("base64-file");
  const outEl = textareaById("base64-file-out");
  if (!fileEl || !outEl) return null;
  return { fileEl, outEl };
}

type Report = (value: string | null) => void;

function readAsDataUri(
  file: File,
  outEl: HTMLTextAreaElement,
  setMeta: Report,
  setWarn: Report,
): void {
  setMeta(`Reading ${file.name}…`);
  const reader = new FileReader();

  reader.onerror = () => {
    setMeta(`${file.name} · ${fmtBytes(file.size)}`);
    setWarn("Couldn't read that file — the browser refused it.");
  };

  reader.onload = () => {
    const result = reader.result;
    if (typeof result !== "string") {
      setMeta(`${file.name} · ${fmtBytes(file.size)}`);
      setWarn("Couldn't read that file as a data URI.");
      return;
    }
    outEl.value = result;
    const overhead = Math.round((result.length / file.size - 1) * 100);
    setMeta(
      `${file.name} · ${file.type || "application/octet-stream"} · ${fmtBytes(
        file.size,
      )} on disk → ${fmt(result.length)} characters as a data URI (+${overhead}%)`,
    );
    if (file.size > FILE_WARN_BYTES) {
      setWarn(
        "That's over 100 KB. An inline data URI can't be cached separately, can't be served from a CDN edge, and gets re-sent with every copy of the HTML or CSS that carries it. Link to the file instead.",
      );
    }
  };

  reader.readAsDataURL(file);
}

function initFileToDataUri(): void {
  const panel = findFilePanel();
  if (!panel) return;
  const { fileEl, outEl } = panel;

  const metaEl = document.getElementById("base64-file-meta");
  const warnEl = document.getElementById("base64-file-warn");

  const setMeta: Report = (value) => {
    if (metaEl) metaEl.textContent = value ?? "";
  };

  const setWarn: Report = (message) => {
    if (!warnEl) return;
    warnEl.hidden = message === null;
    warnEl.textContent = message ?? "";
  };

  fileEl.addEventListener("change", () => {
    const file =
      fileEl.files && fileEl.files.length > 0 ? fileEl.files[0] : null;
    outEl.value = "";
    setWarn(null);

    if (file === null) {
      setMeta("No file selected.");
      return;
    }
    if (file.size > FILE_MAX_BYTES) {
      setMeta(`${file.name} · ${fmtBytes(file.size)}`);
      setWarn(
        `Too big to inline. ${fmtBytes(file.size)} would produce roughly ${fmtBytes(
          Math.ceil(file.size / 3) * 4,
        )} of base64 text, so this tool caps at 5 MB. Serve a file that size as a normal cached asset.`,
      );
      return;
    }
    readAsDataUri(file, outEl, setMeta, setWarn);
  });

  wireCopy(
    document.getElementById("base64-file-copy"),
    document.getElementById("base64-file-copy-label"),
    outEl,
  );
}

init();
document.addEventListener("astro:after-swap", init);

export {};
