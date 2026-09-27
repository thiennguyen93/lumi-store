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
   `Cargo.toml`. Copy Lumi's `extensions/sample/` to start;
   `extensions/README.md` in the Lumi repo is the developer guide.
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
4. Merging is publishing: CI rebuilds every listed extension from source,
   signs the packages, and rewrites the index.

## What CI enforces

`scripts/publish.py` re-runs the checks Lumi's own installer runs —
id/name alphabets, the supported-capability set, param kinds, selects with
options — so a submission fails in the PR, not on somebody's Mac. (The
long-term shape is running Lumi's `ext::manifest` itself as a check
binary; until then this mirror is kept deliberately strict.)

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
   - The base64 line of `store.pub` → `STORE_PUBKEY` in Lumi's
     `src-tauri/src/ext/install.rs`, together with turning the two tests
     whose comments name their arms into real-vector tests.
2. **Pages** — Settings → Pages → deploy from the `gh-pages` branch
   (created by the first CI run). The index then lives at
   `https://thiennguyen93.github.io/lumi-store/extensions/index.json`.
3. **Domain** — point `lumi.thiennguyen.dev/extensions/*` at the Pages
   output (proxy or redirect). Lumi's client reads only that URL; until it
   answers, the in-app Store shows its not-open state. When the domain is
   live, flip `BASE_URL` in `.github/workflows/publish.yml` so the index's
   own links say the same host.
