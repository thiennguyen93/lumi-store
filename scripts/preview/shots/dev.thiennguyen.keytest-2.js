(async () => {
  const frame = document.querySelector("iframe");
  const doc = frame.contentDocument;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  frame.contentWindow.focus();
  doc.querySelector('[data-layout="iso"]').click();
  await sleep(200);
  doc.getElementById("board").focus();
  const fire = (type, code, key) =>
    doc.dispatchEvent(new KeyboardEvent(type, { code, key, bubbles: true, cancelable: true }));
  for (const c of "LUMIKEYS") {
    fire("keydown", "Key" + c, c.toLowerCase());
    await sleep(30);
    fire("keyup", "Key" + c, c.toLowerCase());
    await sleep(30);
  }
  fire("keydown", "IntlBackslash", "§");
  await sleep(30);
  fire("keyup", "IntlBackslash", "§");
  doc.querySelector("details.notes").open = true;
  await sleep(100);
  doc.getElementById("focus-hint").hidden = true;
  return "ok";
})()
