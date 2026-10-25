// The peek panel's page: what the command posted, where Lumi put the panel,
// and a button per transform the command offered. Built with textContent
// throughout — the selection is somebody's text.

const text = document.getElementById("text");
const where = document.getElementById("where");
const notch = document.getElementById("notch");
const actions = document.getElementById("actions");
const ask = document.getElementById("ask");
const query = document.getElementById("query");

// The panel opened without the keyboard, and a press does not give it the
// keyboard: without this the words typed next would go over the selection
// in the app in front. Asked on the press itself, the one Lumi checks for.
query.addEventListener("pointerdown", () => {
  fetch("/__lumi__/keyboard", { method: "POST" }).catch(() => {});
});

ask.addEventListener("submit", (event) => {
  event.preventDefault();
  if (!query.value.trim()) return;
  fetch("/__lumi__/call", { method: "POST", body: JSON.stringify({ kind: "search", query: query.value }) }).catch(() => {});
});

// The Translate button, offered wherever this Mac translates — on text
// that can't be edited too, since a translation is read, not written. What
// to translate, and into what, is worked out on the extension's side.
function translateButton() {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = "Translate";
  button.addEventListener("click", () => {
    fetch("/__lumi__/call", { method: "POST", body: JSON.stringify({ kind: "translate" }) }).catch(() => {});
  });
  return button;
}

// The Copy button, offered on any selection: the app in front copies it
// itself, so what is pasted keeps what the app keeps — its formatting, its
// links — which the text this panel was told would not.
function copyButton() {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = "Copy";
  button.addEventListener("click", () => {
    fetch("/__lumi__/call", { method: "POST", body: JSON.stringify({ kind: "copy" }) }).catch(() => {});
  });
  return button;
}

// The Define button, offered for a word or a phrase when the person has a
// dictionary turned on — on text that can't be edited too, since a
// definition is read. The selection is read again and looked up on the
// extension's side.
function defineButton() {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = "Define";
  button.addEventListener("click", () => {
    fetch("/__lumi__/call", { method: "POST", body: JSON.stringify({ kind: "define" }) }).catch(() => {});
  });
  return button;
}

// The panel as tall as what it shows: a row of buttons that wraps, a summary
// over several lines. Asked of Lumi whenever the page's height changes, never
// below the 104 points the manifest declares.
const main = document.querySelector("main");
let sized = 0;
new ResizeObserver(() => {
  const height = Math.max(104, Math.ceil(main.getBoundingClientRect().height));
  if (height === sized) return;
  sized = height;
  fetch("/__lumi__/size", { method: "POST", body: JSON.stringify({ width: 360, height }) }).catch(() => {});
}).observe(main);

// The Summarize button, offered wherever the person set up a model this
// extension may ask. The extension starts the call and answers with its id;
// the summary arrives as `lumi:ai` events carrying that id, written into the
// panel as it comes. While it comes the button is Stop.
let summarizing = null;

function summarizeButton() {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = "Summarize";
  button.addEventListener("click", async () => {
    if (summarizing !== null) {
      fetch("/__lumi__/call", { method: "POST", body: JSON.stringify({ kind: "stop", call: summarizing }) }).catch(() => {});
      return;
    }
    try {
      const answer = await (await fetch("/__lumi__/call", { method: "POST", body: JSON.stringify({ kind: "summarize" }) })).json();
      if (typeof answer.call === "number") {
        summarizing = answer.call;
        button.textContent = "Stop";
        text.textContent = "";
        text.classList.add("long");
        where.textContent = "Summarizing…";
      }
    } catch {
      // The extension said why in an alert.
    }
  });
  return button;
}

window.addEventListener("lumi:ai", (event) => {
  const e = event.detail ?? {};
  if (e.id !== summarizing) return;
  if (e.kind === "asking") where.textContent = "Waiting for you to say it may go online…";
  else if (e.kind === "started") where.textContent = e.fellBack ? e.fellBack : `Summarizing with ${e.modelName}…`;
  else if (e.kind === "delta") text.textContent += e.text;
  else if (e.kind === "done" || e.kind === "failed") {
    summarizing = null;
    for (const button of actions.querySelectorAll("button")) if (button.textContent === "Stop") button.textContent = "Summarize";
    if (e.kind === "done") where.textContent = `${e.answer.modelName} · ${e.answer.where === "on-device" ? "on this Mac" : "online"}`;
    else where.textContent = e.failure === "declined" || e.failure === "stopped" ? "" : e.message;
  }
});

window.addEventListener("lumi:message", (event) => {
  // A pair not on this Mac yet: said, with a button that asks macOS to
  // download it — its own prompt, put up only by this press. After a prompt
  // the person declined, or while macOS is still downloading, it stays.
  if (event.detail?.download) {
    const { source, target, readiness } = event.detail;
    text.textContent = readiness
      ? `${source} → ${target} isn't ready yet. macOS keeps downloading in the background.`
      : `${source} → ${target} isn't on this Mac yet.`;
    where.textContent = "";
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = "Download…";
    button.addEventListener("click", () => {
      fetch("/__lumi__/call", { method: "POST", body: JSON.stringify({ kind: "prepare", source, target }) }).catch(() => {});
    });
    actions.replaceChildren(button);
    return;
  }
  // A translation of the selection: its first words, in place of the
  // selection's, with the languages it went between.
  if (event.detail?.translated !== undefined) {
    const { translated, chars, source, target } = event.detail;
    text.textContent = `${source} → ${target}: “${translated}${chars > translated.length ? "…" : ""}”`;
    where.textContent = "";
    return;
  }
  // A definition of the selection: the headword, how it is said, and its
  // first sense, with a button into the Dictionary app for the rest.
  if (event.detail?.defined !== undefined) {
    const { defined, said, heading, meaning, long } = event.detail;
    text.classList.add("long");
    text.textContent = `${defined}${said ? ` /${said}/` : ""} — ${heading ? `${heading}: ` : ""}${meaning}${long ? "…" : ""}`;
    where.textContent = "";
    const more = document.createElement("button");
    more.type = "button";
    more.textContent = "More in Dictionary";
    more.addEventListener("click", () => {
      fetch("/__lumi__/call", { method: "POST", body: JSON.stringify({ kind: "dictionary-app" }) }).catch(() => {});
    });
    actions.replaceChildren(more);
    return;
  }
  const { text: shown, chars, editable, transforms, snippet, translates, summarizes, defines } = event.detail ?? {};
  text.classList.remove("long");
  text.textContent = chars > 0 ? `“${shown}${chars > shown.length ? "…" : ""}”` : "Nothing is selected.";
  where.textContent = chars > 0 ? `${chars} chars` : "";
  // What was selected, on one line, ready to search for as it is or to be
  // typed over: the first words the panel was told, no more.
  query.value = chars > 0 ? (shown ?? "").replace(/\s+/g, " ").trim() : "";
  actions.replaceChildren();
  if (!(chars > 0)) return;
  // The selection is one of the person's own snippet triggers: one button
  // for it, in place of the transforms — the row has room for one idea. A
  // link is opened, so it works on text that can't be edited too; anything
  // else is written over the selection, so it needs text that can be.
  if (snippet && (snippet.link || editable !== false)) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "snippet";
    button.textContent = snippet.link ? `Open ${snippet.label}` : `Expand to “${snippet.label}”`;
    button.title = snippet.label;
    // Which snippet, and what it expands to, are worked out again on the
    // extension's side at the press — the page only says it was pressed.
    button.addEventListener("click", () => {
      fetch("/__lumi__/call", { method: "POST", body: JSON.stringify({ kind: "snippet" }) }).catch(() => {});
    });
    actions.append(button);
    return;
  }
  actions.append(copyButton());
  if (editable === false) {
    if (defines) actions.append(defineButton());
    if (translates) actions.append(translateButton());
    if (summarizes) actions.append(summarizeButton());
    const note = document.createElement("span");
    note.className = "note";
    note.textContent = "This text can't be edited here.";
    actions.append(note);
    return;
  }
  for (const { id, label } of transforms ?? []) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = label;
    // The selection is read again and written over on the extension's
    // side; Lumi closes this panel before the write, so the keys land in
    // the app holding the selection.
    button.addEventListener("click", () => {
      fetch("/__lumi__/call", { method: "POST", body: JSON.stringify({ kind: "apply", id }) }).catch(() => {});
    });
    actions.append(button);
  }
  if (defines) actions.append(defineButton());
  if (translates) actions.append(translateButton());
  if (summarizes) actions.append(summarizeButton());
});

window.addEventListener("lumi:placed", (event) => {
  const { side, to, at, arrow } = event.detail ?? {};
  // On the edge facing the text, over the point it stands against.
  notch.dataset.side = side === "below" ? "below" : "above";
  notch.style.left = `${Number(arrow) || 0}px`;
  notch.title = `Placed ${side} the ${to}, at its ${at}`;
});
