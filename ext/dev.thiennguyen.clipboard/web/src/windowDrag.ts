// Dragging the panel by its header. The panel is borderless and its page
// has no IPC for Tauri's drag region, so on a press the page tells Lumi
// (`POST /__lumi__/drag`) and macOS takes the drag from there — the same
// window drag a title bar gets, smooth across displays of any scale.

import { type PointerEvent, useCallback } from "react";

export function useWindowDrag() {
  const onPointerDown = useCallback((event: PointerEvent<HTMLElement>) => {
    // Only a plain press on the header itself — its chips are buttons.
    if (event.button !== 0 || (event.target as HTMLElement).closest("button")) return;
    // No focus change: the caret stays in the search field.
    event.preventDefault();
    // Refused (not in front) or no Lumi (`pnpm dev`): the panel stays.
    fetch("/__lumi__/drag", { method: "POST" }).catch(() => {});
  }, []);

  return { onPointerDown };
}
