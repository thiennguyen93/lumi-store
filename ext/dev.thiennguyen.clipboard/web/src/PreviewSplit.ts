// Where the line across the preview sits — between a picture and the text
// read in it, or a copy and what it expands to — dragged up or down. One
// place for both, so the line stays put while the list is walked over the
// two kinds. Kept after every drag in the extension's own storage
// (`previewSplit`, answered back in `list`), which is the one that counts;
// the page's localStorage holds a copy only so the first paint already has
// it, as `PreviewWidth` does. Null is the page's own place (`--upper-basis`
// on `.card`).

import { type PointerEvent, useCallback, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { call } from "./bridge";

const KEY = "previewSplit";
/** What a kept height may be — the extension's own bounds. */
const MIN_KEPT = 40;
const MAX_KEPT = 2000;

const keepable = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n) && n >= MIN_KEPT && n <= MAX_KEPT;

function saved(): number | null {
  try {
    const n = Number(localStorage.getItem(KEY) ?? NaN);
    return keepable(n) ? n : null;
  } catch {
    return null;
  }
}

function cache(height: number | null) {
  try {
    if (height == null) localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, String(height));
  } catch {
    // No copy for the first paint; the extension still has it.
  }
}

function save(height: number | null) {
  cache(height);
  // Best effort: a split not kept is a drag to redo, not an error to show.
  void call({ kind: "previewSplit", height }).catch(() => {});
}

/** The upper part's height for a drag of `moved` px from `start`, held
 *  between the upper part's floor and what the parts under the line can
 *  give up before reaching theirs. */
function dragged(start: number, moved: number, floor: number, room: number): number {
  return Math.round(Math.max(floor, Math.min(start + moved, start + room)));
}

/** How far a part's height is above its own floor (`min-height`). */
function spare(part: Element): number {
  const floor = Number.parseFloat(getComputedStyle(part).minHeight);
  return Math.max(0, part.getBoundingClientRect().height - (Number.isFinite(floor) ? floor : 0));
}

/** The height, and the handlers for the grip on the line. The grip sits in
 *  the part under the line; the part above is the one before it. Never
 *  takes focus — the caret stays in the search field. */
export function usePreviewSplit() {
  const [height, setHeight] = useState(saved);
  const drag = useRef<{ y: number; start: number; floor: number; room: number; now: number } | null>(null);

  const onPointerDown = useCallback((event: PointerEvent<HTMLElement>) => {
    event.preventDefault();
    const grip = event.currentTarget;
    const lower = grip.parentElement;
    const upper = lower?.previousElementSibling;
    if (!lower || !upper) return;
    // Caught, the line is pinned where it is drawn, and so takes the floors
    // a dragged line goes down to (`[data-split]`) — at once, for them to be
    // measured below, and with nothing on screen moving.
    flushSync(() => setHeight(Math.round(upper.getBoundingClientRect().height)));
    const start = upper.getBoundingClientRect().height;
    // The room the line can move down: what the part under it — and the
    // links sharing its half — hold beyond their floors. Up, the part
    // above stops at its own.
    let room = 0;
    for (let part: Element | null = lower; part && !part.classList.contains("card-foot"); part = part.nextElementSibling) {
      room += spare(part);
    }
    const floor = start - spare(upper);
    drag.current = { y: event.clientY, start, floor, room, now: Math.round(start) };
    grip.setPointerCapture(event.pointerId);
  }, []);

  const onPointerMove = useCallback((event: PointerEvent<HTMLElement>) => {
    const d = drag.current;
    if (!d) return;
    d.now = dragged(d.start, event.clientY - d.y, d.floor, d.room);
    setHeight(d.now);
  }, []);

  const onPointerUp = useCallback((event: PointerEvent<HTMLElement>) => {
    const d = drag.current;
    if (!d) return;
    drag.current = null;
    event.currentTarget.releasePointerCapture(event.pointerId);
    // Kept after every drag that moved it.
    if (d.now !== Math.round(d.start) && keepable(d.now)) save(d.now);
  }, []);

  /** Double-click the line: back where the page draws it. */
  const onDoubleClick = useCallback(() => {
    setHeight(null);
    save(null);
  }, []);

  /** The height the extension kept, from `list`: it wins over the cache,
   *  except in the middle of a drag. */
  const adopt = useCallback((kept: number | null | undefined) => {
    if (drag.current) return;
    const height = keepable(kept) ? kept : null;
    setHeight(height);
    cache(height);
  }, []);

  return { height, adopt, grip: { onPointerDown, onPointerMove, onPointerUp, onDoubleClick } };
}

export type SplitGrip = ReturnType<typeof usePreviewSplit>["grip"];
