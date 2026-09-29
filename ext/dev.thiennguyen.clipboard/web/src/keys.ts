// The panel's own shortcuts that the person can change — Pin, today — as
// the `pinKey` setting spells them: "alt+p", "ctrl+shift+1". Matched on the
// key's position (`event.code`), not on what it types: ⌥P types "π".

export interface Combo {
  ctrl: boolean;
  alt: boolean;
  shift: boolean;
  cmd: boolean;
  /** A lowercase letter or a digit. */
  key: string;
}

export const DEFAULT_PIN_KEY = "alt+p";

export function parseCombo(text: string): Combo | null {
  const parts = text.toLowerCase().split("+").map((p) => p.trim()).filter(Boolean);
  const key = parts.pop() ?? "";
  if (!/^[a-z0-9]$/.test(key)) return null;
  const combo: Combo = { ctrl: false, alt: false, shift: false, cmd: false, key };
  for (const part of parts) {
    if (part === "ctrl" || part === "alt" || part === "shift" || part === "cmd") combo[part] = true;
    else return null;
  }
  return combo;
}

/** The setting's spelling, modifiers in macOS's order. */
export function comboText(combo: Combo): string {
  const mods = (["ctrl", "alt", "shift", "cmd"] as const).filter((m) => combo[m]);
  return [...mods, combo.key].join("+");
}

/** As macOS draws it: ⌃⌥⇧⌘P. */
export function glyphs(combo: Combo): string {
  return `${combo.ctrl ? "⌃" : ""}${combo.alt ? "⌥" : ""}${combo.shift ? "⇧" : ""}${combo.cmd ? "⌘" : ""}${combo.key.toUpperCase()}`;
}

/** The letter or digit under the key pressed, whatever it typed. */
function keyOf(event: { code: string }): string | null {
  const letter = /^Key([A-Z])$/.exec(event.code);
  if (letter) return letter[1]!.toLowerCase();
  const digit = /^Digit([0-9])$/.exec(event.code);
  return digit ? digit[1]! : null;
}

type Pressed = { code: string; ctrlKey: boolean; altKey: boolean; shiftKey: boolean; metaKey: boolean };

export function comboOf(event: Pressed): Combo | null {
  const key = keyOf(event);
  if (!key) return null;
  return { ctrl: event.ctrlKey, alt: event.altKey, shift: event.shiftKey, cmd: event.metaKey, key };
}

export function pressed(event: Pressed, combo: Combo): boolean {
  const got = comboOf(event);
  return (
    got !== null &&
    got.key === combo.key &&
    got.ctrl === combo.ctrl &&
    got.alt === combo.alt &&
    got.shift === combo.shift &&
    got.cmd === combo.cmd
  );
}

/** Why a combo cannot be the panel's Pin, or null when it can. */
export function refusal(combo: Combo): string | null {
  if (!combo.ctrl && !combo.alt && !combo.cmd) {
    return "Add ⌘, ⌥ or ⌃ — without one, the key types into the search";
  }
  if (combo.cmd && !combo.ctrl && !combo.alt && !combo.shift) {
    return "⌘ with a letter or digit pastes a row or a pinned item";
  }
  if (combo.cmd && combo.shift && !combo.ctrl && !combo.alt && combo.key === "z") {
    return "⌘⇧Z is Redo";
  }
  return null;
}

const KEY_NAMES: Record<string, string> = {
  Space: "Space",
  Enter: "↩",
  Escape: "⎋",
  Tab: "⇥",
  Backspace: "⌫",
  ArrowUp: "↑",
  ArrowDown: "↓",
  ArrowLeft: "←",
  ArrowRight: "→",
  Comma: ",",
  Period: ".",
  Slash: "/",
  Semicolon: ";",
  Quote: "'",
  BracketLeft: "[",
  BracketRight: "]",
  Minus: "-",
  Equal: "=",
  Backquote: "`",
  Backslash: "\\",
};

/** A Lumi accelerator — `Shift+Super+KeyC`, as Shortcuts stores it — as
 *  macOS draws it: ⇧⌘C. Modifiers in macOS's order, whatever order or
 *  spelling (`Cmd`, `Option`, `CmdOrCtrl`) the row was written with. */
export function acceleratorGlyphs(accelerator: string): string {
  const tokens = accelerator.split("+").map((t) => t.trim()).filter(Boolean);
  const key = tokens.pop() ?? "";
  const mods = new Set(
    tokens.map((t) => {
      const up = t.toUpperCase();
      if (up === "CTRL" || up === "CONTROL") return "⌃";
      if (up === "ALT" || up === "OPTION") return "⌥";
      if (up === "SHIFT") return "⇧";
      if (["SUPER", "CMD", "COMMAND", "CMDORCTRL", "COMMANDORCONTROL", "CMDORCONTROL", "COMMANDORCTRL"].includes(up)) return "⌘";
      if (up === "FN") return "fn";
      if (up === "DOUBLETAP") return "2×";
      return up;
    }),
  );
  const order = ["fn", "2×", "⌃", "⌥", "⇧", "⌘"];
  const head = order.filter((m) => mods.has(m)).join("");
  const name = /^Key([A-Z])$/i.exec(key)?.[1]?.toUpperCase() ?? /^Digit([0-9])$/.exec(key)?.[1] ?? KEY_NAMES[key] ?? key.toUpperCase();
  return head + (head.endsWith("fn") || head.endsWith("2×") ? " " : "") + name;
}
