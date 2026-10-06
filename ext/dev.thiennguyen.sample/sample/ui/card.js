// The background card: grow and shrink with `POST /__lumi__/size`, ask the
// owner to confirm with `POST /__lumi__/authenticate`, close through the
// sample's own `run_ui`. Built with textContent throughout.

const card = document.getElementById("card");
const said = document.getElementById("said");
let tall = false;

document.getElementById("grow").addEventListener("click", async () => {
  tall = !tall;
  card.classList.toggle("tall", tall);
  const answer = await fetch("/__lumi__/size", {
    method: "POST",
    body: JSON.stringify({ width: 280, height: tall ? 300 : 200 }),
  });
  const body = await answer.text();
  if (!answer.ok) {
    said.textContent = `size refused: ${body}`;
    return;
  }
  const size = JSON.parse(body);
  said.textContent = `Now ${size.width} × ${size.height} points.`;
  document.getElementById("grow").textContent = tall ? "Shorter" : "Taller";
});

document.getElementById("close").addEventListener("click", () => {
  fetch("/__lumi__/call", { method: "POST", body: JSON.stringify({ kind: "close-card" }) });
});

// Offered only where the dialog can be shown: an older Lumi answers 404.
const confirm = document.getElementById("confirm");
fetch("/__lumi__/authenticate")
  .then((answer) => (answer.ok ? answer.json() : { available: false }))
  .then(({ available }) => {
    confirm.hidden = !available;
  })
  .catch(() => {});

confirm.addEventListener("click", async () => {
  const answer = await fetch("/__lumi__/authenticate", {
    method: "POST",
    body: JSON.stringify({ reason: "show the sample's secret" }),
  });
  const body = await answer.text();
  if (!answer.ok) {
    // 503 is "cannot ask here": treated as no, like every refusal.
    said.textContent = `not confirmed: ${body}`;
    return;
  }
  said.textContent = JSON.parse(body).authenticated ? "Confirmed — it is you." : "Not confirmed.";
});
