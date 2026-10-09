import assert from "node:assert/strict";
import { test } from "node:test";
import { reconcile, sameRow } from "../src/rows.ts";
import type { Entry } from "../src/types.ts";

function row(id: string, fields: Partial<Entry> = {}): Entry {
  return {
    id,
    hash: `h-${id}`,
    pin: null,
    first: 1,
    last: 2,
    count: 1,
    app: "com.apple.Notes",
    appName: "Notes",
    kind: "text",
    title: `title ${id}`,
    search: `text ${id}`,
    thumb: null,
    blobs: [],
    ...fields,
  };
}

test("a first read is taken as it is", () => {
  const next = [row("a")];
  assert.equal(reconcile(null, next), next);
});

test("a read that changed nothing gives back the list the panel has", () => {
  const prev = [row("a"), row("b", { blobs: ["x", "y"] })];
  const next = [row("a"), row("b", { blobs: ["x", "y"] })];
  assert.equal(reconcile(prev, next), prev);
});

test("a new copy on top keeps every row below it as it was", () => {
  const prev = [row("a"), row("b")];
  const next = [row("c"), row("a"), row("b")];
  const rows = reconcile(prev, next);
  assert.notEqual(rows, prev);
  assert.equal(rows[0], next[0]);
  assert.equal(rows[1], prev[0]);
  assert.equal(rows[2], prev[1]);
});

test("a changed row is the new one, the rest are kept", () => {
  const prev = [row("a"), row("b")];
  const next = [row("a", { pin: "p" }), row("b")];
  const rows = reconcile(prev, next);
  assert.equal(rows[0], next[0]);
  assert.equal(rows[1], prev[1]);
});

test("rows moved about keep their objects, and the list is new", () => {
  const prev = [row("a"), row("b")];
  const next = [row("b"), row("a")];
  const rows = reconcile(prev, next);
  assert.notEqual(rows, prev);
  assert.equal(rows[0], prev[1]);
  assert.equal(rows[1], prev[0]);
});

test("a field only one of them has is a change", () => {
  assert.equal(sameRow(row("a", { ocrSearch: "words", ocr: true }), row("a")), false);
  assert.equal(sameRow(row("a"), row("a", { math: "= 2" })), false);
  assert.equal(sameRow(row("a", { blobs: ["x"] }), row("a", { blobs: ["y"] })), false);
  assert.equal(sameRow(row("a", { last: 3 }), row("a")), false);
  assert.equal(sameRow(row("a", { fileCount: 2 }), row("a", { fileCount: 2 })), true);
});
