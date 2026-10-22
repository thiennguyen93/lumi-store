// The Settings tab (settings.html): reads the settings from Lumi, draws them
// in the display language the person chose, and saves each change as it is
// made. An extension page may run no inline script (its CSP is
// `default-src 'self'`), so this is a file of its own.

// Every word the page draws, in both languages. The two language names on the
// language control are not here: each is always written in its own language,
// so somebody who cannot read the one on screen still finds theirs.
const WORDS = {
  vi: {
    generalTitle: "Chung",
    langName: "Ngôn ngữ hiển thị",
    langOther: "Display language",
    lookName: "Giao diện popover",
    lookSays: "Khung mở ra khi bấm V hoặc E trên menu bar.",
    lookSystem: "Hệ thống",
    lookLight: "Sáng",
    lookDark: "Tối",
    shortcutTitle: "Phím tắt",
    keyName: "Bật hoặc tắt gõ tiếng Việt",
    keyLooking: "Đang xem phím tắt…",
    keyNone: "Lumi chưa cho biết phím của tiện ích này.",
    keyReady: "Bấm vào phím để đổi.",
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
    typingTitle: "Gõ phím",
    methodName: "Kiểu gõ",
    toneName: "Đặt dấu kiểu mới",
    toneSays: "hoà, thuý thay vì hòa, thúy.",
    escName: "Esc trả lại phím đã gõ",
    escSays: "Nhấn Esc ngay sau một từ để lấy lại đúng các phím: tiếng → {keys}.",
    engName: "Giữ nguyên từ tiếng Anh",
    engSays: "Những từ như “with” hay “text” được để nguyên như bạn gõ.",
    appName: "Nhớ bật hay tắt cho từng ứng dụng",
    appSays: "Mỗi ứng dụng giữ lựa chọn riêng.",
    foot: "Bật hoặc tắt gõ tiếng Việt từ menu bar của Lumi, hoặc bằng phím tắt ở trên.",
  },
  en: {
    generalTitle: "General",
    langName: "Display language",
    langOther: "Ngôn ngữ hiển thị",
    lookName: "Popover appearance",
    lookSays: "What opens when you click the V or E in the menu bar.",
    lookSystem: "System",
    lookLight: "Light",
    lookDark: "Dark",
    shortcutTitle: "Shortcut",
    keyName: "Switch Vietnamese typing on or off",
    keyLooking: "Looking up the shortcut…",
    keyNone: "Lumi has not told this extension its key.",
    keyReady: "Click the key to change it.",
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
    typingTitle: "Typing",
    methodName: "Typing method",
    toneName: "Place tone marks the modern way",
    toneSays: "hoà, thuý instead of hòa, thúy.",
    escName: "Escape gives back the keys",
    escSays: "Press Escape right after a word to get back the keys you typed: tiếng → {keys}.",
    engName: "Keep English words as typed",
    engSays: "Words like “with” and “text” stay the way you typed them.",
    appName: "Remember on or off for each app",
    appSays: "Each app keeps its own choice.",
    foot: "Switch Vietnamese typing on or off from Lumi's menu bar, or with the shortcut above.",
  },
};

// The keys that type “tiếng” in each method, for the Escape row's example.
const TYPED = { telex: "tieengs", vni: "tie61ng" };

// What Lumi holds, read the way the component reads it (`Settings::from_json`
// in src/lib.rs): every value arrives as text, a switch is on unless it says
// "false", and anything unknown falls back to the manifest's default.
function fromLumi(raw) {
  const value = (name) => (raw && raw[name] != null ? String(raw[name]) : "");
  const flag = (name, otherwise) => (value(name) === "" ? otherwise : value(name) !== "false");
  return {
    language: value("language") === "en" ? "en" : "vi",
    method: value("method") === "vni" ? "vni" : "telex",
    modernTone: flag("modernTone", true),
    escRestore: flag("escRestore", true),
    englishRestore: flag("englishRestore", false),
    perApp: flag("perApp", true),
    popoverAppearance: ["light", "dark"].includes(value("popoverAppearance")) ? value("popoverAppearance") : "system",
  };
}

let state = fromLumi({});

// The number of the newest read: an answer to an older one is dropped, so a
// save made meanwhile is never undone by a read that left before it.
let asked = 0;

async function reread() {
  const mine = ++asked;
  let raw = {};
  try {
    const answer = await fetch("/__lumi__/settings");
    if (answer.ok) raw = await answer.json();
  } catch {
    // Lumi out of reach: the defaults stand, and the next save asks again.
  }
  if (mine !== asked) return;
  state = fromLumi(raw);
  draw();
}

// The menu bar row is the component's to draw, in the display language, and
// nothing tells the component its settings changed: so it is asked to draw
// the row again (`run_ui`, `LANGUAGE_CHANGED` in src/lib.rs) once the new
// language is stored. A refusal leaves the row as it was until the next
// redraw — the switch moving, another app in front — which reads it anew.
function redrawMenu() {
  return fetch("/__lumi__/call", { method: "POST", body: "language" }).catch(() => {});
}

// The popover's look is Lumi's to put on its window (`lumi::set_theme`), so
// the component is asked to, once the new look is stored (`APPEARANCE_CHANGED`
// in src/lib.rs) — at once if the popover is up.
function restyle() {
  return fetch("/__lumi__/call", { method: "POST", body: "appearance" }).catch(() => {});
}

// What the component is told after a save of `name`, if anything.
const AFTER_SAVE = { language: redrawMenu, popoverAppearance: restyle };

// One change, drawn at once and saved as text; then read back, so a save
// Lumi refused — the extension switched off meanwhile — shows what stands.
function save(name, value) {
  asked++;
  state = { ...state, [name]: value };
  draw();
  fetch("/__lumi__/settings", { method: "PUT", body: JSON.stringify({ [name]: String(value) }), keepalive: true })
    .then(() => AFTER_SAVE[name]?.())
    .catch(() => {})
    .finally(() => void reread());
}

function draw() {
  const words = WORDS[state.language];
  document.documentElement.lang = state.language;
  for (const el of document.querySelectorAll("[data-t]")) {
    el.textContent = words[el.dataset.t].replace("{keys}", TYPED[state.method]);
  }
  for (const group of document.querySelectorAll("[data-group]")) {
    for (const option of group.querySelectorAll('[role="radio"]')) {
      const on = state[group.dataset.group] === option.dataset.value;
      option.setAttribute("aria-checked", String(on));
      option.tabIndex = on ? 0 : -1;
    }
  }
  for (const row of document.querySelectorAll("[data-switch]")) {
    row.setAttribute("aria-checked", String(state[row.dataset.switch]));
  }
  // Shown only once there is something true to show: drawn before the first
  // read, somebody who chose English would see the Vietnamese defaults flash.
  drawKey();
  document.querySelector(".settings").hidden = false;
}

for (const group of document.querySelectorAll("[data-group]")) {
  const name = group.dataset.group;
  const options = [...group.querySelectorAll('[role="radio"]')];
  for (const option of options) {
    option.addEventListener("click", () => {
      if (state[name] !== option.dataset.value) save(name, option.dataset.value);
    });
  }
  // The arrow keys move the choice, the way a radio group does, and the focus
  // follows it.
  group.addEventListener("keydown", (e) => {
    const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
    if (!step) return;
    e.preventDefault();
    const at = (options.findIndex((o) => o.dataset.value === state[name]) + step + options.length) % options.length;
    save(name, options[at].dataset.value);
    options[at].focus();
  });
}

for (const row of document.querySelectorAll("[data-switch]")) {
  row.addEventListener("click", () => save(row.dataset.switch, !state[row.dataset.switch]));
}

// ---- The shortcut ---------------------------------------------------------

// The toggle's own key (`[[shortcut]]`) as Lumi holds it — `ess` in
// `GET /__lumi__/shortcuts`: `undefined` while it is read, `null` when Lumi
// has none to tell. Lumi keeps it in every profile; this row is the one place
// it is changed, Lumi's Shortcuts tab being hidden (manifest.toml).
let own;
// Lumi's Shortcuts switch, which every global key waits on.
let shortcutsOn = true;
let recording = false;
let busy = false;
// Why the last press or write did not land, or "".
let said = "";
// A key somebody holds, pressed here: offered to take, or not.
let held = null;

async function readKey() {
  try {
    const answer = await fetch("/__lumi__/shortcuts");
    if (!answer.ok) throw new Error();
    const all = await answer.json();
    shortcutsOn = all.on !== false;
    own = (all.ess || []).find((one) => one.command === "toggle") || null;
  } catch {
    own = null;
  }
  drawKey();
}

// Arm `key`, or clear it with null; `replace` takes it off whoever holds it.
// A 409 is the key being somebody's: offered to take when Lumi allows it.
async function write(key, replace = false) {
  busy = true;
  said = "";
  drawKey();
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
    drawKey();
  }
}

// An accelerator as Lumi writes one (`Ctrl+Shift+KeyV`), one key cap each,
// in macOS's glyphs and order.
function capsOf(accelerator) {
  const parts = accelerator.split("+");
  const key = parts.pop() || "";
  const glyph = { Ctrl: "⌃", Control: "⌃", Alt: "⌥", Option: "⌥", Shift: "⇧", Super: "⌘", Cmd: "⌘", Command: "⌘" };
  const mods = new Set(parts.map((part) => glyph[part] || part));
  const name = /^Key([A-Z])$/.exec(key)?.[1] ?? /^Digit([0-9])$/.exec(key)?.[1] ?? key;
  return [...["⌃", "⌥", "⇧", "⌘"].filter((mod) => mods.has(mod)), name];
}

const glyphs = (accelerator) => capsOf(accelerator).join("");

// The combination a press makes, as Lumi's recorder writes it, or null for a
// key no global shortcut can end on — a modifier still being held.
function acceleratorOf(event) {
  const key = /^(Key[A-Z]|Digit[0-9]|Space|F([1-9]|1[0-2]))$/.test(event.code) ? event.code : null;
  if (!key) return null;
  const mods = [event.ctrlKey && "Ctrl", event.altKey && "Alt", event.shiftKey && "Shift", event.metaKey && "Super"].filter(Boolean);
  return [...mods, key].join("+");
}

// Who holds a key, in this page's language, from Lumi's description of them
// rather than Lumi's own English sentence.
function holdersText(holders) {
  const words = WORDS[state.language];
  const fill = (text, values) => text.replace(/\{(\w+)\}/g, (all, name) => (name in values ? values[name] : all));
  const names = holders.map((holder) => {
    if (holder.kind === "shortcut") {
      return holder.name
        ? fill(words.holderRow, { name: holder.name, profile: holder.profileName })
        : fill(words.holderRowUnnamed, { profile: holder.profileName });
    }
    if (holder.kind === "app") return fill(words.holderApp, { label: holder.label });
    return fill(words.holderExtension, { command: holder.commandLabel, extension: holder.extensionName });
  });
  return names.length <= 1 ? names[0] || "" : names.slice(0, -1).join(", ") + words.and + names[names.length - 1];
}

// While recording, Lumi lets go of every global shortcut, so the combination
// pressed — even one something holds, ⌃⇧V itself — reaches this page rather
// than running. Lumi ends that itself when the page loses the keyboard or
// after 30 seconds, and says so with `lumi:shortcut-recording-ended`.
function take(event) {
  event.preventDefault();
  event.stopPropagation();
  if (event.key === "Escape") {
    stopRecording();
    return;
  }
  const got = acceleratorOf(event);
  if (!got) return;
  if (!/(^|\+)(Ctrl|Alt|Super)\+/.test(got)) {
    said = WORDS[state.language].keyNeedsMod.replace("{key}", glyphs(got));
    drawKey();
    return;
  }
  stopRecording();
  void write(got);
}

async function startRecording() {
  said = "";
  held = null;
  recording = true;
  window.addEventListener("keydown", take, true);
  window.addEventListener("lumi:shortcut-recording-ended", stopRecording);
  drawKey();
  const answer = await fetch("/__lumi__/shortcut-recording", { method: "POST" }).catch(() => null);
  if (answer && !answer.ok && answer.status !== 404 && recording) {
    said = (await answer.text()) || `Lumi answered ${answer.status}`;
    stopRecording();
  }
}

function stopRecording() {
  if (!recording) return;
  recording = false;
  window.removeEventListener("keydown", take, true);
  window.removeEventListener("lumi:shortcut-recording-ended", stopRecording);
  void fetch("/__lumi__/shortcut-recording", { method: "DELETE" }).catch(() => {});
  drawKey();
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

// The row's line and its recorder: what Lumi made of the key at install, or
// of the last press, and the key itself, which a click records again.
function drawKey() {
  const words = WORDS[state.language];
  const fill = (text, values) => text.replace(/\{(\w+)\}/g, (all, name) => (name in values ? values[name] : all));
  const line = document.getElementById("key-says");
  const recorder = document.getElementById("recorder");
  line.classList.remove("bad");
  if (own === undefined || own === null) {
    line.textContent = own === undefined ? words.keyLooking : words.keyNone;
    recorder.replaceChildren();
    return;
  }
  const declared = glyphs(own.declared);
  if (recording) {
    line.textContent = words.keyListening;
  } else if (held) {
    const key = glyphs(held.key);
    const holders = holdersText(held.holders);
    if (held.holders.length > 0 && held.holders.every((holder) => holder.kind !== "extension")) {
      line.replaceChildren(
        fill(words.keyHeld, { key, holders }) + " ",
        link(words.keyKeep, () => {
          held = null;
          drawKey();
        }),
        " · ",
        link(words.keyTake, () => void write(held.key, true)),
      );
    } else {
      line.textContent = fill(words.keyHeldNot, { key, holders });
      line.classList.add("bad");
    }
  } else if (said) {
    line.textContent = said;
    line.classList.add("bad");
  } else if (own.key) {
    line.textContent = !shortcutsOn ? words.keysOff : own.key === own.declared ? words.keyReady : fill(words.keyInstead, { declared });
    line.classList.toggle("bad", !shortcutsOn);
  } else if (own.state === "taken" && own.holder) {
    line.textContent = fill(words.keyTaken, { holder: holdersText([own.holder]), declared });
    line.classList.add("bad");
  } else if (own.state === "invalid") {
    line.textContent = fill(words.keyInvalid, { declared });
    line.classList.add("bad");
  } else {
    line.textContent = words.keyUnset;
  }

  const parts = [];
  if (!recording && own.key !== own.declared) parts.push(link(fill(words.keyUse, { declared }), () => void write(own.declared)));
  if (!recording && own.key) parts.push(link(words.keyClear, () => void write(null)));
  const keys = document.createElement("button");
  keys.type = "button";
  keys.disabled = busy;
  keys.className = recording ? "keycaps recording" : own.key ? "keycaps" : "keycaps unset";
  keys.setAttribute("aria-label", recording ? words.keyAriaListening : own.key ? fill(words.keyAria, { key: glyphs(own.key) }) : words.keyAriaNone);
  if (recording || !own.key) {
    const label = document.createElement("span");
    label.className = "listening";
    label.textContent = recording ? words.keyPress : words.keyRecord;
    keys.append(label);
  } else {
    keys.append(
      ...capsOf(own.key).map((cap) => {
        const kbd = document.createElement("kbd");
        kbd.textContent = cap;
        return kbd;
      }),
    );
  }
  keys.addEventListener("click", () => (recording ? stopRecording() : void startRecording()));
  parts.push(keys);
  recorder.replaceChildren(...parts);
}

// Changed elsewhere while the tab is up — a profile switch bringing other
// values: Lumi tells every page of ours.
window.addEventListener("lumi:settings", (event) => {
  asked++;
  const before = state.language;
  const look = state.popoverAppearance;
  state = fromLumi(event.detail || {});
  draw();
  if (state.language !== before) void redrawMenu();
  if (state.popoverAppearance !== look) void restyle();
});

// A preview outside Lumi is told its theme on the URL, as Lumi tells a pane
// page; inside Lumi the embedding script has already written it.
const theme = new URLSearchParams(location.search).get("theme");
if ((theme === "light" || theme === "dark") && !document.documentElement.dataset.theme) {
  document.documentElement.dataset.theme = theme;
}

void reread();
void readKey();
