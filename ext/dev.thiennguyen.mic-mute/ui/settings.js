// Mic Mute's Settings tab (settings.html): the key, what shows while it is
// held, and the virtual microphones — one page, since Lumi's own Shortcuts
// tab is hidden for this extension.
//
// The key's row is shortcut.js's, which the Welcome window draws too.
//
// The two settings are the manifest's `[[settings]]`, saved as text over
// `PUT /__lumi__/settings`; a change made elsewhere arrives as
// `lumi:settings`.

const choicesBox = document.getElementById("choices");
const virtualSwitch = document.getElementById("virtual");
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
let virtual = false;

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

function drawSwitch() {
  virtualSwitch.setAttribute("aria-checked", String(virtual));
}

// --- Settings -------------------------------------------------------------

function apply(values) {
  if (!values || typeof values !== "object") return;
  const wanted = values["while-talking"];
  if (CHOICES.some((choice) => choice.value === wanted)) talking = wanted;
  if ("virtual" in values) virtual = String(values.virtual) === "true";
  drawChoices();
  drawSwitch();
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

virtualSwitch.addEventListener("click", () => {
  virtual = !virtual;
  drawSwitch();
  void save({ virtual: String(virtual) }, () => {
    virtual = !virtual;
    drawSwitch();
  });
});

window.addEventListener("lumi:settings", (event) => apply(event.detail));

drawChoices();
drawSwitch();
void readSettings();
void shortcut.read();
