// The Welcome window (welcome.html): two steps and a finish, read in the
// display language the Settings tab reads in, saving what is chosen here the
// way that tab does. The component answers what a page cannot do itself
// (src/welcome.rs): the menu row and the tab names in a new language, and the
// ways out. An extension page may run no inline script (its CSP is
// `default-src 'self'`), so this is a file of its own.

// Every word the page draws, in both languages. `{name}` is filled in when
// drawn. The two language names on the language control are not here: each
// is always written in its own language, as on the Settings tab.
const WORDS = {
  vi: {
    appTitle: "Ghi chú",
    helloTitle: "Gõ tiếng Việt mà không cần cài bộ gõ",
    helloSays: "Gõ Telex hoặc VNI ngay trên bàn phím bạn vẫn dùng, không phải thêm bộ gõ nào trong Cài đặt hệ thống.",
    langName: "Ngôn ngữ hiển thị",
    langOther: "Display language",
    methodName: "Kiểu gõ",
    methodSays: "{keys} thành tiếng",

    privacyTitle: "Phím bạn gõ đi đâu?",
    netName: "Không dùng mạng",
    netSays: "Tiện ích không được kết nối Internet.",
    keepName: "Không giữ lại phím nào",
    keepSays: "Chỉ ghi nhớ bạn bật hay tắt gõ tiếng Việt ở ứng dụng nào.",
    wordName: "Chỉ sửa từ đang gõ",
    wordSays: "Lumi không cho tiện ích làm gì khác với phím của bạn.",

    toSettings: "Cài đặt",
    back: "Quay lại",
    next: "Tiếp",

    doneTitle: "Xong rồi 🎉",
    doneKey: "Nhấn {key} để bật hoặc tắt gõ tiếng Việt, hoặc bấm chuột phải vào chữ V trên thanh menu.",
    doneTap: "Nhấn {key} cùng lúc rồi thả để bật hoặc tắt gõ tiếng Việt, hoặc bấm chuột phải vào chữ V trên thanh menu.",
    doneNoKey: "Bấm chuột phải vào chữ V trên thanh menu để bật hoặc tắt gõ tiếng Việt.",
    openSettings: "Mở Cài đặt",
    finishDone: "Xong",
    again: "Xem lại từ đầu",
  },
  en: {
    appTitle: "Notes",
    helloTitle: "Type Vietnamese with no input method to install",
    helloSays: "Type Telex or VNI on the keyboard you already use, with nothing to add in System Settings.",
    langName: "Display language",
    langOther: "Ngôn ngữ hiển thị",
    methodName: "Typing method",
    methodSays: "{keys} becomes tiếng",

    privacyTitle: "Where do your keys go?",
    netName: "No network",
    netSays: "It has no access to the internet.",
    keepName: "Keeps no keys",
    keepSays: "It only remembers which apps you switched Vietnamese typing on or off in.",
    wordName: "Changes only the word you are typing",
    wordSays: "Lumi lets it do nothing else with your keys.",

    toSettings: "Settings",
    back: "Back",
    next: "Continue",

    doneTitle: "You’re all set 🎉",
    doneKey: "Press {key} to switch Vietnamese typing on or off, or right-click the V in the menu bar.",
    doneTap: "Press {key} together and let go to switch Vietnamese typing on or off, or right-click the V in the menu bar.",
    doneNoKey: "Right-click the V in the menu bar to switch Vietnamese typing on or off.",
    openSettings: "Open Settings",
    finishDone: "Done",
    again: "Take the tour again",
  },
};

// The keys that type “tiếng” in each method, for the method row's example.
const TYPED = { telex: "tieengs", vni: "tie61ng" };

// What the first step's note types, word by word in each method: the keys,
// and what the word shows after each of them. src/welcome.rs types every
// word here and in BOX through the engine in its tests, so the stage never
// shows a key doing what the engine does not.
const SCENE = {
  telex: [
    { keys: "Xin", shows: ["X", "Xi", "Xin"] },
    { keys: "chaof", shows: ["c", "ch", "cha", "chao", "chào"] },
    { keys: "Vieetj", shows: ["V", "Vi", "Vie", "Viê", "Viêt", "Việt"] },
    { keys: "Nam", shows: ["N", "Na", "Nam"] },
  ],
  vni: [
    { keys: "Xin", shows: ["X", "Xi", "Xin"] },
    { keys: "chao2", shows: ["c", "ch", "cha", "chao", "chào"] },
    { keys: "Vie65t", shows: ["V", "Vi", "Vie", "Viê", "Việ", "Việt"] },
    { keys: "Nam", shows: ["N", "Na", "Nam"] },
  ],
};

// What the second step's box takes in and gives out, the same way.
const BOX = {
  telex: [
    { keys: "tieengs", shows: ["t", "ti", "tie", "tiê", "tiên", "tiêng", "tiếng"] },
    { keys: "Vieetj", shows: ["V", "Vi", "Vie", "Viê", "Viêt", "Việt"] },
  ],
  vni: [
    { keys: "tie61ng", shows: ["t", "ti", "tie", "tiê", "tiế", "tiến", "tiếng"] },
    { keys: "Vie65t", shows: ["V", "Vi", "Vie", "Viê", "Việ", "Việt"] },
  ],
};

// Where each piece of confetti flies to from the middle of the mark, in px,
// and how far it turns. Fixed, so every finish bursts the same.
const CONFETTI = [
  [-150, -70, 200], [-120, -110, -140], [-80, -130, 260], [-40, -120, -90],
  [10, -140, 180], [55, -125, -220], [95, -115, 120], [135, -90, -160],
  [165, -50, 240], [-170, -20, -120], [-135, 25, 200], [150, 10, -200],
  [120, 50, 150], [-95, 60, -260], [80, 70, 90], [-30, 80, 210],
];
const CONFETTI_COLOURS = ["#ef4444", "#f59e0b", "#ec4899", "#fbbf24", "#22a34a"];

const STEPS = document.querySelectorAll(".step").length;
const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
const $ = (id) => document.getElementById(id);

// ---- The bridge -----------------------------------------------------------

// One request to the component (src/welcome.rs), answered as JSON; a
// refusal as an Error with its sentence.
async function call(request) {
  const answer = await fetch("/__lumi__/call", { method: "POST", body: JSON.stringify(request) });
  const body = await answer.text();
  if (!answer.ok) throw new Error(body || `Lumi answered ${answer.status}`);
  return body ? JSON.parse(body) : {};
}

// What Lumi holds, read the way the component reads it (`Settings::from_json`
// in src/lib.rs), as the Settings tab reads it: every value arrives as text,
// and anything unknown falls back to the manifest's default. Only what this
// page shows.
function fromLumi(raw) {
  const value = (name) => (raw && raw[name] != null ? String(raw[name]) : "");
  return {
    language: value("language") === "en" ? "en" : "vi",
    method: value("method") === "vni" ? "vni" : "telex",
  };
}

let settings = fromLumi({});
let read = false;
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
  const method = settings.method;
  settings = fromLumi(raw);
  read = true;
  draw(settings.method !== method);
}

// One change, drawn at once and saved as text; then read back, so a save
// Lumi refused shows what stands. A new language redraws the menu row and
// the tab names too.
function save(name, value) {
  asked++;
  settings = { ...settings, [name]: value };
  draw(name === "method");
  fetch("/__lumi__/settings", { method: "PUT", body: JSON.stringify({ [name]: String(value) }), keepalive: true })
    .then(() => (name === "language" ? call({ kind: "language" }) : undefined))
    .catch(() => {})
    .finally(() => void reread());
}

// The extension's own key for the switch as Lumi holds it, for the finish:
// null when none is armed, or Lumi has none to tell.
async function ownKey() {
  try {
    const answer = await fetch("/__lumi__/shortcuts");
    if (!answer.ok) return null;
    const all = await answer.json();
    const own = (all.ess || []).find((one) => one.command === "toggle");
    return own && own.key ? own.key : null;
  } catch {
    return null;
  }
}

// ---- Drawing --------------------------------------------------------------

function t(name, fill = {}) {
  return WORDS[settings.language][name].replace(/\{(\w+)\}/g, (all, key) => (key in fill ? fill[key] : all));
}

// An accelerator as Lumi writes one (`Ctrl+Shift+KeyV`), as macOS's glyphs,
// one per key cap. A tap of modifiers (`Tap+Fn+Shift`) is its modifiers
// alone, fn first.
function caps(accelerator) {
  const parts = accelerator.split("+");
  const tap = parts[0] === "Tap";
  const key = tap ? "" : parts.pop() || "";
  const glyph = { Fn: "fn", Ctrl: "⌃", Control: "⌃", Alt: "⌥", Option: "⌥", Shift: "⇧", Super: "⌘", Cmd: "⌘", Command: "⌘" };
  const mods = new Set(parts.map((part) => glyph[part] || part));
  const name = /^Key([A-Z])$/.exec(key)?.[1] ?? /^Digit([0-9])$/.exec(key)?.[1] ?? key;
  return [...["fn", "⌃", "⌥", "⇧", "⌘"].filter((mod) => mods.has(mod)), name].filter(Boolean).map((cap) => {
    const kbd = document.createElement("kbd");
    kbd.textContent = cap;
    return kbd;
  });
}

let step = 0;
let failed = "";

function draw(methodChanged = false) {
  if (!read) return;
  document.documentElement.lang = settings.language;
  for (const el of document.querySelectorAll("[data-t]")) {
    el.textContent = t(el.dataset.t, { keys: TYPED[settings.method] });
  }
  for (const group of document.querySelectorAll("[data-group]")) {
    for (const option of group.querySelectorAll('[role="radio"]')) {
      const on = settings[group.dataset.group] === option.dataset.value;
      option.setAttribute("aria-checked", String(on));
      option.tabIndex = on ? 0 : -1;
    }
  }
  $("back").hidden = step === 0;
  for (const section of document.querySelectorAll(".step")) {
    section.hidden = Number(section.dataset.step) !== step;
  }
  for (const scene of document.querySelectorAll(".scene")) {
    scene.hidden = Number(scene.dataset.scene) !== step;
  }
  $("dots").replaceChildren(
    ...Array.from({ length: STEPS }, (_, at) => {
      const dot = document.createElement("span");
      if (at === step) dot.className = "on";
      return dot;
    }),
  );
  for (const id of ["failed", "finish-failed"]) {
    $(id).textContent = failed;
    $(id).hidden = !failed;
  }
  if ($("finish").hidden && (methodChanged || played !== step)) playScene();
  if (!$("finish").hidden) drawDone();
  // Shown only once there is something true to show: drawn before the first
  // read, somebody who chose English would see the Vietnamese defaults flash.
  if ($("finish").hidden) $("tour").hidden = false;
}

// ---- The stage ------------------------------------------------------------

// The run now playing, so a newer one (another step, the method changed) ends
// it, and the step it plays.
let playing = 0;
let played = -1;
let timer = 0;

function stopPlaying() {
  playing = 0;
  played = -1;
  clearTimeout(timer);
}

// `words` typed a key at a time: for each key, what the line shows after it,
// and whether it put a mark on the word rather than only adding its letter.
// A space between words is a frame of its own (`␣`).
function framesOf(words) {
  const whole = words.map((word) => word.shows[word.shows.length - 1]);
  const frames = [];
  words.forEach((word, at) => {
    const before = at ? whole.slice(0, at).join(" ") + " " : "";
    [...word.keys].forEach((key, i) => {
      const was = i ? word.shows[i - 1] : "";
      frames.push({ text: before + word.shows[i], key, marks: word.shows[i] !== was + key });
    });
    if (at < words.length - 1) frames.push({ text: before + whole[at] + " ", key: "␣", marks: false });
  });
  return frames;
}

// Play `frames` through `show`, a key at a time, then leave the end up a
// moment, `clear` and start over — or, for somebody who asked macOS for less
// motion, show the end and stop.
function play(frames, show, clear) {
  const run = (playing = Date.now());
  clearTimeout(timer);
  clear();
  if (still) {
    frames.forEach(show);
    return;
  }
  let at = 0;
  const next = () => {
    if (run !== playing) return;
    if (at < frames.length) {
      const frame = frames[at++];
      show(frame);
      timer = setTimeout(next, frame.key === "␣" ? 280 : 220);
      return;
    }
    timer = setTimeout(() => {
      if (run !== playing) return;
      clear();
      at = 0;
      timer = setTimeout(next, 600);
    }, 2400);
  };
  timer = setTimeout(next, 500);
}

// Restart a CSS animation on `el` by taking its class away and putting it
// back.
function restart(el, className) {
  el.classList.remove(className);
  void el.offsetWidth;
  el.classList.add(className);
}

// The stage of the step showing, from its first key.
function playScene() {
  played = step;
  if (step === 0) {
    // A note typing the whole line; the key just pressed under it, in the
    // icon's red when it put a mark on the word.
    const typed = $("typed");
    const pressed = $("pressed");
    play(
      framesOf(SCENE[settings.method]),
      (frame) => {
        typed.textContent = frame.text;
        pressed.textContent = frame.key;
        pressed.classList.toggle("marks", frame.marks);
        restart(pressed, "down");
      },
      () => {
        typed.textContent = "";
        pressed.textContent = "";
      },
    );
  } else {
    // “tiếng Việt”, key by key into the box on the left, and on the right
    // what the keys come out as so far: t, ti, tie, tiê, tiên, tiêng, tiếng.
    const keys = $("keys-in");
    const out = $("word-out");
    const box = $("box");
    let gap = false;
    play(
      framesOf(BOX[settings.method]),
      (frame) => {
        if (frame.key === "␣") {
          gap = true;
        } else {
          const kbd = document.createElement("kbd");
          kbd.textContent = frame.key;
          if (frame.marks) kbd.className = "marks";
          if (gap) kbd.classList.add("gap");
          gap = false;
          keys.append(kbd);
        }
        out.textContent = frame.text;
        restart(box, "beat");
      },
      () => {
        keys.replaceChildren();
        out.textContent = "";
        gap = false;
      },
    );
  }
}

// ---- The finish -----------------------------------------------------------

let armed = null;

function drawDone() {
  const line = $("done-says");
  if (!armed) {
    line.textContent = t("doneNoKey");
    return;
  }
  const [head, tail] = t(armed.startsWith("Tap+") ? "doneTap" : "doneKey").split("{key}");
  line.replaceChildren(head, ...caps(armed), tail);
}

function finish() {
  stopPlaying();
  $("tour").hidden = true;
  $("finish").hidden = false;
  // The confetti made again, so it bursts every time the finish comes.
  const mark = $("finish-mark");
  for (const piece of mark.querySelectorAll("i")) piece.remove();
  if (!still) {
    CONFETTI.forEach(([x, y, turn], at) => {
      const piece = document.createElement("i");
      piece.style.setProperty("--x", `${x}px`);
      piece.style.setProperty("--y", `${y}px`);
      piece.style.setProperty("--turn", `${turn}deg`);
      piece.style.background = CONFETTI_COLOURS[at % CONFETTI_COLOURS.length];
      mark.prepend(piece);
    });
  }
  drawDone();
  void ownKey().then((key) => {
    armed = key;
    drawDone();
  });
  $("finish-done").focus();
}

function go(to) {
  failed = "";
  step = Math.max(0, Math.min(STEPS - 1, to));
  $("finish").hidden = true;
  $("tour").hidden = false;
  draw();
}

function act(work) {
  failed = "";
  draw();
  Promise.resolve()
    .then(work)
    .catch((err) => {
      failed = err instanceof Error ? err.message : String(err);
      draw();
    });
}

// ---- The controls ---------------------------------------------------------

for (const group of document.querySelectorAll("[data-group]")) {
  const name = group.dataset.group;
  const options = [...group.querySelectorAll('[role="radio"]')];
  for (const option of options) {
    option.addEventListener("click", () => {
      if (settings[name] !== option.dataset.value) save(name, option.dataset.value);
    });
  }
  // The arrow keys move the choice, the way a radio group does, and the
  // focus follows it.
  group.addEventListener("keydown", (e) => {
    const move = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
    if (!move) return;
    e.preventDefault();
    const at = (options.findIndex((o) => o.dataset.value === settings[name]) + move + options.length) % options.length;
    save(name, options[at].dataset.value);
    options[at].focus();
  });
}

$("back").addEventListener("click", () => go(step - 1));
$("next").addEventListener("click", () => (step === STEPS - 1 ? finish() : go(step + 1)));
$("to-settings").addEventListener("click", () => act(() => call({ kind: "settings" })));
$("finish-settings").addEventListener("click", () => act(() => call({ kind: "settings" })));
$("finish-done").addEventListener("click", () => act(() => call({ kind: "close" })));
$("again").addEventListener("click", () => go(0));

// Changed elsewhere while the window is up — the Settings tab, a profile
// switch: Lumi tells every page of ours.
window.addEventListener("lumi:settings", (event) => {
  asked++;
  const method = settings.method;
  settings = fromLumi(event.detail || {});
  draw(settings.method !== method);
});

// A preview outside Lumi is told its theme on the URL; inside Lumi a window
// follows the system.
const theme = new URLSearchParams(location.search).get("theme");
if (theme === "light" || theme === "dark") document.documentElement.dataset.theme = theme;

void reread();
