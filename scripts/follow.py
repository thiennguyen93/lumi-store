#!/usr/bin/env python3
"""Moving a followed first-party entry's pin forward when its source has a
newer version — `.github/workflows/follow.yml`'s three steps.

  python3 scripts/follow.py look      → `found=[…]` for $GITHUB_OUTPUT
  FOUND='[…]' python3 scripts/follow.py pin
  FOUND='[…]' GH_TOKEN=… RUN=<url> python3 scripts/follow.py propose

An entry is followed when it says `follow = true` in extensions.toml, which
only a `private = true` one may: the store owner's own extensions, whose
`main` the owner alone pushes to. A third-party entry is never followed —
its pin moves only in a pull request somebody reviewed, which is the whole
of what the store's signature vouches for.

**look** reads each followed entry's source with its read-only deploy key
(`<NAME>_DEPLOY_KEY`, `fetch-private.sh`'s naming): the version its `main`
ships and the one the store pins, from each commit's manifest. A newer one
on `main`, not already proposed on `follow/<id>`, is found — with the
CHANGELOG sections between the two, for the pull request to say. Nothing
is built and nothing written.

**pin** puts the found commits in the index, so `fetch-private.sh` checks
those out and `publish.py --check` builds and packs exactly what would be
proposed — the `check` job, which holds no token that writes.

**propose** commits each pin on `follow/<id>` and opens the pull request
for it, or brings the open one up to date. It builds nothing and holds no
deploy key. Merging it is publishing it, as merging any pin is.
"""

import json
import os
import subprocess
import sys
import tempfile
import tomllib
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import publish  # noqa: E402

ROOT = publish.ROOT

# GitHub's published ed25519 host key, pinned as fetch-private.sh pins it.
GITHUB_HOST_KEY = "github.com ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIOMqqnkVzrm0SdG6UOoqKLsabgH5C9okWi0dh2l9GKJl"

BOT = ("github-actions[bot]", "41898282+github-actions[bot]@users.noreply.github.com")


def key_name(entry_id: str) -> str:
    """`fetch-private.sh`'s secret name: the id's last part, upper case."""
    return entry_id.rsplit(".", 1)[-1].upper().replace("-", "_") + "_DEPLOY_KEY"


def followed() -> list:
    return [entry for entry in publish.listed_entries() if entry.get("follow")]


def git(*args: str, cwd: Path = ROOT, env: "dict | None" = None) -> str:
    return subprocess.run(
        ["git", *args], cwd=cwd, env=env, check=True, capture_output=True, text=True
    ).stdout.strip()


def pinned(path: str) -> str:
    """The commit the store pins `path` to."""
    return git("ls-tree", "HEAD", path).split()[2]


def source_url(path: str) -> str:
    return git("config", "-f", ".gitmodules", "--get", f"submodule.{path}.url")


def in_source(subdir: str, name: str) -> str:
    return name if subdir in ("", ".") else f"{subdir.rstrip('/')}/{name}"


def read_source(url: str, ssh: "str | None", subdir: str, pinned_sha: str) -> dict:
    """From the source at `url`: its `main`'s commit, version, name and
    changelog, and the pinned commit's version. `ssh` is the deploy key, or
    `None` for a source git reaches without one (a test's local repo)."""
    with tempfile.TemporaryDirectory() as tmp:
        env = dict(os.environ)
        if ssh is not None:
            key, hosts = Path(tmp, "key"), Path(tmp, "known_hosts")
            key.write_text(ssh.strip() + "\n")
            key.chmod(0o600)
            hosts.write_text(GITHUB_HOST_KEY + "\n")
            env["GIT_SSH_COMMAND"] = (
                f"ssh -i {key} -o IdentitiesOnly=yes -o UserKnownHostsFile={hosts} -o StrictHostKeyChecking=yes"
            )
        repo = Path(tmp, "source")
        git("init", "-q", "--bare", str(repo), env=env)
        git("fetch", "-q", "--depth", "1", url, "main", cwd=repo, env=env)
        main_sha = git("rev-parse", "FETCH_HEAD", cwd=repo, env=env)
        manifest = tomllib.loads(git("show", f"FETCH_HEAD:{in_source(subdir, 'manifest.toml')}", cwd=repo, env=env))
        changelog = git("show", f"FETCH_HEAD:{in_source(subdir, 'CHANGELOG.md')}", cwd=repo, env=env)
        git("fetch", "-q", "--depth", "1", url, pinned_sha, cwd=repo, env=env)
        was = tomllib.loads(git("show", f"{pinned_sha}:{in_source(subdir, 'manifest.toml')}", cwd=repo, env=env))
    ext = manifest.get("extension", {})
    return {
        "sha": main_sha,
        "version": ext.get("version", ""),
        "name": ext.get("name", ""),
        "changelog": changelog,
        "pinned_version": was.get("extension", {}).get("version", ""),
    }


def proposed(entry_id: str, path: str) -> "str | None":
    """The commit `follow/<id>` already proposes for `path`, if the branch
    is there."""
    branch = f"follow/{entry_id}"
    if not git("ls-remote", "--heads", "origin", branch):
        return None
    git("fetch", "-q", "--depth", "1", "origin", branch)
    return git("ls-tree", "FETCH_HEAD", path).split()[2]


def notes_between(changelog: str, pinned_version: str, version: str) -> str:
    """The CHANGELOG sections newer than `pinned_version`, up to `version`,
    newest first, each under its heading. Pure, for the test."""
    out = []
    for release in publish.parse_changelog(changelog):
        key = publish.semver_key(release["version"])
        if publish.semver_key(pinned_version) < key <= publish.semver_key(version):
            # A section's own headings one level under its version's.
            notes = "\n".join("#" + line if line.startswith("#") else line for line in release["notes"].split("\n"))
            out.append(f"### {release['version']}\n\n{notes}")
    return "\n\n".join(out)


def decide(entry: dict, source: dict, already: "str | None") -> "dict | None":
    """A followed entry found to propose, or `None`: its `main` ships a
    version newer than the pin's, and `follow/<id>` does not already
    propose that commit. Pure, for the test."""
    for version in (source["version"], source["pinned_version"]):
        if not publish.SEMVER_RE.match(version):
            raise ValueError(f"{entry['id']}: {version!r} is not a version like 1.2.0")
    if publish.semver_key(source["version"]) <= publish.semver_key(source["pinned_version"]):
        return None
    if already == source["sha"]:
        return None
    return {
        "id": entry["id"],
        "path": entry["path"],
        "name": source["name"],
        "sha": source["sha"],
        "version": source["version"],
        "pinned_sha": source["pinned_sha"],
        "pinned_version": source["pinned_version"],
        "notes": notes_between(source["changelog"], source["pinned_version"], source["version"]),
    }


def look():
    found = []
    for entry in followed():
        name = key_name(entry["id"])
        key = os.environ.get(name, "")
        if not key:
            print(f"no ${name}: {entry['id']} not looked at", file=sys.stderr)
            continue
        pin = pinned(entry["path"])
        source = read_source(source_url(entry["path"]), key, entry.get("subdir", "."), pin)
        source["pinned_sha"] = pin
        one = decide(entry, source, proposed(entry["id"], entry["path"]))
        if one:
            print(f"{entry['id']}: {one['pinned_version']} → {one['version']} ({one['sha'][:7]})", file=sys.stderr)
            found.append(one)
        else:
            print(f"{entry['id']}: nothing newer than {source['pinned_version']} to propose", file=sys.stderr)
    print("found=" + json.dumps(found, ensure_ascii=False))


def from_env() -> list:
    return json.loads(os.environ.get("FOUND", "[]") or "[]")


def pin():
    for one in from_env():
        git("update-index", "--cacheinfo", f"160000,{one['sha']},{one['path']}")
        print(f"{one['id']}: index pinned to {one['sha'][:7]} ({one['version']})")


def web_of(url: str) -> str:
    """`git@github.com:owner/repo.git` as `https://github.com/owner/repo`."""
    if url.startswith("git@github.com:"):
        url = "https://github.com/" + url[len("git@github.com:"):]
    return url[:-4] if url.endswith(".git") else url


def title_of(one: dict) -> str:
    return f"feat(store): {one['name']} {one['version']}"


def body_of(one: dict, url: str, run: str) -> str:
    """The pull request's words. Pure, for the test."""
    source = web_of(url)
    repo = source.removeprefix("https://github.com/")
    return (
        f"Moves the private {one['name']} entry from {one['pinned_version']} to {one['version']} "
        f"({repo}@{one['sha'][:7]}, [changes]({source}/compare/{one['pinned_sha'][:12]}...{one['sha'][:12]})).\n\n"
        f"Proposed by `follow.yml`: the source's `main` ships {one['version']}. "
        f"[The check]({run}) built and packed it with every other entry (`publish.py --check`). "
        "Merging this publishes it.\n\n"
        f"## What's new\n\n{one['notes'] or '_No CHANGELOG sections between the two._'}\n"
    )


def propose():
    run = os.environ.get("RUN", "")
    name, email = BOT
    # Each proposal on `main` as the run found it, never on the one before.
    main = git("rev-parse", "HEAD")
    for one in from_env():
        branch = f"follow/{one['id']}"
        url = source_url(one["path"])
        git("switch", "-q", "-C", branch, main)
        git("update-index", "--cacheinfo", f"160000,{one['sha']},{one['path']}")
        git(
            "-c", f"user.name={name}", "-c", f"user.email={email}",
            "commit", "-q", "-m", title_of(one), "-m",
            f"Moves the private {one['name']} entry from {one['pinned_version']} to {one['version']} "
            f"({web_of(url).removeprefix('https://github.com/')}@{one['sha'][:7]}).",
        )
        git("push", "-q", "--force", "origin", f"HEAD:refs/heads/{branch}")
        body = body_of(one, url, run)
        number = subprocess.run(
            ["gh", "pr", "list", "--head", branch, "--state", "open", "--json", "number", "--jq", ".[0].number"],
            cwd=ROOT, check=True, capture_output=True, text=True,
        ).stdout.strip()
        if number:
            subprocess.run(["gh", "pr", "edit", number, "--title", title_of(one), "--body", body], cwd=ROOT, check=True)
            print(f"{one['id']}: pull request #{number} brought up to {one['version']}")
        else:
            subprocess.run(
                ["gh", "pr", "create", "--base", "main", "--head", branch, "--title", title_of(one), "--body", body],
                cwd=ROOT, check=True,
            )
            print(f"{one['id']}: pull request opened for {one['version']}")


if __name__ == "__main__":
    modes = {"look": look, "pin": pin, "propose": propose}
    if len(sys.argv) != 2 or sys.argv[1] not in modes:
        sys.exit("usage: follow.py look | pin | propose")
    modes[sys.argv[1]]()
