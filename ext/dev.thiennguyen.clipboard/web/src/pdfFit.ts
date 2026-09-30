// What a PDF's 100% fits — the sheet's width or its height — beside the list
// and in the zoomed panel, as last picked on the PDF's bar. Kept in the
// extension's own storage (`pdfFit`, answered back in `list`), which is the
// one that counts; localStorage holds a copy only so a PDF opened before the
// list has answered is already drawn the right way, as `PreviewWidth` does.

import { call } from "./bridge";

export type Fit = "width" | "height";

type Fits = { pane: Fit; zoomed: Fit };

const KEY = "pdfFit";

/** Beside the list a page is glanced at, so it starts whole; in the zoomed
 *  panel it is read, so it starts at the width. */
const DEFAULTS: Fits = { pane: "height", zoomed: "width" };

const isFit = (value: unknown): value is Fit => value === "width" || value === "height";

function read(stored: unknown): Fits {
  const fits = (stored ?? {}) as Partial<Record<keyof Fits, unknown>>;
  return {
    pane: isFit(fits.pane) ? fits.pane : DEFAULTS.pane,
    zoomed: isFit(fits.zoomed) ? fits.zoomed : DEFAULTS.zoomed,
  };
}

function cached(): Fits {
  try {
    return read(JSON.parse(localStorage.getItem(KEY) ?? "null"));
  } catch {
    return DEFAULTS;
  }
}

function cache() {
  try {
    localStorage.setItem(KEY, JSON.stringify(fits));
  } catch {
    // No copy for the first draw; the extension still has it.
  }
}

let fits = cached();

/** The fit a PDF starts at, in the zoomed panel or beside the list. */
export function fitFor(zoomed: boolean): Fit {
  return zoomed ? fits.zoomed : fits.pane;
}

/** What `list` answered: the kept fits, over the copy. */
export function adoptFits(answer: unknown) {
  fits = read(answer);
  cache();
}

/** A fit picked on the bar, kept for the next PDF shown in that place. */
export function keepFit(zoomed: boolean, fit: Fit) {
  fits = { ...fits, [zoomed ? "zoomed" : "pane"]: fit };
  cache();
  // Best effort: a fit not kept is a press to redo, not an error to show.
  void call({ kind: "pdfFit", zoomed, fit }).catch(() => {});
}
