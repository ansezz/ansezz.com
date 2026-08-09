// Dark-mode toggle. The pre-paint init lives inline in BaseLayout;
// this only handles clicks + keeping the button icon in sync.
// Document-level delegation survives Astro view transitions.

type Theme = "light" | "dark";

function current(): Theme {
  return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
}

function syncIcons(): void {
  const dark = current() === "dark";
  document.querySelectorAll<HTMLElement>(".theme-icon-sun").forEach((el) => {
    el.classList.toggle("hidden", !dark);
  });
  document.querySelectorAll<HTMLElement>(".theme-icon-moon").forEach((el) => {
    el.classList.toggle("hidden", dark);
  });
}

function setTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme;
  try {
    localStorage.setItem("theme", theme);
  } catch {}
  syncIcons();
}

document.addEventListener("click", (event) => {
  const target = event.target;
  if (!(target instanceof Element)) return;
  if (!target.closest("[data-theme-toggle]")) return;
  setTheme(current() === "dark" ? "light" : "dark");
});

document.addEventListener("astro:after-swap", syncIcons);
syncIcons();

export {};
