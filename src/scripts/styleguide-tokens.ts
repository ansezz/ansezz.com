// Prints the *live* value of each colour token on /styleguide/ instead of a
// hand-maintained copy. The hardcoded list had already drifted (purple was
// documented as #9b5de5 while the token was #7c3aed), and this also surfaces
// the dark-theme values when the theme is toggled.

function rgbToHex(value: string): string {
  const m = value.match(/rgba?\(([^)]+)\)/);
  if (!m) return value.trim();
  const [r, g, b] = m[1]
    .split(/[\s,/]+/)
    .filter(Boolean)
    .slice(0, 3)
    .map(Number);
  if ([r, g, b].some((n) => Number.isNaN(n))) return value.trim();
  return "#" + [r, g, b].map((n) => n.toString(16).padStart(2, "0")).join("");
}

function sync(): void {
  const root = document.documentElement;
  const cs = getComputedStyle(root);
  document.querySelectorAll<HTMLElement>("[data-token]").forEach((el) => {
    const token = el.dataset.token;
    if (!token) return;
    const raw = cs.getPropertyValue(`--color-${token}`).trim();
    if (!raw) return;
    // Resolve named/rgb forms through a probe so we always print hex.
    const probe = document.createElement("span");
    probe.style.color = raw;
    probe.style.display = "none";
    root.appendChild(probe);
    const resolved = getComputedStyle(probe).color;
    probe.remove();
    el.textContent = rgbToHex(resolved || raw);
  });
}

sync();
document.addEventListener("astro:after-swap", sync);
new MutationObserver(sync).observe(document.documentElement, {
  attributes: true,
  attributeFilter: ["data-theme"],
});

export {};
