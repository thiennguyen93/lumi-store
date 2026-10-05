import assert from "node:assert/strict";
import { test } from "node:test";
import { adopt, allShown, anyShown, coverAll, hide, isCovered, keyboardLeft, show, toggle, toggleAll, VEIL_OFF } from "../src/privacy.ts";

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
