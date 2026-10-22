// The sheet that shows the licence or the acknowledgements (document.html).
// The About tab opens it with `{doc}` as its data; what it shows is one of
// the two files shipped beside it, never a path the data names.

const DOCUMENTS = {
  licence: { title: "GNU General Public License", subtitle: "Version 2, or any later version" },
  notices: { title: "Acknowledgements", subtitle: "Lumi Gõ tiếng Việt is built on this work." },
};

const $ = (id) => document.getElementById(id);
const close = () => fetch("/__lumi__/sheet", { method: "DELETE" }).catch(() => {});

// A licence ships as plain text wrapped at 78 columns; read in a narrower box
// it breaks mid-sentence. So it is shown as paragraphs, in the body font,
// wrapped by the box: a blank line ends a paragraph, a line starting a list
// item starts a new one, and a line set in the middle of the page is a title
// of its own.
function reflow(text, into) {
  const paragraphs = [];
  for (const block of text.replace(/\r/g, "").split(/\n\s*\n/)) {
    let current = "";
    for (const raw of block.split("\n")) {
      const line = raw.trim();
      if (!line) continue;
      if (/^\s{8,}\S/.test(raw)) {
        if (current) paragraphs.push(current);
        paragraphs.push({ title: line });
        current = "";
        continue;
      }
      if (current && /^(\d+\.|[a-z]\)|\(?[a-z]\)|[-*•])\s/.test(line)) {
        paragraphs.push(current);
        current = line;
      } else {
        current = current ? `${current} ${line}` : line;
      }
    }
    if (current) paragraphs.push(current);
  }
  into.replaceChildren(
    ...paragraphs.map((paragraph) => {
      const p = document.createElement("p");
      const title = typeof paragraph === "object";
      p.textContent = title ? paragraph.title : paragraph;
      if (title || (paragraph === paragraph.toUpperCase() && paragraph.length < 60)) p.className = "heading";
      return p;
    }),
  );
}

const text = (file) =>
  fetch(file).then((answer) => {
    if (!answer.ok) throw new Error(String(answer.status));
    return answer.text();
  });

// The sheet as tall as what it shows, as a sheet should be, rather than the
// manifest's height with a blank under a short list: the title, the page's
// own height, and the footer. Lumi clamps it to 600, past which the page
// scrolls in its box — the licence always does.
function fit() {
  const section = document.querySelector(".scroll:not([hidden])");
  if (!section) return Promise.resolve();
  const gap = parseFloat(getComputedStyle(document.body).rowGap) || 0;
  // The page's own height, not the box's: the box stretches to the sheet, so
  // its scroll height never comes out shorter than the sheet already is.
  // Measured with the box let go of its stretch for the moment.
  section.style.flex = "none";
  const content = section.scrollHeight;
  section.style.flex = "";
  const height =
    document.querySelector("header").offsetHeight +
    content +
    document.querySelector("footer").offsetHeight +
    2 * gap;
  return fetch("/__lumi__/size", { method: "POST", body: JSON.stringify({ width: 486, height: Math.ceil(height) }) }).catch(() => {});
}

// Which page is up: the licence, the acknowledgements' list, or one work's
// page under it (`work-<name>`).
let page = "licence";

function go(to) {
  page = to;
  for (const section of document.querySelectorAll(".scroll")) section.hidden = section.id !== to;
  const work = to.startsWith("work-") ? $(to) : null;
  const doc = work ? null : DOCUMENTS[to];
  $("title").textContent = work ? work.dataset.title : doc.title;
  $("subtitle").textContent = work ? work.dataset.subtitle : doc.subtitle;
  $("back").hidden = !work;
  // A page opens at its top, its licence's box too.
  const shown = $(to);
  shown.scrollTop = 0;
  for (const box of shown.querySelectorAll(".prose")) box.scrollTop = 0;
  return fit();
}

// Into a work's page and back to the list. From the keyboard the focus
// follows — onto the back button going in, onto the work's row coming out —
// so the next key lands where the eye is. From a click it does not: a focus
// moved by script draws its ring in WebKit, and a ring on a row just clicked
// reads as a fault. A click's `detail` counts the clicks; a key's is 0.
const byKeys = (event) => event.detail === 0;
function settle(element, keys) {
  if (keys) element?.focus();
  else if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
}
for (const row of document.querySelectorAll("[data-work]")) {
  row.addEventListener("click", (event) => {
    void go(`work-${row.dataset.work}`);
    settle($("back"), byKeys(event));
  });
}
function back(keys) {
  if (!page.startsWith("work-")) return;
  const from = page.slice("work-".length);
  void go("notices");
  settle(document.querySelector(`[data-work="${from}"]`), keys);
}
$("back").addEventListener("click", (event) => back(byKeys(event)));

$("done").addEventListener("click", close);
document.addEventListener("keydown", (event) => {
  // ⌘[ goes back, as it does in every Mac app with a back button.
  if (event.key === "[" && event.metaKey) {
    event.preventDefault();
    back(true);
    return;
  }
  // Escape always closes; Return as the default button's key, unless a row,
  // a link or the back button has the focus and Return is theirs.
  if (event.key === "Escape" || (event.key === "Enter" && !(event.target instanceof HTMLButtonElement && event.target.id !== "done"))) {
    event.preventDefault();
    close();
  }
});

// A project's page is opened by the component (`ABOUT_LINKS` in src/lib.rs),
// which holds the addresses; the call arrives from `:sheet:notices`.
for (const link of document.querySelectorAll("[data-open]")) {
  link.addEventListener("click", () => {
    fetch("/__lumi__/call", { method: "POST", body: link.dataset.open }).catch(() => {});
  });
}

// The licence, or the acknowledgements with the engine's licence on its page,
// as the notices file carries it: from its heading to the end of its
// disclaimer.
function load(doc) {
  if (doc === "licence") {
    return text("LICENSE.txt").then((licence) => reflow(licence, $("licence-text")));
  }
  return text("THIRD-PARTY-NOTICES.txt").then((notices) => {
    const start = notices.indexOf("BSD 3-Clause License");
    const end = notices.indexOf("SUCH DAMAGE.", start);
    if (start < 0 || end < 0) throw new Error("no BSD licence in the notices");
    reflow(notices.slice(start, end + "SUCH DAMAGE.".length), $("engine-licence"));
  });
}

// Asked for as the page loads, and the text and the size chained from it, so
// Lumi shows the sheet filled in and sized rather than empty (it waits on
// these `fetch`es).
fetch("/__lumi__/sheet")
  .then((answer) => answer.json())
  .then(({ data }) => {
    const doc = data && data.doc === "notices" ? "notices" : "licence";
    return load(doc).then(() => go(doc));
  })
  .catch(() => {
    void go("licence");
    const said = document.createElement("p");
    said.textContent = "This file could not be read.";
    $("licence-text").replaceChildren(said);
  });
