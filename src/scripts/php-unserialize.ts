// PHP unserialize and Laravel failed-job decoder. Parsing lives in
// @/lib/php-unserialize, which only reads data: it never creates objects or
// runs code. The tree is built with textContent, never innerHTML.

import { bindUrlState } from "@/lib/url-state";
import {
  PhpParseError,
  describe,
  parseLaravelPayload,
  summarizeCommand,
  toJson,
  unserialize,
  type PhpNode,
} from "@/lib/php-unserialize";
import {
  EXAMPLE_ENCRYPTED,
  EXAMPLE_JOB,
  EXAMPLE_MULTIBYTE,
  EXAMPLE_REFS,
  EXAMPLE_SERIALIZED,
} from "@/scripts/php-unserialize-examples";

const P = "php-unserialize-";
const MAX_NODES = 4000;

const EXAMPLES: Record<string, { mode: "php" | "laravel"; text: string }> = {
  object: { mode: "php", text: EXAMPLE_SERIALIZED },
  multibyte: { mode: "php", text: EXAMPLE_MULTIBYTE },
  refs: { mode: "php", text: EXAMPLE_REFS },
  job: { mode: "laravel", text: EXAMPLE_JOB },
  encrypted: { mode: "laravel", text: EXAMPLE_ENCRYPTED },
};

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  cls = "",
  text?: string,
): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

const TYPE_CLASS =
  "mono border-ink bg-bg-alt rounded-[3px] border px-1 text-[10px] font-bold uppercase";

function buildTree(root: PhpNode): { node: HTMLElement; truncated: boolean } {
  let count = 0;
  let truncated = false;

  const keyLabel = (key: string, extra?: string) => {
    const k = el("span", "font-mono font-bold break-all", key);
    if (!extra) return [k];
    return [k, el("span", "ml-1 text-[10px] font-bold opacity-70", extra)];
  };

  const render = (
    key: string,
    extra: string | undefined,
    n: PhpNode,
    depth: number,
  ): HTMLElement => {
    count++;
    const slot = el(
      "span",
      "ml-1 font-mono text-[10px] opacity-60",
      `#${n.id}`,
    );
    const head = el(
      "span",
      "inline-flex min-w-0 flex-wrap items-baseline gap-x-2",
    );
    head.append(...keyLabel(key, extra), el("span", TYPE_CLASS, n.t));

    if (n.t === "array" || n.t === "object") {
      const det = el("details", "min-w-0");
      det.open = depth < 3;
      const sum = el("summary", "cursor-pointer py-0.5 break-all");
      head.append(
        el("span", "font-mono text-xs opacity-80", describe(n)),
        slot,
      );
      sum.append(head);
      det.append(sum);
      const ul = el("ul", "border-ink/40 ml-2 min-w-0 border-l-2 pl-3");
      const kids =
        n.t === "array"
          ? n.items.map((it) => ({
              key:
                typeof it.key === "number"
                  ? String(it.key)
                  : JSON.stringify(it.key),
              extra: undefined as string | undefined,
              v: it.value,
            }))
          : n.props.map((p) => ({
              key: p.name,
              extra:
                p.visibility === "private"
                  ? `private (${p.declaringClass ?? "?"})`
                  : p.visibility === "protected"
                    ? "protected"
                    : undefined,
              v: p.value,
            }));
      for (const k of kids) {
        if (count >= MAX_NODES) {
          truncated = true;
          break;
        }
        const li = el("li", "min-w-0");
        li.append(render(k.key, k.extra, k.v, depth + 1));
        ul.append(li);
      }
      det.append(ul);
      return det;
    }
    const line = el("div", "min-w-0 py-0.5 break-all");
    let value = describe(n);
    if (n.t === "string") {
      value = JSON.stringify(n.v);
      if (n.binary) head.append(el("span", "text-[10px] font-bold", "binary"));
      head.append(el("span", "text-[10px] opacity-70", `${n.bytes} bytes`));
    }
    head.append(el("span", "font-mono text-xs break-all", value), slot);
    line.append(head);
    return line;
  };

  const ul = el("div", "min-w-0 text-sm");
  ul.append(render("value", undefined, root, 0));
  return { node: ul, truncated };
}

function init(): void {
  const root = document.getElementById(`${P}root`);
  if (!root || root.dataset.bound === "1") return;
  root.dataset.bound = "1";

  const $ = <T extends HTMLElement>(id: string): T =>
    document.getElementById(P + id) as T;
  const input = $<HTMLTextAreaElement>("input");
  const lenient = $<HTMLInputElement>("lenient");
  const status = $<HTMLElement>("status");
  const facts = $<HTMLElement>("facts");
  const warnings = $<HTMLElement>("warnings");
  const tree = $<HTMLElement>("tree");
  const json = $<HTMLElement>("json");
  const copyBtn = $<HTMLButtonElement>("copy");
  const modeRadios = Array.from(
    root.querySelectorAll<HTMLInputElement>(`input[name="${P}mode"]`),
  );
  const mode = () =>
    modeRadios.find((r) => r.checked)?.value === "laravel" ? "laravel" : "php";

  const setStatus = (
    text: string,
    tone: "ok" | "err" | "info",
    link?: [string, string],
  ) => {
    status.className = `border-ink rounded-[4px] border-[2px] p-3 text-sm font-bold break-words ${
      tone === "ok"
        ? "bg-green text-on-accent"
        : tone === "err"
          ? "bg-pink text-on-accent"
          : "bg-yellow text-on-accent"
    }`;
    status.replaceChildren(document.createTextNode(text));
    if (link) {
      const a = el("a", "underline", link[1]);
      a.href = link[0];
      status.append(document.createTextNode(" "), a);
    }
  };

  const showFacts = (rows: [string, string][]) => {
    facts.hidden = rows.length === 0;
    facts.replaceChildren(
      ...rows.map(([k, v]) => {
        const div = el(
          "div",
          "flex flex-wrap items-baseline justify-between gap-x-3",
        );
        div.append(
          el("dt", "font-bold", k),
          el("dd", "font-mono text-xs break-all", v),
        );
        return div;
      }),
    );
  };

  const showWarnings = (list: string[]) => {
    warnings.hidden = list.length === 0;
    warnings.replaceChildren(...list.map((w) => el("li", "break-words", w)));
  };

  const clearOutput = () => {
    tree.replaceChildren();
    json.textContent = "";
    copyBtn.disabled = true;
    copyBtn.classList.add("opacity-50");
  };

  const showValue = (node: PhpNode) => {
    const t = buildTree(node);
    tree.replaceChildren(t.node);
    if (t.truncated)
      tree.append(
        el(
          "p",
          "mt-2 text-xs font-bold",
          `Tree cut at ${MAX_NODES} nodes. The JSON has everything.`,
        ),
      );
    json.textContent = JSON.stringify(toJson(node), null, 2);
    copyBtn.disabled = false;
    copyBtn.classList.remove("opacity-50");
  };

  const placeholders = {
    php: 'a:2:{s:4:"name";s:3:"Ada";s:4:"tags";a:1:{i:0;s:3:"php";}}',
    laravel:
      '{"uuid":"...","displayName":"App\\\\Jobs\\\\...","data":{"commandName":"...","command":"O:..."}}',
  };

  function render(): void {
    const m = mode();
    input.placeholder = placeholders[m];
    $<HTMLElement>("input-label").textContent =
      m === "laravel" ? "failed_jobs.payload (JSON)" : "Serialized PHP";
    const text = input.value;
    showFacts([]);
    showWarnings([]);
    if (!text.trim()) {
      clearOutput();
      setStatus("Paste a value or load an example.", "info");
      return;
    }
    try {
      if (m === "laravel") {
        const job = parseLaravelPayload(text);
        const rows: [string, string][] = [...job.facts];
        if (job.encrypted) {
          showFacts(rows);
          clearOutput();
          json.textContent = JSON.stringify(job.payload, null, 2);
          setStatus(
            "data.command is encrypted (the job implements ShouldBeEncrypted). Decrypt it with your APP_KEY first, then paste the result in Serialized PHP mode.",
            "info",
            [
              "/tools/laravel-encrypt-decrypt/",
              "Open the Laravel encrypt/decrypt tool.",
            ],
          );
          return;
        }
        if (job.command === null) {
          showFacts(rows);
          clearOutput();
          json.textContent = JSON.stringify(job.payload, null, 2);
          setStatus(
            "No data.command string in this payload. It may be a queued event listener or a job from another library.",
            "info",
          );
          return;
        }
        const r = unserialize(job.command, { lenient: lenient.checked });
        summarizeCommand(job, r.value);
        if (job.queue) rows.push(["Queue", job.queue]);
        if (job.connection) rows.push(["Connection", job.connection]);
        for (const mdl of job.models)
          rows.push([
            "Model",
            `${mdl.cls} #${JSON.stringify(mdl.id)}${mdl.connection ? ` (${String(mdl.connection)})` : ""}`,
          ]);
        showFacts(rows);
        showWarnings(r.warnings);
        showValue(r.value);
        setStatus(
          `Decoded ${job.commandName ?? "the command"}. Models are stored as ModelIdentifier: the class and key, not the row.`,
          "ok",
        );
        return;
      }
      const r = unserialize(text, { lenient: lenient.checked });
      const w = [...r.warnings];
      if (r.trailing > 0)
        w.push(`${r.trailing} bytes after the value were ignored.`);
      showWarnings(w);
      showValue(r.value);
      setStatus("Parsed. Nothing was instantiated or run.", "ok");
    } catch (e) {
      clearOutput();
      if (e instanceof PhpParseError) {
        const hint = lenient.checked
          ? ""
          : " If you copied it from a log or a database tool, NUL bytes may be missing: try lenient mode.";
        setStatus(`${e.message}${hint}`, "err");
      } else setStatus((e as Error).message, "err");
    }
  }

  let timer = 0;
  root.addEventListener("input", (e) => {
    if (e.target === input) {
      window.clearTimeout(timer);
      timer = window.setTimeout(render, 150);
    } else render();
  });
  root.addEventListener("change", (e) => {
    if (e.target !== input) render();
  });

  root.querySelectorAll<HTMLButtonElement>("[data-example]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const ex = EXAMPLES[btn.dataset.example ?? ""];
      if (!ex) return;
      const radio = modeRadios.find((r) => r.value === ex.mode);
      if (radio && !radio.checked) {
        radio.checked = true;
        radio.dispatchEvent(new Event("change", { bubbles: true }));
      }
      input.value = ex.text;
      render();
    });
  });
  $<HTMLButtonElement>("clear").addEventListener("click", () => {
    input.value = "";
    render();
    input.focus();
  });
  copyBtn.addEventListener("click", async () => {
    if (!json.textContent) return;
    const label = copyBtn.textContent;
    try {
      await navigator.clipboard.writeText(json.textContent);
      copyBtn.textContent = "Copied";
    } catch {
      copyBtn.textContent = "Copy failed";
    }
    window.setTimeout(() => (copyBtn.textContent = label), 1500);
  });

  render();
}

init();
document.addEventListener("astro:after-swap", init);
// The pasted value can hold personal data, so it never goes in the URL.
bindUrlState("php-unserialize-root", { exclude: [`${P}input`] });
