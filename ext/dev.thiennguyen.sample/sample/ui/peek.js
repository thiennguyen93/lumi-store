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

window.addEventListener("lumi:message", (event) => {
  const { text: shown, chars, editable, transforms, snippet } = event.detail ?? {};
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
  if (editable === false) {
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
});

window.addEventListener("lumi:placed", (event) => {
  const { side, to, at, arrow } = event.detail ?? {};
  // On the edge facing the text, over the point it stands against.
  notch.dataset.side = side === "below" ? "below" : "above";
  notch.style.left = `${Number(arrow) || 0}px`;
  notch.title = `Placed ${side} the ${to}, at its ${at}`;
});
