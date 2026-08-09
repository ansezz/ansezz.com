// Lane filter for /work/. Re-binds after Astro view-transition swaps —
// bundled module scripts are only executed once per session, so the
// initial run's listeners are lost the moment the DOM is replaced.

function init(): void {
  const root = document.querySelector<HTMLElement>("[data-work-root]");
  if (!root || root.dataset.bound === "1") return;
  root.dataset.bound = "1";

  const buttons =
    root.querySelectorAll<HTMLButtonElement>("[data-work-filter]");
  const sections = root.querySelectorAll<HTMLElement>("[data-work-section]");

  function setFilter(value: string): void {
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
  }

  buttons.forEach((btn) => {
    btn.addEventListener("click", () =>
      setFilter(btn.dataset.workFilter ?? "all"),
    );
  });
}

init();
document.addEventListener("astro:after-swap", init);

export {};
