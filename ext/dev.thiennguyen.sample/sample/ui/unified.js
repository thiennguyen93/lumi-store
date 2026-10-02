// The unified window's page: size the band and the lights' corner from what
// Lumi put on the address, and hand presses on the band to Lumi.

const query = new URLSearchParams(location.search);
let bar = Number(query.get("bar")) || 52;
const lights = Number(query.get("lights")) || 92;

const band = document.getElementById("band");
const corner = document.getElementById("lights");
const last = document.getElementById("last");
const bandNow = document.getElementById("band-now");
const draw = () => {
  band.style.height = `${bar}px`;
  bandNow.textContent = `${bar} points`;
};
draw();
corner.style.width = `${lights}px`;

// `ui.set-titlebar-height`, through the sample's own `run_ui`: the band
// changes height and the traffic lights follow; the answer is the height
// Lumi made it, clamped, which is the one to draw.
async function resize(by) {
  const answer = await fetch("/__lumi__/call", {
    method: "POST",
    body: JSON.stringify({ kind: "titlebar-height", height: bar + by }),
  });
  const body = await answer.text();
  if (!answer.ok) {
    last.textContent = `set-titlebar-height refused: ${body}`;
    return;
  }
  bar = JSON.parse(body).height;
  draw();
  last.textContent = `set-titlebar-height → ${bar}`;
}
document.getElementById("shorter").addEventListener("click", () => resize(-10));
document.getElementById("taller").addEventListener("click", () => resize(10));

document.getElementById("said").textContent =
  `titlebar=${query.get("titlebar") ?? "(none)"}, bar=${query.get("bar") ?? "—"}, lights=${query.get("lights") ?? "—"}`;

const size = () => {
  document.getElementById("size").textContent = `${innerWidth} × ${innerHeight}`;
};
size();
addEventListener("resize", size);

const onControl = (event) => event.target.closest("button");

band.addEventListener("pointerdown", (event) => {
  if (event.button !== 0 || onControl(event)) return;
  event.preventDefault();
  fetch("/__lumi__/drag", { method: "POST" }).then(
    (answer) => (last.textContent = `drag → ${answer.status}`),
    (error) => (last.textContent = `drag failed: ${error}`),
  );
});

band.addEventListener("dblclick", (event) => {
  if (onControl(event)) return;
  fetch("/__lumi__/titlebar-double-click", { method: "POST" }).then(
    async (answer) => (last.textContent = `double click → ${answer.status} ${await answer.text()}`),
    (error) => (last.textContent = `double click failed: ${error}`),
  );
});

// `PUT /__lumi__/blob` with a body far over a `call`'s megabyte: random
// bytes, so nothing on the way can compress them, then the size the
// component finds stored — the two must agree, or the body was cut short.
document.getElementById("upload").addEventListener("click", async () => {
  const size = 50 * 1024 * 1024;
  const bytes = new Uint8Array(size);
  for (let at = 0; at < size; at += 65536) {
    crypto.getRandomValues(bytes.subarray(at, Math.min(at + 65536, size)));
  }
  last.textContent = "uploading…";
  const started = performance.now();
  const put = await fetch("/__lumi__/blob", { method: "PUT", body: bytes });
  const said = await put.text();
  if (!put.ok) {
    last.textContent = `upload refused (${put.status}): ${said}`;
    return;
  }
  const { blob } = JSON.parse(said);
  const answer = await fetch("/__lumi__/call", {
    method: "POST",
    body: JSON.stringify({ kind: "blob-size", blob }),
  });
  const measured = await answer.text();
  if (!answer.ok) {
    last.textContent = `blob-size refused: ${measured}`;
    return;
  }
  const stored = JSON.parse(measured).bytes;
  const seconds = ((performance.now() - started) / 1000).toFixed(1);
  last.textContent = `sent ${size}, stored ${stored} — ${stored === size ? "whole" : "CUT SHORT"} in ${seconds} s`;
});

document.getElementById("ping").addEventListener("click", () => {
  last.textContent = "a control pressed, so no drag";
});
