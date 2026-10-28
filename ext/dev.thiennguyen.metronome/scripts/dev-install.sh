#!/bin/bash
# Build Metronome and install it where a debug build of Lumi looks — the
# `.dev` data directory's extensions folder, one directory named by the id —
# the way Meeting Notes' script does. A running `pnpm tauri dev` copy
# rescans by itself when `.rescan` there is touched (Lumi's
# `ext::commands::watch_rescans`); an older one needs Developer →
# Extensions → Rescan.
#
# The store's own build is `python3 scripts/publish.py --check` from the
# lumi-store root, which packs the same files into dist/extensions/.
set -euo pipefail

cd "$(dirname "$0")/.."
ID="dev.thiennguyen.metronome"

rustup target list --installed | grep -q wasm32-wasip2 \
  || rustup target add wasm32-wasip2
cargo build --release --target wasm32-wasip2
corepack pnpm -C web install --frozen-lockfile --ignore-scripts
corepack pnpm -C web run build

DEST="$HOME/Library/Application Support/dev.thiennguyen.lumi.dev/extensions/$ID"
mkdir -p "$DEST"
cp target/wasm32-wasip2/release/lumi_metronome_ext.wasm "$DEST/extension.wasm"
cp manifest.toml CHANGELOG.md icon.svg "$DEST/"
# The built front end is the package's ui/, replaced whole.
rm -rf "$DEST/ui"
cp -R web/dist "$DEST/ui"
# A cache compiled from an older wasm is never opened, but need not pile up.
rm -f "$DEST"/extension*.cwasm

# A debug Lumi rescans on this.
touch "$(dirname "$DEST")/.rescan"

echo "installed into $DEST; a running debug Lumi rescans by itself"
