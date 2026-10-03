/**
 * One shared list of LLM models, prices and context windows, used by the
 * LLM cost calculator, the token counter and the context window checker.
 *
 * Prices are USD per 1M tokens, standard (non-batch) tier, short-context
 * rates. Every model below was re-checked on LLM_DATA_VERIFIED against:
 *   - Anthropic: platform.claude.com/docs/en/about-claude/pricing and
 *     platform.claude.com/docs/en/about-claude/models/overview
 *   - OpenAI: developers.openai.com/api/docs/pricing and /api/docs/models
 *   - Google: ai.google.dev/gemini-api/docs/pricing and the per-model pages
 * When you change a number, re-check every model and bump the date, or move
 * the changed model to its own `verified` date.
 */

export const LLM_DATA_VERIFIED = "2026-10-03";

export type LlmProvider = "anthropic" | "openai" | "google";

/**
 * Which tokenizer a model uses, as far as this site can count it.
 * - o200k: OpenAI o200k_base. Counted exactly in the browser.
 * - claude: Claude 4.7 and later tokenizer. Not public, so estimated.
 * - claude-legacy: tokenizer of Claude 4.6 and earlier. Also estimated.
 * - gemini: Gemini SentencePiece tokenizer. Not public here, so estimated.
 */
export type LlmTokenizer = "o200k" | "claude" | "claude-legacy" | "gemini";

export interface LlmModel {
  id: string;
  provider: LlmProvider;
  label: string;
  /** Base input price, $ per 1M tokens. */
  input: number;
  /** Output price (thinking tokens included), $ per 1M tokens. */
  output: number;
  /** Price of a cached input token (a cache hit), $ per 1M tokens. */
  cacheRead: number;
  /** Price to write a token into the short (default) cache, $ per 1M. */
  cacheWrite: number;
  /** Anthropic only: price to write into the 1-hour cache, $ per 1M. */
  cacheWrite1h?: number;
  /** Google only: cache storage, $ per 1M tokens per hour. */
  cacheStoragePerHour?: number;
  /** Context window in tokens. */
  contextWindow: number;
  /** Max output tokens per synchronous request. */
  maxOutput: number;
  tokenizer: LlmTokenizer;
  /** Short caveat shown next to the model, plain English, no dashes. */
  note?: string;
  verified: string;
}

const V = LLM_DATA_VERIFIED;

export const LLM_MODELS: LlmModel[] = [
  // Anthropic. Cache writes are 1.25x base (5 min) or 2x base (1 hour).
  // Cache reads are 0.1x base, except Opus 5.5 (0.05x) and Fable 5.1 (0.025x).
  {
    id: "claude-fable-5-1",
    provider: "anthropic",
    label: "Claude Fable 5.1",
    input: 10,
    output: 50,
    cacheRead: 0.25,
    cacheWrite: 12.5,
    cacheWrite1h: 20,
    contextWindow: 1_000_000,
    maxOutput: 128_000,
    tokenizer: "claude",
    verified: V,
  },
  {
    id: "claude-opus-5-5",
    provider: "anthropic",
    label: "Claude Opus 5.5",
    input: 4,
    output: 20,
    cacheRead: 0.2,
    cacheWrite: 5,
    cacheWrite1h: 8,
    contextWindow: 1_000_000,
    maxOutput: 128_000,
    tokenizer: "claude",
    verified: V,
  },
  {
    id: "claude-sonnet-5-5",
    provider: "anthropic",
    label: "Claude Sonnet 5.5",
    input: 2,
    output: 10,
    cacheRead: 0.2,
    cacheWrite: 2.5,
    cacheWrite1h: 4,
    contextWindow: 1_000_000,
    maxOutput: 128_000,
    tokenizer: "claude",
    verified: V,
  },
  {
    id: "claude-haiku-4-5",
    provider: "anthropic",
    label: "Claude Haiku 4.5",
    input: 1,
    output: 5,
    cacheRead: 0.1,
    cacheWrite: 1.25,
    cacheWrite1h: 2,
    contextWindow: 200_000,
    maxOutput: 64_000,
    tokenizer: "claude-legacy",
    note: "Older tokenizer, so counts run about 30% lower than newer Claude models.",
    verified: V,
  },
  // OpenAI. Caching is automatic. GPT-6 models list a cache write price.
  // Requests above the short-context threshold are billed at about 2x.
  {
    id: "gpt-6-astra",
    provider: "openai",
    label: "GPT-6 Astra",
    input: 10,
    output: 50,
    cacheRead: 1,
    cacheWrite: 12.5,
    contextWindow: 1_050_000,
    maxOutput: 128_000,
    tokenizer: "o200k",
    verified: V,
  },
  {
    id: "gpt-6-1-sol",
    provider: "openai",
    label: "GPT-6.1 Sol",
    input: 2,
    output: 10,
    cacheRead: 0.1,
    cacheWrite: 2.5,
    contextWindow: 1_050_000,
    maxOutput: 128_000,
    tokenizer: "o200k",
    verified: V,
  },
  {
    id: "gpt-6-luna",
    provider: "openai",
    label: "GPT-6 Luna",
    input: 0.1,
    output: 0.5,
    cacheRead: 0.01,
    cacheWrite: 0.125,
    contextWindow: 1_050_000,
    maxOutput: 128_000,
    tokenizer: "o200k",
    verified: V,
  },
  // Google. Implicit caching has no write fee. Explicit caching also bills
  // storage per hour. Writes are billed at the normal input rate.
  {
    id: "gemini-3-1-pro",
    provider: "google",
    label: "Gemini 3.1 Pro (preview)",
    input: 2,
    output: 12,
    cacheRead: 0.2,
    cacheWrite: 2,
    cacheStoragePerHour: 4.5,
    contextWindow: 1_048_576,
    maxOutput: 65_536,
    tokenizer: "gemini",
    note: "Prompts over 200K tokens cost $4 in and $18 out.",
    verified: V,
  },
  {
    id: "gemini-3-8-flash",
    provider: "google",
    label: "Gemini 3.8 Flash",
    input: 0.75,
    output: 3.75,
    cacheRead: 0.075,
    cacheWrite: 0.75,
    cacheStoragePerHour: 0.5,
    contextWindow: 1_048_576,
    maxOutput: 65_536,
    tokenizer: "gemini",
    note: "Launch price until Dec 31, 2026. It doubles on Jan 1, 2027.",
    verified: V,
  },
  {
    id: "gemini-3-5-flash-lite",
    provider: "google",
    label: "Gemini 3.5 Flash-Lite",
    input: 0.3,
    output: 2.5,
    cacheRead: 0.03,
    cacheWrite: 0.3,
    cacheStoragePerHour: 1,
    contextWindow: 1_048_576,
    maxOutput: 65_536,
    tokenizer: "gemini",
    verified: V,
  },
];

export const PROVIDER_LABEL: Record<LlmProvider, string> = {
  anthropic: "Anthropic",
  openai: "OpenAI",
  google: "Google",
};

export function getLlmModel(id: string): LlmModel | undefined {
  return LLM_MODELS.find((m) => m.id === id);
}

/**
 * Newer Claude models (4.7 and later) use a tokenizer that Anthropic says
 * produces about 30% more tokens for the same text. We scale a GPT count by
 * this factor to estimate them. Haiku 4.5 uses the older tokenizer.
 */
export const CLAUDE_NEW_TOKENIZER_FACTOR = 1.3;
