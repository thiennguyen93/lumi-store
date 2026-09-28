// The sample's installer. Everything goes through the installer bridge:
//
//   GET  /__lumi__/install   the settings schema and what each field holds
//   PUT  /__lumi__/settings  hold a value until Install (declared fields only)
//   POST /__lumi__/install   install the extension with those values
//   POST /__lumi__/cancel    abandon the install; nothing is written
//
// Lumi closes this window itself after Install or Cancel, so the page
// never has to. The DOM is built with textContent throughout — the labels
// come out of a manifest, and nothing out of a file goes through innerHTML.

const FIELD = "defaultTarget";

const heading = document.getElementById("heading");
const label = document.getElementById("target-label");
const target = document.getElementById("target");
const said = document.getElementById("said");
const install = document.getElementById("install");
const cancel = document.getElementById("cancel");

function say(text) {
  said.textContent = text || "";
}

// The select is drawn from the manifest's own options rather than repeated
// here, so a language added to [[settings]] shows up with no edit to this
// file.
async function load() {
  const response = await fetch("/__lumi__/install");
  if (!response.ok) throw new Error(await response.text());
  const info = await response.json();

  heading.textContent = `Set up ${info.name}`;
  document.title = `Set up ${info.name}`;

  const field = (info.settings || []).find((one) => one.name === FIELD);
  if (!field) throw new Error(`${info.name} declares no ${FIELD} setting.`);
  label.textContent = field.label || FIELD;
  target.replaceChildren(
    ...(field.options || []).map((option) => {
      const element = document.createElement("option");
      element.value = option.value;
      element.textContent = option.label || option.value;
      return element;
    }),
  );
  target.value = (info.values && info.values[FIELD]) || field.default;
  target.disabled = false;
  install.disabled = false;
}

// Held on every change rather than sent with Install, so the answer is
// checked against the manifest the moment it is given — a refusal lands
// beside the control that caused it.
target.addEventListener("change", async () => {
  say("");
  const response = await fetch("/__lumi__/settings", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ [FIELD]: target.value }),
  });
  if (!response.ok) say(await response.text());
});

install.addEventListener("click", async () => {
  say("");
  install.disabled = true;
  cancel.disabled = true;
  install.textContent = "Installing…";
  try {
    const response = await fetch("/__lumi__/install", { method: "POST" });
    if (!response.ok) throw new Error(await response.text());
    // Lumi closes the window; nothing left to do here.
  } catch (err) {
    say(err instanceof Error ? err.message : String(err));
    install.disabled = false;
    cancel.disabled = false;
    install.textContent = "Install";
  }
});

cancel.addEventListener("click", () => {
  fetch("/__lumi__/cancel", { method: "POST" }).catch(() => {});
});

load().catch((err) => {
  say(err instanceof Error ? err.message : String(err));
});
