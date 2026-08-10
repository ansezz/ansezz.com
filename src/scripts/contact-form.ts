// Progressive-enhancement submit for the Web3Forms contact form: posts via
// fetch and shows inline status. Falls back to a normal POST if JS fails.

function init(): void {
  const form = document.getElementById(
    "contact-form",
  ) as HTMLFormElement | null;
  if (!form || form.dataset.bound === "1") return;
  form.dataset.bound = "1";

  const status = document.getElementById("contact-status");
  const label = document.getElementById("contact-submit-label");

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!form.reportValidity()) return;

    const setStatus = (msg: string, ok: boolean) => {
      if (status) {
        status.textContent = msg;
        status.className = `text-sm font-bold ${ok ? "text-accent-text" : "text-red"}`;
      }
    };

    if (label) label.textContent = "Sending…";
    try {
      const res = await fetch("https://api.web3forms.com/submit", {
        method: "POST",
        headers: { Accept: "application/json" },
        body: new FormData(form),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success) {
        form.reset();
        setStatus("Sent — I'll reply within 24h.", true);
        if (label) label.textContent = "Sent ✓";
      } else {
        setStatus(
          "Couldn't send — email me directly at " + "me@ansezz.com.",
          false,
        );
        if (label) label.textContent = "Send message";
      }
    } catch {
      setStatus("Network error — email me directly at me@ansezz.com.", false);
      if (label) label.textContent = "Send message";
    }
  });
}

init();
document.addEventListener("astro:after-swap", init);

export {};
