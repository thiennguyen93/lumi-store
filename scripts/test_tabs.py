"""`[tabs.<name>]`: the store's mirror of Lumi's `manifest::tabs`, and the
changelog riding in the package.

  python3 -m unittest discover -s scripts -p 'test_*.py'
"""

import io
import sys
import tarfile
import gzip
import tempfile
import tomllib
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import publish  # noqa: E402

BASE = """
[extension]
id = "dev.you.thing"
name = "Thing"
version = "1.0.0"
{extension}

[[command]]
name = "open"
label = "Open"

{tables}
"""


def manifest(extension: str = "", tables: str = "") -> dict:
    return tomllib.loads(BASE.format(extension=extension, tables=tables))


def refusal(extension: str = "", tables: str = "") -> str:
    with unittest.TestCase().assertRaises(SystemExit) as caught:
        publish.check_tabs("dev.you.thing", manifest(extension, tables))
    return str(caught.exception.code)


class Tabs(unittest.TestCase):
    def test_every_lumi_tab_is_there_under_its_own_name_by_default(self):
        tabs = publish.check_tabs("dev.you.thing", manifest())
        self.assertEqual({word: decl["label"] for word, decl in tabs.items()}, publish.BUILTIN_TABS)
        self.assertFalse(any(decl["hidden"] or decl["page"] for decl in tabs.values()))

    def test_one_table_renames_hides_or_pages_a_tab(self):
        tabs = publish.check_tabs(
            "dev.you.thing",
            manifest(tables='[tabs.changelog]\nlabel = "What\'s new"\npage = "news.html"\n\n[tabs.settings]\nhidden = true\n'),
        )
        self.assertEqual(tabs["changelog"], {"label": "What's new", "page": "news.html", "hidden": False})
        self.assertTrue(tabs["settings"]["hidden"])

    def test_the_older_keys_say_what_a_tabs_table_says(self):
        old = publish.check_tabs("dev.you.thing", manifest('settings-tab = false\nabout = "a.html"'))
        new = publish.check_tabs(
            "dev.you.thing", manifest(tables='[tabs.settings]\nhidden = true\n[tabs.about]\npage = "a.html"\n')
        )
        self.assertEqual(old, new)

    def test_refusals_say_what_lumi_says(self):
        for extension, tables, said in [
            ("", "[tabs.news]\nhidden = true\n", "not one of Lumi's tabs"),
            ("", "[tabs.about]\nhidden = true\n", "cannot be hidden"),
            ("", '[tabs.changelog]\nhidden = true\npage = "c.html"\n', "leave one of them out"),
            ("", '[tabs.changelog]\npage = "../c.html"\n', "not a plain relative path"),
            ("", '[tabs.changelog]\nlabel = "Permissions"\n', "may not be labelled"),
            ("", '[tabs.changelog]\nlabel = "Settings"\n', "may not be labelled"),
            ("", '[tabs.changelog]\nlabel = "A label far too long for any tab"\n', "longer than"),
            ("", "[tabs.shortcuts]\nhidden = true\n", "nothing to draw"),
            ("", '[tabs.changelog]\nlabel = "News"\n[tabs.settings]\nlabel = "news"\n', "two tabs are labelled"),
            ("", '[tabs.changelog]\nlabel = "Log"\n[[page]]\nname = "log"\nlabel = "Log"\n', "two tabs are labelled"),
            ("settings-tab = false", "[tabs.settings]\nhidden = true\n", "both say whether"),
            ('about = "a.html"', '[tabs.about]\npage = "b.html"\n', "both name the About tab's page"),
            ("settings-tab = false\nsettings-page = \"s.html\"", "", "settings-tab = false hides the tab settings-page"),
            ("shortcuts-tab = false", "", "nothing to draw"),
            ("settings-tab = 1", "", "is not true or false"),
            ("", "[tabs.settings]\ndefault = true\n[tabs.changelog]\ndefault = true\n", "both say default = true"),
            ("", '[[page]]\nname = "log"\ndefault = true\n[tabs.about]\ndefault = true\n', "the page log and [tabs.about] default"),
            ("", "[tabs.settings]\nhidden = true\ndefault = true\n", "which this manifest hides"),
            ("", "[tabs.shortcuts]\ndefault = true\n", "nothing to draw"),
            ("", '[tabs.settings]\ndefault = "yes"\n', "is not true or false"),
        ]:
            with self.subTest(said=said):
                self.assertIn(said, refusal(extension, tables))

    def test_one_tab_may_say_the_page_opens_on_it(self):
        publish.check_tabs("dev.you.thing", manifest(tables="[tabs.settings]\ndefault = true\n"))
        publish.check_tabs("dev.you.thing", manifest(tables='[[page]]\nname = "log"\ndefault = true\n'))

    def test_its_own_name_back_is_no_clash_and_a_hidden_tabs_label_is_free(self):
        publish.check_tabs("dev.you.thing", manifest(tables='[tabs.changelog]\nlabel = "changelog"\n'))
        publish.check_tabs(
            "dev.you.thing",
            manifest(tables='[tabs.settings]\nhidden = true\nlabel = "Log"\n[[page]]\nname = "log"\nlabel = "Log"\n'),
        )

    def test_a_page_may_not_wear_the_name_of_a_tab_lumi_draws(self):
        self.assertIn("changelog", publish.RESERVED_PAGE_LABELS)
        with self.assertRaises(SystemExit) as caught:
            publish.check_page_tabs("dev.you.thing", manifest(tables='[[page]]\nname = "x"\nlabel = "Changelog"\n'))
        self.assertIn("one of Lumi's own tabs", str(caught.exception.code))

    def test_a_tab_page_must_ship(self):
        found = publish.declared_pages("dev.you.thing", manifest(tables='[tabs.changelog]\npage = "news.html"\n'))
        self.assertIn(("Changelog tab's page", "news.html"), found)


class Pack(unittest.TestCase):
    def test_the_changelog_rides_in_the_package_reproducibly(self):
        with tempfile.TemporaryDirectory() as tmp:
            crate = Path(tmp)
            (crate / "manifest.toml").write_text(BASE.format(extension="", tables=""))
            (crate / "CHANGELOG.md").write_text("## 1.0.0\n- first\n")
            (crate / "extension.wasm").write_bytes(b"\0asm")
            (crate / "ui").mkdir()
            first = publish.pack("dev.you.thing", crate / "manifest.toml", crate / "extension.wasm", None, crate / "ui")
            again = publish.pack("dev.you.thing", crate / "manifest.toml", crate / "extension.wasm", None, crate / "ui")
            self.assertEqual(first, again)
            with tarfile.open(fileobj=io.BytesIO(gzip.decompress(first))) as tar:
                self.assertIn("CHANGELOG.md", tar.getnames())
                self.assertEqual(tar.extractfile("CHANGELOG.md").read(), b"## 1.0.0\n- first\n")


if __name__ == "__main__":
    unittest.main()
