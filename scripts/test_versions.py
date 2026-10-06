"""`versions_of`: Cargo.toml, Cargo.lock and web/package.json name the
version the manifest ships, or the entry is refused with each that does not.

  python3 -m unittest discover -s scripts -p 'test_*.py'
"""

import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parent))
import publish  # noqa: E402

ID = "dev.you.thing"


def lock(*rows):
    return "version = 4\n" + "".join(
        f'\n[[package]]\nname = "{name}"\nversion = "{version}"\n' + (f'source = "{source}"\n' if source else "")
        for name, version, source in rows
    )


class Versions(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name).resolve()
        self.top = self.root / "ext" / ID
        self.top.mkdir(parents=True)
        patcher = mock.patch.object(publish, "ROOT", self.root)
        patcher.start()
        self.addCleanup(patcher.stop)

    def tearDown(self):
        self.tmp.cleanup()

    def crate(self, version_line='version = "1.2.0"', subdir="."):
        crate = (self.top / subdir).resolve()
        crate.mkdir(parents=True, exist_ok=True)
        (crate / "Cargo.toml").write_text(f'[package]\nname = "thing"\n{version_line}\nedition = "2021"\n')
        return crate

    def entry(self, subdir=".", web=None):
        entry = {"id": ID, "path": f"ext/{ID}", "subdir": subdir}
        if web:
            entry["web"] = web
        return entry

    def refusal(self, entry, crate, version="1.2.0"):
        with self.assertRaises(SystemExit) as refused:
            publish.versions_of(ID, entry, crate, version)
        return str(refused.exception)

    def test_one_number_everywhere_passes(self):
        crate = self.crate()
        (crate / "Cargo.lock").write_text(lock(("thing", "1.2.0", None), ("serde", "1.0.0", "registry+x")))
        (crate / "web").mkdir()
        (crate / "web" / "package.json").write_text(json.dumps({"version": "1.2.0"}))
        publish.versions_of(ID, self.entry(web="web"), crate, "1.2.0")

    def test_a_cargo_version_behind_the_manifest_is_refused(self):
        said = self.refusal(self.entry(), self.crate('version = "0.1.0"'))
        self.assertIn("the manifest ships 1.2.0, but Cargo.toml says 0.1.0", said)

    def test_a_crate_with_no_version_is_told_what_to_write(self):
        said = self.refusal(self.entry(), self.crate(""))
        self.assertIn('Cargo.toml gives the crate no version; write version = "1.2.0"', said)

    def test_a_stale_lock_is_refused_with_the_command_that_fixes_it(self):
        crate = self.crate()
        (crate / "Cargo.lock").write_text(lock(("thing", "1.1.0", None)))
        said = self.refusal(self.entry(), crate)
        self.assertIn("Cargo.lock has thing at 1.1.0", said)
        self.assertIn("cargo update -p thing --offline", said)

    def test_a_registry_crate_of_the_same_name_is_not_the_extensions(self):
        crate = self.crate()
        (crate / "Cargo.lock").write_text(lock(("thing", "9.9.9", "registry+x"), ("thing", "1.2.0", None)))
        publish.versions_of(ID, self.entry(), crate, "1.2.0")

    def test_a_version_inherited_from_the_workspace_is_read_there(self):
        (self.top / "Cargo.toml").write_text('[workspace]\nmembers = ["ext"]\n\n[workspace.package]\nversion = "1.1.0"\n')
        crate = self.crate("version.workspace = true", subdir="ext")
        (self.top / "Cargo.lock").write_text(lock(("thing", "1.1.0", None)))
        said = self.refusal(self.entry(subdir="ext"), crate)
        self.assertIn("Cargo.toml says 1.1.0", said)
        self.assertIn("Cargo.lock has thing at 1.1.0", said, "the workspace's lock, not one beside the crate")

    def test_no_workspace_is_looked_for_past_the_entrys_checkout(self):
        (self.root / "ext" / "Cargo.toml").write_text('[workspace]\n\n[workspace.package]\nversion = "1.2.0"\n')
        said = self.refusal(self.entry(), self.crate("version.workspace = true"))
        self.assertIn("Cargo.toml gives the crate no version", said)

    def test_the_built_front_end_names_the_same_version(self):
        crate = self.crate()
        (crate / "web").mkdir()
        (crate / "web" / "package.json").write_text(json.dumps({"version": "0.6.3"}))
        self.assertIn("web/package.json says 0.6.3", self.refusal(self.entry(web="web"), crate))
        (crate / "web" / "package.json").write_text(json.dumps({"private": True}))
        self.assertIn('web/package.json gives no version; write "version": "1.2.0"', self.refusal(self.entry(web="web"), crate))

    def test_a_package_json_the_store_does_not_build_is_not_read(self):
        crate = self.crate()
        (crate / "tools").mkdir()
        (crate / "tools" / "package.json").write_text(json.dumps({"version": "0.0.1"}))
        publish.versions_of(ID, self.entry(), crate, "1.2.0")

    def test_every_place_out_of_step_is_named_at_once(self):
        crate = self.crate('version = "1.1.0"')
        (crate / "Cargo.lock").write_text(lock(("thing", "1.1.0", None)))
        (crate / "web").mkdir()
        (crate / "web" / "package.json").write_text(json.dumps({"version": "1.0.0"}))
        said = self.refusal(self.entry(web="web"), crate)
        for part in ("Cargo.toml says 1.1.0", "Cargo.lock has thing at 1.1.0", "web/package.json says 1.0.0"):
            self.assertIn(part, said)


if __name__ == "__main__":
    unittest.main()
