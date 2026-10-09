// Whether the panel is on screen, for a page Lumi keeps between openings
// (`keep-alive`, Lumi 1.45). Put away, the page is only hidden: it hears
// `lumi:hidden` as the panel goes and `lumi:shown` when it is back, the two
// always in pairs, and every opening after the first is the same page shown
// again. What an opening does — the opening list, "Is it you?", reading the
// images not read yet — waits here for the panel to be on screen
// (`whenShown`), and what a reload used to forget is forgotten on
// `lumi:hidden` (`onHidden`, and `main.tsx` mounting the panel afresh).
//
// On an older Lumi neither event comes: the page is blanked when the panel
// goes and loaded again when it opens, on screen, so everything here runs at
// once, as before.
//
// `listen` runs first thing in `main.tsx`, before anything is drawn: a page
// loaded hidden — ahead of its first opening, as Lumi 1.45 loads a kept
// panel's page when the extension loads; put away before it finished
// loading; or loaded again by WebKit after its process ended — starts
// hidden, and holds its opening for `lumi:shown`.

/** The panel is put away. */
let hidden = typeof document !== "undefined" && document.visibilityState === "hidden";

/** Hidden since the page loaded, never told so: the first time WebKit shows
 *  it is an opening too, whichever of the two Lumi's `lumi:shown` and
 *  `visibilitychange` lands first. Once Lumi has said `lumi:hidden`, only
 *  `lumi:shown` opens it — a pinned panel covered by a window and uncovered
 *  again is no opening. */
let hiddenAtLoad = hidden;

/** How many times the panel has been put away while this page was loaded:
 *  an answer to a request made before the last one is about an opening
 *  that is over. */
let generation = 0;

const waiting = new Set<() => void>();
const goneListeners = new Set<() => void>();

export function isHidden(): boolean {
  return hidden;
}

export function currentGeneration(): number {
  return generation;
}

/** Run `work` once the panel is on screen: now when it is, else when it is
 *  next shown. The answer cancels a wait not run yet. */
export function whenShown(work: () => void): () => void {
  if (!hidden) {
    work();
    return () => {};
  }
  waiting.add(work);
  return () => waiting.delete(work);
}

/** `listener` each time the panel is put away; the answer stops it. */
export function onHidden(listener: () => void): () => void {
  goneListeners.add(listener);
  return () => goneListeners.delete(listener);
}

function shown() {
  if (!hidden) return;
  hidden = false;
  hiddenAtLoad = false;
  const work = [...waiting];
  waiting.clear();
  for (const run of work) run();
}

export function listen() {
  window.addEventListener("lumi:hidden", () => {
    hidden = true;
    hiddenAtLoad = false;
    generation += 1;
    for (const listener of [...goneListeners]) listener();
  });
  window.addEventListener("lumi:shown", shown);
  document.addEventListener("visibilitychange", () => {
    if (hiddenAtLoad && document.visibilityState === "visible") shown();
  });
}
