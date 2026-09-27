#!/usr/bin/env python3
"""Build, check, sign and index every listed extension.

The pipeline the README promises, in one file CI and a maintainer's
laptop run identically:

  extensions.toml -> for each entry:
      cargo build --target wasm32-wasip2 (from the pinned submodule)
      validate manifest.toml (the checks Lumi's installer re-runs)
      pack manifest.toml + extension.wasm into a reproducible .tar.gz
      minisign the tarball with the store key
  -> dist/extensions/{index.json, *.tar.gz, *.tar.gz.sig}

`--check` runs everything up to the signature and stops there: every
entry is validated, built from source and packed, and nothing is signed
or indexed. It is what a pull request runs, in a job that holds no
secret — see `.github/workflows/check.yml`.

CI publishes in two halves, and the split is the security design rather
than tidiness. `cargo build` runs a submission's `build.rs` and proc
macros, and those of every crate it depends on, so the job that builds
must hold nothing worth stealing — and the job that signs must run
nothing it did not review:

  --list              the listed ids, for the build matrix
  --build ID OUT      validate and build one entry; write OUT/extension.wasm
                      and nothing else (no key, read-only token, one entry
                      per runner, so one submission's build cannot touch
                      another's output)
  --sign-built DIR    for every listed entry, take DIR/wasm-<id>/extension.wasm
                      and nothing else from the build; pack the manifest,
                      icon and ui/ from the reviewed source here; sign; index

The wasm is the one thing a build produces, so it is the one thing that
crosses from the untrusted half — a package whose manifest or ui/ came
out of a build job could have been rewritten by that build. A plain
`python3 scripts/publish.py` still does all of it in one process, for a
maintainer's laptop, where the key and the build share a machine anyway.

Fail-loud doctrine throughout: a bad manifest, a missing wasm, an absent
signing key (with entries to sign) each stop the run with a sentence
naming the entry — a package that cannot be verified must never be the
one that quietly ships.

The validation here mirrors Lumi's own installer checks. Two
copies is a known cost, paid for not needing a Lumi checkout to publish;
the mirror is kept deliberately strict, and drift shows up as CI green /
install refused — which the sample extension, once listed, turns into a
CI-time signal.
"""

import hashlib
import html
import io
import json
import os
import re
import subprocess
import sys
import tarfile
import tomllib
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DIST = ROOT / "dist" / "extensions"
BUILD = ROOT / "build"

BASE_URL = os.environ.get(
    "BASE_URL", "https://thiennguyen93.github.io/lumi-store/extensions"
).rstrip("/")
KEY_FILE = os.environ.get("STORE_KEY_FILE", "")

# What Lumi lets an extension declare.
CAPABILITIES = {"accessibility", "applications", "clipboard", "config", "network"}
PARAM_KINDS = {
    "text", "textarea", "number", "bool", "select", "segmented", "slider",
    "template", "app", "keys", "multiselect",
}
# The kinds whose value is one or more of their options.
CHOICE_KINDS = {"select", "segmented", "multiselect"}
# Lowercase only, as Lumi's `manifest::is_valid_id` is: the id is a
# directory name on a case-insensitive filesystem, and a second spelling of
# an installed id was a takeover of its directory.
ID_RE = re.compile(r"^[a-z0-9._-]{1,100}$")
NAME_RE = re.compile(r"^[A-Za-z0-9_-]+$")
# Mirrors the installer's ui-path alphabet and ceilings: what CI packs
# is exactly what the installer will accept, so drift shows up here as a
# failed publish instead of there as a refused install.
UI_SEGMENT_RE = re.compile(r"^[A-Za-z0-9._-]+$")
# The installer's cap on extension.wasm, and the component-model header a
# built component starts with: magic, then version 0x0d and layer 0x01.
# Asked of what a build job hands the signing job, which trusts nothing
# about it beyond those two facts.
MAX_WASM = 48 * 1024 * 1024
COMPONENT_HEADER = b"\x00asm\x0d\x00\x01\x00"
MAX_UI_FILE = 5 * 1024 * 1024
MAX_UI_FILES = 200
MAX_UI_TOTAL = 24 * 1024 * 1024


def is_valid_ui_path(path: str) -> bool:
    if not path or len(path) > 512 or "\\" in path:
        return False
    return all(
        segment
        and not segment.startswith(".")
        and segment != "__lumi__"
        and UI_SEGMENT_RE.match(segment)
        for segment in path.split("/")
    )


def fail(entry_id: str, why: str):
    sys.exit(f"error: {entry_id}: {why}")


def check_params(entry_id: str, owner: str, params: list, settings: bool = False, node: bool = False):
    names = set()
    for param in params:
        name = param.get("name", "")
        if not name.strip():
            fail(entry_id, f"a param of {owner} has no name")
        # Mirrors the installer: only a [[settings]] field may say scope,
        # and byProfile is the key Lumi keeps per-profile values under.
        if settings and name == "byProfile":
            fail(entry_id, "a setting may not be called byProfile: Lumi keeps per-profile values under that name")
        scope = param.get("scope", "")
        if scope not in ("", "mac", "profile"):
            fail(entry_id, f"{owner}'s {name} has scope {scope!r} — mac and profile are the scopes")
        if scope == "profile" and not settings:
            fail(entry_id, f"{owner}'s {name} has a scope, which only a [[settings]] field may have")
        if name in names:
            fail(entry_id, f"{owner} declares {name} twice")
        names.add(name)
        kind = param.get("kind", "")
        if kind not in PARAM_KINDS:
            fail(entry_id, f"{owner}'s {name} has unknown kind {kind!r}")
        # The installer refuses a node's multiselect: the flow editor has no
        # control holding several answers.
        if kind == "multiselect" and node:
            fail(entry_id, f"{owner}'s {name} is a multiselect, which a flow node cannot have yet — use one bool per option")
        options = param.get("options", [])
        if kind in CHOICE_KINDS and not options:
            fail(entry_id, f"{owner}'s {name} is a select with nothing to select")
        if kind == "segmented" and len(options) > 5:
            fail(entry_id, f"{owner}'s {name} is segmented with {len(options)} options — five fit side by side; use a select")
        if "search" in param and kind not in ("select", "multiselect"):
            fail(entry_id, f"{owner}'s {name} has search, which only a select or a multiselect takes")
        values = [option.get("value", "") for option in options]
        for index, value in enumerate(values):
            if value in values[:index]:
                fail(entry_id, f"{owner}'s {name} offers the value {value!r} twice")
        # A multiselect defaults to a list of its options; every other kind
        # to a string. Absent is fine for both.
        default = param.get("default", "")
        if kind == "multiselect":
            if not isinstance(default, list):
                if default != "":
                    fail(entry_id, f'{owner}\'s {name} is a multiselect, so its default is a list: default = ["a", "b"]')
            else:
                stray = next((value for value in default if value not in values), None)
                if stray is not None:
                    fail(entry_id, f"{owner}'s {name} defaults to {stray!r}, which is not one of its options")
        elif isinstance(default, list):
            fail(entry_id, f"{owner}'s {name} has a list for its default, which only a multiselect takes")


def check_manifest(entry_id: str, manifest: dict):
    ext = manifest.get("extension") or fail(entry_id, "no [extension] table")
    mid = ext.get("id", "")
    if mid != entry_id:
        fail(entry_id, f"manifest names itself {mid!r}; the entry and manifest id must match")
    if not ID_RE.match(mid) or mid.startswith("."):
        fail(entry_id, "id may hold only letters, digits, '.', '-', '_' and not start with '.'")
    if not ext.get("name", "").strip():
        fail(entry_id, "the extension has no name")
    if not ext.get("version", "").strip():
        fail(entry_id, "the extension has no version")
    for word in ext.get("capabilities", []):
        if word not in CAPABILITIES:
            fail(entry_id, f"capability {word!r} is not one the host offers ({sorted(CAPABILITIES)})")
    seen = set()
    for command in manifest.get("command", []):
        name = command.get("name", "")
        if not name.strip():
            fail(entry_id, "a command has no name")
        if name in seen:
            fail(entry_id, f"two commands are named {name}")
        seen.add(name)
        check_params(entry_id, name, command.get("params", []))
    seen = set()
    for node in manifest.get("node", []):
        name = node.get("name", "")
        if not NAME_RE.match(name):
            fail(entry_id, f"node name {name!r} may hold only letters, digits, '-' and '_'")
        if name in seen:
            fail(entry_id, f"two nodes are named {name}")
        seen.add(name)
        check_params(entry_id, name, node.get("params", []), node=True)
    check_params(entry_id, "settings", manifest.get("settings", []), settings=True)
    seen = set()
    for window in manifest.get("window", []):
        name = window.get("name", "")
        if not NAME_RE.match(name):
            fail(entry_id, f"window name {name!r} may hold only letters, digits, '-' and '_'")
        if name in seen:
            fail(entry_id, f"two windows are named {name}")
        seen.add(name)
        path = window.get("path", "") or "index.html"
        if not is_valid_ui_path(path):
            fail(entry_id, f"window {name} points at {path!r}, which is not a plain relative path")
    return ext


def build_wasm(entry_id: str, crate: Path) -> Path:
    cargo_toml = crate / "Cargo.toml"
    if not cargo_toml.exists():
        fail(entry_id, f"no Cargo.toml at {cargo_toml}")
    with open(cargo_toml, "rb") as f:
        package = tomllib.load(f).get("package", {}).get("name", "")
    if not package:
        fail(entry_id, "Cargo.toml names no [package]")
    target_dir = BUILD / entry_id
    subprocess.run(
        [
            "cargo", "build", "--release",
            "--target", "wasm32-wasip2",
            "--manifest-path", str(cargo_toml),
            "--target-dir", str(target_dir),
        ],
        check=True,
    )
    wasm = target_dir / "wasm32-wasip2" / "release" / f"{package.replace('-', '_')}.wasm"
    if not wasm.exists():
        fail(entry_id, f"the build produced no {wasm.name}")
    return wasm


def ui_members(entry_id: str, ui_dir: Path) -> list:
    """Every file under ui/, as (arcname, path), sorted for the
    reproducible pack — and held to the installer's own alphabet and
    ceilings, so a publish that would be refused at install fails here,
    naming the file."""
    if not ui_dir.is_dir():
        return []
    members = []
    total = 0
    for path in sorted(ui_dir.rglob("*")):
        if not path.is_file():
            continue
        rel = path.relative_to(ui_dir).as_posix()
        if not is_valid_ui_path(rel):
            fail(entry_id, f"ui/{rel} is not a plain relative path Lumi would accept")
        size = path.stat().st_size
        if size > MAX_UI_FILE:
            fail(entry_id, f"ui/{rel} is {size} bytes; the installer caps a ui file at {MAX_UI_FILE}")
        total += size
        members.append((f"ui/{rel}", path))
    if len(members) > MAX_UI_FILES:
        fail(entry_id, f"{len(members)} ui files; the installer caps a package at {MAX_UI_FILES}")
    if total > MAX_UI_TOTAL:
        fail(entry_id, f"the ui tree is {total} bytes; the installer caps it at {MAX_UI_TOTAL}")
    return members


def pack(entry_id: str, manifest_path: Path, wasm_path: Path, icon_path, ui_dir: Path) -> bytes:
    """A reproducible tarball: fixed metadata, fixed order, no gzip
    timestamp — an unchanged extension republished is identical bytes,
    so mirrors and caches can compare instead of guessing."""
    buffer = io.BytesIO()
    members = [("manifest.toml", manifest_path)]
    if icon_path is not None:
        members.append(("icon.svg", icon_path))
    members.extend(ui_members(entry_id, ui_dir))
    members.append(("extension.wasm", wasm_path))
    with tarfile.open(fileobj=buffer, mode="w") as tar:
        for arcname, path in members:
            info = tar.gettarinfo(path, arcname=arcname)
            info.uid = info.gid = 0
            info.uname = info.gname = ""
            info.mtime = 0
            info.mode = 0o644
            with open(path, "rb") as f:
                tar.addfile(info, f)
    import gzip

    out = io.BytesIO()
    with gzip.GzipFile(fileobj=out, mode="wb", mtime=0) as gz:
        gz.write(buffer.getvalue())
    return out.getvalue()


def sign(entry_id: str, package_path: Path):
    if not KEY_FILE or not Path(KEY_FILE).exists():
        fail(
            entry_id,
            "there are extensions to sign and no store key — add the "
            "STORE_SIGNING_KEY secret (README: Owner setup)",
        )
    subprocess.run(
        [
            "minisign", "-S",
            "-s", KEY_FILE,
            "-x", str(package_path) + ".sig",
            "-t", f"lumi-store {entry_id}",
            "-m", str(package_path),
        ],
        check=True,
    )


def listed_entries() -> list:
    """The reviewed list — the only place any mode learns which
    extensions exist. Never read from a build's output."""
    with open(ROOT / "extensions.toml", "rb") as f:
        listed = tomllib.load(f).get("extension", [])
    for entry in listed:
        entry_id = entry.get("id", "") or sys.exit("error: an entry has no id")
        if not ID_RE.match(entry_id) or entry_id.startswith("."):
            fail(entry_id, "the listed id is not one Lumi would accept")
    return listed


def sources(entry: dict):
    """One entry's reviewed source, validated: where it lives, its
    manifest, and the icon and ui/ that ship beside the wasm."""
    entry_id = entry["id"]
    crate = (ROOT / entry["path"] / entry.get("subdir", ".")).resolve()
    # A submodule path that escapes the checkout is a listing lying
    # about where its source lives.
    if not str(crate).startswith(str(ROOT)):
        fail(entry_id, f"path escapes the repository: {crate}")
    manifest_path = crate / "manifest.toml"
    if not manifest_path.exists():
        fail(entry_id, f"no manifest.toml at {crate}")
    with open(manifest_path, "rb") as f:
        manifest = tomllib.load(f)
    ext = check_manifest(entry_id, manifest)
    # In the package (signed, what the app trusts) AND beside it (a
    # plain URL for the store page) — the same split as capabilities:
    # the page shows a claim, the app reads the verified copy.
    icon_path = crate / "icon.svg"
    icon = icon_path if icon_path.exists() else None
    # Windows have to point at files that ship — the same cross-check
    # Lumi's installer runs at the stage, made here first.
    ui_dir = crate / "ui"
    for window in manifest.get("window", []):
        declared = window.get("path", "") or "index.html"
        if not (ui_dir / declared).is_file():
            fail(entry_id, f"window {window.get('name')} points at ui/{declared}, which does not exist")
    ui_members(entry_id, ui_dir)
    return crate, manifest_path, manifest, ext, icon, ui_dir


def built_wasm(entry_id: str, built: Path) -> Path:
    """The one file the signing half takes from a build job, held to the
    two things that can be known about it without trusting the build: it
    is no bigger than the installer takes, and it is a component."""
    wasm = built / f"wasm-{entry_id}" / "extension.wasm"
    if not wasm.is_file() or wasm.is_symlink():
        fail(entry_id, f"the build handed over no extension.wasm at {wasm}")
    size = wasm.stat().st_size
    if size > MAX_WASM:
        fail(entry_id, f"extension.wasm is {size} bytes; the installer caps it at {MAX_WASM}")
    with open(wasm, "rb") as f:
        if f.read(len(COMPONENT_HEADER)) != COMPONENT_HEADER:
            fail(entry_id, "extension.wasm is not a WebAssembly component")
    return wasm


def build_one(entry_id: str, out: Path):
    """`--build`: the untrusted half, for one entry. Validates the source
    first so a bad manifest fails here, in the pull request's own terms,
    rather than after a build."""
    entry = next((e for e in listed_entries() if e["id"] == entry_id), None)
    if entry is None:
        sys.exit(f"error: {entry_id} is not in extensions.toml")
    crate = sources(entry)[0]
    wasm = build_wasm(entry_id, crate)
    out.mkdir(parents=True, exist_ok=True)
    (out / "extension.wasm").write_bytes(wasm.read_bytes())
    print(f"built {entry_id} into {out}")


def main(check: bool = False, built: "Path | None" = None):
    listed = listed_entries()
    DIST.mkdir(parents=True, exist_ok=True)
    index = []
    for entry in listed:
        entry_id = entry["id"]
        crate, manifest_path, manifest, ext, icon, ui_dir = sources(entry)
        # From a build job when the halves are split, built here when they
        # are not — and in both cases every other member of the package is
        # packed from the reviewed source by this process.
        wasm = build_wasm(entry_id, crate) if built is None else built_wasm(entry_id, built)
        package = pack(entry_id, manifest_path, wasm, icon, ui_dir)
        package_name = f"{entry_id}-{ext['version']}.tar.gz"
        package_path = DIST / package_name
        package_path.write_bytes(package)
        # A check has no key to sign with, by design: the job a pull
        # request runs is the one a submission's build script runs in.
        if not check:
            sign(entry_id, package_path)

        icon_url = ""
        if icon is not None:
            icon_name = f"{entry_id}-{ext['version']}.svg"
            (DIST / icon_name).write_bytes(icon.read_bytes())
            icon_url = f"{BASE_URL}/{icon_name}"
        # Same two spellings the host's own manifest reader accepts
        # (`min-lumi-version`, aliased from `min_lumi_version`) — mirrored
        # into the index so Lumi's update check can word a recommendation
        # without downloading the package first. Browse copy, same trust
        # level as every other field here: the real floor is still enforced
        # by the host against the *verified* package's own manifest at
        # install time, never by this string.
        min_lumi_version = (
            ext.get("min-lumi-version") or ext.get("min_lumi_version") or ""
        ).strip()
        index.append(
            {
                "id": entry_id,
                "name": ext["name"],
                "version": ext["version"],
                "minLumiVersion": min_lumi_version,
                "description": ext.get("description", ""),
                "author": ext.get("author", ""),
                "capabilities": ext.get("capabilities", []),
                # Window titles, for the page and any future surface: the
                # one contribution that draws arbitrary content deserves a
                # line on the shelf too. Lumi ignores this field — the app
                # reads windows out of the verified package's manifest.
                "windows": [
                    w.get("title") or w.get("name", "")
                    for w in manifest.get("window", [])
                ],
                "icon": icon_url,
                "package": f"{BASE_URL}/{package_name}",
                "signature": f"{BASE_URL}/{package_name}.sig",
                # Extra context the app tolerates and future surfaces can
                # use; Lumi tolerates unknown index fields by design.
                "sha256": hashlib.sha256(package).hexdigest(),
            }
        )

    if check:
        # Rendered and dropped: an index naming signatures that were never
        # made is not something to leave lying in dist/ for a later push.
        page(index)
        print(f"checked {len(index)} extension(s): valid, built and packed; nothing signed")
        return

    (DIST / "index.json").write_text(json.dumps(index, indent=2) + "\n")
    (DIST / "index.html").write_text(page(index))
    # The site root: /lumi-store/ answered 404 while everything lived one
    # directory down, which reads as the whole store being broken. One
    # kind of thing per path segment — /extensions/ today, /templates/
    # later — and the root points at the shelf people mean.
    (DIST.parent / "index.html").write_text(
        '<!doctype html><meta charset="utf-8">'
        '<meta http-equiv="refresh" content="0; url=extensions/">'
        '<title>Lumi store</title>'
        '<a href="extensions/">Lumi extensions</a>\n'
    )
    print(f"published {len(index)} extension(s) to {DIST}")


def icon_img(entry: dict) -> str:
    """An <img>, never inline SVG: the icon came out of a submission, and
    an image context is where an SVG's scripts do not run."""
    url = entry.get("icon", "")
    if not url:
        return ""
    return (
        f'<img class="icon" src="{html.escape(url, quote=True)}"'
        ' alt="" width="28" height="28"> '
    )


def page(index: list) -> str:
    """The store's web face: the same index, browsable, with Install
    buttons that open `lumi://extensions/install?id=<id>`.

    The link carries the id and nothing else — Lumi resolves it against
    this same index over https and requires the store signature, so the
    page (and any page copying its links) can start an install *review*,
    never an install. Every string here came out of a reviewed manifest,
    and is HTML-escaped anyway: review is a wall against malice, not
    against an author's stray `<` breaking the shelf.
    """
    rows = "\n".join(
        f'''  <article>
    <h2>{icon_img(e)}{html.escape(e["name"])} <small>{html.escape(e["version"])}</small></h2>
    <p class="by">{html.escape(e["author"])}</p>
    <p>{html.escape(e["description"])}</p>
    <p class="caps">{html.escape(", ".join(e["capabilities"]) or "reaches nothing outside Lumi")}</p>
    <p><a class="install" href="lumi://extensions/install?id={html.escape(e["id"], quote=True)}">Install in Lumi</a></p>
  </article>'''
        for e in index
    )
    if not rows:
        rows = "  <p>Nothing is listed yet.</p>"
    return f"""<!doctype html>
<html lang="en">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Lumi extensions</title>
<style>
  :root {{ color-scheme: light dark; font-family: -apple-system, system-ui, sans-serif; }}
  body {{ max-width: 640px; margin: 3rem auto; padding: 0 16px; line-height: 1.5; }}
  article {{ border-top: 1px solid color-mix(in srgb, currentColor 15%, transparent); padding: 1rem 0; }}
  small, .by, .caps {{ opacity: .65; }}
  .caps {{ font-size: .85em; }}
  .install {{ display: inline-block; padding: .4em 1em; border: 1px solid currentColor; border-radius: 8px; text-decoration: none; }}
</style>
<h1>Lumi extensions</h1>
<p>Install opens Lumi, which downloads the package, verifies the store
signature, and shows what the extension may reach before anything lands.
No Lumi yet? <a href="https://lumikeys.app">Get it first.</a></p>
{rows}
</html>
"""


USAGE = "usage: publish.py [--check | --list | --build ID OUT | --sign-built DIR]"

if __name__ == "__main__":
    args = sys.argv[1:]
    if not args:
        main()
    elif args == ["--check"]:
        main(check=True)
    elif args == ["--list"]:
        # One line for $GITHUB_OUTPUT: the build matrix.
        print("entries=" + json.dumps([e["id"] for e in listed_entries()]))
    elif len(args) == 3 and args[0] == "--build":
        build_one(args[1], Path(args[2]))
    elif len(args) == 2 and args[0] == "--sign-built":
        main(built=Path(args[1]))
    else:
        sys.exit(f"error: {' '.join(args)!r} — {USAGE}")
