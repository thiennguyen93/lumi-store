(async () => {
  const frame = document.querySelector("iframe");
  const win = frame.contentWindow;
  const doc = frame.contentDocument;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  for (let i = 0; i < 100 && !(win.metronome && doc.querySelector(".m-footer")); i++) await sleep(100);
  if (!win.metronome) return "the page never drew";
  // The preview's bridge keeps nothing for this page, so the presets are
  // made here the way a person makes them: the tempo by the arrow keys,
  // the rest by the page's own controls, then ＋ and a double-click to
  // name it.
  const press = (key, shiftKey = false) =>
    doc.body.dispatchEvent(new win.KeyboardEvent("keydown", { key, shiftKey, bubbles: true, cancelable: true }));
  const tempo = async (bpm) => {
    for (let i = 0; i < 80 && win.metronome.settings.bpm !== bpm; i++) {
      const gap = bpm - win.metronome.settings.bpm;
      press(gap > 0 ? "ArrowRight" : "ArrowLeft", Math.abs(gap) >= 10);
      await sleep(20);
    }
  };
  const signature = async (beats, unit) => {
    doc.querySelector(`.m-fraction[aria-label="${beats} ${unit}"]`).closest("button").click();
    await sleep(60);
  };
  const subdivision = async (name) => {
    doc.querySelector(`[aria-label="Subdivision"] [aria-label="${name}"]`).click();
    await sleep(60);
  };
  const keep = async (name) => {
    doc.querySelector('[aria-label="Save as preset"]').click();
    await sleep(100);
    if (!name) return;
    doc.querySelector(".m-chip.on").dispatchEvent(new win.MouseEvent("dblclick", { bubbles: true }));
    await sleep(100);
    const field = doc.querySelector(".m-chip-field");
    Object.getOwnPropertyDescriptor(win.HTMLInputElement.prototype, "value").set.call(field, name);
    field.dispatchEvent(new win.Event("input", { bubbles: true }));
    await sleep(40);
    field.dispatchEvent(new win.KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    await sleep(100);
  };
  const chip = (title) => [...doc.querySelectorAll(".m-chip")].find((one) => one.querySelector(".m-chip-title").textContent === title);

  await tempo(72);
  await keep("Warm-up");
  await tempo(96);
  await subdivision("Eighth notes");
  await keep("Scales");
  await tempo(132);
  await signature(7, 8);
  await subdivision("Quarter notes");
  await keep();
  await tempo(88);
  await signature(3, 4);
  await keep("Waltz");
  // A groove of the person's own, not saved yet: 4/4 at 120, sixteenths,
  // the third beat accented as well as the first and the last one left
  // out — each pad clicked round Accent → Normal → Silent.
  chip("Warm-up").click();
  await sleep(150);
  await tempo(120);
  await subdivision("Sixteenth notes");
  const pad = (n) => doc.querySelector(`.pad[aria-label^="Beat ${n}:"]`);
  pad(3).click();
  await sleep(60);
  pad(3).click();
  await sleep(60);
  pad(4).click();
  await sleep(150);
  doc.activeElement?.blur();
  if (!pad(3).classList.contains("accent") || !pad(4).classList.contains("mute")) return "the pads did not change";

  // Playing, and heard by nobody: the engine's own volume to 0, under a
  // page that still shows the person's.
  win.metronome.update({ ...win.metronome.settings, volume: 0 });
  doc.querySelector(".m-play").click();
  // The third beat struck, its pad flashing: the drawing stops there,
  // as the picture.
  const heard = async () => {
    for (const end = Date.now() + 10000; Date.now() < end; await sleep(4)) {
      const at = win.metronome.position();
      if (at && at.bar >= 1 && at.beat === 2 && at.frac > 0.19) return true;
    }
    return false;
  };
  if (!(await heard())) return "the beat never came round";
  win.requestAnimationFrame = () => 0;
  // A strike's flash held where it is; a colour on its way out of the
  // last beat taken to where it was going.
  for (const animation of doc.getAnimations()) {
    if (animation instanceof win.CSSTransition) animation.finish();
    else animation.pause();
  }
  await sleep(100);
  return doc.querySelector(".pad.on") ? "ok" : "no beat is lit";
})()
