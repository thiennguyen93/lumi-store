"""The marker that ties a discussion to an extension, and the index field.

  python3 -m unittest discover -s scripts -p 'test_*.py'
"""

import io
import json
import os
import sys
import unittest
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parent))
import discussions  # noqa: E402
import publish  # noqa: E402


class Marker(unittest.TestCase):
    def test_body_carries_its_own_marker(self):
        body = discussions.body_of("dev.you.thing", {"name": "Thing", "description": "Does it."})
        self.assertEqual(discussions.owner_of(body, ["dev.you.other", "dev.you.thing"]), "dev.you.thing")

    def test_an_id_that_prefixes_another_is_not_it(self):
        body = discussions.body_of("dev.you.thing2", {"name": "Thing 2"})
        self.assertIsNone(discussions.owner_of(body, ["dev.you.thing"]))

    def test_a_body_without_a_marker_is_nobodys(self):
        self.assertIsNone(discussions.owner_of("hello dev.you.thing", ["dev.you.thing"]))


class IndexField(unittest.TestCase):
    def test_listed_discussion(self):
        with mock.patch.dict(os.environ, {"DISCUSSIONS": '{"a.b": {"number": 3, "url": "https://x/3"}}'}):
            self.assertEqual(publish.discussion_of("a.b"), {"number": 3, "url": "https://x/3"})
            self.assertIsNone(publish.discussion_of("c.d"))

    def test_absent_or_empty_is_none(self):
        for value in (None, ""):
            env = {} if value is None else {"DISCUSSIONS": value}
            with self.subTest(value=value), mock.patch.dict(os.environ, env, clear=True):
                self.assertIsNone(publish.discussion_of("a.b"))


class Sync(unittest.TestCase):
    """`main` against a stand-in for GitHub, with a private entry whose
    source this run does not have — as in a run without its deploy key."""

    PUBLIC = "dev.thiennguyen.sample"
    PRIVATE = "dev.thiennguyen.screenshot"

    def run_main(self, threads, refuse=()):
        # The private entry made up here, so the test does not hang on what
        # extensions.toml lists today; its source is never read anyway.
        listed = [e for e in publish.listed_entries() if e["id"] == self.PUBLIC] + [
            {"id": self.PRIVATE, "path": f"ext/{self.PRIVATE}", "subdir": ".", "category": "Utilities", "private": True}
        ]
        calls = []

        def graphql(query, **variables):
            # The mutation's own name, after its variables' parenthesis.
            called = query.split("{", 2)[1].split("(")[0].strip()
            calls.append(called)
            if called in refuse:
                raise discussions.Refused('[{"type": "FORBIDDEN"}]')
            return {"createDiscussion": {"discussion": {"id": "D9", "number": 9, "url": "https://x/9"}}}

        out = io.StringIO()
        with mock.patch.dict(os.environ, {"GITHUB_REPOSITORY": "o/r"}), \
                mock.patch.object(publish, "listed_entries", return_value=listed), \
                mock.patch.object(publish, "fetched", return_value=False), \
                mock.patch.object(discussions, "category_and_threads", return_value=("R", "C", threads)), \
                mock.patch.object(discussions, "graphql", side_effect=graphql), \
                mock.patch("sys.stdout", out), mock.patch("sys.stderr", io.StringIO()):
            discussions.main()
        line = out.getvalue().strip()
        self.assertTrue(line.startswith("discussions="), line)
        return json.loads(line.split("=", 1)[1]), calls

    def public_thread(self):
        entry = next(e for e in publish.listed_entries() if e["id"] == self.PUBLIC)
        _, _, _, ext, _ = publish.sources(entry)
        return {"id": "D1", "number": 1, "url": "https://x/1",
                "title": discussions.title_of(ext), "body": discussions.body_of(self.PUBLIC, ext)}

    def test_a_private_entry_without_its_source_keeps_its_thread_and_costs_no_one_theirs(self):
        private = {"id": "D2", "number": 2, "url": "https://x/2", "title": "Screenshot",
                   "body": discussions.body_of(self.PRIVATE, {"name": "Screenshot"})}
        found, calls = self.run_main([self.public_thread(), private])
        self.assertEqual(found, {self.PUBLIC: {"number": 1, "url": "https://x/1"},
                                 self.PRIVATE: {"number": 2, "url": "https://x/2"}})
        self.assertEqual(calls, [], "nothing to create or update")

    def test_a_private_entry_without_its_source_or_a_thread_gets_none_yet(self):
        found, calls = self.run_main([self.public_thread()])
        self.assertEqual(found, {self.PUBLIC: {"number": 1, "url": "https://x/1"}})
        self.assertEqual(calls, [])

    def test_a_refused_update_keeps_the_thread_and_everyone_elses(self):
        stale = dict(self.public_thread(), title="An older name")
        found, calls = self.run_main([stale], refuse={"updateDiscussion"})
        self.assertEqual(found, {self.PUBLIC: {"number": 1, "url": "https://x/1"}})
        self.assertEqual(calls, ["updateDiscussion"])

    def test_a_refused_create_leaves_only_that_entry_without_one(self):
        private = {"id": "D2", "number": 2, "url": "https://x/2", "title": "Screenshot",
                   "body": discussions.body_of(self.PRIVATE, {"name": "Screenshot"})}
        found, calls = self.run_main([private], refuse={"createDiscussion"})
        self.assertEqual(found, {self.PRIVATE: {"number": 2, "url": "https://x/2"}})
        self.assertEqual(calls, ["createDiscussion"])


if __name__ == "__main__":
    unittest.main()
