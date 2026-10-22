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
    eng: "Giữ tiếng Anh",
    app: "Nhớ theo app",
    appOff: "Dùng chung",
    appNone: "Chưa có app khác",
    alikeOn: "Cũng tiếng Việt: {apps}",
    alikeOff: "Cũng English: {apps}",
    andMore: "{apps} và {n} app khác",
    settings: "Cài đặt…",
    quit: "Thoát",
  },
  en: {
    on: "Vietnamese",
    off: "English",
    remembered: "Remembered for {app}",
    shared: "The same in every app",
    method: "Typing method",
    tone: "Modern tones",
    esc: "Esc restores",
    eng: "Keep English",
    app: "Per app",
    appOff: "Shared",
    appNone: "No other app yet",
    alikeOn: "Also Vietnamese: {apps}",
    alikeOff: "Also English: {apps}",
    andMore: "{apps} and {n} more",
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

// An accelerator as key caps: `Ctrl+Shift+KeyV` → `⌃⇧V`, and a tap of
// modifiers, `Tap+Fn+Shift` → `fn ⇧` (settings.js's).
function glyphs(accelerator) {
  const parts = accelerator.split("+");
  const tap = parts[0] === "Tap";
  const last = tap ? "" : parts.pop() || "";
  const glyph = { Fn: "fn", Ctrl: "⌃", Control: "⌃", Alt: "⌥", Option: "⌥", Shift: "⇧", Super: "⌘", Cmd: "⌘", Command: "⌘" };
  const mods = new Set(parts.map((part) => glyph[part] || part));
  const name = /^Key([A-Z])$/.exec(last)?.[1] ?? /^Digit([0-9])$/.exec(last)?.[1] ?? last;
  const caps = [...["fn", "⌃", "⌥", "⇧", "⌘"].filter((mod) => mods.has(mod)), name].filter(Boolean);
  return caps.join(tap ? " " : "");
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
  drawAlike(words);
  pop.hidden = false;
  fit();
}

// Most icons drawn; past it, one fewer and a count, so a count never takes
// the room of the one icon it would stand for.
const MOST_ICONS = 4;

// Under "Per app": the other apps the switch is left the same way in, as
// their icons — named on hover by Lumi's tooltip and to VoiceOver by a line
// of their own — or a word when there are none, or when one switch serves
// every app.
function drawAlike(words) {
  const row = document.getElementById("alike");
  row.replaceChildren();
  const say = (text, kind) => {
    const span = document.createElement("span");
    span.className = kind;
    span.textContent = text;
    row.append(span);
    return span;
  };
  const alike = Array.isArray(state.alike) ? state.alike : [];
  if (!state.options?.perApp) return void say(words.appOff, "none");
  if (!alike.length) return void say(words.appNone, "none");
  const shown = alike.length <= MOST_ICONS ? alike : alike.slice(0, MOST_ICONS - 1);
  const rest = alike.slice(shown.length);
  for (const app of shown) {
    const icon = document.createElement("img");
    icon.alt = "";
    icon.setAttribute("aria-hidden", "true");
    icon.dataset.tip = app.name;
    // An app since removed from the Mac answers 404: leave no broken image.
    icon.addEventListener("error", () => icon.remove());
    icon.src = `/__lumi__/app-icon/${encodeURIComponent(app.id)}`;
    row.append(icon);
  }
  if (rest.length) {
    const more = say(`+${rest.length}`, "more");
    more.setAttribute("aria-hidden", "true");
    more.dataset.tip = rest.map((app) => app.name).join(", ");
  }
  const names = shown.map((app) => app.name).join(", ");
  const apps = rest.length ? words.andMore.replace("{apps}", names).replace("{n}", rest.length) : names;
  say((state.on ? words.alikeOn : words.alikeOff).replace("{apps}", apps), "said");
}

// An app's name up the moment the pointer is on its icon, drawn by Lumi
// (`/__lumi__/tip`): a page's `title` waits a second or more, and only for
// the app in front.
let tipped = null;
function untip() {
  tipped = null;
  fetch("/__lumi__/tip", { method: "DELETE" }).catch(() => {});
}
pop.addEventListener("pointermove", (event) => {
  const named = event.target.closest("[data-tip]");
  if (named === tipped) return;
  if (!named) return untip();
  tipped = named;
  const box = named.getBoundingClientRect();
  const text = named.dataset.tip.slice(0, 200);
  fetch("/__lumi__/tip", {
    method: "POST",
    body: JSON.stringify({ text, x: box.left, y: box.top, width: box.width, height: box.height }),
  }).catch(() => {});
});
for (const done of ["pointerleave", "pointerdown"]) pop.addEventListener(done, untip);
window.addEventListener("lumi:hidden", untip);

// The panel at the height of what it shows: the words of either language
// and a missing key change it a little.
let fitted = 0;
function fit() {
  const height = Math.ceil(pop.getBoundingClientRect().height);
  if (!height || height === fitted) return;
  fitted = height;
  fetch("/__lumi__/size", { method: "POST", body: JSON.stringify({ width: 320, height }) }).catch(() => {});
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
