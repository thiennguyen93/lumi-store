(async () => {
  const frame = document.querySelector("iframe");
  const doc = frame.contentDocument;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  // The Welcome's third step, "Where do your keys go?", in Vietnamese — the
  // display language it opens in — with its stage played to the end:
  // tieengs Vieetj in, tiếng Việt out. The second, the switch's key, is
  // passed on the way.
  doc.getElementById("next").click();
  await sleep(300);
  doc.getElementById("next").click();
  for (let i = 0; i < 100; i++) {
    if (doc.getElementById("word-out").textContent.normalize() === "tiếng Việt".normalize()) return "ok";
    await sleep(100);
  }
  return "the stage never typed tiếng Việt";
})()
