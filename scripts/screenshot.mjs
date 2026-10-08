// A store picture, taken the same way every time: headless Chrome at a
// fixed size, a page served by scripts/preview_ui.py, and a scene script
// run in it first — keys pressed, a field filled — so the picture shows the
// extension in use. THEME=dark for prefers-color-scheme: dark; without it, a
// promo page's own `data-theme` (the shot's `theme`) decides.
//
//   node scripts/screenshot.mjs <url> <out.png> [scene.js] [width] [height] [scale]
//
// The store's pictures are the promo pages, at 1280×800 and scale 1:
//
//   node scripts/screenshot.mjs "http://127.0.0.1:5191/__promo__/?shot=1" \
//     ext/dev.thiennguyen.keytest/shots/1-clean.png \
//     scripts/preview/shots/dev.thiennguyen.keytest-1.js 1280 800 1
//
// Headline, callout and page for each shot are in
// scripts/preview/promo/<id>.json; the scenes in scripts/preview/shots/.

import { spawn } from "node:child_process";
import { readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const [url, out, scriptFile, w = "800", h = "480", scale = "2"] = process.argv.slice(2);
const script = scriptFile ? readFileSync(scriptFile, "utf8") : "";
const port = 9333;
// A scene may start sound — a game playing to its music, on the audio
// clock — with no press to let it: no autoplay gate, and nothing heard.
const chrome = spawn(
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  [
    "--headless=new",
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${mkdtempSync(join(tmpdir(), "shoot-"))}`,
    "--hide-scrollbars",
    "--autoplay-policy=no-user-gesture-required",
    "--mute-audio",
    "about:blank",
  ],
  { stdio: "ignore" },
);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let target;
for (let i = 0; i < 50 && !target; i++) {
  await sleep(200);
  try {
    const list = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
    target = list.find((t) => t.type === "page");
  } catch {}
}
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener("open", r));
let id = 0;
const pending = new Map();
ws.addEventListener("message", (e) => {
  const msg = JSON.parse(e.data);
  if (msg.id && pending.has(msg.id)) {
    pending.get(msg.id)(msg);
    pending.delete(msg.id);
  }
});
const send = (method, params = {}) =>
  new Promise((r) => {
    const n = ++id;
    pending.set(n, r);
    ws.send(JSON.stringify({ id: n, method, params }));
  });
await send("Emulation.setDeviceMetricsOverride", { width: +w, height: +h, deviceScaleFactor: +scale, mobile: false });
const scheme = (value) =>
  send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value }] });
await scheme(process.env.THEME || "light");
await send("Emulation.setFocusEmulationEnabled", { enabled: true });
await send("Page.enable");
await send("Page.navigate", { url });
await sleep(1500);
// A page drawn in Lumi's colours (Canvas, CanvasText) follows the system's
// scheme, not `?theme=`: a dark shot is loaded again with the scheme dark.
if (!process.env.THEME) {
  const asked = await send("Runtime.evaluate", { expression: "document.documentElement.dataset.theme" });
  if (asked.result?.result?.value === "dark") {
    await scheme("dark");
    await send("Page.reload");
    await sleep(1500);
  }
}
if (script) {
  const answer = await send("Runtime.evaluate", { expression: script, awaitPromise: true });
  if (answer.result?.exceptionDetails) console.error(JSON.stringify(answer.result.exceptionDetails));
  // What the scene says it did — "ok", or the step it could not get to.
  else if (answer.result?.result?.value !== undefined) console.log("scene:", answer.result.result.value);
  await sleep(500);
}
const shot = await send("Page.captureScreenshot", { format: "png" });
writeFileSync(out, Buffer.from(shot.result.data, "base64"));
console.log("wrote", out);
ws.close();
chrome.kill();
