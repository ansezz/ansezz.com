// A safe PHP unserialize() for the browser. It reads the serialize() format
// into plain data and never creates class instances, calls methods or runs
// code. Class names are only kept as strings.
//
// Format reference: ext/standard/var_unserializer.re in php-src.
//   N;  b:1;  i:42;  d:0.5;  s:5:"bytes";  S:3:"\61bc";
//   a:2:{key;value;...}  O:3:"Foo":1:{name;value;}  C:3:"Foo":4:{data}
//   E:9:"Enum:Case";  r:2;  R:2;
// String lengths count bytes, so the parser works on UTF-8 bytes, not
// JavaScript characters. Every value except R: and array keys takes a slot
// number, starting at 1 for the outer value. r:N and R:N point to a slot.

export type Visibility = "public" | "protected" | "private";

export type PhpNode =
  | { t: "null"; id: number }
  | { t: "bool"; id: number; v: boolean }
  | { t: "int"; id: number; v: string }
  | { t: "float"; id: number; v: number; raw: string }
  | { t: "string"; id: number; v: string; bytes: number; binary: boolean }
  | { t: "array"; id: number; items: PhpArrayItem[] }
  | { t: "object"; id: number; cls: string; props: PhpProp[] }
  | { t: "custom"; id: number; cls: string; data: string }
  | { t: "enum"; id: number; cls: string; name: string }
  | { t: "ref"; id: number; kind: "r" | "R"; target: number };

export interface PhpArrayItem {
  key: string | number;
  value: PhpNode;
}

export interface PhpProp {
  /** Property name without the NUL-byte visibility prefix. */
  name: string;
  visibility: Visibility;
  /** For private properties, the class that declared them. */
  declaringClass?: string;
  value: PhpNode;
}

export interface UnserializeResult {
  value: PhpNode;
  /** Slot number to node, for resolving r: and R: references. */
  slots: Map<number, PhpNode>;
  warnings: string[];
  /** Bytes left after the value, if any. */
  trailing: number;
}

export interface UnserializeOptions {
  /**
   * Recover from string lengths that do not match, which happens when NUL
   * bytes or line endings were lost while copying. Adds a warning each time.
   */
  lenient?: boolean;
  maxDepth?: number;
}

export class PhpParseError extends Error {
  readonly offset: number;
  constructor(message: string, offset: number) {
    super(`${message} (at byte ${offset})`);
    this.name = "PhpParseError";
    this.offset = offset;
  }
}

const enc = new TextEncoder();
const dec = new TextDecoder("utf-8", { fatal: false });
const strictDec = new TextDecoder("utf-8", { fatal: true });

const QUOTE = 0x22;
const SEMI = 0x3b;
const COLON = 0x3a;
const LBRACE = 0x7b;
const RBRACE = 0x7d;

function decodeBytes(b: Uint8Array): { v: string; binary: boolean } {
  try {
    return { v: strictDec.decode(b), binary: false };
  } catch {
    return { v: dec.decode(b), binary: true };
  }
}

class Reader {
  pos = 0;
  slot = 0;
  readonly slots = new Map<number, PhpNode>();
  readonly warnings: string[] = [];
  readonly b: Uint8Array;
  readonly lenient: boolean;
  readonly maxDepth: number;
  constructor(b: Uint8Array, lenient: boolean, maxDepth: number) {
    this.b = b;
    this.lenient = lenient;
    this.maxDepth = maxDepth;
  }

  fail(msg: string, at = this.pos): never {
    throw new PhpParseError(msg, at);
  }

  peek(): number {
    return this.b[this.pos];
  }

  expect(byte: number): void {
    if (this.b[this.pos] !== byte)
      this.fail(
        `Expected "${String.fromCharCode(byte)}" but found ${this.describe(this.pos)}`,
      );
    this.pos++;
  }

  describe(at: number): string {
    if (at >= this.b.length) return "the end of the input";
    return `"${String.fromCharCode(this.b[at])}"`;
  }

  /** Reads bytes up to (not including) the stop byte and moves past it. */
  until(stop: number): string {
    const start = this.pos;
    const i = this.b.indexOf(stop, start);
    if (i === -1) this.fail(`Missing "${String.fromCharCode(stop)}"`, start);
    this.pos = i + 1;
    return dec.decode(this.b.subarray(start, i));
  }

  uint(stop: number, what: string): number {
    const at = this.pos;
    const s = this.until(stop);
    if (!/^\+?\d+$/.test(s)) this.fail(`Bad ${what} "${s}"`, at);
    const n = Number(s);
    if (!Number.isSafeInteger(n)) this.fail(`${what} is too large`, at);
    return n;
  }

  /** Reads `"<len bytes>"`, with optional recovery from a wrong length. */
  quoted(len: number, after: number): Uint8Array {
    const open = this.pos;
    this.expect(QUOTE);
    const start = this.pos;
    const end = start + len;
    if (
      end + 1 < this.b.length &&
      this.b[end] === QUOTE &&
      this.b[end + 1] === after
    ) {
      this.pos = end + 2;
      return this.b.subarray(start, end);
    }
    if (!this.lenient)
      this.fail(
        `String length ${len} does not match the data. Bytes may have been lost while copying (for example NUL bytes in protected or private property names). Try the lenient option`,
        open,
      );
    // Find the closing quote nearest to where the length says it should be.
    let best = -1;
    for (let i = start; i + 1 < this.b.length; i++) {
      if (this.b[i] === QUOTE && this.b[i + 1] === after) {
        if (best === -1 || Math.abs(i - end) < Math.abs(best - end)) best = i;
        if (i > end) break;
      }
    }
    if (best === -1) this.fail("Unterminated string", open);
    this.warnings.push(
      `String at byte ${open} says ${len} bytes but has ${best - start}. Read it anyway.`,
    );
    this.pos = best + 2;
    return this.b.subarray(start, best);
  }

  push(node: PhpNode): void {
    this.slots.set(node.id, node);
  }

  value(depth: number, isKey = false): PhpNode {
    if (depth > this.maxDepth) this.fail("Nested too deep");
    if (this.pos >= this.b.length) this.fail("Unexpected end of input");
    const at = this.pos;
    const type = String.fromCharCode(this.b[this.pos]);
    // R: takes no slot; everything else does, except array keys.
    const id = isKey || type === "R" ? 0 : ++this.slot;
    this.pos++;

    switch (type) {
      case "N": {
        this.expect(SEMI);
        return this.track({ t: "null", id }, isKey);
      }
      case "b": {
        this.expect(COLON);
        const s = this.until(SEMI);
        if (s !== "0" && s !== "1") this.fail(`Bad boolean "${s}"`, at);
        return this.track({ t: "bool", id, v: s === "1" }, isKey);
      }
      case "i": {
        this.expect(COLON);
        const s = this.until(SEMI);
        if (!/^[+-]?\d+$/.test(s)) this.fail(`Bad integer "${s}"`, at);
        return this.track({ t: "int", id, v: s.replace(/^\+/, "") }, isKey);
      }
      case "d": {
        this.expect(COLON);
        const raw = this.until(SEMI);
        let v: number;
        if (raw === "INF") v = Infinity;
        else if (raw === "-INF") v = -Infinity;
        else if (raw === "NAN") v = NaN;
        else if (/^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(raw))
          v = Number(raw);
        else this.fail(`Bad float "${raw}"`, at);
        return this.track({ t: "float", id, v, raw }, isKey);
      }
      case "s": {
        this.expect(COLON);
        const len = this.uint(COLON, "string length");
        const bytes = this.quoted(len, SEMI);
        const { v, binary } = decodeBytes(bytes);
        return this.track(
          { t: "string", id, v, bytes: bytes.length, binary },
          isKey,
        );
      }
      case "S": {
        // Escaped string: \xx hex escapes, length counts decoded bytes.
        this.expect(COLON);
        const len = this.uint(COLON, "string length");
        this.expect(QUOTE);
        const out: number[] = [];
        while (out.length < len) {
          if (this.pos >= this.b.length) this.fail("Unterminated S: string");
          const c = this.b[this.pos];
          if (c === 0x5c) {
            const hex = dec.decode(this.b.subarray(this.pos + 1, this.pos + 3));
            if (!/^[0-9a-fA-F]{2}$/.test(hex)) this.fail("Bad \\ escape");
            out.push(parseInt(hex, 16));
            this.pos += 3;
          } else {
            out.push(c);
            this.pos++;
          }
        }
        this.expect(QUOTE);
        this.expect(SEMI);
        const bytes = new Uint8Array(out);
        const { v, binary } = decodeBytes(bytes);
        return this.track(
          { t: "string", id, v, bytes: bytes.length, binary },
          isKey,
        );
      }
      case "a": {
        if (isKey) this.fail("An array cannot be an array key", at);
        this.expect(COLON);
        const n = this.uint(COLON, "array size");
        this.expect(LBRACE);
        const node: PhpNode = { t: "array", id, items: [] };
        this.push(node);
        for (let i = 0; i < n; i++) {
          const k = this.value(depth + 1, true);
          const key = arrayKey(k, this, at);
          node.items.push({ key, value: this.value(depth + 1) });
        }
        this.expect(RBRACE);
        return node;
      }
      case "O": {
        if (isKey) this.fail("An object cannot be an array key", at);
        this.expect(COLON);
        const len = this.uint(COLON, "class name length");
        const cls = dec.decode(this.quoted(len, COLON));
        checkClassName(cls, this, at);
        const n = this.uint(COLON, "property count");
        this.expect(LBRACE);
        const node: PhpNode = { t: "object", id, cls, props: [] };
        this.push(node);
        for (let i = 0; i < n; i++) {
          const k = this.value(depth + 1, true);
          if (k.t !== "string" && k.t !== "int")
            this.fail("Property names must be strings", at);
          const raw = k.v;
          node.props.push({
            ...splitPropName(raw),
            value: this.value(depth + 1),
          });
        }
        this.expect(RBRACE);
        return node;
      }
      case "C": {
        if (isKey) this.fail("An object cannot be an array key", at);
        this.expect(COLON);
        const len = this.uint(COLON, "class name length");
        const cls = dec.decode(this.quoted(len, COLON));
        checkClassName(cls, this, at);
        const dlen = this.uint(COLON, "data length");
        this.expect(LBRACE);
        const end = this.pos + dlen;
        if (end >= this.b.length || this.b[end] !== RBRACE)
          this.fail(`Custom data length ${dlen} does not match`, at);
        const data = dec.decode(this.b.subarray(this.pos, end));
        this.pos = end + 1;
        return this.track({ t: "custom", id, cls, data }, false);
      }
      case "E": {
        if (isKey) this.fail("An enum cannot be an array key", at);
        this.expect(COLON);
        const len = this.uint(COLON, "enum length");
        const s = dec.decode(this.quoted(len, SEMI));
        const i = s.indexOf(":");
        if (i < 1) this.fail(`Bad enum "${s}"`, at);
        return this.track(
          { t: "enum", id, cls: s.slice(0, i), name: s.slice(i + 1) },
          false,
        );
      }
      case "r":
      case "R": {
        if (isKey) this.fail("A reference cannot be an array key", at);
        this.expect(COLON);
        const target = this.uint(SEMI, "reference");
        if (target < 1 || !this.slots.has(target))
          this.fail(`Reference to unknown value #${target}`, at);
        return this.track(
          { t: "ref", id, kind: type as "r" | "R", target },
          false,
        );
      }
      default:
        return this.fail(`Unknown type "${type}"`, at);
    }
  }

  track<T extends PhpNode>(node: T, isKey: boolean): T {
    if (!isKey && node.id) this.push(node);
    return node;
  }
}

function arrayKey(k: PhpNode, r: Reader, at: number): string | number {
  if (k.t === "int") {
    const n = Number(k.v);
    return Number.isSafeInteger(n) ? n : k.v;
  }
  if (k.t === "string") return k.v;
  return r.fail("Array keys must be integers or strings", at);
}

function checkClassName(cls: string, r: Reader, at: number): void {
  if (!/^[A-Za-z_\x80-\uffff][\w\x80-\uffff\\]*$/.test(cls))
    r.fail(`Bad class name "${cls}"`, at);
}

/** "\0*\0name" is protected, "\0Class\0name" is private, else public. */
export function splitPropName(raw: string): {
  name: string;
  visibility: Visibility;
  declaringClass?: string;
} {
  if (raw.charCodeAt(0) === 0) {
    const close = raw.indexOf("\0", 1);
    if (close > 0) {
      const mid = raw.slice(1, close);
      const name = raw.slice(close + 1);
      if (mid === "*") return { name, visibility: "protected" };
      return { name, visibility: "private", declaringClass: mid };
    }
  }
  return { name: raw, visibility: "public" };
}

export function unserialize(
  input: string | Uint8Array,
  opts: UnserializeOptions = {},
): UnserializeResult {
  const bytes = typeof input === "string" ? enc.encode(input) : input;
  const r = new Reader(bytes, opts.lenient ?? false, opts.maxDepth ?? 512);
  if (bytes.length === 0) r.fail("Nothing to read", 0);
  const value = r.value(0);
  let end = r.pos;
  while (end < bytes.length && /\s/.test(String.fromCharCode(bytes[end])))
    end++;
  const trailing = bytes.length - end;
  if (trailing > 0)
    r.warnings.push(
      `${trailing} extra byte${trailing === 1 ? "" : "s"} after the value were ignored.`,
    );
  return { value, slots: r.slots, warnings: r.warnings, trailing };
}

// ── Conversions ────────────────────────────────────────────

export type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | { [k: string]: JsonValue };

/**
 * Plain JSON view. Lists become arrays, other arrays become objects, PHP
 * objects get a "__class" key, enums become "Class::Case" and references
 * become { "__ref": slot }.
 */
export function toJson(node: PhpNode): JsonValue {
  switch (node.t) {
    case "null":
      return null;
    case "bool":
      return node.v;
    case "int": {
      const n = Number(node.v);
      return Number.isSafeInteger(n) ? n : node.v;
    }
    case "float":
      return Number.isFinite(node.v) ? node.v : node.raw;
    case "string":
      return node.v;
    case "array": {
      if (node.items.every((it, i) => it.key === i))
        return node.items.map((it) => toJson(it.value));
      const o: { [k: string]: JsonValue } = {};
      for (const it of node.items) o[String(it.key)] = toJson(it.value);
      return o;
    }
    case "object": {
      const o: { [k: string]: JsonValue } = { __class: node.cls };
      for (const p of node.props) {
        let key = p.name;
        if (key in o)
          key = p.declaringClass
            ? `${p.declaringClass}::${p.name}`
            : `${p.visibility}:${p.name}`;
        o[key] = toJson(p.value);
      }
      return o;
    }
    case "custom":
      return { __class: node.cls, __serialized: node.data };
    case "enum":
      return `${node.cls}::${node.name}`;
    case "ref":
      return { __ref: node.target };
  }
}

/** One-line label for a scalar or a container summary. */
export function describe(node: PhpNode): string {
  switch (node.t) {
    case "null":
      return "null";
    case "bool":
      return node.v ? "true" : "false";
    case "int":
      return node.v;
    case "float":
      return node.raw;
    case "string":
      return JSON.stringify(node.v);
    case "array":
      return `array(${node.items.length})`;
    case "object":
      return `${node.cls} {${node.props.length}}`;
    case "custom":
      return `${node.cls} (custom data, ${node.data.length} chars)`;
    case "enum":
      return `${node.cls}::${node.name}`;
    case "ref":
      return `${node.kind === "R" ? "&" : ""}ref → #${node.target}`;
  }
}

// ── Laravel queue payloads ─────────────────────────────────

export interface LaravelJob {
  payload: Record<string, unknown>;
  displayName: string | null;
  commandName: string | null;
  /** Serialized command, when it is not encrypted. */
  command: string | null;
  encrypted: boolean;
  /** Models referenced through SerializesModels (ModelIdentifier). */
  models: { cls: string; id: JsonValue; connection: JsonValue }[];
  queue: string | null;
  connection: string | null;
  facts: [string, string][];
}

const LARAVEL_ENVELOPE = /^eyJ[A-Za-z0-9+/=]+$/;

/** Parses failed_jobs.payload (or any Laravel queue payload JSON). */
export function parseLaravelPayload(text: string): LaravelJob {
  let payload: unknown;
  try {
    payload = JSON.parse(text.trim());
  } catch (e) {
    throw new Error(
      `This is not valid JSON. Paste the whole payload column. ${(e as Error).message}`,
    );
  }
  if (typeof payload === "string") {
    // Double encoded, as some database tools export it.
    try {
      payload = JSON.parse(payload);
    } catch {
      /* keep the string */
    }
  }
  if (!payload || typeof payload !== "object" || Array.isArray(payload))
    throw new Error("Expected a JSON object with a data key.");
  const p = payload as Record<string, unknown>;
  const data = (p.data ?? {}) as Record<string, unknown>;
  const command = typeof data.command === "string" ? data.command : null;
  const encrypted = command !== null && LARAVEL_ENVELOPE.test(command.trim());
  const str = (v: unknown): string | null => (typeof v === "string" ? v : null);

  const facts: [string, string][] = [];
  const add = (label: string, v: unknown) => {
    if (v === null || v === undefined || v === "" || v === false) return;
    facts.push([label, typeof v === "string" ? v : JSON.stringify(v)]);
  };
  add("Job", p.displayName);
  add("Handler", p.job);
  add("UUID", p.uuid);
  add("Max tries", p.maxTries);
  add("Max exceptions", p.maxExceptions);
  add("Timeout (s)", p.timeout);
  add("Backoff", p.backoff);
  add("Attempts", p.attempts);
  if (typeof p.retryUntil === "number")
    add("Retry until", new Date(p.retryUntil * 1000).toISOString());
  if (typeof p.createdAt === "number")
    add("Created at", new Date(p.createdAt * 1000).toISOString());
  add("Batch", data.batchId);

  return {
    payload: p,
    displayName: str(p.displayName),
    commandName: str(data.commandName),
    command: encrypted ? null : command,
    encrypted,
    models: [],
    queue: null,
    connection: null,
    facts,
  };
}

/** Fills models, queue and connection from the unserialized command. */
export function summarizeCommand(job: LaravelJob, root: PhpNode): void {
  const seen = new Set<PhpNode>();
  const walk = (n: PhpNode) => {
    if (seen.has(n)) return;
    seen.add(n);
    if (n.t === "object") {
      if (n.cls === "Illuminate\\Contracts\\Database\\ModelIdentifier") {
        const get = (k: string) => n.props.find((p) => p.name === k)?.value;
        const c = get("class");
        const id = get("id");
        const conn = get("connection");
        job.models.push({
          cls: c && c.t === "string" ? c.v : "?",
          id: id ? toJson(id) : null,
          connection: conn ? toJson(conn) : null,
        });
      }
      n.props.forEach((p) => walk(p.value));
    } else if (n.t === "array") n.items.forEach((it) => walk(it.value));
  };
  walk(root);
  if (root.t === "object") {
    const get = (k: string) => {
      const v = root.props.find((p) => p.name === k)?.value;
      return v && v.t === "string" ? v.v : null;
    };
    job.queue = get("queue");
    job.connection = get("connection");
  }
}
