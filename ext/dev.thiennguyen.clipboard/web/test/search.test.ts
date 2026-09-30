// `pnpm test`: Node's own runner, TypeScript read as it is (Node 22.18+).

import assert from "node:assert/strict";
import { test } from "node:test";
import { found, fuzzyScore, highlights, oneLine, searchWith, type Found } from "../src/search.ts";
import type { Entry } from "../src/types.ts";

function row(id: string, title: string, appName = "Claude", search = title): Entry {
  return { id, title, search, appName } as Entry;
}

const QUESTION = row("q", "tại sao setAllowedFileTypes deprecated? dùng thứ deprecated có an toàn không?");
const COMMIT = row("c", "feat(clipboard): expand welcome tour to five steps and fix focus handling", "Terminal");

test("letters strewn across a sentence are not a fuzzy match", () => {
  for (const query of ["phước", "nguyễn ngọc"]) {
    assert.deepEqual(searchWith([QUESTION, COMMIT], query, "mixed").rows, [], query);
  }
});

test("a word is not made of the title's end and the text behind it", () => {
  // `pc`: the p ends the title, the c starts the search text.
  const one = row("x", "ship", "Notes", "copy");
  assert.deepEqual(searchWith([one], "pc", "fuzzy").rows, []);
});

test("a word is not made of the text's end and the app's name", () => {
  const one = row("x", "keep a copy", "Chrome");
  assert.deepEqual(searchWith([one], "ych", "fuzzy").rows, []);
});

test("close-knit abbreviations still find their row, and are marked", () => {
  const clippy = row("k", "cargo clippy --fix");
  const invoice = row("i", "Invoice-September.pdf", "Finder");
  assert.deepEqual(searchWith([clippy, invoice], "clpy", "mixed").rows, [clippy]);
  assert.deepEqual(searchWith([clippy, invoice], "invsep", "mixed").rows, [invoice]);
  assert.ok(highlights(clippy.title, "clpy", "fuzzy").length > 0);
  assert.ok(highlights(invoice.title, "invsep", "fuzzy").length > 0);
});

test("a typo inside a word is still forgiven", () => {
  const one = row("d", "deprecated API");
  assert.deepEqual(searchWith([one], "deprcated", "fuzzy").rows, [one]);
});

test("a word found in the text behind the title still finds the row", () => {
  // OCR text of a screenshot: the title says nothing of it.
  const shot = row("s", "Screenshot 2026-09-30", "Screenshot", "error: connection refused on port 5432");
  assert.deepEqual(searchWith([shot], "refsed", "fuzzy").rows, [shot]);
});

test("the whole word counts however many times its first letter came before", () => {
  const long = `${"p ".repeat(500)}phuoc`;
  assert.notEqual(fuzzyScore(long, "phuoc"), null);
});

test("letters outside the basic plane are read whole", () => {
  assert.notEqual(fuzzyScore("ship it 🚀 now", "🚀n"), null);
});

// ---- found: what a row shows while a search is on ----------------------

const LOREM =
  "Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.";

/** A text row as the extension keeps it: a 200-character title. */
function textRow(text: string, extra: Partial<Entry> = {}): Entry {
  const line = oneLine(text);
  const title = line.length > 200 ? `${line.slice(0, 200)}…` : line;
  return { id: "t", kind: "text", title, search: text, appName: "Notes", ...extra } as Entry;
}

/** The marked stretches of a `Found`, as text. */
function marked(shown: Found): string[] {
  return shown.marks.map(([from, to]) => shown.text.slice(from, to));
}

test("a match past the title shows the stretch of text it is in", () => {
  const shown = found(textRow(LOREM), "laborum", "exact");
  assert.ok(shown.text.startsWith("…"), shown.text);
  assert.ok(shown.text.includes("laborum"), shown.text);
  assert.deepEqual(marked(shown), ["laborum"]);
  assert.equal(shown.note, null);
  // Close enough to the start that a narrow row still shows it.
  assert.ok(shown.text.indexOf("laborum") <= 32, shown.text);
});

test("the stretch starts on a word, not half-way through one", () => {
  const shown = found(textRow(LOREM), "laborum", "exact");
  const first = shown.text.slice(1).split(" ")[0]!;
  assert.ok(LOREM.split(/\s+/).includes(first), `starts on "${first}"`);
});

test("a match near the start leaves the title as it is", () => {
  const row = textRow(LOREM);
  const shown = found(row, "dolor", "exact");
  assert.equal(shown.text, row.title);
  assert.equal(marked(shown)[0], "dolor");
});

test("a match far into the title starts the row nearer it", () => {
  const shown = found(textRow(LOREM), "magna", "exact");
  assert.ok(shown.text.startsWith("…"), shown.text);
  assert.deepEqual(marked(shown), ["magna"]);
});

test("without a search the title is shown as it is", () => {
  const row = textRow(LOREM);
  assert.deepEqual(found(row, "  ", "exact"), { text: row.title, marks: [], note: null });
});

test("line breaks in the text are drawn as the title draws them", () => {
  const shown = found(textRow(`${"x ".repeat(120)}\nfirst line\nsecond needle`), "needle", "exact");
  assert.ok(shown.text.includes("⏎second needle"), shown.text);
  assert.deepEqual(marked(shown), ["needle"]);
});

test("diacritics aside, the mark covers the word as copied", () => {
  const shown = found(textRow(`${"chữ ".repeat(80)}Tiếng Việt`), "tieng viet", "exact");
  assert.deepEqual(marked(shown), ["Tiếng", "Việt"]);
});

test("words only in the image's text show that text, and say so", () => {
  const shot = { id: "s", kind: "image", title: "Image", search: "", ocrSearch: "error: connection refused on port 5432", appName: "Screenshot" } as Entry;
  assert.deepEqual(searchWith([shot], "refused", "mixed").rows, [shot]);
  const shown = found(shot, "refused", "exact");
  assert.equal(shown.note, "in image");
  assert.deepEqual(marked(shown), ["refused"]);
});

test("a file found by its folder keeps its name, and says where", () => {
  const file = { id: "f", kind: "file", title: "notes.txt", search: " /Users/me/Projects/lumi/notes.txt", appName: "Finder" } as Entry;
  const shown = found(file, "projects", "exact");
  assert.equal(shown.text, "notes.txt");
  assert.equal(shown.note, "in its path");
});

test("a row found only by its app says nothing extra", () => {
  const row = textRow("hello there", { appName: "Safari" });
  assert.deepEqual(found(row, "safari", "exact"), { text: "hello there", marks: [], note: null });
});
