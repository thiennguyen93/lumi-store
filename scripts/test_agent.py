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


SLASH_HEAD = '[extension]\nid = "dev.you.thing"\ncapabilities = ["ai"]\nmin-lumi-version = "1.100.0"\n'


def command(body: str) -> str:
    return f"[[agent.slash-command]]\n{body}\n"


class SlashCommands(unittest.TestCase):
    """`[[agent.slash-command]]`, as Lumi 1.100.0's `slash_commands_of` reads it."""

    def test_a_prompt_and_a_handled_command_are_taken(self):
        publish.check_agents(
            "dev.you.thing",
            manifest(command('name = "email"\ndescription = "Draft a follow-up email"\nargument-hint = "[to whom]"\nprompt = "commands/email.md"') + command('name = "missed"\ndescription = "What did I miss?"\nhandled = true'), SLASH_HEAD),
        )
        publish.check_agents("dev.you.thing", manifest(command('name = "ask"\ndescription = "D"\nargument-hint = "a question"\narguments = "required"\nhandled = true'), SLASH_HEAD))

    def test_the_floor_is_lumi_1_100_0(self):
        self.assertIn("set min-lumi-version to 1.100.0", refusal(command('name = "missed"\ndescription = "D"\nhandled = true')))

    def test_each_rule_is_refused_in_lumis_sentence(self):
        bad = lambda body: refusal(command(body), SLASH_HEAD)  # noqa: E731
        self.assertIn("is one of Lumi's own", bad('name = "compact"\ndescription = "D"\nhandled = true'))
        self.assertIn("begins with a lowercase letter", bad('name = "Email"\ndescription = "D"\nhandled = true'))
        self.assertIn("begins with a lowercase letter", bad('name = "lumi:x"\ndescription = "D"\nhandled = true'))
        self.assertIn("has no description", bad('name = "email"\nhandled = true'))
        self.assertIn("needs a prompt file", bad('name = "email"\ndescription = "D"'))
        self.assertIn("one or the other", bad('name = "email"\ndescription = "D"\nprompt = "e.md"\nhandled = true'))
        self.assertIn("not a plain relative path into ui/", bad('name = "email"\ndescription = "D"\nprompt = "../e.md"'))
        self.assertIn("one line of at most 100 characters", bad(f'name = "email"\ndescription = "{"x" * 101}"\nhandled = true'))
        self.assertIn("argument-hint is one line of at most 40", bad(f'name = "email"\ndescription = "D"\nargument-hint = "{"x" * 41}"\nhandled = true'))
        self.assertIn("needs an argument-hint", bad('name = "ask"\ndescription = "D"\narguments = "required"\nhandled = true'))
        self.assertIn("has no argument-hint", bad('name = "ask"\ndescription = "D"\nargument-hint = "[x]"\narguments = "none"\nhandled = true'))
        self.assertIn("none, optional or required", bad('name = "ask"\ndescription = "D"\narguments = "maybe"\nhandled = true'))
        self.assertIn("two slash commands named /email", refusal(command('name = "email"\ndescription = "D"\nhandled = true') * 2, SLASH_HEAD))
        many = "".join(command(f'name = "c{k}"\ndescription = "D"\nhandled = true') for k in range(33))
        self.assertIn("at most 32", refusal(many, SLASH_HEAD))
