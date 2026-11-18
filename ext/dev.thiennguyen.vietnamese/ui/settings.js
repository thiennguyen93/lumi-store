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
    iconName: "Biểu tượng trên menu bar",
    iconLetter: "Chữ V/E",
    iconOutlined: "V/E có viền",
    iconBoxed: "V/E trong ô đặc",
    lookName: "Giao diện popover",
    lookSays: "Khung mở ra khi bấm V hoặc E trên menu bar.",
    lookSystem: "Hệ thống",
    lookLight: "Sáng",
    lookDark: "Tối",
    shortcutTitle: "Phím tắt",
    keyName: "Bật hoặc tắt gõ tiếng Việt",
    typingTitle: "Gõ phím",
    methodName: "Kiểu gõ",
    toneName: "Đặt dấu kiểu mới",
    toneSays: "hoà, thuý thay vì hòa, thúy.",
    escName: "Esc trả lại phím đã gõ",
    escSays: "Nhấn Esc ngay sau một từ để lấy lại đúng các phím: tiếng → {keys}.",
    engName: "Giữ nguyên từ tiếng Anh",
    engSays: "Những từ như “with” hay “text” được để nguyên như bạn gõ.",
    capName: "Tự viết hoa đầu câu",
    capSays: "Sau dấu chấm, chấm than, chấm hỏi hay xuống dòng: “ok. ban” thành “ok. Ban”.",
    appName: "Nhớ bật hay tắt cho từng ứng dụng",
    appSays: "Mỗi ứng dụng giữ lựa chọn riêng.",
    soundName: "Âm báo khi chuyển",
    soundSays: "Một tiếng ngắn khi bật hoặc tắt gõ tiếng Việt.",
  },
  en: {
    generalTitle: "General",
    langName: "Display language",
    langOther: "Ngôn ngữ hiển thị",
    iconName: "Menu bar icon",
    iconLetter: "V or E",
    iconOutlined: "V or E with a border",
    iconBoxed: "V or E in a filled box",
    lookName: "Popover appearance",
    lookSays: "What opens when you click the V or E in the menu bar.",
    lookSystem: "System",
    lookLight: "Light",
    lookDark: "Dark",
    shortcutTitle: "Shortcut",
    keyName: "Switch Vietnamese typing on or off",
    typingTitle: "Typing",
    methodName: "Typing method",
    toneName: "Place tone marks the modern way",
    toneSays: "hoà, thuý instead of hòa, thúy.",
    escName: "Escape gives back the keys",
    escSays: "Press Escape right after a word to get back the keys you typed: tiếng → {keys}.",
    engName: "Keep English words as typed",
    engSays: "Words like “with” and “text” stay the way you typed them.",
    capName: "Capitalize sentences",
    capSays: "After a full stop, ! or ?, or a new line: “ok. ban” becomes “ok. Ban”.",
    appName: "Remember on or off for each app",
    appSays: "Each app keeps its own choice.",
    soundName: "Play a sound when switching",
    soundSays: "A short sound as Vietnamese typing turns on or off.",
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
    autoCapitalize: flag("autoCapitalize", false),
    perApp: flag("perApp", true),
    switchSound: flag("switchSound", false),
    popoverAppearance: ["light", "dark"].includes(value("popoverAppearance")) ? value("popoverAppearance") : "system",
    menuBarIcon: ["outlined", "boxed"].includes(value("menuBarIcon")) ? value("menuBarIcon") : "letter",
  };
}

let state = fromLumi({});

// Whether Vietnamese typing is on, so the Menu bar icon choices draw the
// letter the menu bar shows: V on, E off. Asked of the component as the page
// loads and comes back into view (`TYPING_ASKED` in src/lib.rs), and told by
// it whenever the switch moves (`lumi:message`). Unknown — Lumi out of reach,
// or a preview — reads as on.
let typing = null;

async function readTyping() {
  try {
    const answer = await fetch("/__lumi__/call", { method: "POST", body: "typing" });
    const said = answer.ok ? await answer.json() : null;
    if (typeof said?.typing === "boolean") typing = said.typing;
  } catch {
    // Unknown stays what it was.
  }
}

// Asked at once, beside the settings: the first draw waits for both, so the
// choices never show a V that turns into an E.
const typingRead = readTyping();

// The menu bar's own files (ui/menu-bar-*.svg), drawn here in the text's ink.
const GLYPHS = {
  letter: {
    on: "M2.4 3.5L4.67 3.5L8 11.65L11.33 3.5L13.6 3.5L9.1 14.5L6.9 14.5Z",
    off: "M3.6 3.5H12.4V5.43H5.7V8.03H11.9V9.97H5.7V12.57H12.4V14.5H3.6Z",
  },
  outlined: {
    on: "M5 1.5H15A4 4 0 0 1 19 5.5V12.5A4 4 0 0 1 15 16.5H5A4 4 0 0 1 1 12.5V5.5A4 4 0 0 1 5 1.5ZM5 3H15A2.5 2.5 0 0 1 17.5 5.5V12.5A2.5 2.5 0 0 1 15 15H5A2.5 2.5 0 0 1 2.5 12.5V5.5A2.5 2.5 0 0 1 5 3ZM5.6 4.8H7.6L10 10.6L12.4 4.8H14.4L10.9 13.2H9.1Z",
    off: "M5 1.5H15A4 4 0 0 1 19 5.5V12.5A4 4 0 0 1 15 16.5H5A4 4 0 0 1 1 12.5V5.5A4 4 0 0 1 5 1.5ZM5 3H15A2.5 2.5 0 0 1 17.5 5.5V12.5A2.5 2.5 0 0 1 15 15H5A2.5 2.5 0 0 1 2.5 12.5V5.5A2.5 2.5 0 0 1 5 3ZM7 4.8H13.4V6.6H8.9V8.1H12.6V9.9H8.9V11.4H13.4V13.2H7Z",
  },
  boxed: {
    on: "M5 1.5H15A4 4 0 0 1 19 5.5V12.5A4 4 0 0 1 15 16.5H5A4 4 0 0 1 1 12.5V5.5A4 4 0 0 1 5 1.5ZM5.6 4.8H7.6L10 10.6L12.4 4.8H14.4L10.9 13.2H9.1Z",
    off: "M5 1.5H15A4 4 0 0 1 19 5.5V12.5A4 4 0 0 1 15 16.5H5A4 4 0 0 1 1 12.5V5.5A4 4 0 0 1 5 1.5ZM7 4.8H13.4V6.6H8.9V8.1H12.6V9.9H8.9V11.4H13.4V13.2H7Z",
  },
};

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
  await typingRead;
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

// The switch's sound turned on: the component plays it once (`PREVIEW_SOUND`
// in src/lib.rs), so the person hears what they chose. Lumi plays it — a page
// would need the file served as audio — and turning it off plays nothing.
function previewSound() {
  if (!state.switchSound) return;
  return fetch("/__lumi__/call", { method: "POST", body: "switch-sound" }).catch(() => {});
}

// The V or E in the menu bar is the component's to draw, in the look the
// person chose (`ICON_CHANGED` in src/lib.rs), so it is asked to draw it again
// once the new look is stored.
function redrawIcon() {
  return fetch("/__lumi__/call", { method: "POST", body: "icon" }).catch(() => {});
}

// What the component is told after a save of `name`, if anything.
const AFTER_SAVE = { language: redrawMenu, popoverAppearance: restyle, switchSound: previewSound, menuBarIcon: redrawIcon };

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
  for (const path of document.querySelectorAll("[data-glyph]")) {
    path.setAttribute("d", GLYPHS[path.dataset.glyph][typing === false ? "off" : "on"]);
  }
  // A choice drawn as a picture is named for a screen reader instead.
  for (const el of document.querySelectorAll("[data-label]")) {
    el.setAttribute("aria-label", words[el.dataset.label]);
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
  shortcut.draw();
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

// The toggle's own key, its line and its recorder (shortcut.js), in this
// tab's language.
const shortcut = keyRow({
  line: document.getElementById("key-says"),
  recorder: document.getElementById("recorder"),
  language: () => state.language,
});

// Changed elsewhere while the tab is up — a profile switch bringing other
// values: Lumi tells every page of ours.
window.addEventListener("lumi:settings", (event) => {
  asked++;
  const before = state.language;
  const look = state.popoverAppearance;
  const icon = state.menuBarIcon;
  state = fromLumi(event.detail || {});
  draw();
  if (state.language !== before) void redrawMenu();
  if (state.popoverAppearance !== look) void restyle();
  if (state.menuBarIcon !== icon) void redrawIcon();
});

// The switch moved — the shortcut, the V or E, the popover, another app in
// front: the component tells the tab, as it tells the popover.
window.addEventListener("lumi:message", (event) => {
  if (event.detail?.v === 1 && typeof event.detail.typing === "boolean") {
    typing = event.detail.typing;
    draw();
  }
});

// Back in view after a while out of it, when a move may have gone untold.
document.addEventListener("visibilitychange", () => {
  // Not before the first read has drawn the page: drawing shows it.
  if (document.visibilityState === "visible") void readTyping().then(() => settings.hidden || draw());
});

// Whether there is more of the page above or below what the pane shows, for
// the fades at its edges (settings.css). Asked on every scroll, and whenever
// the page or the pane changes height — another language, the shortcut's
// line, Lumi's window resized.
const settings = document.querySelector(".settings");
function edges() {
  const root = document.scrollingElement || document.documentElement;
  settings.classList.toggle("above", root.scrollTop > 1);
  settings.classList.toggle("below", root.scrollTop + root.clientHeight < root.scrollHeight - 1);
}
window.addEventListener("scroll", edges, { passive: true });
window.addEventListener("resize", edges);
new ResizeObserver(edges).observe(settings);

// A preview outside Lumi is told its theme on the URL, as Lumi tells a pane
// page; inside Lumi the embedding script has already written it.
const theme = new URLSearchParams(location.search).get("theme");
if ((theme === "light" || theme === "dark") && !document.documentElement.dataset.theme) {
  document.documentElement.dataset.theme = theme;
}

void reread();
void shortcut.read();
