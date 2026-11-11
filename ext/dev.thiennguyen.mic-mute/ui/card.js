// The card while talking (card.html). What it shows is the component's:
// `{"v": 1, "state": "talking" | "talking-on" | "muted" | "unmuted" | "ended"}`
// — "talking-on" a talk begun with the microphones on — posted before the
// card is opened and asked again with `call("state")` each time it shows —
// the post alone misses a page that is not loaded yet (preloading switched
// off, the first press after a launch). "talking" stays until the component
// closes the card at the key's release; the two passing states are read for
// a moment and then put away by asking the component, which ignores the ask
// if a new talk has begun meanwhile, so a late timer never closes it.

const card = document.querySelector(".card");
const title = document.getElementById("title");
const sub = document.getElementById("sub");

const SHOWN = {
  talking: { title: "Talking", sub: "", stay: 0 },
  // A talk begun with the microphones on ends muted, which "Talking" alone
  // does not say: the Muted after it read as a surprise. From muted, letting
  // go is back where the person was, and needs no line (the owner,
  // 2026-11-11). Drawn as "talking".
  "talking-on": { title: "Talking", sub: "Let go to mute", stay: 0, look: "talking" },
  muted: { title: "Muted", sub: "", stay: 1000 },
  unmuted: { title: "Unmuted", sub: "", stay: 1000 },
  ended: { title: "Muted", sub: "Push to Talk ended", stay: 1500 },
};

let away = null;

// Never a press, a scroll or a hover: every opening starts taking
// everything, so each showing says so again.
function passThrough() {
  fetch("/__lumi__/click-through", { method: "POST", body: JSON.stringify({ takes: "none" }) }).catch(() => {});
}

// The window at the size of what it shows: "Muted" with its second line is
// wider than "Talking".
let fitted = "";
function fit() {
  const box = card.getBoundingClientRect();
  const width = Math.ceil(box.width);
  const height = Math.ceil(box.height);
  if (!width || !height || fitted === `${width}x${height}`) return;
  fitted = `${width}x${height}`;
  fetch("/__lumi__/size", { method: "POST", body: JSON.stringify({ width, height }) }).catch(() => {});
}

function show(told) {
  const shown = SHOWN[told.state];
  if (!shown) return;
  clearTimeout(away);
  card.dataset.state = shown.look || told.state;
  title.textContent = shown.title;
  sub.textContent = shown.sub;
  sub.hidden = !shown.sub;
  fit();
  if (shown.stay) {
    away = setTimeout(() => {
      fetch("/__lumi__/call", { method: "POST", body: "done" }).catch(() => {});
    }, shown.stay);
  }
}

async function refresh() {
  passThrough();
  try {
    const answer = await fetch("/__lumi__/call", { method: "POST", body: "state" });
    const said = answer.ok ? await answer.json() : null;
    if (said?.v === 1) show(said);
  } catch {
    // Kept as it was: a post brings the next state.
  }
  fit();
}

window.addEventListener("lumi:message", (event) => {
  if (event.detail?.v === 1) show(event.detail);
});
window.addEventListener("lumi:shown", refresh);
window.addEventListener("lumi:hidden", () => clearTimeout(away));

refresh();
