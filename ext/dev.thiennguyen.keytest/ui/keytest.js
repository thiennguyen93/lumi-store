// Keyboard Test: light each key of a MacBook keyboard as it is pressed,
// count what has been covered, and catch a key that types twice.
//
// Keys are matched by `KeyboardEvent.code` — the physical position, not
// the character — so the test means the same thing under any input
// source, Vietnamese Telex included. Nothing here calls the extension's
// own code: the one thing kept between visits, the layout, goes through
// the bridge's settings route.

(() => {
  "use strict";

  /** A key re-pressed sooner than this after its release was not
   *  re-pressed by a finger: human double-taps sit well above 60 ms, a
   *  chattering switch bounces an up and a down in a few. */
  const CHATTER_MS = 40;

  // One row per line of keys, each key [code, label, width in units].
  // Every row is fifteen units. A null code is a key no page can hear
  // (fn / Globe, Touch ID), drawn so the keyboard looks like the one
  // under the person's hands, and never counted.
  const fnRow = [
    ["Escape", "esc", 1.5],
    ...Array.from({ length: 12 }, (_, i) => [`F${i + 1}`, `F${i + 1}`, 1]),
    [null, "Touch ID", 1.5],
  ];
  const digits = [
    ...["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"].map((d) => [`Digit${d}`, d, 1]),
    ["Minus", "-", 1],
    ["Equal", "=", 1],
    ["Backspace", "delete", 2],
  ];
  const letters = (row) => [...row].map((c) => [`Key${c}`, c, 1]);
  const bottom = [
    [null, "fn", 1],
    ["ControlLeft", "control", 1],
    ["AltLeft", "option", 1],
    ["MetaLeft", "command", 1.25],
    ["Space", "", 5.5],
    ["MetaRight", "command", 1.25],
    ["AltRight", "option", 1],
    ["ArrowLeft", "←", 1],
    { stack: [["ArrowUp", "↑"], ["ArrowDown", "↓"]], width: 1 },
    ["ArrowRight", "→", 1],
  ];

  const LAYOUTS = {
    ansi: [
      fnRow,
      [["Backquote", "`", 1], ...digits],
      [["Tab", "tab", 1.5], ...letters("QWERTYUIOP"), ["BracketLeft", "[", 1], ["BracketRight", "]", 1], ["Backslash", "\\", 1.5]],
      [["CapsLock", "caps lock", 1.75], ...letters("ASDFGHJKL"), ["Semicolon", ";", 1], ["Quote", "'", 1], ["Enter", "return", 2.25]],
      [["ShiftLeft", "shift", 2.25], ...letters("ZXCVBNM"), ["Comma", ",", 1], ["Period", ".", 1], ["Slash", "/", 1], ["ShiftRight", "shift", 2.75]],
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
      [["Tab", "tab", 1.5], ...letters("QWERTYUIOP"), ["BracketLeft", "[", 1], ["BracketRight", "]", 1], ["Enter", "return", 1.5, "join-down"]],
      [["CapsLock", "caps lock", 1.75], ...letters("ASDFGHJKL"), ["Semicolon", ";", 1], ["Quote", "'", 1], ["Backslash", "\\", 1], ["Enter", "", 1.25, "join-up"]],
      [["ShiftLeft", "shift", 1.25], ["Backquote", "`", 1], ...letters("ZXCVBNM"), ["Comma", ",", 1], ["Period", ".", 1], ["Slash", "/", 1], ["ShiftRight", "shift", 2.75]],
      bottom,
    ],
  };

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
    const add = (parent, [code, label, width, join], grow) => {
      const key = document.createElement("div");
      key.className = "key";
      if (join) key.classList.add(join);
      if (label.length <= 1) key.classList.add("center");
      if (grow !== undefined) key.style.flexGrow = String(grow);
      key.textContent = label;
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
    LAYOUTS[layout].forEach((row, index) => {
      const line = document.createElement("div");
      line.className = index === 0 ? "row short" : "row";
      for (const entry of row) {
        if (Array.isArray(entry)) {
          add(line, entry, entry[2]);
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

  document.addEventListener(
    "keydown",
    (event) => {
      event.preventDefault();
      const code = event.code;
      lastOut.textContent = describe(event);
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
      if (event.repeat) return;
      if (!MODIFIERS.has(code) && hyperStamped(event)) {
        hyper = true;
        lastOut.textContent += " — with Caps Lock as the Hyper key";
        flash("CapsLock");
      }
      const now = event.timeStamp;
      if (!down.has(code)) {
        const released = lastUp.get(code);
        if (released !== undefined && now - released < CHATTER_MS) {
          chatter.set(code, (chatter.get(code) || 0) + 1);
        }
      }
      down.set(code, now);
      seen.add(code);
      paint();
    },
    true,
  );

  document.addEventListener(
    "keyup",
    (event) => {
      event.preventDefault();
      const code = event.code;
      if (code === "CapsLock") return flash(code);
      if (code === "F18") return;
      down.delete(code);
      lastUp.set(code, event.timeStamp);
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

  // Keys held while the page loses focus never send their up here.
  const focusChanged = () => {
    const focused = document.hasFocus();
    hint.hidden = focused;
    if (!focused && down.size) {
      down.clear();
      paint();
    }
  };
  window.addEventListener("focus", focusChanged);
  window.addEventListener("blur", focusChanged);
  board.addEventListener("mousedown", () => board.focus());

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
      draw();
      board.focus();
      // Kept for the next visit. Fails quietly when the page is opened on
      // its own, outside Lumi, where there is no bridge.
      fetch("/__lumi__/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ layout }),
      }).catch(() => {});
    });
  }

  draw();
  focusChanged();
  fetch("/__lumi__/settings")
    .then((response) => (response.ok ? response.json() : {}))
    .then((settings) => {
      if (settings.layout in LAYOUTS && settings.layout !== layout) {
        layout = settings.layout;
        draw();
      }
    })
    .catch(() => {});
})();
