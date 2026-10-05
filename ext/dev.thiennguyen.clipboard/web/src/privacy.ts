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
 *  everything was last covered — this opening, or an unlock of the history
 *  that still holds (`unlockedByTime`). */
export function needsConfirm(veil: Veil, asked: boolean, unlockedByTime: boolean): boolean {
  return asked && veil.on && !veil.confirmed && !unlockedByTime;
}

/** History lock, as the panel holds it: on or off, until when an unlock
 *  from an earlier opening holds, and whether this opening was unlocked
 *  ("Lock again: when the panel closes", which keeps nothing). */
export interface Lock {
  on: boolean;
  until: number | null;
  here: boolean;
}

export const LOCK_OFF: Lock = { on: false, until: null, here: false };

export function isLocked(lock: Lock, now: number): boolean {
  return lock.on && !lock.here && !(lock.until !== null && lock.until > now);
}

/** Whether an unlock from an earlier opening, kept for a while, still holds
 *  — which counts as a yes for showing too. */
export function unlockedByTime(lock: Lock, now: number): boolean {
  return lock.on && lock.until !== null && lock.until > now;
}

/** Whether a `lumi:keyboard` change is the keyboard leaving the panel —
 *  held, then not. Lumi tells `held: false` again for every hover of a
 *  pinned panel without the keyboard; only the first one after holding it
 *  is a leaving. */
export function keyboardLeft(wasHeld: boolean, held: boolean): boolean {
  return wasHeld && !held;
}

/** How long the keyboard stays away from the panel before that counts as
 *  the person leaving it — a leaving is where the keyboard stays, not a
 *  `held: false` on its way somewhere. Lumi 1.36 tells one just after
 *  macOS's "Is it you?" dialog answers: it hands the panel the keyboard
 *  back, macOS gives it to the app in front a moment later, and Lumi takes
 *  it back (`owner_auth`) — `false` then `true` within milliseconds, and an
 *  unlock or a show the dialog just said yes to undone by nobody leaving. */
export const AWAY_MS = 250;
