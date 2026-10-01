// The list's small movements: a row sliding to where a pin or an unpin put
// it, a deleted row folding away, and the selection hailing when a pinned
// panel gets the keyboard back. Web Animations on the rows' own elements,
// so nothing about them lives in React state; every movement is off when
// the Mac asks for reduced motion — the hail's blink, which does not move,
// stays.

const SLIDE_MS = 240;
const FOLD_MS = 170;
const HAIL_MS = 600;
/** macOS's own curve for things settling into place. */
const SETTLE = "cubic-bezier(.2, .8, .2, 1)";

export function moving(): boolean {
  return !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function rows(list: HTMLElement | null): HTMLElement[] {
  return list ? Array.from(list.querySelectorAll<HTMLElement>(".row[data-id]")) : [];
}

/** Where every row is now, by id — taken before a change. */
export function tops(list: HTMLElement | null): Map<string, number> {
  const at = new Map<string, number>();
  for (const row of rows(list)) at.set(row.dataset.id ?? "", row.getBoundingClientRect().top);
  return at;
}

/** After the change: each row that moved starts where it was and slides
 *  to where it is (FLIP). A row that was not there before — one ⌘Z brought
 *  back — unfolds: `fold` played backwards. */
export function slide(list: HTMLElement | null, from: Map<string, number>) {
  for (const row of rows(list)) {
    const was = from.get(row.dataset.id ?? "");
    if (was === undefined) {
      row.animate(
        [
          { opacity: 0, height: "0px", transform: "translateX(-16px)" },
          { opacity: 1, height: `${row.offsetHeight}px`, transform: "none" },
        ],
        { duration: SLIDE_MS, easing: SETTLE },
      );
      continue;
    }
    const by = was - row.getBoundingClientRect().top;
    if (Math.abs(by) < 1) continue;
    row.animate([{ transform: `translateY(${by}px)` }, { transform: "none" }], {
      duration: SLIDE_MS,
      easing: SETTLE,
    });
  }
}

/** Fold a row away before it is deleted: a nudge left, fading, its height
 *  closing so the rows below rise into the gap. Resolves when done; the
 *  returned `undo` puts it back if the delete is refused. */
export async function fold(row: HTMLElement | null, delay = 0): Promise<() => void> {
  if (!row || !moving()) return () => {};
  const animation = row.animate(
    [
      { opacity: 1, height: `${row.offsetHeight}px`, transform: "none" },
      { opacity: 0, height: "0px", transform: "translateX(-16px)" },
    ],
    { duration: FOLD_MS, delay, easing: "ease-in", fill: "forwards" },
  );
  await animation.finished.catch(() => {});
  return () => animation.cancel();
}

/** Show what the keys work on, the keyboard just handed back to a pinned
 *  panel (App.tsx): a ring inside it blinks twice, and a selected row or a
 *  chosen action pops a touch as well. The blinks stay under reduced
 *  motion, since the person still has to be told; nothing moves. From the
 *  start again when asked again before it is done. */
export function hail(el: HTMLElement | null) {
  if (!el) return;
  for (const running of el.getAnimations()) if (running.id === "hail") running.cancel();
  // On the accent the ring goes white, as the row's own text does.
  const chosen = el.getAttribute("aria-selected") === "true";
  const ink = chosen ? "rgba(255, 255, 255, 0.8)" : getComputedStyle(el).getPropertyValue("--cb-accent").trim() || "#378add";
  const off = { boxShadow: "inset 0 0 0 2px transparent", easing: "ease-in-out" };
  const on = { boxShadow: `inset 0 0 0 2px ${ink}`, easing: "ease-in-out" };
  el.animate([off, { ...on, offset: 0.2 }, { ...off, offset: 0.5 }, { ...on, offset: 0.7 }, off], {
    duration: HAIL_MS,
    id: "hail",
  });
  if (!chosen || !moving()) return;
  // At most 4px out on each side: the list's gutter is 6px and the menu's
  // 5px, and both clip what spills.
  const pop = 1 + Math.min(0.025, 8 / Math.max(el.offsetWidth, 1));
  el.animate(
    [
      { transform: "none", easing: SETTLE },
      { transform: `scale(${pop})`, offset: 0.4, easing: "ease-in-out" },
      { transform: "none" },
    ],
    { duration: HAIL_MS / 2, id: "hail" },
  );
}

/** `fold` for many rows at once — a Delete all — each a beat after the one
 *  above, the whole ripple held under a quarter second. */
export async function foldAll(rows: HTMLElement[]): Promise<() => void> {
  const step = rows.length > 1 ? Math.min(18, 240 / rows.length) : 0;
  const undos = await Promise.all(rows.map((row, i) => fold(row, i * step)));
  return () => undos.forEach((undo) => undo());
}
