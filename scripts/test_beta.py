"""`beta = true` on an entry: the store's word that an extension is still
being finished, carried into the index for the tag Lumi draws — and the
version staying plain, since Lumi offers no update past a pre-release.

  python3 -m unittest discover -s scripts -p 'test_*.py'
"""

import json
import subprocess
import sys
import tempfile
import tomllib
import unittest
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parent))
import publish  # noqa: E402

ID = "dev.you.thing"
NAME = f"{ID}-1.0.0.tar.gz"
MANIFEST = '[extension]\nid = "{id}"\nname = "Thing"\nversion = "{version}"\n[[command]]\nname = "open"\nlabel = "Open"\n'


def git(cwd: Path, *args: str):
    subprocess.run(
        ["git", "-c", "user.name=t", "-c", "user.email=t@t", *args],
        cwd=cwd,
        check=True,
        capture_output=True,
    )


class Version(unittest.TestCase):
    """`check_manifest`: three numbers, because Lumi's update check reads
    nothing else (`manifest::parse_triplet`)."""

    def check(self, version: str):
        publish.check_manifest(ID, tomllib.loads(MANIFEST.format(id=ID, version=version)))

    def test_a_release_version_is_taken(self):
        self.check("1.2.0")
        self.check("0.1.0")

    def test_a_pre_release_is_refused_with_the_way_to_a_beta(self):
        for version in ("1.2.0-beta.1", "0.1.0-rc.1", "1.2", "01.2.0"):
            with self.subTest(version=version), self.assertRaises(SystemExit) as refused:
                self.check(version)
            self.assertIn("beta = true in extensions.toml", str(refused.exception))


class IndexRow(unittest.TestCase):
    """`main`: the entry's `beta` reaches its row in the index, as its
    `featured` does — published here as a served version, carried, so
    nothing is built."""

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name).resolve()
        self.served = self.root / "served"
        self.served.mkdir()
        crate = self.root / "ext" / ID
        crate.mkdir(parents=True)
        (crate / "manifest.toml").write_text(MANIFEST.format(id=ID, version="1.0.0"))
        (crate / "Cargo.toml").write_text('[package]\nname = "thing"\nversion = "1.0.0"\n')
        (crate / "CHANGELOG.md").write_text("# Changelog\n\n## [1.0.0] - 2026-11-16\n\n### Added\n\n- It.\n")
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
        (self.served / NAME).write_bytes(b"the package")
        (self.served / f"{NAME}.sig").write_text("its signature")
        sources = publish.sources_sha256(ID, crate, {})
        (self.served / "index.json").write_text(json.dumps([{"id": ID, "version": "1.0.0", "sourcesSha256": sources}]))

    def tearDown(self):
        self.tmp.cleanup()

    def row(self, line: str = "") -> dict:
        (self.root / "extensions.toml").write_text(
            f'[[extension]]\nid = "{ID}"\npath = "ext/{ID}"\ncategory = "Utilities"\n{line}'
        )
        with mock.patch.object(publish, "sign"), mock.patch.object(publish, "pack"):
            publish.main(built=self.root / "nothing-built")
        return json.loads((self.root / "dist" / "index.json").read_text())[0]

    def test_beta_reaches_the_index(self):
        self.assertIs(self.row("beta = true\n")["beta"], True)

    def test_an_entry_without_it_is_not_a_beta(self):
        self.assertIs(self.row()["beta"], False)

    def test_beta_must_be_a_bool(self):
        with self.assertRaises(SystemExit) as refused:
            self.row('beta = "yes"\n')
        self.assertIn("beta is true or false", str(refused.exception))


if __name__ == "__main__":
    unittest.main()
