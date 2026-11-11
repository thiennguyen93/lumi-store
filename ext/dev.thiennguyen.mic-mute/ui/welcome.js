// Mic Mute's Welcome window (welcome.html): four steps, then a finish of
// its own — the tour `on_lifecycle` opens on install and on an update from
// before 0.3.0 (src/welcome.rs).
//
// The page keeps the tour; the component answers what a page cannot know,
// each a plain word over `POST /__lumi__/call`, as the panel's are:
// `welcome` (why the window is open: `{"v": 1, "from", "version"}`, `from`
// the version an update replaced, or null), the panel's own `state`,
// `toggle` and `use:<id>` (`{"v": 1, "muted", "talking", "devices"}`, see
// panel.js), and `settings` and `close`, the two ways out. Whatever moves the
// microphones elsewhere — the real key above all — arrives as a
// `lumi:message` of the panel's shape, so the stage of the key step is the
// person's own Mac answering their own key. The key's row is shortcut.js's,
// as on the Settings tab; While Talking is saved over `/__lumi__/settings`,
// as the Settings tab saves it.

const $ = (id) => document.getElementById(id);

const STEPS = 4;
// Which stage each step shows: the desk serves the key and While Talking.
const SCENE_OF = ["0", "1", "2", "3"];
const DECLARED = ["⌥", "⌘", "M"];

const MIC = '<path d="M12 19v3"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><rect x="9" y="2" width="6" height="13" rx="3"/>';
const MIC_OFF_INK = '<path d="M12 19v3"/><path d="M15 9.34V5a3 3 0 0 0-5.68-1.33"/><path d="M16.95 16.95A7 7 0 0 1 5 12v-2"/><path d="M18.89 13.23A7 7 0 0 0 19 12v-2"/><path d="M9 9v3a3 3 0 0 0 5.12 2.12"/>';
const MIC_OFF = MIC_OFF_INK + '<path d="m2 2 20 20"/>';
const svg = (paths, cls = "") => `<svg viewBox="0 0 24 24" class="${cls}" aria-hidden="true">${paths}</svg>`;

// The item's talking frames, as ui/icons/talk-1…6.svg draw the bars: each
// bar's top and length.
const FRAMES = [
  [[10, 4], [7, 10], [9, 6]], [[8, 8], [5, 14], [10, 4]], [[6, 12], [8, 8], [7, 10]],
  [[9, 6], [6, 12], [5, 14]], [[7, 10], [9, 6], [8, 8]], [[5, 14], [7, 10], [9, 6]],
];
const BAR_X = [25.5, 29.5, 33.5];
let frame = 0;
const barsOf = (at) => FRAMES[at].map(([y, len], i) => `<path d="M${BAR_X[i]} ${y}v${len}"/>`).join("");

/** The item as Mic Mute draws it (ui/icons): muted, live or talking. A
 *  `still` talking icon holds one frame, for a mark that is not the stage. */
function itemIcon(look, still = false) {
  if (look === "talking") return `<svg class="ico" viewBox="0 0 36 24" aria-hidden="true">${MIC}<g class="bars"${still ? "" : " data-talk"}>${barsOf(still ? 2 : frame)}</g></svg>`;
  if (look === "muted") return `<svg class="ico" viewBox="0 0 24 24" aria-hidden="true">${MIC_OFF_INK}<path class="slash" d="m2 2 20 20"/></svg>`;
  return `<svg class="ico" viewBox="0 0 24 24" aria-hidden="true">${MIC}<circle class="dot" cx="19.6" cy="4.4" r="3.6"/></svg>`;
}

const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
if (!reduced) {
  setInterval(() => {
    frame = (frame + 1) % FRAMES.length;
    for (const bars of document.querySelectorAll("[data-talk]")) bars.innerHTML = barsOf(frame);
  }, 125);
}

// --- What stands ------------------------------------------------------------

let step = 0;
// The microphones as the component last said: `{muted, talking, devices}`.
let mics = null;
// What the stage shows of them — "muted", "on" or "talking" — which follows
// `mics` but for a talk begun muted, held back until it is a hold (`took`).
let shownLook = null;
let settling = false;
// The version an update replaced, or null for a plain welcome.
let updatedFrom = null;
// The key as Lumi holds it, as caps, or null for none.
let keyCaps = null;
let talkingChoice = "card";
// A look of the icon shown for a moment from the legend, or null.
let peek = null;
let panelOpen = false;
let panelSeen = false;
// What the desk shows over the screen: the card's look, the alert's words.
let card = null;
let hud = "";
// Whether the talk under way began with the microphones on.
let beganOn = false;
// The While Talking step's hold, acted out over and over.
let demoHolding = false;

const timers = {};
function later(name, ms, run) {
  clearTimeout(timers[name]);
  timers[name] = setTimeout(run, ms);
}
const stop = (name) => clearTimeout(timers[name]);

const lookOf = (state) => (state.talking ? "talking" : state.muted ? "muted" : "on");
const look = () => shownLook ?? "on";
const shownCaps = () => keyCaps ?? DECLARED;
const keyWords = () => (keyCaps ? keyCaps.join("") : "");

// --- Talking to the component ----------------------------------------------

async function call(request) {
  const answer = await fetch("/__lumi__/call", { method: "POST", body: request });
  if (!answer.ok) throw new Error((await answer.text()) || `Lumi answered ${answer.status}`);
  const text = await answer.text();
  return text ? JSON.parse(text) : null;
}

/** Run `fn`, saying under the step what went wrong rather than nothing. */
async function act(fn) {
  const failed = $("finish").hidden ? $("failed") : $("finish-failed");
  failed.hidden = true;
  try {
    return await fn();
  } catch (err) {
    failed.textContent = err instanceof Error ? err.message : String(err);
    failed.hidden = false;
    return undefined;
  }
}

// --- The microphones, and what the screen says about them -------------------

const CARD = {
  talking: { title: "Talking", sub: "", look: "talking", stay: 0 },
  "talking-on": { title: "Talking", sub: "Let go to mute", look: "talking", stay: 0 },
  muted: { title: "Muted", sub: "", look: "muted", stay: 1000 },
  unmuted: { title: "Unmuted", sub: "", look: "plain", stay: 1000 },
};

function showCard(kind) {
  card = kind;
  if (CARD[kind].stay) later("card", CARD[kind].stay, () => { card = null; drawDesk(); });
  else stop("card");
}

function showHud(words) {
  hud = words;
  later("hud", 1300, () => { hud = ""; drawDesk(); });
}

/** A new state from the component, moving the stage — but a talk begun
 *  muted only once it is a hold. From muted the key's down unmutes at once,
 *  and the microphones moving tell the component, which tells this page
 *  "talking" before anybody knows whether the key is tapped or held; a tap
 *  answers within the 200 ms that tells them apart (`held-after-ms`), so a
 *  talk is shown once it has lasted past that, and a tap never flashes
 *  Talking on the stage, as it never does on the screen. */
function took(next) {
  if (!next || next.v !== 1) return;
  mics = next;
  const now = lookOf(next);
  if (shownLook === null) {
    shownLook = now;
  } else if (now === "talking" && shownLook === "muted") {
    if (!settling) {
      settling = true;
      later("settle", 220, () => {
        settling = false;
        if (mics && lookOf(mics) === "talking") moved("talking");
      });
    }
  } else {
    settling = false;
    stop("settle");
    moved(now);
    return;
  }
  draw();
}

/** The stage moved from what it showed to `now`. The card and the alert it
 *  draws are worked out from how it moved, as Mic Mute says each on the
 *  screen: a tap's Muted or Unmuted, a hold's Talking, and a hold begun on,
 *  muted when let go. */
function moved(now) {
  const before = shownLook;
  shownLook = now;
  if (before !== now) {
    const onCard = talkingChoice === "card";
    if (now === "talking") {
      beganOn = before === "on";
      if (onCard) showCard(beganOn ? "talking-on" : "talking");
      else {
        card = null;
        stop("card");
      }
    } else if (before === "talking") {
      if (onCard) {
        if (beganOn && now === "muted") showCard("muted");
        else card = null;
      } else if (beganOn && now === "muted") showHud("Microphones muted");
    } else if (now === "muted") {
      if (onCard) showCard("muted");
      else showHud("Microphones muted");
    } else {
      if (onCard) showCard("unmuted");
      else showHud("Microphones on");
    }
  }
  draw();
}

function refresh() {
  call("state").then(took).catch(() => {});
}

// --- Drawing ---------------------------------------------------------------

function capsHtml(caps) {
  const box = document.createElement("span");
  for (const cap of caps) {
    const kbd = document.createElement("kbd");
    kbd.textContent = cap;
    box.append(kbd);
  }
  return box.innerHTML;
}

function drawItems() {
  for (const item of document.querySelectorAll("[data-item]")) {
    const shown = step === 3 ? (demoHolding ? "talking" : "muted") : (peek ?? look());
    if (item.dataset.look !== shown) {
      item.innerHTML = itemIcon(shown);
      item.dataset.look = shown;
    }
  }
}

/** The desk: the key step's real state, or the While Talking step's hold. */
function drawDesk() {
  const desk = $("desk");
  const demo = step === 3;
  const shown = demo ? (demoHolding ? "talking" : "muted") : look();
  desk.dataset.mic = shown;
  $("trykey").hidden = demo;
  $("holding").hidden = !demo;
  if (demo) {
    $("holding").classList.toggle("idle", !demoHolding);
    $("holding-word").textContent = demoHolding ? "Holding" : "Not held";
  }

  const shownCard = demo ? (demoHolding && talkingChoice === "card" ? "talking" : null) : card;
  const shownHud = demo ? "" : hud;
  const fx = $("desk-fx");
  const key = `${shown}|${shownCard}|${shownHud}|${talkingChoice}`;
  if (fx.dataset.key === key) return;
  fx.dataset.key = key;
  fx.replaceChildren();
  if (shown === "talking" && talkingChoice === "glow") fx.insertAdjacentHTML("beforeend", '<div class="tglow"></div>');
  if (shown === "talking" && talkingChoice === "icon") ringItem(desk, fx);
  if (shownCard) {
    const c = CARD[shownCard];
    const el = document.createElement("div");
    el.className = `tcard ${c.look}`;
    el.innerHTML = `<span class="disc">${svg(MIC, "on")}${svg(MIC_OFF, "off")}</span><span class="words"><b></b><small></small></span><span class="cbars"><i></i><i></i><i></i></span>`;
    el.querySelector("b").textContent = c.title;
    const small = el.querySelector("small");
    if (c.sub) small.textContent = c.sub;
    else small.remove();
    fx.append(el);
  }
  if (shownHud) {
    const el = document.createElement("div");
    el.className = "thud";
    el.textContent = shownHud;
    fx.append(el);
  }
}

/** Icon Only: a ring round the icon, the one thing on the screen that says
 *  it. */
function ringItem(desk, fx) {
  const item = desk.querySelector("[data-item]");
  const a = item.getBoundingClientRect();
  const b = desk.getBoundingClientRect();
  const ring = document.createElement("span");
  ring.className = "spot";
  ring.style.left = `${a.left + a.width / 2 - b.left - 17}px`;
  ring.style.top = `${a.top + a.height / 2 - b.top - 13}px`;
  fx.append(ring);
}

function drawTry() {
  const keys = $("try-keys");
  if (!keyCaps) {
    keys.className = "caps big none";
    keys.textContent = "No key yet";
    $("try-hint").textContent = "Record one below, or right-click the icon";
    $("try-says").textContent = "Record a shortcut below to try it.";
    return;
  }
  keys.className = `caps big${look() === "talking" ? " down" : ""}`;
  if (keys.dataset.caps !== keyWords()) {
    keys.innerHTML = capsHtml(keyCaps);
    keys.dataset.caps = keyWords();
  }
  $("try-hint").textContent = look() === "talking" ? "Let go to mute" : look() === "muted" ? "Tap to unmute · Hold to talk" : "Tap to mute · Hold to talk";
  $("try-says").textContent = `Try it now: press ${keyWords()} in any app, this one included.`;
}

/** The panel hanging from the icon: the person's own microphones, the one
 *  the Mac uses first, as many as the stage has room for. */
function drawBar() {
  const bar = $("bar");
  const item = $("bar-item");
  item.classList.toggle("lit", panelOpen);
  item.classList.toggle("call", !panelSeen);
  item.setAttribute("aria-expanded", String(panelOpen));
  const a = item.getBoundingClientRect();
  const b = bar.getBoundingClientRect();
  const middle = a.left + a.width / 2 - b.left;

  const callout = $("callout");
  callout.hidden = panelOpen || panelSeen;
  callout.style.left = `${middle}px`;

  const pop = $("pop");
  pop.hidden = !panelOpen;
  if (!panelOpen) return;
  const width = 236;
  const left = Math.min(Math.max(middle - width / 2, 8), b.width - width - 8);
  pop.style.left = `${left}px`;
  $("pop-arrow").style.left = `${middle - left}px`;

  const shown = peek ?? look();
  const muted = shown === "muted";
  const toggle = $("pop-toggle");
  toggle.setAttribute("aria-checked", String(muted));
  toggle.setAttribute("aria-label", muted ? "Unmute every microphone" : "Mute every microphone");
  $("pop-big").innerHTML = svg(muted ? MIC_OFF : MIC);
  $("pop-summary").textContent = shown === "talking" ? "Talking" : muted ? "Muted" : "Unmuted";

  const list = $("pop-devices");
  list.replaceChildren();
  const devices = [...(mics?.devices ?? [])].sort((x, y) => Number(y.default) - Number(x.default)).slice(0, 3);
  if (!devices.length) {
    const none = document.createElement("li");
    none.className = "none";
    none.textContent = "No microphone";
    list.append(none);
  }
  for (const device of devices) {
    const word = device.state === "cannot" ? "Can’t Mute" : device.state === "muted" ? "Muted" : "On";
    const li = document.createElement("li");
    if (device.default) li.className = "default";
    const row = document.createElement(device.choosable && !device.default ? "button" : "div");
    row.className = "prow";
    if (row.tagName === "BUTTON") {
      row.type = "button";
      row.dataset.input = device.id;
    }
    row.innerHTML = `<span class="mchip">${svg(device.state === "muted" ? MIC_OFF : MIC)}</span><span class="name"></span><span class="state"></span>`;
    row.querySelector(".name").textContent = device.name;
    row.querySelector(".state").textContent = word;
    row.setAttribute("aria-label", `${device.name}, ${word}${device.default ? ", in use" : ""}`);
    li.append(row);
    list.append(li);
  }
}

function drawChoices() {
  for (const button of document.querySelectorAll("[data-choice]")) {
    const on = button.dataset.choice === talkingChoice;
    button.setAttribute("aria-checked", String(on));
    button.tabIndex = on ? 0 : -1;
  }
}

function drawKeyWords() {
  $("every-keys").innerHTML = capsHtml(shownCaps());
  $("holding-keys").innerHTML = capsHtml(shownCaps());
  $("talking-says").textContent = keyCaps ? `While you hold ${keyWords()}.` : "While you hold the key.";
  if (updatedFrom) {
    const holds = !updatedFrom.startsWith("0.1.");
    $("news-says").textContent = `From ${updatedFrom}. ${keyWords() || "The key"} mutes${holds ? " and holds to talk" : ""} as before, and there’s more to see.`;
  }
  const says = $("done-says");
  says.replaceChildren();
  if (keyCaps) {
    const caps = document.createElement("span");
    caps.innerHTML = capsHtml(keyCaps);
    says.append("Press ", ...caps.childNodes, " in any app to mute every microphone, or hold it to talk.");
  } else {
    says.textContent = "Give Mic Mute a key in Settings, or right-click its icon in the menu bar to mute.";
  }
}

function draw() {
  drawItems();
  if (step === 1 || step === 3) drawDesk();
  if (step === 1) drawTry();
  if (step === 2) drawBar();
  if (step === 3) drawChoices();
}

/** The stage's menu bar says the time it is now, in this Mac's own way of
 *  writing it, so it reads as the person's menu bar and not a picture of
 *  somebody else's; set again as each minute turns. */
function tick() {
  const now = new Date();
  const day = now.toLocaleDateString(undefined, { weekday: "short" });
  const time = now.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  for (const clock of document.querySelectorAll("[data-clock]")) clock.textContent = `${day} ${time}`;
  setTimeout(tick, 60000 - (now.getSeconds() * 1000 + now.getMilliseconds()) + 50);
}

// --- Step 0's stage: one press, every microphone ---------------------------

function playEvery(at = 0) {
  const devs = [...document.querySelectorAll("#devs .dev")];
  const late = document.querySelector("#devs .dev.late");
  const keys = $("every-keys");
  const press = () => {
    keys.classList.add("down");
    setTimeout(() => keys.classList.remove("down"), 180);
  };
  const mute = (muted) =>
    devs.forEach((dev, i) =>
      setTimeout(() => {
        dev.classList.toggle("muted", muted);
        dev.querySelector(".word").textContent = muted ? "Muted" : "On";
      }, i * 70),
    );
  const beats = [
    [900, () => { press(); mute(true); }],
    [1500, () => late.classList.add("here")],
    [1900, () => { press(); mute(false); }],
    [1500, () => late.classList.remove("here")],
    [900, () => {}],
  ];
  const [wait, run] = beats[at % beats.length];
  later("every", wait, () => {
    run();
    playEvery(at + 1);
  });
}

// --- Step 3's stage: a hold, over and over --------------------------------

function playHold(holding) {
  demoHolding = holding;
  draw();
  later("hold", holding ? 2600 : 1300, () => playHold(!holding));
}

// --- The way through --------------------------------------------------------

function show(at) {
  for (const name of ["every", "hold", "panel", "peek"]) stop(name);
  step = at;
  peek = null;
  for (const scene of document.querySelectorAll("[data-scene]")) {
    scene.hidden = !scene.dataset.scene.split(" ").includes(SCENE_OF[at]);
  }
  for (const section of document.querySelectorAll("[data-step]")) section.hidden = section.dataset.step !== String(at);
  [...$("dots").children].forEach((dot, i) => dot.classList.toggle("on", i === at));
  $("back").hidden = at === 0;
  $("failed").hidden = true;
  if (at === 0) playEvery();
  if (at === 2) {
    panelOpen = panelSeen;
    if (!panelSeen) later("panel", 1400, () => { panelOpen = true; panelSeen = true; draw(); });
  }
  if (at === 3) playHold(false);
  // Drawn now the stage is shown: the panel and the ring are placed by where
  // the icon is, which reading it lays out. Not on an animation frame, which
  // WebKit holds back for a window behind another app.
  draw();
}

function finish() {
  for (const name of ["every", "hold", "panel"]) stop(name);
  $("tour").hidden = true;
  $("finish").hidden = false;
  const mark = $("finish-mark");
  mark.querySelectorAll("i").forEach((piece) => piece.remove());
  if (!reduced) {
    CONFETTI.forEach(([x, y, turn], at) => {
      const piece = document.createElement("i");
      piece.style.setProperty("--x", `${x}px`);
      piece.style.setProperty("--y", `${y}px`);
      piece.style.setProperty("--turn", `${turn}deg`);
      piece.style.background = CONFETTI_COLOURS[at % CONFETTI_COLOURS.length];
      piece.style.animationDelay = `${(at % 4) * 0.04}s`;
      mark.prepend(piece);
    });
  }
  $("finish-done").focus({ preventScroll: true });
}

/** Where each piece of confetti flies to from the middle of the mark, in px,
 *  and how far it turns — the other tours' burst. */
const CONFETTI = [
  [-150, -70, 200], [-120, -110, -140], [-80, -130, 260], [-40, -120, -90], [10, -140, 180], [55, -125, -220], [95, -115, 120], [135, -90, -160],
  [165, -50, 240], [-170, -20, -120], [-135, 25, 200], [150, 10, -200], [120, 50, 150], [-95, 60, -260], [80, 70, 90], [-30, 80, 210],
];
const CONFETTI_COLOURS = ["#e11d48", "#ff9500", "#378add", "#8b5cf6", "#22a34a"];

$("next").addEventListener("click", () => {
  if (step === STEPS - 1) return finish();
  show(step + 1);
  $("next").focus({ preventScroll: true });
});
$("back").addEventListener("click", () => {
  show(step - 1);
  $("next").focus({ preventScroll: true });
});
$("again").addEventListener("click", () => {
  $("finish").hidden = true;
  $("tour").hidden = false;
  show(0);
  $("next").focus({ preventScroll: true });
});
$("to-settings").addEventListener("click", () => act(() => call("settings")));
$("finish-settings").addEventListener("click", () => act(() => call("settings")));
$("finish-done").addEventListener("click", () => act(() => call("close")));

// The menu bar step: the icon opens and closes the panel the stage draws; a
// right-click on it switches the microphones, as it does in the menu bar.
$("bar-item").addEventListener("click", () => {
  panelOpen = !panelOpen;
  panelSeen = true;
  stop("panel");
  draw();
});
for (const item of document.querySelectorAll("[data-item]")) {
  item.addEventListener("contextmenu", (event) => {
    event.preventDefault();
    if (step === 3) return;
    act(async () => took(await call("toggle")));
  });
}
$("pop-toggle").addEventListener("click", () => {
  peek = null;
  act(async () => took(await call("toggle")));
});
$("pop-devices").addEventListener("click", (event) => {
  const row = event.target.closest("[data-input]");
  if (row) act(async () => took(await call("use:" + row.dataset.input)));
});
for (const button of document.querySelectorAll("[data-peek]")) {
  button.addEventListener("click", () => {
    peek = button.dataset.peek;
    later("peek", 2400, () => { peek = null; draw(); });
    draw();
  });
}

// --- While Talking ----------------------------------------------------------

const CHOICES = ["icon", "card", "glow"];

function apply(values) {
  if (!values || typeof values !== "object") return;
  if (CHOICES.includes(values["while-talking"])) talkingChoice = values["while-talking"];
  draw();
}

async function readSettings() {
  try {
    const answer = await fetch("/__lumi__/settings");
    if (answer.ok) apply(await answer.json());
  } catch {
    // Drawn with the default; the next `lumi:settings` puts it right.
  }
}

/** Saved as the Settings tab saves it: shown at once, put back if Lumi
 *  refuses it. */
function choose(value) {
  if (value === talkingChoice) return;
  const before = talkingChoice;
  talkingChoice = value;
  playHold(true);
  fetch("/__lumi__/settings", { method: "PUT", body: JSON.stringify({ "while-talking": value }) })
    .then(async (answer) => {
      if (!answer.ok) throw new Error(await answer.text());
    })
    .catch(() => {
      talkingChoice = before;
      draw();
    });
}

$("choices").addEventListener("click", (event) => {
  const button = event.target.closest("[data-choice]");
  if (button) choose(button.dataset.choice);
});
// Arrow keys move the choice, as in any group of radio buttons.
$("choices").addEventListener("keydown", (event) => {
  const by = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[event.key];
  if (!by) return;
  event.preventDefault();
  const next = CHOICES[(CHOICES.indexOf(talkingChoice) + by + CHOICES.length) % CHOICES.length];
  choose(next);
  document.querySelector(`[data-choice="${next}"]`)?.focus();
});

// --- Start ------------------------------------------------------------------

for (const mark of document.querySelectorAll("[data-icon]")) mark.innerHTML = itemIcon(mark.dataset.icon, mark.dataset.icon === "talking" && mark.classList.contains("mark"));
for (const chip of document.querySelectorAll("#devs .chip")) chip.innerHTML = svg(MIC, "on") + svg(MIC_OFF, "off");

const shortcut = shortcutRow({
  keys: $("keys"),
  status: $("status"),
  idle: "Ready in every app. Click it to change.",
  onChange: (own) => {
    keyCaps = own?.key ? capsOf(own.key) : null;
    drawKeyWords();
    draw();
  },
});

window.addEventListener("lumi:message", (event) => took(event.detail));
window.addEventListener("lumi:settings", (event) => apply(event.detail));
window.addEventListener("focus", refresh);

// Why the window is open: an update from before 0.3.0 says what is new.
call("welcome")
  .then((why) => {
    if (!why?.from) return;
    updatedFrom = String(why.from);
    $("hello").hidden = true;
    $("news").hidden = false;
    drawKeyWords();
  })
  .catch(() => {});

tick();
drawKeyWords();
show(0);
refresh();
void readSettings();
void shortcut.read();
$("next").focus({ preventScroll: true });
