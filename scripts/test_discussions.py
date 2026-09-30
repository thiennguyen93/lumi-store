"""The marker that ties a discussion to an extension, and the index field.

  python3 -m unittest discover -s scripts -p 'test_*.py'
"""

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


if __name__ == "__main__":
    unittest.main()
