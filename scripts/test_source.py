"""The index's `source`: where the store page's Source row leads.

  python3 -m unittest discover -s scripts -p 'test_*.py'
"""

import sys
import tempfile
import tomllib
import unittest
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parent))
import publish  # noqa: E402


class Source(unittest.TestCase):
    def test_an_entry_kept_here_is_read_at_its_path(self):
        entry = {"id": "dev.you.thing", "path": "ext/dev.you.thing", "subdir": "."}
        self.assertEqual(publish.source_of(entry), f"{publish.STORE_SOURCE}ext/dev.you.thing/")

    def test_a_subdir_is_part_of_the_path(self):
        entry = {"id": "dev.you.thing", "path": "ext/dev.you.thing", "subdir": "crate"}
        self.assertEqual(publish.source_of(entry), f"{publish.STORE_SOURCE}ext/dev.you.thing/crate/")

    def test_a_private_entry_names_no_source(self):
        entry = {"id": "dev.you.thing", "path": "ext/dev.you.thing", "private": True}
        self.assertIsNone(publish.source_of(entry))

    def test_a_submodule_names_no_source_here(self):
        with tempfile.TemporaryDirectory() as root:
            Path(root, ".gitmodules").write_text(
                '[submodule "ext/dev.you.thing"]\n\tpath = ext/dev.you.thing\n\turl = git@github.com:you/thing.git\n',
                encoding="utf-8",
            )
            with mock.patch.object(publish, "ROOT", Path(root)):
                self.assertIsNone(publish.source_of({"id": "dev.you.thing", "path": "ext/dev.you.thing"}))
                self.assertIsNotNone(publish.source_of({"id": "dev.you.other", "path": "ext/dev.you.other"}))

    def test_every_listed_public_entry_names_its_source(self):
        """The registry as it stands: an in-tree entry gets a link to a
        directory that is there, and every submodule entry is private."""
        listing = tomllib.loads((publish.ROOT / "extensions.toml").read_text(encoding="utf-8"))
        for entry in listing["extension"]:
            source = publish.source_of(entry)
            if entry.get("private"):
                self.assertIsNone(source, entry["id"])
                continue
            self.assertIsNotNone(source, entry["id"])
            in_repo = source.removeprefix(publish.STORE_SOURCE)
            self.assertTrue((publish.ROOT / in_repo / "manifest.toml").is_file(), entry["id"])


if __name__ == "__main__":
    unittest.main()
