// The panel under Mic Mute's item (panel.html). The component decides what
// it shows: `call("state")` answers
// `{"v": 1, "muted", "talking", "devices": [{"id", "name", "kind", "state",
// "default", "choosable"}]}` — `kind` "built-in", "bluetooth", "usb",
// "phone" or "other", `state` "muted", "on" or "cannot" (a microphone Lumi
// can't mute, listed since the panel also chooses the Mac's input),
// `default` true for the Mac's input, the one apps hear, `choosable` true
// for one macOS will make the input — a press on its row does, `use:<id>` —
// and a press is "toggle" or "settings", answered with the state
// that stands after it. A change made elsewhere — the key, the right-click, a
// microphone plugged in — arrives as a `lumi:message` of the same shape.

const pop = document.querySelector(".pop");
// The switch: the whole top row, round button and words.
const big = document.querySelector(".top");
const summary = document.getElementById("summary");
const list = document.getElementById("devices");
const hint = document.getElementById("hint");
const keyCaps = document.getElementById("key");

let state = null;
// The toggle's own key as Lumi holds it, or null.
let key = null;

const GLYPHS = {
  "built-in": '<path d="M20 16V7a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v9m16 0H4m16 0 1.28 2.55a1 1 0 0 1-.9 1.45H3.62a1 1 0 0 1-.9-1.45L4 16"/>',
  bluetooth: '<path d="m7 7 10 10-5 5V2l5 5L7 17"/>',
  usb: '<path d="M3 11h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-5Zm0 0a9 9 0 1 1 18 0m0 0v5a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3Z"/><path d="M21 16v2a4 4 0 0 1-4 4h-5"/>',
  phone: '<rect x="5" y="2" width="14" height="20" rx="2" ry="2"/><path d="M12 18h.01"/>',
  other: '<path d="M12 19v3"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><rect x="9" y="2" width="6" height="13" rx="3"/>',
};
const SAID = { muted: "Muted", on: "On", cannot: "Can't Mute" };

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

// An accelerator as key caps: `Alt+Super+KeyM` → `⌥⌘M`.
function glyphs(accelerator) {
  const parts = accelerator.split("+");
  const last = parts.pop() || "";
  const glyph = { Fn: "fn", Ctrl: "⌃", Control: "⌃", Alt: "⌥", Option: "⌥", Shift: "⇧", Super: "⌘", Cmd: "⌘", Command: "⌘" };
  const mods = new Set(parts.map((part) => glyph[part] || part));
  const name = /^Key([A-Z])$/.exec(last)?.[1] ?? /^Digit([0-9])$/.exec(last)?.[1] ?? last;
  return [...["fn", "⌃", "⌥", "⇧", "⌘"].filter((mod) => mods.has(mod)), name].join("");
}

function row(device) {
  const item = document.createElement("li");
  item.dataset.state = device.state;
  // The Mac's input, marked as Control Center marks the device in use: its
  // chip filled with the accent. Said in words too, for VoiceOver.
  if (device.default === true) {
    item.classList.add("default");
  }
  // A microphone macOS will make the input is a button, as a row in Sound
  // settings is; the one in use already, or one that can't be, is not.
  const choosable = device.choosable === true && device.default !== true && typeof device.id === "string";
  const line = document.createElement(choosable ? "button" : "div");
  line.className = "row";
  if (choosable) {
    line.type = "button";
    line.dataset.use = device.id;
  }
  if (device.default === true) line.setAttribute("aria-current", "true");
  const chip = document.createElement("span");
  chip.className = "chip";
  chip.setAttribute("aria-hidden", "true");
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  // A fixed glyph chosen by kind: nothing of the device's own reaches it.
  svg.innerHTML = GLYPHS[device.kind] || GLYPHS.other;
  chip.append(svg);
  const name = document.createElement("span");
  name.className = "name";
  name.textContent = device.name;
  const said = document.createElement("span");
  said.className = "state";
  said.textContent = SAID[device.state] || "";
  if (device.default === true) {
    const used = document.createElement("span");
    used.className = "visually-hidden";
    used.textContent = ", the Mac's input";
    name.append(used);
  }
  line.append(chip, name, said);
  item.append(line);
  return item;
}

function draw() {
  if (!state) return;
  const devices = Array.isArray(state.devices) ? state.devices : [];
  big.setAttribute("aria-checked", String(Boolean(state.muted)));
  big.setAttribute("aria-label", state.muted ? "Unmute every microphone" : "Mute every microphone");
  summary.textContent = state.talking ? "Talking" : state.muted ? "Muted" : "Unmuted";
  list.replaceChildren(...devices.map(row));
  if (!devices.length) {
    const none = document.createElement("li");
    none.className = "none";
    none.textContent = "No microphone";
    list.append(none);
  }
  hint.hidden = !key;
  keyCaps.textContent = key ? `Hold ${glyphs(key)}` : "";
  pop.hidden = false;
  fit();
}

// The panel at the height of what it shows: one row per microphone.
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
  const use = event.target.closest("[data-use]")?.dataset.use;
  const act = use ? `use:${use}` : event.target.closest("[data-act]")?.dataset.act;
  if (!act) return;
  // The button turns at the press; the answer, when it comes, is the truth.
  if (act === "toggle" && state) {
    state = { ...state, muted: !state.muted, talking: false };
    draw();
  }
  try {
    const next = await call(act);
    if (next) {
      state = next;
      draw();
    }
  } catch {
    refresh();
  }
});

// Escape puts it away, as it does a menu.
window.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;
  event.preventDefault();
  call("close").catch(() => {});
});

window.addEventListener("lumi:shown", refresh);
window.addEventListener("lumi:message", (event) => {
  if (event.detail?.v === 1) {
    state = event.detail;
    draw();
  }
});

refresh();
