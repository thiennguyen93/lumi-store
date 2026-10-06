(async () => {
  const frame = document.querySelector("iframe");
  const win = frame.contentWindow;
  const doc = frame.contentDocument;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  // Cleaning, part way through a minute. The preview has no input hold, so
  // the page's `PUT /__lumi__/input-hold` is answered here as Lumi would,
  // and the page's clock is moved on so the ring has run down a third.
  const fetched = win.fetch.bind(win);
  win.fetch = (url, init = {}) =>
    String(url) === "/__lumi__/input-hold"
      ? Promise.resolve(new win.Response(JSON.stringify({ until: Date.now() + 60_000, pointer: false }), { status: 200 }))
      : fetched(url, init);
  win.focus();
  // What the question answers when Lock keyboard is pressed.
  win.dispatchEvent(new win.CustomEvent("lumi:sheet", { detail: { name: "confirm", result: "lock" } }));
  await sleep(200);
  const now = win.Date.now.bind(win.Date);
  win.Date.now = () => now() + 22_000;
  // The cloth so far: the left of the board, row by row, as Lumi relays
  // each held key to the page.
  const key = (code, down) => win.dispatchEvent(new win.CustomEvent("lumi:key", { detail: { code, down } }));
  const wiped = [
    "Escape", "F1", "F2", "F3", "F4", "F5",
    "Backquote", "Digit1", "Digit2", "Digit3", "Digit4", "Digit5", "Digit6",
    "Tab", "KeyQ", "KeyW", "KeyE", "KeyR", "KeyT", "KeyY",
    "CapsLock", "KeyA", "KeyS", "KeyD", "KeyF", "KeyG",
    "ShiftLeft", "KeyZ", "KeyX", "KeyC", "KeyV",
    "Fn", "ControlLeft", "AltLeft", "MetaLeft",
  ];
  for (const code of wiped) {
    key(code, true);
    await sleep(25);
    key(code, false);
    await sleep(25);
  }
  // And under it now: two keys held.
  key("KeyB", true);
  key("KeyH", true);
  await sleep(400);
  return "ok";
})()
