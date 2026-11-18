"""`[switches]`, `[launcher]` and the name rule (Lumi 1.89): the store's
mirror of `manifest.rs`'s `switches_of`, `launcher_of`, `launcher_targets`,
`app_name_refusal` and `script_mix`, held to the cases of the Rust tests that
pin them — `switches_are_one_table`,
`the_launcher_is_named_and_drawn_by_the_manifest_or_the_extension`,
`the_launcher_opens_what_the_manifest_says` and
`a_name_mixes_scripts_only_as_moderately_restrictive_allows` — so a manifest
Lumi would refuse is refused before it is built.

  python3 -m unittest discover -s scripts -p 'test_*.py'
"""

import sys
import tempfile
import tomllib
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import publish  # noqa: E402

FLOOR = 'min-lumi-version = "1.89.0"'


def manifest(capabilities: str = "", lines: str = "", name: str = "W", floor: str = FLOOR, extension: str = "") -> dict:
    """A manifest of `dev.test.w`, the shape the Rust tests parse: `lines`
    after the [extension] table, `extension` inside it."""
    return tomllib.loads(
        f'[extension]\nid = "dev.test.w"\nname = "{name}"\nversion = "1.0.0"\n{floor}\n'
        f"capabilities = [{capabilities}]\n{extension}\n{lines}"
    )


def check(*args, **kwargs) -> dict:
    return publish.check_manifest("dev.test.w", manifest(*args, **kwargs))


def refusal(*args, **kwargs) -> str:
    with unittest.TestCase().assertRaises(SystemExit) as caught:
        check(*args, **kwargs)
    return str(caught.exception.code)


def launcher(capabilities: str = '"launcher"', lines: str = "", **kwargs):
    """What `check_launcher` works the app out to be, once the whole
    manifest has passed."""
    ext = manifest(capabilities, lines, **kwargs)
    publish.check_manifest("dev.test.w", ext)
    return publish.check_launcher("dev.test.w", ext)


class Switches(unittest.TestCase):
    """`switches_are_one_table`: said in `[switches]` or by a switch's older
    `*-default` key, the answer is the same; said both ways it is refused; a
    word no switch has is refused by name; and a switch said without its
    capability is refused, whichever spelling said it. Asked of every switch
    in SWITCHES, so one added later is held to the same rules."""

    def test_every_switch_is_one_table(self):
        for word, capability, alias in publish.SWITCHES:
            granted = f'"{capability}"'
            with self.subTest(word):
                check(granted)
                for on in ("true", "false"):
                    check(granted, f"[switches]\n{word} = {on}")
                    if alias:
                        check(granted, extension=f"{alias} = {on}")
                if alias:
                    both = refusal(granted, f"[switches]\n{word} = false", extension=f"{alias} = true")
                    self.assertIn("both say", both)
                    self.assertIn("keep the [switches] one", both)
                without = refusal("", f"[switches]\n{word} = false")
                self.assertIn(f"needs the {capability} capability", without)
                self.assertIn(f"[switches] {word}", without)

    def test_a_word_no_switch_has_is_refused_by_name(self):
        unknown = refusal("", "[switches]\nlaser = true")
        self.assertIn("laser", unknown)
        self.assertIn("the switches are preload, selection-watch, text-input, launcher", unknown)

    def test_a_switch_starts_on_or_off_and_nothing_else(self):
        self.assertIn("is not true or false", refusal('"preload"', '[switches]\npreload = "off"'))
        self.assertIn("is not true or false", refusal('"preload"', extension='preload-default = "off"'))
        # A top-level key, which TOML cannot write after [extension].
        flat = manifest('"preload"')
        flat["switches"] = "preload"
        with self.assertRaises(SystemExit) as caught:
            publish.check_manifest("dev.test.w", flat)
        self.assertIn("is a table", str(caught.exception.code))

    def test_an_older_key_names_itself_when_its_capability_is_missing(self):
        for word, capability, alias in publish.SWITCHES:
            if alias:
                refused = refusal("", extension=f"{alias} = false")
                self.assertIn(f"{alias} says where the {word} switch starts", refused)
                self.assertIn(f"needs the {capability} capability", refused)
        refused = refusal("", extension="preload_default = false")
        self.assertIn("preload-default says where the preload switch starts", refused)
        twice = refusal('"preload"', extension="preload-default = false\npreload_default = false")
        self.assertIn("said twice", twice)

    def test_the_table_needs_the_lumi_that_reads_it(self):
        refused = refusal('"preload"', "[switches]\npreload = false", floor="")
        self.assertIn("1.89.0", refused)
        self.assertIn("min-lumi-version", refused)
        refusal('"preload"', "[switches]\npreload = false", floor='min-lumi-version = "1.88.0"')
        # The older keys are read by every Lumi since they were added.
        check('"preload"', extension="preload-default = false", floor="")


class LauncherNames(unittest.TestCase):
    """`the_launcher_is_named_and_drawn_by_the_manifest_or_the_extension`:
    present only beside the `launcher` capability, named by `[launcher] name`
    or else by the extension's `name` folded as the menu bar folds it, drawn
    from `[launcher] icon` or else from icon.svg — and every name held to the
    window's `app-name` rule and to a file name's."""

    def test_no_capability_no_app(self):
        ext = manifest("", name="Lumi Gõ tiếng Việt")
        publish.check_manifest("dev.test.w", ext)
        self.assertIsNone(publish.check_launcher("dev.test.w", ext))

    def test_the_capability_alone_is_an_app_named_as_the_extension(self):
        app = launcher(name="Lumi Gõ tiếng Việt")
        self.assertEqual(
            app,
            {"name": "Lumi Gõ tiếng Việt", "icon": None, "opens": "page", "window": None, "tab": None, "switch_on": True},
        )

    def test_the_extensions_name_is_folded_and_made_a_file_name(self):
        self.assertEqual(launcher(name="Meeting  Notes\\n")["name"], "Meeting Notes")
        self.assertEqual(launcher(name="A/B: C")["name"], "A-B- C")
        long = launcher(name="x" * (publish.MAX_APP_NAME + 5))["name"]
        self.assertEqual(len(long), publish.MAX_APP_NAME)
        self.assertTrue(long.endswith("…"))
        self.assertEqual(launcher(name="..Dots")["name"], "Dots")

    def test_the_manifest_may_name_and_draw_it(self):
        app = launcher(lines='[launcher]\nname = " Gõ Việt "\nicon = "app/icon.svg"')
        self.assertEqual((app["name"], app["icon"]), ("Gõ Việt", "app/icon.svg"))

    def test_a_launcher_table_needs_the_capability(self):
        self.assertIn("needs the launcher capability", refusal("", '[launcher]\nname = "Gõ"'))

    def test_every_name_is_an_app_name_and_a_file_name(self):
        for name, lines, says in (
            ("W", 'name = "  "', "[launcher] name is empty"),
            ("W", 'name = "A/B"', "[launcher] name holds a /"),
            ("W", 'name = "A:B"', "[launcher] name holds a :"),
            ("W", 'name = ".Hidden"', "[launcher] name starts with a full stop"),
            ("W", 'name = "Sаfari"', "[launcher] name mixes Latin and Cyrillic"),
            ("W", f'name = "{"x" * (publish.MAX_APP_NAME + 1)}"', "[launcher] name is longer than 32 characters"),
            ("W", 'name = "Two\\nlines"', "[launcher] name has to be one line"),
            ("Sаfari", "", "set [launcher] name"),
            ("W", 'icon = "compass"', "Lucide"),
            ("W", 'icon = "../x.svg"', "an SVG file under ui/"),
            ("W", 'icon = "/abs/x.svg"', "an SVG file under ui/"),
            ("W", 'icon = "Not An Icon"', "an SVG file under ui/"),
            ("W", "name = 1", "is not text"),
            ("W", 'switch-on = "yes"', "is not true or false"),
        ):
            with self.subTest(lines or name):
                self.assertIn(says, refusal('"launcher"', f"[launcher]\n{lines}", name=name))

    def test_a_separator_lumi_does_not_trim_is_a_second_line(self):
        # U+001F is whitespace to Python's `str.strip` and not to Rust's
        # `str::trim`: Lumi keeps it and refuses the name, so the store does.
        self.assertIn("has to be one line", refusal('"launcher"', '[launcher]\nname = "Lumi\\u001F"'))
        self.assertIn("has to be one line", refusal('"launcher"', name="A\\u001CB"))

    def test_it_needs_the_lumi_that_reads_it(self):
        for capabilities in ('"launcher"',):
            refused = refusal(capabilities, floor="")
            self.assertIn('set min-lumi-version to "1.89.0"', refused)
        self.assertIn("1.89.0", refusal('"launcher"', floor='min-lumi-version = "1.88.0"'))

    def test_its_event_needs_its_word(self):
        self.assertIn("needs the launcher capability", refusal("", extension='events = ["launcher-shown"]'))
        check('"launcher"', extension='events = ["launcher-shown"]')


OPENS = """
[[window]]
name = "main"
path = "main.html"

[[window]]
name = "pop"
path = "pop.html"
kind = "panel"
position = "menu-bar-item"

[[window]]
name = "card"
path = "card.html"
copies = 3

[[page]]
name = "keys"
label = "Keys"
path = "keys.html"
"""


class LauncherOpens(unittest.TestCase):
    """`the_launcher_opens_what_the_manifest_says`: its page (the default, on
    a tab when one is named), one of its windows, or its own code — and
    whether opening it while it is off switches it on. Every name it gives is
    one the manifest has, and every key belongs to the opening it is said
    with."""

    granted = '"launcher", "menu-bar-item"'

    def opens(self, lines: str = ""):
        app = launcher(self.granted, f"{lines}\n{OPENS}")
        return (app["opens"], app["window"], app["tab"], app["switch_on"])

    def refusal(self, lines: str) -> str:
        return refusal(self.granted, f"[launcher]\n{lines}\n{OPENS}")

    def test_what_it_opens(self):
        self.assertEqual(self.opens(), ("page", None, None, True), "the capability alone")
        self.assertEqual(self.opens('[launcher]\nopens = "page"\ntab = ":about"'), ("page", None, ":about", True))
        self.assertEqual(self.opens('[launcher]\ntab = ":page:keys"'), ("page", None, ":page:keys", True))
        self.assertEqual(
            self.opens('[launcher]\nopens = "window"\nwindow = "main"\nswitch-on = false'),
            ("window", "main", None, False),
        )
        self.assertEqual(self.opens('[launcher]\nopens = "run"'), ("run", None, None, True))
        self.assertEqual(self.opens('[launcher]\nopens = "none"\nswitch-on = false'), ("none", None, None, False))
        self.assertEqual(self.opens('[launcher]\nopens = "window"\nwindow = "card-2"')[:2], ("window", "card-2"))

    def test_every_key_belongs_to_its_opening_and_names_what_the_manifest_has(self):
        for lines, says in (
            ('opens = "window"', "needs window"),
            ('opens = "window"\nwindow = "nope"', "no [[window]] is called"),
            ('opens = "window"\nwindow = "card"', "no [[window]] is called"),
            ('opens = "window"\nwindow = "card-4"', "no [[window]] is called"),
            ('opens = "window"\nwindow = "pop"', "nowhere to put it"),
            ('window = "main"', 'needs opens = "window"'),
            ('opens = "window"\nwindow = "main"\ntab = ":about"', 'needs opens = "page"'),
            ('opens = "run"\nwindow = "main"', "neither window nor tab"),
            ('opens = "run"\ntab = ":about"', "neither window nor tab"),
            ('tab = ":page:nope"', "[launcher] tab is :page:nope"),
            ('tab = "about"', "is not one of your tabs"),
            ('tab = ":permissions"', "is not one of your tabs"),
            ('opens = "dock"', '"page", "window", "run" or "none"'),
            ('opens = "none"\nwindow = "main"', "neither window nor tab"),
            ('opens = "none"\ntab = ":about"', "neither window nor tab"),
        ):
            with self.subTest(lines):
                self.assertIn(says, self.refusal(lines))

    def test_a_tab_the_manifest_hides_is_nowhere_to_land(self):
        refused = self.refusal('tab = ":changelog"\n\n[tabs.changelog]\nhidden = true')
        self.assertIn("[launcher] tab is :changelog: the manifest hides the Changelog tab", refused)


class ScriptMix(unittest.TestCase):
    """`a_name_mixes_scripts_only_as_moderately_restrictive_allows`: UTS #39's
    moderately restrictive level over a name's letters, with spaces, digits,
    marks and emoji left out."""

    def test_names_that_stand(self):
        for stands in (
            "Lumi Gõ tiếng Việt",
            "Mic Mute",
            "Meeting Notes 2",
            "Thien Nguyen Ext 中文",
            "ひらがな カタカナ 漢字 Lumi",
            "Lumi 注音 ㄅㄆㄇ",
            "Lumi 한국어 漢字",
            "Lumi ภาษาไทย",
            "Lumi العربية",
            "Арр",
            "Русский",
            "Ελληνικά",
            "Notes 📝",
            "",
        ):
            self.assertIsNone(publish.script_mix(stands), stands)

    def test_names_that_mix(self):
        for mixed, says in (
            ("Sаfari", "Latin and Cyrillic"),
            ("Zοom", "Latin and Greek"),
            ("Lumi ภาษาไทย العربية", "Thai and Arabic"),
            ("Ꭺpple Lumi", "Cherokee"),
            ("Русский Ελληνικά", "Cyrillic and Greek"),
        ):
            refused = publish.script_mix(mixed)
            self.assertIsNotNone(refused, mixed)
            self.assertIn(says, refused)

    def test_a_windows_app_name_is_held_to_it_too(self):
        lines = '[[window]]\nname = "card"\npath = "card.html"\napp-name = "Sаfari"'
        self.assertIn("the window card's app-name mixes Latin and Cyrillic", refusal(lines=lines, floor=""))
        check(lines='[[window]]\nname = "card"\npath = "card.html"\napp-name = "Ghi chú"', floor="")

    def test_a_letters_script_is_read_as_lumi_reads_it(self):
        # Each answer is `unicode_script`'s own, read from the crate.
        for letter, script in (
            ("a", "Latin"),
            ("а", "Cyrillic"),
            ("ο", "Greek"),
            ("中", "Han"),
            ("가", "Hangul"),
            ("ア", "Katakana"),
            ("ｱ", "Katakana"),  # HALFWIDTH KATAKANA LETTER A
            ("Ａ", "Latin"),  # FULLWIDTH LATIN CAPITAL LETTER A
            ("ʰ", "Latin"),  # MODIFIER LETTER SMALL H
            ("K", "Latin"),  # KELVIN SIGN
            ("Ω", "Greek"),  # OHM SIGN
            ("Ⅰ", "Latin"),  # ROMAN NUMERAL ONE
            ("҃", "Cyrillic"),  # COMBINING CYRILLIC TITLO
            ("ก", "Thai"),
            ("ا", "Arabic"),
            ("Ꭺ", "Cherokee"),
            ("́", None),  # COMBINING ACUTE ACCENT: Inherited
            ("،", None),  # ARABIC COMMA: Common
            ("ー", None),  # KATAKANA-HIRAGANA PROLONGED SOUND MARK: Common
            ("\U0001d400", None),  # MATHEMATICAL BOLD CAPITAL A: Common
            ("\U0001f4dd", None),
            ("1", None),
            (" ", None),
        ):
            self.assertEqual(publish.script_of(letter), script, f"U+{ord(letter):04X}")


class LauncherIcon(unittest.TestCase):
    """The installer's two rules for the app's own icon: `[launcher] icon`
    ships under ui/, and is no bigger than icon.svg may be."""

    def ui(self, files: dict) -> Path:
        root = Path(tempfile.mkdtemp())
        self.addCleanup(lambda: __import__("shutil").rmtree(root))
        for name, size in files.items():
            path = root / name
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(b"<svg/>" + b" " * max(0, size - 6))
        return root

    def check_ui(self, files: dict, icon: str = "app/icon.svg"):
        ext = manifest('"launcher"', f'[launcher]\nicon = "{icon}"')
        publish.check_manifest("dev.test.w", ext)
        publish.check_ui("dev.test.w", ext, self.ui(files))

    def test_a_shipped_icon_passes(self):
        self.check_ui({"index.html": 10, "app/icon.svg": 100})

    def test_an_icon_that_does_not_ship_or_is_too_big_is_refused(self):
        with self.assertRaises(SystemExit) as caught:
            self.check_ui({"index.html": 10})
        self.assertIn("the package ships no ui/app/icon.svg file", str(caught.exception.code))
        with self.assertRaises(SystemExit) as caught:
            self.check_ui({"index.html": 10, "app/icon.svg": publish.MAX_ICON + 1})
        self.assertIn(f"is past {publish.MAX_ICON} bytes", str(caught.exception.code))


if __name__ == "__main__":
    unittest.main()
