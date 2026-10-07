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


if __name__ == "__main__":
    unittest.main()
