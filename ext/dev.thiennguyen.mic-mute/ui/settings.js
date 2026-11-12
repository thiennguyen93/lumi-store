// Mic Mute's Settings tab (settings.html): the key, what shows while it is
// held, the virtual microphones and muting when the screen locks — one page,
// since Lumi's own Shortcuts tab is hidden for this extension.
//
// The key's row is shortcut.js's, which the Welcome window draws too.
//
// The settings are the manifest's `[[settings]]`, saved as text over
// `PUT /__lumi__/settings`; a change made elsewhere arrives as
// `lumi:settings`.

const choicesBox = document.getElementById("choices");
const cardRow = document.getElementById("locked-card-row");

// The on-off settings, each a switch: the manifest's name, and its value
// before anything is read — the manifest's default.
const SWITCHES = [
  { name: "virtual", button: document.getElementById("virtual"), on: false },
  { name: "mute-when-locked", button: document.getElementById("locked"), on: false },
  { name: "locked-card", button: document.getElementById("locked-card"), on: true },
];
const sceneTemplate = document.getElementById("scene");

const MIC = '<path d="M12 19v3"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><rect x="9" y="2" width="6" height="13" rx="3"/>';
const BARS = '<span class="bars"><i></i><i></i><i></i></span>';

// The manifest's `while-talking` options, each with what its picture adds
// over the plain desktop.
const CHOICES = [
  { value: "icon", label: "Icon Only", effect: `<div class="lens"><svg class="mic" viewBox="0 0 24 24">${MIC}</svg>${BARS}</div>` },
  { value: "card", label: "Card", effect: `<div class="talk-card"><span class="disc"><svg viewBox="0 0 24 24">${MIC}</svg></span>Talking${BARS}</div>` },
  { value: "glow", label: "Screen Glow", effect: '<div class="glow"></div>' },
];

let talking = "card";

const shortcut = shortcutRow({
  keys: document.getElementById("keys"),
  status: document.getElementById("status"),
  idle: "Tap to switch · Hold to talk",
});

function drawChoices() {
  for (const button of choicesBox.children) {
    const on = button.dataset.value === talking;
    button.setAttribute("aria-checked", String(on));
    button.tabIndex = on ? 0 : -1;
  }
}

function drawSwitches() {
  for (const each of SWITCHES) each.button.setAttribute("aria-checked", String(each.on));
  // The card is the unlock's to show only when the lock mutes.
  cardRow.classList.toggle("idle", !SWITCHES[1].on);
}

// --- Settings -------------------------------------------------------------

function apply(values) {
  if (!values || typeof values !== "object") return;
  const wanted = values["while-talking"];
  if (CHOICES.some((choice) => choice.value === wanted)) talking = wanted;
  for (const each of SWITCHES) {
    if (each.name in values) each.on = String(values[each.name]) === "true";
  }
  drawChoices();
  drawSwitches();
}

async function readSettings() {
  try {
    const answer = await fetch("/__lumi__/settings");
    if (answer.ok) apply(await answer.json());
  } catch {
    // Drawn with the defaults; the next `lumi:settings` puts it right.
  }
}

/** Save one setting, as text. The page shows the new value at once and
 *  puts the old one back if Lumi refuses it. */
async function save(patch, undo) {
  try {
    const answer = await fetch("/__lumi__/settings", { method: "PUT", body: JSON.stringify(patch) });
    if (!answer.ok) throw new Error(await answer.text());
  } catch {
    undo();
  }
}

function choose(value) {
  if (value === talking) return;
  const before = talking;
  talking = value;
  drawChoices();
  void save({ "while-talking": value }, () => {
    talking = before;
    drawChoices();
  });
}

for (const choice of CHOICES) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "choice";
  button.setAttribute("role", "radio");
  button.dataset.value = choice.value;
  const scene = document.createElement("div");
  scene.className = "scene";
  scene.setAttribute("aria-hidden", "true");
  scene.append(sceneTemplate.content.cloneNode(true));
  scene.insertAdjacentHTML("beforeend", choice.effect);
  const name = document.createElement("span");
  name.textContent = choice.label;
  button.append(scene, name);
  button.addEventListener("click", () => choose(choice.value));
  choicesBox.append(button);
}

// Arrow keys move the choice, as in any group of radio buttons.
choicesBox.addEventListener("keydown", (event) => {
  const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[event.key];
  if (!step) return;
  event.preventDefault();
  const at = CHOICES.findIndex((choice) => choice.value === talking);
  const next = CHOICES[(at + step + CHOICES.length) % CHOICES.length].value;
  choose(next);
  choicesBox.querySelector(`[data-value="${next}"]`)?.focus();
});

for (const each of SWITCHES) {
  each.button.addEventListener("click", () => {
    each.on = !each.on;
    drawSwitches();
    void save({ [each.name]: String(each.on) }, () => {
      each.on = !each.on;
      drawSwitches();
    });
  });
}

window.addEventListener("lumi:settings", (event) => apply(event.detail));

drawChoices();
drawSwitches();
void readSettings();
void shortcut.read();
