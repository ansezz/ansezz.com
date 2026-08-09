// Bidirectional Unix file-mode calculator. Octal (755, 4755) <-> rwx bits,
// including the high digit — setuid 4, setgid 2, sticky 1 — and the S/T
// rendering used when the matching execute bit is off.

const READ = 4;
const WRITE = 2;
const EXEC = 1;

const SETUID = 4;
const SETGID = 2;
const STICKY = 1;

type ClassKey = "u" | "g" | "o";
type BoxGroup = ClassKey | "special";

interface Mode {
  readonly special: number;
  readonly u: number;
  readonly g: number;
  readonly o: number;
}

type ParseResult =
  | { readonly ok: true; readonly mode: Mode }
  | { readonly ok: false; readonly message: string };

interface Warning {
  readonly level: "danger" | "note";
  readonly text: string;
}

const EMPTY: Mode = { special: 0, u: 0, g: 0, o: 0 };
const DEFAULT_MODE: Mode = { special: 0, u: 7, g: 5, o: 5 };
const DEFAULT_PATH = "path/to/file";

// ── mode maths ───────────────────────────────────────────

function bitsFor(mode: Mode, group: BoxGroup): number {
  switch (group) {
    case "special":
      return mode.special;
    case "u":
      return mode.u;
    case "g":
      return mode.g;
    case "o":
      return mode.o;
  }
}

function withBit(mode: Mode, group: BoxGroup, bit: number): Mode {
  switch (group) {
    case "special":
      return { ...mode, special: mode.special | bit };
    case "u":
      return { ...mode, u: mode.u | bit };
    case "g":
      return { ...mode, g: mode.g | bit };
    case "o":
      return { ...mode, o: mode.o | bit };
  }
}

function digitAt(digits: string, index: number): number {
  const code = digits.charCodeAt(index);
  return Number.isNaN(code) ? 0 : code - 48;
}

// chmod right-aligns numeric modes, so "7" really is 0007. Mirror that.
function parseOctal(raw: string): ParseResult {
  const text = raw.trim();
  if (text === "") {
    return { ok: false, message: "Enter an octal mode — 644, 755, 4755." };
  }
  if (/[89]/.test(text)) {
    return {
      ok: false,
      message: "8 and 9 aren't octal digits. Every digit is 0–7.",
    };
  }
  if (!/^[0-7]+$/.test(text)) {
    return {
      ok: false,
      message: "Digits 0–7 only. Symbolic modes like u+x aren't parsed here.",
    };
  }
  const trimmed = text.replace(/^0+(?=[0-7])/, "");
  if (trimmed.length > 4) {
    return { ok: false, message: "A mode is at most 4 octal digits (0–7777)." };
  }
  const digits = trimmed.padStart(4, "0");
  return {
    ok: true,
    mode: {
      special: digitAt(digits, 0),
      u: digitAt(digits, 1),
      g: digitAt(digits, 2),
      o: digitAt(digits, 3),
    },
  };
}

function fourDigit(mode: Mode): string {
  return `${mode.special}${mode.u}${mode.g}${mode.o}`;
}

// What you'd actually type: 3 digits unless a special bit is set.
function canonicalOctal(mode: Mode): string {
  return mode.special === 0 ? `${mode.u}${mode.g}${mode.o}` : fourDigit(mode);
}

function classSymbol(
  bits: number,
  hasSpecial: boolean,
  specialChar: "s" | "t",
): string {
  const r = (bits & READ) !== 0 ? "r" : "-";
  const w = (bits & WRITE) !== 0 ? "w" : "-";
  const canExec = (bits & EXEC) !== 0;
  const third = hasSpecial
    ? canExec
      ? specialChar
      : specialChar.toUpperCase()
    : canExec
      ? "x"
      : "-";
  return `${r}${w}${third}`;
}

function symbolic(mode: Mode): string {
  return (
    classSymbol(mode.u, (mode.special & SETUID) !== 0, "s") +
    classSymbol(mode.g, (mode.special & SETGID) !== 0, "s") +
    classSymbol(mode.o, (mode.special & STICKY) !== 0, "t")
  );
}

function letters(bits: number): string {
  return (
    ((bits & READ) !== 0 ? "r" : "") +
    ((bits & WRITE) !== 0 ? "w" : "") +
    ((bits & EXEC) !== 0 ? "x" : "")
  );
}

// `=` clears the special bits, so they're re-added as trailing clauses.
function symbolicClauses(mode: Mode): string {
  const base = [
    `u=${letters(mode.u)}`,
    `g=${letters(mode.g)}`,
    `o=${letters(mode.o)}`,
  ];
  const extra = [
    (mode.special & SETUID) !== 0 ? "u+s" : "",
    (mode.special & SETGID) !== 0 ? "g+s" : "",
    (mode.special & STICKY) !== 0 ? "+t" : "",
  ].filter((clause) => clause !== "");
  return [...base, ...extra].join(",");
}

function joinList(items: readonly string[]): string {
  if (items.length === 0) return "";
  if (items.length === 1) return items[0] ?? "";
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`;
}

function permWords(bits: number): string[] {
  return [
    (bits & READ) !== 0 ? "read" : "",
    (bits & WRITE) !== 0 ? "write" : "",
    (bits & EXEC) !== 0 ? "execute" : "",
  ].filter((word) => word !== "");
}

interface Clause {
  readonly subjects: readonly string[];
  readonly bits: number;
  readonly plural: boolean;
}

const SUBJECT: Record<ClassKey, string> = {
  u: "owner",
  g: "group",
  o: "others",
};

// Merges neighbouring classes that share the same bits:
// "owner can read, write, and execute; group and others can read and execute."
function english(mode: Mode): string {
  const order: readonly { key: ClassKey; bits: number }[] = [
    { key: "u", bits: mode.u },
    { key: "g", bits: mode.g },
    { key: "o", bits: mode.o },
  ];

  const clauses = order.reduce<Clause[]>((acc, entry) => {
    const last = acc[acc.length - 1];
    if (last && last.bits === entry.bits) {
      return [
        ...acc.slice(0, -1),
        {
          subjects: [...last.subjects, SUBJECT[entry.key]],
          bits: last.bits,
          plural: true,
        },
      ];
    }
    return [
      ...acc,
      {
        subjects: [SUBJECT[entry.key]],
        bits: entry.bits,
        plural: entry.key === "o",
      },
    ];
  }, []);

  const sentence = clauses
    .map((clause) => {
      const subject = joinList(clause.subjects);
      const words = permWords(clause.bits);
      if (words.length === 0) {
        return `${subject} ${clause.plural ? "have" : "has"} no access`;
      }
      return `${subject} can ${joinList(words)}`;
    })
    .join("; ");

  return `${sentence.charAt(0).toUpperCase()}${sentence.slice(1)}.`;
}

const SPECIAL_NOTES: readonly { bit: number; text: string }[] = [
  {
    bit: SETUID,
    text: "Setuid (4000): the binary runs with the file owner's user ID, not the caller's. Linux ignores it on shell scripts.",
  },
  {
    bit: SETGID,
    text: "Setgid (2000): on a binary it runs with the file's group; on a directory, new entries inherit that directory's group.",
  },
  {
    bit: STICKY,
    text: "Sticky (1000): inside this directory only an entry's owner (or root) can rename or delete it. That's what keeps /tmp usable.",
  },
];

function specialNotes(mode: Mode): string[] {
  return SPECIAL_NOTES.filter((note) => (mode.special & note.bit) !== 0).map(
    (note) => note.text,
  );
}

function warningsFor(mode: Mode): Warning[] {
  const isAllOpen = mode.u === 7 && mode.g === 7 && mode.o === 7;
  const ownerShortchanged = ((mode.g | mode.o) & ~mode.u & 7) !== 0;
  const worldWritable = (mode.o & WRITE) !== 0;
  const sticky = (mode.special & STICKY) !== 0;

  const candidates: readonly (Warning | null)[] = [
    worldWritable && sticky
      ? {
          level: "note",
          text: "World-writable with the sticky bit — the /tmp pattern. Anyone can create entries here, but only an entry's owner can rename or delete it. Only use it for shared scratch space.",
        }
      : null,
    isAllOpen && !sticky
      ? {
          level: "danger",
          text: "777 hands every local account and every running process full read, write, and execute. If your web server can rewrite its own code, one upload bug is a shell. Fix ownership with chown instead.",
        }
      : null,
    worldWritable && !sticky && !isAllOpen
      ? {
          level: "danger",
          text: "World-writable: any user or daemon on the box can modify this. Outside a sticky-bit directory like /tmp, that's almost always a mistake.",
        }
      : null,
    (mode.special & SETUID) !== 0
      ? {
          level: "danger",
          text: "Setuid is a privilege-escalation surface — every bug in this binary becomes a bug that runs as its owner. Prefer a sudo rule or a file capability.",
        }
      : null,
    (mode.special & SETUID) !== 0 && (mode.u & EXEC) === 0
      ? {
          level: "note",
          text: "Setuid is set but the owner has no execute bit, so it renders as a capital S and nothing can trigger it.",
        }
      : null,
    (mode.special & SETGID) !== 0 && (mode.g & EXEC) === 0
      ? {
          level: "note",
          text: "Setgid without group execute renders as a capital S. On a directory group inheritance still works; on a file the bit does nothing.",
        }
      : null,
    sticky && (mode.o & EXEC) === 0
      ? {
          level: "note",
          text: "The sticky bit without other execute renders as a capital T — a directory nobody outside the owner and group can enter.",
        }
      : null,
    sticky && !worldWritable
      ? {
          level: "note",
          text: "The sticky bit only means anything on a directory. Linux ignores it on a regular file.",
        }
      : null,
    ownerShortchanged
      ? {
          level: "note",
          text: "Group or others get a permission the owner doesn't have. The kernel checks the owner class first and stops there, so the owner really is locked out of it — usually a typo.",
        }
      : null,
    mode.u === 0 && mode.g === 0 && mode.o === 0
      ? {
          level: "note",
          text: "0000 denies everyone. Only root (and anything with CAP_DAC_OVERRIDE) can still open it.",
        }
      : null,
  ];

  return candidates.filter((entry): entry is Warning => entry !== null);
}

const SAFE_PATH = /^[A-Za-z0-9._/@%+:,=-]+$/;

function shellQuote(raw: string): string {
  const value = raw.trim() === "" ? DEFAULT_PATH : raw.trim();
  if (SAFE_PATH.test(value)) return value;
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

// ── DOM wiring ───────────────────────────────────────────

interface BoxSpec {
  readonly id: string;
  readonly group: BoxGroup;
  readonly bit: number;
}

interface BoundBox extends BoxSpec {
  readonly el: HTMLInputElement;
}

const BOX_SPECS: readonly BoxSpec[] = [
  { id: "chmod-setuid", group: "special", bit: SETUID },
  { id: "chmod-setgid", group: "special", bit: SETGID },
  { id: "chmod-sticky", group: "special", bit: STICKY },
  { id: "chmod-u-r", group: "u", bit: READ },
  { id: "chmod-u-w", group: "u", bit: WRITE },
  { id: "chmod-u-x", group: "u", bit: EXEC },
  { id: "chmod-g-r", group: "g", bit: READ },
  { id: "chmod-g-w", group: "g", bit: WRITE },
  { id: "chmod-g-x", group: "g", bit: EXEC },
  { id: "chmod-o-r", group: "o", bit: READ },
  { id: "chmod-o-w", group: "o", bit: WRITE },
  { id: "chmod-o-x", group: "o", bit: EXEC },
];

const BADGE_CLASS: Record<Warning["level"], string> = {
  danger: "bg-ink text-bg",
  note: "bg-paper text-ink",
};

const BADGE_LABEL: Record<Warning["level"], string> = {
  danger: "Risk",
  note: "Note",
};

function setText(el: HTMLElement | null, value: string): void {
  if (el) el.textContent = value;
}

function readHashMode(): Mode | null {
  const match = window.location.hash.match(/^#([0-7]{1,4})$/);
  if (!match) return null;
  const parsed = parseOctal(match[1] ?? "");
  return parsed.ok ? parsed.mode : null;
}

function init(): void {
  const root = document.getElementById("chmod-root");
  if (!root || root.dataset.bound === "1") return;

  const octalNode = document.getElementById("chmod-octal");
  const pathNode = document.getElementById("chmod-path");
  if (
    !(octalNode instanceof HTMLInputElement) ||
    !(pathNode instanceof HTMLInputElement)
  ) {
    return;
  }
  // Explicit types so the narrowing survives inside the hoisted helpers below.
  const octalInput: HTMLInputElement = octalNode;
  const pathInput: HTMLInputElement = pathNode;

  const boxes = BOX_SPECS.map((spec) => {
    const el = document.getElementById(spec.id);
    return el instanceof HTMLInputElement ? { ...spec, el } : null;
  }).filter((box): box is BoundBox => box !== null);
  if (boxes.length !== BOX_SPECS.length) return;

  root.dataset.bound = "1";

  const errorEl = document.getElementById("chmod-error");
  const bigEl = document.getElementById("chmod-out-octal");
  const fourEl = document.getElementById("chmod-out-four");
  const symbolicEl = document.getElementById("chmod-out-symbolic");
  const lsFileEl = document.getElementById("chmod-out-ls-file");
  const lsDirEl = document.getElementById("chmod-out-ls-dir");
  const commandEl = document.getElementById("chmod-out-command");
  const symbolicCmdEl = document.getElementById("chmod-out-symbolic-command");
  const englishEl = document.getElementById("chmod-out-english");
  const notesEl = document.getElementById("chmod-out-notes");
  const warnListEl = document.getElementById("chmod-out-warnings");
  const warnWrapEl = document.getElementById("chmod-warnings-wrap");
  const copyBtn = document.getElementById("chmod-copy");
  const copyLabel = document.getElementById("chmod-copy-label");
  const digitEls: Record<BoxGroup, HTMLElement | null> = {
    u: document.getElementById("chmod-digit-u"),
    g: document.getElementById("chmod-digit-g"),
    o: document.getElementById("chmod-digit-o"),
    special: document.getElementById("chmod-digit-special"),
  };

  function showError(message: string): void {
    if (!errorEl) return;
    errorEl.textContent = message;
    errorEl.hidden = false;
  }

  function clearError(): void {
    if (!errorEl) return;
    errorEl.textContent = "";
    errorEl.hidden = true;
  }

  function writeBoxes(mode: Mode): void {
    for (const box of boxes) {
      box.el.checked = (bitsFor(mode, box.group) & box.bit) !== 0;
    }
  }

  function readBoxes(): Mode {
    return boxes.reduce<Mode>(
      (mode, box) =>
        box.el.checked ? withBit(mode, box.group, box.bit) : mode,
      EMPTY,
    );
  }

  function renderList(target: HTMLElement, items: readonly string[]): void {
    target.replaceChildren();
    for (const item of items) {
      const li = document.createElement("li");
      li.className = "flex gap-2 text-sm leading-snug";
      const marker = document.createElement("span");
      marker.className = "mono font-bold shrink-0";
      marker.textContent = "▸";
      marker.setAttribute("aria-hidden", "true");
      const text = document.createElement("span");
      text.textContent = item;
      li.append(marker, text);
      target.appendChild(li);
    }
  }

  function renderWarnings(items: readonly Warning[]): void {
    if (warnWrapEl) warnWrapEl.hidden = items.length === 0;
    if (!warnListEl) return;
    warnListEl.replaceChildren();
    for (const item of items) {
      const li = document.createElement("li");
      li.className = "flex gap-3 items-start text-sm leading-snug";
      const badge = document.createElement("span");
      badge.className = `mono text-[10px] font-bold uppercase tracking-widest border-[2px] border-ink rounded-full px-2 py-0.5 shrink-0 ${BADGE_CLASS[item.level]}`;
      badge.textContent = BADGE_LABEL[item.level];
      const text = document.createElement("span");
      text.textContent = item.text;
      li.append(badge, text);
      warnListEl.appendChild(li);
    }
  }

  function render(mode: Mode): void {
    const sym = symbolic(mode);
    setText(bigEl, canonicalOctal(mode));
    setText(fourEl, fourDigit(mode));
    setText(symbolicEl, sym);
    setText(lsFileEl, `-${sym}`);
    setText(lsDirEl, `d${sym}`);
    setText(
      commandEl,
      `chmod ${canonicalOctal(mode)} ${shellQuote(pathInput.value)}`,
    );
    setText(
      symbolicCmdEl,
      `chmod ${symbolicClauses(mode)} ${shellQuote(pathInput.value)}`,
    );
    setText(englishEl, english(mode));
    setText(digitEls.u, String(mode.u));
    setText(digitEls.g, String(mode.g));
    setText(digitEls.o, String(mode.o));
    setText(digitEls.special, String(mode.special));
    if (notesEl) renderList(notesEl, specialNotes(mode));
    renderWarnings(warningsFor(mode));
  }

  function syncHash(mode: Mode): void {
    try {
      window.history.replaceState(null, "", `#${canonicalOctal(mode)}`);
    } catch {
      // Some embedded browsers block history writes; the tool still works.
    }
  }

  // Returns the mode it applied, or null when the text didn't parse.
  function applyOctal(raw: string, writeInput: boolean): Mode | null {
    const parsed = parseOctal(raw);
    if (!parsed.ok) {
      showError(parsed.message);
      return null;
    }
    clearError();
    writeBoxes(parsed.mode);
    if (writeInput) octalInput.value = canonicalOctal(parsed.mode);
    render(parsed.mode);
    return parsed.mode;
  }

  octalInput.addEventListener("input", () => {
    applyOctal(octalInput.value, false);
  });

  // Normalise + record the mode once the field settles, not on every keystroke.
  octalInput.addEventListener("change", () => {
    const parsed = parseOctal(octalInput.value);
    if (!parsed.ok) return;
    octalInput.value = canonicalOctal(parsed.mode);
    syncHash(parsed.mode);
  });

  for (const box of boxes) {
    box.el.addEventListener("change", () => {
      const mode = readBoxes();
      clearError();
      octalInput.value = canonicalOctal(mode);
      render(mode);
      syncHash(mode);
    });
  }

  pathInput.addEventListener("input", () => {
    render(readBoxes());
  });

  for (const btn of root.querySelectorAll<HTMLButtonElement>(
    "[data-chmod-preset]",
  )) {
    btn.addEventListener("click", () => {
      const mode = applyOctal(btn.dataset.chmodPreset ?? "", true);
      if (mode) syncHash(mode);
    });
  }

  copyBtn?.addEventListener("click", () => {
    const command = commandEl?.textContent ?? "";
    if (command === "") return;
    const flash = (message: string): void => {
      if (!copyLabel) return;
      copyLabel.textContent = message;
      window.setTimeout(() => {
        if (copyLabel) copyLabel.textContent = "Copy command";
      }, 1500);
    };
    void (async () => {
      try {
        await navigator.clipboard.writeText(command);
        flash("Copied!");
      } catch {
        const selection = window.getSelection();
        if (selection && commandEl) {
          const range = document.createRange();
          range.selectNodeContents(commandEl);
          selection.removeAllRanges();
          selection.addRange(range);
        }
        flash("Press ⌘/Ctrl+C");
      }
    })();
  });

  const fromHash = readHashMode();
  if (fromHash) {
    octalInput.value = canonicalOctal(fromHash);
    render(fromHash);
    writeBoxes(fromHash);
    clearError();
  } else {
    const initial = parseOctal(octalInput.value);
    applyOctal(
      initial.ok ? octalInput.value : canonicalOctal(DEFAULT_MODE),
      true,
    );
  }
}

init();
document.addEventListener("astro:after-swap", init);

export {};
