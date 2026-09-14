// Lane filter for /work/. Re-binds after Astro view-transition swaps —
// bundled module scripts are only executed once per session, so the
// initial run's listeners are lost the moment the DOM is replaced.
//
// Deep-link: /work/?lane=saas|shopify|ai|architecture
// "architecture" has no lane section today — falls back to "all".

const LANE_KEYS = new Set(["all", "ai", "shopify", "saas"]);

function laneFromUrl(): string {
  try {
    const raw = new URLSearchParams(window.location.search).get("lane");
    if (!raw) return "all";
    const lane = raw.toLowerCase().trim();
    return LANE_KEYS.has(lane) ? lane : "all";
  } catch {
    return "all";
  }
}

function init(): void {
  const root = document.querySelector<HTMLElement>("[data-work-root]");
  if (!root || root.dataset.bound === "1") return;
  root.dataset.bound = "1";

  const buttons =
    root.querySelectorAll<HTMLButtonElement>("[data-work-filter]");
  const sections = root.querySelectorAll<HTMLElement>("[data-work-section]");

  function setFilter(value: string, pushUrl = false): void {
    buttons.forEach((btn) => {
      btn.setAttribute(
        "aria-pressed",
        btn.dataset.workFilter === value ? "true" : "false",
      );
    });
    sections.forEach((section) => {
      const slug = section.dataset.workSection;
      // "all" shows every section (featured marquee + each lane);
      // a specific lane shows only its matching section.
      section.hidden = value !== "all" && slug !== value;
    });

    if (pushUrl) {
      try {
        const url = new URL(window.location.href);
        if (value === "all") url.searchParams.delete("lane");
        else url.searchParams.set("lane", value);
        history.replaceState({}, "", url);
      } catch {
        /* ignore */
      }
    }
  }

  buttons.forEach((btn) => {
    btn.addEventListener("click", () =>
      setFilter(btn.dataset.workFilter ?? "all", true),
    );
  });

  // Apply ?lane= on load (and after view-transition re-init).
  setFilter(laneFromUrl(), false);
}

init();
document.addEventListener("astro:after-swap", init);

export {};
