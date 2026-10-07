"""`follow = true` entries and `follow.py`: what is found, what is proposed,
and who may be followed at all.

  python3 -m unittest discover -s scripts -p 'test_*.py'
"""

import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parent))
import follow  # noqa: E402
import publish  # noqa: E402

CHANGELOG = """# Changelog

## [0.3.0] - 2026-10-08

### Added

- Three.

## [0.2.0] - 2026-10-07

### Fixed

- Two.

## [0.1.0] - 2026-10-06

### Added

- One.
"""

ENTRY = {"id": "dev.you.closed", "path": "ext/dev.you.closed"}


def source(version: str, pinned_version: str, sha: str = "b" * 40) -> dict:
    return {
        "sha": sha,
        "version": version,
        "name": "Closed",
        "changelog": CHANGELOG,
        "pinned_version": pinned_version,
        "pinned_sha": "a" * 40,
    }


class Decide(unittest.TestCase):
    def test_a_newer_version_on_main_is_found_with_its_notes(self):
        one = follow.decide(ENTRY, source("0.3.0", "0.1.0"), None)
        self.assertEqual((one["version"], one["pinned_version"], one["sha"]), ("0.3.0", "0.1.0", "b" * 40))
        self.assertIn("### 0.3.0", one["notes"])
        self.assertIn("### 0.2.0", one["notes"])
        self.assertNotIn("### 0.1.0", one["notes"], "the pinned version's own notes are already out")
        self.assertIn("#### Added", one["notes"], "a section's headings sit under its version's")

    def test_the_same_version_or_an_older_one_is_not(self):
        # Commits on main without a version bump publish nothing: the store
        # ships versions, and a bump is what the CHANGELOG is held to.
        self.assertIsNone(follow.decide(ENTRY, source("0.1.0", "0.1.0"), None))
        self.assertIsNone(follow.decide(ENTRY, source("0.1.0", "0.2.0"), None))

    def test_a_commit_already_proposed_is_not_proposed_again(self):
        self.assertIsNone(follow.decide(ENTRY, source("0.3.0", "0.1.0"), "b" * 40))
        self.assertIsNotNone(follow.decide(ENTRY, source("0.3.0", "0.1.0"), "c" * 40), "a newer commit replaces it")

    def test_a_version_that_is_not_one_stops_the_look(self):
        with self.assertRaises(ValueError):
            follow.decide(ENTRY, source("next", "0.1.0"), None)


class Words(unittest.TestCase):
    def test_the_deploy_key_is_fetch_privates(self):
        self.assertEqual(follow.key_name("dev.thiennguyen.sticky"), "STICKY_DEPLOY_KEY")
        self.assertEqual(follow.key_name("dev.you.clip-board"), "CLIP_BOARD_DEPLOY_KEY")

    def test_the_pull_request_says_what_and_where(self):
        one = follow.decide(ENTRY, source("0.3.0", "0.1.0"), None)
        body = follow.body_of(one, "git@github.com:you/closed.git", "https://example.test/run/1")
        self.assertIn("from 0.1.0 to 0.3.0", body)
        self.assertIn("https://github.com/you/closed/compare/aaaaaaaaaaaa...bbbbbbbbbbbb", body)
        self.assertIn("https://example.test/run/1", body)
        self.assertIn("- Three.", body)
        self.assertEqual(follow.title_of(one), "feat(store): Closed 0.3.0")


class OnlyFirstParty(unittest.TestCase):
    """`follow = true` moves a pin nobody reviewed: never a third party's."""

    def listed(self, fields: str):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "extensions.toml").write_text(
                f'[[extension]]\nid = "dev.you.closed"\npath = "ext/dev.you.closed"\ncategory = "Utilities"\n{fields}\n'
            )
            with mock.patch.object(publish, "ROOT", root):
                return publish.listed_entries()

    def test_a_private_entry_may_be_followed(self):
        self.assertTrue(self.listed("private = true\nfollow = true")[0]["follow"])

    def test_any_other_is_refused(self):
        with self.assertRaises(SystemExit):
            self.listed("follow = true")
        with self.assertRaises(SystemExit):
            self.listed("private = true\nfollow = \"yes\"")


class ReadSource(unittest.TestCase):
    """The look itself, against a repository on disk in place of GitHub."""

    def test_main_and_the_pin_are_read_from_their_own_commits(self):
        with tempfile.TemporaryDirectory() as tmp:
            repo = Path(tmp, "closed")
            run = lambda *args: subprocess.run(["git", *args], cwd=repo, check=True, capture_output=True, text=True).stdout.strip()  # noqa: E731
            repo.mkdir()
            run("init", "-q", "-b", "main")
            run("config", "user.name", "t")
            run("config", "user.email", "t@example.test")
            # GitHub serves a commit reachable from a branch by its id.
            run("config", "uploadpack.allowReachableSHA1InWant", "true")
            for version in ("0.1.0", "0.3.0"):
                (repo / "manifest.toml").write_text(f'[extension]\nid = "dev.you.closed"\nname = "Closed"\nversion = "{version}"\n')
                (repo / "CHANGELOG.md").write_text(CHANGELOG)
                run("add", ".")
                run("commit", "-q", "-m", version)
                if version == "0.1.0":
                    pinned = run("rev-parse", "HEAD")
            head = run("rev-parse", "HEAD")
            read = follow.read_source(repo.as_uri(), None, ".", pinned)
        self.assertEqual((read["sha"], read["version"], read["pinned_version"], read["name"]), (head, "0.3.0", "0.1.0", "Closed"))


if __name__ == "__main__":
    unittest.main()
