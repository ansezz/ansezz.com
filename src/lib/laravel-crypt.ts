/**
 * Laravel Crypt compatible encrypt and decrypt with Web Crypto.
 *
 * Mirrors Illuminate\Encryption\Encrypter (laravel/framework 12.x):
 *   - Ciphers: aes-128-cbc, aes-256-cbc, aes-128-gcm, aes-256-gcm.
 *     Key size 16 or 32 bytes. APP_KEY is "base64:" + base64 of the key.
 *   - encrypt($value, $serialize = true): iv = random bytes (16 for CBC,
 *     12 for GCM); value = base64(openssl_encrypt(serialize(value)));
 *     CBC: mac = hex(HMAC-SHA256(key, iv_b64 . value_b64)), tag = "".
 *     GCM: mac = "", tag = base64(16 byte auth tag), no extra data.
 *     payload = base64(json_encode({iv, value, mac, tag}, JSON_UNESCAPED_SLASHES)).
 *   - encryptString() is encrypt() without serialize().
 * Runs only in the browser (or Node's Web Crypto). Nothing is sent anywhere.
 */

export type LaravelCipher =
  | "aes-128-cbc"
  | "aes-256-cbc"
  | "aes-128-gcm"
  | "aes-256-gcm";

export const CIPHERS: Record<
  LaravelCipher,
  { size: number; aead: boolean; ivLength: number }
> = {
  "aes-128-cbc": { size: 16, aead: false, ivLength: 16 },
  "aes-256-cbc": { size: 32, aead: false, ivLength: 16 },
  "aes-128-gcm": { size: 16, aead: true, ivLength: 12 },
  "aes-256-gcm": { size: 32, aead: true, ivLength: 12 },
};

const subtle = (): SubtleCrypto => globalThis.crypto.subtle;
const enc = new TextEncoder();
const dec = new TextDecoder("utf-8", { fatal: false });

export function b64encode(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000)
    s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

/** Strict-ish base64 decode. Accepts base64url and missing padding. */
export function b64decode(s: string): Uint8Array {
  let t = s.trim().replace(/-/g, "+").replace(/_/g, "/").replace(/\s+/g, "");
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(t)) throw new Error("Not valid base64.");
  while (t.length % 4) t += "=";
  const bin = atob(t);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

const toHex = (b: Uint8Array): string =>
  Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");

/** Parses APP_KEY ("base64:..." or a raw 16/32 character key). */
export function parseAppKey(appKey: string): Uint8Array {
  const k = appKey
    .trim()
    .replace(/^["']|["']$/g, "")
    .replace(/^APP_KEY=/, "");
  if (!k) throw new Error("Enter your APP_KEY.");
  if (k.startsWith("base64:")) return b64decode(k.slice(7));
  return enc.encode(k);
}

/** Picks the cipher that fits the key length when the user asks for auto. */
export function checkKey(
  key: Uint8Array,
  cipher: LaravelCipher,
): string | null {
  const need = CIPHERS[cipher].size;
  if (key.length !== need)
    return `The key is ${key.length} bytes, but ${cipher} needs ${need}. Check the cipher in config/app.php.`;
  return null;
}

async function hmacHex(key: Uint8Array, data: string): Promise<string> {
  const k = await subtle().importKey(
    "raw",
    key as BufferSource,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return toHex(
    new Uint8Array(await subtle().sign("HMAC", k, enc.encode(data))),
  );
}

/** Constant-time string compare. */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

// ── PHP serialize, strings only ──────────────────────────────────────

/** serialize() of a PHP string: s:<byte length>:"...";. */
export function phpSerializeString(s: string): string {
  return `s:${enc.encode(s).length}:"${s}";`;
}

/**
 * Reads back a serialized PHP scalar. Returns null when the text is not a
 * simple serialized value (arrays and objects are shown as raw text).
 */
export function phpUnserializeScalar(
  s: string,
): { type: string; value: string } | null {
  let m = /^s:(\d+):"([\s\S]*)";$/.exec(s);
  if (m && enc.encode(m[2]).length === Number(m[1]))
    return { type: "string", value: m[2] };
  m = /^i:(-?\d+);$/.exec(s);
  if (m) return { type: "int", value: m[1] };
  m = /^d:(-?[\d.eE+-]+|NAN|INF|-INF);$/.exec(s);
  if (m) return { type: "float", value: m[1] };
  m = /^b:([01]);$/.exec(s);
  if (m) return { type: "bool", value: m[1] === "1" ? "true" : "false" };
  if (s === "N;") return { type: "null", value: "null" };
  return null;
}

// ── Encrypt ──────────────────────────────────────────────────────────

export interface EncryptOptions {
  /** true = Crypt::encrypt (serialize first), false = Crypt::encryptString. */
  serialize: boolean;
  /** Fixed IV, for tests only. */
  iv?: Uint8Array;
}

export async function laravelEncrypt(
  plaintext: string,
  key: Uint8Array,
  cipher: LaravelCipher,
  opts: EncryptOptions,
): Promise<string> {
  const c = CIPHERS[cipher];
  const bad = checkKey(key, cipher);
  if (bad) throw new Error(bad);
  const iv =
    opts.iv ?? globalThis.crypto.getRandomValues(new Uint8Array(c.ivLength));
  const data = enc.encode(
    opts.serialize ? phpSerializeString(plaintext) : plaintext,
  );
  const ivB64 = b64encode(iv);

  if (c.aead) {
    const k = await subtle().importKey(
      "raw",
      key as BufferSource,
      "AES-GCM",
      false,
      ["encrypt"],
    );
    const out = new Uint8Array(
      await subtle().encrypt(
        { name: "AES-GCM", iv: iv as BufferSource, tagLength: 128 },
        k,
        data,
      ),
    );
    const value = b64encode(out.subarray(0, out.length - 16));
    const tag = b64encode(out.subarray(out.length - 16));
    return b64encode(
      enc.encode(JSON.stringify({ iv: ivB64, value, mac: "", tag })),
    );
  }

  const k = await subtle().importKey(
    "raw",
    key as BufferSource,
    "AES-CBC",
    false,
    ["encrypt"],
  );
  const value = b64encode(
    new Uint8Array(
      await subtle().encrypt(
        { name: "AES-CBC", iv: iv as BufferSource },
        k,
        data,
      ),
    ),
  );
  const mac = await hmacHex(key, ivB64 + value);
  return b64encode(
    enc.encode(JSON.stringify({ iv: ivB64, value, mac, tag: "" })),
  );
}

// ── Decrypt ──────────────────────────────────────────────────────────

export interface Envelope {
  iv: string;
  value: string;
  mac: string;
  tag?: string;
}

/** Decodes the outer base64 and JSON without a key. */
export function inspectPayload(payload: string): Envelope {
  let raw = payload.trim();
  try {
    raw = decodeURIComponent(raw); // cookies are often URL-encoded
  } catch {
    /* keep as is */
  }
  let json: string;
  try {
    json = dec.decode(b64decode(raw));
  } catch {
    throw new Error(
      "The payload is not base64. A Laravel payload starts with eyJ.",
    );
  }
  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch {
    throw new Error(
      "The payload decodes, but not to JSON. It is not a Laravel Crypt payload.",
    );
  }
  const d = data as Record<string, unknown>;
  for (const k of ["iv", "value", "mac"]) {
    if (typeof d?.[k] !== "string")
      throw new Error(
        `The payload has no "${k}" string. It is not a Laravel Crypt payload.`,
      );
  }
  if (d.tag !== undefined && typeof d.tag !== "string")
    throw new Error('"tag" must be a string.');
  return {
    iv: d.iv as string,
    value: d.value as string,
    mac: d.mac as string,
    tag: d.tag as string | undefined,
  };
}

/** Guesses the cipher family from the envelope. */
export function guessCipher(env: Envelope, keyLength: number): LaravelCipher {
  const gcm = !!env.tag && env.mac === "";
  if (gcm) return keyLength === 16 ? "aes-128-gcm" : "aes-256-gcm";
  return keyLength === 16 ? "aes-128-cbc" : "aes-256-cbc";
}

export interface DecryptResult {
  /** Raw decrypted text. */
  raw: string;
  /** Unserialized scalar, if the raw text is a serialized PHP value. */
  unserialized: { type: string; value: string } | null;
  /** Laravel cookie values start with an HMAC of the cookie name and "|". */
  cookiePrefix: string | null;
  cipher: LaravelCipher;
  macChecked: boolean;
}

export async function laravelDecrypt(
  payload: string,
  key: Uint8Array,
  cipher: LaravelCipher | "auto",
): Promise<DecryptResult> {
  const env = inspectPayload(payload);
  const chosen = cipher === "auto" ? guessCipher(env, key.length) : cipher;
  const c = CIPHERS[chosen];
  const bad = checkKey(key, chosen);
  if (bad) throw new Error(bad);

  const iv = b64decode(env.iv);
  if (iv.length !== c.ivLength)
    throw new Error(
      `The IV is ${iv.length} bytes, but ${chosen} uses ${c.ivLength}. Try the other cipher.`,
    );
  const value = b64decode(env.value);
  let plain: Uint8Array;

  if (c.aead) {
    const tag = env.tag ? b64decode(env.tag) : new Uint8Array();
    if (tag.length !== 16)
      throw new Error(
        "GCM needs a 16 byte tag, and this payload has none. Try a CBC cipher.",
      );
    const k = await subtle().importKey(
      "raw",
      key as BufferSource,
      "AES-GCM",
      false,
      ["decrypt"],
    );
    const both = new Uint8Array(value.length + 16);
    both.set(value);
    both.set(tag, value.length);
    try {
      plain = new Uint8Array(
        await subtle().decrypt(
          { name: "AES-GCM", iv: iv as BufferSource, tagLength: 128 },
          k,
          both,
        ),
      );
    } catch {
      throw new Error(
        "Could not decrypt. The key is wrong or the payload was changed.",
      );
    }
  } else {
    if (env.tag)
      throw new Error("This payload has a GCM tag. Pick a GCM cipher.");
    const mac = await hmacHex(key, env.iv + env.value);
    if (!safeEqual(mac, env.mac.toLowerCase()))
      throw new Error(
        "The MAC is invalid. The APP_KEY is wrong, or the payload was changed.",
      );
    const k = await subtle().importKey(
      "raw",
      key as BufferSource,
      "AES-CBC",
      false,
      ["decrypt"],
    );
    try {
      plain = new Uint8Array(
        await subtle().decrypt(
          { name: "AES-CBC", iv: iv as BufferSource },
          k,
          value as BufferSource,
        ),
      );
    } catch {
      throw new Error("Could not decrypt the data.");
    }
  }

  const raw = dec.decode(plain);
  const cookie = /^([0-9a-f]{40})\|([\s\S]*)$/.exec(raw);
  return {
    raw,
    unserialized: phpUnserializeScalar(cookie ? cookie[2] : raw),
    cookiePrefix: cookie ? cookie[1] : null,
    cipher: chosen,
    macChecked: !c.aead,
  };
}

/** New random APP_KEY for the chosen cipher. */
export function randomAppKey(cipher: LaravelCipher): string {
  return (
    "base64:" +
    b64encode(
      globalThis.crypto.getRandomValues(new Uint8Array(CIPHERS[cipher].size)),
    )
  );
}
