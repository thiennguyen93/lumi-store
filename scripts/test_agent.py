"""`[[agent]]`: the store's mirror of Lumi's `manifest::agents_of`, and the
floor a component importing the agent needs.

  python3 -m unittest discover -s scripts -p 'test_*.py'
"""

import sys
import tomllib
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import publish  # noqa: E402


HEAD = '[extension]\nid = "dev.you.thing"\ncapabilities = ["ai"]\nmin-lumi-version = "1.98.0"\n'


def manifest(agent: str, head: str = HEAD) -> dict:
    return tomllib.loads(f'{head}\n[[agent]]\nname = "helper"\nlabel = "Helper"\n{agent}\n')


def refusal(agent: str, head: str = HEAD) -> str:
    with unittest.TestCase().assertRaises(SystemExit) as caught:
        publish.check_agents("dev.you.thing", manifest(agent, head))
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


class Agents(unittest.TestCase):
    def test_a_whole_agent_is_taken(self):
        publish.check_agents("dev.you.thing", manifest('description = "Answers from the meeting."\ninstructions = "agents/helper.md"\nthinking = "low"\nmax-tokens = 2048\nreading = "whole"\ngrounding = "sources-and-knowledge"\nlibraries = ["lumi", "meetings"]'))
        publish.check_agents("dev.you.thing", tomllib.loads('[extension]\nid = "dev.you.thing"\n'))

    def test_the_capability_and_the_floor_are_asked(self):
        self.assertIn("needs the ai capability", refusal("", '[extension]\nid = "dev.you.thing"\nmin-lumi-version = "1.98.0"\n'))
        self.assertIn("set min-lumi-version to 1.98.0", refusal("", '[extension]\nid = "dev.you.thing"\ncapabilities = ["ai"]\nmin-lumi-version = "1.97.0"\n'))
        self.assertIn("set min-lumi-version to 1.98.0", refusal("", '[extension]\nid = "dev.you.thing"\ncapabilities = ["ai"]\n'))

    def test_each_word_is_refused_in_lumis_sentence(self):
        self.assertIn("the agent helper thinks \"max\"; an agent's thinking is off, low, medium or high", refusal('thinking = "max"'))
        self.assertIn("an agent's reading is fit or whole", refusal('reading = "all"'))
        self.assertIn("it is sources or sources-and-knowledge", refusal('grounding = "web"'))
        self.assertIn("max-tokens is 8; it is 16 to 32768", refusal("max-tokens = 8"))
        self.assertIn("declares tools", refusal('tools = ["add-reminder"]'))
        self.assertIn("not a plain relative path into ui/", refusal('instructions = "../secret.md"'))
        self.assertIn("one line of at most 200 characters", refusal(f'description = "{"x" * 201}"'))

    def test_names_and_libraries(self):
        self.assertIn("only letters, digits", self._bad_name())
        self.assertIn("which this version of Lumi does not have", refusal('libraries = ["mine"]'))
        self.assertIn("names the library notes twice", refusal('libraries = ["notes", "notes"]'))
        self.assertIn("only lowercase letters", refusal('libraries = ["Notes"]'))
        self.assertIn("at most 8", refusal(f"libraries = {[f'l{k}' for k in range(9)]!r}".replace("'", '"')))
        self.assertIn("has no label", self._no_label())
        two = tomllib.loads(f'{HEAD}\n[[agent]]\nname = "a"\nlabel = "A"\n\n[[agent]]\nname = "a"\nlabel = "B"\n')
        with self.assertRaises(SystemExit) as caught:
            publish.check_agents("dev.you.thing", two)
        self.assertIn("two agents are named a", str(caught.exception))
        five = tomllib.loads(HEAD + "".join(f'\n[[agent]]\nname = "a{k}"\nlabel = "A"\n' for k in range(5)))
        with self.assertRaises(SystemExit) as caught:
            publish.check_agents("dev.you.thing", five)
        self.assertIn("declares 5 agents; at most 4", str(caught.exception))

    def _bad_name(self) -> str:
        with self.assertRaises(SystemExit) as caught:
            publish.check_agents("dev.you.thing", tomllib.loads(f'{HEAD}\n[[agent]]\nname = "my agent"\nlabel = "A"\n'))
        return str(caught.exception)

    def _no_label(self) -> str:
        with self.assertRaises(SystemExit) as caught:
            publish.check_agents("dev.you.thing", tomllib.loads(f'{HEAD}\n[[agent]]\nname = "a"\nlabel = "  "\n'))
        return str(caught.exception)


if __name__ == "__main__":
    unittest.main()
