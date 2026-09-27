# lumi-store

The registry behind Lumi's in-app store. **Extensions today; other kinds —
snippet packs, pre-bound shortcut templates — are planned and the layout
leaves room for them**: everything extension-shaped lives under
`extensions.toml` + `ext/`, and publishes under `/extensions/` in the
output, so a future `templates.toml` + `tpl/` publishes beside it without
touching anything here.

The one promise this repo keeps: **the reviewed source is the shipped
artifact.** A submission is a PR holding source, pinned to a commit; CI
builds the wasm, packages it, signs it with the store key, and publishes
it. No developer-built binary is ever published, so nothing can be swapped
after review.

## Submitting an extension

1. Your extension is a public git repo: a Rust crate depending on
   `lumi-extension-api`, with `manifest.toml` beside the crate's
   `Cargo.toml`. The developer guide is
   [docs.lumikeys.app/extensions](https://docs.lumikeys.app/extensions) —
   a first extension, the manifest, the SDK reference, windows and
   publishing. `ext/dev.thiennguyen.sample/sample/` is a working
   extension to copy from, and `ext/dev.thiennguyen.sample/api/` is the
   SDK crate the guide's git dependency points at.
2. Open a PR that
   - adds your repo as a submodule under `ext/<your-extension-id>`,
     pinned to the exact commit you are submitting, and
   - adds one entry to `extensions.toml`:

   ```toml
   [[extension]]
   id = "dev.you.thing"      # must equal the id in your manifest.toml
   path = "ext/dev.you.thing" # the submodule
   subdir = "."               # where the crate + manifest live inside it
   ```

3. Review is human, of source: the manifest's capabilities against what
   the code actually calls, nothing phoning home, no misbehaviour shipped
   as a feature. Updates are PRs that bump the submodule commit and the
   manifest version.
4. Every PR is checked first: CI validates each manifest, builds each
   extension from source and packs it, and signs nothing — the job holds
   no secret, because a submission's build script runs inside it. Run the
   same thing locally with `python3 scripts/publish.py --check`.
5. Merging is publishing: CI rebuilds every listed extension from source,
   signs the packages, and rewrites the index.

## What CI enforces

`scripts/publish.py` re-runs the checks Lumi's own installer runs —
id/name alphabets, the supported-capability set, param kinds, selects with
options — so a submission fails in the PR, not on somebody's Mac. (The
long-term shape is Lumi shipping its installer's checks as a standalone
check tool; until then this mirror is kept deliberately strict.)

Packages are reproducible tarballs (fixed metadata, sorted entries):
rebuilding an unchanged extension publishes identical bytes.

## Owner setup (once)

1. **Keypair** — passwordless on purpose: the GitHub secret store is the
   wall, and CI has no tty to type a password into.

   ```bash
   brew install minisign        # or apt install minisign
   minisign -G -W -p store.pub -s store.key
   ```

   - Contents of `store.key` → repo secret **`STORE_SIGNING_KEY`**. Never
     commit it; treat a leak like a leaked updater key (anyone could sign
     packages every copy of Lumi trusts).
   - The base64 line of `store.pub` → compiled into Lumi as the store
     key (with its verification tests fed real vectors).
2. **Pages** — done: deploys from the `gh-pages` branch the CI run
   creates, and the account's Pages custom domain serves it at
   `https://thiennguyen.dev/lumi-store/extensions/index.json`, which is
   the URL compiled into Lumi's store client and the `BASE_URL` the
   index's own links carry. Moving hosts later is one flip of each.
