// Client-side JWT decoder. Decodes header + payload (base64url), surfaces
// common time claims as human dates. Does NOT verify the signature.

function b64urlDecode(part: string): string {
  const b64 = part.replace(/-/g, "+").replace(/_/g, "/");
  const pad = b64.length % 4 ? "=".repeat(4 - (b64.length % 4)) : "";
  const bin = atob(b64 + pad);
  // Handle UTF-8.
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function pretty(obj: unknown): string {
  return JSON.stringify(obj, null, 2);
}

function fmtTime(sec: number): string {
  const d = new Date(sec * 1000);
  return d.toISOString().replace("T", " ").replace(".000Z", " UTC");
}

const TIME_CLAIMS: Record<string, string> = {
  exp: "Expires",
  iat: "Issued at",
  nbf: "Not before",
};

function init(): void {
  const root = document.getElementById("jwt-root");
  const input = document.getElementById(
    "jwt-input",
  ) as HTMLTextAreaElement | null;
  if (!root || !input || root.dataset.bound === "1") return;
  root.dataset.bound = "1";

  const headerEl = document.getElementById("jwt-header");
  const payloadEl = document.getElementById("jwt-payload");
  const claimsEl = document.getElementById("jwt-claims");
  const errEl = document.getElementById("jwt-error");

  function setError(msg: string | null): void {
    if (!errEl) return;
    errEl.hidden = !msg;
    errEl.textContent = msg ?? "";
  }

  function decode(): void {
    const token = input!.value.trim();
    if (!token) {
      if (headerEl) headerEl.textContent = "—";
      if (payloadEl) payloadEl.textContent = "—";
      if (claimsEl) claimsEl.replaceChildren();
      setError(null);
      return;
    }
    const parts = token.split(".");
    if (parts.length < 2) {
      setError("Not a JWT — expected at least two dot-separated segments.");
      return;
    }
    try {
      const header = JSON.parse(b64urlDecode(parts[0]));
      const payload = JSON.parse(b64urlDecode(parts[1]));
      setError(null);
      if (headerEl) headerEl.textContent = pretty(header);
      if (payloadEl) payloadEl.textContent = pretty(payload);

      if (claimsEl) {
        claimsEl.replaceChildren();
        const now = Math.floor(Date.now() / 1000);
        for (const [key, label] of Object.entries(TIME_CLAIMS)) {
          if (typeof payload[key] !== "number") continue;
          const li = document.createElement("li");
          li.className = "flex gap-3";
          const k = document.createElement("code");
          k.className = "font-mono font-bold shrink-0 w-28";
          k.textContent = `${key} (${label})`;
          const v = document.createElement("span");
          let txt = fmtTime(payload[key]);
          if (key === "exp")
            txt += payload[key] < now ? " — EXPIRED" : " — valid";
          v.textContent = txt;
          v.className =
            key === "exp" && payload[key] < now
              ? "text-accent-text font-bold"
              : "";
          li.append(k, v);
          claimsEl.appendChild(li);
        }
        if (!claimsEl.childElementCount) {
          const li = document.createElement("li");
          li.className = "opacity-60";
          li.textContent = "No standard time claims (exp / iat / nbf) present.";
          claimsEl.appendChild(li);
        }
      }
    } catch {
      setError("Could not decode — segments aren't valid base64url JSON.");
    }
  }

  input.addEventListener("input", decode);
  decode();
}

init();
document.addEventListener("astro:after-swap", init);

export {};
