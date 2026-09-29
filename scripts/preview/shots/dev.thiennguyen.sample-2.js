(async () => {
  const doc = document.querySelector("iframe").contentDocument;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const text = doc.querySelector("textarea");
  text.value = "Good morning";
  text.dispatchEvent(new Event("input", { bubbles: true }));
  await sleep(300);
  return "ok";
})()
