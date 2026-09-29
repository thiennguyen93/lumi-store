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
   SDK crate the guide's git dependency points at. The other two in-tree
   entries are fuller examples: `ext/dev.thiennguyen.keytest/` (a tab in
   Lumi's own Extensions pane) and `ext/dev.thiennguyen.clipboard/` (a
   panel, encrypted storage, clipboard events and a React front end the
   store builds).
2. Open a PR that
   - adds your repo as a submodule under `ext/<your-extension-id>`,
     pinned to the exact commit you are submitting, and
   - adds one entry to `extensions.toml`:

   ```toml
   [[extension]]
   id = "dev.you.thing"      # must equal the id in your manifest.toml
   path = "ext/dev.you.thing" # the submodule
   subdir = "."               # where the crate + manifest live inside it
   web = "web"                # optional — see "A built front end" below
   category = "Productivity"  # the shelf in Lumi's Extension Store
   ```

   `category` is one of Productivity, Writing, Windows, Design,
   Developer or Utilities. It is the store's word for the extension,
   settled in review, and so is `featured = true`, which puts it on the
   plate at the top of Discover — neither is a manifest key, because
   neither is the author's to claim.

   Pictures for your extension's page in the store go in your manifest,
   from your own source (not a built front end):

   ```toml
   [extension]
   screenshots = ["shots/panel.png", "shots/settings.png"]
   ```

   At most 4, each a PNG or JPEG of at most 1 MB, made at 16:10 (1280×800)
   so Lumi's frames show them whole. Lumi's installer ignores the key; the
   store publishes the files beside your package. The first-party
   extensions' pictures are made with `scripts/preview_ui.py` (its
   `/__promo__/` page) and `scripts/screenshot.mjs` — see the top of each.

3. Review is human, of source: the manifest's capabilities against what
   the code actually calls, nothing phoning home, no misbehaviour shipped
   as a feature. Updates are PRs that bump the submodule commit and the
   manifest version.
4. Every PR is checked first: CI validates each manifest, builds each
   extension from source and packs it, and signs nothing — the job holds
   no secret, because a submission's build script runs inside it. Run the
   same thing locally with `python3 scripts/publish.py --check`.
5. Merging is publishing: CI rebuilds every listed extension from source,
   signs the packages, and rewrites the index — in two halves that never
   share a job. Each extension builds on a runner of its own, holding no
   secret and a read-only token, and hands on what it compiled —
   `extension.wasm`, and `ui/` for an entry with a built front end — and
   nothing else. The signing job runs no build and no submission's code:
   it packs the manifest and icon (and a hand-written `ui/`) from the
   reviewed source, signs, and publishes. `.github/workflows/publish.yml`
   says why at length.

### A built front end

Windows can be plain HTML and JS in `ui/`, packed as written — or a
React/TypeScript (or any bundler) project the store builds, the way it
builds the Rust. Set `web` on the entry to a directory beside the
manifest holding:

- `package.json` with `"packageManager": "pnpm@<version>"` and a `build`
  script that writes `dist/` (Vite's default);
- `pnpm-lock.yaml`, committed — the build installs from it only.

CI runs `pnpm install --frozen-lockfile --ignore-scripts` then
`pnpm run build` in the no-secret build job, and ships `dist/` as the
package's `ui/`. Review reads the TypeScript and the lockfile; the bundle
is never committed — an entry with `web` set and a `ui/` directory in the
source is refused, because a committed bundle is a binary swapped past
review. The page's CSP (`default-src 'self'`) still applies: production
builds only, no inline `<script>`. `ext/dev.thiennguyen.clipboard/web/` is
a working example.

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
