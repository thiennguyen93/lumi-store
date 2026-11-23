"""`[[agent]] compact-thinking`: the store's mirror of Lumi's
`manifest::agents_of` for how hard summarizing a long chat thinks.

  python3 -m unittest discover -s scripts -p 'test_*.py'
"""

import sys
import tomllib
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import publish  # noqa: E402


def manifest(agent: str) -> dict:
    return tomllib.loads(f'[extension]\nid = "dev.you.thing"\n\n[[agent]]\nname = "helper"\nlabel = "Helper"\n{agent}\n')


def refusal(agent: str) -> str:
    with unittest.TestCase().assertRaises(SystemExit) as caught:
        publish.check_agents("dev.you.thing", manifest(agent))
    return str(caught.exception)


class CompactThinking(unittest.TestCase):
    def test_every_word_lumi_reads_is_taken(self):
        for word in ("off", "thread", "low", "medium", "high", ""):
            publish.check_agents("dev.you.thing", manifest(f'compact-thinking = "{word}"'))
        publish.check_agents("dev.you.thing", manifest('compact_thinking = "thread"'))
        publish.check_agents("dev.you.thing", manifest(""))

    def test_a_word_lumi_does_not_read_is_refused_in_its_words(self):
        self.assertIn('the agent helper compacts thinking "max"; compact-thinking is off, thread, low, medium or high', refusal('compact-thinking = "max"'))
        self.assertIn("compact-thinking is off", refusal("compact-thinking = true"))

    def test_both_spellings_are_refused(self):
        self.assertIn("twice", refusal('compact-thinking = "off"\ncompact_thinking = "low"'))


if __name__ == "__main__":
    unittest.main()
