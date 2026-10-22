// The switch's own key (`[[shortcut]]`) as a row: read, recorded and written
// from a page. The Settings tab's Shortcut row and the Welcome's shortcut
// step both draw it with `keyRow`, so the two never tell it differently.
// Lumi keeps the key in every profile; these are the one place it is
// changed, Lumi's Shortcuts tab being hidden (manifest.toml). A plain
// script, loaded before the page's own, which gives it the row's line, the
// place for its recorder and the page's language.

// The words the row draws, in both languages. `{name}` is filled in when
// drawn.
const KEY_WORDS = {
  vi: {
    keyLooking: "Đang xem phím tắt…",
    keyNone: "Lumi chưa cho biết phím của tiện ích này.",
    keyReady: "Bấm vào phím để đổi.",
    keyTap: "Nhấn {keys} cùng lúc rồi thả. Bấm vào phím để đổi.",
    keyInstead: "Thay cho {declared}. Bấm vào phím để đổi.",
    keysOff: "Phím tắt của Lumi đang tắt, nên phím này chưa chạy.",
    keyTaken: "{holder} đang dùng {declared}, nên Lumi chưa gán phím này.",
    keyInvalid: "Lumi không gán được {declared}.",
    keyUnset: "Chưa có phím. Bấm Ghi phím để chọn.",
    keyListening: "Nhấn tổ hợp phím mới · Esc để huỷ",
    keyNeedsMod: "{key}: thêm ⌘, ⌥ hoặc ⌃, chỉ một phím thì phím đó sẽ không gõ ra chữ nữa.",
    keyHeld: "{key} đang được dùng cho {holders}. Vẫn lấy?",
    keyHeldNot: "{key} đang thuộc về {holders}, hãy chọn phím khác.",
    keyKeep: "Giữ như cũ",
    keyTake: "Lấy phím này",
    keyRecord: "Ghi phím",
    keyPress: "Nhấn phím…",
    keyUse: "Dùng {declared}",
    keyClear: "Xoá",
    keyAria: "Phím tắt {key}, bấm để đổi",
    keyAriaNone: "Chưa có phím tắt, bấm để ghi",
    keyAriaListening: "Nhấn phím tắt mới, hoặc Esc",
    holderRow: "“{name}” trong hồ sơ {profile}",
    holderRowUnnamed: "một phím tắt trong hồ sơ {profile}",
    holderApp: "{label} của Lumi",
    holderExtension: "{command} của {extension}",
    and: " và ",
  },
  en: {
    keyLooking: "Looking up the shortcut…",
    keyNone: "Lumi has not told this extension its key.",
    keyReady: "Click the key to change it.",
    keyTap: "Press {keys} together and let go. Click the key to change it.",
    keyInstead: "Instead of {declared}. Click the key to change it.",
    keysOff: "Shortcuts are switched off in Lumi, so this key does nothing yet.",
    keyTaken: "{holder} already uses {declared}, so Lumi left it unset.",
    keyInvalid: "Lumi could not set up {declared}.",
    keyUnset: "No key yet. Click Record to choose one.",
    keyListening: "Press the new shortcut · Esc to cancel",
    keyNeedsMod: "{key}: add ⌘, ⌥ or ⌃, on its own this would take the key away from typing.",
    keyHeld: "{key} is used by {holders}. Take it anyway?",
    keyHeldNot: "{key} belongs to {holders}. Pick another key.",
    keyKeep: "Keep theirs",
    keyTake: "Take it",
    keyRecord: "Record",
    keyPress: "Press keys…",
    keyUse: "Use {declared}",
    keyClear: "Clear",
    keyAria: "Shortcut {key}, click to change",
    keyAriaNone: "No shortcut, click to record one",
    keyAriaListening: "Press the new shortcut, or Esc",
    holderRow: "“{name}” in the {profile} profile",
    holderRowUnnamed: "a shortcut in the {profile} profile",
    holderApp: "Lumi's own {label}",
    holderExtension: "{extension}'s {command}",
    and: " and ",
  },
};

// The default key, fn and ⇧ pressed together and let go (Lumi 1.61.0's
// modifier tap; the manifest's `[[shortcut]]`). Offered by a link wherever
// the key is another, since a page's recorder cannot hear fn: a person who
// set ⌃⇧V, or kept it from before the default was this, gets back here by a
// press.
const FN_SHIFT = "Tap+Fn+Shift";
const TAP_GLYPHS = { Fn: "fn", Ctrl: "⌃", Alt: "⌥", Shift: "⇧", Super: "⌘" };
const isTap = (accelerator) => accelerator.startsWith("Tap+");

// An accelerator as Lumi writes one (`Ctrl+Shift+KeyV`), one key cap each,
// in macOS's glyphs and order. A tap of modifiers (`Tap+Fn+Shift`, pressed
// together and let go) is its modifiers alone, fn first, as Lumi draws it.
function capsOf(accelerator) {
  if (isTap(accelerator)) {
    const held = accelerator.split("+").slice(1).map((part) => TAP_GLYPHS[part] || part);
    return ["fn", "⌃", "⌥", "⇧", "⌘"].filter((cap) => held.includes(cap));
  }
  const parts = accelerator.split("+");
  const key = parts.pop() || "";
  const glyph = { Ctrl: "⌃", Control: "⌃", Alt: "⌥", Option: "⌥", Shift: "⇧", Super: "⌘", Cmd: "⌘", Command: "⌘" };
  const mods = new Set(parts.map((part) => glyph[part] || part));
  const name = /^Key([A-Z])$/.exec(key)?.[1] ?? /^Digit([0-9])$/.exec(key)?.[1] ?? key;
  return [...["⌃", "⌥", "⇧", "⌘"].filter((mod) => mods.has(mod)), name];
}

// A tap reads "fn ⇧", its two keys apart, where a chord reads "⌃⇧V" as one.
const glyphs = (accelerator) => capsOf(accelerator).join(isTap(accelerator) ? " " : "");

// One `<kbd>` for each of `accelerator`'s key caps.
const kbdsOf = (accelerator) =>
  capsOf(accelerator).map((cap) => {
    const kbd = document.createElement("kbd");
    kbd.textContent = cap;
    return kbd;
  });

// The combination a press makes, as Lumi's recorder writes it, or null for a
// key no global shortcut can end on — a modifier still being held.
function acceleratorOf(event) {
  const key = /^(Key[A-Z]|Digit[0-9]|Space|F([1-9]|1[0-2]))$/.test(event.code) ? event.code : null;
  if (!key) return null;
  const mods = [event.ctrlKey && "Ctrl", event.altKey && "Alt", event.shiftKey && "Shift", event.metaKey && "Super"].filter(Boolean);
  return [...mods, key].join("+");
}

const fill = (text, values) => text.replace(/\{(\w+)\}/g, (all, name) => (name in values ? values[name] : all));

// The row: `line` for what Lumi made of the key at install, or of the last
// press, and `recorder` for the key itself, which a click records again.
// `language()` is the page's display language; `changed()` is told whenever
// the key Lumi holds may have changed, after a read or a write.
function keyRow({ line, recorder, language, changed = () => {} }) {
  // `ess` in `GET /__lumi__/shortcuts`, the toggle's: `undefined` while it
  // is read, `null` when Lumi has none to tell.
  let own;
  // Lumi's Shortcuts switch, which every global key waits on.
  let shortcutsOn = true;
  let recording = false;
  let busy = false;
  // Why the last press or write did not land, or "".
  let said = "";
  // A key somebody holds, pressed here: offered to take, or not.
  let held = null;

  const words = () => KEY_WORDS[language()];

  async function read() {
    try {
      const answer = await fetch("/__lumi__/shortcuts");
      if (!answer.ok) throw new Error();
      const all = await answer.json();
      shortcutsOn = all.on !== false;
      own = (all.ess || []).find((one) => one.command === "toggle") || null;
    } catch {
      own = null;
    }
    draw();
    changed();
  }

  // Arm `key`, or clear it with null; `replace` takes it off whoever holds
  // it. A 409 is the key being somebody's: offered to take when Lumi allows
  // it.
  async function write(key, replace = false) {
    busy = true;
    said = "";
    draw();
    try {
      const answer = await fetch("/__lumi__/shortcuts", { method: "PUT", body: JSON.stringify({ command: "toggle", key, replace }) });
      const body = await answer.text();
      if (answer.status === 409) {
        held = { key, holders: JSON.parse(body).holders || [] };
      } else if (!answer.ok) {
        said = body || `Lumi answered ${answer.status}`;
        held = null;
      } else {
        own = JSON.parse(body);
        held = null;
      }
    } catch (err) {
      said = err instanceof Error ? err.message : String(err);
    } finally {
      busy = false;
      draw();
      changed();
    }
  }

  // Who holds a key, in the page's language, from Lumi's description of them
  // rather than Lumi's own English sentence.
  function holdersText(holders) {
    const w = words();
    const names = holders.map((holder) => {
      if (holder.kind === "shortcut") {
        return holder.name
          ? fill(w.holderRow, { name: holder.name, profile: holder.profileName })
          : fill(w.holderRowUnnamed, { profile: holder.profileName });
      }
      if (holder.kind === "app") return fill(w.holderApp, { label: holder.label });
      return fill(w.holderExtension, { command: holder.commandLabel, extension: holder.extensionName });
    });
    return names.length <= 1 ? names[0] || "" : names.slice(0, -1).join(", ") + w.and + names[names.length - 1];
  }

  // While recording, Lumi lets go of every global shortcut, so the
  // combination pressed — even one something holds, the toggle's own —
  // reaches this page rather than running. Lumi ends that itself when the
  // page loses the keyboard or after 30 seconds, and says so with
  // `lumi:shortcut-recording-ended`.
  function take(event) {
    event.preventDefault();
    event.stopPropagation();
    if (event.key === "Escape") {
      stop();
      return;
    }
    const got = acceleratorOf(event);
    if (!got) return;
    if (!/(^|\+)(Ctrl|Alt|Super)\+/.test(got)) {
      said = fill(words().keyNeedsMod, { key: glyphs(got) });
      draw();
      return;
    }
    stop();
    void write(got);
  }

  async function record() {
    said = "";
    held = null;
    recording = true;
    window.addEventListener("keydown", take, true);
    window.addEventListener("lumi:shortcut-recording-ended", stop);
    draw();
    const answer = await fetch("/__lumi__/shortcut-recording", { method: "POST" }).catch(() => null);
    if (answer && !answer.ok && answer.status !== 404 && recording) {
      said = (await answer.text()) || `Lumi answered ${answer.status}`;
      stop();
    }
  }

  function stop() {
    if (!recording) return;
    recording = false;
    window.removeEventListener("keydown", take, true);
    window.removeEventListener("lumi:shortcut-recording-ended", stop);
    void fetch("/__lumi__/shortcut-recording", { method: "DELETE" }).catch(() => {});
    draw();
  }

  function link(label, onclick) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "link";
    button.disabled = busy;
    button.textContent = label;
    button.addEventListener("click", onclick);
    return button;
  }

  function draw() {
    const w = words();
    line.classList.remove("bad");
    if (own === undefined || own === null) {
      line.textContent = own === undefined ? w.keyLooking : w.keyNone;
      recorder.replaceChildren();
      return;
    }
    const declared = glyphs(own.declared);
    if (recording) {
      line.textContent = w.keyListening;
    } else if (held) {
      const key = glyphs(held.key);
      const holders = holdersText(held.holders);
      if (held.holders.length > 0 && held.holders.every((holder) => holder.kind !== "extension")) {
        line.replaceChildren(
          fill(w.keyHeld, { key, holders }) + " ",
          link(w.keyKeep, () => {
            held = null;
            draw();
          }),
          " · ",
          link(w.keyTake, () => void write(held.key, true)),
        );
      } else {
        line.textContent = fill(w.keyHeldNot, { key, holders });
        line.classList.add("bad");
      }
    } else if (said) {
      line.textContent = said;
      line.classList.add("bad");
    } else if (own.key && isTap(own.key) && shortcutsOn) {
      line.textContent = fill(w.keyTap, { keys: glyphs(own.key) });
    } else if (own.key) {
      line.textContent = !shortcutsOn ? w.keysOff : own.key === own.declared ? w.keyReady : fill(w.keyInstead, { declared });
      line.classList.toggle("bad", !shortcutsOn);
    } else if (own.state === "taken" && own.holder) {
      line.textContent = fill(w.keyTaken, { holder: holdersText([own.holder]), declared });
      line.classList.add("bad");
    } else if (own.state === "invalid") {
      line.textContent = fill(w.keyInvalid, { declared });
      line.classList.add("bad");
    } else {
      line.textContent = w.keyUnset;
    }

    const parts = [];
    if (!recording && own.key !== own.declared) parts.push(link(fill(w.keyUse, { declared }), () => void write(own.declared)));
    if (!recording && own.key !== FN_SHIFT && own.declared !== FN_SHIFT) {
      parts.push(link(fill(w.keyUse, { declared: glyphs(FN_SHIFT) }), () => void write(FN_SHIFT)));
    }
    if (!recording && own.key) parts.push(link(w.keyClear, () => void write(null)));
    const keys = document.createElement("button");
    keys.type = "button";
    keys.disabled = busy;
    keys.className = recording ? "keycaps recording" : own.key ? "keycaps" : "keycaps unset";
    keys.setAttribute("aria-label", recording ? w.keyAriaListening : own.key ? fill(w.keyAria, { key: glyphs(own.key) }) : w.keyAriaNone);
    if (recording || !own.key) {
      const label = document.createElement("span");
      label.className = "listening";
      label.textContent = recording ? w.keyPress : w.keyRecord;
      keys.append(label);
    } else {
      keys.append(...kbdsOf(own.key));
    }
    keys.addEventListener("click", () => (recording ? stop() : void record()));
    parts.push(keys);
    recorder.replaceChildren(...parts);
  }

  return {
    read,
    draw,
    stop,
    // The key armed for the switch, or null: none, or none told.
    get key() {
      return (own && own.key) || null;
    },
  };
}
