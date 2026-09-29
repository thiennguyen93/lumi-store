#!/usr/bin/env python3
"""Build, check, sign and index every listed extension.

The pipeline the README promises, in one file CI and a maintainer's
laptop run identically:

  extensions.toml -> for each entry:
      cargo build --target wasm32-wasip2 (from the pinned submodule)
      pnpm build of the entry's web/ into ui/, when the entry has one
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
  --build ID OUT      validate and build one entry; write OUT/extension.wasm,
                      plus OUT/ui/ for an entry with a web/ build, and
                      nothing else (no key, read-only token, one entry per
                      runner, so one submission's build cannot touch
                      another's output)
  --sign-built DIR    for every listed entry, take DIR/wasm-<id>/extension.wasm
                      (and DIR/wasm-<id>/ui/ for a web entry) and nothing
                      else from the build; pack the manifest and icon from
                      the reviewed source here; sign; index

What a build *compiles* is the one thing that crosses from the untrusted
half — a package whose manifest came out of a build job could have been
rewritten by that build. The wasm is compiled from reviewed Rust; a web
entry's ui/ is compiled from reviewed TypeScript by `pnpm build`, and
crosses on the same terms: the author's code by definition, compiled on a
machine that holds nothing, held here to the installer's alphabet and
ceilings. A plain ui/ — hand-written, no build — is still packed from the
reviewed source, as before. A plain
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
CAPABILITIES = {
    "accessibility", "applications", "clipboard", "clipboard-history", "config", "input", "network",
}
# What Lumi sends through `on-event`, and the capability hearing each costs —
# `manifest::Event::needs`. Checked one way only, as Lumi checks it: an event
# without its capability is refused, the capability alone is not.
EVENTS = {"clipboard": "clipboard-history", "clipboard-ocr": "clipboard-history"}
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
def suggested_key_problem(text):
    """`manifest::suggested_accelerator`'s refusals, word for word: a
    `[[command]] suggested-key` like "cmd+shift+c"."""
    parts = [p.strip().lower() for p in text.split("+")]
    key, mods = parts[-1], parts[:-1]
    known = {"ctrl", "control", "alt", "opt", "option", "shift", "cmd", "command"}
    for part in mods:
        if part not in known:
            return f"the suggested key \"{text}\" has \"{part}\" — use cmd, alt, ctrl and shift"
    ok_key = (
        (len(key) == 1 and (key.isascii() and (key.islower() or key.isdigit())))
        or key == "space"
        or (key.startswith("f") and key[1:].isdigit() and 1 <= int(key[1:]) <= 12)
    )
    if not ok_key:
        return f"the suggested key \"{text}\" ends in \"{key}\" — a letter, a digit, space or F1–F12"
    if not any(m in mods for m in ("ctrl", "control", "alt", "opt", "option", "cmd", "command")):
        return (f"the suggested key \"{text}\" needs cmd, alt or ctrl — a global shortcut without one "
                "would take that key away from typing")
    return None


# A command icon that is not an .svg is a Lucide name: lowercase words and
# digits joined by single hyphens — Lumi's `manifest::command_icon`.
LUCIDE_RE = re.compile(r"^(?=.{1,64}$)[a-z0-9]+(-[a-z0-9]+)*$")
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
# Lumi's `manifest::MAX_PAGES`, `MAX_PAGE_LABEL` and `RESERVED_PAGE_LABELS`:
# how many [[page]] tabs fit, how long a tab's label may be, and the four
# labels that are Lumi's own tabs — Shortcuts is the tab Lumi draws for
# [[shortcut]], reserved whether or not a manifest declares one.
MAX_PAGES = 4
MAX_PAGE_LABEL = 24
RESERVED_PAGE_LABELS = {"about", "settings", "permissions", "shortcuts"}
MAX_ICON = 64 * 1024
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
    for name in ext.get("events", []):
        if name not in EVENTS:
            fail(entry_id, f"unknown event {name!r} — Lumi sends {sorted(EVENTS)}")
        if EVENTS[name] not in ext.get("capabilities", []):
            fail(entry_id, f"hearing {name!r} needs the {EVENTS[name]} capability — add it to capabilities")
    if "clipboard-ocr" in ext.get("events", []) and "clipboard" not in ext.get("events", []):
        fail(entry_id, 'hearing "clipboard-ocr" needs "clipboard" too — the text names a copy the extension has to have heard')
    seen = set()
    for command in manifest.get("command", []):
        name = command.get("name", "")
        if not name.strip():
            fail(entry_id, "a command has no name")
        if name in seen:
            fail(entry_id, f"two commands are named {name}")
        seen.add(name)
        check_params(entry_id, name, command.get("params", []))
        suggested = str(command.get("suggested-key", "")).strip()
        if suggested:
            why = suggested_key_problem(suggested)
            if why:
                fail(entry_id, f"command {name}: {why}")
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
        # `manifest.rs`'s kind and position rules, same sentences.
        kind = str(window.get("kind", "")).strip() or "window"
        if kind not in ("window", "panel"):
            fail(entry_id, f'the window {name} asks for kind {kind!r}; a window is "window" or "panel"')
        position = str(window.get("position", "")).strip()
        # "cursor" is the default, so saying it on a plain window is allowed.
        if position not in ("", "cursor") and kind == "window":
            fail(entry_id, f"the window {name} sets a position, which only a panel has")
        if position not in ("", "cursor", "center"):
            fail(entry_id, f'the panel {name} asks for position {position!r}; a panel opens at "cursor" or "center"')
        # `manifest.rs`'s material rule, same sentences.
        material = str(window.get("material", "")).strip()
        if material and kind == "window":
            fail(entry_id, f"the window {name} sets a material, which only a panel has")
        if material not in ("", "popover", "hud", "sidebar"):
            fail(entry_id, f'the panel {name} asks for material {material!r}; a panel\'s material is "popover", "hud" or "sidebar"')
    check_page_tabs(entry_id, manifest)
    check_shortcuts(entry_id, manifest)
    settings_tab = ext.get("settings-tab", ext.get("settings_tab", True))
    if not isinstance(settings_tab, bool):
        fail(entry_id, f"settings-tab = {settings_tab!r} is not true or false")
    if not settings_tab and str(ext.get("settings-page", ext.get("settings_page", ""))).strip():
        fail(entry_id, "settings-tab = false hides the tab settings-page draws in — leave one of them out")
    for noun, path in declared_pages(manifest):
        if not is_valid_ui_path(path):
            fail(entry_id, f"the {noun} points at {path!r}, which is not a plain relative path")
    install = manifest.get("install")
    if install is not None and not str(install.get("page", "")).strip():
        # Lumi refuses an [install] table with no page rather than
        # ignoring it: somebody wrote the table meaning it to do something.
        fail(entry_id, "the [install] table names no page")
    for command in manifest.get("command", []):
        icon = str(command.get("icon", "")).strip()
        if icon.endswith(".svg"):
            if not is_valid_ui_path(icon):
                fail(entry_id, f"the command {command.get('name')}'s icon points at {icon!r}, which is not a plain relative path")
        elif icon and not LUCIDE_RE.match(icon):
            fail(
                entry_id,
                f"the command {command.get('name')}'s icon {icon!r} is neither a Lucide icon "
                "name (lowercase words joined by '-') nor an .svg file under ui/",
            )
    return ext


def check_shortcuts(entry_id: str, manifest: dict):
    """The [[shortcut]] declarations, held to Lumi's `manifest::parse`: each
    names a [[command]] of this manifest, once, with a key spelled the way
    `suggested-key` is and distinct from every other's; and `shortcuts-tab
    = false` only beside at least one of them, since a tab that would not be
    drawn cannot be hidden."""
    commands = {c.get("name", "") for c in manifest.get("command", [])}
    named, keys = set(), set()
    for shortcut in manifest.get("shortcut", []):
        command = str(shortcut.get("command", "")).strip()
        if not command:
            fail(entry_id, "a [[shortcut]] names no command")
        if command not in commands:
            fail(entry_id, f"a [[shortcut]] names the command {command!r}, which this manifest does not declare")
        if command in named:
            fail(entry_id, f"two [[shortcut]]s name the command {command}")
        named.add(command)
        key = str(shortcut.get("key", "")).strip()
        why = suggested_key_problem(key)
        if why:
            fail(entry_id, f"shortcut for {command}: {why}")
        spelled = "+".join(sorted(p.strip().lower() for p in key.split("+")))
        if spelled in keys:
            fail(entry_id, f"two [[shortcut]]s ask for {key} — one combination runs one command")
        keys.add(spelled)
    ext = manifest.get("extension", {})
    shortcuts_tab = ext.get("shortcuts-tab", ext.get("shortcuts_tab", True))
    if not isinstance(shortcuts_tab, bool):
        fail(entry_id, f"shortcuts-tab = {shortcuts_tab!r} is not true or false")
    if not shortcuts_tab and not manifest.get("shortcut"):
        fail(entry_id, "shortcuts-tab = false hides the tab [[shortcut]] draws in, and this manifest declares none")


def check_page_tabs(entry_id: str, manifest: dict):
    """The [[page]] tabs, held to Lumi's `manifest::parse`: at most
    MAX_PAGES, the window-name alphabet up to 64 characters, a label of at
    most MAX_PAGE_LABEL that is none of Lumi's own three tabs, and no name
    or label twice. The reserved labels are the reach wall — a second
    Permissions tab would be the developer's words beside the list Lumi
    draws — so they are refused here too rather than left to the install."""
    pages = manifest.get("page", [])
    if len(pages) > MAX_PAGES:
        fail(entry_id, f"the manifest declares {len(pages)} pages — {MAX_PAGES} tabs fit beside About, Settings and Permissions")
    names, labels = set(), set()
    for page in pages:
        name = page.get("name", "")
        if not NAME_RE.match(name) or len(name) > 64:
            fail(entry_id, f"page name {name!r} may hold only letters, digits, '-' and '_', up to 64 of them")
        if name in names:
            fail(entry_id, f"two pages are named {name}")
        names.add(name)
        label = str(page.get("label", "")).strip() or name
        if len(label) > MAX_PAGE_LABEL:
            fail(entry_id, f"the page {name}'s label {label!r} is longer than {MAX_PAGE_LABEL} characters")
        if label.lower() in RESERVED_PAGE_LABELS:
            fail(entry_id, f"the page {name} may not be labelled {label!r}: that is one of Lumi's own tabs")
        if label.lower() in labels:
            fail(entry_id, f"two pages are labelled {label!r}")
        labels.add(label.lower())
        for switch in ("focus", "fn-key", "function-keys"):
            if not isinstance(page.get(switch, False), bool):
                fail(entry_id, f"the page {name}'s {switch} = {page.get(switch)!r} is not true or false")


def declared_pages(manifest: dict) -> list:
    """Every ui/ page the manifest names outside [[window]], as (noun, path):
    the extension's own About and Settings pages and its installer. Lumi's
    installer refuses a package naming a page it does not ship — the About
    tab opening on a 404, an Install button that opens nothing — so they are
    held to the window rule here, in both halves: a plain path, and a file
    that is actually there."""
    ext = manifest.get("extension", {})
    pages = []
    about = str(ext.get("about", "")).strip()
    if about:
        pages.append(("about page", about))
    settings_page = str(ext.get("settings-page", ext.get("settings_page", ""))).strip()
    if settings_page:
        pages.append(("settings page", settings_page))
    for page in manifest.get("page", []):
        path = str(page.get("path", "")).strip() or "index.html"
        pages.append((f"page {page.get('name', '')}", path))
    install = manifest.get("install")
    if install is not None:
        page = str(install.get("page", "")).strip()
        if page:
            pages.append(("installer page", page))
    return pages


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


def build_web(entry_id: str, crate: Path, entry: dict) -> Path:
    """An entry's `web = "<dir>"`: a front end written in a framework and
    compiled, the way the Rust is. Reviewers read the TypeScript; the
    bundle Lumi runs is built from exactly that source, here, rather than
    committed — a committed minified bundle is a binary swapped past
    review, which is why the store refused framework front ends until it
    could build them itself.

    The build is held to three things that make it the reviewed build:
    - the lockfile, `--frozen-lockfile`: dependencies are the pinned ones
      the pull request showed, never whatever the registry resolves today;
    - `--ignore-scripts`: no dependency's install script runs, only the
      entry's own `build` script, which is reviewed source;
    - pnpm itself pinned through the `packageManager` field, via corepack,
      so the tool that reads the lockfile is the one that wrote it.
    It still runs the author's build and the build tool's code, which is
    why it happens only in a job that holds nothing (see publish.yml).

    Answers the built tree: `<web>/dist`, the Vite default, copied to a
    fresh directory so nothing from an earlier build survives into this
    one."""
    if not isinstance(entry["web"], str):
        fail(entry_id, "web must be a directory name")
    web = (crate / entry["web"]).resolve()
    # `is_relative_to`, not a string prefix: `ext/a` is a prefix of `ext/ab`.
    if web == crate or not web.is_relative_to(crate):
        fail(entry_id, f"web escapes the extension's directory: {web}")
    for needed in ("package.json", "pnpm-lock.yaml"):
        if not (web / needed).is_file():
            fail(entry_id, f"web/ has no {needed}; a store build installs from the lockfile only")
    with open(web / "package.json", "rb") as f:
        package = json.load(f)
    if not str(package.get("packageManager", "")).startswith("pnpm@"):
        fail(entry_id, 'web/package.json must pin pnpm: "packageManager": "pnpm@<version>"')
    if "build" not in package.get("scripts", {}):
        fail(entry_id, "web/package.json has no build script")
    committed = crate / "ui"
    if committed.exists():
        fail(
            entry_id,
            "ui/ is built from web/ for this entry and must not be committed — "
            "a committed bundle is exactly what the build exists to replace",
        )
    dist = web / "dist"
    if dist.exists():
        import shutil

        shutil.rmtree(dist)
    subprocess.run(["corepack", "pnpm", "install", "--frozen-lockfile", "--ignore-scripts"], cwd=web, check=True)
    subprocess.run(["corepack", "pnpm", "run", "build"], cwd=web, check=True)
    if not dist.is_dir():
        fail(entry_id, "the web build produced no dist/")
    out = BUILD / entry_id / "ui"
    copy_tree(entry_id, dist, out)
    return out


def copy_tree(entry_id: str, source: Path, dest: Path):
    """Copy a built ui/ tree file by file, refusing anything that is not a
    plain file or directory. A symlink here would be packed as a link — or
    followed, reading a file from outside the tree into the package."""
    import shutil

    if dest.exists():
        shutil.rmtree(dest)
    dest.mkdir(parents=True)
    for path in sorted(source.rglob("*")):
        rel = path.relative_to(source)
        if path.is_symlink():
            fail(entry_id, f"the built ui/{rel.as_posix()} is a symlink")
        if path.is_dir():
            (dest / rel).mkdir(parents=True, exist_ok=True)
        elif path.is_file():
            (dest / rel).parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(path, dest / rel)
        else:
            fail(entry_id, f"the built ui/{rel.as_posix()} is not a plain file")


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
        rel = path.relative_to(ui_dir).as_posix()
        # Checked before `is_file`, which follows a link: `gettarinfo` in
        # `pack` would record the link itself, pointing wherever it points.
        if path.is_symlink():
            fail(entry_id, f"ui/{rel} is a symlink; a package holds plain files only")
        if not path.is_file():
            continue
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
    manifest, and the icon that ships beside the wasm. The ui/ is checked
    separately (`check_ui`), once it is known which tree is packed."""
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
    return crate, manifest_path, manifest, ext, icon


def check_ui(entry_id: str, manifest: dict, ui_dir: Path):
    """Windows and pages have to point at files that ship — the same
    cross-check Lumi's installer runs at the stage, made here first. Run
    against the tree that is packed, so for a web entry that is the build's
    output, not the (absent) ui/ in the source."""
    for window in manifest.get("window", []):
        declared = window.get("path", "") or "index.html"
        if not (ui_dir / declared).is_file():
            fail(entry_id, f"window {window.get('name')} points at ui/{declared}, which does not exist")
    for noun, declared in declared_pages(manifest):
        if not (ui_dir / declared).is_file():
            fail(entry_id, f"the {noun} points at ui/{declared}, which does not exist")
    for command in manifest.get("command", []):
        # Not `icon`: that name is the package's icon.svg, returned below.
        mark = str(command.get("icon", "")).strip()
        if mark.endswith(".svg"):
            mark_path = ui_dir / mark
            if not mark_path.is_file():
                fail(entry_id, f"the command {command.get('name')} draws its icon from ui/{mark}, which does not exist")
            # The installer's own ceiling for a command mark, icon.svg's.
            if mark_path.stat().st_size > MAX_ICON:
                fail(entry_id, f"the command {command.get('name')}'s icon ui/{mark} is past {MAX_ICON} bytes")
    ui_members(entry_id, ui_dir)


def ui_of(entry_id: str, entry: dict, crate: Path, manifest: dict) -> Path:
    """The ui/ tree to pack when this process builds: the web build's
    output for a web entry, the reviewed ui/ otherwise. Checked either way."""
    ui_dir = build_web(entry_id, crate, entry) if entry.get("web") else crate / "ui"
    check_ui(entry_id, manifest, ui_dir)
    return ui_dir


def built_ui(entry_id: str, entry: dict, crate: Path, manifest: dict, built: Path) -> Path:
    """`--sign-built`'s ui/: from the build job for a web entry — held to
    the same checks as any ui/ — and from the reviewed source otherwise,
    in which case whatever a build job left beside the wasm is ignored."""
    if not entry.get("web"):
        ui_dir = crate / "ui"
    else:
        ui_dir = built / f"wasm-{entry_id}" / "ui"
        if not ui_dir.is_dir() or ui_dir.is_symlink():
            fail(entry_id, f"the build handed over no ui/ at {ui_dir}")
    check_ui(entry_id, manifest, ui_dir)
    return ui_dir


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
    crate, _, manifest, _, _ = sources(entry)
    wasm = build_wasm(entry_id, crate)
    out.mkdir(parents=True, exist_ok=True)
    (out / "extension.wasm").write_bytes(wasm.read_bytes())
    if entry.get("web"):
        copy_tree(entry_id, ui_of(entry_id, entry, crate, manifest), out / "ui")
    print(f"built {entry_id} into {out}")


def main(check: bool = False, built: "Path | None" = None):
    listed = listed_entries()
    DIST.mkdir(parents=True, exist_ok=True)
    index = []
    for entry in listed:
        entry_id = entry["id"]
        crate, manifest_path, manifest, ext, icon = sources(entry)
        # From a build job when the halves are split, built here when they
        # are not — and in both cases the manifest and icon are packed from
        # the reviewed source by this process.
        if built is None:
            wasm = build_wasm(entry_id, crate)
            ui_dir = ui_of(entry_id, entry, crate, manifest)
        else:
            wasm = built_wasm(entry_id, built)
            ui_dir = built_ui(entry_id, entry, crate, manifest, built)
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
