// The Pin key setting: what it defaults to and what it refuses.

import assert from "node:assert/strict";
import { test } from "node:test";
import { comboText, DEFAULT_PIN_KEY, DEFAULT_REVEAL_KEY, panelKeys, parseCombo, PIN_DOES, refusal, REVEAL_DOES } from "../src/keys.ts";

const refused = (text: string) => refusal(parseCombo(text)!);

test("the default Pin key is ⌘P, and it is allowed", () => {
  assert.equal(DEFAULT_PIN_KEY, "cmd+p");
  assert.equal(refused(DEFAULT_PIN_KEY), null);
});

test("⌘ with a row's digit or a pinned row's letter is refused", () => {
  for (const key of ["cmd+1", "cmd+9", "cmd+b", "cmd+d", "cmd+u"]) {
    assert.match(refused(key) ?? "", /pastes a row/, key);
  }
});

test("⌘ with a letter something else answers says what answers it", () => {
  assert.equal(refused("cmd+a"), "⌘A is Select All");
  assert.equal(refused("cmd+v"), "⌘V is Paste");
  assert.equal(refused("cmd+z"), "⌘Z is Undo");
  assert.equal(refused("cmd+y"), "⌘Y expands the preview");
});

test("⌘⇧P is the panel's pin, not the row's", () => {
  assert.equal(refused("shift+cmd+p"), "⌘⇧P pins the panel");
  assert.equal(refused("alt+p"), null, "the old default stays allowed");
});

test("a key the other panel key holds is refused, saying what it does", () => {
  const reveal = [{ combo: parseCombo(DEFAULT_REVEAL_KEY)!, does: REVEAL_DOES }];
  assert.equal(refusal(parseCombo("shift+cmd+h")!, reveal), "⇧⌘H shows or hides the preview");
  assert.equal(refusal(parseCombo("ctrl+shift+h")!, reveal), null, "with ⌃ it is free");
  assert.equal(refused("shift+cmd+h"), null, "free while nothing holds it");
  const pin = [{ combo: parseCombo(DEFAULT_PIN_KEY)!, does: PIN_DOES }];
  assert.equal(refusal(parseCombo("cmd+p")!, pin), "⌘P pins the selected item");
});

test("the panel's keys fall back to their defaults, and the reveal key gives way to Pin", () => {
  const text = (keys: ReturnType<typeof panelKeys>) => [comboText(keys.pin), keys.reveal && comboText(keys.reveal)];
  assert.deepEqual(text(panelKeys(undefined, undefined)), ["cmd+p", "shift+cmd+h"]);
  assert.deepEqual(text(panelKeys("alt+p", "ctrl+alt+r")), ["alt+p", "ctrl+alt+r"]);
  assert.deepEqual(text(panelKeys("cmd+v", "cmd+k")), ["cmd+p", "shift+cmd+h"], "refused keys go back to the defaults");
  assert.deepEqual(text(panelKeys("alt+p", "alt+p")), ["alt+p", "shift+cmd+h"], "Pin's key is Pin's");
  assert.deepEqual(text(panelKeys("shift+cmd+h", undefined)), ["shift+cmd+h", null], "Pin holds even the default");
});

test("⌘K is the actions menu, so it is no Pin key", () => {
  assert.equal(refused("cmd+k"), "⌘K opens the actions menu");
});

test("the show-or-hide-all key gives way to both keys before it", () => {
  const all = (pin?: string, reveal?: string, revealAll?: string) => {
    const keys = panelKeys(pin, reveal, revealAll);
    return keys.revealAll && comboText(keys.revealAll);
  };
  assert.equal(all(), "alt+shift+cmd+h", "⌥⇧⌘H by default");
  assert.equal(all(undefined, undefined, "ctrl+alt+a"), "ctrl+alt+a");
  assert.equal(all(undefined, "ctrl+alt+a", "ctrl+alt+a"), "alt+shift+cmd+h", "the show or hide key's is its own");
  assert.equal(all("alt+p", undefined, "alt+p"), "alt+shift+cmd+h", "and Pin's");
  assert.equal(all(undefined, "alt+shift+cmd+h", undefined), null, "the default taken too: none");
  assert.equal(all(undefined, undefined, "cmd+k"), "alt+shift+cmd+h", "a key the panel answers is refused");
});
