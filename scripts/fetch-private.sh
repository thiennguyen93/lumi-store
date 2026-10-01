#!/usr/bin/env bash
# Check out the source of the listed `private = true` entries named on the
# command line, with the read-only deploy key in $DEPLOY_KEY.
#
#   DEPLOY_KEY=… scripts/fetch-private.sh [<id>...]
#
# With no ids, every private entry. A deploy key opens one repository, so
# one key serves one private entry today; a second needs a secret of its
# own and a step that passes it.
#
# Their submodules are `update = none` in .gitmodules, so the workflows'
# recursive checkout skips them and `--checkout` here overrides that for
# exactly these paths. The key is written to a file only this step can
# see, used for these fetches, and deleted before the step ends — the
# build that follows runs a submission's code and must find nothing here.
#
# No key (a fork's pull request, or Dependabot's) is not an error at this
# step: `publish.py --check` then skips the entry and says so, and every
# publishing mode refuses to run without its source.
set -euo pipefail

if [ -z "${DEPLOY_KEY:-}" ]; then
  echo "no deploy key: private sources not fetched"
  exit 0
fi

ssh_dir="$(mktemp -d)"
trap 'rm -rf "$ssh_dir"' EXIT
chmod 700 "$ssh_dir"
printf '%s\n' "$DEPLOY_KEY" > "$ssh_dir/key"
chmod 600 "$ssh_dir/key"
# GitHub's published ed25519 host key, pinned rather than learned from the
# network: SHA256:+DiY3wvvV6TuJJhbpZisF/zLDA0zPMSvHdkr4UvCOqU
echo "github.com ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIOMqqnkVzrm0SdG6UOoqKLsabgH5C9okWi0dh2l9GKJl" > "$ssh_dir/known_hosts"
export GIT_SSH_COMMAND="ssh -i $ssh_dir/key -o IdentitiesOnly=yes -o UserKnownHostsFile=$ssh_dir/known_hosts -o StrictHostKeyChecking=yes"

ids=("$@")
if [ ${#ids[@]} -eq 0 ]; then
  read -r -a ids < <(python3 scripts/publish.py --list | sed -n 's/^private=//p' | python3 -c 'import json, sys; print(" ".join(json.load(sys.stdin)))')
fi

for id in "${ids[@]}"; do
  path="$(python3 scripts/publish.py --path "$id")"
  git submodule update --init --checkout -- "$path"
  echo "fetched $id into $path"
done
