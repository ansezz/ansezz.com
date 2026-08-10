// Cryptographically secure secret generator. Every value comes from
// crypto.getRandomValues — never Math.random. Bytes are mapped onto the
// alphabet with rejection sampling (discard everything at or above
// floor(256 / size) * size) so the character distribution stays exactly
// uniform; a plain `byte % size` would bias the low end of the alphabet.

const LOWER = "abcdefghijklmnopqrstuvwxyz";
const UPPER = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const DIGITS = "0123456789";
// Deliberately no " ' ` \ / or space. They add well under a bit per
// character and reliably break .env parsers, shell one-liners and YAML.
const SYMBOLS = "!#$%&()*+,-.:;<=>?@[]^_{|}~";
const HEX = "0123456789abcdef";
const BASE64URL = `${UPPER}${LOWER}${DIGITS}-_`;

// Exactly 128 words, so a passphrase carries exactly 7.0 bits per word.
// Short, common, unambiguous to type. This is not a Diceware list and the
// page says so — 7 bits/word is a quarter of what EFF's 7,776-word list gives.
const WORDS: readonly string[] = [
  "amber",
  "anchor",
  "apple",
  "arrow",
  "autumn",
  "bacon",
  "badge",
  "banjo",
  "basil",
  "beacon",
  "bison",
  "blaze",
  "bloom",
  "bridge",
  "bronze",
  "butter",
  "cactus",
  "candle",
  "canyon",
  "cargo",
  "carrot",
  "cedar",
  "cherry",
  "cinder",
  "cobalt",
  "comet",
  "copper",
  "coral",
  "cotton",
  "crater",
  "crimson",
  "crystal",
  "cypress",
  "daisy",
  "dapper",
  "delta",
  "denim",
  "desert",
  "diamond",
  "dolphin",
  "domino",
  "dune",
  "ember",
  "emerald",
  "falcon",
  "fern",
  "fiber",
  "fjord",
  "flint",
  "forest",
  "fossil",
  "frost",
  "garden",
  "ginger",
  "glacier",
  "granite",
  "gravel",
  "harbor",
  "harvest",
  "hazel",
  "hollow",
  "indigo",
  "ivory",
  "jade",
  "jasper",
  "jungle",
  "juniper",
  "kettle",
  "lagoon",
  "lantern",
  "lattice",
  "lemon",
  "lichen",
  "lilac",
  "linen",
  "lotus",
  "lumber",
  "magnet",
  "mango",
  "maple",
  "marble",
  "meadow",
  "mesa",
  "meteor",
  "mint",
  "mirror",
  "monsoon",
  "moss",
  "nectar",
  "nickel",
  "noble",
  "nomad",
  "oasis",
  "olive",
  "onyx",
  "opal",
  "orbit",
  "orchid",
  "otter",
  "oxide",
  "pebble",
  "pepper",
  "pewter",
  "pine",
  "pilot",
  "plum",
  "pollen",
  "prairie",
  "quartz",
  "quiver",
  "radish",
  "raven",
  "ribbon",
  "river",
  "rocket",
  "rustic",
  "saffron",
  "sage",
  "salmon",
  "sandal",
  "sapphire",
  "savanna",
  "sequoia",
  "shadow",
  "silver",
  "socket",
  "spruce",
  "summit",
];

const TOGGLE_KEYS = ["lower", "upper", "digits", "symbols"] as const;
type ToggleKey = (typeof TOGGLE_KEYS)[number];

const CHARSETS: Record<ToggleKey, string> = {
  lower: LOWER,
  upper: UPPER,
  digits: DIGITS,
  symbols: SYMBOLS,
};

type Mode = "custom" | "hex" | "base64url" | "passphrase";

interface Preset {
  mode: Mode;
  length?: number;
  words?: number;
  toggles?: Record<ToggleKey, boolean>;
}

const PRESETS: Record<string, Preset> = {
  custom: { mode: "custom" },
  hex: { mode: "hex", length: 32 },
  base64url: { mode: "base64url", length: 32 },
  alphanumeric: {
    mode: "custom",
    length: 32,
    toggles: { lower: true, upper: true, digits: true, symbols: false },
  },
  appsecret: { mode: "hex", length: 64 },
  passphrase: { mode: "passphrase", words: 8 },
};

interface Strength {
  label: string;
  cls: string;
}

const WEAK = "font-bold text-accent-text";
const OK = "font-bold";

function strengthFor(bits: number): Strength {
  if (bits >= 128) return { label: "128-bit class — done", cls: OK };
  if (bits >= 112) return { label: "Very strong", cls: OK };
  if (bits >= 80) return { label: "Strong", cls: OK };
  if (bits >= 64) return { label: "OK for short-lived tokens", cls: OK };
  if (bits >= 48) return { label: "Weak for anything long-lived", cls: WEAK };
  return { label: "Too weak — add length", cls: WEAK };
}

/** Buffered source of uniformly random bytes from the platform CSPRNG. */
function createByteSource(): () => number {
  const buf = new Uint8Array(512);
  let idx = buf.length;
  return function nextByte(): number {
    if (idx >= buf.length) {
      crypto.getRandomValues(buf);
      idx = 0;
    }
    const byte = buf[idx];
    idx += 1;
    return typeof byte === "number" ? byte : 0;
  };
}

/**
 * Unbiased index in [0, size) via rejection sampling. Bytes landing in the
 * ragged tail above floor(256 / size) * size are thrown away and redrawn,
 * which is what keeps `% size` from favouring the start of the alphabet.
 */
function randomIndex(size: number, nextByte: () => number): number {
  if (size <= 1 || size > 256) return 0;
  const limit = Math.floor(256 / size) * size;
  // Terminates with probability 1. Worst case across the alphabets offered
  // here is the 89-symbol set (78/256 rejected, ~1.44 draws per character);
  // hex, base64url and the 128-word list divide 256 and never reject.
  for (;;) {
    const byte = nextByte();
    if (byte < limit) return byte % size;
  }
}

function randomChars(
  length: number,
  alphabet: string,
  nextByte: () => number,
): string {
  const size = alphabet.length;
  let out = "";
  for (let i = 0; i < length; i += 1) {
    out += alphabet.charAt(randomIndex(size, nextByte));
  }
  return out;
}

function randomPassphrase(words: number, nextByte: () => number): string {
  const parts: string[] = [];
  for (let i = 0; i < words; i += 1) {
    // With replacement — that is what makes the entropy exactly words × 7.
    parts.push(WORDS[randomIndex(WORDS.length, nextByte)] ?? "");
  }
  return parts.join("-");
}

function entropyBits(length: number, size: number): number {
  if (length <= 0 || size <= 1) return 0;
  return length * Math.log2(size);
}

function clampInt(
  raw: string,
  min: number,
  max: number,
  fallback: number,
): number {
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function setText(id: string, value: string): void {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

function init(): void {
  const root = document.getElementById("secret-root");
  if (!root || root.dataset.bound === "1") return;
  root.dataset.bound = "1";

  const outputRaw = document.getElementById("secret-output");
  const lengthRaw = document.getElementById("secret-length");
  const wordsRaw = document.getElementById("secret-words");
  const countRaw = document.getElementById("secret-count");
  const charsetRaw = document.getElementById("secret-charset-set");
  const stringControlsRaw = document.getElementById("secret-string-controls");
  const passphraseControlsRaw = document.getElementById(
    "secret-passphrase-controls",
  );
  const errorRaw = document.getElementById("secret-error");
  const strengthRaw = document.getElementById("secret-strength");

  if (
    !(outputRaw instanceof HTMLTextAreaElement) ||
    !(lengthRaw instanceof HTMLInputElement) ||
    !(wordsRaw instanceof HTMLInputElement) ||
    !(countRaw instanceof HTMLInputElement) ||
    !(charsetRaw instanceof HTMLFieldSetElement) ||
    !(stringControlsRaw instanceof HTMLElement) ||
    !(passphraseControlsRaw instanceof HTMLElement) ||
    !(errorRaw instanceof HTMLElement) ||
    !(strengthRaw instanceof HTMLElement)
  ) {
    return;
  }

  // Re-bind with explicit types: control-flow narrowing above does not reach
  // into the hoisted function declarations below.
  const output: HTMLTextAreaElement = outputRaw;
  const lengthInput: HTMLInputElement = lengthRaw;
  const wordsInput: HTMLInputElement = wordsRaw;
  const countInput: HTMLInputElement = countRaw;
  const charsetSet: HTMLFieldSetElement = charsetRaw;
  const stringControls: HTMLElement = stringControlsRaw;
  const passphraseControls: HTMLElement = passphraseControlsRaw;
  const errorEl: HTMLElement = errorRaw;
  const strengthEl: HTMLElement = strengthRaw;

  const toggles = new Map<ToggleKey, HTMLInputElement>();
  for (const key of TOGGLE_KEYS) {
    const el = document.getElementById(`secret-${key}`);
    if (!(el instanceof HTMLInputElement)) return;
    toggles.set(key, el);
  }

  const presetButtons = Array.from(
    root.querySelectorAll<HTMLButtonElement>("[data-secret-preset]"),
  );

  let mode: Mode = "custom";
  let activePreset = "alphanumeric";

  function customAlphabet(): string {
    let out = "";
    for (const key of TOGGLE_KEYS) {
      if (toggles.get(key)?.checked) out += CHARSETS[key];
    }
    return out;
  }

  function setError(message: string | null): void {
    errorEl.hidden = message === null;
    errorEl.textContent = message ?? "";
  }

  function paintPresets(): void {
    for (const btn of presetButtons) {
      const on = btn.dataset.secretPreset === activePreset;
      btn.setAttribute("aria-pressed", on ? "true" : "false");
      btn.classList.toggle("bg-yellow", on);
      btn.classList.toggle("bg-bg-alt", !on);
      btn.classList.toggle("shadow-neo-sm", on);
      btn.classList.toggle("shadow-neo-xs", !on);
    }
  }

  function paintMode(): void {
    const fixedAlphabet = mode === "hex" || mode === "base64url";
    stringControls.hidden = mode === "passphrase";
    passphraseControls.hidden = mode !== "passphrase";
    charsetSet.disabled = fixedAlphabet;
    charsetSet.classList.toggle("opacity-50", fixedAlphabet);
    setText(
      "secret-charset-note",
      fixedAlphabet
        ? "Locked by the preset — pick Custom to choose your own sets."
        : "Every set you enable widens the alphabet and adds entropy.",
    );
  }

  function showStats(bits: number, formula: string, alphabet: string): void {
    const rounded = Math.round(bits);
    setText("secret-entropy", String(rounded));
    setText("secret-formula", formula);
    setText("secret-alphabet", alphabet);
    const strength = strengthFor(bits);
    strengthEl.textContent = strength.label;
    strengthEl.className = strength.cls;
  }

  function render(): void {
    const count = clampInt(countInput.value, 1, 50, 5);
    countInput.value = String(count);
    output.rows = Math.min(14, Math.max(4, count));

    const nextByte = createByteSource();

    if (mode === "passphrase") {
      const words = clampInt(wordsInput.value, 3, 12, 8);
      wordsInput.value = String(words);
      setText("secret-words-out", String(words));
      setError(null);
      output.value = Array.from({ length: count }, () =>
        randomPassphrase(words, nextByte),
      ).join("\n");
      showStats(
        entropyBits(words, WORDS.length),
        `${words} words × log₂(${WORDS.length}) = ${Math.round(entropyBits(words, WORDS.length))} bits per passphrase`,
        `${WORDS.length}-word list · 7 bits per word · joined with dashes`,
      );
      return;
    }

    const length = clampInt(lengthInput.value, 8, 128, 32);
    lengthInput.value = String(length);
    setText("secret-length-out", String(length));

    const alphabet =
      mode === "hex"
        ? HEX
        : mode === "base64url"
          ? BASE64URL
          : customAlphabet();

    if (alphabet.length === 0) {
      setError(
        "Pick at least one character set — with none selected there is no alphabet to draw from.",
      );
      output.value = "";
      showStats(0, "—", "—");
      return;
    }

    setError(null);
    output.value = Array.from({ length: count }, () =>
      randomChars(length, alphabet, nextByte),
    ).join("\n");

    const bits = entropyBits(length, alphabet.length);
    showStats(
      bits,
      `${length} chars × log₂(${alphabet.length}) ≈ ${Math.round(bits)} bits per secret`,
      alphabet,
    );
  }

  function applyPreset(id: string): void {
    const preset = PRESETS[id];
    if (!preset) return;
    mode = preset.mode;
    activePreset = id;
    if (typeof preset.length === "number") {
      lengthInput.value = String(preset.length);
    }
    if (typeof preset.words === "number") {
      wordsInput.value = String(preset.words);
    }
    if (preset.toggles) {
      for (const key of TOGGLE_KEYS) {
        const el = toggles.get(key);
        if (el) el.checked = preset.toggles[key];
      }
    }
    paintPresets();
    paintMode();
    render();
  }

  function clearPreset(): void {
    if (activePreset === "") return;
    activePreset = "";
    paintPresets();
  }

  for (const btn of presetButtons) {
    btn.addEventListener("click", () => {
      const id = btn.dataset.secretPreset;
      if (id) applyPreset(id);
    });
  }

  lengthInput.addEventListener("input", () => {
    clearPreset();
    render();
  });

  wordsInput.addEventListener("input", () => {
    clearPreset();
    render();
  });

  countInput.addEventListener("input", render);

  for (const key of TOGGLE_KEYS) {
    toggles.get(key)?.addEventListener("change", () => {
      if (mode !== "custom") {
        mode = "custom";
        paintMode();
      }
      clearPreset();
      render();
    });
  }

  // The id sits on the inner span of the NeoButton, so bind the button itself.
  document
    .getElementById("secret-generate")
    ?.closest("button")
    ?.addEventListener("click", render);

  const copyBtn = document.getElementById("secret-copy");
  const copyLabel = document.getElementById("secret-copy-label");
  let copyTimer = 0;

  copyBtn?.addEventListener("click", () => {
    const flash = (text: string): void => {
      if (!copyLabel) return;
      copyLabel.textContent = text;
      window.clearTimeout(copyTimer);
      copyTimer = window.setTimeout(() => {
        copyLabel.textContent = "Copy all";
      }, 1500);
    };
    if (!output.value) {
      flash("Nothing to copy");
      return;
    }
    void (async () => {
      try {
        await navigator.clipboard.writeText(output.value);
        flash("Copied!");
      } catch {
        output.focus();
        output.select();
        flash("Press ⌘/Ctrl+C");
      }
    })();
  });

  paintPresets();
  paintMode();
  render();
}

init();
document.addEventListener("astro:after-swap", init);

export {};
