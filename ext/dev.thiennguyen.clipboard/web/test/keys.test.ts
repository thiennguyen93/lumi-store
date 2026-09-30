// The Pin key setting: what it defaults to and what it refuses.

import assert from "node:assert/strict";
import { test } from "node:test";
import { DEFAULT_PIN_KEY, parseCombo, refusal } from "../src/keys.ts";

const refused = (text: string) => refusal(parseCombo(text)!);

test("the default Pin key is ⌘P, and it is allowed", () => {
  assert.equal(DEFAULT_PIN_KEY, "cmd+p");
  assert.equal(refused(DEFAULT_PIN_KEY), null);
});

test("⌘ with a row's digit or a pinned row's letter is refused", () => {
  for (const key of ["cmd+1", "cmd+9", "cmd+b", "cmd+d", "cmd+y"]) {
    assert.match(refused(key) ?? "", /pastes a row/, key);
  }
});

test("⌘ with a letter something else answers says what answers it", () => {
  assert.equal(refused("cmd+a"), "⌘A is Select All");
  assert.equal(refused("cmd+v"), "⌘V is Paste");
  assert.equal(refused("cmd+z"), "⌘Z is Undo");
});

test("⌘⇧P is the panel's pin, not the row's", () => {
  assert.equal(refused("shift+cmd+p"), "⌘⇧P pins the panel");
  assert.equal(refused("alt+p"), null, "the old default stays allowed");
});
