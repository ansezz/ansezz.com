// Shopify API version calendar. Dates come from @/lib/shopify-api-versions;
// this file redraws the table from the visitor's clock and runs the checker.

import { bindUrlState } from "@/lib/url-state";
import {
  STATUS_LABEL,
  calendar,
  checkVersion,
  formatUtc,
  latestStable,
  parseVersion,
  shiftQuarters,
  type VersionStatus,
} from "@/lib/shopify-api-versions";

const P = "shopify-api-versions-";

const STATUS_CLASS: Record<VersionStatus, string> = {
  "release-candidate": "bg-cyan text-on-accent",
  latest: "bg-green text-on-accent",
  supported: "bg-paper text-ink",
  unsupported: "bg-yellow text-on-accent",
  retired: "bg-pink text-on-accent",
  future: "bg-paper text-ink",
};
const BADGE =
  "border-ink inline-block rounded-[4px] border-[2px] px-2 py-0.5 text-xs font-bold";
const BTN =
  "mono border-ink bg-bg-alt shadow-neo-xs hover:bg-yellow inline-flex min-h-10 items-center rounded-full border-[2px] px-3 text-[11px] font-bold tracking-widest uppercase";

const local = (d: Date): string =>
  d.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "short",
  });

function init(): void {
  const root = document.getElementById(`${P}root`);
  if (!root || root.dataset.bound === "1") return;
  root.dataset.bound = "1";

  const $ = <T extends HTMLElement>(id: string): T =>
    document.getElementById(P + id) as T;
  const version = $<HTMLInputElement>("version");
  const asof = $<HTMLInputElement>("asof");

  const when = (): Date => {
    if (!asof.value) return new Date();
    const d = new Date(`${asof.value}T12:00:00Z`);
    return Number.isNaN(d.getTime()) ? new Date() : d;
  };

  function renderTable(now: Date): void {
    $<HTMLElement>("today").textContent = `As of ${formatUtc(now, true)}`;
    const tbody = $<HTMLElement>("rows");
    tbody.replaceChildren(
      ...calendar(now, 6).map((r) => {
        const tr = document.createElement("tr");
        tr.className = "border-ink border-b-[2px] align-middle";
        const td = (text: string, cls = "py-2 pr-2 font-mono") => {
          const el = document.createElement("td");
          el.className = cls;
          el.textContent = text;
          return el;
        };
        const status = document.createElement("td");
        status.className = "py-2 pr-2";
        const badge = document.createElement("span");
        badge.className = `${BADGE} ${STATUS_CLASS[r.status]}`;
        badge.textContent = STATUS_LABEL[r.status];
        status.append(badge);
        const act = document.createElement("td");
        act.className = "py-2";
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = BTN;
        btn.dataset.pick = r.name;
        btn.textContent = "Check";
        act.append(btn);
        tr.append(
          td(r.name, "py-2 pr-2 font-mono font-bold"),
          status,
          td(formatUtc(r.releasedAt)),
          td(formatUtc(r.supportEndsAt)),
          td(formatUtc(r.accessibleUntil)),
          act,
        );
        return tr;
      }),
    );
  }

  function renderCheck(now: Date): void {
    const fallback = shiftQuarters(latestStable(now), -3).name;
    version.placeholder = fallback;
    const raw = version.value.trim() || fallback;
    const v = parseVersion(raw);
    const left = $<HTMLElement>("left");
    const status = $<HTMLElement>("status");
    const verdict = $<HTMLElement>("verdict");
    const dates = $<HTMLElement>("dates");
    if (!v) {
      left.textContent = "?";
      status.className = `${BADGE} bg-paper text-ink`;
      status.textContent = "Not a version";
      verdict.textContent =
        "Shopify versions look like 2026-07: a year and a quarter month (01, 04, 07 or 10).";
      dates.replaceChildren();
      return;
    }
    const c = checkVersion(v, now);
    left.textContent =
      c.status === "future" || c.status === "release-candidate"
        ? "Not out yet"
        : c.supportLeft;
    status.className = `${BADGE} ${STATUS_CLASS[c.status]}`;
    status.textContent = STATUS_LABEL[c.status];
    verdict.textContent = c.verdict;
    const items: [string, Date][] = [
      ["Released", v.releasedAt],
      ["Support ends", v.supportEndsAt],
      ["Answers until", v.accessibleUntil],
    ];
    dates.replaceChildren(
      ...items.map(([k, d]) => {
        const div = document.createElement("div");
        const dt = document.createElement("dt");
        dt.className = "font-bold";
        dt.textContent = k;
        const dd = document.createElement("dd");
        dd.className = "font-mono text-xs break-words";
        dd.textContent = `${formatUtc(d, true)} · ${local(d)}`;
        div.append(dt, dd);
        return div;
      }),
    );
  }

  function render(): void {
    const now = when();
    renderTable(now);
    renderCheck(now);
  }

  root.addEventListener("input", render);
  root.addEventListener("change", render);
  root.addEventListener("click", (e) => {
    const btn = (e.target as HTMLElement | null)?.closest<HTMLButtonElement>(
      "[data-pick]",
    );
    if (!btn?.dataset.pick) return;
    version.value = btn.dataset.pick;
    version.dispatchEvent(new Event("input", { bubbles: true }));
    version.focus({ preventScroll: true });
  });

  render();
}

init();
document.addEventListener("astro:after-swap", init);
// Only the version goes into the share link; the date is always "today".
bindUrlState("shopify-api-versions-root", { exclude: [`${P}asof`] });
