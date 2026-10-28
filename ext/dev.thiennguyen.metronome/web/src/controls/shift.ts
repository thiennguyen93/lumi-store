// Whether Shift is held, for the tempo's −/+ buttons: a press steps by 1,
// a press with Shift by 10 — the arrow keys' rule, so the two ways of
// nudging the tempo agree.
//
// Read from every key and pointer event the page sees, not only the press
// that steps: a press held down repeats, and Shift let go or taken in the
// middle of that should change the step from the next repeat on. A key
// event reaches the page only while it has the keyboard, which an embedded
// page in Settings often does not; a pointer event carries the modifiers
// whatever has the keyboard, so moving onto a button is enough to show
// what it will do.

import { useSyncExternalStore } from "react";

let held = false;
const listeners = new Set<() => void>();

function note(shift: boolean) {
  if (shift === held) return;
  held = shift;
  for (const listener of listeners) listener();
}

// Capture, so the value is current before any button's own handler runs.
for (const type of ["keydown", "keyup", "pointerdown", "pointermove", "pointerover"] as const) {
  window.addEventListener(type, (event) => note(event.shiftKey), true);
}
window.addEventListener("blur", () => note(false));

export function shiftHeld(): boolean {
  return held;
}

/** How far one press of −/+ moves the tempo right now. */
export function bpmStep(): number {
  return held ? 10 : 1;
}

export function useShiftHeld(): boolean {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => held,
  );
}
