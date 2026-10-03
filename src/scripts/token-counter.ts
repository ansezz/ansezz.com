// Token counter. Exact GPT counts (o200k_base, lazy-loaded), with Claude and
// Gemini estimates derived from that count. Everything stays in the browser.

import type { LlmTokenizer } from "@/data/llm-models";
import {
  heuristicTokens,
  loadGptCounter,
  tokensFor,
  type GptCounter,
} from "@/lib/tokens";

function fmtUsd(n: number): string {
  if (n === 0) return "$0";
  if (n < 0.0001) return "<$0.0001";
  if (n < 1) return `$${n.toFixed(4)}`;
  return `$${n.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
}

function init(): void {
  const root = document.getElementById("tok-root");
  const input = document.getElementById(
    "tok-input",
  ) as HTMLTextAreaElement | null;
  if (!root || !input || root.dataset.bound === "1") return;
  root.dataset.bound = "1";

  const setText = (id: string, v: string) => {
    const el = document.getElementById(id);
    if (el) el.textContent = v;
  };

  let counter: GptCounter | null = null;
  let timer: number | undefined;

  function update(): void {
    const text = input!.value;
    const exact = counter !== null;
    const gpt = counter ? counter(text) : heuristicTokens(text);
    const n = (t: LlmTokenizer) => tokensFor(t, gpt).toLocaleString("en-US");

    setText("tok-tokens", gpt.toLocaleString("en-US"));
    setText("tok-claude", n("claude"));
    setText("tok-claude-legacy", n("claude-legacy"));
    setText("tok-gemini", n("gemini"));
    setText("tok-chars", text.length.toLocaleString("en-US"));
    setText(
      "tok-words",
      (text.trim().match(/\S+/g) ?? []).length.toLocaleString("en-US"),
    );
    setText(
      "tok-status",
      exact
        ? "GPT count is exact (o200k_base)"
        : "Loading exact GPT tokenizer, showing an estimate",
    );
    root!.querySelectorAll<HTMLElement>("[data-cost]").forEach((el) => {
      const pricePerM = parseFloat(el.dataset.cost ?? "0");
      const tok = (el.dataset.tok ?? "o200k") as LlmTokenizer;
      el.textContent = fmtUsd((tokensFor(tok, gpt) / 1_000_000) * pricePerM);
    });
  }

  function schedule(): void {
    window.clearTimeout(timer);
    timer = window.setTimeout(update, 120);
  }

  input.addEventListener("input", schedule);
  update();

  loadGptCounter()
    .then((c) => {
      counter = c;
      update();
    })
    .catch(() => {
      setText(
        "tok-status",
        "Could not load the GPT tokenizer, showing an estimate",
      );
    });
}

init();
document.addEventListener("astro:after-swap", init);

export {};
