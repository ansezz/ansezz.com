// Strict RFC 8259 JSON validator, formatter, minifier and key sorter.
// Everything happens in this tab — no upload, no network call.
//
// Locating errors: JSON.parse's SyntaxError text is engine-specific. V8 appends
// "at position N (line L column C)", SpiderMonkey says "at line L column C of
// the JSON data", JavaScriptCore usually gives no position at all. So this tool
// runs its own iterative scanner first: it returns the exact offset of the first
// grammar violation plus a human fix, and on the same pass collects duplicate
// keys, integers that lose precision past 2^53, container counts and max depth.
// JSON.parse still does the decoding; if it ever disagrees with the scanner, the
// engine's own message is mined for a position as a fallback.

const MAX_DEPTH = 500;
const LIVE_LIMIT_BYTES = 2 * 1024 * 1024;
const BIG_DOC_BYTES = 512 * 1024;
const MAX_NOTES_PER_KIND = 4;
const LINE_WIDTH = 96;
const DEBOUNCE_MS = 180;

const VALID_ESCAPES = new Set(['"', "\\", "/", "b", "f", "n", "r", "t"]);
const NUMBER_SHAPE = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$/;
const NUMBER_RUN = /[+\-.\w]+/y;
const WORD_RUN = /[A-Za-z_$][\w$]*/y;
const INDEX_KEY = /^(?:0|[1-9]\d{0,8})$/;

const TRAILING_COMMA_HINT =
  "JSON has no trailing commas — that is JSON5 and JavaScript. Delete the comma before the closing bracket.";
const UNQUOTED_KEY_HINT =
  'Every object key must be a double-quoted string: {"id": 1}, not {id: 1}. This is what a JavaScript object literal looks like when it was printed instead of serialized.';

type Json = string | number | boolean | null | Json[] | { [key: string]: Json };
type Indent = 2 | 4 | "\t";
type Mode = "format" | "minify";

interface Issue {
  index: number;
  message: string;
  hint: string;
}

interface KeyNote {
  key: string;
  index: number;
}

interface NumberNote {
  literal: string;
  reparsed: string;
  index: number;
}

interface Analysis {
  depth: number;
  objects: number;
  arrays: number;
  keys: number;
  duplicates: KeyNote[];
  duplicateTotal: number;
  bigNumbers: NumberNote[];
  bigNumberTotal: number;
  indexKeyObjects: number;
}

type ScanResult =
  | { ok: true; analysis: Analysis }
  | { ok: false; issue: Issue };
type TokenResult = { ok: true; end: number } | { ok: false; issue: Issue };
type NumberToken =
  | { ok: true; end: number; literal: string }
  | { ok: false; issue: Issue };

// ── small helpers ──────────────────────────────────────────

function issue(index: number, message: string, hint: string): Issue {
  return { index, message, hint };
}

function isWhitespace(ch: string): boolean {
  return ch === " " || ch === "\n" || ch === "\r" || ch === "\t";
}

function describeChar(ch: string): string {
  if (ch === "") return "the end of the input";
  if (ch === '"') return 'a quote (")';
  const code = ch.charCodeAt(0);
  if (code < 0x20) {
    return `control character U+${code.toString(16).toUpperCase().padStart(4, "0")}`;
  }
  return `"${ch}"`;
}

// ── token scanners ─────────────────────────────────────────

function scanString(src: string, start: number): TokenResult {
  let i = start + 1;
  for (;;) {
    const ch = src.charAt(i);
    if (ch === "") {
      return {
        ok: false,
        issue: issue(
          start,
          "Unterminated string — the input ends before the closing quote.",
          'A " opens a string that must be closed by another ". A quote inside the text has to be escaped as \\".',
        ),
      };
    }
    if (ch === '"') return { ok: true, end: i + 1 };
    if (ch === "\\") {
      const esc = src.charAt(i + 1);
      if (esc === "") {
        return {
          ok: false,
          issue: issue(
            i,
            "The input ends on a backslash.",
            "A backslash always starts an escape sequence, so it can never be the last character of a string.",
          ),
        };
      }
      if (esc === "u") {
        if (!/^[0-9a-fA-F]{4}$/.test(src.slice(i + 2, i + 6))) {
          return {
            ok: false,
            issue: issue(
              i,
              "\\u must be followed by exactly four hex digits.",
              "Unicode escapes look like \\u00e9, or a surrogate pair such as \\ud83d\\ude80. Shorter forms and \\x are JavaScript, not JSON.",
            ),
          };
        }
        i += 6;
        continue;
      }
      if (!VALID_ESCAPES.has(esc)) {
        return {
          ok: false,
          issue: issue(
            i,
            `\\${esc} is not a valid JSON escape.`,
            'JSON allows \\" \\\\ \\/ \\b \\f \\n \\r \\t and \\uXXXX — nothing else. A Windows path needs every backslash doubled: "C:\\\\Users".',
          ),
        };
      }
      i += 2;
      continue;
    }
    if (ch.charCodeAt(0) < 0x20) {
      return {
        ok: false,
        issue: issue(
          i,
          `Raw ${describeChar(ch)} inside a string.`,
          "A literal newline or tab cannot sit inside a JSON string — escape them as \\n and \\t. This is the classic failure of JSON built by string concatenation.",
        ),
      };
    }
    i++;
  }
}

function numberHint(literal: string): string {
  if (/^[+-]?0[xXbBoO]/.test(literal)) {
    return "Hex, octal and binary literals are JavaScript. JSON numbers are decimal only — write the value out.";
  }
  if (literal.startsWith("+")) {
    return "A leading + is not allowed. Write 12, not +12.";
  }
  if (/^-?0\d/.test(literal)) {
    return "Leading zeros are not allowed. 007 has to be 7 — and if it is an ID, a zip code or a phone number, quote it as a string instead.";
  }
  if (/^-?\./.test(literal)) {
    return "A number must start with a digit: 0.5, not .5.";
  }
  if (literal.endsWith(".")) {
    return "A number cannot end with a decimal point: write 5 or 5.0.";
  }
  if (literal.includes("_")) {
    return "Numeric separators (1_000_000) are JavaScript, not JSON.";
  }
  if (/infinity|nan/i.test(literal)) {
    return "JSON has no NaN and no Infinity. JSON.stringify silently writes null for both, so encode them as strings or as null plus an explicit flag.";
  }
  if (/[eE][+-]?$/.test(literal)) {
    return "An exponent needs digits after it: 1e6, 2.5e-3.";
  }
  return "JSON numbers are -?int(.frac)?(e±exp)? — no hex, no leading +, no trailing dot, no thousands separators.";
}

function scanNumber(src: string, start: number): NumberToken {
  NUMBER_RUN.lastIndex = start;
  const match = NUMBER_RUN.exec(src);
  const literal = match === null ? src.charAt(start) : match[0];
  if (NUMBER_SHAPE.test(literal)) {
    return { ok: true, end: start + literal.length, literal };
  }
  return {
    ok: false,
    issue: issue(
      start,
      `"${literal}" is not a valid JSON number.`,
      numberHint(literal),
    ),
  };
}

// Returns how the literal comes back out of JSON.parse when the round trip is
// lossy, or null when the value survives exactly.
function precisionLoss(literal: string): string | null {
  const value = Number(literal);
  if (!Number.isFinite(value)) return "Infinity";
  if (!/^-?\d+$/.test(literal)) return null;
  if (Number.isSafeInteger(value)) return null;
  const reparsed = BigInt(value);
  return reparsed === BigInt(literal) ? null : reparsed.toString();
}

function wordAt(src: string, start: number): string {
  WORD_RUN.lastIndex = start;
  const match = WORD_RUN.exec(src);
  return match === null ? "" : match[0];
}

function decodeKey(src: string, start: number, end: number): string {
  const raw = src.slice(start, end);
  if (!raw.includes("\\")) return raw.slice(1, -1);
  try {
    const parsed: unknown = JSON.parse(raw);
    return typeof parsed === "string" ? parsed : raw;
  } catch {
    return raw;
  }
}

// ── issue builders ─────────────────────────────────────────

function commentIssue(index: number): Issue {
  return issue(
    index,
    "Comments are not valid JSON.",
    "// and /* */ are JSONC — the dialect tsconfig.json, .eslintrc and VS Code settings accept. JSON.parse rejects them. Strip the comments, or read the file with a JSONC-aware parser.",
  );
}

function singleQuoteIssue(index: number): Issue {
  return issue(
    index,
    "Single-quoted string.",
    "JSON strings are double-quoted, always. A single quote here almost always means a Python repr or a JavaScript object literal got printed instead of serialized — use json.dumps() or JSON.stringify().",
  );
}

function unexpectedValue(src: string, index: number): Issue {
  const ch = src.charAt(index);
  const word = wordAt(src, index);
  if (word === "NaN" || word === "Infinity") {
    return issue(
      index,
      `${word} is not valid JSON.`,
      "JSON has no NaN and no Infinity. JSON.stringify writes null for both, which is rarely what the reader expects — send a string, or null plus an explicit flag.",
    );
  }
  if (word === "undefined") {
    return issue(
      index,
      "undefined is not valid JSON.",
      "JSON.stringify drops undefined object properties entirely and turns undefined array elements into null. Something serialized a raw JavaScript value here.",
    );
  }
  if (word === "True" || word === "False" || word === "None") {
    return issue(
      index,
      `${word} is Python, not JSON.`,
      "This is str(dict) output, not JSON. Use json.dumps() — JSON booleans are true and false, and its null is null.",
    );
  }
  if (word !== "") {
    return issue(
      index,
      `"${word}" is not a JSON value.`,
      `Bare words are not allowed. If it is text, quote it as "${word}". The only unquoted values JSON knows are true, false and null.`,
    );
  }
  return issue(
    index,
    `Unexpected ${describeChar(ch)} where a value was expected.`,
    "A value is an object, an array, a string, a number, true, false or null.",
  );
}

function trailingContent(src: string, index: number): Issue {
  const rest = src.slice(index, index + 200).trimStart();
  if (rest.startsWith("{") || rest.startsWith("[")) {
    return issue(
      index,
      "A second value starts after the first one ended.",
      "A JSON document holds exactly one value. If every line is its own object, that is NDJSON (JSON Lines) — split on newlines and parse each line separately instead of parsing the whole file at once.",
    );
  }
  return issue(
    index,
    `Extra content after the end of the JSON value: ${describeChar(src.charAt(index))}.`,
    "Everything after the top-level value has to be whitespace. Stray characters here usually mean two payloads got concatenated, or a shell captured a prompt along with the output.",
  );
}

// ── the scanner ────────────────────────────────────────────

type State =
  | "value"
  | "arrayStart"
  | "objectStart"
  | "objectKey"
  | "colon"
  | "afterValue";

type StepResult = Issue | "done" | null;

interface Frame {
  kind: "object" | "array";
  keys: Set<string> | null;
  indexKey: boolean;
  flagged: boolean;
}

interface Ctx {
  src: string;
  i: number;
  state: State;
  stack: Frame[];
  depth: number;
  objects: number;
  arrays: number;
  keys: number;
  duplicates: KeyNote[];
  duplicateTotal: number;
  bigNumbers: NumberNote[];
  bigNumberTotal: number;
  indexKeyObjects: number;
}

function openContainer(ctx: Ctx, kind: "object" | "array"): StepResult {
  ctx.stack.push({
    kind,
    keys: kind === "object" ? new Set<string>() : null,
    indexKey: false,
    flagged: false,
  });
  if (ctx.stack.length > MAX_DEPTH) {
    return issue(
      ctx.i,
      `Nesting deeper than ${MAX_DEPTH} levels.`,
      "This tool stops there on purpose: recursive JSON parsers blow the call stack long before they finish, which is a real denial-of-service vector. If the data is genuine, flatten it; if it arrived from a client, reject it at the edge.",
    );
  }
  if (ctx.stack.length > ctx.depth) ctx.depth = ctx.stack.length;
  if (kind === "object") ctx.objects++;
  else ctx.arrays++;
  ctx.i++;
  ctx.state = kind === "object" ? "objectStart" : "arrayStart";
  return null;
}

function recordKey(ctx: Ctx, key: string, index: number): void {
  ctx.keys++;
  const frame = ctx.stack[ctx.stack.length - 1];
  if (!frame || frame.keys === null) return;
  if (frame.keys.has(key)) {
    ctx.duplicateTotal++;
    if (ctx.duplicates.length < MAX_NOTES_PER_KIND) {
      ctx.duplicates.push({ key, index });
    }
  } else {
    frame.keys.add(key);
  }
  if (INDEX_KEY.test(key)) frame.indexKey = true;
  if (!frame.flagged && frame.indexKey && frame.keys.size > 1) {
    frame.flagged = true;
    ctx.indexKeyObjects++;
  }
}

function recordNumber(ctx: Ctx, literal: string, index: number): void {
  const reparsed = precisionLoss(literal);
  if (reparsed === null) return;
  ctx.bigNumberTotal++;
  if (ctx.bigNumbers.length < MAX_NOTES_PER_KIND) {
    ctx.bigNumbers.push({ literal, reparsed, index });
  }
}

function stepValue(ctx: Ctx): StepResult {
  const ch = ctx.src.charAt(ctx.i);
  const frame = ctx.stack[ctx.stack.length - 1];
  if (ch === "") {
    return issue(
      ctx.i,
      "The input ends where a value was expected.",
      "Something got cut off — check for a truncated file or a copy that missed the tail.",
    );
  }
  if (ch === "," || (ch === "]" && frame?.kind !== "array")) {
    return issue(
      ctx.i,
      `Unexpected ${describeChar(ch)} where a value was expected.`,
      "Two commas in a row, a comma straight after [, or crossed brackets. JSON arrays have no holes — write null if you need an empty slot.",
    );
  }
  if (ch === "]") {
    return issue(ctx.i, "Trailing comma before ].", TRAILING_COMMA_HINT);
  }
  if (ch === "}") {
    return frame?.kind === "object"
      ? issue(
          ctx.i,
          "A key with no value.",
          "Object entries need a value after the colon. If the value is meant to be empty, write null.",
        )
      : issue(
          ctx.i,
          'Unexpected "}" where a value was expected.',
          "Brackets are crossed — a } is closing something that was opened with [.",
        );
  }
  if (ch === "{" || ch === "[") {
    return openContainer(ctx, ch === "{" ? "object" : "array");
  }
  if (ch === '"') {
    const token = scanString(ctx.src, ctx.i);
    if (!token.ok) return token.issue;
    ctx.i = token.end;
    ctx.state = "afterValue";
    return null;
  }
  if (ch === "-" || ch === "+" || ch === "." || (ch >= "0" && ch <= "9")) {
    const token = scanNumber(ctx.src, ctx.i);
    if (!token.ok) return token.issue;
    recordNumber(ctx, token.literal, ctx.i);
    ctx.i = token.end;
    ctx.state = "afterValue";
    return null;
  }
  const word = wordAt(ctx.src, ctx.i);
  if (word === "true" || word === "false" || word === "null") {
    ctx.i += word.length;
    ctx.state = "afterValue";
    return null;
  }
  return unexpectedValue(ctx.src, ctx.i);
}

function stepObjectKey(ctx: Ctx): StepResult {
  const ch = ctx.src.charAt(ctx.i);
  if (ch === "}") {
    return issue(ctx.i, "Trailing comma before }.", TRAILING_COMMA_HINT);
  }
  if (ch === "") {
    return issue(
      ctx.i,
      "The input ends where an object key was expected.",
      "The document stops mid-object — usually a truncated file or a stream that was read before it finished.",
    );
  }
  if (ch !== '"') {
    const word = wordAt(ctx.src, ctx.i);
    return issue(
      ctx.i,
      word === ""
        ? `Expected a quoted object key, found ${describeChar(ch)}.`
        : `Object key ${word} is not quoted.`,
      UNQUOTED_KEY_HINT,
    );
  }
  const token = scanString(ctx.src, ctx.i);
  if (!token.ok) return token.issue;
  recordKey(ctx, decodeKey(ctx.src, ctx.i, token.end), ctx.i);
  ctx.i = token.end;
  ctx.state = "colon";
  return null;
}

function stepColon(ctx: Ctx): StepResult {
  const ch = ctx.src.charAt(ctx.i);
  if (ch === ":") {
    ctx.i++;
    ctx.state = "value";
    return null;
  }
  if (ch === "=") {
    return issue(
      ctx.i,
      'Found "=" after a key.',
      'JSON separates a key from its value with a colon: {"a": 1}. An = means this is a config or query string, not JSON.',
    );
  }
  return issue(
    ctx.i,
    `Expected ":" after the key, found ${describeChar(ch)}.`,
    'Object entries are "key": value pairs. A missing colon usually means a comma was typed instead.',
  );
}

function stepAfterValue(ctx: Ctx): StepResult {
  const ch = ctx.src.charAt(ctx.i);
  const frame = ctx.stack[ctx.stack.length - 1];
  if (!frame) {
    return ch === "" ? "done" : trailingContent(ctx.src, ctx.i);
  }
  if (ch === "") {
    const open = ctx.stack.length;
    return issue(
      ctx.src.length,
      `The input ends with ${open} ${open === 1 ? "container" : "containers"} still open.`,
      "The document stops before its closing } or ] — usually a truncated file, a cut-off copy, or a response that was read before it finished streaming.",
    );
  }
  if (ch === ",") {
    ctx.i++;
    ctx.state = frame.kind === "array" ? "value" : "objectKey";
    return null;
  }
  const close = frame.kind === "array" ? "]" : "}";
  if (ch === close) {
    ctx.stack.pop();
    ctx.i++;
    ctx.state = "afterValue";
    return null;
  }
  if (ch === (frame.kind === "array" ? "}" : "]")) {
    return issue(
      ctx.i,
      `Found ${describeChar(ch)} but the open container is ${frame.kind === "array" ? "an array" : "an object"}.`,
      "Brackets are crossed — [ must close with ], { must close with }.",
    );
  }
  return issue(
    ctx.i,
    `Expected "," or "${close}" here, found ${describeChar(ch)}.`,
    "This is exactly where a missing comma between two entries lands. Add the comma, or close the container.",
  );
}

function step(ctx: Ctx): StepResult {
  switch (ctx.state) {
    case "value":
      return stepValue(ctx);
    case "objectKey":
      return stepObjectKey(ctx);
    case "colon":
      return stepColon(ctx);
    default:
      return stepAfterValue(ctx);
  }
}

function toAnalysis(ctx: Ctx): Analysis {
  return {
    depth: ctx.depth,
    objects: ctx.objects,
    arrays: ctx.arrays,
    keys: ctx.keys,
    duplicates: ctx.duplicates,
    duplicateTotal: ctx.duplicateTotal,
    bigNumbers: ctx.bigNumbers,
    bigNumberTotal: ctx.bigNumberTotal,
    indexKeyObjects: ctx.indexKeyObjects,
  };
}

function scanJson(src: string): ScanResult {
  if (src.charCodeAt(0) === 0xfeff) {
    return {
      ok: false,
      issue: issue(
        0,
        "The input starts with a UTF-8 byte order mark (U+FEFF).",
        'JSON.parse counts the BOM as an unexpected character before the first token. Strip it — text.replace(/^\\uFEFF/, "") in JavaScript, or open the file with encoding="utf-8-sig" in Python.',
      ),
    };
  }

  const ctx: Ctx = {
    src,
    i: 0,
    state: "value",
    stack: [],
    depth: 0,
    objects: 0,
    arrays: 0,
    keys: 0,
    duplicates: [],
    duplicateTotal: 0,
    bigNumbers: [],
    bigNumberTotal: 0,
    indexKeyObjects: 0,
  };

  for (;;) {
    while (isWhitespace(ctx.src.charAt(ctx.i))) ctx.i++;
    const ch = ctx.src.charAt(ctx.i);
    const next = ctx.src.charAt(ctx.i + 1);

    if (ch === "/" && (next === "/" || next === "*")) {
      return { ok: false, issue: commentIssue(ctx.i) };
    }
    if (ch === "'") {
      return { ok: false, issue: singleQuoteIssue(ctx.i) };
    }
    if (ctx.state === "arrayStart") {
      if (ch === "]") {
        ctx.stack.pop();
        ctx.i++;
        ctx.state = "afterValue";
        continue;
      }
      ctx.state = "value";
    } else if (ctx.state === "objectStart") {
      if (ch === "}") {
        ctx.stack.pop();
        ctx.i++;
        ctx.state = "afterValue";
        continue;
      }
      ctx.state = "objectKey";
    }

    const result = step(ctx);
    if (result === "done") return { ok: true, analysis: toAnalysis(ctx) };
    if (result !== null) return { ok: false, issue: result };
  }
}

// ── position + caret rendering ─────────────────────────────

interface Position {
  line: number;
  column: number;
  lineStart: number;
  lineEnd: number;
}

function positionAt(src: string, index: number): Position {
  const clamped = Math.max(0, Math.min(index, src.length));
  let line = 1;
  let lineStart = 0;
  for (let i = 0; i < clamped; i++) {
    if (src.charCodeAt(i) === 10) {
      line++;
      lineStart = i + 1;
    }
  }
  const nextBreak = src.indexOf("\n", clamped);
  return {
    line,
    column: clamped - lineStart + 1,
    lineStart,
    lineEnd: nextBreak === -1 ? src.length : nextBreak,
  };
}

function offsetOf(src: string, line: number, column: number): number {
  let offset = 0;
  for (let n = 1; n < line; n++) {
    const next = src.indexOf("\n", offset);
    if (next === -1) return src.length;
    offset = next + 1;
  }
  return Math.min(offset + Math.max(0, column - 1), src.length);
}

function flatten(text: string): string {
  return text.replace(/\r$/, "").replace(/\t/g, "    ");
}

function clip(text: string): string {
  const flat = flatten(text);
  return flat.length > LINE_WIDTH ? `${flat.slice(0, LINE_WIDTH)}…` : flat;
}

function buildContext(src: string, index: number): string {
  const clamped = Math.max(0, Math.min(index, src.length));
  const pos = positionAt(src, clamped);
  const full = flatten(src.slice(pos.lineStart, pos.lineEnd));
  let caret = src.slice(pos.lineStart, clamped).replace(/\t/g, "    ").length;
  let shown = full;
  if (caret > LINE_WIDTH) {
    const from = caret - Math.floor(LINE_WIDTH / 2);
    shown = `…${full.slice(from)}`;
    caret = caret - from + 1;
  }
  if (shown.length > LINE_WIDTH + 8) {
    shown = `${shown.slice(0, LINE_WIDTH + 8)}…`;
  }

  const gutter = String(pos.line + 1).length;
  const label = (n: number): string => String(n).padStart(gutter, " ");
  const lines: string[] = [];

  if (pos.lineStart > 0) {
    const prevEnd = pos.lineStart - 1;
    const prevStart = prevEnd > 0 ? src.lastIndexOf("\n", prevEnd - 1) + 1 : 0;
    lines.push(
      `${label(pos.line - 1)} | ${clip(src.slice(prevStart, prevEnd))}`,
    );
  }
  lines.push(`${label(pos.line)} | ${shown}`);
  lines.push(`${" ".repeat(gutter)} | ${" ".repeat(caret)}^`);
  if (pos.lineEnd < src.length) {
    const nextStart = pos.lineEnd + 1;
    const nextBreak = src.indexOf("\n", nextStart);
    const nextEnd = nextBreak === -1 ? src.length : nextBreak;
    lines.push(
      `${label(pos.line + 1)} | ${clip(src.slice(nextStart, nextEnd))}`,
    );
  }
  return lines.join("\n");
}

// ── transforms + formatting ────────────────────────────────

function compareKeys(a: string, b: string): number {
  // Code-unit order, not localeCompare: the result has to be identical on every
  // machine, in every locale.
  return a < b ? -1 : a > b ? 1 : 0;
}

function sortDeep(value: Json, depth: number): Json {
  if (depth > MAX_DEPTH) return value;
  if (Array.isArray(value)) {
    return value.map((item) => sortDeep(item, depth + 1));
  }
  if (typeof value === "object" && value !== null) {
    const out: { [key: string]: Json } = {};
    for (const key of Object.keys(value).sort(compareKeys)) {
      out[key] = sortDeep(value[key], depth + 1);
    }
    return out;
  }
  return value;
}

const encoder = new TextEncoder();

function byteLength(text: string): number {
  return encoder.encode(text).length;
}

function fmt(n: number): string {
  return n.toLocaleString("en-US");
}

function fmtBytes(n: number): string {
  if (n < 1024) return `${fmt(n)} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function positionFromMessage(src: string, message: string): number | null {
  const atPosition = /at position (\d+)/i.exec(message);
  if (atPosition !== null) {
    return Math.min(Number(atPosition[1]), src.length);
  }
  const lineColumn = /line (\d+) column (\d+)/i.exec(message);
  if (lineColumn !== null) {
    return offsetOf(src, Number(lineColumn[1]), Number(lineColumn[2]));
  }
  return null;
}

// Only reached if JSON.parse disagrees with the scanner above, or gives up for a
// non-grammar reason (stack, memory).
function engineIssue(src: string, error: unknown): Issue {
  if (error instanceof RangeError) {
    return issue(
      0,
      "The browser's JSON parser ran out of room on this document.",
      "That means extreme nesting or extreme size. Process a document like this with a streaming parser (jq, ijson, a SAX-style reader) instead of loading it whole.",
    );
  }
  const message = messageOf(error);
  return issue(
    positionFromMessage(src, message) ?? 0,
    message,
    "The browser's own parser rejected this after the strict check passed. Position and wording come straight from the engine here, so they vary between Chrome, Firefox and Safari.",
  );
}

// ── DOM wiring ─────────────────────────────────────────────

function textareaById(id: string): HTMLTextAreaElement | null {
  const el = document.getElementById(id);
  return el instanceof HTMLTextAreaElement ? el : null;
}

function setText(el: HTMLElement | null, value: string): void {
  if (el) el.textContent = value;
}

function noteLine(src: string, index: number): number {
  return positionAt(src, index).line;
}

function collectNotes(
  src: string,
  analysis: Analysis,
  bytes: number,
): string[] {
  const notes: string[] = [];

  for (const dup of analysis.duplicates) {
    notes.push(
      `Duplicate key "${dup.key}" on line ${noteLine(src, dup.index)} — JSON.parse keeps the last one and silently discards the earlier value.`,
    );
  }
  if (analysis.duplicateTotal > analysis.duplicates.length) {
    notes.push(
      `…and ${fmt(analysis.duplicateTotal - analysis.duplicates.length)} more duplicate ${analysis.duplicateTotal - analysis.duplicates.length === 1 ? "key" : "keys"}.`,
    );
  }

  for (const big of analysis.bigNumbers) {
    notes.push(
      `${big.literal} on line ${noteLine(src, big.index)} comes back as ${big.reparsed} — past 2^53 a JSON number no longer round-trips.`,
    );
  }
  if (analysis.bigNumberTotal > analysis.bigNumbers.length) {
    notes.push(
      `…and ${fmt(analysis.bigNumberTotal - analysis.bigNumbers.length)} more ${analysis.bigNumberTotal - analysis.bigNumbers.length === 1 ? "number" : "numbers"} that lose precision.`,
    );
  }

  if (analysis.indexKeyObjects > 0) {
    notes.push(
      `${fmt(analysis.indexKeyObjects)} ${analysis.indexKeyObjects === 1 ? "object uses" : "objects use"} array-index-like keys ("0", "12"). JavaScript lists integer keys first, in ascending order, so the output key order can differ from your input. That is the language, not this tool.`,
    );
  }

  if (bytes > LIVE_LIMIT_BYTES) {
    notes.push(
      `${fmtBytes(bytes)} of JSON. Live validation is paused above 2 MB — use the buttons. The parse is fast; painting this much text into a textarea is what makes the browser crawl.`,
    );
  } else if (bytes > BIG_DOC_BYTES) {
    notes.push(
      `${fmtBytes(bytes)} of JSON. Past a few megabytes, reach for jq or python -m json.tool instead of a browser tab.`,
    );
  }

  return notes;
}

interface Panels {
  input: HTMLTextAreaElement;
  output: HTMLTextAreaElement;
}

function findPanels(): Panels | null {
  const input = textareaById("jsonf-input");
  const output = textareaById("jsonf-output");
  if (!input || !output) return null;
  return { input, output };
}

function init(): void {
  const root = document.getElementById("jsonf-root");
  if (!root || root.dataset.bound === "1") return;
  const panels = findPanels();
  if (!panels) return;
  root.dataset.bound = "1";

  const { input, output } = panels;
  const indentEl = document.getElementById("jsonf-indent");
  const statusEl = document.getElementById("jsonf-status");
  const errorEl = document.getElementById("jsonf-error");
  const errorTitle = document.getElementById("jsonf-error-title");
  const errorMessage = document.getElementById("jsonf-error-message");
  const errorHint = document.getElementById("jsonf-error-hint");
  const errorContext = document.getElementById("jsonf-error-context");
  const notesEl = document.getElementById("jsonf-notes");
  const sortBtn = document.getElementById("jsonf-sort");
  const modeButtons = Array.from(
    root.querySelectorAll<HTMLButtonElement>("[data-jsonf-mode]"),
  );

  let mode: Mode = "format";
  let sortKeys = false;
  let timer = 0;

  function currentIndent(): Indent {
    const value = indentEl instanceof HTMLSelectElement ? indentEl.value : "2";
    if (value === "tab") return "\t";
    return value === "4" ? 4 : 2;
  }

  function setStat(id: string, value: string): void {
    setText(document.getElementById(id), value);
  }

  function clearStats(): void {
    for (const id of [
      "jsonf-stat-output",
      "jsonf-stat-minified",
      "jsonf-stat-saved",
      "jsonf-stat-keys",
      "jsonf-stat-depth",
      "jsonf-stat-objects",
      "jsonf-stat-arrays",
    ]) {
      setStat(id, "—");
    }
  }

  function renderNotes(notes: string[]): void {
    if (!notesEl) return;
    notesEl.textContent = "";
    for (const note of notes) {
      const li = document.createElement("li");
      li.className = "flex gap-2 text-sm leading-snug";
      const bullet = document.createElement("span");
      bullet.setAttribute("aria-hidden", "true");
      bullet.className = "font-bold";
      bullet.textContent = "▸";
      const body = document.createElement("span");
      body.textContent = note;
      li.append(bullet, body);
      notesEl.append(li);
    }
  }

  function hideError(): void {
    if (errorEl) errorEl.hidden = true;
  }

  function showFailure(src: string, problem: Issue): void {
    output.value = "";
    const pos = positionAt(src, problem.index);
    setText(errorTitle, `Line ${fmt(pos.line)}, column ${fmt(pos.column)}`);
    setText(errorMessage, problem.message);
    setText(errorHint, problem.hint);
    setText(errorContext, buildContext(src, problem.index));
    if (errorEl) errorEl.hidden = false;
    setText(
      statusEl,
      `Invalid JSON — line ${fmt(pos.line)}, column ${fmt(pos.column)}.`,
    );
    setStat("jsonf-stat-input", fmtBytes(byteLength(src)));
    clearStats();
    renderNotes([]);
  }

  function reset(): void {
    output.value = "";
    hideError();
    setText(statusEl, "Paste JSON above to validate it.");
    setStat("jsonf-stat-input", "—");
    clearStats();
    renderNotes([]);
  }

  function showStats(
    src: string,
    formatted: string,
    minified: string,
    analysis: Analysis,
    bytes: number,
  ): void {
    const minBytes = byteLength(minified);
    const saved = bytes - minBytes;
    const pct = bytes === 0 ? 0 : Math.round((saved / bytes) * 100);
    setStat("jsonf-stat-input", fmtBytes(bytes));
    setStat("jsonf-stat-output", fmtBytes(byteLength(formatted)));
    setStat("jsonf-stat-minified", fmtBytes(minBytes));
    setStat(
      "jsonf-stat-saved",
      saved === 0
        ? "0 B (0%)"
        : saved > 0
          ? `−${fmtBytes(saved)} (${pct}%)`
          : `+${fmtBytes(-saved)}`,
    );
    setStat("jsonf-stat-keys", fmt(analysis.keys));
    setStat("jsonf-stat-depth", fmt(analysis.depth));
    setStat("jsonf-stat-objects", fmt(analysis.objects));
    setStat("jsonf-stat-arrays", fmt(analysis.arrays));
    renderNotes(collectNotes(src, analysis, bytes));
  }

  function describeMode(): string {
    if (mode === "minify") {
      return sortKeys ? "minified, keys sorted" : "minified";
    }
    const indent = currentIndent();
    const label = indent === "\t" ? "tab" : `${indent}-space`;
    return sortKeys ? `${label} indent, keys sorted` : `${label} indent`;
  }

  function render(force: boolean): void {
    const text = input.value;
    if (text.trim() === "") {
      reset();
      return;
    }

    const bytes = byteLength(text);
    if (!force && bytes > LIVE_LIMIT_BYTES) {
      setText(
        statusEl,
        `${fmtBytes(bytes)} pasted — live validation is paused above 2 MB. Press Validate or Format.`,
      );
      return;
    }

    const scanned = scanJson(text);
    if (!scanned.ok) {
      showFailure(text, scanned.issue);
      return;
    }

    let parsed: Json;
    try {
      parsed = JSON.parse(text) as Json;
    } catch (error) {
      showFailure(text, engineIssue(text, error));
      return;
    }

    let formatted: string;
    let minified: string;
    try {
      const value = sortKeys ? sortDeep(parsed, 0) : parsed;
      minified = JSON.stringify(value);
      formatted =
        mode === "minify"
          ? minified
          : JSON.stringify(value, null, currentIndent());
    } catch (error) {
      showFailure(
        text,
        issue(
          0,
          "The browser could not re-serialize this document.",
          messageOf(error),
        ),
      );
      return;
    }

    output.value = formatted;
    hideError();
    setText(statusEl, `Valid JSON — ${describeMode()}.`);
    showStats(text, formatted, minified, scanned.analysis, bytes);
  }

  function setMode(next: Mode): void {
    mode = next;
    for (const button of modeButtons) {
      const active = button.dataset.jsonfMode === next;
      button.setAttribute("aria-pressed", active ? "true" : "false");
      button.classList.toggle("bg-yellow", active);
      button.classList.toggle("bg-paper", !active);
    }
  }

  function setSort(next: boolean): void {
    sortKeys = next;
    if (!sortBtn) return;
    sortBtn.setAttribute("aria-pressed", next ? "true" : "false");
    sortBtn.classList.toggle("bg-yellow", next);
    sortBtn.classList.toggle("bg-paper", !next);
  }

  input.addEventListener("input", () => {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => render(false), DEBOUNCE_MS);
  });

  for (const button of modeButtons) {
    button.addEventListener("click", () => {
      const next = button.dataset.jsonfMode;
      if (next !== "format" && next !== "minify") return;
      setMode(next);
      render(true);
    });
  }

  if (indentEl instanceof HTMLSelectElement) {
    indentEl.addEventListener("change", () => {
      setMode("format");
      render(true);
    });
  }

  sortBtn?.addEventListener("click", () => {
    setSort(!sortKeys);
    render(true);
  });

  document
    .getElementById("jsonf-validate")
    ?.addEventListener("click", () => render(true));

  document.getElementById("jsonf-clear")?.addEventListener("click", () => {
    input.value = "";
    reset();
    input.focus();
  });

  const copyBtn = document.getElementById("jsonf-copy");
  const copyLabel = document.getElementById("jsonf-copy-label");
  copyBtn?.addEventListener("click", async () => {
    if (output.value === "") return;
    try {
      await navigator.clipboard.writeText(output.value);
      if (copyLabel) {
        copyLabel.textContent = "Copied!";
        window.setTimeout(() => {
          copyLabel.textContent = "Copy";
        }, 1500);
      }
    } catch {
      output.select();
    }
  });

  root
    .querySelectorAll<HTMLButtonElement>("[data-jsonf-sample]")
    .forEach((button) => {
      button.addEventListener("click", () => {
        input.value = button.dataset.jsonfSample ?? "";
        render(true);
      });
    });

  setMode("format");
  setSort(false);
  render(true);
}

init();
document.addEventListener("astro:after-swap", init);

export {};
