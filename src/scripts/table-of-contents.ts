// Scroll-spy for the post table of contents. Re-runs after Astro
// view-transition swaps and tears down the previous IntersectionObserver
// so stale observers can't fight over the highlight.

const ACTIVE = ["bg-yellow", "text-ink"] as const;

let observer: IntersectionObserver | null = null;

function init(): void {
  observer?.disconnect();
  observer = null;

  const links = document.querySelectorAll<HTMLAnchorElement>("[data-toc-link]");
  if (links.length === 0 || !("IntersectionObserver" in window)) return;

  const map = new Map<string, HTMLAnchorElement>();
  links.forEach((link) => {
    const target = link.dataset.tocTarget;
    if (target) map.set(target, link);
  });

  observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const link = map.get(entry.target.id);
        if (!link) continue;
        links.forEach((l) => l.classList.remove(...ACTIVE));
        link.classList.add(...ACTIVE);
      }
    },
    { rootMargin: "-30% 0px -55% 0px" },
  );

  map.forEach((_, slug) => {
    const heading = document.getElementById(slug);
    if (heading) observer?.observe(heading);
  });
}

init();
document.addEventListener("astro:after-swap", init);

export {};
