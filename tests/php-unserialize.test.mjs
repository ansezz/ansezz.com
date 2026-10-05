// Unit tests for src/lib/php-unserialize.ts against real PHP output.
// Fixtures were made with PHP 8.4 serialize() and a Laravel 13 failed job
// (see tests/fixtures). Run: pnpm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  unserialize,
  toJson,
  parseLaravelPayload,
  summarizeCommand,
  splitPropName,
  PhpParseError,
} from "../src/lib/php-unserialize.ts";

const load = (f) =>
  JSON.parse(readFileSync(new URL(`./fixtures/${f}`, import.meta.url), "utf8"));
const samples = load("php-serialized.json");
const jobs = load("laravel-failed-jobs.json");
const bytesOf = (s) => Buffer.from(s.b64, "base64");
const sample = (name) => {
  const s = samples.find((x) => x.name === name);
  assert.ok(s, `missing fixture ${name}`);
  return s;
};

for (const s of samples.filter((x) => "json" in x && x.name !== "scalars")) {
  test(`matches PHP for: ${s.name}`, () => {
    const r = unserialize(new Uint8Array(bytesOf(s)));
    assert.deepEqual(r.warnings, []);
    assert.deepEqual(JSON.parse(JSON.stringify(toJson(r.value))), s.json);
  });
}

test("multibyte strings count bytes, not characters", () => {
  const r = unserialize(new Uint8Array(bytesOf(sample("multibyte strings"))));
  const name = r.value.items.find((i) => i.key === "name").value;
  assert.equal(name.v, "Café ☕ 日本語");
  assert.equal(name.bytes, 19);
  assert.equal(r.value.items.find((i) => i.key === "emoji").value.v, "👍🏽");
});

test("same input as a JS string works too", () => {
  const raw = bytesOf(sample("multibyte strings")).toString("utf8");
  assert.equal(toJson(unserialize(raw).value).ar, "مرحبا");
});

test("nested arrays keep integer and negative keys", () => {
  const v = unserialize(new Uint8Array(bytesOf(sample("nested arrays")))).value;
  assert.deepEqual(
    v.items.map((i) => i.key),
    [0, 1, "k", 10, -5],
  );
});

test("scalars, including 64-bit ints and INF", () => {
  const v = toJson(
    unserialize(new Uint8Array(bytesOf(sample("scalars")))).value,
  );
  assert.equal(v[0], -42);
  assert.equal(v[1], "9223372036854775807");
  assert.equal(v[2], "-9223372036854775808");
  assert.equal(v[3], 0.1);
  assert.equal(v[4], 1e25);
  assert.ok(Object.is(v[5], -0));
  assert.deepEqual(v.slice(6), [1.5, true, false, null, "INF", "-INF"]);
});

test("protected and private names with NUL bytes", () => {
  const r = unserialize(new Uint8Array(bytesOf(sample("object visibility"))));
  assert.equal(r.value.t, "object");
  assert.equal(r.value.cls, "Child");
  const props = r.value.props.map((p) => [
    p.name,
    p.visibility,
    p.declaringClass ?? "",
  ]);
  // PHP writes the parent's properties first. Both classes have a private
  // $secret, told apart by the declaring class between the NUL bytes.
  assert.deepEqual(props, [
    ["secret", "private", "Base"],
    ["level", "protected", ""],
    ["name", "public", ""],
    ["secret", "private", "Child"],
    ["tags", "protected", ""],
    ["id", "public", ""],
  ]);
  const json = toJson(r.value);
  assert.equal(json.secret, "base-secret");
  assert.equal(json["Child::secret"], "child-secret");
  // The raw bytes really contain NULs.
  assert.ok(bytesOf(sample("object visibility")).includes(0));
});

test("splitPropName", () => {
  assert.deepEqual(splitPropName("\0*\0queue"), {
    name: "queue",
    visibility: "protected",
  });
  assert.deepEqual(splitPropName("\0App\\Job\0meta"), {
    name: "meta",
    visibility: "private",
    declaringClass: "App\\Job",
  });
  assert.deepEqual(splitPropName("id"), { name: "id", visibility: "public" });
});

test("binary strings are flagged", () => {
  const v = unserialize(new Uint8Array(bytesOf(sample("binary string")))).value;
  assert.equal(v.t, "string");
  assert.equal(v.bytes, 5);
  assert.equal(v.binary, true);
});

test("object references (r:) point at the shared object", () => {
  const s = sample("object reference r:");
  const r = unserialize(s.raw);
  // a:3 is slot 1, the stdClass is slot 2, its "n" is slot 3.
  assert.equal(r.slots.get(2).t, "object");
  const refs = r.value.items.filter((i) => i.value.t === "ref");
  assert.equal(refs.length, 2);
  for (const it of refs) {
    assert.equal(it.value.kind, "r");
    assert.equal(it.value.target, 2);
  }
  assert.deepEqual(toJson(r.value)[1], { __ref: 2 });
});

test("PHP references (R:) take no slot", () => {
  const r = unserialize(sample("php reference R:").raw);
  const b = r.value.items[1].value;
  assert.equal(b.t, "ref");
  assert.equal(b.kind, "R");
  assert.equal(b.target, 2);
  assert.equal(b.id, 0);
  assert.equal(r.slots.get(2).v, "same");
});

test("self references do not loop", () => {
  const r = unserialize(sample("self reference").raw);
  assert.deepEqual(toJson(r.value), {
    __class: "stdClass",
    self: { __ref: 1 },
  });
});

test("custom Serializable data (C:) stays an opaque string", () => {
  const r = unserialize(sample("custom Serializable").raw);
  const c = r.value.items[0].value;
  assert.equal(c.t, "custom");
  assert.equal(c.cls, "Legacy");
  assert.equal(c.data, "legacy-data:é");
});

test("__serialize objects keep their own keys", () => {
  const r = unserialize(sample("__serialize object").raw);
  assert.deepEqual(toJson(r.value), { __class: "Modern", x: 1, 0: "zero" });
});

test("NAN", () => {
  assert.ok(Number.isNaN(unserialize(sample("NAN").raw).value.v));
});

test("never runs or creates anything", () => {
  // A classic gadget-style payload is just data here.
  const evil =
    'O:40:"Illuminate\\Broadcasting\\PendingBroadcast":2:{s:9:"' +
    '\0*\0events";O:15:"Faker\\Generator":1:{s:13:"\0*\0formatters";a:1:{s:8:"dispatch";s:6:"system";}}s:8:"\0*\0event";s:2:"id";}';
  const r = unserialize(evil);
  assert.equal(r.value.t, "object");
  assert.equal(Object.getPrototypeOf(r.value), Object.prototype);
  assert.equal(toJson(r.value).events.__class, "Faker\\Generator");
});

test("errors carry the byte offset", () => {
  assert.throws(() => unserialize('a:2:{i:0;s:3:"ab";}'), PhpParseError);
  assert.throws(() => unserialize("x:1;"), /Unknown type "x"/);
  assert.throws(() => unserialize("r:9;"), /unknown value/);
  assert.throws(() => unserialize(""), /Nothing/);
});

test("lenient mode recovers when NUL bytes were lost in a copy", () => {
  const raw = 'O:3:"Job":1:{s:8:"*queue";s:6:"emails";}';
  assert.throws(() => unserialize(raw), /does not match/);
  const r = unserialize(raw, { lenient: true });
  assert.equal(r.value.props[0].name, "*queue");
  assert.equal(r.warnings.length, 1);
});

test("deep nesting is capped", () => {
  const deep = "a:1:{i:0;".repeat(600) + "N;" + "}".repeat(600);
  assert.throws(() => unserialize(deep), /too deep/);
});

test("Laravel failed job payload: command is unserialized", () => {
  const raw = jobs.payloads.find((p) => p.includes("SendInvoiceEmail"));
  const job = parseLaravelPayload(raw);
  assert.equal(job.encrypted, false);
  assert.equal(job.commandName, "App\\Jobs\\SendInvoiceEmail");
  const r = unserialize(job.command);
  assert.deepEqual(r.warnings, []);
  summarizeCommand(job, r.value);
  assert.equal(job.queue, "emails");
  assert.deepEqual(job.models, [
    { cls: "App\\Models\\User", id: 1, connection: "sqlite" },
  ]);
  const meta = r.value.props.find((p) => p.name === "meta");
  assert.equal(meta.visibility, "private");
  assert.equal(meta.declaringClass, "App\\Jobs\\SendInvoiceEmail");
  const json = toJson(r.value);
  assert.equal(json.meta.note, "Café ☕ 日本語");
  assert.equal(json.lines[1].sku, "MUG-ÉTÉ");
  assert.equal(json.status, "App\\Enums\\Status::Active");
  assert.ok(job.facts.some(([k, v]) => k === "Max tries" && v === "3"));
});

test("Laravel encrypted job is detected", () => {
  const raw = jobs.payloads.find((p) => p.includes("EncryptedJob"));
  const job = parseLaravelPayload(raw);
  assert.equal(job.encrypted, true);
  assert.equal(job.command, null);
});

test("Laravel payload accepts double-encoded JSON", () => {
  const raw = jobs.payloads.find((p) => p.includes("SendInvoiceEmail"));
  const job = parseLaravelPayload(JSON.stringify(raw));
  assert.equal(job.commandName, "App\\Jobs\\SendInvoiceEmail");
});
