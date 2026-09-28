// Dragging the panel by its header. The panel is borderless and its page
// has no IPC for Tauri's drag region, so the page follows the pointer
// itself and asks Lumi (`POST /__lumi__/move`) to move the window by as far
// as it went. Screen coordinates, not client ones: the window moves under
// the pointer, so a client position would chase its own tail.

import { type PointerEvent, useCallback, useRef } from "react";

async function moveBy(dx: number, dy: number): Promise<void> {
  await fetch("/__lumi__/move", { method: "POST", body: JSON.stringify({ dx, dy }) });
}

type Drag = { x: number; y: number; owed: [number, number]; busy: boolean };

/** Send what the drag owes, one move in flight at a time: what the pointer
 *  does meanwhile is added up and sent next, so a slow round trip never
 *  loses distance — not even the last bit, after the button is up. */
async function flush(d: Drag): Promise<void> {
  if (d.busy) return;
  const [dx, dy] = d.owed;
  if (!dx && !dy) return;
  d.owed = [0, 0];
  d.busy = true;
  try {
    await moveBy(dx, dy);
  } catch {
    // Refused (not in front) or no Lumi (`pnpm dev`): the panel stays.
  } finally {
    d.busy = false;
    void flush(d);
  }
}

export function useWindowDrag() {
  const drag = useRef<Drag | null>(null);

  const onPointerDown = useCallback((event: PointerEvent<HTMLElement>) => {
    // Only a plain press on the header itself — its chips are buttons.
    if (event.button !== 0 || (event.target as HTMLElement).closest("button")) return;
    // No focus change: the caret stays in the search field.
    event.preventDefault();
    drag.current = { x: event.screenX, y: event.screenY, owed: [0, 0], busy: false };
    event.currentTarget.setPointerCapture(event.pointerId);
  }, []);

  const onPointerMove = useCallback((event: PointerEvent<HTMLElement>) => {
    const d = drag.current;
    if (!d) return;
    d.owed = [d.owed[0] + event.screenX - d.x, d.owed[1] + event.screenY - d.y];
    d.x = event.screenX;
    d.y = event.screenY;
    void flush(d);
  }, []);

  const onPointerUp = useCallback((event: PointerEvent<HTMLElement>) => {
    if (!drag.current) return;
    event.currentTarget.releasePointerCapture(event.pointerId);
    drag.current = null;
  }, []);

  return { onPointerDown, onPointerMove, onPointerUp, onPointerCancel: onPointerUp };
}
