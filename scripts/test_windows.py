"""`[[window]]`: the store's mirror of the window rules in Lumi's
`manifest.rs` that `check_manifest` repeats, so a manifest Lumi would refuse
is refused before it is built.

  python3 -m unittest discover -s scripts -p 'test_*.py'
"""

import sys
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

[[command]]
name = "open"
label = "Open"

[[window]]
name = "card"
path = "card.html"
{fields}
"""


def check(fields: str) -> None:
    publish.check_manifest("dev.you.thing", tomllib.loads(BASE.format(fields=fields)))


def refusal(fields: str) -> str:
    with unittest.TestCase().assertRaises(SystemExit) as caught:
        check(fields)
    return str(caught.exception.code)


class Overhang(unittest.TestCase):
    def test_a_panel_with_a_material_may_have_one(self):
        check('kind = "panel"\nmaterial = "popover"\noverhang = 240')
        check('kind = "panel"\nmaterial = "clear"\noverhang = 12.5')
        check('kind = "panel"\nmaterial = "hud"\noverhang = 0')

    def test_a_window_or_a_panel_without_glass_has_none(self):
        self.assertIn("only a panel has", refusal("overhang = 240"))
        self.assertIn("needs a material", refusal('kind = "panel"\noverhang = 240'))

    def test_it_is_a_distance(self):
        for wrong in ("-1", '"a lot"', "true"):
            self.assertIn("not a distance", refusal(f'kind = "panel"\nmaterial = "popover"\noverhang = {wrong}'))

    def test_it_may_name_its_sides(self):
        check('kind = "panel"\nmaterial = "popover"\noverhang = { below = 280, left = 280, right = 280 }')
        check('kind = "panel"\nmaterial = "popover"\noverhang = {}')
        refused = refusal('kind = "panel"\nmaterial = "popover"\noverhang = { below = -1 }')
        self.assertIn("overhang below is not a distance", refused)
        refused = refusal('kind = "panel"\nmaterial = "popover"\noverhang = { bottom = 280 }')
        self.assertIn("table of sides", refused)


class Listed(unittest.TestCase):
    def test_it_is_true_or_false(self):
        check("listed = false")
        check('kind = "panel"\nfocus = false\nlisted = false')
        self.assertIn("not true or false", refusal('listed = "no"'))


class Copies(unittest.TestCase):
    def test_two_to_thirty_two_never_listed(self):
        check('kind = "panel"\ncopies = 16')
        check('copies = 2\nlisted = false')
        for wrong in ("1", "0", "33", "true", '"many"'):
            self.assertIn("copies", refusal(f"copies = {wrong}"))
        self.assertIn("no button", refusal("copies = 2\nlisted = true"))

    def test_no_two_windows_answer_to_one_name(self):
        clash = '\n[[window]]\nname = "card-2"\npath = "card.html"'
        self.assertIn("two windows answer to card-2", refusal("copies = 3" + clash))


class RememberFrame(unittest.TestCase):
    def test_it_is_true_or_false(self):
        check("remember-frame = true")
        self.assertIn("not true or false", refusal('remember-frame = "yes"'))



class KeepAlive(unittest.TestCase):
    def test_a_panels_alone_and_one_page(self):
        check('kind = "panel"\nkeep-alive = true')
        self.assertIn("only a panel has", refusal("keep-alive = true"))
        self.assertIn("not true or false", refusal('kind = "panel"\nkeep-alive = "yes"'))
        self.assertIn("leave copies out", refusal('kind = "panel"\ncopies = 3\nkeep-alive = true'))


class Preload(unittest.TestCase):
    GRANTED = BASE.replace('version = "1.0.0"', 'version = "1.0.0"\ncapabilities = ["preload"]')

    def granted(self, fields: str) -> None:
        publish.check_manifest("dev.you.thing", tomllib.loads(self.GRANTED.format(fields=fields)))

    def test_a_kept_panels_with_its_permission(self):
        self.granted('kind = "panel"\nkeep-alive = true\npreload = true')
        check('kind = "panel"\npreload = false')
        self.assertIn("only a panel has", refusal("preload = true"))
        self.assertIn("needs keep-alive", refusal('kind = "panel"\npreload = true'))
        self.assertIn("needs the preload capability", refusal('kind = "panel"\nkeep-alive = true\npreload = true'))

    def test_its_event_needs_the_permission(self):
        heard = BASE.replace('version = "1.0.0"', 'version = "1.0.0"\nevents = ["preload-enabled"]')
        with self.assertRaises(SystemExit) as caught:
            publish.check_manifest("dev.you.thing", tomllib.loads(heard.format(fields="")))
        self.assertIn("needs the preload capability", str(caught.exception.code))
        both = heard.replace("events =", 'capabilities = ["preload"]\nevents =')
        publish.check_manifest("dev.you.thing", tomllib.loads(both.format(fields="")))

    def test_where_the_switch_starts_needs_the_permission(self):
        starts = lambda capabilities, line: tomllib.loads(
            BASE.replace('version = "1.0.0"', f'version = "1.0.0"\ncapabilities = [{capabilities}]\n{line}').format(fields="")
        )
        publish.check_manifest("dev.you.thing", starts('"preload"', "preload-default = false"))
        publish.check_manifest("dev.you.thing", starts('"preload"', "preload-default = true"))
        with self.assertRaises(SystemExit) as caught:
            publish.check_manifest("dev.you.thing", starts("", "preload-default = false"))
        self.assertIn("needs the preload capability", str(caught.exception.code))
        with self.assertRaises(SystemExit) as caught:
            publish.check_manifest("dev.you.thing", starts('"preload"', 'preload-default = "off"'))
        self.assertIn("is not true or false", str(caught.exception.code))


if __name__ == "__main__":
    unittest.main()
