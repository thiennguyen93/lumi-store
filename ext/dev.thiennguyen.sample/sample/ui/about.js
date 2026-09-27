// The About page's whole script: take Lumi's theme off the URL, and read
// one setting through the bridge to show that the page can. It has the
// whole bridge, `call` included — the extension's `run_ui` is told
// `:about` as the window's name — but an About page has nothing to ask.

const theme = new URLSearchParams(location.search).get("theme");
document.documentElement.dataset.theme = theme === "dark" ? "dark" : "light";

const NAMES = { vi: "Vietnamese", en: "English", ja: "Japanese" };

fetch("/__lumi__/settings")
  .then((answer) => (answer.ok ? answer.json() : null))
  .then((settings) => {
    const target = settings && NAMES[settings.defaultTarget];
    if (target) {
      document.getElementById("language").textContent =
        `Translating into ${target} — change it under the Settings tab.`;
    }
  })
  .catch(() => {});
