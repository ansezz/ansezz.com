// Copy-link button inside every ShareBar. Document-level delegation so a
// single listener survives Astro view-transition swaps and covers every
// ShareBar on the page. Post pages keep one bar, at the end of the article.

const RESET_MS = 1400;

document.addEventListener("click", async (event) => {
  const target = event.target;
  if (!(target instanceof Element)) return;
  const btn = target.closest<HTMLButtonElement>("[data-copy-link]");
  if (!btn) return;

  const bar = btn.closest<HTMLElement>("[data-share-bar]");
  const url = bar?.dataset.shareUrl ?? window.location.href;
  const status = btn.querySelector<HTMLElement>("[data-copy-status]");

  try {
    await navigator.clipboard.writeText(url);
    btn.classList.add("!bg-green");
    if (status) status.textContent = btn.dataset.copiedLabel ?? "Copied!";
  } catch {
    if (status) status.textContent = "Copy failed — press ⌘C";
    return;
  }

  window.setTimeout(() => {
    btn.classList.remove("!bg-green");
    if (status) status.textContent = btn.dataset.copyLabel ?? "Copy link";
  }, RESET_MS);
});

export {};
