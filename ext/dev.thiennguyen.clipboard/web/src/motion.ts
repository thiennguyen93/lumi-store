// The list's small movements: a row sliding to where a pin or an unpin put
// it, and a deleted row folding away. Web Animations on the rows' own
// elements, so nothing about them lives in React state; all of it is off
// when the Mac asks for reduced motion.

const SLIDE_MS = 240;
const FOLD_MS = 170;
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

/** `fold` for many rows at once — a Delete all — each a beat after the one
 *  above, the whole ripple held under a quarter second. */
export async function foldAll(rows: HTMLElement[]): Promise<() => void> {
  const step = rows.length > 1 ? Math.min(18, 240 / rows.length) : 0;
  const undos = await Promise.all(rows.map((row, i) => fold(row, i * step)));
  return () => undos.forEach((undo) => undo());
}
