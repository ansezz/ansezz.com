// Progressive-enhancement submit for the Web3Forms contact form: posts via
// fetch and shows inline status. Falls back to a normal POST if JS fails.
// Also reads ?package= / ?lane= to preselect a package and show microcopy.
// Package id→label map is provided by #contact-package-map on the page.

type PackageMap = Record<string, string>;

function packageMap(): PackageMap {
  const el = document.getElementById("contact-package-map");
  if (!el?.textContent) return {};
  try {
    return JSON.parse(el.textContent) as PackageMap;
  } catch {
    return {};
  }
}

function laneAliases(): Record<string, string> {
  const el = document.getElementById("contact-lane-map");
  if (!el?.textContent) return {};
  try {
    return JSON.parse(el.textContent) as Record<string, string>;
  } catch {
    return {};
  }
}

function resolvePackage(labels: PackageMap): string | null {
  try {
    const params = new URLSearchParams(window.location.search);
    const raw = (params.get("package") ?? params.get("lane") ?? "")
      .toLowerCase()
      .trim();
    if (!raw) return null;
    if (raw in labels) return raw;
    const mapped = laneAliases()[raw];
    return mapped && mapped in labels ? mapped : null;
  } catch {
    return null;
  }
}

function applyPackagePrefill(): void {
  const labels = packageMap();
  const pkg = resolvePackage(labels);
  if (!pkg) return;

  const select = document.getElementById(
    "contact-package",
  ) as HTMLSelectElement | null;
  if (select) select.value = pkg;

  const hidden = document.getElementById(
    "contact-package-hidden",
  ) as HTMLInputElement | null;
  if (hidden) hidden.value = labels[pkg] ?? pkg;

  const banner = document.getElementById("contact-package-banner");
  const label = document.getElementById("contact-package-label");
  if (banner && label) {
    label.textContent = labels[pkg] ?? pkg;
    banner.hidden = false;
  }

  const message = document.querySelector<HTMLTextAreaElement>(
    '#contact-form textarea[name="message"]',
  );
  if (message && !message.value.trim()) {
    message.placeholder = `Interested in ${labels[pkg] ?? pkg} — scope, rough timeline, link if it exists.`;
  }
}

function init(): void {
  const form = document.getElementById(
    "contact-form",
  ) as HTMLFormElement | null;
  if (!form || form.dataset.bound === "1") return;
  form.dataset.bound = "1";

  applyPackagePrefill();

  const labels = packageMap();
  const select = document.getElementById(
    "contact-package",
  ) as HTMLSelectElement | null;
  const hidden = document.getElementById(
    "contact-package-hidden",
  ) as HTMLInputElement | null;
  const banner = document.getElementById("contact-package-banner");
  const labelEl = document.getElementById("contact-package-label");

  select?.addEventListener("change", () => {
    const v = select.value;
    if (hidden) hidden.value = v && labels[v] ? labels[v] : "";
    if (banner && labelEl) {
      if (v && labels[v]) {
        labelEl.textContent = labels[v];
        banner.hidden = false;
      } else {
        banner.hidden = true;
      }
    }
  });

  const status = document.getElementById("contact-status");
  const submitLabel = document.getElementById("contact-submit-label");

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!form.reportValidity()) return;

    const setStatus = (msg: string, ok: boolean) => {
      if (status) {
        status.textContent = msg;
        status.className = `text-sm font-bold ${ok ? "text-accent-text" : "text-red"}`;
      }
    };

    if (submitLabel) submitLabel.textContent = "Sending…";
    try {
      const res = await fetch("https://api.web3forms.com/submit", {
        method: "POST",
        headers: { Accept: "application/json" },
        body: new FormData(form),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success) {
        form.reset();
        if (banner) banner.hidden = true;
        setStatus("Sent — I'll reply within 24h.", true);
        if (submitLabel) submitLabel.textContent = "Sent ✓";
      } else {
        setStatus(
          "Couldn't send — email me directly at " + "me@ansezz.com.",
          false,
        );
        if (submitLabel) submitLabel.textContent = "Send message";
      }
    } catch {
      setStatus("Network error — email me directly at me@ansezz.com.", false);
      if (submitLabel) submitLabel.textContent = "Send message";
    }
  });
}

init();
document.addEventListener("astro:after-swap", init);

export {};
