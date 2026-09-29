(async () => {
  const doc = document.querySelector("iframe").contentDocument;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  await sleep(500);
  // A colour on screen: the row the preview draws most visibly.
  const label = [...doc.querySelectorAll("*")].find(
    (el) => el.children.length === 0 && el.textContent.trim() === "#378ADD",
  );
  const row = label && (label.closest("[role=option], li, .row, button") || label.parentElement);
  row?.click();
  await sleep(400);
  doc.activeElement?.blur();
  return row ? "ok" : "no colour row";
})()
