// The About tab (about.html): what the extension does with the keys typed,
// its information, and the engine it types with. It reads in English whatever
// the display language, so it draws as written and reads no settings. An
// extension page may run no inline script (its CSP is `default-src 'self'`),
// so this is a file of its own.

// The page may not leave its own files, so the store page, the source, the
// mail and the developer's and the engine's pages are opened by the component
// (`ABOUT_LINKS` in src/lib.rs), which holds the addresses: the page only
// says which one. Getting started's "welcome" opens the Welcome window the
// same way (src/welcome.rs).
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

// Help tags, drawn by the page. A `title` draws nothing here: WebKit hands it
// to the app embedding the page, and Lumi's webview does nothing with it.
// Lumi's own (`/__lumi__/tip`) are for the extension's windows and panels,
// not a page embedded in Settings. So this is Lumi's Tooltip component again
// (src/Tooltip.tsx in Lumi), in its look: up after the pointer rests a moment
// and at once from the keyboard, above the element where there is room,
// kept inside the page, and gone as the pointer leaves, on a press, a scroll
// or Escape, and by itself after a few seconds — a glance, not a panel.
const HOVER_MS = 200;
const LIVES_MS = 6000;
const GAP = 6;
const MARGIN = 8;

const bubble = document.createElement("div");
bubble.className = "tip";
bubble.hidden = true;
// Spoken from each element's own description, below, rather than from this.
bubble.setAttribute("aria-hidden", "true");
document.body.append(bubble);

let wait = 0;
let life = 0;

function hideTip() {
  clearTimeout(wait);
  clearTimeout(life);
  bubble.hidden = true;
}

function showTip(element) {
  clearTimeout(wait);
  clearTimeout(life);
  bubble.textContent = element.dataset.tip;
  bubble.style.cssText = "left: 0; top: 0";
  bubble.hidden = false;
  // Narrowed to its longest line: a sentence that wraps leaves the box at its
  // widest with every line short of its edge, a panel more than a label.
  const range = document.createRange();
  range.selectNodeContents(bubble);
  const lines = [...range.getClientRects()];
  if (lines.length > 1) {
    const style = getComputedStyle(bubble);
    const chrome =
      parseFloat(style.paddingLeft) +
      parseFloat(style.paddingRight) +
      parseFloat(style.borderLeftWidth) +
      parseFloat(style.borderRightWidth);
    const fitted = Math.ceil(Math.max(...lines.map((line) => line.width)) + chrome) + 1;
    if (fitted < bubble.getBoundingClientRect().width) bubble.style.width = `${fitted}px`;
  }
  const box = element.getBoundingClientRect();
  const size = bubble.getBoundingClientRect();
  const above = box.top - GAP - size.height >= MARGIN;
  const left = Math.max(MARGIN, Math.min(box.left + box.width / 2 - size.width / 2, innerWidth - size.width - MARGIN));
  bubble.style.left = `${left}px`;
  bubble.style.top = `${above ? box.top - GAP - size.height : box.bottom + GAP}px`;
  life = setTimeout(hideTip, LIVES_MS);
}

let described = 0;
for (const element of document.querySelectorAll("[data-tip]")) {
  // What `title` gave VoiceOver, kept: the words as the element's description.
  const words = document.createElement("span");
  words.id = `tip-${++described}`;
  words.hidden = true;
  words.textContent = element.dataset.tip;
  document.body.append(words);
  element.setAttribute("aria-describedby", words.id);

  element.addEventListener("pointerenter", (event) => {
    // A touch has no hover.
    if (event.pointerType === "touch") return;
    clearTimeout(wait);
    wait = setTimeout(() => showTip(element), HOVER_MS);
  });
  element.addEventListener("pointerleave", hideTip);
  // From the keyboard, at once: a key pressed to get here, where a pointer
  // crosses these on its way elsewhere. A click focuses nothing to show.
  element.addEventListener("focus", () => {
    if (element.matches(":focus-visible")) showTip(element);
  });
  element.addEventListener("blur", hideTip);
}
for (const type of ["pointerdown", "wheel", "resize"]) addEventListener(type, hideTip, { passive: true });
addEventListener("scroll", hideTip, { capture: true, passive: true });
addEventListener("keydown", (event) => {
  if (event.key === "Escape") hideTip();
});

// A preview outside Lumi is told its theme on the URL, as Lumi tells a pane
// page; inside Lumi the embedding script has already written it.
const theme = new URLSearchParams(location.search).get("theme");
if ((theme === "light" || theme === "dark") && !document.documentElement.dataset.theme) {
  document.documentElement.dataset.theme = theme;
}
