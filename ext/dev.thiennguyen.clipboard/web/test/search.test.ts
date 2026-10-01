// `pnpm test`: Node's own runner, TypeScript read as it is (Node 22.18+).

import assert from "node:assert/strict";
import { test } from "node:test";
import { cut, found, fuzzyScore, highlights, keptInSight, nextSkip, oneLine, searchWith, skipped, byWordStarts, wordStarts, type Found } from "../src/search.ts";
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

// ---- fitting a row: dropping lead words until the match is in sight ------

const PORTAL =
  "Điểm thú vị ⏎🏔️ Nằm gần dãy Rwenzori — di sản thiên nhiên thế giới UNESCO, với đỉnh cao nhất là Margherita (5.109m). ⏎🦍 Gần Vườn quốc gia Bwindi — nơi bảo tồn khỉ đột núi nổi tiếng. ⏎🌋 Có hệ thống hồ miệng núi lửa (crater lakes) tuyệt đẹp ở vùng Fort Portal.";

test("both words of a two-word search are kept in sight together", () => {
  const shown = found(textRow(PORTAL), "Fort Portal", "exact");
  assert.deepEqual(marked(shown), ["Fort", "Portal"]);
  assert.equal(keptInSight(shown), 2);
});

test("dropping lead words keeps the marks on the words they marked", () => {
  const shown = found(textRow(PORTAL), "Fort Portal", "exact");
  let skip = 0;
  const seen: string[] = [];
  for (let next = nextSkip(shown, skip); next !== null; next = nextSkip(shown, skip)) {
    assert.ok(next > skip, "always forward");
    skip = next;
    const fitted = skipped(shown, skip);
    assert.ok(fitted.text.startsWith("…"), fitted.text);
    assert.deepEqual(marked(fitted), ["Fort", "Portal"], fitted.text);
    seen.push(fitted.text);
  }
  // A word at a time, ending on the match itself.
  assert.ok(seen.length >= 2, `${seen.length} steps`);
  assert.ok(seen.at(-1)!.startsWith("…Fort Portal"), seen.at(-1));
});

test("a text with no lead to drop is left as it is", () => {
  const row = textRow("Fort Portal is in Uganda");
  const shown = found(row, "fort", "exact");
  assert.equal(nextSkip(shown, 0), null);
  assert.equal(skipped(shown, 0), shown);
});

test("an untrimmed title gains an ellipsis once its start is dropped", () => {
  const shown: Found = { text: "one two three four", marks: [[14, 18]], note: null };
  const fitted = skipped(shown, nextSkip(shown, 0)!);
  assert.equal(fitted.text, "…two three four");
  assert.deepEqual(marked(fitted), ["four"]);
});

test("a stray word early in the title does not hide the whole match later on", () => {
  // "id" is in "incididunt", in the title; "id est laborum" is at the end.
  const shown = found(textRow(LOREM), "id est laborum", "exact");
  assert.ok(shown.text.includes("id est laborum"), shown.text);
  assert.deepEqual(marked(shown).slice(-3), ["id", "est", "laborum"]);
  assert.equal(keptInSight(shown), shown.marks.length);
});

test("the row starts at the thickest cluster of marks, not the first one", () => {
  const text = `${"lorem ".repeat(10)}alpha ${"filler ".repeat(20)}alpha beta gamma`;
  const shown = found(textRow(text), "alpha beta gamma", "exact");
  assert.ok(shown.text.includes("alpha beta gamma"), shown.text);
  assert.ok(shown.text.indexOf("alpha beta") <= 32, shown.text);
});

// ---- cut: a row's own ellipsis, outside every mark -----------------------

test("an end inside a mark keeps the mark's letters before it, and the ellipsis outside", () => {
  const shown: Found = { text: "…culpa qui officia deserunt mollit", marks: [[1, 6], [7, 10], [11, 18], [19, 27]], note: null };
  const ended = cut(shown, 24);
  assert.equal(ended.text, "…culpa qui officia deser…");
  assert.deepEqual(marked(ended), ["culpa", "qui", "officia", "deser"]);
  // The ellipsis is past the last mark, never in it.
  assert.ok(ended.marks.every(([, to]) => to < ended.text.length));
});

test("an end in the space before a mark leaves that mark out, not an empty one", () => {
  const shown: Found = { text: "one two three", marks: [[8, 13]], note: null };
  const ended = cut(shown, 8);
  assert.equal(ended.text, "one two…");
  assert.deepEqual(ended.marks, []);
});

test("an end past the text leaves it as it is", () => {
  const shown: Found = { text: "short", marks: [[0, 5]], note: null };
  assert.equal(cut(shown, 99), shown);
});

test("an end never splits a letter outside the basic plane", () => {
  const shown: Found = { text: "go 🚀 now", marks: [], note: null };
  assert.equal(cut(shown, 4).text, "go…");
});

test("an action is found by the starts of its words, not by letters inside one", () => {
  const actions = [
    "Paste",
    "Paste as plain text",
    "Copy",
    "Copy path",
    "Show in Finder",
    "Settings…",
    "About Clipboard Manager",
    "Delete entry",
    "Delete all unpinned…",
    "Delete all…",
  ];
  const find = (query: string) => byWordStarts(actions, (name) => name, query);
  assert.deepEqual(find("de"), ["Delete entry", "Delete all…", "Delete all unpinned…"]);
  assert.deepEqual(find("fin"), ["Show in Finder"]);
  assert.deepEqual(find("del unp"), ["Delete all unpinned…"]);
  assert.deepEqual(find("PATH"), ["Copy path"]);
  assert.deepEqual(find("settings…"), ["Settings…"]);
  assert.deepEqual(find("pinned"), []);
  // Nothing typed: every action, in the menu's own order.
  assert.deepEqual(find("  "), actions);
  assert.deepEqual(find("…"), actions);
  // Starts strung together, in the name's order, words skipped or not.
  assert.deepEqual(find("dau"), ["Delete all unpinned…"]);
  assert.deepEqual(find("du"), ["Delete all unpinned…"]);
  assert.deepEqual(find("sif"), ["Show in Finder"]);
  assert.deepEqual(find("cp"), ["Copy path"]);
  assert.deepEqual(find("pastepl"), ["Paste as plain text"]);
  // A start that could be longer still lets the next word take over.
  assert.deepEqual(find("de en"), ["Delete entry"]);
  // Not out of order, and not from inside a word.
  assert.deepEqual(find("alldel"), []);
  assert.deepEqual(find("pc"), []);
  assert.deepEqual(find("inder"), []);
});

test("the closest action comes first", () => {
  const actions = ["Copy path", "Paste as plain text", "Delete all unpinned…", "Paste", "Delete all…"];
  const find = (query: string) => byWordStarts(actions, (name) => name, query);
  // The fewer words left over, the closer.
  assert.deepEqual(find("delall"), ["Delete all…", "Delete all unpinned…"]);
  // From the name's first word before from further in.
  assert.deepEqual(find("pa"), ["Paste", "Paste as plain text", "Copy path"]);
  assert.equal(wordStarts("Copy path", "pa")?.at, 1);
  assert.equal(wordStarts("Show in Finder", "de"), null);
});

test("an action marks the letters that found it", () => {
  const marks = (name: string, query: string) => wordStarts(name, query)?.marks;
  assert.deepEqual(marks("Delete all…", "delall"), [[0, 3], [7, 10]]);
  assert.deepEqual(marks("Show in Finder", "sif"), [[0, 1], [5, 6], [8, 9]]);
  // A word takes as much as it can: the De of Delete, not D and the e of entry.
  assert.deepEqual(marks("Delete entry", "de"), [[0, 2]]);
  assert.deepEqual(marks("Delete all unpinned…", "unp del"), [[0, 3], [11, 14]]);
  assert.deepEqual(marks("Copy path", "pa"), [[5, 7]]);
  // Folded to find, marked in the name as written.
  assert.deepEqual(marks("Tiếng Việt", "tv"), [[0, 1], [6, 7]]);
  assert.deepEqual(marks("Tiếng Việt", "tieng"), [[0, 5]]);
  assert.deepEqual(marks("Paste", ""), []);
});
