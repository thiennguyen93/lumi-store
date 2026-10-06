// The sheet's side: what it was opened with (`GET /__lumi__/sheet`), and
// the two ways to close it — an answer, or none. Escape is the sheet's own
// to handle; Lumi's cancel is a click on its scrim.

const name = document.getElementById("name");
const error = document.getElementById("error");

// The room in Lumi's frame, sized to what is shown: the manifest's height
// holds the field and the buttons, and the error line takes more. Measured
// on the body, which has no margin, not the window.
const fit = () => {
  const { height } = document.body.getBoundingClientRect();
  fetch("/__lumi__/size", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ width: document.documentElement.clientWidth, height: Math.ceil(height) }),
  }).catch(() => {});
};
const showError = (shown) => {
  if (error.hidden === !shown) return;
  error.hidden = !shown;
  fit();
};
name.addEventListener("input", () => showError(false));

fetch("/__lumi__/sheet")
  .then((answer) => (answer.ok ? answer.json() : { data: null }))
  .then(({ data }) => {
    name.value = data && typeof data.name === "string" ? data.name : "";
    name.focus();
    name.select();
  })
  .catch(() => {});

const cancel = () => fetch("/__lumi__/sheet", { method: "DELETE" }).catch(() => {});

document.getElementById("form").addEventListener("submit", (event) => {
  event.preventDefault();
  // An empty name is no answer to "rename to what?": the sheet stays, and
  // says why.
  const result = name.value.trim();
  if (!result) return showError(true);
  fetch("/__lumi__/sheet/close", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ result }),
  }).catch(() => {});
});
document.getElementById("cancel").addEventListener("click", cancel);
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") cancel();
});
