(async () => {
  const frame = document.querySelector("iframe");
  const doc = frame ? frame.contentDocument : document;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  // What Lumi does on opening the tab (`focus = true`): the page has the
  // keyboard, so the "click to test" cover is down.
  if (frame) frame.contentWindow.focus();
  doc.getElementById("board").focus();
  const hint = doc.getElementById("focus-hint");
  hint.hidden = true;
  const fire = (type, code, key) =>
    doc.dispatchEvent(new KeyboardEvent(type, { code, key, bubbles: true, cancelable: true }));
  const codes = [];
  for (const c of "QWERTYUIOPASDFGHJKLZXCVBNM") codes.push(["Key" + c, c.toLowerCase()]);
  for (const d of "1234567890") codes.push(["Digit" + d, d]);
  codes.push(["Space", " "], ["Enter", "Enter"], ["Tab", "Tab"], ["Backspace", "Backspace"],
    ["Minus", "-"], ["Equal", "="], ["BracketLeft", "["], ["BracketRight", "]"],
    ["Semicolon", ";"], ["Quote", "'"], ["Comma", ","], ["Period", "."], ["Slash", "/"],
    ["ArrowLeft", "ArrowLeft"], ["ArrowRight", "ArrowRight"], ["ArrowUp", "ArrowUp"], ["ArrowDown", "ArrowDown"],
    ["Escape", "Escape"], ["Backquote", "`"], ["Backslash", "\\"]);
  for (const [code, key] of codes) {
    fire("keydown", code, key);
    await sleep(30);
    fire("keyup", code, key);
    await sleep(30);
  }
  // A worn E: released and pressed again a few milliseconds later.
  fire("keydown", "KeyE", "e");
  await sleep(40);
  fire("keyup", "KeyE", "e");
  await sleep(8);
  fire("keydown", "KeyE", "e");
  await sleep(40);
  fire("keyup", "KeyE", "e");
  await sleep(200);
  // Two keys held down when the picture is taken.
  fire("keydown", "ShiftLeft", "Shift");
  await sleep(40);
  fire("keydown", "KeyK", "K");
  await sleep(100);
  hint.hidden = true;
  return "ok";
})()
