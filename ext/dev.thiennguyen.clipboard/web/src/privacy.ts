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
  /** "Is it you?" answered yes since everything was last covered: with
   *  "Confirm it's you before showing", later shows do not ask again. */
  confirmed: boolean;
}

const NONE: ReadonlySet<string> = new Set();

export const VEIL_OFF: Veil = { on: false, all: false, except: NONE, confirmed: false };

/** The switch as the extension says it stands. Turned on — from the menu
 *  bar, the command, the Settings tab or here — covers everything, even a
 *  row shown before it was last turned off; unchanged keeps what is shown. */
export function adopt(veil: Veil, on: boolean): Veil {
  if (on === veil.on) return veil;
  return { on, all: false, except: NONE, confirmed: false };
}

export function isCovered(veil: Veil, id: string): boolean {
  return veil.on && veil.all === veil.except.has(id);
}

/** Whether privacy mode covers a row of this kind at all. Not a colour: its
 *  row already shows the whole value and its swatch — the history keeps a
 *  colour only when the copy is one colour value and nothing else — so its
 *  preview, the same value drawn larger, has nothing a cover would keep. */
export function conceals(kind: string): boolean {
  return kind !== "color";
}

/** Whether a row's preview is covered: privacy mode covers its kind, and it
 *  was not shown. The one question the panel asks. */
export function covers(veil: Veil, row: { id: string; kind: string }): boolean {
  return conceals(row.kind) && isCovered(veil, row.id);
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
  return { ...veil, all: true, except: NONE };
}

/** Whether every row is shown — what the show-or-hide-all key would undo. */
export function allShown(veil: Veil): boolean {
  return veil.on && veil.all && !veil.except.size;
}

/** Everything covered again, and the confirmation forgotten with it: the
 *  next show asks again. */
export function coverAll(veil: Veil): Veil {
  return veil.all || veil.except.size || veil.confirmed ? { ...veil, all: false, except: NONE, confirmed: false } : veil;
}

/** "Is it you?" said yes. */
export function confirm(veil: Veil): Veil {
  return veil.confirmed ? veil : { ...veil, confirmed: true };
}

/** Whether showing has to ask "Is it you?" first: the person asked for it
 *  ("Confirm it's you before showing"), and nothing has said yes since
 *  everything was last covered — nor an unlock of the history that still
 *  holds (`isUnlocked`). */
export function needsConfirm(veil: Veil, asked: boolean, unlocked: boolean): boolean {
  return asked && veil.on && !veil.confirmed && !unlocked;
}

/** History lock, as the panel holds it: on or off, until when an unlock
 *  from an earlier opening holds, whether this opening was unlocked
 *  ("Lock again: when the panel closes", which keeps nothing — held while
 *  the panel is up, a pinned one in the background included: it has not
 *  closed), and whether the extension has said yet — the panel's first
 *  list. */
export interface Lock {
  on: boolean;
  until: number | null;
  here: boolean;
  known: boolean;
}

export const LOCK_OFF: Lock = { on: false, until: null, here: false, known: true };

/** The lock as a panel opens, before its first list says how it stands:
 *  locked — nothing read, shown or done meanwhile — but drawn as neither
 *  locked nor open (`showsLock`). Started off instead, a locked history
 *  showed the open panel — the search, the filters, the paste keys — until
 *  that answer came; started on and drawn, an unlocked one would show the
 *  lock card as it opens. */
export const LOCK_UNKNOWN: Lock = { on: true, until: null, here: false, known: false };

export function isLocked(lock: Lock, now: number): boolean {
  return lock.on && !lock.here && !(lock.until !== null && lock.until > now);
}

/** Whether the panel shows that it is locked — the lock card, Unlock and
 *  its key, and asking "Is it you?" as it opens: locked, and known to be. */
export function showsLock(lock: Lock, now: number): boolean {
  return lock.known && isLocked(lock, now);
}

/** Whether the history is unlocked — this opening, or by an earlier unlock
 *  that still holds — which counts as a yes for showing too. */
export function isUnlocked(lock: Lock, now: number): boolean {
  return lock.on && !isLocked(lock, now);
}

/** Whether a `lumi:keyboard` change is the keyboard leaving the panel —
 *  held, then not. Lumi tells `held: false` again for every hover of a
 *  pinned panel without the keyboard; only the first one after holding it
 *  is a leaving. */
export function keyboardLeft(wasHeld: boolean, held: boolean): boolean {
  return wasHeld && !held;
}

/** How long the keyboard stays away from the panel before that counts as
 *  the person leaving it. For Lumi 1.36.0 only: just after macOS's "Is it
 *  you?" dialog answers, it hands the panel the keyboard back, macOS gives
 *  it to the app in front a moment later, and Lumi takes it back — and it
 *  tells the panel each step, `false` then `true` within milliseconds,
 *  which covered again the show the dialog had just said yes to.
 *  Lumi 1.36.1 tells the page that asked nothing of the keyboard until it
 *  is back. Goes once `min-lumi-version` reaches 1.36.1. */
export const AWAY_MS = 250;
