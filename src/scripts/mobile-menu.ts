function getEls() {
  return {
    toggle: document.getElementById("mobile-menu-toggle"),
    menu: document.getElementById("mobile-menu"),
  };
}

function setOpen(open: boolean): void {
  const { toggle, menu } = getEls();
  if (!toggle || !menu) return;
  const iconOpen = toggle.querySelector(".menu-icon-open");
  const iconClose = toggle.querySelector(".menu-icon-close");
  toggle.setAttribute("aria-expanded", String(open));
  if (open) {
    menu.removeAttribute("hidden");
    iconOpen?.classList.add("hidden");
    iconClose?.classList.remove("hidden");
    document.body.style.overflow = "hidden";
  } else {
    menu.setAttribute("hidden", "");
    iconOpen?.classList.remove("hidden");
    iconClose?.classList.add("hidden");
    document.body.style.overflow = "";
  }
}

// Document-level delegated click — survives view transitions
document.addEventListener("click", (event) => {
  const target = event.target;
  if (!(target instanceof Element)) return;

  const toggleBtn = target.closest("#mobile-menu-toggle");
  if (toggleBtn) {
    const expanded = toggleBtn.getAttribute("aria-expanded") === "true";
    setOpen(!expanded);
    return;
  }

  // Close menu when a link inside it is clicked
  const menu = document.getElementById("mobile-menu");
  if (menu && !menu.hasAttribute("hidden")) {
    const link = target.closest("a");
    if (link && menu.contains(link)) {
      setOpen(false);
    }
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") setOpen(false);
});

// Close on resize to desktop
// Must match the header's lg: breakpoint, where the desktop nav takes over.
const mql = window.matchMedia("(min-width: 1024px)");
mql.addEventListener("change", (event) => {
  if (event.matches) setOpen(false);
});

// Reset body overflow after view-transition swap so stale state can't lock scroll
document.addEventListener("astro:after-swap", () => {
  document.body.style.overflow = "";
});
