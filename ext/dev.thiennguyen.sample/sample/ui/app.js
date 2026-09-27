// The whole bridge, exercised once each:
//
//   GET  /__lumi__/settings   — the same merged object the wasm reads
//   PUT  /__lumi__/settings   — declared fields only; the host filters
//   POST /__lumi__/call       — lands in the extension's run-ui export,
//                               under the same budget and capability
//                               gate as a command (the preview, the
//                               translate button, the profile line and
//                               the footer)
//
// Same-origin fetch is the only thing this page can do: the CSP the host
// stamps on every response is `default-src 'self'`, so a request to
// anywhere else never leaves the webview.

const target = document.getElementById("target");
const saved = document.getElementById("saved");
const text = document.getElementById("text");
const preview = document.getElementById("preview");
const said = document.getElementById("said");
const profile = document.getElementById("profile");
const running = document.getElementById("running");

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

// Asked on every open rather than remembered: the person may have switched
// profile since the window last drew, and nothing tells the page.
async function showProfile() {
  try {
    const { activeName, count } = await call({ kind: "profile" });
    // The language is a per-profile setting, so the page says whose it is
    // editing — and says nothing when there is only one profile to be in.
    profile.textContent =
      count > 1
        ? `Live profile: ${activeName} (one of ${count}). The language below is saved for ${activeName}; each profile keeps its own.`
        : "";
  } catch (err) {
    profile.textContent = String(err.message || err);
  }
}

// Which Lumi this is. The edition is said only when it is Pro — Lumi never
// labels a free copy, and neither should anything drawn inside it.
async function showRunning() {
  try {
    const { version, edition } = await call({ kind: "about" });
    running.textContent =
      edition === "pro" ? `Running in Lumi ${version} · Pro` : `Running in Lumi ${version}`;
  } catch (err) {
    running.textContent = String(err.message || err);
  }
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
showProfile();
showRunning();
