// Bulk UUID generator (v4 and v7) plus an inspector that reads the version,
// variant and embedded timestamp of any UUID. Everything runs in the browser
// with crypto.getRandomValues.

type Version = "v4" | "v7";

function hexOf(bytes: Uint8Array): string {
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function uuidv4(): string {
  const direct = crypto.randomUUID?.();
  if (direct) return direct;
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  return hexOf(bytes);
}

// RFC 9562 v7: 48-bit Unix ms timestamp, version, 12-bit rand_a, variant,
// 62-bit rand_b. Within one millisecond, rand_a is used as a counter so a
// batch stays strictly increasing (the RFC's "method 1").
let lastMs = -1;
let counter = 0;

function uuidv7(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let ms = Date.now();
  if (ms <= lastMs) {
    counter += 1;
    if (counter > 0xfff) {
      lastMs += 1;
      counter = 0;
    }
    ms = lastMs;
  } else {
    lastMs = ms;
    counter = ((bytes[6] & 0x07) << 8) | bytes[7]; // random start, room to grow
  }
  // 48-bit big-endian timestamp. Division keeps it exact past 2^32.
  const hi = Math.floor(ms / 2 ** 16);
  const lo = ms % 2 ** 16;
  bytes[0] = (hi >>> 24) & 0xff;
  bytes[1] = (hi >>> 16) & 0xff;
  bytes[2] = (hi >>> 8) & 0xff;
  bytes[3] = hi & 0xff;
  bytes[4] = (lo >>> 8) & 0xff;
  bytes[5] = lo & 0xff;
  bytes[6] = 0x70 | ((counter >>> 8) & 0x0f);
  bytes[7] = counter & 0xff;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  return hexOf(bytes);
}

interface Inspection {
  ok: boolean;
  rows: [string, string][];
  error?: string;
}

const GREGORIAN_OFFSET_MS = 12219292800000; // 1582-10-15 to 1970-01-01

function inspect(raw: string): Inspection {
  const clean = raw
    .trim()
    .replace(/^urn:uuid:/i, "")
    .replace(/^\{|\}$/g, "");
  const hex = clean.replace(/-/g, "").toLowerCase();
  if (!/^[0-9a-f]{32}$/.test(hex)) {
    return {
      ok: false,
      rows: [],
      error: "Not a UUID. Expect 32 hex digits, with or without dashes.",
    };
  }
  const canonical = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  if (/^0+$/.test(hex))
    return {
      ok: true,
      rows: [
        ["Type", "Nil UUID (all zeros)"],
        ["Canonical", canonical],
      ],
    };
  if (/^f+$/.test(hex))
    return {
      ok: true,
      rows: [
        ["Type", "Max UUID (all ones)"],
        ["Canonical", canonical],
      ],
    };

  const version = parseInt(hex[12], 16);
  const v8 = parseInt(hex[16], 16);
  const variant =
    v8 < 8
      ? "NCS (legacy)"
      : v8 < 12
        ? "RFC 9562 (the normal one)"
        : v8 < 14
          ? "Microsoft (legacy GUID)"
          : "Reserved";
  const names: Record<number, string> = {
    1: "v1, time and node (MAC)",
    2: "v2, DCE security",
    3: "v3, MD5 name based",
    4: "v4, random",
    5: "v5, SHA-1 name based",
    6: "v6, reordered time",
    7: "v7, Unix time ordered",
    8: "v8, custom",
  };
  const rows: [string, string][] = [
    ["Canonical", canonical],
    ["Version", names[version] ?? `${version} (not defined)`],
    ["Variant", variant],
  ];

  let ms: number | null = null;
  if (version === 7) {
    ms = parseInt(hex.slice(0, 12), 16);
  } else if (version === 1 || version === 6) {
    // 60-bit count of 100 ns intervals since 1582-10-15.
    const t =
      version === 1
        ? hex.slice(13, 16) + hex.slice(8, 12) + hex.slice(0, 8)
        : hex.slice(0, 12) + hex.slice(13, 16);
    const ticks = BigInt(`0x${t}`);
    ms = Number(ticks / 10000n) - GREGORIAN_OFFSET_MS;
  }
  if (ms !== null) {
    const d = new Date(ms);
    if (Number.isFinite(d.getTime())) {
      rows.push(["Timestamp (UTC)", d.toISOString()]);
      rows.push(["Your time", d.toLocaleString()]);
      rows.push(["Unix ms", String(ms)]);
    }
  }
  if (version === 1) {
    rows.push(["Node", hex.slice(20).replace(/(..)(?!$)/g, "$1:")]);
  }
  if (version === 4) {
    rows.push(["Timestamp", "None. A v4 UUID is 122 random bits."]);
  }
  return { ok: true, rows };
}

function init(): void {
  const root = document.getElementById("uuid-root");
  if (!root || root.dataset.bound === "1") return;
  root.dataset.bound = "1";

  const countEl = document.getElementById("uuid-count") as HTMLInputElement;
  const output = document.getElementById("uuid-output") as HTMLTextAreaElement;
  const genBtn = document.getElementById("uuid-generate");
  const copyBtn = document.getElementById("uuid-copy");
  const copyLabel = document.getElementById("uuid-copy-label");
  const versionEls = root.querySelectorAll<HTMLInputElement>(
    'input[name="uuid-version"]',
  );
  const inspectIn = document.getElementById(
    "uuid-inspect",
  ) as HTMLInputElement | null;
  const inspectOut = document.getElementById("uuid-inspect-out");

  function version(): Version {
    for (const el of versionEls) if (el.checked) return el.value as Version;
    return "v4";
  }

  function generate(): void {
    const n = Math.max(1, Math.min(500, parseInt(countEl.value, 10) || 1));
    countEl.value = String(n);
    const make = version() === "v7" ? uuidv7 : uuidv4;
    output.value = Array.from({ length: n }, () => make()).join("\n");
    if (inspectIn && !inspectIn.value)
      renderInspect(output.value.split("\n")[0]);
  }

  function renderInspect(value: string): void {
    if (!inspectOut) return;
    inspectOut.replaceChildren();
    if (!value.trim()) return;
    const r = inspect(value);
    if (!r.ok) {
      const p = document.createElement("p");
      p.className = "font-bold";
      p.textContent = r.error ?? "Not a UUID.";
      inspectOut.appendChild(p);
      return;
    }
    const dl = document.createElement("dl");
    dl.className = "grid gap-x-4 gap-y-1 text-sm sm:grid-cols-[10rem_1fr]";
    for (const [k, v] of r.rows) {
      const dt = document.createElement("dt");
      dt.className = "font-bold";
      dt.textContent = k;
      const dd = document.createElement("dd");
      dd.className = "min-w-0 font-mono break-all";
      dd.textContent = v;
      dl.append(dt, dd);
    }
    inspectOut.appendChild(dl);
  }

  genBtn?.closest("button")?.addEventListener("click", generate);
  versionEls.forEach((el) => el.addEventListener("change", generate));
  inspectIn?.addEventListener("input", () => renderInspect(inspectIn.value));
  copyBtn?.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(output.value);
      if (copyLabel) {
        copyLabel.textContent = "Copied!";
        window.setTimeout(() => (copyLabel.textContent = "Copy all"), 1500);
      }
    } catch {
      output.select();
    }
  });

  generate();
}

init();
document.addEventListener("astro:after-swap", init);

export {};
