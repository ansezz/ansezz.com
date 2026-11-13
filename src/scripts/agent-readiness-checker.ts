// Renders a scan from /api/agent-readiness. The report is not stored.
// A share link is the same page with ?url= and ?type=, which runs the scan again.

interface Evidence {
  method: string;
  url: string;
  status: number | null;
  contentType: string | null;
  snippet: string;
}

interface Fix {
  manual: string;
  snippet: string;
  prompt: string;
}

interface Check {
  id: string;
  title: string;
  impact: "high" | "medium" | "low";
  stability: "stable" | "emerging" | "experimental";
  specUrl: string | null;
  specLabel: string | null;
  scored: boolean;
  status: "pass" | "warn" | "fail" | "skip" | "could-not-verify";
  summary: string;
  detail: string;
  evidence: Evidence[];
  fix: Fix | null;
  doNot: string | null;
  recoverable: number;
}

interface Subscore {
  score: number;
}

interface Report {
  inputUrl: string;
  finalUrl: string;
  siteType: string;
  siteTypeLabel: string;
  elapsedMs: number;
  fetches: number;
  score: number;
  band: string;
  bandLabel: string;
  verdict: string;
  counts: {
    passed: number;
    warned: number;
    failed: number;
    applicable: number;
  };
  subscores: {
    access: Subscore | null;
    readable: Subscore | null;
    act: Subscore | null;
  };
  checks: Check[];
  curl: string;
  agentPrompt: string;
}

const STATUS_LABEL: Record<Check["status"], string> = {
  pass: "Pass",
  warn: "Warn",
  fail: "Fail",
  skip: "Skip",
  "could-not-verify": "Could not verify",
};

const STATUS_CLASS: Record<Check["status"], string> = {
  pass: "bg-green text-on-accent",
  warn: "bg-yellow text-on-accent",
  fail: "bg-red text-on-accent",
  skip: "bg-paper text-ink",
  "could-not-verify": "bg-cyan text-on-accent",
};

const BAND_CLASS: Record<string, string> = {
  excellent: "bg-green text-on-accent",
  good: "bg-cyan text-on-accent",
  "needs-work": "bg-yellow text-on-accent",
  blocked: "bg-red text-on-accent",
};

const ORDER: Record<Check["status"], number> = {
  fail: 0,
  warn: 1,
  "could-not-verify": 2,
  skip: 3,
  pass: 4,
};

function init(): void {
  const root = document.getElementById("arc-root");
  const form = document.getElementById("arc-form");
  if (!(root instanceof HTMLElement) || !(form instanceof HTMLFormElement))
    return;
  if (root.dataset.bound === "1") return;
  root.dataset.bound = "1";

  const urlInput = document.getElementById("arc-url");
  const status = document.getElementById("arc-status");
  const error = document.getElementById("arc-error");
  const results = document.getElementById("arc-results");
  const submit = document.getElementById("arc-submit");
  if (
    !(urlInput instanceof HTMLInputElement) ||
    !(status instanceof HTMLElement) ||
    !(error instanceof HTMLElement) ||
    !(results instanceof HTMLElement) ||
    !(submit instanceof HTMLButtonElement)
  ) {
    return;
  }

  let running = false;

  const showError = (message: string) => {
    error.textContent = message;
    error.classList.remove("hidden");
    results.hidden = true;
    results.replaceChildren();
  };

  const clearError = () => {
    error.textContent = "";
    error.classList.add("hidden");
  };

  const selectedType = (): string => {
    const picked = form.querySelector<HTMLInputElement>(
      'input[name="type"]:checked',
    );
    return picked?.value || "content";
  };

  const writeShare = (target: string, siteType: string) => {
    const next = new URL(window.location.pathname, window.location.origin);
    next.searchParams.set("url", target);
    next.searchParams.set("type", siteType);
    try {
      window.history.replaceState(window.history.state, "", next);
    } catch {
      // The scan result is still on the page if history is blocked.
    }
    return next.href;
  };

  const run = async (target: string, siteType: string) => {
    if (running) return;
    running = true;
    clearError();
    submit.disabled = true;
    status.textContent = "Scanning. This usually takes a few seconds.";
    try {
      const response = await fetch("/api/agent-readiness", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          accept: "application/json",
        },
        body: JSON.stringify({ url: target, siteType }),
      });
      const payload = (await response.json()) as Report & {
        error?: string;
        retryAfter?: number;
      };
      if (!response.ok || payload.error || !Array.isArray(payload.checks)) {
        const wait =
          payload.retryAfter != null
            ? ` Try again in ${payload.retryAfter} seconds.`
            : "";
        showError((payload.error || "The scan did not finish.") + wait);
        status.textContent = "";
        return;
      }
      const share = writeShare(target, siteType);
      render(results, payload, share);
      results.hidden = false;
      status.textContent = "";
      results.scrollIntoView({ behavior: "smooth", block: "start" });
    } catch {
      showError(
        "The scan could not be reached. Check the connection and try again.",
      );
      status.textContent = "";
    } finally {
      running = false;
      submit.disabled = false;
    }
  };

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const target = urlInput.value.trim();
    if (!target) return;
    void run(target, selectedType());
  });

  const params = new URLSearchParams(window.location.search);
  const preset = params.get("url");
  const type = params.get("type");
  if (preset) urlInput.value = preset;
  if (
    type === "content" ||
    type === "saas" ||
    type === "store" ||
    type === "everything"
  ) {
    const radio = form.querySelectorAll<HTMLInputElement>('input[name="type"]');
    for (const item of radio) {
      if (item.value === type) item.checked = true;
    }
  }
  if (preset) void run(preset, selectedType());
}

function render(host: HTMLElement, report: Report, share: string): void {
  host.replaceChildren();
  const band = el(
    "p",
    `mono inline-flex rounded-full border-[3px] border-ink px-3 py-1 text-[11px] font-bold tracking-widest uppercase ${BAND_CLASS[report.band] ?? "bg-paper"}`,
    report.bandLabel,
  );
  const score = el("p", "display text-7xl leading-none", String(report.score));
  const counts = el(
    "p",
    "text-sm",
    `${report.counts.passed} passed, ${report.counts.warned} warned, ${report.counts.failed} failed, of ${report.counts.applicable} applicable checks.`,
  );
  const verdict = el(
    "p",
    "max-w-2xl text-base leading-snug font-bold",
    report.verdict,
  );
  const meta = el(
    "p",
    "mono text-[11px] font-bold tracking-widest uppercase",
    `${report.siteTypeLabel}. ${report.fetches} requests. ${(report.elapsedMs / 1000).toFixed(1)}s`,
  );
  const finalUrl = el(
    "p",
    "text-sm break-all",
    report.finalUrl === report.inputUrl
      ? `Scanned ${report.finalUrl}`
      : `Scanned ${report.finalUrl} (redirected from ${report.inputUrl})`,
  );

  const head = el(
    "div",
    "border-ink bg-paper shadow-neo-md space-y-3 rounded-[4px] border-[3px] p-5",
  );
  head.append(band, score, counts, verdict, meta, finalUrl, subscores(report));
  host.append(head);

  const actions = el("div", "mt-4 flex flex-wrap gap-2");
  actions.append(
    actionButton("Copy all fixes as an agent prompt", () =>
      copyText(report.agentPrompt),
    ),
    actionButton("Download JSON report", () => download(report), "Saved"),
    actionButton("Copy share link", () => copyText(share)),
  );
  host.append(actions);
  const actionNote = el(
    "p",
    "mt-2 text-xs opacity-80",
    "The share link reruns the scan. Nothing is saved on the server.",
  );
  host.append(actionNote);

  const curlWrap = el(
    "div",
    "border-ink bg-bg-alt mt-4 rounded-[4px] border-[3px] p-3",
  );
  curlWrap.append(
    el(
      "p",
      "mono mb-2 text-[10px] font-bold tracking-widest uppercase",
      "Repeat the Markdown check",
    ),
  );
  const curl = el(
    "pre",
    "overflow-auto font-mono text-xs break-all whitespace-pre-wrap",
    report.curl,
  );
  curlWrap.append(curl);
  host.append(curlWrap);

  const groups: [Check["impact"], string][] = [
    ["high", "High impact"],
    ["medium", "Medium impact"],
    ["low", "Low impact or optional"],
  ];
  for (const [impact, label] of groups) {
    const rows = report.checks
      .filter((check) => check.impact === impact)
      .sort((a, b) => ORDER[a.status] - ORDER[b.status]);
    if (rows.length === 0) continue;
    const section = el("section", "mt-10");
    section.append(el("h2", "display mb-4 text-2xl uppercase", label));
    const list = el("div", "space-y-4");
    for (const check of rows) list.append(checkCard(check));
    section.append(list);
    host.append(section);
  }
}

function subscores(report: Report): HTMLElement {
  const grid = el("div", "grid gap-3 sm:grid-cols-3");
  const cells: [string, Subscore | null][] = [
    ["Access", report.subscores.access],
    ["Readable", report.subscores.readable],
    ["Act", report.subscores.act],
  ];
  for (const [label, sub] of cells) {
    const card = el(
      "div",
      "border-ink bg-bg-alt min-w-0 rounded-[4px] border-[2px] p-3",
    );
    card.append(
      el("p", "mono text-[10px] font-bold tracking-widest uppercase", label),
    );
    card.append(
      el(
        "p",
        "heading text-2xl",
        sub ? String(sub.score) : "Not in this score",
      ),
    );
    grid.append(card);
  }
  return grid;
}

function checkCard(check: Check): HTMLElement {
  const card = el(
    "article",
    "border-ink bg-paper shadow-neo-sm space-y-3 rounded-[4px] border-[3px] p-4",
  );
  const row = el("div", "flex flex-wrap items-center gap-2");
  row.append(pill(STATUS_LABEL[check.status], STATUS_CLASS[check.status]));
  row.append(el("h3", "heading text-lg uppercase", check.title));
  row.append(pill(check.stability, "bg-bg-alt text-ink"));
  if (!check.scored) row.append(pill("Not scored", "bg-bg-alt text-ink"));
  if (check.specUrl && check.specLabel && safeHttp(check.specUrl)) {
    const link = document.createElement("a");
    link.href = check.specUrl;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.className = "text-sm font-bold underline";
    link.textContent = check.specLabel;
    row.append(link);
  }
  card.append(row);
  card.append(el("p", "text-sm leading-snug", check.summary));
  if (check.recoverable > 0) {
    card.append(
      el(
        "p",
        "mono text-[11px] font-bold tracking-widest uppercase",
        `About ${check.recoverable} points if this is fixed`,
      ),
    );
  }
  if (check.detail) {
    card.append(
      el(
        "pre",
        "overflow-auto font-mono text-xs whitespace-pre-wrap break-words",
        check.detail,
      ),
    );
  }
  if (check.doNot) card.append(el("p", "text-sm font-bold", check.doNot));
  for (const item of check.evidence) card.append(evidenceBlock(item));
  if (check.fix && (check.status === "fail" || check.status === "warn")) {
    const fix = el(
      "div",
      "border-ink bg-bg-alt space-y-2 rounded-[4px] border-[2px] p-3",
    );
    fix.append(el("p", "text-sm leading-snug", check.fix.manual));
    if (check.fix.snippet) {
      fix.append(
        el(
          "pre",
          "overflow-auto font-mono text-xs whitespace-pre-wrap break-words",
          check.fix.snippet,
        ),
      );
    }
    if (check.id === "llms-txt") {
      const link = document.createElement("a");
      link.href = "/tools/llms-txt-generator/";
      link.className = "inline-block text-sm font-bold underline";
      link.textContent = "Open the llms.txt generator";
      fix.append(link);
    }
    fix.append(
      actionButton("Copy fix prompt", () => copyText(check.fix?.prompt ?? "")),
    );
    card.append(fix);
  }
  return card;
}

function evidenceBlock(item: Evidence): HTMLElement {
  const box = el("div", "border-ink rounded-[4px] border-[2px] p-3");
  const head = `${item.method} ${item.url} | ${item.status ?? "no response"}${item.contentType ? ` | ${item.contentType}` : ""}`;
  box.append(el("p", "font-mono text-xs break-all", head));
  if (item.snippet) {
    box.append(
      el(
        "pre",
        "mt-2 overflow-auto font-mono text-xs whitespace-pre-wrap break-words",
        item.snippet,
      ),
    );
  }
  return box;
}

function actionButton(
  label: string,
  onClick: () => Promise<void> | void,
  done = "Copied",
): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className =
    "mono border-ink bg-bg-alt shadow-neo-xs hover:bg-yellow inline-flex min-h-10 items-center rounded-full border-[2px] px-4 text-[11px] font-bold tracking-widest uppercase";
  button.textContent = label;
  button.addEventListener("click", () => {
    void Promise.resolve(onClick()).then(
      () => flash(button, label, done),
      () => flash(button, label, "Copy failed"),
    );
  });
  return button;
}

function flash(button: HTMLButtonElement, label: string, next: string): void {
  button.textContent = next;
  window.setTimeout(() => {
    button.textContent = label;
  }, 1400);
}

async function copyText(value: string): Promise<void> {
  await navigator.clipboard.writeText(value);
}

function download(report: Report): void {
  const blob = new Blob([JSON.stringify(report, null, 2)], {
    type: "application/json",
  });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = "agent-readiness.json";
  link.click();
  URL.revokeObjectURL(link.href);
}

function pill(text: string, tone: string): HTMLElement {
  return el(
    "span",
    `mono border-ink inline-flex rounded-full border-[2px] px-2 py-0.5 text-[10px] font-bold tracking-widest uppercase ${tone}`,
    text,
  );
}

function el(tag: string, className: string, text?: string): HTMLElement {
  const node = document.createElement(tag);
  node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

function safeHttp(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

init();
document.addEventListener("astro:after-swap", init);
