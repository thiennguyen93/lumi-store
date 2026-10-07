"""A version the store already serves goes out as it first did: the package
and signature it was published as, never packed and signed again — and
held to the source it was published from.

  python3 -m unittest discover -s scripts -p 'test_*.py'
"""

import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parent))
import publish  # noqa: E402

ID = "dev.you.thing"
NAME = f"{ID}-1.0.0.tar.gz"


def git(cwd: Path, *args: str):
    subprocess.run(
        ["git", "-c", "user.name=t", "-c", "user.email=t@t", *args],
        cwd=cwd,
        check=True,
        capture_output=True,
    )


class Carried(unittest.TestCase):
    """`carried`: which published package, if any, a version goes out as."""

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.served = Path(self.tmp.name)
        patcher = mock.patch.object(publish, "PUBLISHED_DIR", str(self.served))
        patcher.start()
        self.addCleanup(patcher.stop)

    def tearDown(self):
        self.tmp.cleanup()

    def serve(self, sig=True):
        (self.served / NAME).write_bytes(b"package")
        if sig:
            (self.served / f"{NAME}.sig").write_text("signature")

    def test_a_version_not_served_is_packed(self):
        self.serve()
        self.assertIsNone(publish.carried(ID, "1.0.0", "abc", None))
        self.assertIsNone(publish.carried(ID, "1.0.1", "abc", {"version": "1.0.0", "sourcesSha256": "abc"}))

    def test_a_served_version_from_the_same_source_is_carried(self):
        self.serve()
        kept = publish.carried(ID, "1.0.0", "abc", {"version": "1.0.0", "sourcesSha256": "abc"})
        self.assertEqual(kept, self.served / NAME)

    def test_a_source_moved_under_a_served_version_stops_the_run(self):
        self.serve()
        with self.assertRaises(SystemExit) as refused:
            publish.carried(ID, "1.0.0", "def", {"version": "1.0.0", "sourcesSha256": "abc"})
        self.assertIn("already published, and its source has changed", str(refused.exception))

    def test_a_row_from_before_the_fingerprint_is_carried_as_it_is(self):
        self.serve()
        self.assertEqual(publish.carried(ID, "1.0.0", "def", {"version": "1.0.0"}), self.served / NAME)

    def test_a_listed_version_with_no_signature_beside_it_stops_the_run(self):
        self.serve(sig=False)
        with self.assertRaises(SystemExit) as refused:
            publish.carried(ID, "1.0.0", "abc", {"version": "1.0.0", "sourcesSha256": "abc"})
        self.assertIn(f"no {NAME} with its signature", str(refused.exception))

    def test_nothing_served_is_an_empty_index(self):
        self.assertEqual(publish.serving(), {})
        (self.served / "index.json").write_text(json.dumps([{"id": ID, "version": "1.0.0"}]))
        self.assertEqual(publish.serving(), {ID: {"id": ID, "version": "1.0.0"}})
        with mock.patch.object(publish, "PUBLISHED_DIR", ""):
            self.assertEqual(publish.serving(), {})


class SourcesSha256(unittest.TestCase):
    """`sources_sha256`: what a package is made from, by what git tracks —
    the store page's own files left out."""

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.crate = Path(self.tmp.name)
        git(self.crate, "init", "-q")
        for path, text in {
            "manifest.toml": "[extension]\n",
            "src/lib.rs": "fn main() {}\n",
            "STORE.md": "The page.\n",
            "shots/1.png": "picture",
            "shots/scenes/1.js": "scene",
            "cover.png": "picture",
        }.items():
            (self.crate / path).parent.mkdir(parents=True, exist_ok=True)
            (self.crate / path).write_text(text)
        git(self.crate, "add", "-A")
        self.ext = {"screenshots": ["shots/1.png", "cover.png"]}
        self.was = self.sha()

    def tearDown(self):
        self.tmp.cleanup()

    def sha(self):
        return publish.sources_sha256(ID, self.crate, self.ext)

    def change(self, path, text="changed"):
        (self.crate / path).parent.mkdir(parents=True, exist_ok=True)
        (self.crate / path).write_text(text)
        git(self.crate, "add", "-A")

    def test_the_store_page_changes_without_a_version(self):
        for path in ("STORE.md", "shots/1.png", "shots/scenes/1.js", "cover.png"):
            self.change(path)
        self.assertEqual(self.sha(), self.was)

    def test_the_source_does_not(self):
        self.change("src/lib.rs")
        self.assertNotEqual(self.sha(), self.was)

    def test_a_file_added_or_renamed_counts(self):
        self.change("src/more.rs", "fn more() {}\n")
        self.assertNotEqual(self.sha(), self.was)

    def test_a_build_leftover_git_does_not_track_does_not_count(self):
        (self.crate / "target").mkdir()
        (self.crate / "target" / "out.wasm").write_text("built")
        self.assertEqual(self.sha(), self.was)


class PublishCarries(unittest.TestCase):
    """`main`: a served version's package and signature are copied into the
    output, byte for byte, with nothing built, packed or signed."""

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name).resolve()
        self.served = self.root / "served"
        self.served.mkdir()
        crate = self.root / "ext" / ID
        crate.mkdir(parents=True)
        (crate / "manifest.toml").write_text(
            f'[extension]\nid = "{ID}"\nname = "Thing"\nversion = "1.0.0"\n'
            '[[command]]\nname = "open"\nlabel = "Open"\n'
        )
        (crate / "Cargo.toml").write_text('[package]\nname = "thing"\nversion = "1.0.0"\n')
        (crate / "CHANGELOG.md").write_text("# Changelog\n\n## [1.0.0] - 2026-10-07\n\n### Added\n\n- It.\n")
        (self.root / "extensions.toml").write_text(
            f'[[extension]]\nid = "{ID}"\npath = "ext/{ID}"\ncategory = "Utilities"\n'
        )
        git(self.root, "init", "-q")
        git(self.root, "add", "-A")
        for name, value in (
            ("ROOT", self.root),
            ("DIST", self.root / "dist"),
            ("BUILD", self.root / "build"),
            ("PUBLISHED_DIR", str(self.served)),
        ):
            patcher = mock.patch.object(publish, name, value)
            patcher.start()
            self.addCleanup(patcher.stop)
        self.sources = publish.sources_sha256(ID, crate, {})

    def tearDown(self):
        self.tmp.cleanup()

    def test_a_served_version_is_published_as_it_was(self):
        (self.served / NAME).write_bytes(b"the bytes it went out as")
        (self.served / f"{NAME}.sig").write_text("the signature made over them")
        (self.served / "index.json").write_text(
            json.dumps([{"id": ID, "version": "1.0.0", "sourcesSha256": self.sources}])
        )
        with mock.patch.object(publish, "sign") as sign, mock.patch.object(publish, "pack") as pack:
            # No build directory at all: a carried version asks nothing of it.
            publish.main(built=self.root / "nothing-built")
        sign.assert_not_called()
        pack.assert_not_called()
        dist = self.root / "dist"
        self.assertEqual((dist / NAME).read_bytes(), b"the bytes it went out as")
        self.assertEqual((dist / f"{NAME}.sig").read_text(), "the signature made over them")
        row = json.loads((dist / "index.json").read_text())[0]
        self.assertEqual(row["size"], len(b"the bytes it went out as"))
        self.assertEqual(row["sourcesSha256"], self.sources)


if __name__ == "__main__":
    unittest.main()
