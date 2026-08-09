// Reading progress bar. The scroll/resize listeners live on window and are
// registered once; the element lookup is redone on every frame-worth of
// scroll so a view-transition swap (new bar, new article) is picked up
// without leaking listeners.

function update(): void {
  const bar = document.getElementById("reading-progress-bar");
  if (!bar) return;

  const article =
    document.querySelector<HTMLElement>("article.prose") ?? document.body;
  const rect = article.getBoundingClientRect();
  const start = rect.top + window.scrollY;
  const total = rect.height - window.innerHeight;
  const current = window.scrollY - start;
  const pct = Math.min(100, Math.max(0, (current / Math.max(1, total)) * 100));

  bar.style.width = `${pct}%`;
}

document.addEventListener("scroll", update, { passive: true });
window.addEventListener("resize", update, { passive: true });
document.addEventListener("astro:after-swap", update);

update();

export {};
