// The Welcome window. Reads the language the installer asked for, and
// offers the settings window. Built with textContent throughout, like the
// sample's other pages.

const language = document.getElementById("language");
const said = document.getElementById("said");

const NAMES = { vi: "Vietnamese", en: "English", ja: "Japanese" };

async function call(request) {
  const answer = await fetch("/__lumi__/call", {
    method: "POST",
    body: JSON.stringify(request),
  });
  const body = await answer.text();
  if (!answer.ok) throw new Error(body);
  return JSON.parse(body);
}

async function load() {
  const response = await fetch("/__lumi__/settings");
  if (!response.ok) return;
  const settings = await response.json();
  const code = settings.defaultTarget;
  if (code) {
    language.textContent = `It translates into ${NAMES[code] || code} unless a shortcut says otherwise.`;
  }
}

document.getElementById("settings").addEventListener("click", () => {
  said.textContent = "";
  call({ kind: "open-settings" }).catch((err) => {
    said.textContent = err instanceof Error ? err.message : String(err);
  });
});

load().catch(() => {});
