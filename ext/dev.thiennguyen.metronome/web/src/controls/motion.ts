// Reduce Motion, as macOS sets it (System Settings › Accessibility ›
// Display), read the way WebKit hands it to a page. With it on, nothing
// swings, sweeps, grows or ripples: the beat is still shown — a metronome's
// picture of the beat is a feature, not a flourish, and it is all somebody
// who cannot hear the click has — but by light and colour changing in
// place. The CSS half is `@media (prefers-reduced-motion: reduce)` in each
// theme's sheet; this is the half for what is moved from script.

import { useSyncExternalStore } from "react";

const query = window.matchMedia("(prefers-reduced-motion: reduce)");

export function reducedMotion(): boolean {
  return query.matches;
}

export function useReducedMotion(): boolean {
  return useSyncExternalStore(
    (listener) => {
      query.addEventListener("change", listener);
      return () => query.removeEventListener("change", listener);
    },
    () => query.matches,
  );
}
