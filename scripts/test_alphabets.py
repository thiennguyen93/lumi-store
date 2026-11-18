"""The alphabets Lumi checks character by character — `manifest::is_valid_ui_path`,
`is_valid_id`, the name of every window, node, page, sheet and folder, and
every version (`parse_triplet`, `ext::changelog`'s patterns) — as the store
mirrors them, so a path, a name or a version Lumi refuses is refused before it
is packed. Python's regex `$` also matches before a final newline, which is how
"card\\n" used to pass here, and its `\\d` matches any Unicode digit, which is
how "١.0.0" did.

  python3 -m unittest discover -s scripts -p 'test_*.py'
"""

import sys
import tomllib
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import publish  # noqa: E402

BASE = '[extension]\nid = "dev.you.thing"\nname = "Thing"\nversion = "1.0.0"\n\n{tables}'


def refusal(tables: str, entry_id: str = "dev.you.thing", text: str = BASE) -> str:
    with unittest.TestCase().assertRaises(SystemExit) as caught:
        publish.check_manifest(entry_id, tomllib.loads(text.format(tables=tables)))
    return str(caught.exception.code)


class UiPaths(unittest.TestCase):
    def test_a_plain_relative_path_stands(self):
        for path in ("index.html", "app/icon.svg", "a-b_c.1/d.js"):
            self.assertTrue(publish.is_valid_ui_path(path), path)

    def test_lumi_refuses_what_it_cannot_read_as_a_file_under_ui(self):
        for path in ("", "../x.svg", "/abs.html", "a//b.html", ".hidden", "a\\b.html", "__lumi__/x", "sp ace.html", "é.html"):
            self.assertFalse(publish.is_valid_ui_path(path), repr(path))

    def test_a_trailing_newline_is_a_character_lumi_refuses(self):
        for path in ("index.html\n", "app\n/icon.svg", "app/icon.svg\n"):
            self.assertFalse(publish.is_valid_ui_path(path), repr(path))

    def test_a_window_pointing_at_one_is_refused(self):
        self.assertIn("not a plain relative path", refusal('[[window]]\nname = "card"\npath = "card.html\\n"'))


class Names(unittest.TestCase):
    """Every name Lumi holds to letters, digits, '-' and '_', one character at
    a time."""

    TABLES = {
        "window": '[[window]]\nname = "{name}"\npath = "card.html"',
        "node": '[[node]]\nname = "{name}"\nlabel = "Node"',
        "page": '[[page]]\nname = "{name}"\nlabel = "Keys"\npath = "keys.html"',
        "sheet": '[[sheet]]\nname = "{name}"\npath = "sheet.html"',
        "folder": '[[folder]]\nname = "{name}"\nlabel = "Save to"',
    }

    def test_a_plain_name_stands(self):
        for kind, table in self.TABLES.items():
            with self.subTest(kind):
                publish.check_manifest("dev.you.thing", tomllib.loads(BASE.format(tables=table.format(name="card_2-b"))))

    def test_a_trailing_newline_is_a_character_lumi_refuses(self):
        for kind, table in self.TABLES.items():
            with self.subTest(kind):
                self.assertIn(f"{kind} name", refusal(table.format(name="card\\n")))

    def test_the_extension_id_too(self):
        text = BASE.replace('id = "dev.you.thing"', 'id = "dev.you.thing\\n"')
        self.assertIn("id may hold only", refusal("", entry_id="dev.you.thing\n", text=text))
        # The id's length is counted without a newline to hide past it.
        long = "a" * 100
        self.assertIn("id may hold only", refusal("", entry_id=long + "\n", text=BASE.replace("dev.you.thing", long + "\\n")))



class Versions(unittest.TestCase):
    """The manifest's `version` (the store's three-numbers rule), its
    `min-lumi-version` (Lumi's `parse_triplet`), and a changelog's headings
    (Lumi's `ext::changelog`)."""

    @staticmethod
    def text(line: str) -> str:
        return BASE.replace('version = "1.0.0"', line)

    def test_a_release_is_three_ascii_numbers_and_nothing_after(self):
        publish.check_manifest("dev.you.thing", tomllib.loads(self.text('version = "1.20.3"').format(tables="")))
        for version in ("1.0.0\\n", "١.0.0", "1.٠.0", "1.0.0-beta.1", "01.0.0"):
            with self.subTest(version):
                self.assertIn("is not three numbers", refusal("", text=self.text(f'version = "{version}"')))

    def test_min_lumi_version_is_one_lumi_can_read(self):
        for floor in ("1.89.0", " 1.89.0 ", "1.89.0\\n", "+1.89.0"):
            with self.subTest(floor):
                line = f'version = "1.0.0"\nmin-lumi-version = "{floor}"'
                publish.check_manifest("dev.you.thing", tomllib.loads(self.text(line).format(tables="")))
        for floor in ("1.89", "1.89.0.1", "v1.89.0", "١.89.0", "¹.89.0", "1.89.0\\u001F", "1.89.x"):
            with self.subTest(floor):
                line = f'version = "1.0.0"\nmin-lumi-version = "{floor}"'
                self.assertIn("is not a plain major.minor.patch number", refusal("", text=self.text(line)))
        self.assertIn("is not text", refusal("", text=self.text('version = "1.0.0"\nmin-lumi-version = 1')))

    def test_a_floor_is_compared_as_lumi_reads_it(self):
        self.assertEqual(publish.version_tuple(" 1.89.0\n"), (1, 89, 0))
        self.assertEqual(publish.version_tuple("+1.89.0"), (1, 89, 0))
        # U+001F is whitespace to Python's `str.strip` and not to Rust's
        # `str::trim`, so Lumi cannot read this floor at all.
        for unreadable in ("١.٨٩.٠", "¹.89.0", "1.89", "", None, "18446744073709551616.0.0", "1.89.0\x1f"):
            self.assertEqual(publish.version_tuple(unreadable), (0, 0, 0), repr(unreadable))

    def test_a_changelog_heading_is_one_lumi_reads(self):
        self.assertEqual(publish.parse_changelog("## 1.2.0 (2026-09-30)\n\n- Fixed.\n")[0]["version"], "1.2.0")
        for heading, says in (
            ("## 1.٠.0", "is not a version"),
            ("## 1.2.0 (٢026-09-30)", "is not a date"),
        ):
            with self.subTest(heading):
                with self.assertRaises(ValueError) as caught:
                    publish.parse_changelog(f"{heading}\n\n- Fixed.\n")
                self.assertIn(says, str(caught.exception))
        for version in ("1.0.0\n", "١.0.0"):
            self.assertIsNone(publish.SEMVER_RE.match(version), repr(version))


if __name__ == "__main__":
    unittest.main()
