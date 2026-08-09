// URL parser / builder + percent-encoding playground.
// Parsing uses the WHATWG URL parser (the `URL` constructor), query editing
// uses `URLSearchParams`, encoding uses the four global encode/decode
// functions. No network, no dependencies. Every throw site is guarded.

const PART_KEYS = [
  "href",
  "origin",
  "protocol",
  "username",
  "password",
  "host",
  "hostname",
  "port",
  "pathname",
  "search",
  "hash",
] as const;

type PartKey = (typeof PART_KEYS)[number];

interface Parsed {
  url: URL | null;
  error: string | null;
}

interface ParamRow {
  key: string;
  value: string;
}

const CODEC_OPS = [
  "encodeURIComponent",
  "decodeURIComponent",
  "encodeURI",
  "decodeURI",
] as const;

type CodecOp = (typeof CODEC_OPS)[number];

const CODECS: Record<CodecOp, (input: string) => string> = {
  encodeURIComponent,
  decodeURIComponent,
  encodeURI,
  decodeURI,
};

function isCodecOp(value: string): value is CodecOp {
  return (CODEC_OPS as readonly string[]).includes(value);
}

// `new URL(relative, base)` succeeds where `new URL(relative)` throws — that
// tells us the user handed us a path rather than something truly malformed.
function parsesAgainstABase(value: string): boolean {
  try {
    const probe = new URL(value, "https://example.invalid/");
    return probe.href.length > 0;
  } catch {
    return false;
  }
}

function parseUrl(raw: string): Parsed {
  const value = raw.trim();
  if (!value) return { url: null, error: null };
  try {
    return { url: new URL(value), error: null };
  } catch {
    const hint = parsesAgainstABase(value)
      ? ' Looks relative — new URL() needs an absolute URL. Add a scheme, e.g. "https://".'
      : " Check the host for spaces or other forbidden characters.";
    return { url: null, error: `Invalid URL.${hint}` };
  }
}

function partValue(url: URL, key: PartKey): string {
  return url[key];
}

// Rejects (rather than throwing synchronously) when the Clipboard API is
// missing or blocked, so callers get one error path.
async function copyToClipboard(text: string): Promise<void> {
  await navigator.clipboard.writeText(text);
}

// decodeURIComponent throws URIError on malformed escapes; never let that
// bubble out of a render pass.
function safeDecode(value: string): string | null {
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
}

function makeInput(
  value: string,
  marker: "key" | "value",
  label: string,
): HTMLInputElement {
  const el = document.createElement("input");
  el.type = "text";
  el.value = value;
  el.spellcheck = false;
  el.autocomplete = "off";
  el.setAttribute("aria-label", label);
  el.dataset[marker === "key" ? "urlParserParamKey" : "urlParserParamValue"] =
    "1";
  el.className =
    "w-full rounded-[3px] border-[2.5px] border-ink bg-paper px-2.5 py-2 font-mono text-sm shadow-neo-xs focus:outline-none";
  return el;
}

function makeRow(key: string, value: string): HTMLTableRowElement {
  const tr = document.createElement("tr");
  tr.dataset.urlParserParamRow = "1";
  tr.className = "align-top";

  const keyCell = document.createElement("td");
  keyCell.className = "py-1.5 pr-2";
  keyCell.appendChild(makeInput(key, "key", "Parameter name"));

  const valueCell = document.createElement("td");
  valueCell.className = "py-1.5 pr-2";
  valueCell.appendChild(makeInput(value, "value", "Parameter value"));

  const actionCell = document.createElement("td");
  actionCell.className = "py-1.5";
  const remove = document.createElement("button");
  remove.type = "button";
  remove.dataset.urlParserParamRemove = "1";
  remove.setAttribute("aria-label", "Remove this parameter");
  remove.textContent = "×";
  remove.className =
    "inline-flex h-9 w-9 items-center justify-center rounded-[3px] border-[2.5px] border-ink bg-paper text-lg font-bold leading-none shadow-neo-xs transition-all hover:-translate-x-0.5 hover:-translate-y-0.5 hover:bg-red hover:shadow-neo-sm";
  actionCell.appendChild(remove);

  tr.append(keyCell, valueCell, actionCell);
  return tr;
}

function init(): void {
  const root = document.getElementById("url-parser-root");
  if (!root || root.dataset.bound === "1") return;

  const inputNode = document.getElementById("url-parser-input");
  const outputNode = document.getElementById("url-parser-output");
  const codecInputNode = document.getElementById("url-parser-codec-input");
  const codecOutputNode = document.getElementById("url-parser-codec-output");
  if (
    !(inputNode instanceof HTMLTextAreaElement) ||
    !(outputNode instanceof HTMLTextAreaElement) ||
    !(codecInputNode instanceof HTMLTextAreaElement) ||
    !(codecOutputNode instanceof HTMLTextAreaElement)
  ) {
    return;
  }
  root.dataset.bound = "1";

  // Re-bind with an explicit type: hoisted function declarations below do not
  // inherit control-flow narrowing from the guard above.
  const input: HTMLTextAreaElement = inputNode;
  const output: HTMLTextAreaElement = outputNode;
  const codecInput: HTMLTextAreaElement = codecInputNode;
  const codecOutput: HTMLTextAreaElement = codecOutputNode;

  const errorEl = document.getElementById("url-parser-error");
  const paramsBody = document.getElementById("url-parser-params");
  const paramsMsg = document.getElementById("url-parser-params-msg");
  const decodedRow = document.getElementById("url-parser-decoded-row");
  const decodedEl = document.getElementById("url-parser-part-decoded");
  const codecError = document.getElementById("url-parser-codec-error");
  const newKey = document.getElementById("url-parser-new-key");
  const newValue = document.getElementById("url-parser-new-value");

  function setError(message: string | null): void {
    if (!errorEl) return;
    errorEl.hidden = !message;
    errorEl.textContent = message ?? "";
  }

  function setParamsMessage(message: string | null): void {
    if (!paramsMsg) return;
    paramsMsg.hidden = !message;
    paramsMsg.textContent = message ?? "";
  }

  function setCodecError(message: string | null): void {
    if (!codecError) return;
    codecError.hidden = !message;
    codecError.textContent = message ?? "";
  }

  function renderParts(url: URL | null): void {
    for (const key of PART_KEYS) {
      const cell = document.getElementById(`url-parser-part-${key}`);
      if (!cell) continue;
      const raw = url ? partValue(url, key) : "";
      cell.textContent = raw === "" ? "(empty)" : raw;
      cell.classList.toggle("opacity-40", raw === "");
    }

    if (!decodedRow || !decodedEl) return;
    const decoded = url ? safeDecode(url.pathname) : null;
    const show = url !== null && decoded !== null && decoded !== url.pathname;
    decodedRow.hidden = !show;
    decodedEl.textContent = show && decoded !== null ? decoded : "—";
  }

  function renderOutput(url: URL | null): void {
    output.value = url ? url.href : "";
  }

  function readRows(): ParamRow[] {
    if (!paramsBody) return [];
    const rows = paramsBody.querySelectorAll("tr[data-url-parser-param-row]");
    return Array.from(rows, (row) => {
      const keyEl = row.querySelector("[data-url-parser-param-key]");
      const valueEl = row.querySelector("[data-url-parser-param-value]");
      return {
        key: keyEl instanceof HTMLInputElement ? keyEl.value : "",
        value: valueEl instanceof HTMLInputElement ? valueEl.value : "",
      };
    });
  }

  function renderParams(url: URL | null): void {
    if (!paramsBody) return;
    paramsBody.replaceChildren();
    if (!url) {
      setParamsMessage("Paste a URL above to see its query parameters.");
      return;
    }
    const entries = Array.from(url.searchParams.entries());
    for (const [key, value] of entries) {
      paramsBody.appendChild(makeRow(key, value));
    }
    setParamsMessage(
      entries.length ? null : "No query parameters. Add one below.",
    );
  }

  // Rebuild the URL from the current table rows. Deliberately does NOT re-render
  // the table — that would blow away the input the user is typing in.
  function applyParams(): void {
    const { url } = parseUrl(input.value);
    if (!url) return;
    const next = new URL(url.href);
    const params = new URLSearchParams();
    let dropped = 0;
    for (const row of readRows()) {
      if (row.key === "") {
        dropped += 1;
        continue;
      }
      params.append(row.key, row.value);
    }
    next.search = params.toString();
    input.value = next.href;
    setError(null);
    setParamsMessage(
      dropped > 0
        ? `${dropped} row${dropped > 1 ? "s" : ""} with an empty name ${dropped > 1 ? "are" : "is"} ignored.`
        : null,
    );
    renderParts(next);
    renderOutput(next);
  }

  function renderAll(): void {
    const { url, error } = parseUrl(input.value);
    setError(error);
    renderParts(url);
    renderParams(url);
    renderOutput(url);
  }

  function addParam(): void {
    if (!(newKey instanceof HTMLInputElement)) return;
    if (!(newValue instanceof HTMLInputElement)) return;
    const { url } = parseUrl(input.value);
    if (!url) {
      setParamsMessage("Paste a valid URL first.");
      return;
    }
    if (newKey.value === "") {
      setParamsMessage("Give the parameter a name first.");
      newKey.focus();
      return;
    }
    if (!paramsBody) return;
    paramsBody.appendChild(makeRow(newKey.value, newValue.value));
    newKey.value = "";
    newValue.value = "";
    applyParams();
    newKey.focus();
  }

  function runCodec(op: CodecOp): void {
    try {
      codecOutput.value = CODECS[op](codecInput.value);
      setCodecError(null);
    } catch (err) {
      codecOutput.value = "";
      setCodecError(
        err instanceof URIError
          ? `${op}() threw URIError: malformed input. For decoding, look for a lone "%" or a truncated escape like "%E0%A4". For encoding, a lone surrogate in the string will do it too.`
          : `${op}() failed: ${err instanceof Error ? err.message : "unknown error"}.`,
      );
    }
  }

  function bindCopy(
    buttonId: string,
    labelId: string,
    source: HTMLTextAreaElement,
  ): void {
    const button = document.getElementById(buttonId);
    const label = document.getElementById(labelId);
    if (!(button instanceof HTMLButtonElement)) return;
    const idle = label?.textContent ?? "Copy";
    button.addEventListener("click", () => {
      const text = source.value;
      if (!text) return;
      void copyToClipboard(text)
        .then(() => {
          if (!label) return;
          label.textContent = "Copied!";
          window.setTimeout(() => {
            label.textContent = idle;
          }, 1500);
        })
        .catch(() => {
          // No clipboard permission (or no API at all) — select so the user
          // can hit Cmd/Ctrl+C themselves.
          source.focus();
          source.select();
        });
    });
  }

  input.value = input.value.trim();
  input.addEventListener("input", renderAll);

  root
    .querySelectorAll<HTMLButtonElement>("[data-url-parser-preset]")
    .forEach((button) => {
      button.addEventListener("click", () => {
        input.value = button.dataset.urlParserPreset ?? "";
        renderAll();
      });
    });

  paramsBody?.addEventListener("input", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) return;
    if (
      !target.matches(
        "[data-url-parser-param-key], [data-url-parser-param-value]",
      )
    ) {
      return;
    }
    applyParams();
  });

  paramsBody?.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    const remove = target.closest("[data-url-parser-param-remove]");
    if (!remove) return;
    remove.closest("tr[data-url-parser-param-row]")?.remove();
    applyParams();
    if (readRows().length === 0) {
      setParamsMessage("No query parameters. Add one below.");
    }
  });

  document
    .getElementById("url-parser-add")
    ?.addEventListener("click", addParam);

  for (const field of [newKey, newValue]) {
    if (!(field instanceof HTMLInputElement)) continue;
    field.addEventListener("keydown", (event) => {
      if (event.key !== "Enter") return;
      event.preventDefault();
      addParam();
    });
  }

  root
    .querySelectorAll<HTMLButtonElement>("[data-url-parser-op]")
    .forEach((button) => {
      button.addEventListener("click", () => {
        const op = button.dataset.urlParserOp ?? "";
        if (!isCodecOp(op)) return;
        runCodec(op);
      });
    });

  document
    .getElementById("url-parser-codec-reuse")
    ?.addEventListener("click", () => {
      if (!codecOutput.value) return;
      codecInput.value = codecOutput.value;
      setCodecError(null);
      codecInput.focus();
    });

  bindCopy("url-parser-copy", "url-parser-copy-label", output);
  bindCopy("url-parser-codec-copy", "url-parser-codec-copy-label", codecOutput);

  renderAll();
  runCodec("encodeURIComponent");
}

init();
document.addEventListener("astro:after-swap", init);

export {};
