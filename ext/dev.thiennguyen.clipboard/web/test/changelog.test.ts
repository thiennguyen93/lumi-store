import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { codeRuns, identityOf, parseChangelog } from "../src/changelog.ts";

test("releases, their groups and notes, newest first", () => {
  const releases = parseChangelog(
    [
      "# Changelog",
      "",
      "## [0.2.0] - 2026-09-30",
      "",
      "### Added",
      "",
      "- One thing,",
      "  wrapped.",
      "- `code` too.",
      "",
      "### Fixed",
      "",
      "* A star bullet.",
      "",
      "## [0.1.0]",
      "",
      "- No group.",
    ].join("\n"),
  );
  assert.deepEqual(releases, [
    {
      version: "0.2.0",
      date: "2026-09-30",
      groups: [
        { title: "Added", notes: ["One thing, wrapped.", "`code` too."] },
        { title: "Fixed", notes: ["A star bullet."] },
      ],
    },
    { version: "0.1.0", date: "", groups: [{ title: "", notes: ["No group."] }] },
  ]);
});

test("the shipped changelog's newest release is the package's version", () => {
  const releases = parseChangelog(readFileSync(new URL("../../CHANGELOG.md", import.meta.url), "utf8"));
  const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as { version: string };
  assert.equal(releases[0]?.version, pkg.version);
  assert.ok(releases[0]!.groups.some((g) => g.notes.length));
});

test("backtick spans split out", () => {
  assert.deepEqual(codeRuns("a `b` c"), ["a ", "b", " c"]);
});

test("the manifest's own words, not a later table's", () => {
  const manifest = readFileSync(new URL("../../manifest.toml", import.meta.url), "utf8");
  const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as { version: string };
  const me = identityOf(manifest);
  assert.equal(me.id, "dev.thiennguyen.clipboard");
  assert.equal(me.name, "Clipboard Manager");
  assert.equal(me.version, pkg.version);
  assert.ok(me.author && me.description);
});
