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
   store publishes the files beside your package. How the first-party
   extensions' pictures are made is under "Store pictures" below.

   The longer words for that page go in a `STORE.md` beside your
   manifest. Without one, the page shows your manifest's one-line
   `description`. Lumi draws a small part of markdown: `#` headings,
   paragraphs, `-` and `1.` lists, **bold**, *italic*, `code`, fenced
   code, `---`, and links that start with `https://` (they open in the
   browser). Anything else, HTML included, is shown as the characters it
   is. UTF-8, at most 16 KB. The store publishes it named by its content,
   so an edit is picked up without bumping the version.

   Every release needs notes: a `CHANGELOG.md` beside your manifest, one
   `## <version>` section per release, newest on top.

   ```md
   # Changelog

   ## [Unreleased]

   ## [1.2.0] - 2026-09-30
   ### Added
   - Pin the panel so it stays open while you paste.
   ### Fixed
   - Search keeps text cased as it was copied.
   ```

   The file is required, and its newest section must be the version your
   manifest ships — a bump without notes, or notes without a bump, fails
   the PR. The headings Keep a Changelog, release-please, git-cliff and
   changesets write are all accepted (`## 1.2.0`, `## v1.2.0`,
   `## [1.2.0] - 2026-09-30`, `## [1.2.0](…) (2026-09-30)`); the date is
   optional. Versions go newest first, each once; a section holds the same
   small markdown as `STORE.md`, at most 4 KB. Anything above the first
   `##` and an Unreleased section are not published. Write for the person
   using your extension rather than for its code.

   To start a section, bump the manifest's version and run

   ```bash
   python3 scripts/changelog.py draft dev.you.thing
   ```

   It puts your commits since CHANGELOG.md last changed on top, grouped
   from Conventional Commit subjects (`feat` → Added, `fix` → Fixed,
   `perf` → Improved; chore, refactor, style, docs, test, ci and build
   left out) — a draft to reword, not the finished notes.

   The store publishes your newest 20 sections, named by their content.
   After a release merges, the store proposes a short summary of it in
   English and Vietnamese — a headline and up to six plain sentences, for
   Lumi's update list and lumikeys.app — as a PR adding
   `release-notes/<id>.json`. Review or edit it there. A summary is pinned
   to the notes it was written from: edit a section and its old summary
   stops showing until a new one is merged, and the notes are shown
   instead.

3. Review is human, of source: the manifest's capabilities against what
   the code actually calls, nothing phoning home, no misbehaviour shipped
   as a feature. Updates are PRs that bump the submodule commit and the
   manifest version, with a `CHANGELOG.md` section for that version.
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

### First-party private entries

The store owner's own extensions may be closed source. Such an entry is a
private repo pinned as a submodule like any other, with two differences:

- `update = none` on its submodule in `.gitmodules`, so a recursive
  checkout — a contributor's, or CI's — skips it rather than failing on a
  repo it cannot read;
- `private = true` on its entry in `extensions.toml`.

CI checks it out with a read-only deploy key (`scripts/fetch-private.sh`,
secret `SCREENSHOT_DEPLOY_KEY`) in the entry's own build leg and in the
signing job, and deletes the key before any build script runs. The package
is still built from the pinned source and signed by CI — no developer-built
binary — and is published like every other, so its wasm and ui/ are
public; only the source is not. A fork's pull request has no key, and
`publish.py --check` skips the entry and says so.

To check it out locally, with access to the repo:

```bash
git submodule update --init --checkout ext/dev.thiennguyen.screenshot
```

This is not open to third-party submissions: the store's promise to
everyone else is still a public repo, reviewed before it ships.

## Store pictures

The first-party extensions' `screenshots` are promo pages: a headline over
the extension's colour, the page in a Lumi window, a callout. They are
taken the same way every time, without a Lumi build:

- `scripts/preview/promo/<id>.json` — each shot's headline, callout, page,
  window size and `theme`;
- `scripts/preview/shots/<id>-<n>.js` — an optional scene run in the page
  before the picture (a row clicked, a field filled);
- `scripts/preview/<id>.json` — what the stand-in bridge answers `call`
  with. An extension with a built front end has its own stand-in instead
  (the clipboard's is `web/src/dev/mock.ts`), which is the data the
  pictures show.

1. For an extension with a built front end, start its dev server:

   ```bash
   pnpm -C ext/dev.thiennguyen.clipboard/web dev --port 5173 --strictPort
   ```

2. Serve the extension's pages with the stand-in for Lumi's bridge.
   `--proxy` is only for a built front end, so the promo page and the
   extension's page share an origin and a scene can reach into it:

   ```bash
   python3 scripts/preview_ui.py ext/dev.thiennguyen.clipboard --port 5191 --proxy http://127.0.0.1:5173
   ```

   It reads Lumi's stylesheet from `../lumi/src-tauri/src/ext/lumi.css`;
   point `--lumi-css` elsewhere if Lumi is not checked out beside this
   repo. Restart it after editing a promo JSON — it is read once.

3. Take each shot at 1280×800, scale 1, into the path the manifest's
   `screenshots` lists (needs Google Chrome in `/Applications`):

   ```bash
   node scripts/screenshot.mjs "http://127.0.0.1:5191/__promo__/?shot=1" \
     ext/dev.thiennguyen.clipboard/shots/1-history.png \
     scripts/preview/shots/dev.thiennguyen.clipboard-1.js 1280 800 1
   ```

   Pass `""` for the scene when a shot has none. A shot's `theme` is
   applied on its own: a page drawn in Lumi's colours follows the system's
   scheme, so a `"dark"` shot is loaded with `prefers-color-scheme: dark`.
   `THEME=light|dark` overrides it.

Look at every picture before committing it: each must stay under 1 MB.

## What CI enforces

`scripts/publish.py` re-runs the checks Lumi's own installer runs —
id/name alphabets, the supported-capability set, param kinds, selects with
options — so a submission fails in the PR, not on somebody's Mac. (The
long-term shape is Lumi shipping its installer's checks as a standalone
check tool; until then this mirror is kept deliberately strict.)

`CHANGELOG.md` is held to the rules under Submitting, and
`release-notes/<id>.json` to its shape: for each version the changelog
still has, the sha256 of that version's notes and a `lumi_notes` summary
with an `en` and a `vi` headline (≤ 70 characters) and 1–6 items
(≤ 110), plain text. `python3 -m unittest discover -s scripts -p
'test_*.py'` runs the parser's own tests.

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
3. **Discussions** — done: enabled, with an **Extensions** category in
   the Announcement format (only maintainers open threads; anyone can
   reply and react). Every publish runs `scripts/discussions.py`, which
   opens one thread per listed extension, keeps its title and body in
   step with the manifest, and hands `{number, url}` to the index as the
   entry's `discussion`. Lumi reads the ❤️ count on that thread live —
   one unauthenticated `GET /repos/thiennguyen93/lumi-store/discussions`
   covers every extension — so nothing about hearts is ever published
   here. Renaming or deleting the category breaks the job, not the
   release: the index then carries `discussion: null`.
