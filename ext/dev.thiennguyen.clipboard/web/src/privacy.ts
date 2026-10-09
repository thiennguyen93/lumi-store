// Privacy mode, as the panel holds it: whether it is on, and what the
// person has shown since the panel opened — some rows, or every row but
// some. A preview is covered until shown — its content not asked for, not
// drawn — and stays shown while the person moves about the list, until
// something covers everything again: the panel closing — at once, or a
// while after ("Cover again after panel closes": the extension keeps what
// was shown, and hands it back to an opening within it) — or the mode
// being turned on.
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

/** What the panel showed before it last closed, handed back by the
 *  extension to an opening within "Cover again after panel closes". */
export interface Shown {
  all: boolean;
  except: string[];
  confirmed: boolean;
}

/** An opening shows again what was shown before, with privacy mode on. */
export function restore(veil: Veil, shown: Shown | null | undefined): Veil {
  if (!veil.on || !shown) return veil;
  return { ...veil, all: shown.all, except: new Set(shown.except), confirmed: shown.confirmed };
}

/** What the extension keeps of the veil while the panel is up. */
export function shownOf(veil: Veil): Shown {
  return { all: veil.all, except: [...veil.except], confirmed: veil.confirmed };
}

/** Whether showing has to ask "Is it you?" first: the person asked for it
 *  ("Confirm it's you before showing"), and nothing has said yes since
 *  everything was last covered — nor an unlock of the history that still
 *  holds (`isUnlocked`). */
export function needsConfirm(veil: Veil, asked: boolean, unlocked: boolean): boolean {
  return asked && veil.on && !veil.confirmed && !unlocked;
}

/** History lock, as the panel holds it: on or off, whether this opening
 *  has it unlocked — by "Is it you?", or by an unlock that still held as it
 *  opened ("Lock again after panel closes"); either way it stays unlocked
 *  until the panel closes, a pinned one in the background included — and
 *  whether the extension has said yet — the panel's first list. */
export interface Lock {
  on: boolean;
  here: boolean;
  known: boolean;
}

export const LOCK_OFF: Lock = { on: false, here: false, known: true };

/** The lock as a panel opens, before its first list says how it stands:
 *  locked — nothing read, shown or done meanwhile — but drawn as neither
 *  locked nor open (`showsLock`). Started off instead, a locked history
 *  showed the open panel — the search, the filters, the paste keys — until
 *  that answer came; started on and drawn, an unlocked one would show the
 *  lock card as it opens. */
export const LOCK_UNKNOWN: Lock = { on: true, here: false, known: false };

/** The lock as a list answer leaves it — `told`, the answer's `lock`:
 *  - the opening list decides it alone: an unlock from an opening before
 *    never carries over, whatever the page still holds;
 *  - a list read again while the panel is up keeps an unlock this opening
 *    made, and takes one the extension says holds;
 *  - a list read while the panel is put away and kept (`keep-alive`) leaves
 *    it locked and not yet known, as a panel opens: what an opening shows of
 *    a locked history is the opening list's to say, and "Is it you?" is
 *    asked only once it has. */
export function lockAfter(
  lock: Lock,
  told: { on: boolean; unlocked: boolean } | undefined,
  how: { opening: boolean; hidden: boolean },
): Lock {
  const on = told?.on ?? false;
  if (how.hidden) return on ? LOCK_UNKNOWN : LOCK_OFF;
  const unlocked = told?.unlocked === true;
  return { on, here: how.opening ? unlocked : lock.here || unlocked, known: true };
}

export function isLocked(lock: Lock): boolean {
  return lock.on && !lock.here;
}

/** Whether the panel shows that it is locked — the lock card, Unlock and
 *  its key, and asking "Is it you?" as it opens: locked, and known to be. */
export function showsLock(lock: Lock): boolean {
  return lock.known && isLocked(lock);
}

/** Whether the history is unlocked, which counts as a yes for showing too. */
export function isUnlocked(lock: Lock): boolean {
  return lock.on && !isLocked(lock);
}

