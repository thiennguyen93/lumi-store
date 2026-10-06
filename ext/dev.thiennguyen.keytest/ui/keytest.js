// Keyboard Test: light each key of a MacBook keyboard as it is pressed,
// count what has been covered, and catch a key that types twice — and
// clean the keyboard: hold every key from every app while it is wiped,
// lighting each one wiped, so cleaning is a test too.
//
// Keys are matched by `KeyboardEvent.code` — the physical position, not
// the character — so the test means the same thing under any input
// source, Vietnamese Telex included. The layout is the page's memory, kept
// by the extension's own code (`askState`, `set-layout`); how cleaning goes
// is a setting, from the Settings tab Lumi draws (`lumi:settings`); and
// cleaning itself is Lumi's input hold, asked for over the bridge
// (`/__lumi__/input-hold`).

(() => {
  "use strict";

  /** A key re-pressed sooner than this after its release was not
   *  re-pressed by a finger: human double-taps sit well above 60 ms, a
   *  chattering switch bounces an up and a down in a few. */
  const CHATTER_MS = 40;

  /** A re-press `gap` ms after the last release is chatter. Only a gap
   *  measured on one clock counts: a key from the page's own events is
   *  timed on `performance.now()`, a key Lumi relays on the Mac's uptime
   *  (`detail.time`), and a release on one with a press on the other is
   *  a huge gap or a negative one — never a bounce. */
  const bounced = (gap) => gap >= 0 && gap < CHATTER_MS;

  /** How long the unlock button and the unlock keys are held. */
  const UNLOCK_MS = 2000;

  /** The function row's system keys, as Lumi names them while cleaning,
   *  onto the keycap each sits under on a MacBook — F1–F12 pressed without
   *  fn are brightness, Mission Control, Spotlight, media and volume, not
   *  F-keys. Two names for F7 and F9 (older keyboards send track keys) and
   *  for F5 and F6 (keyboard backlight on an Intel MacBook Pro). */
  const FN_ROW = {
    BrightnessDown: "F1",
    BrightnessUp: "F2",
    ShowAllWindows: "F3",
    BrowserSearch: "F4",
    Dictate: "F5",
    KbdIllumDown: "F5",
    DoNotDisturb: "F6",
    KbdIllumUp: "F6",
    MediaRewind: "F7",
    MediaTrackPrevious: "F7",
    MediaPlayPause: "F8",
    MediaFastForward: "F9",
    MediaTrackNext: "F9",
    AudioVolumeMute: "F10",
    AudioVolumeDown: "F11",
    AudioVolumeUp: "F12",
  };

  // One row per line of keys, each key [code, label, width, options]:
  // widths in key units, and every row is 14.5 of them — a MacBook Pro's
  // own proportions (the 2021 and later keyboard, full-height function
  // row): delete and tab 1.5, caps lock and return 1.75, both shifts 2.25,
  // command 1.25, space 5. A null code is a key no page can hear (Touch
  // ID), drawn so the board looks like the one under the person's hands,
  // and never counted. fn is counted, through what it does to other keys —
  // `FN_COMBOS`.
  //
  // Options: `sym` and `side` draw a modifier the way the keycap does —
  // its symbol in the corner nearest the space bar's end, its word along
  // the bottom; `globe` is the fn key; `half` is a half-height arrow sat on
  // the row's floor; `join` is a piece of ISO's two-piece Return.
  const fnRow = [
    ["Escape", "esc", 1.5],
    ...Array.from({ length: 12 }, (_, i) => [`F${i + 1}`, `F${i + 1}`, 1]),
    [null, "Touch ID", 1, { touchId: true }],
  ];
  const digits = [
    ...["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"].map((d) => [`Digit${d}`, d, 1]),
    ["Minus", "-", 1],
    ["Equal", "=", 1],
    ["Backspace", "delete", 1.5],
  ];
  const letters = (row) => [...row].map((c) => [`Key${c}`, c, 1]);
  const bottom = [
    ["Fn", "fn", 1, { globe: true }],
    ["ControlLeft", "control", 1, { sym: "⌃", side: "left" }],
    ["AltLeft", "option", 1, { sym: "⌥", side: "left" }],
    ["MetaLeft", "command", 1.25, { sym: "⌘", side: "left" }],
    ["Space", "", 5],
    ["MetaRight", "command", 1.25, { sym: "⌘", side: "right" }],
    ["AltRight", "option", 1, { sym: "⌥", side: "right" }],
    ["ArrowLeft", "◀", 1, { half: true }],
    { stack: [["ArrowUp", "▲"], ["ArrowDown", "▼"]], width: 1 },
    ["ArrowRight", "▶", 1, { half: true }],
  ];

  const LAYOUTS = {
    ansi: [
      fnRow,
      [["Backquote", "`", 1], ...digits],
      [["Tab", "tab", 1.5], ...letters("QWERTYUIOP"), ["BracketLeft", "[", 1], ["BracketRight", "]", 1], ["Backslash", "\\", 1]],
      [["CapsLock", "caps lock", 1.75], ...letters("ASDFGHJKL"), ["Semicolon", ";", 1], ["Quote", "'", 1], ["Enter", "return", 1.75]],
      [["ShiftLeft", "shift", 2.25], ...letters("ZXCVBNM"), ["Comma", ",", 1], ["Period", ".", 1], ["Slash", "/", 1], ["ShiftRight", "shift", 2.25]],
      bottom,
    ],
    // ISO: a tall Return, a key between left Shift and Z, and § top left.
    // macOS reports those last two swapped against their legends — the §
    // key arrives as `IntlBackslash` and the key beside Z as `Backquote` —
    // so they are placed by what WebKit reports, which is what a test of
    // this keyboard has to match.
    iso: [
      fnRow,
      [["IntlBackslash", "§", 1], ...digits],
      [["Tab", "tab", 1.5], ...letters("QWERTYUIOP"), ["BracketLeft", "[", 1], ["BracketRight", "]", 1], ["Enter", "return", 1, { join: "join-down" }]],
      [["CapsLock", "caps lock", 1.75], ...letters("ASDFGHJKL"), ["Semicolon", ";", 1], ["Quote", "'", 1], ["Backslash", "\\", 1], ["Enter", "", 0.75, { join: "join-up" }]],
      [["ShiftLeft", "shift", 1.25], ["Backquote", "`", 1], ...letters("ZXCVBNM"), ["Comma", ",", 1], ["Period", ".", 1], ["Slash", "/", 1], ["ShiftRight", "shift", 2.25]],
      bottom,
    ],
  };

  /** The Globe on the fn key, drawn rather than taken from a font: the
   *  emoji is coloured and the text glyph is missing from most. Built as
   *  DOM, not markup, so nothing here is parsed as HTML. */
  function globe() {
    const ns = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(ns, "svg");
    svg.setAttribute("viewBox", "0 0 16 16");
    svg.setAttribute("width", "11");
    svg.setAttribute("height", "11");
    svg.setAttribute("fill", "none");
    svg.setAttribute("stroke", "currentColor");
    svg.setAttribute("stroke-width", "1.2");
    for (const [tag, attrs] of [
      ["circle", { cx: 8, cy: 8, r: 6.5 }],
      ["ellipse", { cx: 8, cy: 8, rx: 2.8, ry: 6.5 }],
      ["path", { d: "M1.5 8h13M2.6 4.6h10.8M2.6 11.4h10.8" }],
    ]) {
      const shape = document.createElementNS(ns, tag);
      for (const [name, value] of Object.entries(attrs)) shape.setAttribute(name, String(value));
      svg.appendChild(shape);
    }
    return svg;
  }

  /** What fn does to the keys under it, read backwards. A MacBook has no
   *  forward delete, Home, End, Page Up or Page Down key: macOS makes them
   *  out of fn and delete or an arrow, so a page that hears one of them has
   *  heard fn held — the only way it can, since fn on its own sends a page
   *  nothing. Each maps to the key actually pressed with it, which is
   *  tested by the same press.
   *
   *  Asked of `code` and of `key` both (`fnCombo`), because which of the
   *  two carries it is WebKit's to decide: the key's position may arrive
   *  as the delete or arrow that was pressed with only the character
   *  changed, or as the made-up key itself. */
  const FN_COMBOS = {
    Delete: "Backspace",
    Home: "ArrowLeft",
    End: "ArrowRight",
    PageUp: "ArrowUp",
    PageDown: "ArrowDown",
  };

  /** The key fn was held over, when an event says fn was held; otherwise
   *  undefined. A made-up key's `code`, or a pressed key's `code` whose
   *  `key` is the made-up one — `Backspace` arriving as `Delete`. */
  function fnCombo(event) {
    if (FN_COMBOS[event.code]) return FN_COMBOS[event.code];
    const under = FN_COMBOS[event.key];
    return under !== undefined && under === event.code ? under : undefined;
  }

  const MODIFIERS = new Set(["ShiftLeft", "ShiftRight", "ControlLeft", "ControlRight", "AltLeft", "AltRight", "MetaLeft", "MetaRight"]);

  const board = document.getElementById("board");
  const progress = document.getElementById("progress");
  const lastOut = document.getElementById("last");
  const heldOut = document.getElementById("held");
  const chatterOut = document.getElementById("chatter");
  const hint = document.getElementById("focus-hint");

  let layout = "ansi";
  /** Caps Lock has been heard as Lumi's Hyper key rather than as itself. */
  let hyper = false;
  /** Whether Lumi's Hyper key is on, as the extension's code last said —
   *  undefined until it has answered, or when the page is opened outside
   *  Lumi and there is nobody to ask. */
  let hyperOn;
  /** code -> the elements drawing it (ISO's Return is two). */
  let keys = new Map();
  const seen = new Set();
  /** code -> when it went down, for every key held now. */
  const down = new Map();
  /** code -> when it last came up. */
  const lastUp = new Map();
  /** code -> how many presses arrived too soon after a release. */
  const chatter = new Map();
  /** code -> the label drawn for it, for the sentences below the board. */
  let labels = new Map();

  function draw() {
    board.textContent = "";
    keys = new Map();
    labels = new Map();
    const span = (className, content) => {
      const part = document.createElement("span");
      part.className = className;
      if (typeof content === "string") part.textContent = content;
      else part.appendChild(content);
      return part;
    };
    const add = (parent, [code, label, width, options = {}]) => {
      const key = document.createElement("div");
      key.className = "key";
      if (width !== undefined) key.style.flexGrow = String(width);
      if (options.join) key.classList.add(options.join);
      if (options.half) key.classList.add("half");
      if (options.sym) {
        key.classList.add("mod", options.side);
        key.append(span("sym", options.sym), span("word", label));
      } else if (options.globe) {
        key.classList.add("mod", "globe");
        key.append(span("word", label), span("sym", globe()));
      } else if (options.touchId) {
        key.classList.add("touch-id");
      } else {
        key.textContent = label;
        if (label.length <= 1) key.classList.add("center");
      }
      if (code === null) {
        key.classList.add("deaf");
        key.title = `${label} never reaches a web page`;
      } else {
        key.title = code;
        if (!keys.has(code)) keys.set(code, []);
        keys.get(code).push(key);
        if (label && !labels.has(code)) labels.set(code, label);
      }
      parent.appendChild(key);
    };
    LAYOUTS[layout].forEach((row) => {
      const line = document.createElement("div");
      line.className = "row";
      for (const entry of row) {
        if (Array.isArray(entry)) {
          add(line, entry);
        } else {
          const stack = document.createElement("div");
          stack.className = "stack";
          stack.style.flexGrow = String(entry.width);
          for (const [code, label] of entry.stack) add(stack, [code, label]);
          line.appendChild(stack);
        }
      }
      board.appendChild(line);
    });
    for (const button of document.querySelectorAll("[data-layout]")) {
      button.setAttribute("aria-checked", String(button.dataset.layout === layout));
    }
    paint();
  }

  const nameOf = (code) => {
    const label = labels.get(code);
    if (!label || label.length <= 1) return label ? `${label}` : code;
    return code.endsWith("Left") ? `left ${label}` : code.endsWith("Right") ? `right ${label}` : label;
  };

  function paint() {
    for (const [code, elements] of keys) {
      for (const element of elements) {
        element.classList.toggle("seen", seen.has(code));
        element.classList.toggle("down", down.has(code));
        element.classList.toggle("chatter", chatter.has(code));
      }
    }
    const how = document.getElementById("caps-how");
    const showHow = hyperOn !== undefined && !seen.has("CapsLock");
    for (const element of document.querySelectorAll(".caps-how")) element.hidden = !showHow;
    how.textContent = hyperOn
      ? "Lumi's Hyper key has it: tap it on its own, or hold it and press a key no Hyper shortcut uses."
      : "Press and hold it for a moment — macOS ignores a very quick tap on purpose.";
    for (const element of keys.get("Fn") || []) {
      element.title = seen.has("Fn")
        ? "fn works"
        : "press fn — or hold it and press delete or an arrow";
    }
    for (const element of keys.get("CapsLock") || []) {
      element.title = hyper
        ? "Caps Lock works — heard as Lumi's Hyper key"
        : "CapsLock — with Lumi's Hyper key on, hold it and press another key";
    }
    const total = keys.size;
    const covered = [...keys.keys()].filter((code) => seen.has(code)).length;
    progress.textContent =
      covered === total ? `All ${total} keys work` : `${covered} of ${total} keys`;
    heldOut.textContent = down.size ? [...down.keys()].map(nameOf).join(" + ") : "—";
    if (chatter.size === 0) {
      chatterOut.textContent = "None yet";
      chatterOut.className = "";
    } else {
      chatterOut.className = "chatter-list";
      chatterOut.textContent = "";
      [...chatter].forEach(([code, count], index) => {
        if (index) chatterOut.append(", ");
        const name = document.createElement("b");
        name.textContent = nameOf(code);
        chatterOut.append(name, count > 1 ? ` ×${count}` : "");
      });
      chatterOut.append(" — typed twice from one press");
    }
  }

  /** The line under the board: the physical key, the character, and the
   *  modifiers the event carried — the last is what says whether a key
   *  arrived stamped by Lumi's Hyper key, so it is shown rather than
   *  inferred silently. */
  function describe(event) {
    const where = keys.has(event.code) || event.code === "F18" ? "" : " (not on this layout)";
    const key = event.key === " " ? "Space" : event.key;
    const held = [
      event.ctrlKey && "⌃",
      event.altKey && "⌥",
      event.shiftKey && "⇧",
      event.metaKey && "⌘",
    ].filter(Boolean).join("");
    return `${event.code || "?"} · ${key}${held ? ` · ${held}` : ""}${where}`;
  }

  /** Caps Lock is heard once per press — a down turning it on, an up
   *  turning it off — so it is shown as a flash rather than held. */
  function flash(code) {
    seen.add(code);
    down.set(code, performance.now());
    paint();
    setTimeout(() => {
      down.delete(code);
      paint();
    }, 160);
  }

  // Capture, and every key swallowed: Tab would move focus off the board,
  // Space would scroll the pane, ⌘-keys the page can see would act. Only
  // what reaches the page can be tested, and all of it is.
  /** One key going down: counted, lit while held, and checked for chatter
   *  against its own last release. */
  function press(code, event) {
    if (event.repeat) return;
    const now = event.timeStamp;
    if (!down.has(code)) {
      const released = lastUp.get(code);
      if (released !== undefined && bounced(now - released)) {
        chatter.set(code, (chatter.get(code) || 0) + 1);
        if (cleaning) cleanChatter.add(code);
      }
    }
    down.set(code, now);
    seen.add(code);
    if (cleaning) cleanPressed.add(code);
    paint();
  }

  /** Whether a key arrived carrying a modifier no held modifier key explains
   *  — which is what Lumi's Hyper key looks like from here. With it on,
   *  Caps Lock is remapped to F18 below the page and swallowed whole, so its
   *  own press is never heard; what is heard is the next key, stamped with
   *  the modifiers the Hyper key adds. That stamp can only have come from a
   *  held Caps Lock, so it is Caps Lock working. Read off the event rather
   *  than off Lumi's settings, which would cost the `config` capability for
   *  one key. A modifier held down before the page had focus would read the
   *  same way — rare, and a false pass on one key rather than a failure. */
  const hyperStamped = (event) =>
    (event.metaKey && !down.has("MetaLeft") && !down.has("MetaRight")) ||
    (event.ctrlKey && !down.has("ControlLeft") && !down.has("ControlRight")) ||
    (event.altKey && !down.has("AltLeft") && !down.has("AltRight"));

  /** Caps Lock's lock state as the last event reported it, or undefined
   *  before any event has. */
  let capsLocked;

  /** Whether an event is Lumi's Hyper key tapped on its own. With the tap
   *  set to toggle Caps Lock, Lumi flips the lock through IOKit rather than
   *  sending a key, and the flip reaches the page as a key event with no
   *  key at all — `Unidentified`, both code and key. What marks it as Caps
   *  Lock is the lock state having changed across it; a first event, with
   *  nothing to compare, is given the benefit, since nothing else on a
   *  MacBook arrives with no code. */
  function capsFlipped(event) {
    const now = event.getModifierState("CapsLock");
    const unidentified =
      (event.code === "" || event.code === "Unidentified") && event.key === "Unidentified";
    const flipped = unidentified && (capsLocked === undefined || now !== capsLocked);
    capsLocked = now;
    return flipped;
  }

  document.addEventListener(
    "keydown",
    (event) => {
      event.preventDefault();
      const code = event.code;
      lastOut.textContent = describe(event);
      if (capsFlipped(event)) {
        hyper = true;
        lastOut.textContent = "Caps Lock — tapped as Lumi's Hyper key";
        return flash("CapsLock");
      }
      if (code === "CapsLock") return flash(code);
      // No Mac keyboard has an F18 key: Lumi's Hyper key remaps Caps Lock
      // onto it, and an F18 that reaches the page is that remap with nobody
      // swallowing it — Lumi's Hyper key switched off or Lumi not running,
      // the mapping left behind. Either way it is Caps Lock, pressed.
      if (code === "F18") {
        hyper = true;
        lastOut.textContent += " — Caps Lock, remapped by Lumi's Hyper key";
        return flash("CapsLock");
      }
      // fn on its own, should this WebKit ever send it.
      if (code === "Fn" || event.key === "Fn") {
        lastOut.textContent = "fn";
        return flash("Fn");
      }
      const underFn = fnCombo(event);
      if (underFn) {
        const pressed = underFn;
        lastOut.textContent = `fn + ${nameOf(pressed)} — ${event.key}: fn works`;
        flash("Fn");
        return press(pressed, event);
      }
      if (event.repeat) return;
      if (!MODIFIERS.has(code) && hyperStamped(event)) {
        hyper = true;
        lastOut.textContent += " — with Caps Lock as the Hyper key";
        flash("CapsLock");
      }
      press(code, event);
    },
    true,
  );

  document.addEventListener(
    "keyup",
    (event) => {
      event.preventDefault();
      const code = event.code;
      // The lock turning off arrives as an up, the on as a down.
      if (capsFlipped(event)) {
        hyper = true;
        lastOut.textContent = "Caps Lock — tapped as Lumi's Hyper key";
        return flash("CapsLock");
      }
      if (code === "CapsLock") return flash(code);
      if (code === "F18" || code === "Fn") return;
      const released = FN_COMBOS[code] || code;
      // (A pressed key reporting the made-up one as its `key` already has
      // its own `code`, so it needs no translating here.)
      down.delete(released);
      lastUp.set(released, event.timeStamp);
      // macOS sends no key-up for a key released while ⌘ is held, so the
      // ⌘ release is the last word on every key that went down under it —
      // released without a time, so it cannot read as a chatter later.
      if (code === "MetaLeft" || code === "MetaRight") {
        for (const held of [...down.keys()]) {
          if (!MODIFIERS.has(held)) down.delete(held);
        }
      }
      paint();
    },
    true,
  );

  // fn / Globe on its own, relayed by Lumi (`fn-key = true` in the
  // manifest): WebKit sends a page nothing for it, so Lumi's event tap
  // hears it and dispatches `lumi:fn` with `{ down }`. Held and released
  // like any key, so a stuck or bouncing fn shows up the same way.
  //
  // Lumi 1.38 and later also sends each edge as `lumi:key` with code `Fn`,
  // right after this one; once that has been heard, this is left to it,
  // so one press is never counted twice.
  let fnAsKey = false;
  window.addEventListener("lumi:fn", (event) => {
    if (fnAsKey) return;
    const now = performance.now();
    if (event.detail && event.detail.down) {
      lastOut.textContent = "fn";
      press("Fn", { repeat: false, timeStamp: now });
    } else {
      release("Fn", now);
    }
  });

  /** One key coming up: no longer held, and its time kept for the next
   *  press's chatter check. */
  function release(code, now) {
    down.delete(code);
    lastUp.set(code, now);
    paint();
  }

  // Keys Lumi hands the page rather than WebKit, as `lumi:key`:
  //
  // - F1–F12 taken from macOS's shortcuts (`function-keys = true`), so F11
  //   — Show Desktop — tests without the window being swept aside;
  // - fn on its own (`fn-key = true`, Lumi 1.38 and later);
  // - while cleaning, every key on the Mac, the function row's system keys
  //   by their own names (`FN_ROW`).
  //
  // Counted and chatter-checked like any key, timed on the Mac's clock
  // when Lumi says when (`detail.time`, 1.38) and on arrival otherwise.
  window.addEventListener("lumi:key", (event) => {
    const detail = event.detail || {};
    if (typeof detail.code !== "string") return;
    const now = typeof detail.time === "number" ? detail.time : performance.now();
    const named = detail.code;
    const code = FN_ROW[named] || named;
    if (code === "Fn") fnAsKey = true;
    if (cleaning) unlockKeys(code, detail.down === true);
    if (!keys.has(code)) {
      if (detail.down) lastOut.textContent = `${named} (not on this layout)`;
      return;
    }
    if (detail.down) {
      lastOut.textContent = code === named
        ? `${code} · ${cleaning ? "while cleaning" : "taken from macOS by Lumi"}`
        : `${code} · ${named}`;
      // Caps Lock arrives as a press with no hold: it toggles a lock.
      if (code === "CapsLock") return flash(code);
      press(code, { repeat: detail.repeat === true, timeStamp: now });
    } else if (code !== "CapsLock") {
      release(code, now);
    }
  });

  /** Ask the extension's own code what the page cannot know by itself:
   *  whether Lumi's Hyper key is on, and which layout was last chosen. On
   *  load and whenever the page gets the keyboard back, since the person
   *  may have flipped the Hyper key meanwhile — both moments when the page
   *  is in front, which is the only time Lumi lets it call. A refusal
   *  leaves the last answer standing. The layout is taken only until the
   *  person has pressed the switch here, so a late answer cannot undo it. */
  let layoutChosen = false;
  function askState() {
    fetch("/__lumi__/call", { method: "POST", body: JSON.stringify({ kind: "state" }) })
      .then((response) => (response.ok ? response.json() : null))
      .then((answer) => {
        if (!answer) return;
        if (typeof answer.hyperKeyEnabled === "boolean") hyperOn = answer.hyperKeyEnabled;
        if (!layoutChosen && answer.layout in LAYOUTS && answer.layout !== layout) {
          layout = answer.layout;
          draw();
        }
        paint();
      })
      .catch(() => {});
  }

  // Keys held while the page loses focus never send their up here — unless
  // cleaning, when they come from Lumi whatever has focus.
  const focusChanged = () => {
    const focused = document.hasFocus();
    if (focused && hint.hidden === false) askState();
    hint.hidden = focused || cleaning;
    if (!focused && !cleaning && down.size) {
      down.clear();
      paint();
    }
  };
  window.addEventListener("focus", focusChanged);
  window.addEventListener("blur", focusChanged);
  board.addEventListener("mousedown", () => board.focus());
  hint.addEventListener("click", () => board.focus());

  // ----------------------------------------------------------------------
  // Cleaning: Lumi holds every key on the Mac (`PUT /__lumi__/input-hold`)
  // and relays each one here, so the board lights as the keyboard is wiped.
  // The ways out this page offers are its own — the unlock button and esc +
  // right shift held — and both end in a `DELETE`. Lumi keeps ways out of
  // its own besides (the time running out, the same two keys held longer,
  // the screen locking, its menu bar row) and tells the page how it ended
  // with `lumi:input-hold`.
  // ----------------------------------------------------------------------

  const cleanButton = document.getElementById("clean");
  const lockBar = document.getElementById("clean-lock");
  const lockTime = document.getElementById("clean-time");
  const holdButton = document.getElementById("clean-hold");
  const ring = document.getElementById("clean-ring");
  const panel = document.getElementById("clean-panel");
  const ways = document.getElementById("clean-ways");
  const progressLine = document.getElementById("clean-progress");
  const progressFill = document.getElementById("clean-progress-fill");
  const done = document.getElementById("clean-done");

  /** How long to clean for, and whether the trackpad goes too — chosen in
   *  the Settings tab Lumi draws from the manifest's `[[settings]]`, and
   *  kept current by `lumi:settings`. The button only starts. */
  let cleanSeconds = 60;
  let cleanPointer = false;
  /** Whether a hold is on, when it ends at the latest (Unix ms), and how
   *  long it was for — the ring and the line count down the share left. */
  let cleaning = false;
  let cleanUntil = 0;
  let cleanTotal = 1;
  let ticker;
  let shownSeconds;
  /** What was pressed, and what typed twice, during this cleaning. */
  const cleanPressed = new Set();
  const cleanChatter = new Set();

  /** The button's tooltip says what pressing it will do, and where that is
   *  changed. */
  function describeCleaning() {
    const time = cleanSeconds < 60 ? `${cleanSeconds} seconds` : `${cleanSeconds / 60} minute${cleanSeconds === 60 ? "" : "s"}`;
    cleanButton.title = `Lock every key${cleanPointer ? " and the trackpad" : ""} for ${time}. Change it in the Settings tab.`;
  }

  cleanButton.addEventListener("click", async () => {
    done.hidden = true;
    let answer;
    try {
      answer = await fetch("/__lumi__/input-hold", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ seconds: cleanSeconds, pointer: cleanPointer, keys: true }),
      });
    } catch {
      return refuse("Cleaning works only inside Lumi.");
    }
    const body = await answer.text();
    if (answer.status === 404) return refuse("Cleaning needs Lumi 1.38 or later.");
    if (!answer.ok) return refuse(sentence(body));
    let held;
    try {
      held = JSON.parse(body);
    } catch {
      return refuse("Lumi answered in a way this page does not understand.");
    }
    beginCleaning(held);
  });

  /** Lumi's refusal, as a sentence for the line under the board. */
  const sentence = (text) => {
    const said = String(text || "").trim();
    return said ? `${said.charAt(0).toUpperCase()}${said.slice(1)}.`.replace(/\.\.$/, ".") : "Lumi would not lock the keyboard.";
  };

  function refuse(text) {
    done.textContent = text;
    done.classList.add("bad");
    done.hidden = false;
  }

  function beginCleaning(held) {
    cleaning = true;
    cleanUntil = typeof held.until === "number" ? held.until : Date.now() + cleanSeconds * 1000;
    cleanTotal = Math.max(1, cleanUntil - Date.now());
    shownSeconds = undefined;
    cleanPressed.clear();
    cleanChatter.clear();
    down.clear();
    document.body.classList.add("cleaning");
    lockBar.hidden = false;
    progressLine.hidden = false;
    // A locked trackpad cannot press a button, so only the keys are offered.
    const keysOnly = held.pointer === true;
    // Out of sight but keeping its place, so the bar stays the bar's height
    // and the board does not jump.
    holdButton.classList.toggle("unseen", keysOnly);
    holdButton.disabled = keysOnly;
    // The other ways out, beside the ring.
    const key = (name) => {
      const b = document.createElement("b");
      b.textContent = name;
      return b;
    };
    ways.replaceChildren(
      keysOnly ? "Hold " : "Or hold ",
      key("esc"),
      " and ",
      key("right shift"),
      ` together for 2 seconds${keysOnly ? " to unlock" : ""}. Touch ID locks your Mac, which ends cleaning too.`,
    );
    done.hidden = true;
    panel.hidden = false;
    hint.hidden = true;
    tick();
    ticker = setInterval(tick, 250);
    paint();
  }

  /** One step of the countdown, four a second: the ring and the line show
   *  the share of the time left — CSS glides them between steps — the
   *  digits change once a second, and the last ten seconds are drawn in
   *  the warning colour. A timer rather than animation frames, which stop
   *  while the window is covered: the count has to be right whenever the
   *  person looks back. */
  function tick() {
    const leftMs = Math.max(0, cleanUntil - Date.now());
    const share = Math.min(1, leftMs / cleanTotal);
    ring.style.strokeDashoffset = String(100 * (1 - share));
    progressFill.style.transform = `scaleX(${share})`;
    const left = Math.ceil(leftMs / 1000);
    if (left !== shownSeconds) {
      shownSeconds = left;
      lockTime.textContent = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}`;
      for (const part of [lockBar, progressLine, panel]) part.classList.toggle("ending", left <= 10);
    }
  }

  /** Let go — this page's own ways out end here. */
  function unlock() {
    fetch("/__lumi__/input-hold", { method: "DELETE" }).catch(() => {});
  }

  /** How a cleaning ended, by Lumi's `reason`. */
  const ENDINGS = {
    released: "Unlocked.",
    deadline: "Time's up — the keyboard types again.",
    chord: "Unlocked with esc and right shift.",
    menu: "Released from Lumi's menu.",
    locked: "Your Mac locked, so cleaning ended.",
    "secure-input": "Another app took the keyboard for a password field, so cleaning ended.",
    gone: "Cleaning ended.",
  };

  window.addEventListener("lumi:input-hold", (event) => {
    if (!cleaning) return;
    const detail = event.detail || {};
    cleaning = false;
    clearInterval(ticker);
    cancelUnlockKeys();
    cancelHold();
    document.body.classList.remove("cleaning");
    lockBar.hidden = true;
    progressLine.hidden = true;
    panel.hidden = true;
    down.clear();
    const pressed = cleanPressed.size;
    const twice = [...cleanChatter].map(nameOf);
    const counted = pressed === 0
      ? "No key was pressed."
      : `${pressed} ${pressed === 1 ? "key" : "keys"} pressed while cleaning${twice.length ? `; typed twice: ${twice.join(", ")}` : ", none typed twice"}.`;
    done.textContent = `${ENDINGS[detail.reason] || ENDINGS.gone} ${counted}`;
    done.classList.remove("bad");
    done.hidden = false;
    focusChanged();
    paint();
  });

  // Hold to unlock: two seconds pressed, so a palm on the trackpad or a
  // tap-to-click while wiping does not count.
  let holdTimer;
  function cancelHold() {
    clearTimeout(holdTimer);
    holdTimer = undefined;
    holdButton.classList.remove("holding");
  }
  holdButton.addEventListener("pointerdown", (event) => {
    if (!cleaning) return;
    // Captured so sliding off the button while holding still counts as
    // letting go; a pointer that cannot be captured still holds.
    try {
      holdButton.setPointerCapture(event.pointerId);
    } catch {}
    holdButton.classList.add("holding");
    holdTimer = setTimeout(() => {
      cancelHold();
      unlock();
    }, UNLOCK_MS);
  });
  for (const type of ["pointerup", "pointercancel", "lostpointercapture"]) {
    holdButton.addEventListener(type, cancelHold);
  }

  // esc and right shift, held together for two seconds: the way out that
  // needs no trackpad. Two keys in opposite corners, so a cloth across the
  // board does not hold both.
  const unlockDown = new Set();
  let unlockTimer;
  function cancelUnlockKeys() {
    clearTimeout(unlockTimer);
    unlockTimer = undefined;
    unlockDown.clear();
  }
  function unlockKeys(code, isDown) {
    if (code !== "Escape" && code !== "ShiftRight") return;
    if (isDown) unlockDown.add(code);
    else unlockDown.delete(code);
    if (unlockDown.size === 2) {
      if (unlockTimer === undefined) unlockTimer = setTimeout(unlock, UNLOCK_MS);
    } else {
      clearTimeout(unlockTimer);
      unlockTimer = undefined;
    }
  }

  document.getElementById("reset").addEventListener("click", () => {
    seen.clear();
    down.clear();
    lastUp.clear();
    chatter.clear();
    hyper = false;
    lastOut.textContent = "—";
    paint();
    board.focus();
  });

  for (const button of document.querySelectorAll("[data-layout]")) {
    button.addEventListener("click", () => {
      if (button.dataset.layout === layout) return;
      layout = button.dataset.layout;
      layoutChosen = true;
      draw();
      board.focus();
      // Kept for the next visit by the extension's own code. A press is in
      // front, so Lumi lets it call; it fails quietly when the page is
      // opened on its own, outside Lumi, where there is no bridge.
      fetch("/__lumi__/call", {
        method: "POST",
        body: JSON.stringify({ kind: "set-layout", layout }),
      }).catch(() => {});
    });
  }

  draw();
  focusChanged();
  askState();
  /** What the settings say about cleaning: on load, and on every
   *  `lumi:settings` — a change in the Settings tab. */
  function applySettings(settings) {
    if (!settings || typeof settings !== "object") return;
    const seconds = Number(settings["clean-seconds"]);
    if ([30, 60, 120, 300].includes(seconds)) cleanSeconds = seconds;
    cleanPointer = settings["clean-pointer"] === "true";
    describeCleaning();
  }
  window.addEventListener("lumi:settings", (event) => applySettings(event.detail));

  describeCleaning();
  fetch("/__lumi__/settings")
    .then((response) => (response.ok ? response.json() : {}))
    .then(applySettings)
    .catch(() => {});
})();
