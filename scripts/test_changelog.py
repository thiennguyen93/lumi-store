"""CHANGELOG.md parsing, the published history and the draft helper.

  python3 -m unittest discover -s scripts -p 'test_*.py'
"""

import json
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import changelog  # noqa: E402
import publish  # noqa: E402


def summary(headline="Pinned panels", items=("Panels stay on screen",)):
    locale = {"headline": headline, "items": list(items)}
    return {"lumi_notes": 1, "locales": {"en": dict(locale), "vi": dict(locale)}}


class ParseChangelog(unittest.TestCase):
    def test_every_heading_style_an_author_already_uses(self):
        for heading, date in [
            ("## 1.2.0", ""),
            ("## v1.2.0", ""),
            ("## [1.2.0]", ""),
            ("## [1.2.0] - 2026-09-30", "2026-09-30"),
            ("## [1.2.0] – 2026-09-30", "2026-09-30"),
            ("## [1.2.0](https://github.com/x/y/compare/v1.1.0...v1.2.0) (2026-09-30)", "2026-09-30"),
            ("## 1.2.0 (2026-09-30)", "2026-09-30"),
            ("## 1.2.0-beta.1", ""),
        ]:
            with self.subTest(heading):
                [release] = publish.parse_changelog(f"{heading}\n\n- a change\n")
                self.assertEqual(release["version"], "1.2.0-beta.1" if "beta" in heading else "1.2.0")
                self.assertEqual(release["date"], date)
                self.assertEqual(release["notes"], "- a change")

    def test_preface_and_unreleased_are_not_releases(self):
        text = "# Changelog\n\nAll notable changes.\n\n## [Unreleased]\n\n- not yet\n\n## 0.2.0\n### Added\n- two\n\n## 0.1.0\n- one\n"
        releases = publish.parse_changelog(text)
        self.assertEqual([r["version"] for r in releases], ["0.2.0", "0.1.0"])
        self.assertEqual(releases[0]["notes"], "### Added\n- two")

    def test_subheadings_stay_in_the_notes(self):
        [release] = publish.parse_changelog("## 1.0.0\n### Fixed\n- x\n#### deeper\n")
        self.assertIn("### Fixed", release["notes"])

    def test_refusals(self):
        for text, said in [
            ("", "no `## <version>` section"),
            ("# Changelog\n", "no `## <version>` section"),
            ("## Features\n- x\n", "not a version heading"),
            ("## 1.2\n- x\n", "not a version like"),
            ("## 1.2.0 - yesterday\n- x\n", "not a date"),
            ("## 1.2.0\n\n## 1.1.0\n- x\n", "has no notes"),
            ("## 1.1.0\n- x\n## 1.2.0\n- y\n", "not older than"),
            ("## 1.1.0\n- x\n## 1.1.0\n- y\n", "not older than"),
            ("## 1.10.0\n- x\n## 1.9.0\n- y\n## 1.9.0-rc.1\n- z\n## 1.9.0-rc.2\n- w\n", "not older than"),
            ("## 1.0.0\n" + "x" * (publish.MAX_CHANGE_NOTES + 1) + "\n", "bytes"),
        ]:
            with self.subTest(said=said, text=text[:30]):
                with self.assertRaisesRegex(ValueError, said):
                    publish.parse_changelog(text)

    def test_versions_order_numerically_and_prerelease_first(self):
        releases = publish.parse_changelog("## 1.10.0\n- a\n## 1.9.0\n- b\n## 1.9.0-rc.2\n- c\n## 1.9.0-rc.1\n- d\n")
        self.assertEqual(len(releases), 4)


class ChangesJson(unittest.TestCase):
    releases = [{"version": f"1.{n}.0", "date": "", "notes": f"- change {n}"} for n in range(30, 0, -1)]

    def test_newest_versions_only(self):
        out = json.loads(publish.changes_json(self.releases, {}))
        self.assertEqual(len(out), publish.MAX_CHANGES_VERSIONS)
        self.assertEqual(out[0]["version"], "1.30.0")
        self.assertIsNone(out[0]["summary"])
        self.assertEqual(out[0]["notesSha256"], publish.notes_sha256("- change 30"))

    def test_trimmed_to_the_byte_ceiling_oldest_first(self):
        big = [{"version": f"1.{n}.0", "date": "", "notes": "x" * 3000} for n in range(20, 0, -1)]
        data = publish.changes_json(big, {})
        self.assertLessEqual(len(data), publish.MAX_CHANGES)
        out = json.loads(data)
        self.assertEqual(out[0]["version"], "1.20.0")
        self.assertLess(len(out), 20)

    def test_same_input_same_bytes(self):
        self.assertEqual(publish.changes_json(self.releases, {}), publish.changes_json(self.releases, {}))

    def test_summary_only_for_the_notes_it_was_written_for(self):
        fresh = {"notesSha256": publish.notes_sha256("- change 30"), "summary": summary()}
        stale = {"notesSha256": publish.notes_sha256("- what it used to say"), "summary": summary()}
        out = json.loads(publish.changes_json(self.releases, {"1.30.0": fresh, "1.29.0": stale}))
        self.assertEqual(out[0]["summary"], summary())
        self.assertIsNone(out[1]["summary"])

    def test_vietnamese_stays_readable(self):
        vi = summary(headline="Ghim bảng điều khiển")
        data = publish.changes_json(self.releases[:1], {"1.30.0": {"notesSha256": publish.notes_sha256("- change 30"), "summary": vi}})
        self.assertIn("Ghim bảng điều khiển".encode("utf-8"), data)


class CheckSummary(unittest.TestCase):
    def test_a_good_one(self):
        self.assertEqual(publish.check_summary(summary()), [])

    def test_refusals(self):
        long_item = "x" * (publish.MAX_SUMMARY_ITEM + 1)
        for bad, said in [
            ({"locales": {}}, "envelope"),
            ({**summary(), "extra": 1}, "nothing else"),
            ({"lumi_notes": 1, "locales": {"en": summary()["locales"]["en"]}}, "locales are"),
            (summary(headline=""), "headline is empty"),
            (summary(headline="x" * 71), "characters"),
            (summary(items=[]), "1 to"),
            (summary(items=["a"] * 7), "1 to"),
            (summary(items=[long_item]), "characters"),
            (summary(items=["See https://example.com"]), "a link"),
            (summary(items=["Now **bold**"]), "markdown"),
            (summary(items=["<b>hi</b>"]), "HTML"),
        ]:
            with self.subTest(said=said):
                problems = publish.check_summary(bad)
                self.assertTrue(any(said in p for p in problems), problems)


class Draft(unittest.TestCase):
    def test_groups_by_conventional_type_and_drops_internal_work(self):
        groups = changelog.group([
            ("feat(clipboard): add panel pin support", ""),
            ("fix(clipboard): keep search text cased as copied", ""),
            ("perf: cache recognized text", ""),
            ("refactor(clipboard): generalize drag wrapper", ""),
            ("chore(clipboard): bump version", ""),
            ("feat!: drop the old settings file", ""),
            ("fix: rename a key", "BREAKING CHANGE: the key moved"),
            ("Tidy the panel", ""),
        ])
        self.assertEqual(groups, [
            ("Added", ["Add panel pin support."]),
            ("Changed", ["Drop the old settings file.", "Rename a key.", "Tidy the panel."]),
            ("Improved", ["Cache recognized text."]),
            ("Fixed", ["Keep search text cased as copied."]),
        ])

    def test_inserted_below_title_and_unreleased(self):
        text = "# Changelog\n\n## [Unreleased]\n\n- soon\n\n## 0.1.0\n\n- first\n"
        new = changelog.section("0.2.0", "2026-09-30", [("Added", ["Two."])])
        out = changelog.insert(text, new)
        self.assertEqual([r["version"] for r in publish.parse_changelog(out)], ["0.2.0", "0.1.0"])
        self.assertLess(out.index("[Unreleased]"), out.index("0.2.0"))

    def test_a_first_changelog(self):
        out = changelog.insert("", changelog.section("0.1.0", "2026-09-30", []))
        self.assertTrue(out.startswith("# Changelog\n\n## [0.1.0] - 2026-09-30"))
        publish.parse_changelog(out)


if __name__ == "__main__":
    unittest.main()
