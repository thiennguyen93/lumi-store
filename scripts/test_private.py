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


class ManifestWithoutComments(unittest.TestCase):
    """A private entry's manifest is packed without its comments, and reads
    exactly as the source does."""

    def bare(self, text):
        return publish.without_comments("dev.you.closed", text).decode("utf-8")

    def test_comments_go_and_the_document_stays(self):
        source = (
            "# Closed source: notes on how it is built.\n"
            "[extension]\n"
            'id = "dev.you.closed" # trailing note\n'
            "\n"
            "\n"
            "# A comment between two tables.\n"
            "\n"
            "[[command]]\n"
            'name = "go"\n'
        )
        self.assertEqual(self.bare(source), '[extension]\nid = "dev.you.closed"\n\n[[command]]\nname = "go"\n')

    def test_a_hash_inside_a_string_is_kept(self):
        source = (
            'color = "#378add" # not this\n'
            "path = 'C:#literal' # nor this\n"
            'quote = "say \\"#hi\\"" # nor this\n'
            'key = "a#b"\n'
        )
        bare = self.bare(source)
        self.assertNotIn("not this", bare)
        self.assertNotIn("nor this", bare)
        self.assertEqual(publish.tomllib.loads(bare), publish.tomllib.loads(source))

    def test_a_multi_line_string_is_left_alone(self):
        source = 'body = """\nline one # stays\n\n\nline two\n""" # goes\nother = \'\'\'\n# stays too\n\'\'\'\n'
        bare = self.bare(source)
        self.assertIn("# stays\n\n\nline two", bare)
        self.assertIn("# stays too", bare)
        self.assertNotIn("goes", bare)
        self.assertEqual(publish.tomllib.loads(bare), publish.tomllib.loads(source))

    def test_the_screenshot_manifest_shape_round_trips(self):
        source = (
            "[[settings]]\n"
            'name = "open" # what opens\n'
            'kind = "select"\n'
            "\n"
            "# One choice.\n"
            "[[settings.options]]\n"
            'value = "editor"\n'
            'label = "The editor"\n'
            'capabilities = ["screen", "clipboard"] # costs\n'
        )
        bare = self.bare(source)
        self.assertNotIn("#", bare)
        self.assertEqual(publish.tomllib.loads(bare), publish.tomllib.loads(source))

    def test_pack_strips_only_when_asked(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            manifest = root / "manifest.toml"
            manifest.write_text('# private notes\n[extension]\nid = "dev.you.closed"\n')
            wasm = root / "extension.wasm"
            wasm.write_bytes(b"\0asm")
            (root / "ui").mkdir()

            def packed_manifest(strip):
                data = publish.pack("dev.you.closed", manifest, wasm, None, root / "ui", strip_comments=strip)
                import gzip
                import tarfile

                with tarfile.open(fileobj=io.BytesIO(gzip.decompress(data))) as tar:
                    return tar.extractfile("manifest.toml").read().decode()

            self.assertIn("private notes", packed_manifest(False))
            self.assertEqual(packed_manifest(True), '[extension]\nid = "dev.you.closed"\n')
