// The list's two ends fade out while there is more of it past them: the
// page marks which ends have rows hidden beyond (`data-above`,
// `data-below`) and panel.css turns each into a soft edge. An end with
// nothing past it stays sharp, so the first and last rows read whole.

import { type RefObject, useEffect } from "react";

/** Under a pixel of scroll left is the end: fractional scroll positions
 *  on a scaled display never quite reach it. */
const SLACK = 1;

export function useScrollFade(ref: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const box = ref.current;
    if (!box) return;
    const mark = () => {
      box.toggleAttribute("data-above", box.scrollTop > SLACK);
      box.toggleAttribute("data-below", box.scrollHeight - box.clientHeight - box.scrollTop > SLACK);
    };
    mark();
    box.addEventListener("scroll", mark, { passive: true });
    // The panel resized, or rows came, went or moved (a search, a pin), or
    // one changed inside — folded away, opened — without the box resizing.
    const sized = new ResizeObserver(mark);
    sized.observe(box);
    const changed = new MutationObserver(mark);
    changed.observe(box, { childList: true, subtree: true });
    return () => {
      box.removeEventListener("scroll", mark);
      sized.disconnect();
      changed.disconnect();
    };
  }, [ref]);
}
