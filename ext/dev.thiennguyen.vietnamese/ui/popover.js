// The popover under the V or E (popover.html). The component decides what it
// shows: `call("state")` answers it as JSON, and every press is one of the
// menu's own row ids — "toggle", "method:vni", "option:perApp", "settings",
// "quit" — carried out there as a press on that row would be, answered with
// what to show next. A change made elsewhere — the shortcut, another app
// coming forward — arrives as a `lumi:message` with the same shape.

const WORDS = {
  vi: {
    on: "Tiếng Việt",
    off: "English",
    remembered: "Nhớ riêng cho {app}",
    shared: "Dùng chung cho mọi ứng dụng",
    method: "Kiểu gõ",
    tone: "Dấu kiểu mới",
    esc: "Esc trả phím",
    eng: "Giữ từ tiếng Anh",
    app: "Nhớ theo app",
    appSays: "riêng mỗi app",
    settings: "Cài đặt…",
    quit: "Thoát",
  },
  en: {
    on: "Vietnamese",
    off: "English",
    remembered: "Remembered for {app}",
    shared: "The same in every app",
    method: "Typing method",
    tone: "Modern tone marks",
    esc: "Escape gives back",
    eng: "Keep English words",
    app: "Per app",
    appSays: "each app its own",
    settings: "Settings…",
    quit: "Quit",
  },
};

const pop = document.querySelector(".pop");
let state = null;
// The toggle's own key as Lumi holds it, or null.
let key = null;

async function call(request) {
  const answer = await fetch("/__lumi__/call", { method: "POST", body: request });
  if (!answer.ok) throw new Error(await answer.text());
  const text = await answer.text();
  return text ? JSON.parse(text) : null;
}

async function readKey() {
  try {
    const answer = await fetch("/__lumi__/shortcuts");
    const all = answer.ok ? await answer.json() : {};
    key = (all.ess || []).find((one) => one.command === "toggle")?.key || null;
  } catch {
    key = null;
  }
}

// An accelerator as key caps: `Ctrl+Shift+KeyV` → `⌃⇧V` (settings.js's).
function glyphs(accelerator) {
  const parts = accelerator.split("+");
  const last = parts.pop() || "";
  const glyph = { Ctrl: "⌃", Control: "⌃", Alt: "⌥", Option: "⌥", Shift: "⇧", Super: "⌘", Cmd: "⌘", Command: "⌘" };
  const mods = new Set(parts.map((part) => glyph[part] || part));
  const name = /^Key([A-Z])$/.exec(last)?.[1] ?? /^Digit([0-9])$/.exec(last)?.[1] ?? last;
  return [...["⌃", "⌥", "⇧", "⌘"].filter((mod) => mods.has(mod)), name].join("");
}

function draw() {
  if (!state) return;
  const words = WORDS[state.language] || WORDS.vi;
  document.documentElement.lang = state.language === "en" ? "en" : "vi";
  for (const el of document.querySelectorAll("[data-t]")) el.textContent = words[el.dataset.t];
  const big = document.querySelector(".big");
  big.setAttribute("aria-checked", String(state.on));
  document.getElementById("glyph").textContent = state.on ? "V" : "E";
  document.getElementById("state-name").textContent = state.on ? words.on : words.off;
  document.getElementById("remembered").textContent = state.app
    ? words.remembered.replace("{app}", state.app)
    : words.shared;
  const caps = document.getElementById("key");
  caps.hidden = !key;
  caps.textContent = key ? glyphs(key) : "";
  for (const radio of document.querySelectorAll(".seg [role=radio]")) {
    radio.setAttribute("aria-checked", String(radio.dataset.value === state.method));
  }
  for (const tile of document.querySelectorAll("[data-option]")) {
    tile.setAttribute("aria-checked", String(Boolean(state.options?.[tile.dataset.option])));
  }
  pop.hidden = false;
  fit();
}

// The panel at the height of what it shows: the words of either language
// and a missing key change it a little.
let fitted = 0;
function fit() {
  const height = Math.ceil(pop.getBoundingClientRect().height);
  if (!height || height === fitted) return;
  fitted = height;
  fetch("/__lumi__/size", { method: "POST", body: JSON.stringify({ width: 300, height }) }).catch(() => {});
}

async function refresh() {
  await readKey();
  try {
    state = await call("state");
  } catch {
    // Kept as it was: the next press or showing asks again.
  }
  draw();
}

pop.addEventListener("click", async (event) => {
  const act = event.target.closest("[data-act]")?.dataset.act;
  if (!act) return;
  try {
    const next = await call(act);
    if (next) {
      state = next;
      draw();
    }
  } catch {
    // Refused or gone (Quit switches the extension off): nothing to draw.
  }
});

// Escape puts it away, as it does a menu.
window.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;
  event.preventDefault();
  call("close").catch(() => {});
});

window.addEventListener("lumi:shown", refresh);
window.addEventListener("lumi:settings", refresh);
window.addEventListener("lumi:message", (event) => {
  if (event.detail?.v === 1) {
    state = event.detail;
    draw();
  }
});

refresh();
