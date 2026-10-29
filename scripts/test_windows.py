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


class AllDesktops(unittest.TestCase):
    def test_a_panel_of_its_own_says_it(self):
        check('kind = "panel"\nall-desktops = true')
        check('kind = "panel"\nposition = "top-right"\nfocus = false\nall-desktops = false')
        check('kind = "panel"\nall_desktops = true')

    def test_a_window_and_a_tied_panel_have_none(self):
        self.assertIn("only a panel has", refusal("all-desktops = true"))
        self.assertIn("beside the selection", refusal('kind = "panel"\nposition = "selection"\nall-desktops = true'))

    def test_it_is_true_or_false(self):
        self.assertIn("is not true or false", refusal('kind = "panel"\nall-desktops = "yes"'))


class RememberFrame(unittest.TestCase):
    def test_it_is_true_or_false(self):
        check("remember-frame = true")
        self.assertIn("not true or false", refusal('remember-frame = "yes"'))



class KeepAlive(unittest.TestCase):
    # A window's as well as a panel's since Lumi 1.65.
    def test_a_window_or_a_panel_and_one_page(self):
        check('kind = "panel"\nkeep-alive = true')
        check("keep-alive = true")
        self.assertIn("the panel card's keep-alive = 'yes' is not true or false", refusal('kind = "panel"\nkeep-alive = "yes"'))
        self.assertIn("the window card's keep-alive = 'yes' is not true or false", refusal('keep-alive = "yes"'))
        self.assertIn("one panel's — leave copies out", refusal('kind = "panel"\ncopies = 3\nkeep-alive = true'))
        self.assertIn("one window's — leave copies out", refusal("copies = 3\nkeep-alive = true"))


class KeepSites(unittest.TestCase):
    def test_a_kept_page_keeps_its_sites(self):
        check('kind = "panel"\nkeep-alive = true\nkeep-sites = true')
        check("keep-alive = true\nkeep-sites = true")
        check('kind = "panel"\nkeep-sites = false')

    def test_without_keep_alive_it_is_refused(self):
        self.assertIn("needs keep-alive = true", refusal('kind = "panel"\nkeep-sites = true'))
        self.assertIn("needs keep-alive = true", refusal("keep-sites = true"))

    def test_it_is_true_or_false(self):
        self.assertIn("is not true or false", refusal('kind = "panel"\nkeep-alive = true\nkeep-sites = "yes"'))


class SelectionWatch(unittest.TestCase):
    def manifest(self, capabilities: str, line: str):
        return tomllib.loads(
            BASE.replace('version = "1.0.0"', f'version = "1.0.0"\ncapabilities = [{capabilities}]\n{line}').format(fields="")
        )

    def test_hearing_selections_needs_the_permission(self):
        for event in ("selection", "keyboard-selection", "selection-watching"):
            with self.assertRaises(SystemExit) as caught:
                publish.check_manifest("dev.you.thing", self.manifest('"accessibility"', f'events = ["{event}"]'))
            self.assertIn("needs the selection-watch capability", str(caught.exception.code))
            publish.check_manifest("dev.you.thing", self.manifest('"selection-watch"', f'events = ["{event}"]'))

    def test_where_the_switch_starts_needs_the_permission(self):
        publish.check_manifest("dev.you.thing", self.manifest('"selection-watch"', "selection-watch-default = false"))
        with self.assertRaises(SystemExit) as caught:
            publish.check_manifest("dev.you.thing", self.manifest("", "selection-watch-default = false"))
        self.assertIn("needs the selection-watch capability", str(caught.exception.code))
        with self.assertRaises(SystemExit) as caught:
            publish.check_manifest("dev.you.thing", self.manifest('"selection-watch"', 'selection-watch-default = "off"'))
        self.assertIn("is not true or false", str(caught.exception.code))


class TextInput(unittest.TestCase):
    def manifest(self, capabilities: str, line: str = ""):
        return tomllib.loads(
            BASE.replace('version = "1.0.0"', f'version = "1.0.0"\ncapabilities = [{capabilities}]\n{line}').format(fields="")
        )

    def refusal(self, capabilities: str, line: str = "") -> str:
        with self.assertRaises(SystemExit) as caught:
            publish.check_manifest("dev.you.thing", self.manifest(capabilities, line))
        return str(caught.exception.code)

    def test_it_never_stands_beside_a_way_off_the_mac(self):
        for capabilities, named in (('"text-input", "network"', "network"), ('"ai", "text-input"', "ai")):
            self.assertIn(f"text-input cannot be declared with {named}", self.refusal(capabilities))
        publish.check_manifest("dev.you.thing", self.manifest('"text-input", "front-app"', 'events = ["text-input", "text-input-enabled", "front-app"]'))

    def test_its_events_and_switch_need_their_words(self):
        for event, needs in (("text-input", "text-input"), ("text-input-enabled", "text-input"), ("front-app", "front-app")):
            self.assertIn(f"needs the {needs} capability", self.refusal('"menu"', f'events = ["{event}"]'))
        publish.check_manifest("dev.you.thing", self.manifest('"text-input"', "text-input-default = false"))
        self.assertIn("needs the text-input capability", self.refusal("", "text-input-default = false"))
        self.assertIn("is not true or false", self.refusal('"text-input"', 'text-input-default = "off"'))

    def test_the_menu_bar_item_heading_needs_the_item(self):
        publish.check_manifest("dev.you.thing", self.manifest('"menu-bar-item"', "menu-bar-item-heading = false"))
        self.assertIn("needs the menu-bar-item capability", self.refusal('"menu"', "menu-bar-item-heading = false"))
        self.assertIn("is not true or false", self.refusal('"menu-bar-item"', 'menu-bar-item-heading = "no"'))
        self.assertIn("needs the menu-bar-item capability", self.refusal('"menu"', 'events = ["menu-bar-item-shown"]'))
        publish.check_manifest("dev.you.thing", self.manifest('"menu-bar-item"', "menu-bar-item-settings = false"))
        self.assertIn("needs the menu-bar-item capability", self.refusal('"menu"', "menu-bar-item-settings = false"))
        self.assertIn("is not true or false", self.refusal('"menu-bar-item"', "menu-bar-item-settings = 0"))

    def test_a_right_click_on_the_item_runs_a_declared_command(self):
        publish.check_manifest("dev.you.thing", self.manifest('"menu-bar-item"', 'menu-bar-item-right-click = "open"'))
        self.assertIn("does not declare", self.refusal('"menu-bar-item"', 'menu-bar-item-right-click = "quit"'))
        self.assertIn("needs the menu-bar-item capability", self.refusal('"menu"', 'menu-bar-item-right-click = "open"'))
        self.assertIn("is not a command's name", self.refusal('"menu-bar-item"', "menu-bar-item-right-click = true"))

    def test_only_a_public_source_may_type(self):
        ext = {"capabilities": ["text-input"]}
        publish.check_open_source({"id": "dev.you.thing"}, ext)
        publish.check_open_source({"id": "dev.you.thing", "private": True}, {"capabilities": ["menu"]})
        with self.assertRaises(SystemExit) as caught:
            publish.check_open_source({"id": "dev.you.thing", "private": True}, ext)
        self.assertIn("only an extension whose source is public", str(caught.exception.code))


class Ai(unittest.TestCase):
    def test_it_is_a_capability_lumi_offers(self):
        publish.check_manifest("dev.you.thing", tomllib.loads(
            BASE.replace('version = "1.0.0"', 'version = "1.0.0"\ncapabilities = ["ai"]').format(fields="")
        ))


class Preload(unittest.TestCase):
    GRANTED =BASE.replace('version = "1.0.0"', 'version = "1.0.0"\ncapabilities = ["preload"]')

    def granted(self, fields: str) -> None:
        publish.check_manifest("dev.you.thing", tomllib.loads(self.GRANTED.format(fields=fields)))

    # A window's as well as a panel's since Lumi 1.65.
    def test_a_kept_window_or_panel_with_its_permission(self):
        self.granted('kind = "panel"\nkeep-alive = true\npreload = true')
        self.granted("keep-alive = true\npreload = true")
        check('kind = "panel"\npreload = false')
        check("preload = false")
        self.assertIn("the panel card asks to be loaded ahead, which needs keep-alive", refusal('kind = "panel"\npreload = true'))
        self.assertIn("the window card asks to be loaded ahead, which needs keep-alive", refusal("preload = true"))
        self.assertIn("needs the preload capability", refusal('kind = "panel"\nkeep-alive = true\npreload = true'))
        self.assertIn("needs the preload capability", refusal("keep-alive = true\npreload = true"))

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


class BesideTheSelection(unittest.TestCase):
    """`position = "selection"` (Lumi 1.47): a panel's word, with no place of
    its own — `manifest.rs`'s refusals, same sentence."""

    def test_a_panel_may_open_beside_the_selection(self):
        check('kind = "panel"\nposition = "selection"')
        check('kind = "panel"\nposition = "selection"\nfocus = false')

    def test_a_window_may_not(self):
        self.assertIn("only a panel has", refusal('position = "selection"'))

    def test_it_says_where_beside_it_in_words(self):
        check('kind = "panel"\nposition = "selection"\nanchor = { at = "end", side = "below" }')
        check('kind = "panel"\nposition = "selection"\nanchor = { side = "pointer" }')
        check('kind = "panel"\nposition = "selection"\nanchor = {}')
        self.assertIn("stands at", refusal('kind = "panel"\nposition = "selection"\nanchor = { at = "middle" }'))
        self.assertIn('"above", "below" or "pointer"', refusal('kind = "panel"\nposition = "selection"\nanchor = { side = "left" }'))
        self.assertIn("a table of at and side", refusal('kind = "panel"\nposition = "selection"\nanchor = { gap = 4 }'))
        self.assertIn('only a panel at position = "selection"', refusal('kind = "panel"\nposition = "top-right"\nanchor = { at = "end" }'))

    def test_it_says_what_a_scroll_does_in_words(self):
        check('kind = "panel"\nposition = "selection"\nfocus = false\nscroll = "follow"')
        check('kind = "panel"\nposition = "selection"\nscroll = "hide"')
        self.assertIn('"hide" or "follow"', refusal('kind = "panel"\nposition = "selection"\nscroll = "stay"'))
        self.assertIn('only a panel at position = "selection"', refusal('kind = "panel"\nposition = "top-right"\nscroll = "follow"'))

    def test_it_has_no_place_of_its_own(self):
        for key in ("remember-frame = true", "restore = true", "copies = 4"):
            refused = refusal(f'kind = "panel"\nposition = "selection"\n{key}')
            self.assertIn("opens beside the selection", refused)


ITEM_BASE = """
[extension]
id = "dev.you.thing"
name = "Thing"
version = "1.0.0"
capabilities = ["menu-bar-item"]

[[command]]
name = "open"
label = "Open"

[[window]]
name = "card"
path = "card.html"
kind = "panel"
position = "menu-bar-item"
{fields}
"""


def under_item(fields: str) -> None:
    publish.check_manifest("dev.you.thing", tomllib.loads(ITEM_BASE.format(fields=fields)))


def under_item_refusal(fields: str) -> str:
    with unittest.TestCase().assertRaises(SystemExit) as caught:
        under_item(fields)
    return str(caught.exception.code)


class UnderTheMenuBarItem(unittest.TestCase):
    """`position = "menu-bar-item"` (Lumi 1.61): a panel's word that needs
    the item's capability, one per extension, an edge for its anchor and
    never a side, and no place of its own — `manifest.rs`'s refusals, same
    sentences."""

    def test_a_panel_may_open_under_the_item(self):
        under_item("")
        under_item("focus = false")
        under_item('material = "popover"\nkeep-alive = true')

    def test_it_needs_the_items_capability(self):
        self.assertIn("needs the menu-bar-item capability", refusal('kind = "panel"\nposition = "menu-bar-item"'))

    def test_a_window_may_not(self):
        self.assertIn("only a panel has", refusal('position = "menu-bar-item"'))

    def test_its_anchor_is_an_edge_and_never_a_side(self):
        under_item('anchor = { at = "center" }')
        under_item('anchor = { at = "end" }')
        under_item("anchor = {}")
        self.assertIn("always goes below the item", under_item_refusal('anchor = { side = "above" }'))
        self.assertIn("always goes below the item", under_item_refusal('anchor = { at = "end", side = "below" }'))
        self.assertIn("under the menu bar item stands at", under_item_refusal('anchor = { at = "middle" }'))

    def test_it_has_no_place_of_its_own(self):
        for key in ("remember-frame = true", "restore = true", "copies = 4"):
            self.assertIn("under the extension's item in the menu bar", under_item_refusal(key))

    def test_the_selections_keys_stay_the_selections(self):
        self.assertIn('only a panel at position = "selection"', under_item_refusal('scroll = "follow"'))

    def test_it_may_point_an_arrow_cut_into_its_glass(self):
        under_item('material = "popover"\narrow = true')
        under_item('material = "hud"\narrow = false')
        self.assertIn("cut into its glass", under_item_refusal("arrow = true"))
        self.assertIn("cut into its glass", under_item_refusal('material = "clear"\narrow = true'))
        self.assertIn("leave overhang out", under_item_refusal('material = "popover"\narrow = true\noverhang = 40'))
        self.assertIn("is not true or false", under_item_refusal('material = "popover"\narrow = "yes"'))
        self.assertIn('only a panel at position = "menu-bar-item"', refusal('kind = "panel"\nmaterial = "popover"\narrow = true'))

    def test_one_item_opens_one_panel(self):
        second = '\n[[window]]\nname = "other"\npath = "other.html"\nkind = "panel"\nposition = "menu-bar-item"'
        self.assertIn("both open under the extension's item", under_item_refusal(second))


class PanelFloor(unittest.TestCase):
    """A panel's floor is a panel's (`PANEL_*_MIN`, Lumi 1.47): a one-row
    panel may say how small it can be made; a window keeps its own floor."""

    def test_a_panel_may_be_one_row_tall(self):
        check('kind = "panel"\nwidth = 200\nheight = 36\nmin-height = 32')

    def test_each_kind_is_held_to_its_own_floor(self):
        # A panel 36 tall may not say it can be made 40: 40 is its floor now.
        refused = refusal('kind = "panel"\nwidth = 200\nheight = 36\nmin-height = 40')
        self.assertIn("more than its height", refused)
        # A window holds both up to 180, where neither is more than the other.
        check('width = 200\nheight = 36\nmin-height = 40')
