// RAG chunk splitter. Four strategies: a hard fixed window, and three that pack
// whole units (sentences, paragraphs, markdown sections) up to a target size and
// build the overlap out of complete units walked backwards from the seam.
// Token counts use the ~4 chars/token blend from the token counter — estimates,
// not a BPE tokenizer.

type Strategy = "fixed" | "sentence" | "paragraph" | "markdown";
type Unit = "tokens" | "chars";

// Input ceiling on most current embedding models; past it the API truncates
// silently rather than erroring, which is the worse failure.
const EMBED_TOKEN_LIMIT = 8192;
// Bounds that keep a pathological paste (or a near-size overlap) from locking
// up the tab. Everything below is O(n) apart from DOM rendering.
const MAX_INPUT_CHARS = 200_000;
const MAX_CHUNKS = 2000;
const MAX_RENDERED = 150;
const CHARS_PER_TOKEN_FALLBACK = 4;

const STRATEGY_HINTS: Record<Strategy, string> = {
  sentence:
    "▸ Packs whole sentences up to the target. Never cuts mid-sentence.",
  paragraph:
    "▸ Packs whole paragraphs, dropping to sentences when one is too big.",
  markdown:
    "▸ Every #, ##, ### starts a new chunk. Headings inside code fences are ignored.",
  fixed:
    "▸ Hard window over the raw text. Fast, blind, and where overlap earns its keep.",
};

const SAMPLE = `# Ingest pipeline

The ingest worker pulls documents from object storage, normalises them to markdown, and writes chunks to the vector store. It runs on a nightly schedule and on demand from the admin console. Everything downstream of it — retrieval quality, answer accuracy, the eval suite — is measured against whatever this worker produced, so it is the first place to look when results get worse without a model change.

A run has four stages: fetch, normalise, chunk, embed. Each stage writes its output to a staging prefix and records a manifest, which means a failed run can be resumed from the last completed stage instead of starting over. The manifest is also what the reindex job diffs against to decide which documents actually changed.

## Normalisation

Everything becomes markdown before it is chunked. PDFs go through a layout-aware extractor, HTML is stripped to semantic tags, and Office documents are converted with the same pipeline the export service uses. Anything that fails conversion is quarantined with the original bytes attached, never silently skipped.

Tables are the hard case. A table flattened into prose loses the column headers, and a table split across two chunks loses them for the second half. We serialise tables to markdown pipe syntax and treat the header row as sticky, repeating it whenever a table has to be broken up.

## Rate limits

The embedding provider caps us at 3,000 requests per minute per project. The worker batches 96 inputs per request, so a full re-index of 200,000 chunks takes roughly twelve minutes if nothing else is competing for the quota. In practice the nightly run overlaps with the analytics export, so budget twenty.

Back off on 429 with jitter. Retrying immediately from every worker at once turns a two-second blip into a ten-minute outage. We use exponential backoff starting at 500ms, capped at 30 seconds, with a maximum of six attempts. After the sixth the document goes to the dead-letter queue with its manifest entry intact.

### Configuring the batch size

Set \`EMBED_BATCH_SIZE\` in the worker environment. Larger batches cut the request count but widen the blast radius of a single failure — one bad input rejects the whole batch, and the provider does not tell you which one.

\`\`\`sh
# not a heading: this line lives inside a fenced block
export EMBED_BATCH_SIZE=96
export EMBED_MAX_RETRIES=6
\`\`\`

## Failure modes

- A document that fails normalisation is quarantined, never silently skipped. Check the quarantine bucket before you trust a run.
- A chunk over the model's input limit is truncated by the API, not rejected. There is no error and no warning — the tail is simply gone from the vector. Measure lengths before you send.
- If the embedding model version changes, the whole index has to be rebuilt. Old and new vectors are not comparable, and mixing them produces similarity scores that look plausible and rank randomly.
- If the chunking configuration changes, the index has to be rebuilt too. This one catches people out because nothing in the pipeline errors; retrieval just quietly degrades.

## Reindexing

Reindexing is non-destructive by default: the worker writes to a new collection, verifies the document and chunk counts against the manifest, then swaps the alias. Nothing is deleted until the swap succeeds, so a failed reindex costs disk, not availability. The old collection is retained for 48 hours in case a rollback is needed.

Partial reindexing is supported for a single source or a single document ID. It is much faster, and it is also the one path where you can end up with two chunking configurations inside one collection. Do not use it after changing chunk size or overlap — do a full rebuild instead.

## Access control

Every chunk carries the tenant ID and the source ACL as metadata, and every query filters on them before the vector search runs. Filtering after retrieval is not access control; it is a leak with an extra step, because the top-k you computed was already drawn from documents the user cannot see.

Deleted documents are tombstoned rather than removed immediately. The delete path marks the manifest entry, drops the vectors on the next run, and logs the chunk IDs so an accidental bulk delete can be traced. A hard delete API exists for legal requests and it bypasses the tombstone entirely.

## Evaluation

Retrieval is evaluated separately from generation, because they fail for different reasons and fixing the wrong one wastes a week. The retrieval suite is a fixed set of 240 questions with known answer locations; we report recall at 5, recall at 20, and mean reciprocal rank on every ingest configuration change.

Generation is scored against the retrieved context with a rubric, not against a golden answer string. Answers that are correct but phrased differently should not be penalised, and answers that are fluent but unsupported by the context should be. Any change to chunk size, overlap, or the splitting strategy reruns both suites before it ships.

Track the numbers per source, not just in aggregate. A change that improves recall on the handbook and destroys it on the API reference looks like a small net win in the average, and it is the reason half your users suddenly stop getting answers.
`;

/* ── token estimate ─────────────────────────────────────── */

// Unrounded so it can be summed across atoms without rounding drift.
function rawTokens(text: string): number {
  if (!text) return 0;
  const words = (text.trim().match(/\S+/g) ?? []).length;
  return (text.length / 4) * 0.7 + words * 1.33 * 0.3;
}

function estimateTokens(text: string): number {
  return Math.round(rawTokens(text));
}

/* ── spans ──────────────────────────────────────────────── */

interface Span {
  start: number;
  end: number;
}

// Drops empty spans and folds whitespace-only spans into their predecessor so
// the returned list stays contiguous and covers the whole input range.
function tidySpans(src: string, spans: Span[]): Span[] {
  const out: Span[] = [];
  for (const span of spans) {
    if (span.end <= span.start) continue;
    const blank = src.slice(span.start, span.end).trim() === "";
    const last = out[out.length - 1];
    if (blank && last) {
      out[out.length - 1] = { start: last.start, end: span.end };
      continue;
    }
    out.push({ start: span.start, end: span.end });
  }
  return out;
}

function isSpace(ch: string): boolean {
  return ch === " " || ch === "\t" || ch === "\n" || ch === "\r";
}

const TERMINATORS = new Set([".", "!", "?", "…"]);
const CLOSERS = new Set(['"', "'", ")", "]", "}", "»", "”", "’"]);

// Words that end in a period without ending a sentence.
const ABBREVIATIONS = new Set([
  "mr",
  "mrs",
  "ms",
  "dr",
  "prof",
  "sr",
  "jr",
  "st",
  "vs",
  "etc",
  "eg",
  "ie",
  "fig",
  "no",
  "inc",
  "ltd",
  "co",
  "approx",
  "al",
  "cf",
  "dept",
  "est",
  "min",
  "max",
  "vol",
  "pp",
  "ca",
  "ver",
]);

function isAbbreviation(src: string, dotIndex: number): boolean {
  let start = dotIndex;
  while (start > 0 && !isSpace(src[start - 1])) start--;
  const word = src
    .slice(start, dotIndex)
    .toLowerCase()
    .replace(/[^a-z0-9.]/g, "");
  const bare = word.replace(/\./g, "");
  if (bare === "") return false;
  // Single letters are initials ("J."), digits are list markers ("1.").
  if (bare.length === 1 || /^\d+$/.test(bare)) return true;
  return ABBREVIATIONS.has(bare);
}

// Sentence boundaries: terminal punctuation followed by whitespace, plus every
// line break (which is what makes bullet lists split sanely).
function splitSentences(src: string, from: number, to: number): Span[] {
  const spans: Span[] = [];
  let start = from;
  let i = from;

  while (i < to) {
    const ch = src[i];

    if (ch === "\n") {
      let j = i + 1;
      while (j < to && (src[j] === "\n" || src[j] === "\r")) j++;
      spans.push({ start, end: j });
      start = j;
      i = j;
      continue;
    }

    if (TERMINATORS.has(ch)) {
      let j = i + 1;
      while (j < to && (TERMINATORS.has(src[j]) || CLOSERS.has(src[j]))) j++;
      const followsSpace = j >= to || isSpace(src[j]);
      if (!followsSpace) {
        i = j;
        continue;
      }
      if (ch === "." && isAbbreviation(src, i)) {
        i = j;
        continue;
      }
      let k = j;
      while (k < to && (src[k] === " " || src[k] === "\t")) k++;
      spans.push({ start, end: k });
      start = k;
      i = k;
      continue;
    }

    i++;
  }

  if (start < to) spans.push({ start, end: to });
  return tidySpans(src, spans);
}

// Paragraphs are separated by a blank line. The separator stays attached to the
// paragraph before it, so concatenating the spans reproduces the source exactly.
function splitParagraphs(src: string, from: number, to: number): Span[] {
  const spans: Span[] = [];
  const re = /\n[ \t]*(?:\r?\n[ \t]*)+/g;
  re.lastIndex = from;
  let start = from;

  for (let m = re.exec(src); m !== null; m = re.exec(src)) {
    if (m.index >= to) break;
    const end = Math.min(to, m.index + m[0].length);
    if (end <= start) break;
    spans.push({ start, end });
    start = end;
    if (end >= to) break;
  }

  if (start < to) spans.push({ start, end: to });
  return tidySpans(src, spans);
}

function splitHard(from: number, to: number, size: number): Span[] {
  const step = Math.max(1, Math.floor(size));
  const out: Span[] = [];
  for (let s = from; s < to; s += step) {
    out.push({ start: s, end: Math.min(to, s + step) });
  }
  return out;
}

/* ── markdown sections ──────────────────────────────────── */

interface Section {
  start: number;
  end: number;
  headingLine: string;
  headingPath: string;
}

// Splits at every ATX heading that is not inside a fenced code block, and
// tracks the heading stack so each section knows its full path.
function splitMarkdownSections(
  src: string,
  from: number,
  to: number,
): Section[] {
  const sections: Section[] = [];
  const stack: { level: number; text: string }[] = [];
  let sectionStart = from;
  let headingLine = "";
  let headingPath = "";
  let fence: string | null = null;
  let pos = from;

  const flush = (end: number): void => {
    if (end > sectionStart) {
      sections.push({ start: sectionStart, end, headingLine, headingPath });
    }
  };

  while (pos < to) {
    const nl = src.indexOf("\n", pos);
    const eol = nl === -1 || nl > to ? to : nl;
    const line = src.slice(pos, eol);
    const nextPos = eol < to ? eol + 1 : to;

    const fenceMatch = line.match(/^ {0,3}(`{3,}|~{3,})/);
    if (fenceMatch) {
      const marker = fenceMatch[1].charAt(0);
      if (fence === null) fence = marker;
      else if (fence === marker) fence = null;
    } else if (fence === null) {
      const heading = line.match(/^ {0,3}(#{1,6})\s+(.+?)\s*#*\s*$/);
      if (heading) {
        flush(pos);
        sectionStart = pos;
        const level = heading[1].length;
        const text = heading[2].trim();
        while (stack.length > 0 && stack[stack.length - 1].level >= level) {
          stack.pop();
        }
        stack.push({ level, text });
        headingLine = line.trim();
        headingPath = stack
          .map((s) => `${"#".repeat(s.level)} ${s.text}`)
          .join(" › ");
      }
    }

    pos = nextPos;
  }

  flush(to);
  return sections;
}

/* ── packing ────────────────────────────────────────────── */

function costOfText(text: string, unit: Unit): number {
  return unit === "chars" ? text.length : rawTokens(text);
}

function costOfRange(src: string, span: Span, unit: Unit): number {
  if (span.end <= span.start) return 0;
  return unit === "chars"
    ? span.end - span.start
    : rawTokens(src.slice(span.start, span.end));
}

interface Pair {
  from: number;
  to: number;
}

// Greedy pack with a backwards walk for overlap. The next chunk always starts
// at least one atom past the current one, so the loop can never stall.
function packAtoms(
  costs: number[],
  target: number,
  overlap: number,
  contextCost: number,
  budget: number,
): Pair[] {
  const n = costs.length;
  const prefix = new Float64Array(n + 1);
  for (let i = 0; i < n; i++) prefix[i + 1] = prefix[i] + costs[i];
  const range = (a: number, b: number): number => prefix[b] - prefix[a];

  const pairs: Pair[] = [];
  let i = 0;

  while (i < n && pairs.length < budget) {
    const extra = pairs.length === 0 ? 0 : contextCost;
    let j = i + 1;
    while (j < n && range(i, j + 1) + extra <= target) j++;
    pairs.push({ from: i, to: j });
    if (j >= n) break;

    let k = j;
    while (k > i + 1 && range(k - 1, j) <= overlap) k--;
    i = k;
  }

  return pairs;
}

interface RawChunk {
  start: number;
  end: number;
  leadLen: number;
  tailLen: number;
  context: string;
  headingPath: string;
}

// Lead/tail overlap lengths come from comparing a chunk's atom range with its
// neighbours', then get clamped so the two marked regions can never collide.
function chunksFromPairs(
  atoms: Span[],
  pairs: Pair[],
  contextText: string,
  headingPath: string,
): RawChunk[] {
  return pairs.map((pair, idx) => {
    const start = atoms[pair.from].start;
    const end = atoms[pair.to - 1].end;
    const prev = idx > 0 ? pairs[idx - 1] : null;
    const next = idx + 1 < pairs.length ? pairs[idx + 1] : null;
    const len = end - start;

    const leadRaw =
      prev && prev.to > pair.from ? atoms[prev.to - 1].end - start : 0;
    const tailRaw =
      next && next.from < pair.to ? end - atoms[next.from].start : 0;

    const leadLen = Math.max(0, Math.min(leadRaw, len));
    const tailLen = Math.max(0, Math.min(tailRaw, len - leadLen));

    return {
      start,
      end,
      leadLen,
      tailLen,
      context: idx === 0 ? "" : contextText,
      headingPath,
    };
  });
}

function windowFixed(
  from: number,
  to: number,
  windowChars: number,
  overlapChars: number,
  budget: number,
): RawChunk[] {
  const size = Math.max(1, Math.floor(windowChars));
  const ov = Math.max(0, Math.min(Math.floor(overlapChars), size - 1));
  const step = Math.max(1, size - ov);
  const out: RawChunk[] = [];

  for (let start = from; start < to && out.length < budget; start += step) {
    const end = Math.min(to, start + size);
    const len = end - start;
    const leadLen = start === from ? 0 : Math.min(ov, len);
    const hasNext = end < to;
    const tailLen = hasNext ? Math.max(0, Math.min(ov, len - leadLen)) : 0;
    out.push({ start, end, leadLen, tailLen, context: "", headingPath: "" });
    if (end >= to) break;
  }

  return out;
}

// Coarse units, recursively broken down until each one fits the target. The
// hard split at the bottom is the only place a sentence can be cut in half.
function buildAtoms(
  src: string,
  from: number,
  to: number,
  mode: "sentence" | "paragraph",
  unit: Unit,
  target: number,
  hardChars: number,
): Span[] {
  const coarse =
    mode === "sentence"
      ? splitSentences(src, from, to)
      : splitParagraphs(src, from, to);

  const out: Span[] = [];
  for (const span of coarse) {
    if (costOfRange(src, span, unit) <= target) {
      out.push(span);
      continue;
    }
    const subs =
      mode === "paragraph" ? splitSentences(src, span.start, span.end) : [span];
    if (subs.length > 1) {
      for (const sub of subs) {
        if (costOfRange(src, sub, unit) <= target) out.push(sub);
        else out.push(...splitHard(sub.start, sub.end, hardChars));
      }
    } else {
      out.push(...splitHard(span.start, span.end, hardChars));
    }
  }
  return out;
}

/* ── the split ──────────────────────────────────────────── */

interface Chunk {
  index: number;
  text: string;
  contextLen: number;
  leadLen: number;
  tailLen: number;
  tokens: number;
  chars: number;
  headingPath: string;
}

interface SplitResult {
  chunks: Chunk[];
  warnings: string[];
  sourceTokens: number;
  totalTokens: number;
  sourceChars: number;
}

interface SplitOptions {
  text: string;
  strategy: Strategy;
  unit: Unit;
  size: number;
  overlap: number;
}

const EMPTY_RESULT: SplitResult = {
  chunks: [],
  warnings: [],
  sourceTokens: 0,
  totalTokens: 0,
  sourceChars: 0,
};

function buildRawChunks(
  src: string,
  strategy: Strategy,
  unit: Unit,
  size: number,
  overlap: number,
  charsPerToken: number,
): RawChunk[] {
  if (strategy === "fixed") {
    const windowChars =
      unit === "chars" ? size : Math.max(1, Math.round(size * charsPerToken));
    const overlapChars =
      unit === "chars" ? overlap : Math.round(overlap * charsPerToken);
    return windowFixed(0, src.length, windowChars, overlapChars, MAX_CHUNKS);
  }

  const hardChars =
    unit === "chars"
      ? Math.max(1, Math.floor(size))
      : Math.max(1, Math.round(size * charsPerToken));

  if (strategy === "markdown") {
    const out: RawChunk[] = [];
    for (const section of splitMarkdownSections(src, 0, src.length)) {
      if (out.length >= MAX_CHUNKS) break;
      const contextText = section.headingLine ? `${section.headingLine}\n` : "";
      const contextCost = costOfText(contextText, unit);
      const atoms = buildAtoms(
        src,
        section.start,
        section.end,
        "paragraph",
        unit,
        size,
        hardChars,
      );
      if (atoms.length === 0) continue;
      const costs = atoms.map((a) => costOfRange(src, a, unit));
      const pairs = packAtoms(
        costs,
        size,
        overlap,
        contextCost,
        MAX_CHUNKS - out.length,
      );
      out.push(
        ...chunksFromPairs(atoms, pairs, contextText, section.headingPath),
      );
    }
    return out;
  }

  const atoms = buildAtoms(src, 0, src.length, strategy, unit, size, hardChars);
  if (atoms.length === 0) return [];
  const costs = atoms.map((a) => costOfRange(src, a, unit));
  const pairs = packAtoms(costs, size, overlap, 0, MAX_CHUNKS);
  return chunksFromPairs(atoms, pairs, "", "");
}

function splitText(options: SplitOptions): SplitResult {
  const warnings: string[] = [];
  const raw = options.text;

  if (raw.trim() === "") return EMPTY_RESULT;

  let src = raw;
  if (src.length > MAX_INPUT_CHARS) {
    src = src.slice(0, MAX_INPUT_CHARS);
    warnings.push(
      `Input is longer than ${MAX_INPUT_CHARS.toLocaleString("en-US")} characters — only the first ${MAX_INPUT_CHARS.toLocaleString("en-US")} are analysed here.`,
    );
  }

  if (!Number.isFinite(options.size) || options.size < 1) {
    return {
      ...EMPTY_RESULT,
      warnings: [
        ...warnings,
        `Chunk size has to be at least 1 ${options.unit === "chars" ? "character" : "token"}.`,
      ],
      sourceChars: src.length,
      sourceTokens: estimateTokens(src),
    };
  }

  const size = Math.floor(options.size);
  let overlap =
    Number.isFinite(options.overlap) && options.overlap > 0
      ? Math.floor(options.overlap)
      : 0;

  if (overlap >= size) {
    const clamped = Math.floor(size * 0.9);
    warnings.push(
      `Overlap (${overlap.toLocaleString("en-US")}) is not smaller than the chunk size (${size.toLocaleString("en-US")}). A hand-rolled splitter loops forever here; this one clamped the overlap to ${clamped.toLocaleString("en-US")}.`,
    );
    overlap = clamped;
  } else if (overlap > size * 0.4) {
    warnings.push(
      `Overlap is ${Math.round((overlap / size) * 100)}% of the chunk size. Above roughly 30% you are mostly paying to store near-duplicate vectors that compete with each other in the top-k.`,
    );
  }

  const sourceRaw = rawTokens(src);
  const charsPerToken =
    sourceRaw > 0
      ? Math.min(24, Math.max(1, src.length / sourceRaw))
      : CHARS_PER_TOKEN_FALLBACK;

  const rawChunks = buildRawChunks(
    src,
    options.strategy,
    options.unit,
    size,
    overlap,
    charsPerToken,
  );

  const chunks: Chunk[] = rawChunks.map((chunk, i) => {
    const text = chunk.context + src.slice(chunk.start, chunk.end);
    return {
      index: i + 1,
      text,
      contextLen: chunk.context.length,
      leadLen: chunk.leadLen,
      tailLen: chunk.tailLen,
      tokens: estimateTokens(text),
      chars: text.length,
      headingPath: chunk.headingPath,
    };
  });

  if (chunks.length >= MAX_CHUNKS) {
    warnings.push(
      `Stopped at ${MAX_CHUNKS.toLocaleString("en-US")} chunks. Raise the chunk size or lower the overlap — this many chunks from one document is a configuration problem, not a corpus.`,
    );
  }

  const oversized = chunks.filter((c) => c.tokens > EMBED_TOKEN_LIMIT).length;
  if (oversized > 0) {
    warnings.push(
      `${oversized} chunk${oversized === 1 ? "" : "s"} exceed ${EMBED_TOKEN_LIMIT.toLocaleString("en-US")} tokens, the input limit on most embedding models. The API truncates rather than rejecting, so the tail is dropped without an error.`,
    );
  }

  const totalTokens = chunks.reduce((sum, c) => sum + c.tokens, 0);

  return {
    chunks,
    warnings,
    sourceTokens: estimateTokens(src),
    totalTokens,
    sourceChars: src.length,
  };
}

/* ── rendering ──────────────────────────────────────────── */

const TINT: Record<"context" | "overlap", string> = {
  context: "bg-cyan/40 border-ink/40 border-b-[2px]",
  overlap: "bg-pink/30 border-ink/40 border-b-[2px]",
};

const TINT_TITLE: Record<"context" | "overlap", string> = {
  context: "Heading re-injected so this chunk keeps its section context",
  overlap: "Overlap — this text is also embedded in a neighbouring chunk",
};

function tintedSpan(text: string, kind: "context" | "overlap"): HTMLElement {
  const span = document.createElement("span");
  span.className = TINT[kind];
  span.title = TINT_TITLE[kind];
  span.textContent = text;
  return span;
}

function metaBadge(text: string): HTMLElement {
  const span = document.createElement("span");
  span.className =
    "mono text-[10px] font-bold tracking-widest uppercase opacity-70";
  span.textContent = text;
  return span;
}

function appendChunkText(target: HTMLElement, chunk: Chunk): void {
  const len = chunk.text.length;
  const contextEnd = Math.min(chunk.contextLen, len);
  const leadEnd = Math.min(contextEnd + chunk.leadLen, len);
  const tailStart = Math.max(leadEnd, len - chunk.tailLen);

  if (contextEnd > 0) {
    target.append(tintedSpan(chunk.text.slice(0, contextEnd), "context"));
  }
  if (leadEnd > contextEnd) {
    target.append(tintedSpan(chunk.text.slice(contextEnd, leadEnd), "overlap"));
  }
  if (tailStart > leadEnd) {
    target.append(
      document.createTextNode(chunk.text.slice(leadEnd, tailStart)),
    );
  }
  if (len > tailStart) {
    target.append(tintedSpan(chunk.text.slice(tailStart), "overlap"));
  }
}

function chunkCard(chunk: Chunk): HTMLElement {
  const article = document.createElement("article");
  article.className =
    "border-ink bg-paper shadow-neo-sm overflow-hidden rounded-[4px] border-[3px]";

  const header = document.createElement("header");
  header.className =
    "border-ink flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b-[2.5px] px-3 py-2";

  const index = document.createElement("span");
  index.className =
    "mono bg-ink text-bg rounded-full px-2 py-0.5 text-[10px] font-bold tracking-widest uppercase";
  index.textContent = `#${chunk.index}`;
  header.append(index);

  header.append(metaBadge(`~${chunk.tokens.toLocaleString("en-US")} tokens`));
  header.append(metaBadge(`${chunk.chars.toLocaleString("en-US")} chars`));

  if (chunk.headingPath) {
    const path = metaBadge(chunk.headingPath);
    path.classList.add("truncate", "max-w-full");
    path.title = chunk.headingPath;
    header.append(path);
  }

  if (chunk.tokens > EMBED_TOKEN_LIMIT) {
    const warn = document.createElement("span");
    warn.className =
      "mono border-ink bg-red rounded-full border-[2px] px-2 py-0.5 text-[10px] font-bold tracking-widest uppercase";
    warn.textContent = `▲ over ${EMBED_TOKEN_LIMIT.toLocaleString("en-US")}`;
    header.append(warn);
  }

  const pre = document.createElement("pre");
  pre.className =
    "px-3 py-3 font-mono text-xs leading-relaxed whitespace-pre-wrap break-words";
  appendChunkText(pre, chunk);

  article.append(header, pre);
  return article;
}

function emptyState(message: string): HTMLElement {
  const p = document.createElement("p");
  p.className =
    "border-ink bg-bg-alt mono rounded-[4px] border-[3px] border-dashed px-4 py-6 text-center text-[11px] font-bold tracking-widest uppercase opacity-70";
  p.textContent = message;
  return p;
}

/* ── formatting ─────────────────────────────────────────── */

function formatUsd(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "$0";
  if (value < 0.0001) return "<$0.0001";
  if (value < 1) return `$${value.toFixed(4)}`;
  return `$${value.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
}

function readNumber(el: HTMLInputElement): number {
  const raw = el.value.trim();
  if (raw === "") return Number.NaN;
  const n = Number(raw);
  return Number.isFinite(n) ? n : Number.NaN;
}

function isStrategy(value: string): value is Strategy {
  return (
    value === "fixed" ||
    value === "sentence" ||
    value === "paragraph" ||
    value === "markdown"
  );
}

/* ── wiring ─────────────────────────────────────────────── */

interface Controls {
  input: HTMLTextAreaElement;
  strategy: HTMLSelectElement;
  size: HTMLInputElement;
  overlap: HTMLInputElement;
  price: HTMLInputElement;
}

function readControls(): Controls | null {
  const input = document.getElementById("rag-chunk-splitter-input");
  const strategy = document.getElementById("rag-chunk-splitter-strategy");
  const size = document.getElementById("rag-chunk-splitter-size");
  const overlap = document.getElementById("rag-chunk-splitter-overlap");
  const price = document.getElementById("rag-chunk-splitter-price");

  if (
    !(input instanceof HTMLTextAreaElement) ||
    !(strategy instanceof HTMLSelectElement) ||
    !(size instanceof HTMLInputElement) ||
    !(overlap instanceof HTMLInputElement) ||
    !(price instanceof HTMLInputElement)
  ) {
    return null;
  }

  return { input, strategy, size, overlap, price };
}

function init(): void {
  const root = document.getElementById("rag-chunk-splitter-root");
  if (!root || root.dataset.bound === "1") return;

  const controls = readControls();
  if (!controls) return;
  const { input, strategy, size, overlap, price } = controls;

  root.dataset.bound = "1";

  const listEl = document.getElementById("rag-chunk-splitter-list");
  const noteEl = document.getElementById("rag-chunk-splitter-note");
  const warningsEl = document.getElementById("rag-chunk-splitter-warnings");
  const warningsListEl = document.getElementById(
    "rag-chunk-splitter-warnings-list",
  );
  const strategyHintEl = document.getElementById(
    "rag-chunk-splitter-strategy-hint",
  );
  const sourceStatsEl = document.getElementById(
    "rag-chunk-splitter-source-stats",
  );
  const countEl = document.getElementById("rag-chunk-splitter-count");
  const avgEl = document.getElementById("rag-chunk-splitter-avg");
  const minMaxEl = document.getElementById("rag-chunk-splitter-minmax");
  const totalEl = document.getElementById("rag-chunk-splitter-total");
  const dupeEl = document.getElementById("rag-chunk-splitter-dupe");
  const costEl = document.getElementById("rag-chunk-splitter-cost");
  const copyBtn = document.getElementById("rag-chunk-splitter-copy");
  const copyLabel = document.getElementById("rag-chunk-splitter-copy-label");
  const sampleBtn = document.getElementById("rag-chunk-splitter-sample");
  const clearBtn = document.getElementById("rag-chunk-splitter-clear");

  const unitButtons = Array.from(
    root.querySelectorAll<HTMLButtonElement>("[data-unit]"),
  );
  const unitLabels = Array.from(
    root.querySelectorAll<HTMLElement>("[data-unit-label]"),
  );

  let unit: Unit = "tokens";
  let latest: Chunk[] = [];
  let renderTimer = 0;
  let copyTimer = 0;

  const setText = (el: HTMLElement | null, value: string): void => {
    if (el) el.textContent = value;
  };

  function applyUnitLabels(): void {
    const word = unit === "chars" ? "characters" : "tokens";
    for (const el of unitLabels) el.textContent = word;
    for (const btn of unitButtons) {
      const pressed = btn.dataset.unit === unit;
      btn.setAttribute("aria-pressed", pressed ? "true" : "false");
      btn.classList.toggle("bg-yellow", pressed);
      btn.classList.toggle("shadow-neo-sm", pressed);
      btn.classList.toggle("bg-bg-alt", !pressed);
    }
  }

  function setUnit(next: Unit, convert: boolean): void {
    if (next === unit) return;
    if (convert) {
      const factor = next === "chars" ? 4 : 0.25;
      const sizeValue = readNumber(size);
      const overlapValue = readNumber(overlap);
      if (Number.isFinite(sizeValue)) {
        size.value = String(Math.max(1, Math.round(sizeValue * factor)));
      }
      if (Number.isFinite(overlapValue)) {
        overlap.value = String(Math.max(0, Math.round(overlapValue * factor)));
      }
    }
    unit = next;
    applyUnitLabels();
    render();
  }

  function renderWarnings(warnings: string[]): void {
    if (!warningsEl) return;
    if (warnings.length === 0) {
      warningsEl.hidden = true;
      if (warningsListEl) warningsListEl.replaceChildren();
      return;
    }
    warningsEl.hidden = false;
    if (!warningsListEl) return;
    const frag = document.createDocumentFragment();
    for (const message of warnings) {
      const li = document.createElement("li");
      li.textContent = message;
      frag.append(li);
    }
    warningsListEl.replaceChildren(frag);
  }

  function renderStats(result: SplitResult): void {
    const { chunks } = result;
    setText(countEl, chunks.length.toLocaleString("en-US"));

    if (chunks.length === 0) {
      setText(avgEl, "—");
      setText(minMaxEl, "—");
      setText(totalEl, "—");
      setText(dupeEl, "—");
      setText(costEl, "—");
      return;
    }

    const tokens = chunks.map((c) => c.tokens);
    const avg = Math.round(result.totalTokens / chunks.length);
    const min = Math.min(...tokens);
    const max = Math.max(...tokens);
    const duplicated = Math.max(0, result.totalTokens - result.sourceTokens);
    const dupePct =
      result.sourceTokens > 0
        ? Math.round((duplicated / result.sourceTokens) * 100)
        : 0;

    const priceValue = readNumber(price);
    const perMillion =
      Number.isFinite(priceValue) && priceValue > 0 ? priceValue : 0;

    setText(avgEl, `~${avg.toLocaleString("en-US")}`);
    setText(
      minMaxEl,
      `${min.toLocaleString("en-US")} / ${max.toLocaleString("en-US")}`,
    );
    setText(totalEl, `~${result.totalTokens.toLocaleString("en-US")}`);
    setText(
      dupeEl,
      duplicated === 0
        ? "none"
        : `+${duplicated.toLocaleString("en-US")} (${dupePct}%)`,
    );
    setText(costEl, formatUsd((result.totalTokens / 1_000_000) * perMillion));
  }

  function renderList(chunks: Chunk[]): void {
    if (!listEl) return;

    if (chunks.length === 0) {
      listEl.replaceChildren(
        emptyState("Nothing to split yet — paste text or load the sample."),
      );
      if (noteEl) noteEl.hidden = true;
      return;
    }

    const shown = chunks.slice(0, MAX_RENDERED);
    const frag = document.createDocumentFragment();
    for (const chunk of shown) frag.append(chunkCard(chunk));
    listEl.replaceChildren(frag);

    if (noteEl) {
      if (chunks.length > shown.length) {
        noteEl.hidden = false;
        noteEl.textContent = `▸ Showing the first ${shown.length.toLocaleString("en-US")} of ${chunks.length.toLocaleString("en-US")} chunks. The stats above cover all of them.`;
      } else {
        noteEl.hidden = true;
      }
    }
  }

  function render(): void {
    const rawStrategy = strategy.value;
    const result = splitText({
      text: input.value,
      strategy: isStrategy(rawStrategy) ? rawStrategy : "sentence",
      unit,
      size: readNumber(size),
      overlap: readNumber(overlap),
    });

    latest = result.chunks;

    setText(
      sourceStatsEl,
      `▸ ${input.value.length.toLocaleString("en-US")} characters · ~${estimateTokens(
        input.value,
      ).toLocaleString("en-US")} tokens`,
    );
    setText(
      strategyHintEl,
      STRATEGY_HINTS[isStrategy(rawStrategy) ? rawStrategy : "sentence"],
    );

    renderWarnings(result.warnings);
    renderStats(result);
    renderList(result.chunks);

    if (copyBtn instanceof HTMLButtonElement) {
      copyBtn.disabled = result.chunks.length === 0;
    }
  }

  function scheduleRender(): void {
    window.clearTimeout(renderTimer);
    renderTimer = window.setTimeout(render, 120);
  }

  input.addEventListener("input", scheduleRender);
  for (const el of [strategy, size, overlap, price]) {
    el.addEventListener("input", render);
    el.addEventListener("change", render);
  }

  for (const btn of unitButtons) {
    btn.addEventListener("click", () => {
      const next = btn.dataset.unit;
      if (next === "chars" || next === "tokens") setUnit(next, true);
    });
  }

  root
    .querySelectorAll<HTMLButtonElement>("[data-preset-size]")
    .forEach((btn) => {
      btn.addEventListener("click", () => {
        const data = btn.dataset;
        if (data.presetUnit === "chars" || data.presetUnit === "tokens") {
          unit = data.presetUnit;
          applyUnitLabels();
        }
        if (data.presetStrategy && isStrategy(data.presetStrategy)) {
          strategy.value = data.presetStrategy;
        }
        if (data.presetSize) size.value = data.presetSize;
        if (data.presetOverlap) overlap.value = data.presetOverlap;
        render();
      });
    });

  sampleBtn?.addEventListener("click", () => {
    input.value = SAMPLE;
    render();
  });

  clearBtn?.addEventListener("click", () => {
    input.value = "";
    input.focus();
    render();
  });

  function flashCopyLabel(text: string): void {
    if (!copyLabel) return;
    copyLabel.textContent = text;
    window.clearTimeout(copyTimer);
    copyTimer = window.setTimeout(() => {
      copyLabel.textContent = "Copy chunks as JSON";
    }, 1500);
  }

  copyBtn?.addEventListener("click", async () => {
    if (latest.length === 0) return;
    const payload = JSON.stringify(
      latest.map((c) => ({
        index: c.index,
        tokens: c.tokens,
        chars: c.chars,
        ...(c.headingPath ? { heading: c.headingPath } : {}),
        text: c.text,
      })),
      null,
      2,
    );
    try {
      await navigator.clipboard.writeText(payload);
      flashCopyLabel("Copied!");
    } catch {
      flashCopyLabel("Copy blocked");
    }
  });

  applyUnitLabels();
  render();
}

init();
document.addEventListener("astro:after-swap", init);

export {};
