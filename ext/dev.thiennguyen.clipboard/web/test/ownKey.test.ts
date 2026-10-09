import assert from "node:assert/strict";
import { test } from "node:test";
import { holdersText, ownKeyHint, takeable } from "../src/ownKey.ts";
import type { ExtensionShortcut, ShortcutHolder } from "../src/types.ts";

const declared = "Shift+Super+KeyC";

function own(fields: Partial<ExtensionShortcut> = {}): ExtensionShortcut {
  return { command: "open", label: "Show clipboard history", key: declared, declared, state: "registered", reason: null, holder: null, ...fields };
}

const row: ShortcutHolder = { kind: "shortcut", profile: "p2", profileName: "Work", name: "Paste" };
const lumi: ShortcutHolder = { kind: "app", label: "Show Lumi" };
const other: ShortcutHolder = { kind: "extension", extensionId: "x", extensionName: "Window Snap", command: "left", commandLabel: "Snap left" };

test("an armed key says where it works, and what it replaced", () => {
  assert.deepEqual(ownKeyHint(own(), true, "⇧⌘C"), { text: "In every profile, from any app", bad: false });
  assert.deepEqual(ownKeyHint(own({ key: "Alt+Super+KeyV" }), true, "⇧⌘C"), {
    text: "In every profile, from any app · instead of ⇧⌘C",
    bad: false,
  });
  assert.deepEqual(ownKeyHint(own(), false, "⇧⌘C"), { text: "Shortcuts are switched off in Lumi", bad: true });
});

test("no key says why, or how to get one", () => {
  const taken = own({ key: null, state: "taken", reason: "⇧⌘C is already “Paste” in the Work profile.", holder: row });
  assert.deepEqual(ownKeyHint(taken, true, "⇧⌘C"), { text: "⇧⌘C is already “Paste” in the Work profile.", bad: true });
  const invalid = own({ key: null, state: "invalid", reason: "macOS keeps ⇧⌘C for itself." });
  assert.equal(ownKeyHint(invalid, true, "⇧⌘C").bad, true);
  assert.deepEqual(ownKeyHint(own({ key: null, state: "cleared" }), true, "⇧⌘C"), { text: "No key yet — click to record one", bad: false });
});

test("only a person's row or Lumi's own key is offered to take", () => {
  assert.equal(takeable([row]), true);
  assert.equal(takeable([row, lumi]), true);
  assert.equal(takeable([row, other]), false);
  assert.equal(takeable([]), false);
});

test("who a key comes off, in a sentence", () => {
  assert.equal(holdersText([row]), "“Paste” in the Work profile");
  assert.equal(holdersText([row, lumi, other]), "“Paste” in the Work profile, Lumi's own Show Lumi and Window Snap's Snap left");
});
