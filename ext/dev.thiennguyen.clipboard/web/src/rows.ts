// The list as the panel holds it across reads. Every read of the history
// arrives as new objects, row for row, even when nothing about a row
// changed — and the panel reads it often: as it opens, after every copy,
// pin or delete, while it is put away and kept (`keep-alive`). Each row that
// did not change keeps the object it had, so a read that changed one row
// draws one row, and a read that changed none draws nothing.
//
// No DOM in here, so `node --test` can reach it.

import type { Entry } from "./types";

/** `next`, with each row equal to the one `prev` had under its id given back
 *  as that same object — and `prev` itself when every row is. */
export function reconcile(prev: readonly Entry[] | null, next: Entry[]): Entry[] {
  if (!prev) return next;
  const before = new Map(prev.map((row) => [row.id, row]));
  let unchanged = prev.length === next.length;
  const rows = next.map((row, at) => {
    const was = before.get(row.id);
    const kept = was && sameRow(was, row) ? was : row;
    if (kept !== prev[at]) unchanged = false;
    return kept;
  });
  return unchanged ? (prev as Entry[]) : rows;
}

/** Every field alike, the ones only one of them has included — an
 *  `ocrSearch` cleared when reading images is turned off is a change. */
export function sameRow(a: Entry, b: Entry): boolean {
  const one = a as unknown as Record<string, unknown>;
  const other = b as unknown as Record<string, unknown>;
  const keys = new Set([...Object.keys(one), ...Object.keys(other)]);
  for (const key of keys) {
    if (!same(one[key], other[key])) return false;
  }
  return true;
}

function same(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((value, at) => same(value, b[at]));
  return false;
}
