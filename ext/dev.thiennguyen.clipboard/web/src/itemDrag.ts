// A press on an item that starts to move becomes a drag out of the panel —
// Lumi's, not the page's (`clipboard.drag`): an HTML drag out of the webview
// carries text at best, never a file. The page only says when: past a few
// points of travel with the button still down, once per press. A press that
// never travels is still a click; a press that did is not.

import { useEffect, useRef, type PointerEvent, type MouseEvent } from "react";

/** How far a press travels before it is a drag, in CSS pixels — AppKit's
 *  own drag threshold is about this. */
const TRAVEL = 4;

type Press = { x: number; y: number; started: boolean };

export function useItemDrag(start: () => void) {
  const press = useRef<Press | null>(null);
  // The latest `start`, so a new closure each render does not matter.
  const begin = useRef(start);
  begin.current = start;

  useEffect(() => {
    // The drop target took the pointer: whatever this press was, it is over.
    const forget = () => (press.current = null);
    window.addEventListener("blur", forget);
    return () => window.removeEventListener("blur", forget);
  }, []);

  return {
    onPointerDown(event: PointerEvent) {
      // A button inside the item (a pin, a cap) is its own control.
      const onButton = event.target instanceof Element && event.target.closest("button");
      press.current = event.button === 0 && !onButton ? { x: event.clientX, y: event.clientY, started: false } : null;
    },
    onPointerMove(event: PointerEvent) {
      const at = press.current;
      if (!at || at.started) return;
      // The button came up somewhere the page did not hear it.
      if (!(event.buttons & 1)) {
        press.current = null;
        return;
      }
      if (Math.hypot(event.clientX - at.x, event.clientY - at.y) >= TRAVEL) {
        at.started = true;
        begin.current();
      }
    },
    // A press that became a drag is not also a click. (After a real drag
    // AppKit keeps the mouse-up, so usually no click comes at all; the next
    // press starts afresh either way.)
    onClickCapture(event: MouseEvent) {
      if (press.current?.started) {
        event.preventDefault();
        event.stopPropagation();
      }
      press.current = null;
    },
  };
}
