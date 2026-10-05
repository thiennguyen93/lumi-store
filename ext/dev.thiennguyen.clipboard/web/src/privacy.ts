// Privacy mode, as the panel holds it: whether it is on, and what the
// person has shown since the panel opened — some rows, or every row but
// some. A preview is covered until shown — its content not asked for, not
// drawn — and stays shown while the person moves about the list, until
// something covers everything again: the panel closing (the page is
// blanked, and this with it), the keyboard leaving a pinned panel, a while
// with nothing done, or the mode being turned on.
//
// No DOM in here, so `node --test` can reach it.

export interface Veil {
  on: boolean;
  /** Every row shown at once (the show-or-hide-all key), but `except`. */
  all: boolean;
  /** Rows the person showed one by one — or, with `all`, covered again one
   *  by one — by id. */
  except: ReadonlySet<string>;
}

const NONE: ReadonlySet<string> = new Set();

export const VEIL_OFF: Veil = { on: false, all: false, except: NONE };

/** The switch as the extension says it stands. Turned on — from the menu
 *  bar, the command, the Settings tab or here — covers everything, even a
 *  row shown before it was last turned off; unchanged keeps what is shown. */
export function adopt(veil: Veil, on: boolean): Veil {
  if (on === veil.on) return veil;
  return { on, all: false, except: NONE };
}

export function isCovered(veil: Veil, id: string): boolean {
  return veil.on && veil.all === veil.except.has(id);
}

/** Whether anything is shown: what a while with nothing done covers. */
export function anyShown(veil: Veil): boolean {
  return veil.on && (veil.all || veil.except.size > 0);
}

/** Every row covered but this one's way: shown, or covered, as asked. */
function mark(veil: Veil, id: string, shown: boolean): Veil {
  if (!veil.on || isCovered(veil, id) !== shown) return veil;
  const except = new Set(veil.except);
  if (except.has(id)) except.delete(id);
  else except.add(id);
  return { ...veil, except };
}

export function show(veil: Veil, id: string): Veil {
  return mark(veil, id, true);
}

export function hide(veil: Veil, id: string): Veil {
  return mark(veil, id, false);
}

/** The show or hide key on a row: show it, or cover it again. Off, nothing
 *  to do. */
export function toggle(veil: Veil, id: string): Veil {
  return isCovered(veil, id) ? show(veil, id) : hide(veil, id);
}

/** The show-or-hide-all key: everything shown at once — or, when it all is
 *  already, everything covered again. A row covered again by hand since
 *  counts as not all shown, so the key shows it too. */
export function toggleAll(veil: Veil): Veil {
  if (!veil.on) return veil;
  if (veil.all && !veil.except.size) return coverAll(veil);
  return { on: true, all: true, except: NONE };
}

/** Whether every row is shown — what the show-or-hide-all key would undo. */
export function allShown(veil: Veil): boolean {
  return veil.on && veil.all && !veil.except.size;
}

export function coverAll(veil: Veil): Veil {
  return veil.all || veil.except.size ? { ...veil, all: false, except: NONE } : veil;
}

/** Whether a `lumi:keyboard` change is the keyboard leaving the panel —
 *  held, then not. Lumi tells `held: false` again for every hover of a
 *  pinned panel without the keyboard; only the first one after holding it
 *  is a leaving. */
export function keyboardLeft(wasHeld: boolean, held: boolean): boolean {
  return wasHeld && !held;
}
