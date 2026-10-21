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
    foot: "Bật hoặc tắt gõ tiếng Việt từ menu bar của Lumi, hoặc bằng phím tắt trong tab Phím tắt.",
  },
  en: {
    generalTitle: "General",
    langName: "Display language",
    langOther: "Ngôn ngữ hiển thị",
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
    foot: "Switch Vietnamese typing on or off from Lumi's menu bar, or with a shortcut in the Shortcuts tab.",
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

// One change, drawn at once and saved as text; then read back, so a save
// Lumi refused — the extension switched off meanwhile — shows what stands.
function save(name, value) {
  asked++;
  state = { ...state, [name]: value };
  draw();
  fetch("/__lumi__/settings", { method: "PUT", body: JSON.stringify({ [name]: String(value) }), keepalive: true })
    .then(() => (name === "language" ? redrawMenu() : undefined))
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

// Changed elsewhere while the tab is up — a profile switch bringing other
// values: Lumi tells every page of ours.
window.addEventListener("lumi:settings", (event) => {
  asked++;
  const before = state.language;
  state = fromLumi(event.detail || {});
  draw();
  if (state.language !== before) void redrawMenu();
});

// A preview outside Lumi is told its theme on the URL, as Lumi tells a pane
// page; inside Lumi the embedding script has already written it.
const theme = new URLSearchParams(location.search).get("theme");
if ((theme === "light" || theme === "dark") && !document.documentElement.dataset.theme) {
  document.documentElement.dataset.theme = theme;
}

void reread();
