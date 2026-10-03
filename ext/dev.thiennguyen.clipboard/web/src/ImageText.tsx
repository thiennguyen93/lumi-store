// The text in a copied picture, selectable where it stands: a box over each
// word the extension's reading found (`history::Layout`), laid over the
// picture as drawn. A press on a word starts a selection and dragging
// carries it from word to word in reading order, as Live Text does; a press
// anywhere else is still the picture's own, which drags it out of the panel
// (`Pulled`). What is selected is copied by the extension from its own
// reading — the page only names the two ends.

import { useEffect, useLayoutEffect, useState, type PointerEvent, type RefObject } from "react";
import type { Frame, Layout } from "./types";

/** One end of a selection: a line of the layout and a word in it. A line
 *  read without word boxes is one word, its whole text. */
export type Spot = [number, number];

export type Picked = { from: Spot; to: Spot };

/** Whether `spot` lies between the two ends, either way round. */
function within(spot: Spot, { from, to }: Picked): boolean {
  const [first, last] = before(from, to) ? [from, to] : [to, from];
  return !before(spot, first) && !before(last, spot);
}

function before(a: Spot, b: Spot): boolean {
  return a[0] < b[0] || (a[0] === b[0] && a[1] < b[1]);
}

/** How many words the selection holds. */
export function pickedCount(layout: Layout, picked: Picked): number {
  let count = 0;
  layout.lines.forEach((line, l) => {
    const words = Math.max(1, line.words.length);
    for (let w = 0; w < words; w++) if (within([l, w], picked)) count++;
  });
  return count;
}

/** Where the picture is drawn inside its well, in the well's pixels: it is
 *  fitted (`object-fit: contain` by its max sizes), so the boxes have to
 *  follow its drawn rectangle, not the well's. */
type Drawn = { left: number; top: number; width: number; height: number };

export function ImageText({
  layout,
  picture,
  picked,
  onPick,
}: {
  layout: Layout;
  picture: RefObject<HTMLImageElement | null>;
  picked: Picked | null;
  onPick: (picked: Picked | null) => void;
}) {
  const [drawn, setDrawn] = useState<Drawn | null>(null);
  // The end the person pressed on, while the button is down.
  const [anchor, setAnchor] = useState<Spot | null>(null);

  useLayoutEffect(() => {
    const image = picture.current;
    if (!image) return;
    const measure = () =>
      image.offsetWidth && image.offsetHeight
        ? setDrawn({ left: image.offsetLeft, top: image.offsetTop, width: image.offsetWidth, height: image.offsetHeight })
        : setDrawn(null);
    measure();
    const watch = new ResizeObserver(measure);
    watch.observe(image);
    image.addEventListener("load", measure);
    return () => {
      watch.disconnect();
      image.removeEventListener("load", measure);
    };
  }, [picture]);

  // The button can come up anywhere — off the picture, out of the window.
  useEffect(() => {
    if (!anchor) return;
    const up = () => setAnchor(null);
    window.addEventListener("pointerup", up);
    window.addEventListener("blur", up);
    return () => {
      window.removeEventListener("pointerup", up);
      window.removeEventListener("blur", up);
    };
  }, [anchor]);

  if (!drawn || !layout.width || !layout.height) return null;

  const box = ([x, y, w, h]: Frame) => ({
    left: `${(x / layout.width) * 100}%`,
    top: `${(y / layout.height) * 100}%`,
    width: `${(w / layout.width) * 100}%`,
    height: `${(h / layout.height) * 100}%`,
  });

  const press = (spot: Spot) => (event: PointerEvent) => {
    if (event.button !== 0) return;
    // The word's, not the picture's: no drag out of the panel starts, and
    // the caret stays in the search field.
    event.stopPropagation();
    event.preventDefault();
    if (event.shiftKey && picked) {
      onPick({ from: picked.from, to: spot });
    } else {
      onPick({ from: spot, to: spot });
    }
    setAnchor(event.shiftKey && picked ? picked.from : spot);
  };
  const enter = (spot: Spot) => (event: PointerEvent) => {
    if (anchor && event.buttons & 1) onPick({ from: anchor, to: spot });
  };

  return (
    <div className="image-text" style={drawn} aria-hidden="true">
      {layout.lines.flatMap((line, l) => {
        const words = line.words.length ? line.words : [{ text: line.text, frame: line.frame }];
        return words.map((word, w) => {
          const spot: Spot = [l, w];
          const on = picked ? within(spot, picked) : false;
          return (
            <span
              key={`${l}.${w}`}
              className={on ? "word on" : "word"}
              style={box(word.frame)}
              onPointerDown={press(spot)}
              onPointerEnter={enter(spot)}
              // A double click takes the whole line.
              onDoubleClick={() => onPick({ from: [l, 0], to: [l, words.length - 1] })}
            />
          );
        });
      })}
    </div>
  );
}
