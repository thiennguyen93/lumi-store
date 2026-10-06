#!/usr/bin/env bash
# Check out the source of the listed `private = true` entries named on the
# command line, each with its own read-only deploy key.
#
#   SCREENSHOT_DEPLOY_KEY=… STICKY_DEPLOY_KEY=… scripts/fetch-private.sh [<id>...]
#
# With no ids, every private entry. A deploy key opens one repository, so
# each private entry has a secret of its own, named after the last part of
# its id: `dev.thiennguyen.screenshot` reads $SCREENSHOT_DEPLOY_KEY,
# `dev.thiennguyen.sticky` $STICKY_DEPLOY_KEY (dashes become underscores).
# A new private entry is a new secret by that name, and a line passing it in
# each workflow step that calls this.
#
# Their submodules are `update = none` in .gitmodules, so the workflows'
# recursive checkout skips them and `--checkout` here overrides that for
# exactly these paths. Each key is written to a file only this step can
# see, used for its own fetch, and deleted before the next — and the whole
# directory before the step ends: the build that follows runs a
# submission's code and must find nothing here.
#
# No key for an entry (a fork's pull request, or Dependabot's, or a step
# that was not given that one) is not an error at this step: that entry is
# not fetched and says so, `publish.py --check` then skips it and says so,
# and every publishing mode refuses to run without its source.
set -euo pipefail

ssh_dir="$(mktemp -d)"
trap 'rm -rf "$ssh_dir"' EXIT
chmod 700 "$ssh_dir"
# GitHub's published ed25519 host key, pinned rather than learned from the
# network: SHA256:+DiY3wvvV6TuJJhbpZisF/zLDA0zPMSvHdkr4UvCOqU
echo "github.com ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIOMqqnkVzrm0SdG6UOoqKLsabgH5C9okWi0dh2l9GKJl" > "$ssh_dir/known_hosts"
export GIT_SSH_COMMAND="ssh -i $ssh_dir/key -o IdentitiesOnly=yes -o UserKnownHostsFile=$ssh_dir/known_hosts -o StrictHostKeyChecking=yes"

ids=("$@")
if [ ${#ids[@]} -eq 0 ]; then
  read -r -a ids < <(python3 scripts/publish.py --list | sed -n 's/^private=//p' | python3 -c 'import json, sys; print(" ".join(json.load(sys.stdin)))')
fi

for id in "${ids[@]}"; do
  # The id's alphabet is checked by publish.py (lowercase letters, digits,
  # `.`, `-`, `_`), so the name built here is always a plain variable name.
  name="$(printf '%s' "${id##*.}" | tr 'a-z-' 'A-Z_')_DEPLOY_KEY"
  key="${!name:-}"
  if [ -z "$key" ]; then
    echo "no \$$name: $id not fetched"
    continue
  fi
  printf '%s\n' "$key" > "$ssh_dir/key"
  chmod 600 "$ssh_dir/key"
  path="$(python3 scripts/publish.py --path "$id")"
  git submodule update --init --checkout -- "$path"
  rm -f "$ssh_dir/key"
  echo "fetched $id into $path"
done
