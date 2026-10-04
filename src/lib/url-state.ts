// Keeps a tool's form fields in the query string so the address bar is
// always a shareable link to the current result. Values only change the URL
// with history.replaceState, so nothing is sent anywhere.

type Field = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;

const SKIP_TYPES = new Set(["password", "file", "hidden", "button", "submit"]);
const MAX_VALUE = 2000;

interface Options {
  /** Field ids that must never be written to the URL. */
  exclude?: string[];
}

function defaultOf(el: Field): string {
  if (el instanceof HTMLSelectElement) {
    const opt = Array.from(el.options).find((o) => o.defaultSelected);
    return opt?.value ?? el.options[0]?.value ?? "";
  }
  return el.defaultValue;
}

export function bindUrlState(rootId: string, opts: Options = {}): void {
  const prefix = rootId.replace(/root$/, "");

  const run = (): void => {
    const root = document.getElementById(rootId);
    if (!root || root.dataset.urlBound === "1") return;
    root.dataset.urlBound = "1";

    const fields = Array.from(
      root.querySelectorAll<Field>("input[id], textarea[id], select[id]"),
    ).filter(
      (el) =>
        !(el instanceof HTMLInputElement && SKIP_TYPES.has(el.type)) &&
        !opts.exclude?.includes(el.id),
    );

    const keyOf = (el: Field): string => {
      if (el instanceof HTMLInputElement && el.type === "radio" && el.name) {
        return el.name.startsWith(prefix)
          ? el.name.slice(prefix.length)
          : el.name;
      }
      return el.id.startsWith(prefix) ? el.id.slice(prefix.length) : el.id;
    };

    // Apply values from the URL, then fire the events the tool listens to.
    const params = new URLSearchParams(window.location.search);
    const touched: Field[] = [];
    for (const el of fields) {
      const k = keyOf(el);
      if (!params.has(k)) continue;
      const v = params.get(k) ?? "";
      if (el instanceof HTMLInputElement && el.type === "radio") {
        if (el.value !== v) continue;
        el.checked = true;
      } else if (el instanceof HTMLInputElement && el.type === "checkbox") {
        el.checked = v === "1";
      } else {
        el.value = v;
      }
      touched.push(el);
    }
    for (const el of touched) {
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
    }

    let timer = 0;
    const write = (): void => {
      const url = new URL(window.location.href);
      for (const el of fields) {
        const k = keyOf(el);
        if (el instanceof HTMLInputElement && el.type === "radio") {
          if (el.checked && !el.defaultChecked)
            url.searchParams.set(k, el.value);
          else if (el.checked) url.searchParams.delete(k);
          continue;
        }
        if (el instanceof HTMLInputElement && el.type === "checkbox") {
          if (el.checked !== el.defaultChecked)
            url.searchParams.set(k, el.checked ? "1" : "0");
          else url.searchParams.delete(k);
          continue;
        }
        const v = el.value;
        if (v !== defaultOf(el) && v.length <= MAX_VALUE)
          url.searchParams.set(k, v);
        else url.searchParams.delete(k);
      }
      window.history.replaceState(window.history.state, "", url);
    };
    const schedule = (): void => {
      window.clearTimeout(timer);
      timer = window.setTimeout(write, 250);
    };
    root.addEventListener("input", schedule);
    root.addEventListener("change", schedule);
    root.addEventListener("click", (e) => {
      // Preset buttons set values without input events; catch them too.
      if ((e.target as HTMLElement | null)?.closest("button")) schedule();
    });

    const shareBtn = root.querySelector<HTMLButtonElement>("[data-share-link]");
    const shareStatus = root.querySelector<HTMLElement>("[data-share-status]");
    shareBtn?.addEventListener("click", async () => {
      window.clearTimeout(timer);
      write();
      try {
        await navigator.clipboard.writeText(window.location.href);
        if (shareStatus) shareStatus.textContent = "Link copied";
      } catch {
        if (shareStatus) shareStatus.textContent = "Link is in the address bar";
      }
    });
  };

  run();
  document.addEventListener("astro:after-swap", run);
}
