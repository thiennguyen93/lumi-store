#!/usr/bin/env python3
"""One GitHub Discussion per listed extension — the thread Lumi's store
shows hearts from and sends people to for feedback.

  python3 scripts/discussions.py        # needs GH_TOKEN and GITHUB_REPOSITORY

For every entry in extensions.toml, find its discussion in the repo's
"Extensions" category — by the marker in the body, never by title, since a
title follows the manifest's name and names change — create it when there
is none, and bring the bot-written title and body up to date when the
manifest moved on. Prints one line for $GITHUB_OUTPUT:

  discussions={"<id>": {"number": 12, "url": "https://github.com/…"}}

which `publish.py` reads from the DISCUSSIONS environment variable and
writes into the index as each entry's `discussion`.

The hearts themselves are never baked into anything. GitHub has no event
for a reaction, so a count in the index is stale the moment it is written;
Lumi reads them live instead, one unauthenticated request for every
extension at once:

  GET https://api.github.com/repos/<repo>/discussions?per_page=100
  -> [{"number": 12, "reactions": {"heart": 6, …}, …}, …]

which GitHub caches for 60 seconds. The index only says which discussion
is whose.

Runs in its own job in publish.yml, the one job holding `discussions:
write` and nothing else — no key, no build. It reads manifests as files
(`publish.sources`) and runs no submission's code.

Standard library only, like publish.py.
"""

import json
import os
import sys
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import publish  # noqa: E402

CATEGORY = "extensions"
API = "https://api.github.com/graphql"


def marker(entry_id: str) -> str:
    """What ties a discussion to an extension. An HTML comment: invisible
    on the page, and not something a reply can forge, since only the
    discussion body is searched."""
    return f"<!-- lumi-extension: {entry_id} -->"


def title_of(ext: dict) -> str:
    return ext["name"]


def body_of(entry_id: str, ext: dict) -> str:
    description = ext.get("description", "").strip()
    lines = [f"**{ext['name']}**" + (f" — {description}" if description else "")]
    lines += [
        "",
        "❤️ this post to like the extension in Lumi's Extension Store. "
        "Replies are for feedback and questions.",
        "",
        f"[Install in Lumi](https://thiennguyen.dev/lumi-store/extensions/) · id `{entry_id}`",
        "",
        marker(entry_id),
    ]
    return "\n".join(lines) + "\n"


def owner_of(body: str, ids) -> "str | None":
    """Which listed id a discussion body belongs to, if any."""
    for entry_id in ids:
        if marker(entry_id) in body:
            return entry_id
    return None


def graphql(query: str, **variables) -> dict:
    token = os.environ.get("GH_TOKEN") or sys.exit("error: GH_TOKEN is not set")
    request = urllib.request.Request(
        API,
        data=json.dumps({"query": query, "variables": variables}).encode(),
        headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
    )
    with urllib.request.urlopen(request, timeout=30) as response:
        reply = json.load(response)
    if reply.get("errors"):
        sys.exit(f"error: GitHub answered {json.dumps(reply['errors'])}")
    return reply["data"]


def category_and_threads(owner: str, name: str):
    """The repository id, the Extensions category id, and every discussion
    already in that category."""
    data = graphql(
        """query($owner: String!, $name: String!) {
          repository(owner: $owner, name: $name) {
            id
            discussionCategories(first: 25) { nodes { id slug } }
          }
        }""",
        owner=owner, name=name,
    )["repository"]
    category = next((c["id"] for c in data["discussionCategories"]["nodes"] if c["slug"] == CATEGORY), None)
    if category is None:
        sys.exit(f'error: {owner}/{name} has no "{CATEGORY}" discussion category — README, Owner setup')
    threads, after = [], None
    while True:
        page = graphql(
            """query($owner: String!, $name: String!, $category: ID!, $after: String) {
              repository(owner: $owner, name: $name) {
                discussions(first: 100, after: $after, categoryId: $category) {
                  nodes { id number url title body }
                  pageInfo { hasNextPage endCursor }
                }
              }
            }""",
            owner=owner, name=name, category=category, after=after,
        )["repository"]["discussions"]
        threads += page["nodes"]
        if not page["pageInfo"]["hasNextPage"]:
            return data["id"], category, threads
        after = page["pageInfo"]["endCursor"]


def main():
    repo = os.environ.get("GITHUB_REPOSITORY") or sys.exit("error: GITHUB_REPOSITORY is not set")
    owner, name = repo.split("/", 1)
    listed = publish.listed_entries()
    ids = [e["id"] for e in listed]
    repo_id, category, threads = category_and_threads(owner, name)

    found = {}
    for thread in threads:
        entry_id = owner_of(thread["body"], ids)
        # The oldest wins: its hearts are the ones people already gave.
        if entry_id and (entry_id not in found or thread["number"] < found[entry_id]["number"]):
            found[entry_id] = thread

    out = {}
    for entry in listed:
        entry_id = entry["id"]
        _, _, _, ext, _ = publish.sources(entry)
        title, body = title_of(ext), body_of(entry_id, ext)
        thread = found.get(entry_id)
        if thread is None:
            thread = graphql(
                """mutation($repo: ID!, $category: ID!, $title: String!, $body: String!) {
                  createDiscussion(input: {repositoryId: $repo, categoryId: $category, title: $title, body: $body}) {
                    discussion { id number url }
                  }
                }""",
                repo=repo_id, category=category, title=title, body=body,
            )["createDiscussion"]["discussion"]
            print(f"{entry_id}: created discussion #{thread['number']}", file=sys.stderr)
        elif thread["title"] != title or thread["body"].strip() != body.strip():
            graphql(
                """mutation($id: ID!, $title: String!, $body: String!) {
                  updateDiscussion(input: {discussionId: $id, title: $title, body: $body}) {
                    discussion { id }
                  }
                }""",
                id=thread["id"], title=title, body=body,
            )
            print(f"{entry_id}: updated discussion #{thread['number']}", file=sys.stderr)
        out[entry_id] = {"number": thread["number"], "url": thread["url"]}

    print("discussions=" + json.dumps(out, separators=(",", ":")))


if __name__ == "__main__":
    main()
