// Holding the keyboard from a page: ask with `PUT /__lumi__/input-hold`, hear
// each held key as `lumi:key` (only when `keys` was asked for), let go with
// `DELETE`, and hear how it ended as `lumi:input-hold`. Built with
// textContent throughout.

const status = document.getElementById("status");
const exit = document.getElementById("exit");
const pressed = document.getElementById("pressed");

async function hold(asked) {
  pressed.replaceChildren();
  const answer = await fetch("/__lumi__/input-hold", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(asked),
  });
  const body = await answer.text();
  if (!answer.ok) {
    // Every refusal is a sentence; an older Lumi has no such route.
    status.textContent = answer.status === 404 ? "Needs Lumi 1.38.0." : body;
    return;
  }
  const held = JSON.parse(body);
  const what = held.pointer ? "keys and trackpad" : "keys";
  status.textContent = `Holding ${what} until ${new Date(held.until).toLocaleTimeString()}.`;
  // Lumi's own way out, which it also says on screen. Shown here in this
  // page's words — it is the one exit a page can never take away.
  exit.textContent = `Lumi's way out: hold ${held.exit.keys.join(" + ")} for ${held.exit.holdMs / 1000} seconds.`;
}

document.getElementById("keys").addEventListener("click", () => hold({ seconds: 10, keys: true }));
// The pointer held too, and no key read: nothing on screen can be clicked,
// this page's Release included, so the chord and the deadline are the exits.
document.getElementById("all").addEventListener("click", () => hold({ seconds: 10, pointer: true }));
document.getElementById("release").addEventListener("click", () => {
  fetch("/__lumi__/input-hold", { method: "DELETE" }).catch(() => {});
});

window.addEventListener("lumi:key", (event) => {
  const { code, down, repeat, time } = event.detail;
  const row = document.createElement("li");
  row.textContent = `${code} ${down ? "down" : "up"}${repeat ? " (repeat)" : ""} at ${time} ms`;
  pressed.prepend(row);
  while (pressed.children.length > 12) {
    pressed.lastElementChild.remove();
  }
});

window.addEventListener("lumi:input-hold", (event) => {
  status.textContent = `The hold ended: ${event.detail.reason}.`;
  exit.textContent = "";
});
