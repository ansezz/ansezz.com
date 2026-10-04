// Laravel encrypt and decrypt. Crypto lives in @/lib/laravel-crypt and uses
// the browser's Web Crypto API. Nothing is sent anywhere and nothing is kept
// in the URL or in storage.

import {
  CIPHERS,
  inspectPayload,
  laravelDecrypt,
  laravelEncrypt,
  parseAppKey,
  randomAppKey,
  type LaravelCipher,
} from "@/lib/laravel-crypt";

const P = "laravel-encrypt-decrypt-";

// Real output of Laravel 12 (illuminate/encryption v12.69.3):
// (new Encrypter($key, 'aes-256-cbc'))->encryptString('Hello from Laravel 12 ✓')
// with a throwaway test key. Never a production key.
const SAMPLE_KEY = "base64:zafDeipsyiokGi9KKaaHqcRnn4TsBYZgPacIskonAKg=";
const SAMPLE_PAYLOAD =
  "eyJpdiI6IjNXcjMrL09ac2d6d1NaM1hydlZPS3c9PSIsInZhbHVlIjoiT1cxaWZZSU5SS0l4MURDRFphTkNqdUdOS1d5cTFLSzR5UGxvZ1pTc3NGUT0iLCJtYWMiOiI2Y2QxYzBlNTY4ZDZhNmZlNWRkY2UzMThlY2QxZDZiNzg2Y2U5NzQyMmNiZTMxMTZjZDczMzhmMzU3MGRiNDk0IiwidGFnIjoiIn0=";

function init(): void {
  const root = document.getElementById(`${P}root`);
  if (!root || root.dataset.bound === "1") return;
  root.dataset.bound = "1";

  const $ = <T extends HTMLElement>(id: string): T =>
    document.getElementById(P + id) as T;

  const key = $<HTMLInputElement>("key");
  const keyinfo = $<HTMLElement>("keyinfo");
  const cipher = $<HTMLSelectElement>("cipher");
  const payload = $<HTMLTextAreaElement>("payload");
  const dstatus = $<HTMLElement>("dstatus");
  const plain = $<HTMLElement>("plain");
  const envelope = $<HTMLElement>("envelope");
  const text = $<HTMLTextAreaElement>("text");
  const serialize = $<HTMLInputElement>("serialize");
  const estatus = $<HTMLElement>("estatus");
  const out = $<HTMLElement>("out");

  if (!globalThis.crypto?.subtle) {
    dstatus.textContent =
      "This browser has no Web Crypto API. Open the page over https in a current browser.";
    return;
  }

  let run = 0;

  function describeKey(): Uint8Array | null {
    if (!key.value.trim()) {
      keyinfo.textContent = "Paste it from .env, with the base64: prefix.";
      return null;
    }
    try {
      const k = parseAppKey(key.value);
      const fits = Object.entries(CIPHERS)
        .filter(([, c]) => c.size === k.length)
        .map(([n]) => n.toUpperCase());
      keyinfo.textContent = fits.length
        ? `${k.length} byte key. Works with ${fits.join(" and ")}.`
        : `${k.length} byte key. Laravel needs 16 or 32 bytes.`;
      return k;
    } catch (e) {
      keyinfo.textContent = (e as Error).message;
      return null;
    }
  }

  async function decrypt(): Promise<void> {
    const mine = ++run;
    const k = describeKey();
    plain.textContent = "";
    envelope.textContent = "";
    if (!payload.value.trim()) {
      dstatus.textContent = "Paste a payload to start.";
      return;
    }
    try {
      const env = inspectPayload(payload.value);
      envelope.textContent = JSON.stringify(env, null, 2);
    } catch (e) {
      dstatus.textContent = (e as Error).message;
      return;
    }
    if (!k) {
      dstatus.textContent =
        "The payload looks valid. Add your APP_KEY to decrypt it.";
      return;
    }
    try {
      const r = await laravelDecrypt(
        payload.value,
        k,
        cipher.value as LaravelCipher | "auto",
      );
      if (mine !== run) return;
      const parts = [
        `Decrypted with ${r.cipher.toUpperCase()}${r.macChecked ? ", MAC valid" : ", tag valid"}.`,
      ];
      if (r.cookiePrefix)
        parts.push(
          `Starts with a cookie prefix (${r.cookiePrefix.slice(0, 8)}...|). The value is after the | sign.`,
        );
      if (r.unserialized)
        parts.push(
          `Serialized PHP ${r.unserialized.type}: ${r.unserialized.value}`,
        );
      dstatus.textContent = parts.join(" ");
      plain.textContent = r.raw;
    } catch (e) {
      if (mine !== run) return;
      dstatus.textContent = (e as Error).message;
    }
  }

  async function encrypt(): Promise<void> {
    out.textContent = "";
    const k = describeKey();
    if (!k) {
      estatus.textContent = "Add your APP_KEY first, or make a new test key.";
      return;
    }
    let c = cipher.value as LaravelCipher | "auto";
    if (c === "auto") c = k.length === 16 ? "aes-128-cbc" : "aes-256-cbc";
    try {
      out.textContent = await laravelEncrypt(text.value, k, c, {
        serialize: serialize.checked,
      });
      estatus.textContent = `Encrypted with ${c.toUpperCase()}. Read it in PHP with ${serialize.checked ? "Crypt::decrypt()" : "Crypt::decryptString()"}.`;
    } catch (e) {
      estatus.textContent = (e as Error).message;
    }
  }

  key.addEventListener("input", () => void decrypt());
  cipher.addEventListener("change", () => void decrypt());
  payload.addEventListener("input", () => void decrypt());
  $<HTMLButtonElement>("encrypt").addEventListener(
    "click",
    () => void encrypt(),
  );

  $<HTMLButtonElement>("genkey").addEventListener("click", () => {
    const c = cipher.value.startsWith("aes-128")
      ? "aes-128-cbc"
      : "aes-256-cbc";
    key.value = randomAppKey(c as LaravelCipher);
    void decrypt();
  });

  $<HTMLButtonElement>("sample").addEventListener("click", () => {
    key.value = SAMPLE_KEY;
    cipher.value = "auto";
    payload.value = SAMPLE_PAYLOAD;
    if (!text.value) text.value = "Hello from the browser";
    void decrypt();
  });

  $<HTMLButtonElement>("copy").addEventListener("click", async (ev) => {
    const btn = ev.currentTarget as HTMLButtonElement;
    if (!out.textContent) return;
    try {
      await navigator.clipboard.writeText(out.textContent);
      btn.textContent = "Copied";
    } catch {
      btn.textContent = "Copy failed";
    }
    window.setTimeout(() => (btn.textContent = "Copy"), 1500);
  });
}

init();
document.addEventListener("astro:after-swap", init);
