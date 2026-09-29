// A store screenshot, taken the same way every time: headless Chrome at a
// fixed size (800×480, the 5:3 of the store's frames, at 2x), the page
// served by scripts/preview_ui.py, and a scene script run in it first —
// keys pressed, a tab picked — so the picture shows the extension in use.
// THEME=dark for prefers-color-scheme: dark.
//
//   node scripts/screenshot.mjs <url> <out.png> [scene.js] [width] [height] [scale]
//
// The scenes for each shot live in scripts/preview/shots/<id>-<n>.js.
import { spawn } from "node:child_process";
import { readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const [url, out, scriptFile, w = "800", h = "480", scale = "2"] = process.argv.slice(2);
const script = scriptFile ? readFileSync(scriptFile, "utf8") : "";
const port = 9333;
const chrome = spawn(
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  ["--headless=new", `--remote-debugging-port=${port}`, `--user-data-dir=${mkdtempSync(join(tmpdir(), "shoot-"))}`, "--hide-scrollbars", "about:blank"],
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
await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: process.env.THEME || "light" }] });
await send("Emulation.setFocusEmulationEnabled", { enabled: true });
await send("Page.enable");
await send("Page.navigate", { url });
await sleep(1500);
if (script) {
  const answer = await send("Runtime.evaluate", { expression: script, awaitPromise: true });
  if (answer.result?.exceptionDetails) console.error(JSON.stringify(answer.result.exceptionDetails));
  await sleep(500);
}
const shot = await send("Page.captureScreenshot", { format: "png" });
writeFileSync(out, Buffer.from(shot.result.data, "base64"));
console.log("wrote", out);
ws.close();
chrome.kill();
