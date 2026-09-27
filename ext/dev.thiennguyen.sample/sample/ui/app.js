// The whole bridge, exercised once each:
//
//   GET  /__lumi__/settings   — the same merged object the wasm reads
//   PUT  /__lumi__/settings   — declared fields only; the host filters
//   POST /__lumi__/call       — lands in the extension's run-ui export,
//                               under the same budget and capability
//                               gate as a command
//
// Same-origin fetch is the only thing this page can do: the CSP the host
// stamps on every response is `default-src 'self'`, so a request to
// anywhere else never leaves the webview.

const target = document.getElementById("target");
const saved = document.getElementById("saved");
const text = document.getElementById("text");
const preview = document.getElementById("preview");
const said = document.getElementById("said");

async function call(request) {
  const answer = await fetch("/__lumi__/call", {
    method: "POST",
    body: JSON.stringify(request),
  });
  const body = await answer.text();
  if (!answer.ok) throw new Error(body);
  return JSON.parse(body);
}

async function refreshPreview() {
  if (!text.value.trim()) {
    preview.textContent = "—";
    return;
  }
  try {
    const { url } = await call({ kind: "preview", text: text.value });
    preview.textContent = url;
  } catch (err) {
    preview.textContent = String(err.message || err);
  }
}

async function load() {
  const answer = await fetch("/__lumi__/settings");
  const settings = await answer.json();
  if (settings.defaultTarget) target.value = settings.defaultTarget;
}

target.addEventListener("change", async () => {
  saved.textContent = "";
  const answer = await fetch("/__lumi__/settings", {
    method: "PUT",
    body: JSON.stringify({ defaultTarget: target.value }),
  });
  saved.textContent = answer.ok ? "Saved." : await answer.text();
  refreshPreview();
});

text.addEventListener("input", refreshPreview);

document.getElementById("go").addEventListener("click", async () => {
  said.textContent = "";
  try {
    await call({ kind: "translate", text: text.value });
  } catch (err) {
    // A refusal reads back as text — a missing capability, a spent
    // budget — worded by the host or the extension itself.
    said.textContent = String(err.message || err);
  }
});

load().then(refreshPreview);
