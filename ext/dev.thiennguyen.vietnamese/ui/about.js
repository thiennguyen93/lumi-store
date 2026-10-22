// The About tab (about.html): what the extension does with the keys typed,
// its information, and the engine it types with. It reads in English whatever
// the display language, so it draws as written and reads no settings. An
// extension page may run no inline script (its CSP is `default-src 'self'`),
// so this is a file of its own.

// The page may not leave its own files, so the store page, the source, the
// mail and the developer's and the engine's pages are opened by the component
// (`ABOUT_LINKS` in src/lib.rs), which holds the addresses: the page only
// says which one.
for (const link of document.querySelectorAll("[data-open]")) {
  link.addEventListener("click", () => {
    fetch("/__lumi__/call", { method: "POST", body: link.dataset.open }).catch(() => {});
  });
}

// The licence and the acknowledgements ship beside this page, each read in a
// sheet over Lumi's window (`[[sheet]]` licence and notices, document.html):
// followed as a link, a file would take the tab over, unstyled, with no way
// back. The sheet is told which it shows; nothing comes back.
for (const button of document.querySelectorAll("[data-sheet]")) {
  button.addEventListener("click", () => {
    fetch("/__lumi__/sheet", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: button.dataset.sheet, data: { doc: button.dataset.sheet } }),
    }).catch(() => {});
  });
}

// A preview outside Lumi is told its theme on the URL, as Lumi tells a pane
// page; inside Lumi the embedding script has already written it.
const theme = new URLSearchParams(location.search).get("theme");
if ((theme === "light" || theme === "dark") && !document.documentElement.dataset.theme) {
  document.documentElement.dataset.theme = theme;
}
