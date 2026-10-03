// Shared token counting for the AI tools. Runs in the browser.
//
// GPT counts are exact: the o200k_base merge table (gpt-tokenizer) is loaded
// lazily on first use, so pages that never count do not pay the ~2 MB.
// Claude and Gemini tokenizers are not public in a form we can ship, so their
// counts are estimates derived from the GPT count.

import {
  CLAUDE_NEW_TOKENIZER_FACTOR,
  type LlmTokenizer,
} from "@/data/llm-models";

/** Quick heuristic, used before the exact tokenizer has loaded. */
export function heuristicTokens(text: string): number {
  if (!text) return 0;
  const chars = text.length;
  const words = (text.trim().match(/\S+/g) ?? []).length;
  return Math.round((chars / 4) * 0.7 + words * 1.33 * 0.3);
}

export type GptCounter = (text: string) => number;

let loader: Promise<GptCounter> | null = null;

/** Load the exact o200k_base counter once. Resolves to a counting function. */
export function loadGptCounter(): Promise<GptCounter> {
  if (!loader) {
    loader = import("gpt-tokenizer/encoding/o200k_base")
      .then((mod) => (text: string) => (text ? mod.countTokens(text) : 0))
      .catch((err) => {
        loader = null;
        throw err;
      });
  }
  return loader;
}

/**
 * Tokens for a given tokenizer family, from an o200k count.
 * Only "o200k" is exact; the others are estimates.
 */
export function tokensFor(tokenizer: LlmTokenizer, gptCount: number): number {
  if (tokenizer === "claude") {
    return Math.round(gptCount * CLAUDE_NEW_TOKENIZER_FACTOR);
  }
  return gptCount;
}

export function isExact(tokenizer: LlmTokenizer): boolean {
  return tokenizer === "o200k";
}
