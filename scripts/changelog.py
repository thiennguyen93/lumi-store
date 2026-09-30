#!/usr/bin/env python3
"""Start the CHANGELOG.md section for the version an extension is about to
ship, from its commits.

  python3 scripts/changelog.py draft ID

Reads the entry's manifest `version`, and the commits that touched its
directory since CHANGELOG.md last changed, and puts a section for that
version on top of CHANGELOG.md (below `# Changelog` and any Unreleased
section) — grouped from Conventional Commit subjects:

  feat -> Added   fix -> Fixed   perf -> Improved   type! / BREAKING -> Changed

and nothing from chore, refactor, style, docs, test, ci or build, which
change nothing a person using the extension sees. It is a draft: commit
subjects are written for developers, so reword each line for the person
reading "What's new" before opening the PR. `publish.py --check` then
holds the section to the manifest's version.

Refuses when CHANGELOG.md already opens with the manifest's version:
that section is written, edit it by hand.
"""

import datetime
import re
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import publish  # noqa: E402

GROUPS = [("Added", {"feat"}), ("Fixed", {"fix"}), ("Improved", {"perf"})]
SKIPPED = {"chore", "refactor", "style", "docs", "test", "ci", "build", "revert"}
SUBJECT_RE = re.compile(r"^(?P<type>[a-z]+)(?:\([^)]*\))?(?P<breaking>!)?:\s*(?P<text>.+)$")


def sentence(text: str) -> str:
    text = text.strip().rstrip(".")
    return text[:1].upper() + text[1:] + "."


def group(commits: list) -> list:
    """`[(subject, body)]`, oldest first, as `[(heading, [line])]` in the
    order a reader wants them. A subject that is not a Conventional Commit
    is kept under Changed rather than lost — the author decides."""
    grouped = {"Changed": []}
    for heading, _ in GROUPS:
        grouped[heading] = []
    for subject, body in commits:
        match = SUBJECT_RE.match(subject.strip())
        if not match:
            grouped["Changed"].append(sentence(subject))
            continue
        kind = match["type"]
        if match["breaking"] or "BREAKING CHANGE" in body:
            grouped["Changed"].append(sentence(match["text"]))
        elif kind in SKIPPED:
            continue
        else:
            heading = next((h for h, kinds in GROUPS if kind in kinds), "Changed")
            grouped[heading].append(sentence(match["text"]))
    order = ["Added", "Changed", "Improved", "Fixed"]
    return [(heading, grouped[heading]) for heading in order if grouped[heading]]


def section(version: str, date: str, groups: list) -> str:
    lines = [f"## [{version}] - {date}", ""]
    if not groups:
        lines += ["- (describe what changed for people using the extension)", ""]
    for heading, items in groups:
        lines += [f"### {heading}", "", *[f"- {item}" for item in items], ""]
    return "\n".join(lines)


def insert(text: str, new: str) -> str:
    """`new` placed where the newest release goes: above the first version
    heading, so a title, a preface and an Unreleased section stay on top."""
    lines = text.split("\n")
    for n, line in enumerate(lines):
        if line.startswith("## ") and not publish.UNRELEASED_HEADING_RE.match(line):
            return "\n".join(lines[:n] + new.split("\n") + lines[n:])
    body = text.rstrip("\n")
    return (body + "\n\n" if body else "# Changelog\n\n") + new


def git(*args, cwd: Path) -> str:
    return subprocess.run(["git", *args], cwd=cwd, capture_output=True, text=True, check=True).stdout


def commits_since_changelog(crate: Path) -> list:
    """`[(subject, body)]`, oldest first: what touched the crate since the
    last commit that changed its CHANGELOG.md (all of its history when
    none has)."""
    last = git("log", "-1", "--format=%H", "--", "CHANGELOG.md", cwd=crate).strip()
    span = [f"{last}..HEAD"] if last else ["HEAD"]
    raw = git("log", "--reverse", "--format=%s%x1f%b%x1e", *span, "--", ".", cwd=crate)
    commits = []
    for record in raw.split("\x1e"):
        if "\x1f" in record:
            subject, body = record.strip("\n").split("\x1f", 1)
            commits.append((subject, body))
    return commits


def draft(entry_id: str):
    entry = next((e for e in publish.listed_entries() if e["id"] == entry_id), None)
    if entry is None:
        sys.exit(f"error: {entry_id} is not listed in extensions.toml")
    crate, _, _, ext, _ = publish.sources(entry)
    version = ext["version"]
    path = crate / "CHANGELOG.md"
    text = path.read_text(encoding="utf-8") if path.exists() else ""
    if text:
        try:
            newest = publish.parse_changelog(text)[0]["version"]
        except ValueError:
            newest = None
        if newest == version:
            sys.exit(f"error: CHANGELOG.md already opens with {version}; edit that section by hand, "
                     "or bump the manifest's version first")
    groups = group(commits_since_changelog(crate))
    path.write_text(insert(text, section(version, datetime.date.today().isoformat(), groups)), encoding="utf-8")
    count = sum(len(items) for _, items in groups)
    print(f"{path.relative_to(publish.ROOT)}: drafted {version} from {count} commit(s) — reword it for people using the extension")


USAGE = "usage: changelog.py draft ID"

if __name__ == "__main__":
    args = sys.argv[1:]
    if len(args) == 2 and args[0] == "draft":
        draft(args[1])
    else:
        sys.exit(USAGE)
