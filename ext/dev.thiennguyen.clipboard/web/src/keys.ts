// The panel's own shortcuts that the person can change — Pin, privacy
// mode's show or hide of one item or of all, and Lock history now — as the
// `pinKey`, `revealKey`, `revealAllKey` and `lockKey` settings spell them:
// "cmd+p", "ctrl+shift+1". Matched on the key's position (`event.code`), not
// on what it types: ⌥P types "π".

export interface Combo {
  ctrl: boolean;
  alt: boolean;
  shift: boolean;
  cmd: boolean;
  /** A lowercase letter or a digit. */
  key: string;
}

/** ⌘P: the one ⌘-letter no row is ever given (`history::PIN_LETTERS`
 *  leaves `p` out for it), and ⌘⇧P beside it pins the panel. */
export const DEFAULT_PIN_KEY = "cmd+p";

/** ⌘⇧H, beside ⌘⇧P: privacy mode's show or hide of the selected item. */
export const DEFAULT_REVEAL_KEY = "cmd+shift+h";

/** ⌥⇧⌘H, the same with ⌥ — macOS's "all" key — for every item at once.
 *  Not ⌥⌘H, which is macOS's Hide Others. */
export const DEFAULT_REVEAL_ALL_KEY = "alt+shift+cmd+h";

/** ⌘⇧L: Lock history now. Not ⌘L, which a pinned row may be given. */
export const DEFAULT_LOCK_KEY = "cmd+shift+l";

/** What each of the panel's own keys does, as a refusal says it. */
export const PIN_DOES = "pins the selected item";
export const REVEAL_DOES = "shows or hides the preview";
export const REVEAL_ALL_DOES = "shows or hides every preview";
export const LOCK_DOES = "locks the history";

/** One of the panel's keys the person set, held by what it does: the other
 *  key cannot be it too. */
export type TakenKey = { combo: Combo; does: string };

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

export function same(a: Combo, b: Combo): boolean {
  return a.key === b.key && a.ctrl === b.ctrl && a.alt === b.alt && a.shift === b.shift && a.cmd === b.cmd;
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

/** The next press as a Lumi accelerator — `Shift+Super+KeyC`, the spelling
 *  Lumi's own recorder writes and `PUT /__lumi__/shortcuts` takes: modifiers
 *  in Ctrl, Alt, Shift, Super order, then the key's `code`. A letter, a
 *  digit, Space or F1–F12, the set a `[[shortcut]]` may declare; null for a
 *  modifier on its own or any other key. By position, like `comboOf`. */
export function acceleratorOf(event: Pressed): string | null {
  const code = event.code;
  const key = /^(Key[A-Z]|Digit[0-9]|Space|F([1-9]|1[0-2]))$/.test(code) ? code : null;
  if (!key) return null;
  const mods = [event.ctrlKey && "Ctrl", event.altKey && "Alt", event.shiftKey && "Shift", event.metaKey && "Super"].filter(
    (m): m is string => Boolean(m),
  );
  return [...mods, key].join("+");
}

/** Why an accelerator cannot be a global shortcut, or null when it can —
 *  Lumi's own rule, asked here so the answer comes before the round trip. */
export function acceleratorRefusal(accelerator: string): string | null {
  const parts = accelerator.split("+");
  if (!parts.some((p) => p === "Ctrl" || p === "Alt" || p === "Super")) {
    return "Add ⌘, ⌥ or ⌃ — on its own this would take the key away from typing";
  }
  return null;
}

/** Why a combo cannot be one of the panel's own keys, or null when it can:
 *  what types into the search, what the panel or the field already answers,
 *  a row's key — and `others`, the panel's other keys as they are set. */
export function refusal(combo: Combo, others: readonly TakenKey[] = []): string | null {
  if (!combo.ctrl && !combo.alt && !combo.cmd) {
    return "Add ⌘, ⌥ or ⌃ — without one, the key types into the search";
  }
  if (combo.cmd && !combo.ctrl && !combo.alt && !combo.shift) {
    const taken = CMD_LETTERS[combo.key];
    if (taken) return taken;
    // A digit, or a letter a pinned row may be given.
    if (combo.key !== "p") return "⌘ with a letter or digit pastes a row or a pinned item";
  }
  if (combo.cmd && combo.shift && !combo.ctrl && !combo.alt && combo.key === "z") {
    return "⌘⇧Z is Redo";
  }
  if (combo.cmd && combo.shift && !combo.ctrl && !combo.alt && combo.key === "p") {
    return "⌘⇧P pins the panel";
  }
  const other = others.find((taken) => same(taken.combo, combo));
  if (other) return `${glyphs(combo)} ${other.does}`;
  return null;
}

/** The panel's keys as the settings spell them, each as the panel can use
 *  it: one it refuses goes back to its default. Settled in the order the
 *  keys came — Pin, then show or hide, then show or hide all, then Lock
 *  history now — each giving way to the ones before it: to its default, or
 *  to none when even that is taken (⌘⇧H was a Pin key a person could choose
 *  before privacy mode), until the person picks another. Pin always has
 *  one: nothing comes before it, and its default is never refused. */
export function panelKeys(
  pinText: string | undefined,
  revealText: string | undefined,
  revealAllText?: string,
  lockText?: string,
): { pin: Combo; reveal: Combo | null; revealAll: Combo | null; lock: Combo | null } {
  const taken: TakenKey[] = [];
  const settle = (text: string | undefined, fallback: string, does: string) => {
    const usable = (combo: Combo | null) => (combo && !refusal(combo, taken) ? combo : null);
    const combo = usable(parseCombo(text ?? "")) ?? usable(parseCombo(fallback));
    if (combo) taken.push({ combo, does });
    return combo;
  };
  const pin = settle(pinText, DEFAULT_PIN_KEY, PIN_DOES)!;
  const reveal = settle(revealText, DEFAULT_REVEAL_KEY, REVEAL_DOES);
  const revealAll = settle(revealAllText, DEFAULT_REVEAL_ALL_KEY, REVEAL_ALL_DOES);
  const lock = settle(lockText, DEFAULT_LOCK_KEY, LOCK_DOES);
  return { pin, reveal, revealAll, lock };
}

/** ⌘-letters no row is given because something else answers them
 *  (`history::PIN_LETTERS`' own list) — all but `p`, kept for Pin. `y` is
 *  the panel's own, as `p` is, but not one a person may take for Pin. */
const CMD_LETTERS: Record<string, string> = {
  a: "⌘A is Select All",
  c: "⌘C is Copy",
  k: "⌘K opens the actions menu",
  q: "⌘Q is Quit",
  v: "⌘V is Paste",
  w: "⌘W is Close",
  x: "⌘X is Cut",
  y: "⌘Y expands the preview",
  z: "⌘Z is Undo",
};

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
