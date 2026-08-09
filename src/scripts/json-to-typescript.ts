// JSON → TypeScript types + Zod v4 schema, entirely in the browser.
//
// Inference model: every JSON value collapses into a TypeNode that accumulates
// which primitive shapes were seen at that position. Array elements are merged
// into one node (so a heterogeneous array becomes a union), object shapes are
// merged key-by-key while counting how many samples contained each key (keys
// present in fewer samples than the shape has become optional), and `null` is
// tracked as a modifier rather than a member so it renders as `| null` /
// `.nullable()`. Strings are probed for ISO-8601 date, ISO-8601 datetime,
// email, URL and UUID shapes; numbers remember whether every sample was an
// integer. No network, no dependencies, no thrown exceptions escape render().

const MAX_DEPTH = 24;
const MAX_ARRAY_SAMPLES = 1000;
const UNION_WRAP_WIDTH = 76;

type StringFormat =
  | "uuid"
  | "email"
  | "url"
  | "date"
  | "datetime"
  | "datetime-offset"
  | "datetime-local";

interface FieldInfo {
  /** How many merged object samples contained this key. */
  present: number;
  type: TypeNode;
}

interface ObjectShape {
  /** How many object samples were merged into this shape. */
  samples: number;
  /** Key order, first-seen wins. */
  order: string[];
  fields: Map<string, FieldInfo>;
}

interface TypeNode {
  string: number;
  stringFormat: StringFormat | null;
  stringFormatMixed: boolean;
  number: number;
  numberAllInt: boolean;
  boolean: number;
  null: number;
  /** Seen nothing usable here: empty array element, or past the depth cap. */
  unknown: number;
  arrays: number;
  element: TypeNode | null;
  object: ObjectShape | null;
}

type MissingStyle = "optional" | "nullable" | "both";

interface Options {
  rootName: string;
  declaration: "interface" | "type";
  missingStyle: MissingStyle;
  readonlyProps: boolean;
  nested: "named" | "inline";
  detectFormats: boolean;
  datesAsDate: boolean;
}

interface EmitContext {
  opts: Options;
  names: Map<ObjectShape, string>;
}

interface Stats {
  optionalKeys: number;
  nullableKeys: number;
  nullOnlyKeys: number;
  unions: number;
  intFields: number;
  formats: Set<StringFormat>;
}

type GenerateResult =
  | { ok: true; ts: string; zod: string; stats: string[] }
  | { ok: false; message: string };

/* -------------------------------------------------------------------------- */
/* String shape detection                                                     */
/* -------------------------------------------------------------------------- */

// Seconds are mandatory: z.iso.datetime() rejects "2024-01-01T10:30Z" unless
// you pass a precision, so a minute-precision sample is not a datetime here.
const DATETIME_RE =
  /^(\d{4})-(\d{2})-(\d{2})[Tt](\d{2}):(\d{2}):(\d{2})(?:\.\d+)?([Zz]|[+-]\d{2}:\d{2})?$/;
const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const UUID_RE =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/;
const EMAIL_RE =
  /^[^\s@,;:<>"'\\]+@[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?(\.[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?)+$/;

function isCalendarDate(year: number, month: number, day: number): boolean {
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;
  const probe = new Date(Date.UTC(year, month - 1, day));
  return (
    probe.getUTCFullYear() === year &&
    probe.getUTCMonth() === month - 1 &&
    probe.getUTCDate() === day
  );
}

// Deliberately http/https only. `new URL()` happily accepts "mailto:", "tel:"
// and any "scheme:" string, which would mislabel plenty of ordinary IDs.
function isHttpUrl(value: string): boolean {
  if (!/^https?:\/\//i.test(value)) return false;
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function detectFormat(value: string): StringFormat | null {
  if (value.length === 0 || value.length > 2048) return null;
  if (UUID_RE.test(value)) return "uuid";

  const stamp = DATETIME_RE.exec(value);
  if (stamp) {
    const year = Number(stamp[1]);
    const month = Number(stamp[2]);
    const day = Number(stamp[3]);
    const hour = Number(stamp[4]);
    const minute = Number(stamp[5]);
    const second = Number(stamp[6]);
    const ok =
      isCalendarDate(year, month, day) &&
      hour <= 23 &&
      minute <= 59 &&
      second <= 60;
    if (!ok) return null;
    const zone = stamp[7];
    if (zone === undefined) return "datetime-local";
    return zone === "Z" || zone === "z" ? "datetime" : "datetime-offset";
  }

  const dateOnly = DATE_RE.exec(value);
  if (dateOnly) {
    return isCalendarDate(
      Number(dateOnly[1]),
      Number(dateOnly[2]),
      Number(dateOnly[3]),
    )
      ? "date"
      : null;
  }

  if (EMAIL_RE.test(value)) return "email";
  if (isHttpUrl(value)) return "url";
  return null;
}

/* -------------------------------------------------------------------------- */
/* Inference                                                                  */
/* -------------------------------------------------------------------------- */

function emptyNode(): TypeNode {
  return {
    string: 0,
    stringFormat: null,
    stringFormatMixed: false,
    number: 0,
    numberAllInt: true,
    boolean: 0,
    null: 0,
    unknown: 0,
    arrays: 0,
    element: null,
    object: null,
  };
}

function mergeShape(a: ObjectShape, b: ObjectShape): ObjectShape {
  const order = [...a.order];
  const seen = new Set(order);
  for (const key of b.order) {
    if (seen.has(key)) continue;
    seen.add(key);
    order.push(key);
  }

  const fields = new Map<string, FieldInfo>();
  for (const key of order) {
    const left = a.fields.get(key);
    const right = b.fields.get(key);
    if (left && right) {
      fields.set(key, {
        present: left.present + right.present,
        type: mergeNode(left.type, right.type),
      });
    } else if (left) {
      fields.set(key, left);
    } else if (right) {
      fields.set(key, right);
    }
  }

  return { samples: a.samples + b.samples, order, fields };
}

function mergeNode(a: TypeNode, b: TypeNode): TypeNode {
  let stringFormat: StringFormat | null;
  let stringFormatMixed: boolean;
  if (a.string === 0) {
    stringFormat = b.stringFormat;
    stringFormatMixed = b.stringFormatMixed;
  } else if (b.string === 0) {
    stringFormat = a.stringFormat;
    stringFormatMixed = a.stringFormatMixed;
  } else if (
    a.stringFormatMixed ||
    b.stringFormatMixed ||
    a.stringFormat !== b.stringFormat
  ) {
    stringFormat = null;
    stringFormatMixed = true;
  } else {
    stringFormat = a.stringFormat;
    stringFormatMixed = false;
  }

  let numberAllInt: boolean;
  if (a.number === 0) numberAllInt = b.numberAllInt;
  else if (b.number === 0) numberAllInt = a.numberAllInt;
  else numberAllInt = a.numberAllInt && b.numberAllInt;

  let element: TypeNode | null = null;
  if (a.element && b.element) element = mergeNode(a.element, b.element);
  else element = a.element ?? b.element;

  let object: ObjectShape | null = null;
  if (a.object && b.object) object = mergeShape(a.object, b.object);
  else object = a.object ?? b.object;

  return {
    string: a.string + b.string,
    stringFormat,
    stringFormatMixed,
    number: a.number + b.number,
    numberAllInt,
    boolean: a.boolean + b.boolean,
    null: a.null + b.null,
    unknown: a.unknown + b.unknown,
    arrays: a.arrays + b.arrays,
    element,
    object,
  };
}

function inferValue(value: unknown, depth: number): TypeNode {
  const node = emptyNode();

  if (value === null) return { ...node, null: 1 };
  if (typeof value === "string") {
    return { ...node, string: 1, stringFormat: detectFormat(value) };
  }
  if (typeof value === "number") {
    return { ...node, number: 1, numberAllInt: Number.isInteger(value) };
  }
  if (typeof value === "boolean") return { ...node, boolean: 1 };

  if (Array.isArray(value)) {
    if (depth >= MAX_DEPTH) return { ...node, unknown: 1 };
    let element: TypeNode | null = null;
    const limit = Math.min(value.length, MAX_ARRAY_SAMPLES);
    for (let i = 0; i < limit; i += 1) {
      const child = inferValue(value[i], depth + 1);
      element = element === null ? child : mergeNode(element, child);
    }
    return { ...node, arrays: 1, element };
  }

  if (typeof value === "object") {
    if (depth >= MAX_DEPTH) return { ...node, unknown: 1 };
    // JSON.parse only ever yields plain objects here; the cast avoids `any`.
    const record = value as Record<string, unknown>;
    const order: string[] = [];
    const fields = new Map<string, FieldInfo>();
    for (const key of Object.keys(record)) {
      order.push(key);
      fields.set(key, { present: 1, type: inferValue(record[key], depth + 1) });
    }
    return { ...node, object: { samples: 1, order, fields } };
  }

  return { ...node, unknown: 1 };
}

/* -------------------------------------------------------------------------- */
/* Naming                                                                     */
/* -------------------------------------------------------------------------- */

function toPascal(raw: string): string {
  const chunks = raw.split(/[^A-Za-z0-9]+/).filter(Boolean);
  const joined = chunks
    .map((chunk) =>
      chunk
        .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
        .split(" ")
        .filter(Boolean)
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(""),
    )
    .join("");
  if (joined === "") return "";
  return /^[A-Za-z_$]/.test(joined) ? joined : `_${joined}`;
}

function singularize(word: string): string {
  if (/(ss|us|is|as|os)$/i.test(word)) return word;
  if (/ies$/i.test(word)) return `${word.slice(0, -3)}y`;
  if (/(ch|sh|x|z|s)es$/i.test(word)) return word.slice(0, -2);
  if (/s$/i.test(word)) return word.slice(0, -1);
  return word;
}

function elementNameFor(suggestion: string): string {
  const singular = singularize(suggestion);
  return singular === suggestion ? `${suggestion}Item` : singular;
}

interface NamingState {
  names: Map<ObjectShape, string>;
  ordered: { name: string; shape: ObjectShape }[];
  used: Map<string, ObjectShape>;
  signatures: Map<ObjectShape, string>;
}

function shapeSignature(
  shape: ObjectShape,
  cache: Map<ObjectShape, string>,
): string {
  const cached = cache.get(shape);
  if (cached !== undefined) return cached;
  cache.set(shape, "…"); // guard against pathological re-entry
  const parts = [...shape.order].sort().map((key) => {
    const field = shape.fields.get(key);
    if (!field) return `${key}:?`;
    const mark = field.present < shape.samples ? "?" : "";
    return `${key}${mark}:${nodeSignature(field.type, cache)}`;
  });
  const value = `{${parts.join(",")}}`;
  cache.set(shape, value);
  return value;
}

function nodeSignature(
  node: TypeNode,
  cache: Map<ObjectShape, string>,
): string {
  const parts: string[] = [];
  if (node.string > 0) {
    parts.push(
      `s:${node.stringFormatMixed ? "*" : (node.stringFormat ?? "-")}`,
    );
  }
  if (node.number > 0) parts.push(node.numberAllInt ? "i" : "n");
  if (node.boolean > 0) parts.push("b");
  if (node.null > 0) parts.push("z");
  if (node.unknown > 0) parts.push("u");
  if (node.arrays > 0) {
    parts.push(`[${node.element ? nodeSignature(node.element, cache) : ""}]`);
  }
  if (node.object) parts.push(shapeSignature(node.object, cache));
  return parts.join("|");
}

function registerShape(
  shape: ObjectShape,
  suggestion: string,
  parent: string,
  state: NamingState,
): void {
  if (shape.order.length === 0) return; // renders as Record<string, unknown>
  if (state.names.has(shape)) return;

  const base = toPascal(suggestion) || "Item";
  const signature = shapeSignature(shape, state.signatures);
  const prefixed = toPascal(parent) + base;

  for (const candidate of base === prefixed ? [base] : [base, prefixed]) {
    const taken = state.used.get(candidate);
    if (!taken) {
      state.used.set(candidate, shape);
      state.names.set(shape, candidate);
      state.ordered.push({ name: candidate, shape });
      return;
    }
    if (shapeSignature(taken, state.signatures) === signature) {
      // Structurally identical to a type we already emitted — share it.
      state.names.set(shape, candidate);
      return;
    }
  }

  let suffix = 2;
  while (state.used.has(`${base}${suffix}`)) suffix += 1;
  const unique = `${base}${suffix}`;
  state.used.set(unique, shape);
  state.names.set(shape, unique);
  state.ordered.push({ name: unique, shape });
}

// Post-order walk: children are named (and emitted) before their parents, so
// the Zod output never references a `const` declared further down the file.
function walkForNames(
  node: TypeNode,
  suggestion: string,
  parent: string,
  state: NamingState,
  register: boolean,
): void {
  if (node.element) {
    // An array of arrays describes one collection, so only the level that
    // actually holds an object earns the "Item" suffix: grid[][] names its
    // leaf `GridItem`, not `GridItemItem`.
    const nestsAnotherArray =
      node.element.object === null && node.element.arrays > 0;
    const childName = nestsAnotherArray
      ? suggestion
      : elementNameFor(suggestion);
    walkForNames(node.element, childName, parent, state, true);
  }
  const shape = node.object;
  if (!shape) return;
  for (const key of shape.order) {
    const field = shape.fields.get(key);
    if (field) walkForNames(field.type, key, suggestion, state, true);
  }
  if (register) registerShape(shape, suggestion, parent, state);
}

const EMPTY_SENTINEL: ObjectShape = {
  samples: 0,
  order: [],
  fields: new Map(),
};

function assignNames(root: TypeNode, opts: Options): NamingState {
  const state: NamingState = {
    names: new Map(),
    ordered: [],
    used: new Map(),
    signatures: new Map(),
  };
  if (opts.nested === "inline") return state;

  const rootShape =
    root.object && root.object.order.length > 0 ? root.object : null;
  // Reserve the root name up front so a nested key called "root" can't take it.
  state.used.set(opts.rootName, rootShape ?? EMPTY_SENTINEL);
  if (rootShape) state.names.set(rootShape, opts.rootName);

  walkForNames(root, opts.rootName, "", state, false);

  if (rootShape) state.ordered.push({ name: opts.rootName, shape: rootShape });
  return state;
}

/* -------------------------------------------------------------------------- */
/* Emitters                                                                   */
/* -------------------------------------------------------------------------- */

const SAFE_KEY_RE = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

function keyToken(key: string): string {
  return SAFE_KEY_RE.test(key) ? key : JSON.stringify(key);
}

function pad(level: number): string {
  return "  ".repeat(level);
}

function dedupe(items: string[]): string[] {
  const out: string[] = [];
  for (const item of items) {
    if (!out.includes(item)) out.push(item);
  }
  return out;
}

function fieldModifiers(
  shape: ObjectShape,
  field: FieldInfo,
  style: MissingStyle,
): { optional: boolean; forceNull: boolean } {
  const missing = field.present < shape.samples;
  return {
    optional: missing && (style === "optional" || style === "both"),
    forceNull: missing && (style === "nullable" || style === "both"),
  };
}

/* --- TypeScript ----------------------------------------------------------- */

function tsStringType(node: TypeNode, opts: Options): string {
  if (
    !opts.detectFormats ||
    node.stringFormatMixed ||
    node.stringFormat === null
  ) {
    return "string";
  }
  if (!opts.datesAsDate) return "string";
  const isDate =
    node.stringFormat === "date" ||
    node.stringFormat === "datetime" ||
    node.stringFormat === "datetime-offset" ||
    node.stringFormat === "datetime-local";
  return isDate ? "Date" : "string";
}

function tsRecordType(opts: Options): string {
  return opts.readonlyProps
    ? "Readonly<Record<string, unknown>>"
    : "Record<string, unknown>";
}

function tsObjectRef(
  shape: ObjectShape,
  ctx: EmitContext,
  level: number,
): string {
  if (ctx.opts.nested === "inline") return tsObjectLiteral(shape, ctx, level);
  const name = ctx.names.get(shape);
  return name ?? tsRecordType(ctx.opts);
}

function tsObjectLiteral(
  shape: ObjectShape,
  ctx: EmitContext,
  level: number,
): string {
  if (shape.order.length === 0) return tsRecordType(ctx.opts);
  const inner = pad(level + 1);
  const prefix = ctx.opts.readonlyProps ? "readonly " : "";
  const lines = shape.order.map((key) => {
    const field = shape.fields.get(key);
    if (!field) return `${inner}${prefix}${keyToken(key)}: unknown;`;
    const { optional, forceNull } = fieldModifiers(
      shape,
      field,
      ctx.opts.missingStyle,
    );
    const type = tsType(field.type, ctx, level + 1, forceNull);
    return `${inner}${prefix}${keyToken(key)}${optional ? "?" : ""}: ${type};`;
  });
  return `{\n${lines.join("\n")}\n${pad(level)}}`;
}

function tsArrayType(
  element: TypeNode | null,
  ctx: EmitContext,
  level: number,
): string {
  const inner = element ? tsType(element, ctx, level, false) : "unknown";
  const wrapped = inner.includes("|") ? `(${inner})` : inner;
  return ctx.opts.readonlyProps ? `readonly ${wrapped}[]` : `${wrapped}[]`;
}

function tsType(
  node: TypeNode,
  ctx: EmitContext,
  level: number,
  forceNull: boolean,
): string {
  const members: string[] = [];
  if (node.string > 0) members.push(tsStringType(node, ctx.opts));
  if (node.number > 0) members.push("number");
  if (node.boolean > 0) members.push("boolean");
  if (node.object) members.push(tsObjectRef(node.object, ctx, level));
  if (node.arrays > 0) members.push(tsArrayType(node.element, ctx, level));

  const unique = dedupe(members);
  if (unique.length === 0) {
    // `unknown` swallows null, so it wins when we saw nothing concrete.
    if (node.unknown > 0) return "unknown";
    return node.null > 0 || forceNull ? "null" : "unknown";
  }
  const body = unique.join(" | ");
  return node.null > 0 || forceNull ? `${body} | null` : body;
}

function tsDeclaration(
  name: string,
  shape: ObjectShape,
  ctx: EmitContext,
): string {
  const literal = tsObjectLiteral(shape, ctx, 0);
  return ctx.opts.declaration === "interface"
    ? `export interface ${name} ${literal}`
    : `export type ${name} = ${literal};`;
}

/* --- Zod v4 --------------------------------------------------------------- */

const ZOD_FORMAT: Record<StringFormat, string> = {
  uuid: "z.uuid()",
  email: "z.email()",
  url: "z.url()",
  date: "z.iso.date()",
  datetime: "z.iso.datetime()",
  "datetime-offset": "z.iso.datetime({ offset: true })",
  "datetime-local": "z.iso.datetime({ local: true })",
};

function zodStringSchema(node: TypeNode, opts: Options): string {
  if (
    !opts.detectFormats ||
    node.stringFormatMixed ||
    node.stringFormat === null
  ) {
    return "z.string()";
  }
  const base = ZOD_FORMAT[node.stringFormat];
  const isDate = node.stringFormat.startsWith("date");
  if (!opts.datesAsDate || !isDate) return base;
  // Validate the string shape first, then hand back a real Date. Stricter than
  // coercion, which accepts anything the Date constructor can chew on.
  return `${base}.transform((value) => new Date(value))`;
}

function zodRecordSchema(opts: Options): string {
  const base = "z.record(z.string(), z.unknown())";
  return opts.readonlyProps ? `${base}.readonly()` : base;
}

function zodObjectRef(
  shape: ObjectShape,
  ctx: EmitContext,
  level: number,
): string {
  if (ctx.opts.nested === "inline") return zodObjectLiteral(shape, ctx, level);
  const name = ctx.names.get(shape);
  return name ? `${name}Schema` : zodRecordSchema(ctx.opts);
}

function zodObjectLiteral(
  shape: ObjectShape,
  ctx: EmitContext,
  level: number,
): string {
  if (shape.order.length === 0) return zodRecordSchema(ctx.opts);
  const inner = pad(level + 1);
  const lines = shape.order.map((key) => {
    const field = shape.fields.get(key);
    if (!field) return `${inner}${keyToken(key)}: z.unknown(),`;
    const { optional, forceNull } = fieldModifiers(
      shape,
      field,
      ctx.opts.missingStyle,
    );
    const schema = zodType(field.type, ctx, level + 1, forceNull, optional);
    return `${inner}${keyToken(key)}: ${schema},`;
  });
  const literal = `z.object({\n${lines.join("\n")}\n${pad(level)}})`;
  return ctx.opts.readonlyProps ? `${literal}.readonly()` : literal;
}

function zodArraySchema(
  element: TypeNode | null,
  ctx: EmitContext,
  level: number,
): string {
  const inner = element
    ? zodType(element, ctx, level, false, false)
    : "z.unknown()";
  const base = `z.array(${inner})`;
  return ctx.opts.readonlyProps ? `${base}.readonly()` : base;
}

function zodMembers(node: TypeNode, ctx: EmitContext, level: number): string[] {
  const members: string[] = [];
  if (node.string > 0) members.push(zodStringSchema(node, ctx.opts));
  if (node.number > 0)
    members.push(node.numberAllInt ? "z.int()" : "z.number()");
  if (node.boolean > 0) members.push("z.boolean()");
  if (node.object) members.push(zodObjectRef(node.object, ctx, level));
  if (node.arrays > 0) members.push(zodArraySchema(node.element, ctx, level));
  return dedupe(members);
}

function zodType(
  node: TypeNode,
  ctx: EmitContext,
  level: number,
  forceNull: boolean,
  optional: boolean,
): string {
  const members = zodMembers(node, ctx, level);

  if (members.length === 0) {
    const base =
      node.unknown > 0 || (node.null === 0 && !forceNull)
        ? "z.unknown()"
        : "z.null()";
    return optional ? `${base}.optional()` : base;
  }

  let expr: string;
  if (members.length === 1) {
    expr = members[0];
  } else {
    const oneLine = `z.union([${members.join(", ")}])`;
    if (!oneLine.includes("\n") && oneLine.length <= UNION_WRAP_WIDTH) {
      expr = oneLine;
    } else {
      // Re-emit one level deeper so nested literals line up inside the array.
      const nested = zodMembers(node, ctx, level + 1);
      const inner = pad(level + 1);
      expr = `z.union([\n${nested.map((m) => `${inner}${m},`).join("\n")}\n${pad(level)}])`;
    }
  }

  if (node.null > 0 || forceNull) expr += ".nullable()";
  if (optional) expr += ".optional()";
  return expr;
}

/* -------------------------------------------------------------------------- */
/* Stats                                                                      */
/* -------------------------------------------------------------------------- */

function collectStats(node: TypeNode, stats: Stats): void {
  if (
    node.string > 0 &&
    !node.stringFormatMixed &&
    node.stringFormat !== null
  ) {
    stats.formats.add(node.stringFormat);
  }
  if (node.number > 0 && node.numberAllInt) stats.intFields += 1;

  const memberCount =
    (node.string > 0 ? 1 : 0) +
    (node.number > 0 ? 1 : 0) +
    (node.boolean > 0 ? 1 : 0) +
    (node.object ? 1 : 0) +
    (node.arrays > 0 ? 1 : 0);
  if (memberCount > 1) stats.unions += 1;
  if (memberCount > 0 && node.null > 0) stats.nullableKeys += 1;
  if (memberCount === 0 && node.unknown === 0 && node.null > 0) {
    stats.nullOnlyKeys += 1;
  }

  if (node.element) collectStats(node.element, stats);
  const shape = node.object;
  if (!shape) return;
  for (const key of shape.order) {
    const field = shape.fields.get(key);
    if (!field) continue;
    if (field.present < shape.samples) stats.optionalKeys += 1;
    collectStats(field.type, stats);
  }
}

const FORMAT_LABEL: Record<StringFormat, string> = {
  uuid: "uuid",
  email: "email",
  url: "url",
  date: "iso date",
  datetime: "iso datetime",
  "datetime-offset": "iso datetime +offset",
  "datetime-local": "iso datetime (local)",
};

/* -------------------------------------------------------------------------- */
/* Generation                                                                 */
/* -------------------------------------------------------------------------- */

const HEADER =
  "// Generated from a JSON sample. Optionality and unions are inferred from\n" +
  "// what the sample happened to contain — read them before you ship them.";

function describeParseError(error: unknown, source: string): string {
  const base =
    error instanceof Error ? error.message : "Could not parse that as JSON.";
  let located = base;
  const position = /position (\d+)/.exec(base);
  if (position && !/line \d+/.test(base)) {
    const index = Math.min(Number(position[1]), source.length);
    const before = source.slice(0, index);
    const line = before.split("\n").length;
    const column = index - before.lastIndexOf("\n");
    located = `${base} (line ${line}, column ${column})`;
  }

  const hints: string[] = [];
  if (/,\s*[}\]]/.test(source)) {
    hints.push("there is a trailing comma before a } or ]");
  }
  if (/[{,]\s*'[^']*'\s*:/.test(source) || /:\s*'[^']*'/.test(source)) {
    hints.push("JSON strings and keys need double quotes, not single");
  }
  if (/[{,]\s*[A-Za-z_$][A-Za-z0-9_$]*\s*:/.test(source)) {
    hints.push("object keys must be quoted");
  }
  if (/\b(NaN|Infinity|undefined)\b/.test(source)) {
    hints.push("NaN, Infinity and undefined are not JSON values");
  }
  if (/^\s*\/\//m.test(source) || /\/\*/.test(source)) {
    hints.push("JSON has no comments");
  }

  return hints.length > 0
    ? `${located} — check whether ${hints.slice(0, 2).join(", and whether ")}.`
    : located;
}

function generate(source: string, opts: Options): GenerateResult {
  const trimmed = source.trim();
  if (trimmed === "") {
    return {
      ok: true,
      ts: "// Paste a JSON sample above.",
      zod: "// Paste a JSON sample above.",
      stats: [],
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch (error) {
    return { ok: false, message: describeParseError(error, trimmed) };
  }

  const root = inferValue(parsed, 0);
  const naming = assignNames(root, opts);
  const ctx: EmitContext = { opts, names: naming.names };

  const rootShape =
    root.object && root.object.order.length > 0 ? root.object : null;

  // TypeScript
  const tsDecls = naming.ordered.map((entry) =>
    tsDeclaration(entry.name, entry.shape, ctx),
  );
  if (rootShape && opts.nested === "inline") {
    tsDecls.push(tsDeclaration(opts.rootName, rootShape, ctx));
  } else if (!rootShape) {
    tsDecls.push(
      `export type ${opts.rootName} = ${tsType(root, ctx, 0, false)};`,
    );
  }

  // Zod v4
  const zodDecls = naming.ordered.map(
    (entry) =>
      `export const ${entry.name}Schema = ${zodObjectLiteral(entry.shape, ctx, 0)};`,
  );
  if (rootShape && opts.nested === "inline") {
    zodDecls.push(
      `export const ${opts.rootName}Schema = ${zodObjectLiteral(rootShape, ctx, 0)};`,
    );
  } else if (!rootShape) {
    zodDecls.push(
      `export const ${opts.rootName}Schema = ${zodType(root, ctx, 0, false, false)};`,
    );
  }
  zodDecls.push(
    `export type ${opts.rootName} = z.infer<typeof ${opts.rootName}Schema>;`,
  );

  const stats: Stats = {
    optionalKeys: 0,
    nullableKeys: 0,
    nullOnlyKeys: 0,
    unions: 0,
    intFields: 0,
    formats: new Set(),
  };
  collectStats(root, stats);

  const labels: string[] = [];
  labels.push(`${tsDecls.length} type${tsDecls.length === 1 ? "" : "s"}`);
  if (stats.optionalKeys > 0) labels.push(`${stats.optionalKeys} optional`);
  if (stats.nullableKeys > 0) labels.push(`${stats.nullableKeys} nullable`);
  if (stats.nullOnlyKeys > 0) labels.push(`${stats.nullOnlyKeys} always null`);
  if (stats.unions > 0) {
    labels.push(`${stats.unions} union${stats.unions === 1 ? "" : "s"}`);
  }
  if (stats.intFields > 0) labels.push(`${stats.intFields} int`);
  for (const format of stats.formats) labels.push(FORMAT_LABEL[format]);
  if (!rootShape && opts.declaration === "interface") {
    let reason: string;
    if (root.arrays > 0) reason = "array root";
    else if (root.object) reason = "empty object root";
    else reason = "primitive root";
    labels.push(`${reason} → type alias`);
  }

  return {
    ok: true,
    ts: `${HEADER}\n\n${tsDecls.join("\n\n")}\n`,
    zod: `${HEADER}\n\nimport { z } from "zod";\n\n${zodDecls.join("\n\n")}\n`,
    stats: labels,
  };
}

/* -------------------------------------------------------------------------- */
/* DOM                                                                        */
/* -------------------------------------------------------------------------- */

function isMissingStyle(value: string): value is MissingStyle {
  return value === "optional" || value === "nullable" || value === "both";
}

async function copyText(text: string): Promise<void> {
  await navigator.clipboard.writeText(text);
}

function selectContents(node: HTMLElement): void {
  const selection = window.getSelection();
  if (!selection) return;
  const range = document.createRange();
  range.selectNodeContents(node);
  selection.removeAllRanges();
  selection.addRange(range);
}

function init(): void {
  const root = document.getElementById("jts-root");
  if (!root || root.dataset.bound === "1") return;

  const inputNode = document.getElementById("jts-input");
  const rootNameNode = document.getElementById("jts-root-name");
  const missingNode = document.getElementById("jts-missing");
  const readonlyNode = document.getElementById("jts-readonly");
  const nestedNode = document.getElementById("jts-nested");
  const formatsNode = document.getElementById("jts-formats");
  const datesNode = document.getElementById("jts-dates");
  const tsOutNode = document.getElementById("jts-out-ts");
  const zodOutNode = document.getElementById("jts-out-zod");

  if (
    !(inputNode instanceof HTMLTextAreaElement) ||
    !(rootNameNode instanceof HTMLInputElement) ||
    !(missingNode instanceof HTMLSelectElement) ||
    !(readonlyNode instanceof HTMLInputElement) ||
    !(nestedNode instanceof HTMLInputElement) ||
    !(formatsNode instanceof HTMLInputElement) ||
    !(datesNode instanceof HTMLInputElement) ||
    !(tsOutNode instanceof HTMLElement) ||
    !(zodOutNode instanceof HTMLElement)
  ) {
    return;
  }
  root.dataset.bound = "1";

  // Re-bind with explicit types: the hoisted function declarations below do
  // not inherit the control-flow narrowing from the guard above.
  const input: HTMLTextAreaElement = inputNode;
  const rootName: HTMLInputElement = rootNameNode;
  const missing: HTMLSelectElement = missingNode;
  const readonlyProps: HTMLInputElement = readonlyNode;
  const nested: HTMLInputElement = nestedNode;
  const formats: HTMLInputElement = formatsNode;
  const dates: HTMLInputElement = datesNode;
  const tsOut: HTMLElement = tsOutNode;
  const zodOut: HTMLElement = zodOutNode;

  const errorEl = document.getElementById("jts-error");
  const statsEl = document.getElementById("jts-stats");
  const copyLabel = document.getElementById("jts-copy-label");
  const declButtons = Array.from(
    root.querySelectorAll<HTMLButtonElement>("[data-jts-decl]"),
  );
  const tabs = Array.from(
    root.querySelectorAll<HTMLButtonElement>("[data-jts-tab]"),
  );

  let declaration: Options["declaration"] = "interface";
  let activeTab: "ts" | "zod" = "ts";

  function readOptions(): Options {
    return {
      rootName: toPascal(rootName.value.trim()) || "Root",
      declaration,
      missingStyle: isMissingStyle(missing.value) ? missing.value : "optional",
      readonlyProps: readonlyProps.checked,
      nested: nested.checked ? "named" : "inline",
      detectFormats: formats.checked,
      datesAsDate: dates.checked,
    };
  }

  function setError(message: string | null): void {
    if (!errorEl) return;
    errorEl.hidden = message === null;
    errorEl.textContent = message ?? "";
  }

  function setStats(labels: string[]): void {
    if (!statsEl) return;
    statsEl.replaceChildren();
    statsEl.hidden = labels.length === 0;
    for (const label of labels) {
      const li = document.createElement("li");
      li.className =
        "mono rounded-full border-[2px] border-ink bg-paper px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest";
      li.textContent = label;
      statsEl.appendChild(li);
    }
  }

  function render(): void {
    const result = generate(input.value, readOptions());
    if (!result.ok) {
      setError(result.message);
      setStats([]);
      return;
    }
    setError(null);
    setStats(result.stats);
    tsOut.textContent = result.ts;
    zodOut.textContent = result.zod;
  }

  function setTab(next: "ts" | "zod"): void {
    activeTab = next;
    for (const tab of tabs) {
      const key = tab.dataset.jtsTab;
      const active = key === next;
      tab.setAttribute("aria-selected", active ? "true" : "false");
      tab.tabIndex = active ? 0 : -1;
      tab.classList.toggle("bg-yellow", active);
      tab.classList.toggle("bg-paper", !active);
      const panel = document.getElementById(`jts-panel-${key ?? ""}`);
      if (panel) panel.hidden = !active;
    }
  }

  function setDeclaration(next: Options["declaration"]): void {
    declaration = next;
    for (const button of declButtons) {
      const active = button.dataset.jtsDecl === next;
      button.setAttribute("aria-pressed", active ? "true" : "false");
      button.classList.toggle("bg-yellow", active);
      button.classList.toggle("bg-paper", !active);
    }
    render();
  }

  input.addEventListener("input", render);
  rootName.addEventListener("input", render);
  missing.addEventListener("change", render);
  for (const toggle of [readonlyProps, nested, formats, dates]) {
    toggle.addEventListener("change", render);
  }

  for (const button of declButtons) {
    button.addEventListener("click", () => {
      const next = button.dataset.jtsDecl;
      if (next !== "interface" && next !== "type") return;
      setDeclaration(next);
    });
  }

  for (const [index, tab] of tabs.entries()) {
    tab.addEventListener("click", () => {
      const key = tab.dataset.jtsTab;
      if (key !== "ts" && key !== "zod") return;
      setTab(key);
    });
    tab.addEventListener("keydown", (event) => {
      if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
      event.preventDefault();
      const delta = event.key === "ArrowRight" ? 1 : -1;
      const target = tabs[(index + delta + tabs.length) % tabs.length];
      const key = target.dataset.jtsTab;
      if (key !== "ts" && key !== "zod") return;
      setTab(key);
      target.focus();
    });
  }

  root
    .querySelectorAll<HTMLButtonElement>("[data-jts-sample]")
    .forEach((button) => {
      button.addEventListener("click", () => {
        const raw = button.dataset.jtsSample ?? "";
        try {
          input.value = JSON.stringify(JSON.parse(raw), null, 2);
        } catch {
          input.value = raw;
        }
        render();
      });
    });

  document.getElementById("jts-clear")?.addEventListener("click", () => {
    input.value = "";
    render();
    input.focus();
  });

  document.getElementById("jts-copy")?.addEventListener("click", () => {
    const source = activeTab === "ts" ? tsOut : zodOut;
    const text = source.textContent ?? "";
    if (text === "") return;
    void copyText(text)
      .then(() => {
        if (!copyLabel) return;
        copyLabel.textContent = "Copied!";
        window.setTimeout(() => {
          copyLabel.textContent = "Copy";
        }, 1500);
      })
      .catch(() => {
        // Clipboard blocked or unavailable — select so Cmd/Ctrl+C still works.
        selectContents(source);
      });
  });

  setDeclaration("interface");
  setTab("ts");
}

init();
document.addEventListener("astro:after-swap", init);

export {};
