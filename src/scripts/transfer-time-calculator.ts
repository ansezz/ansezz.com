// Transfer time = (size in bytes × 8) ÷ (link rate in bits/s × efficiency).
// Size units switch between decimal (10^3) and binary (2^10); link rates are
// always decimal because that is how network gear and ISPs quote them.

type SizeUnit = "KB" | "MB" | "GB" | "TB";
type SpeedUnit = "Kbps" | "Mbps" | "Gbps" | "MBps";

const DECIMAL_BYTES: Record<SizeUnit, number> = {
  KB: 1e3,
  MB: 1e6,
  GB: 1e9,
  TB: 1e12,
};

const BINARY_BYTES: Record<SizeUnit, number> = {
  KB: 1024,
  MB: 1024 ** 2,
  GB: 1024 ** 3,
  TB: 1024 ** 4,
};

// Bits per second for one unit of each link-rate option. MB/s is treated as
// 10^6 bytes/s (8 Mbps), matching how transfer tools report byte rates.
const SPEED_BITS: Record<SpeedUnit, number> = {
  Kbps: 1e3,
  Mbps: 1e6,
  Gbps: 1e9,
  MBps: 8e6,
};

function isSizeUnit(value: string): value is SizeUnit {
  return value === "KB" || value === "MB" || value === "GB" || value === "TB";
}

function isSpeedUnit(value: string): value is SpeedUnit {
  return (
    value === "Kbps" || value === "Mbps" || value === "Gbps" || value === "MBps"
  );
}

interface Inputs {
  size: number;
  sizeUnit: SizeUnit;
  binary: boolean;
  speed: number;
  speedUnit: SpeedUnit;
  efficiency: number;
}

interface Result {
  bytes: number;
  lineBps: number;
  effectiveBps: number;
  seconds: number;
  secondsAtLineRate: number;
}

type Outcome = { ok: true; value: Result } | { ok: false; message: string };

function readNumber(el: HTMLInputElement): number {
  const raw = el.value.trim();
  if (raw === "") return Number.NaN;
  const n = Number(raw);
  return Number.isFinite(n) ? n : Number.NaN;
}

function compute(input: Inputs): Outcome {
  if (Number.isNaN(input.size)) {
    return { ok: false, message: "Enter a size to move." };
  }
  if (input.size < 0) {
    return { ok: false, message: "Size can't be negative." };
  }
  if (Number.isNaN(input.speed)) {
    return { ok: false, message: "Enter a link speed." };
  }
  if (input.speed <= 0) {
    return {
      ok: false,
      message: "Link speed has to be above zero, or nothing ever arrives.",
    };
  }
  if (Number.isNaN(input.efficiency)) {
    return { ok: false, message: "Enter an efficiency between 1 and 100." };
  }
  if (input.efficiency <= 0 || input.efficiency > 100) {
    return { ok: false, message: "Efficiency has to be between 1% and 100%." };
  }

  const factor = input.binary ? BINARY_BYTES : DECIMAL_BYTES;
  const bytes = input.size * factor[input.sizeUnit];
  const lineBps = input.speed * SPEED_BITS[input.speedUnit];
  const effectiveBps = lineBps * (input.efficiency / 100);
  const bits = bytes * 8;

  if (!Number.isFinite(bytes) || !Number.isFinite(effectiveBps)) {
    return { ok: false, message: "Those numbers are too large to be useful." };
  }

  return {
    ok: true,
    value: {
      bytes,
      lineBps,
      effectiveBps,
      seconds: bits / effectiveBps,
      secondsAtLineRate: bits / lineBps,
    },
  };
}

// "2 d 3 h 14 m" — largest three non-zero units, seconds only when they matter.
function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "—";
  if (seconds === 0) return "0 s";
  if (seconds < 0.001) return "< 1 ms";
  if (seconds < 1) return `${Math.round(seconds * 1000)} ms`;

  const total = Math.round(seconds);
  const days = Math.floor(total / 86400);
  const hours = Math.floor((total % 86400) / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;

  const parts: string[] = [];
  if (days > 0) parts.push(`${days.toLocaleString("en-US")} d`);
  if (hours > 0) parts.push(`${hours} h`);
  if (minutes > 0) parts.push(`${minutes} m`);
  if (secs > 0) parts.push(`${secs} s`);
  return parts.slice(0, 3).join(" ");
}

// The same duration expressed in one unit, for quick comparison.
function formatSingleUnit(seconds: number): string {
  if (!Number.isFinite(seconds)) return "—";
  if (seconds === 0) return "instant";
  if (seconds < 0.001) return `${trimNumber(seconds * 1e6)} microseconds`;
  if (seconds < 1) return `${trimNumber(seconds * 1000)} milliseconds`;
  if (seconds < 90) return `${seconds.toFixed(1)} seconds`;
  if (seconds < 5400) return `${(seconds / 60).toFixed(1)} minutes`;
  if (seconds < 172800) return `${(seconds / 3600).toFixed(1)} hours`;
  if (seconds < 63072000) return `${(seconds / 86400).toFixed(1)} days`;
  return `${trimNumber(seconds / 31557600)} years`;
}

function trimNumber(n: number): string {
  const digits = n >= 100 ? 0 : n >= 10 ? 1 : 2;
  return n.toLocaleString("en-US", { maximumFractionDigits: digits });
}

function formatBitRate(bps: number): string {
  if (!Number.isFinite(bps)) return "—";
  if (bps >= 1e9) return `${trimNumber(bps / 1e9)} Gbps`;
  if (bps >= 1e6) return `${trimNumber(bps / 1e6)} Mbps`;
  if (bps >= 1e3) return `${trimNumber(bps / 1e3)} Kbps`;
  return `${trimNumber(bps)} bps`;
}

function formatByteRate(bps: number): string {
  const bytesPerSecond = bps / 8;
  if (!Number.isFinite(bytesPerSecond)) return "—";
  if (bytesPerSecond >= 1e9) return `${trimNumber(bytesPerSecond / 1e9)} GB/s`;
  if (bytesPerSecond >= 1e6) return `${trimNumber(bytesPerSecond / 1e6)} MB/s`;
  if (bytesPerSecond >= 1e3) return `${trimNumber(bytesPerSecond / 1e3)} kB/s`;
  return `${trimNumber(bytesPerSecond)} B/s`;
}

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes)) return "—";
  if (bytes >= 1e15) return `${bytes.toExponential(3)} bytes`;
  return `${Math.round(bytes).toLocaleString("en-US")} bytes`;
}

// Swaps KB/MB/GB/TB labels for KiB/MiB/GiB/TiB when the binary base is chosen.
function applyBaseLabels(select: HTMLSelectElement, binary: boolean): void {
  for (const option of Array.from(select.options)) {
    const label = binary ? option.dataset.iec : option.dataset.si;
    if (label) option.textContent = label;
  }
}

interface Controls {
  size: HTMLInputElement;
  sizeUnit: HTMLSelectElement;
  base: HTMLSelectElement;
  speed: HTMLInputElement;
  speedUnit: HTMLSelectElement;
  efficiency: HTMLInputElement;
}

// Returns the six form controls only if every one is present and the right
// kind of element, so callers never have to re-check for null.
function readControls(): Controls | null {
  const size = document.getElementById("transfer-time-calculator-size");
  const sizeUnit = document.getElementById(
    "transfer-time-calculator-size-unit",
  );
  const base = document.getElementById("transfer-time-calculator-base");
  const speed = document.getElementById("transfer-time-calculator-speed");
  const speedUnit = document.getElementById(
    "transfer-time-calculator-speed-unit",
  );
  const efficiency = document.getElementById(
    "transfer-time-calculator-efficiency",
  );

  if (
    !(size instanceof HTMLInputElement) ||
    !(sizeUnit instanceof HTMLSelectElement) ||
    !(base instanceof HTMLSelectElement) ||
    !(speed instanceof HTMLInputElement) ||
    !(speedUnit instanceof HTMLSelectElement) ||
    !(efficiency instanceof HTMLInputElement)
  ) {
    return null;
  }

  return { size, sizeUnit, base, speed, speedUnit, efficiency };
}

function init(): void {
  const root = document.getElementById("transfer-time-calculator-root");
  if (!root || root.dataset.bound === "1") return;

  const controls = readControls();
  if (!controls) return;
  const { size, sizeUnit, base, speed, speedUnit, efficiency } = controls;

  root.dataset.bound = "1";

  const resultsEl = document.getElementById("transfer-time-calculator-results");
  const errorEl = document.getElementById("transfer-time-calculator-error");
  const errorTextEl = document.getElementById(
    "transfer-time-calculator-error-text",
  );
  const timeEl = document.getElementById("transfer-time-calculator-time");
  const scaleEl = document.getElementById("transfer-time-calculator-scale");
  const lineTimeEl = document.getElementById(
    "transfer-time-calculator-line-time",
  );
  const throughputEl = document.getElementById(
    "transfer-time-calculator-throughput",
  );
  const payloadEl = document.getElementById("transfer-time-calculator-payload");
  const copyBtn = document.getElementById("transfer-time-calculator-copy");
  const copyLabel = document.getElementById(
    "transfer-time-calculator-copy-label",
  );

  let summary = "";
  let copyResetTimer = 0;

  const setText = (el: HTMLElement | null, value: string): void => {
    if (el) el.textContent = value;
  };

  function readInputs(): Inputs {
    const rawSizeUnit = sizeUnit.value;
    const rawSpeedUnit = speedUnit.value;
    return {
      size: readNumber(size),
      sizeUnit: isSizeUnit(rawSizeUnit) ? rawSizeUnit : "GB",
      binary: base.value === "binary",
      speed: readNumber(speed),
      speedUnit: isSpeedUnit(rawSpeedUnit) ? rawSpeedUnit : "Mbps",
      efficiency: readNumber(efficiency),
    };
  }

  function render(): void {
    const inputs = readInputs();
    applyBaseLabels(sizeUnit, inputs.binary);
    const outcome = compute(inputs);

    if (!outcome.ok) {
      summary = "";
      if (resultsEl) resultsEl.hidden = true;
      if (errorEl) errorEl.hidden = false;
      setText(errorTextEl, outcome.message);
      if (copyBtn instanceof HTMLButtonElement) copyBtn.disabled = true;
      return;
    }

    if (errorEl) errorEl.hidden = true;
    if (resultsEl) resultsEl.hidden = false;
    if (copyBtn instanceof HTMLButtonElement) copyBtn.disabled = false;

    const r = outcome.value;
    const unitLabel =
      sizeUnit.options[sizeUnit.selectedIndex]?.textContent?.trim() ??
      inputs.sizeUnit;

    setText(timeEl, formatDuration(r.seconds));
    setText(scaleEl, formatSingleUnit(r.seconds));
    setText(lineTimeEl, formatDuration(r.secondsAtLineRate));
    setText(
      throughputEl,
      `${formatBitRate(r.effectiveBps)} · ${formatByteRate(r.effectiveBps)}`,
    );
    setText(payloadEl, formatBytes(r.bytes));

    summary =
      `${trimNumber(inputs.size)} ${unitLabel} (${formatBytes(r.bytes)}) ` +
      `over ${formatBitRate(r.lineBps)} at ${trimNumber(inputs.efficiency)}% efficiency ` +
      `= ${formatDuration(r.seconds)} (${formatSingleUnit(r.seconds)}). ` +
      `Effective throughput ${formatBitRate(r.effectiveBps)} / ${formatByteRate(r.effectiveBps)}.`;
  }

  for (const el of [size, sizeUnit, base, speed, speedUnit, efficiency]) {
    el.addEventListener("input", render);
    el.addEventListener("change", render);
  }

  root
    .querySelectorAll<HTMLButtonElement>("[data-preset-speed]")
    .forEach((btn) => {
      btn.addEventListener("click", () => {
        const { presetSpeed, presetUnit, presetEff } = btn.dataset;
        if (presetSpeed) speed.value = presetSpeed;
        if (presetUnit && isSpeedUnit(presetUnit)) speedUnit.value = presetUnit;
        if (presetEff) efficiency.value = presetEff;
        render();
      });
    });

  function flashCopyLabel(text: string): void {
    const label = copyLabel;
    if (!label) return;
    label.textContent = text;
    window.clearTimeout(copyResetTimer);
    copyResetTimer = window.setTimeout(() => {
      label.textContent = "Copy result";
    }, 1500);
  }

  copyBtn?.addEventListener("click", async () => {
    if (!summary) return;
    try {
      await navigator.clipboard.writeText(summary);
      flashCopyLabel("Copied!");
    } catch {
      flashCopyLabel("Copy blocked");
    }
  });

  render();
}

init();
document.addEventListener("astro:after-swap", init);

export {};
