// Prompt caching calculator. The maths lives in @/lib/prompt-caching; this
// file reads the form, renders the result and keeps the URL in sync.

import { bindUrlState } from "@/lib/url-state";
import { formatUsd, promptCacheCost } from "@/lib/prompt-caching";

const P = "prompt-caching-calculator-";

const num = (el: HTMLInputElement): number => {
  const v = Number(el.value);
  return el.value.trim() === "" || !Number.isFinite(v) ? 0 : Math.max(0, v);
};

const pct = (share: number): string =>
  `${(share * 100).toLocaleString("en-US", { maximumFractionDigits: 1 })}%`;

function init(): void {
  const root = document.getElementById(`${P}root`);
  if (!root || root.dataset.bound === "1") return;
  root.dataset.bound = "1";

  const $ = <T extends HTMLElement>(id: string): T =>
    document.getElementById(P + id) as T;

  const pin = $<HTMLInputElement>("pin");
  const pout = $<HTMLInputElement>("pout");
  const write = $<HTMLInputElement>("write");
  const read = $<HTMLInputElement>("read");
  const prefix = $<HTMLInputElement>("prefix");
  const uncached = $<HTMLInputElement>("uncached");
  const output = $<HTMLInputElement>("output");
  const reqs = $<HTMLInputElement>("reqs");
  const hit = $<HTMLInputElement>("hit");
  const inputs = [pin, pout, write, read, prefix, uncached, output, reqs, hit];

  const set = (id: string, text: string): void => {
    const el = $<HTMLElement>(id);
    if (el) el.textContent = text;
  };

  function render(): void {
    const r = promptCacheCost({
      priceIn: num(pin),
      priceOut: num(pout),
      writePremium: num(write) / 100,
      readDiscount: Math.min(100, num(read)) / 100,
      prefixTokens: num(prefix),
      uncachedTokens: num(uncached),
      outputTokens: num(output),
      requestsPerDay: num(reqs),
      hitRate: Math.min(100, num(hit)) / 100,
    });

    set("out-no", formatUsd(r.perMonthNoCache));
    set("out-yes", formatUsd(r.perMonthCache));
    const losing = r.savedPerMonth < 0;
    set("out-saved-label", losing ? "Extra cost" : "You save");
    set("out-saved", formatUsd(Math.abs(r.savedPerMonth)));
    set("req-no", formatUsd(r.perRequestNoCache));
    set("req-yes", formatUsd(r.perRequestCache));
    set("day", `${formatUsd(r.perDayNoCache)} / ${formatUsd(r.perDayCache)}`);
    set("be", r.breakEvenHitRate === null ? "Never" : pct(r.breakEvenHitRate));
    set("br-read", formatUsd(r.monthCache.reads));
    set("br-write", formatUsd(r.monthCache.writes));
    set("br-in", formatUsd(r.monthCache.uncached));
    set("br-out", formatUsd(r.monthCache.output));

    let verdict: string;
    if (r.perMonthNoCache === 0)
      verdict = "Enter prices and traffic to see a result.";
    else if (num(prefix) === 0)
      verdict = "No cached prefix, so caching changes nothing.";
    else if (losing)
      verdict = `Caching costs ${pct(-r.savedShare)} more at this hit rate. You need more than ${r.breakEvenHitRate === null ? "a read discount" : pct(r.breakEvenHitRate) + " hits"} to come out ahead.`;
    else verdict = `Caching cuts the bill by ${pct(r.savedShare)}.`;
    set("verdict", verdict);
  }

  for (const el of inputs) {
    el.addEventListener("input", render);
    el.addEventListener("change", render);
  }

  root
    .querySelectorAll<HTMLButtonElement>("[data-preset-pin]")
    .forEach((btn) => {
      btn.addEventListener("click", () => {
        const d = btn.dataset;
        if (d.presetPin) pin.value = d.presetPin;
        if (d.presetPout) pout.value = d.presetPout;
        if (d.presetWrite) write.value = d.presetWrite;
        if (d.presetRead) read.value = d.presetRead;
        render();
      });
    });

  render();
}

init();
document.addEventListener("astro:after-swap", init);
bindUrlState("prompt-caching-calculator-root");
