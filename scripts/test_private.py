"""`private = true` entries: skipped by `--check` when their source is not
checked out, refused by every mode that publishes.

  python3 -m unittest discover -s scripts -p 'test_*.py'
"""

import io
import sys
import tempfile
import unittest
from contextlib import redirect_stdout
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parent))
import publish  # noqa: E402

ENTRY = """
[[extension]]
id = "dev.you.closed"
path = "ext/dev.you.closed"
subdir = "."
category = "Utilities"
private = {private}
"""


class PrivateEntries(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name).resolve()
        (self.root / "ext" / "dev.you.closed").mkdir(parents=True)
        for name, value in (("ROOT", self.root), ("DIST", self.root / "dist"), ("BUILD", self.root / "build")):
            patcher = mock.patch.object(publish, name, value)
            patcher.start()
            self.addCleanup(patcher.stop)

    def tearDown(self):
        self.tmp.cleanup()

    def listing(self, private="true"):
        (self.root / "extensions.toml").write_text(ENTRY.format(private=private))
        return publish.listed_entries()

    def test_private_must_be_a_bool(self):
        with self.assertRaises(SystemExit) as refused:
            self.listing(private='"yes"')
        self.assertIn("private is true or false", str(refused.exception))

    def test_an_empty_submodule_is_not_fetched(self):
        entry = self.listing()[0]
        self.assertFalse(publish.fetched(entry))
        (self.root / "ext" / "dev.you.closed" / "manifest.toml").write_text("")
        self.assertTrue(publish.fetched(entry))

    def test_check_skips_an_unfetched_private_entry_and_says_so(self):
        self.listing()
        said = io.StringIO()
        with redirect_stdout(said):
            publish.main(check=True)
        self.assertIn("dev.you.closed: skipped", said.getvalue())
        self.assertIn("checked 0 extension(s)", said.getvalue())

    def test_publishing_refuses_an_unfetched_private_entry(self):
        self.listing()
        with self.assertRaises(SystemExit) as refused:
            publish.main(built=self.root / "built")
        self.assertIn("private source is not checked out", str(refused.exception))
        with self.assertRaises(SystemExit) as refused:
            publish.build_one("dev.you.closed", self.root / "out")
        self.assertIn("private source is not checked out", str(refused.exception))

    def test_a_public_entry_is_never_skipped(self):
        self.listing(private="false")
        with self.assertRaises(SystemExit) as refused:
            publish.main(check=True)
        self.assertIn("no manifest.toml", str(refused.exception))


if __name__ == "__main__":
    unittest.main()
