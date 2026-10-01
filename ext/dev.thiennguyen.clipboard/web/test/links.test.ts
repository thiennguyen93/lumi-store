import assert from "node:assert/strict";
import { test } from "node:test";
import { linkOfHref, linkPieces, shownAddress } from "../src/links.ts";

test("an address is shown without its scheme or a bare host's slash", () => {
  assert.equal(shownAddress("https://lumikeys.app/"), "lumikeys.app");
  assert.equal(shownAddress("HTTP://lumikeys.app/docs/"), "lumikeys.app/docs/");
  assert.equal(shownAddress("https://www.example.com?q=1"), "www.example.com?q=1");
});

test("escapes are read back as letters, but not ones that change the address", () => {
  assert.equal(shownAddress("https://vi.wikipedia.org/wiki/Vi%E1%BB%87t_Nam"), "vi.wikipedia.org/wiki/Việt_Nam");
  assert.equal(shownAddress("https://a.test/a%2Fb?x=%26"), "a.test/a%2Fb?x=%26");
  assert.equal(shownAddress("https://a.test/100%"), "a.test/100%");
});

const LINKS = [
  { url: "https://lumikeys.app/docs" },
  { url: "https://lumikeys.app/docs/extensions" },
  { url: "https://www.example.com/a" },
  { url: "https://github.com/x", text: "my code" },
];

test("text is cut where it writes out a listed address, and nowhere else", () => {
  assert.deepEqual(
    linkPieces("See https://lumikeys.app/docs/extensions, www.example.com/a and https://lumikeys.app/docs.", LINKS),
    [
      "See ",
      { text: "https://lumikeys.app/docs/extensions", url: "https://lumikeys.app/docs/extensions" },
      ", ",
      { text: "www.example.com/a", url: "https://www.example.com/a" },
      " and ",
      { text: "https://lumikeys.app/docs", url: "https://lumikeys.app/docs" },
      ".",
    ],
  );
  // Not listed (another host), or inside a word: text.
  assert.deepEqual(linkPieces("https://other.test xhttps://lumikeys.app/docs", LINKS), ["https://other.test xhttps://lumikeys.app/docs"]);
  assert.deepEqual(linkPieces("no links here", LINKS), ["no links here"]);
  assert.deepEqual(linkPieces("https://lumikeys.app/docs", []), ["https://lumikeys.app/docs"]);
});

test("an href is a link only when it is one the extension listed", () => {
  assert.equal(linkOfHref(" https://github.com/x\n", LINKS)?.text, "my code");
  for (const no of [null, "", "/relative", "javascript:alert(1)", "mailto:a@b.c", "https://github.com/y"]) {
    assert.equal(linkOfHref(no, LINKS), undefined, String(no));
  }
});
