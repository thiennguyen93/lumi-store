import assert from "node:assert/strict";
import { test } from "node:test";
import {
  adopt,
  allShown,
  anyShown,
  conceals,
  confirm,
  coverAll,
  covers,
  hide,
  isCovered,
  isLocked,
  isUnlocked,
  keyboardLeft,
  LOCK_OFF,
  LOCK_UNKNOWN,
  needsConfirm,
  show,
  showsLock,
  toggle,
  toggleAll,
  VEIL_OFF,
} from "../src/privacy.ts";

test("off, nothing is covered and nothing can be shown", () => {
  assert.equal(isCovered(VEIL_OFF, "a"), false);
  assert.equal(show(VEIL_OFF, "a"), VEIL_OFF);
  assert.equal(toggle(VEIL_OFF, "a"), VEIL_OFF);
});

test("on, every row is covered until shown, and stays shown", () => {
  let veil = adopt(VEIL_OFF, true);
  assert.equal(isCovered(veil, "a"), true);
  assert.equal(isCovered(veil, "b"), true);
  veil = show(veil, "a");
  assert.equal(isCovered(veil, "a"), false, "shown");
  assert.equal(isCovered(veil, "b"), true, "only the one shown");
  assert.equal(show(veil, "a"), veil, "shown twice is the same");
});

test("⌘⇧H shows a row, then covers it again", () => {
  let veil = adopt(VEIL_OFF, true);
  veil = toggle(veil, "a");
  assert.equal(isCovered(veil, "a"), false);
  veil = toggle(veil, "a");
  assert.equal(isCovered(veil, "a"), true);
  assert.equal(hide(veil, "a"), veil, "covering a covered row changes nothing");
});

test("covering everything forgets every row shown", () => {
  let veil = show(show(adopt(VEIL_OFF, true), "a"), "b");
  veil = coverAll(veil);
  assert.equal(isCovered(veil, "a"), true);
  assert.equal(isCovered(veil, "b"), true);
  assert.equal(coverAll(veil), veil, "nothing shown, nothing to cover");
});

test("turning it on covers rows shown before it was last turned off", () => {
  let veil = show(adopt(VEIL_OFF, true), "a");
  veil = adopt(veil, false);
  assert.equal(isCovered(veil, "a"), false, "off: nothing covered");
  veil = adopt(veil, true);
  assert.equal(isCovered(veil, "a"), true, "on again: covered again");
  const shown = show(veil, "a");
  assert.equal(adopt(shown, true), shown, "the list read again with it still on keeps what is shown");
});

test("only the keyboard going from held to not is a leaving", () => {
  assert.equal(keyboardLeft(true, false), true);
  assert.equal(keyboardLeft(false, false), false, "a hover of a pinned panel without the keyboard");
  assert.equal(keyboardLeft(false, true), false);
  assert.equal(keyboardLeft(true, true), false);
});

test("show all shows every row at once, and again covers them all", () => {
  let veil = toggleAll(adopt(VEIL_OFF, true));
  assert.equal(isCovered(veil, "a"), false);
  assert.equal(isCovered(veil, "never-seen"), false, "rows not yet looked at too");
  assert.equal(allShown(veil), true);
  veil = toggleAll(veil);
  assert.equal(isCovered(veil, "a"), true);
  assert.equal(anyShown(veil), false);
});

test("with everything shown, one row can still be covered again, and shown", () => {
  let veil = toggleAll(adopt(VEIL_OFF, true));
  veil = toggle(veil, "a");
  assert.equal(isCovered(veil, "a"), true, "covered by hand");
  assert.equal(isCovered(veil, "b"), false, "the rest stay shown");
  assert.equal(allShown(veil), false);
  veil = toggleAll(veil);
  assert.equal(isCovered(veil, "a"), false, "show all shows the one covered by hand too");
  veil = toggle(toggle(veil, "a"), "a");
  assert.equal(allShown(veil), true, "covered and shown again is all shown");
});

test("rows shown one by one, then show all, then cover all", () => {
  let veil = show(adopt(VEIL_OFF, true), "a");
  assert.equal(allShown(veil), false);
  veil = toggleAll(veil);
  assert.equal(allShown(veil), true);
  veil = coverAll(veil);
  assert.equal(isCovered(veil, "a"), true);
  assert.equal(anyShown(veil), false);
});

test("off, show all does nothing; turned on again, all is covered", () => {
  assert.equal(toggleAll(VEIL_OFF), VEIL_OFF);
  let veil = toggleAll(adopt(VEIL_OFF, true));
  veil = adopt(adopt(veil, false), true);
  assert.equal(isCovered(veil, "a"), true);
});

test("a colour is never covered: its row already shows all of it", () => {
  const veil = adopt(VEIL_OFF, true);
  assert.equal(conceals("color"), false);
  assert.equal(covers(veil, { id: "c", kind: "color" }), false);
  for (const kind of ["text", "rich", "link", "image", "file"]) {
    assert.equal(covers(veil, { id: "x", kind }), true, kind);
  }
  assert.equal(covers(show(veil, "x"), { id: "x", kind: "text" }), false, "shown");
});

test("showing asks once, until everything is covered again", () => {
  let veil = adopt(VEIL_OFF, true);
  assert.equal(needsConfirm(veil, true, false), true);
  assert.equal(needsConfirm(veil, false, false), false, "not asked for");
  veil = show(confirm(veil), "a");
  assert.equal(needsConfirm(veil, true, false), false, "said yes this time");
  veil = toggleAll(veil);
  assert.equal(veil.confirmed, true, "show all keeps the yes");
  veil = coverAll(veil);
  assert.equal(needsConfirm(veil, true, false), true, "covered again: asks again");
  assert.equal(coverAll(confirm(adopt(VEIL_OFF, true))).confirmed, false, "a yes with nothing shown is forgotten too");
  assert.equal(needsConfirm(adopt(VEIL_OFF, true), true, true), false, "an unlocked history counts as a yes");
  assert.equal(needsConfirm(VEIL_OFF, true, false), false, "privacy mode off: nothing to show");
});

test("the history is locked until this opening is unlocked, or an earlier unlock still holds", () => {
  const lock = { on: true, until: null, here: false, known: true };
  assert.equal(isLocked(LOCK_OFF, 0), false);
  assert.equal(isLocked(lock, 0), true);
  assert.equal(isLocked({ ...lock, here: true }, 0), false, "unlocked in this opening");
  assert.equal(isLocked({ ...lock, until: 5_000 }, 4_999), false, "an earlier unlock that still holds");
  assert.equal(isLocked({ ...lock, until: 5_000 }, 5_000), true, "and ran out");
  assert.equal(isUnlocked({ ...lock, until: 5_000 }, 1), true, "by an earlier unlock");
  assert.equal(isUnlocked({ ...lock, here: true }, 1), true, "in this opening, a pinned panel in the background too");
  assert.equal(isUnlocked(lock, 1), false);
  assert.equal(isUnlocked({ ...LOCK_OFF, here: true }, 1), false, "off: nothing was locked");
});

test("before its first list a panel is locked, but shows neither the lock nor the open history", () => {
  assert.equal(isLocked(LOCK_UNKNOWN, 0), true, "nothing read, shown or done meanwhile");
  assert.equal(showsLock(LOCK_UNKNOWN, 0), false, "no lock card for a history that may not be locked");
  const lock = { on: true, until: null, here: false, known: true };
  assert.equal(showsLock(lock, 0), true, "known locked: the lock card");
  assert.equal(showsLock({ ...lock, here: true }, 0), false, "unlocked");
  assert.equal(showsLock(LOCK_OFF, 0), false, "off");
});
