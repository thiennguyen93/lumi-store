// The preview pane's width, dragged by its left edge. Kept after every drag
// in the extension's own storage (`previewWidth`, answered back in `list`),
// which is the one that counts; the page's localStorage holds a copy only
// so the first paint is already the right width, and may be missing.

import { type PointerEvent, useCallback, useRef, useState } from "react";
import { call } from "./bridge";

const KEY = "previewWidth";
export const DEFAULT_WIDTH = 230;
const MIN_WIDTH = 180;
/** The list keeps at least this much, so titles stay readable — also when
 *  a width remembered from a wider window meets a narrower one. */
export const MIN_LIST = 240;

function saved(): number {
  try {
    const n = Number(localStorage.getItem(KEY));
    return Number.isFinite(n) && n >= MIN_WIDTH ? n : DEFAULT_WIDTH;
  } catch {
    return DEFAULT_WIDTH;
  }
}

function cache(width: number) {
  try {
    localStorage.setItem(KEY, String(width));
  } catch {
    // No copy for the first paint; the extension still has it.
  }
}

function save(width: number) {
  cache(width);
  // Best effort: a width not kept is a drag to redo, not an error to show.
  void call({ kind: "previewWidth", width }).catch(() => {});
}

function clamp(width: number, total: number): number {
  return Math.round(Math.max(MIN_WIDTH, Math.min(width, total - MIN_LIST)));
}

/** The width, and the handlers for the grip on the pane's left edge. The
 *  grip never takes focus — the caret stays in the search field. */
export function usePreviewWidth() {
  const [width, setWidth] = useState(saved);
  const drag = useRef<{ x: number; width: number; total: number; now: number } | null>(null);

  const onPointerDown = useCallback(
    (event: PointerEvent<HTMLElement>) => {
      event.preventDefault();
      const grid = event.currentTarget.closest(".body-grid");
      const total = grid?.getBoundingClientRect().width ?? 620;
      drag.current = { x: event.clientX, width, total, now: width };
      event.currentTarget.setPointerCapture(event.pointerId);
    },
    [width],
  );

  const onPointerMove = useCallback((event: PointerEvent<HTMLElement>) => {
    const d = drag.current;
    if (!d) return;
    // Dragging left widens the pane.
    d.now = clamp(d.width + d.x - event.clientX, d.total);
    setWidth(d.now);
  }, []);

  const onPointerUp = useCallback((event: PointerEvent<HTMLElement>) => {
    const d = drag.current;
    if (!d) return;
    drag.current = null;
    event.currentTarget.releasePointerCapture(event.pointerId);
    // Kept after every drag that moved it.
    if (d.now !== d.width) save(d.now);
  }, []);

  /** Double-click the grip: back to the default. */
  const onDoubleClick = useCallback(() => {
    setWidth(DEFAULT_WIDTH);
    save(DEFAULT_WIDTH);
  }, []);

  /** The width the extension kept, from `list`: it wins over the cache,
   *  except in the middle of a drag. */
  const adopt = useCallback((kept: number | null) => {
    if (kept == null || drag.current) return;
    setWidth(kept);
    cache(kept);
  }, []);

  return { width, adopt, grip: { onPointerDown, onPointerMove, onPointerUp, onDoubleClick } };
}
