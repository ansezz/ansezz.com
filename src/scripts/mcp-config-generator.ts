// MCP config generator and validator. Logic lives in @/lib/mcp-config; this
// file reads the form, renders results and keeps safe fields in the URL.

import { bindUrlState } from "@/lib/url-state";
import {
  MCP_CLIENTS,
  generateConfig,
  lines,
  parsePairs,
  validateConfig,
  type McpClient,
  type McpTransport,
} from "@/lib/mcp-config";

const P = "mcp-config-generator-";

function init(): void {
  const root = document.getElementById(`${P}root`);
  if (!root || root.dataset.bound === "1") return;
  root.dataset.bound = "1";

  const $ = <T extends HTMLElement>(id: string): T =>
    document.getElementById(P + id) as T;

  const client = $<HTMLSelectElement>("client");
  const name = $<HTMLInputElement>("name");
  const tStdio = $<HTMLInputElement>("t-stdio");
  const tHttp = $<HTMLInputElement>("t-http");
  const command = $<HTMLInputElement>("command");
  const args = $<HTMLTextAreaElement>("args");
  const env = $<HTMLTextAreaElement>("env");
  const url = $<HTMLInputElement>("url");
  const headers = $<HTMLTextAreaElement>("headers");
  const stdioFields = $<HTMLElement>("stdio-fields");
  const httpFields = $<HTMLElement>("http-fields");
  const out = $<HTMLElement>("json");
  const file = $<HTMLElement>("file");
  const cliWrap = $<HTMLElement>("cli-wrap");
  const cli = $<HTMLElement>("cli");
  const notes = $<HTMLElement>("notes");
  const bad = $<HTMLElement>("bad");
  const docs = $<HTMLAnchorElement>("docs");
  const copyBtn = $<HTMLButtonElement>("copy");

  const vclient = $<HTMLSelectElement>("vclient");
  const vtext = $<HTMLTextAreaElement>("vtext");
  const vsummary = $<HTMLElement>("vsummary");
  const vissues = $<HTMLElement>("vissues");

  const transport = (): McpTransport => (tHttp.checked ? "http" : "stdio");

  function render(): void {
    const c = client.value as McpClient;
    const info = MCP_CLIENTS[c];
    const t = transport();
    stdioFields.classList.toggle("hidden", t !== "stdio");
    httpFields.classList.toggle("hidden", t !== "http");

    const e = parsePairs(env.value, "=");
    const h = parsePairs(headers.value, ":");
    const badLines = t === "stdio" ? e.bad : h.bad;
    bad.textContent = badLines.length
      ? `Skipped ${badLines.length} line(s) without ${t === "stdio" ? "KEY=value" : "Name: value"}: ${badLines.join(", ")}`
      : "";

    const r = generateConfig(c, {
      name: name.value,
      transport: t,
      command: command.value,
      args: lines(args.value),
      env: t === "stdio" ? e.pairs : {},
      url: url.value,
      headers: t === "http" ? h.pairs : {},
    });

    file.textContent = `Put this in: ${info.file}`;
    out.textContent =
      r.json ?? "Not supported in this file. See the note below.";
    copyBtn.disabled = r.json === null;
    copyBtn.classList.toggle("opacity-50", r.json === null);
    cliWrap.classList.toggle("hidden", !r.cli);
    cli.textContent = r.cli ?? "";
    notes.replaceChildren(
      ...r.notes.map((n) => {
        const li = document.createElement("li");
        li.className = "flex gap-2";
        li.innerHTML = '<span aria-hidden="true" class="font-bold">▸</span>';
        const span = document.createElement("span");
        span.textContent = n;
        li.append(span);
        return li;
      }),
    );
    docs.href = info.docs;
    docs.textContent = `${info.label} MCP docs`;
  }

  function validate(): void {
    const text = vtext.value;
    if (!text.trim()) {
      vsummary.textContent = "Paste a config to check it.";
      vissues.replaceChildren();
      return;
    }
    const issues = validateConfig(text, vclient.value as McpClient);
    const errors = issues.filter((i) => i.level === "error").length;
    const warnings = issues.length - errors;
    vsummary.textContent =
      issues.length === 0
        ? `No problems found for ${MCP_CLIENTS[vclient.value as McpClient].label}.`
        : `${errors} error${errors === 1 ? "" : "s"}, ${warnings} warning${warnings === 1 ? "" : "s"}.`;
    vissues.replaceChildren(
      ...issues.map((i) => {
        const li = document.createElement("li");
        li.className = `border-ink rounded-[4px] border-[2px] p-3 ${i.level === "error" ? "bg-pink" : "bg-yellow"}`;
        const head = document.createElement("p");
        head.className =
          "mono text-[10px] font-bold tracking-widest uppercase break-words";
        head.textContent = `${i.level}${i.path ? ` · ${i.path}` : ""}`;
        const msg = document.createElement("p");
        msg.className = "mt-1 break-words";
        msg.textContent = i.message;
        li.append(head, msg);
        return li;
      }),
    );
  }

  for (const el of [
    client,
    name,
    tStdio,
    tHttp,
    command,
    args,
    env,
    url,
    headers,
  ]) {
    el.addEventListener("input", render);
    el.addEventListener("change", render);
  }
  vtext.addEventListener("input", validate);
  vclient.addEventListener("change", validate);
  // Keep the validator target in step with the generator client.
  client.addEventListener("change", () => {
    vclient.value = client.value;
    validate();
  });

  root
    .querySelectorAll<HTMLButtonElement>("[data-preset-name]")
    .forEach((btn) => {
      btn.addEventListener("click", () => {
        const d = btn.dataset;
        name.value = d.presetName ?? "";
        (d.presetTransport === "http" ? tHttp : tStdio).checked = true;
        command.value = d.presetCommand ?? "";
        args.value = d.presetArgs ?? "";
        url.value = d.presetUrl ?? "";
        if (d.presetTransport === "http" && !headers.value.trim())
          headers.value = "Authorization: Bearer ${MCP_TOKEN}";
        // Fire change so the share link picks up the new values.
        name.dispatchEvent(new Event("change", { bubbles: true }));
        render();
      });
    });

  root
    .querySelectorAll<HTMLButtonElement>("[data-copy-target]")
    .forEach((btn) => {
      btn.addEventListener("click", async () => {
        const target = document.getElementById(btn.dataset.copyTarget ?? "");
        if (!target?.textContent) return;
        const label = btn.textContent;
        try {
          await navigator.clipboard.writeText(target.textContent);
          btn.textContent = "Copied";
        } catch {
          btn.textContent = "Copy failed";
        }
        window.setTimeout(() => (btn.textContent = label), 1500);
      });
    });

  render();
  validate();
}

init();
document.addEventListener("astro:after-swap", init);
bindUrlState("mcp-config-generator-root", {
  exclude: [`${P}env`, `${P}headers`, `${P}vtext`],
});
