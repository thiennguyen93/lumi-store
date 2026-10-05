#!/usr/bin/env python3
"""Build, check, sign and index every listed extension.

The pipeline the README promises, in one file CI and a maintainer's
laptop run identically:

  extensions.toml -> for each entry:
      cargo build --target wasm32-wasip2 (from the pinned submodule)
      pnpm build of the entry's web/ into ui/, when the entry has one
      validate manifest.toml (the checks Lumi's installer re-runs)
      validate CHANGELOG.md (a section for the version it ships)
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

  --list              the listed ids, for the build matrix, and the
                      private ones among them (see below)
  --path ID           where an entry's source lives, for a workflow step
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

A `private = true` entry is first-party closed source: a private repo,
pinned as a submodule marked `update = none` in .gitmodules so a plain
recursive checkout skips it, and fetched with a read-only deploy key by
`scripts/fetch-private.sh` in each job that needs it. `--check` skips a
private entry whose source is not there — a fork's pull request gets no
secret to fetch it with — and says so; every other mode fails, because a
store published without it would drop it from the index.

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
import math
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
    # Lumi 1.30: the `screen` interface (capture, and a person's area drag).
    "screen",
    # Lumi 1.31: the `snippets` interface (is this text a trigger; expand it).
    "snippets",
    # Lumi 1.33: the `menu` interface (rows of its own in the menu bar menu).
    "menu",
}
# What Lumi sends through `on-event`, and the capability hearing each costs —
# `manifest::Event::needs`, `None` for one that costs none. Checked one way
# only, as Lumi checks it: an event without its capability is refused, the
# capability alone is not.
EVENTS = {
    "clipboard": "clipboard-history",
    "clipboard-ocr": "clipboard-history",
    # Lumi 1.36: Lumi taking a picture of the screen for itself (Copy Text
    # from Screen), at its start and its end.
    "screen-capture": "screen",
    # Lumi 1.37: one of the extension's own windows leaving the screen for
    # good. Only about its own window, so no capability.
    "window-closed": None,
}
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
# `ext::manifest`'s MAX_FOLDERS, MAX_FOLDER_NAME and MAX_FOLDER_LABEL.
# `ext::manifest::PanelPosition::parse`'s words.
PANEL_POSITIONS = ("", "cursor", "center", "top-left", "top-right", "bottom-left", "bottom-right")
MAX_FOLDERS = 8
MAX_FOLDER_NAME = 64
MAX_FOLDER_LABEL = 60
# Lumi's own tabs (`ext::manifest::BuiltinTab`), word → default label. One
# table, as in Lumi: `[tabs.<word>]` may rename, hide or page any of them,
# and every default label is reserved from a [[page]]. A tab Lumi adds is a
# line here.
BUILTIN_TABS = {
    "about": "About",
    "settings": "Settings",
    "shortcuts": "Shortcuts",
    "changelog": "Changelog",
}
RESERVED_PAGE_LABELS = {label.lower() for label in BUILTIN_TABS.values()} | {"permissions"}
MAX_ICON = 64 * 1024
# The store's shelves: an entry's `category` in extensions.toml is one of
# these, and Lumi's Extension Store filters Discover by them. The store's
# word rather than the author's, like `featured` — both are decided in
# review, which is why neither is a manifest key.
CATEGORIES = ["Productivity", "Writing", "Windows", "Design", "Developer", "Utilities"]
# `[extension] screenshots`: a few pictures for the extension's page in
# Lumi's Extension Store. Store-only — Lumi's manifest reader ignores the
# key — so the ceilings are the store's: few enough to download on a
# page open, small enough that Lumi can hand each one to its webview
# inline (it serves them as data: URIs; the CSP takes no remote images).
MAX_SCREENSHOTS = 4
MAX_SCREENSHOT = 1024 * 1024
SCREENSHOT_KINDS = {b"\x89PNG\r\n\x1a\n": "png", b"\xff\xd8\xff": "jpg"}
# `STORE.md` beside the manifest: the longer words for the extension's
# page in Lumi's Extension Store, in the small markdown Lumi draws
# (headings, lists, emphasis, code, https links). Store-only, like the
# screenshots — Lumi's installer never reads it. Lumi downloads it on a
# page open, so it is held to a page's worth of text.
MAX_DETAILS = 16 * 1024
# `CHANGELOG.md` beside the manifest: required, one `## <version>` section
# per release, the newest on top and equal to the manifest's `version` —
# so a bump without notes, or notes without a bump, fails the PR. The
# author's words, for developers; store-only like STORE.md. The source
# keeps the whole history; the store publishes the newest few, since Lumi
# downloads them on a page open.
MAX_CHANGELOG_SOURCE = 256 * 1024
MAX_CHANGE_NOTES = 4 * 1024
MAX_CHANGES = 32 * 1024
MAX_CHANGES_VERSIONS = 20
# The headings Keep a Changelog, release-please, git-cliff and changesets
# write, so whatever an author already uses is accepted as it is:
# `## 1.2.0`, `## v1.2.0`, `## [1.2.0] - 2026-09-30`,
# `## [1.2.0](https://…) (2026-09-30)`, `## 1.2.0 (2026-09-30)`.
VERSION_HEADING_RE = re.compile(
    r"^##\s+\[?v?(?P<version>[0-9][^\]\s()]*)\]?(?:\([^)]*\))?"
    r"(?:\s+(?:[-–—]\s*)?\(?(?P<date>[^)\s]+)\)?)?\s*$"
)
UNRELEASED_HEADING_RE = re.compile(r"^##\s+\[?unreleased\]?\s*$", re.IGNORECASE)
SEMVER_RE = re.compile(r"^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z.-]+))?$")
DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
# `release-notes/<id>.json` at the root: the store's own short summary of
# each version, in English and Vietnamese, for Lumi's update list and the
# website. The store's words rather than the author's, like `category` —
# proposed as a PR after a release merges, edited there like any other
# file. The shape is Lumi's "What's new" envelope (`lumi_notes`), so one
# reader serves both; the limits are that reader's.
RELEASE_NOTES_DIR = ROOT / "release-notes"
SUMMARY_ENVELOPE = 1
SUMMARY_LOCALES = ["en", "vi"]
MAX_SUMMARY_HEADLINE = 70
MAX_SUMMARY_ITEM = 110
MAX_SUMMARY_ITEMS = 6
# Plain sentences only: the reader draws each field as text, and anything
# that looks like markup or a link is a summary that quoted its input.
SUMMARY_NOT_PLAIN = [
    (re.compile(r"https?://|\]\("), "a link"),
    (re.compile(r"<[a-z/][^>]*>", re.IGNORECASE), "an HTML tag"),
    (re.compile(r"\*\*|`|^#|^[-*•]\s"), "markdown formatting"),
]
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
        if EVENTS[name] is not None and EVENTS[name] not in ext.get("capabilities", []):
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
        if position not in PANEL_POSITIONS:
            fail(
                entry_id,
                f'the panel {name} asks for position {position!r}; a panel opens at "cursor", "center", '
                '"top-left", "top-right", "bottom-left" or "bottom-right"',
            )
        # `manifest.rs`'s focus rule: a panel's alone, and a boolean.
        if "focus" in window:
            if kind == "window":
                fail(entry_id, f"the window {name} sets focus, which only a panel has — a window always takes the keyboard")
            if not isinstance(window["focus"], bool):
                fail(entry_id, f"the panel {name}'s focus = {window['focus']!r} is not true or false")
        # `manifest.rs`'s capturable rule: a window's alone, and a boolean.
        if "capturable" in window:
            if kind == "panel":
                fail(entry_id, f"the panel {name} sets capturable, which only a window has — Lumi's captures leave every panel out already")
            if not isinstance(window["capturable"], bool):
                fail(entry_id, f"the window {name}'s capturable = {window['capturable']!r} is not true or false")
        # `manifest.rs`'s material rule, same sentences.
        material = str(window.get("material", "")).strip()
        if material and kind == "window":
            fail(entry_id, f"the window {name} sets a material, which only a panel has")
        if material not in ("", "popover", "hud", "sidebar", "clear"):
            fail(entry_id, f'the panel {name} asks for material {material!r}; a panel\'s material is "popover", "hud", "sidebar" or "clear"')
        # `manifest.rs`'s title bar rule, same sentences.
        titlebar = str(window.get("titlebar", "")).strip()
        if titlebar == "unified" and kind == "panel":
            fail(entry_id, f"the panel {name} asks for a unified title bar; a panel has no title bar to unify")
        if titlebar not in ("", "standard", "unified"):
            fail(entry_id, f'the window {name} asks for titlebar {titlebar!r}; a title bar is "standard" or "unified"')
        if "titlebar-height" in window and titlebar != "unified":
            fail(entry_id, f"the window {name} sets a titlebar-height, which only a unified title bar has")
        # `manifest.rs`'s min_size rule: a floor clamped as the size is, and
        # never above the size the window opens at, same sentences.
        for side, default, least, most in (("width", 480.0, 240.0, 1600.0), ("height", 360.0, 180.0, 1200.0)):
            key = f"min-{side}"
            if key not in window:
                continue
            asked = window[key]
            if isinstance(asked, bool) or not isinstance(asked, (int, float)) or not math.isfinite(asked) or asked <= 0:
                fail(entry_id, f"the window {name}'s {key} is not a size in points")
            raw = window.get(side, 0)
            size = default if not isinstance(raw, (int, float)) or isinstance(raw, bool) or not math.isfinite(raw) or raw <= 0 else min(max(raw, least), most)
            floor = min(max(asked, least), most)
            if floor > size:
                fail(entry_id, f"the window {name}'s {key} ({floor:g}) is more than its {side} ({size:g}); it would open smaller than it may be made")
    check_page_tabs(entry_id, manifest)
    check_shortcuts(entry_id, manifest)
    check_tabs(entry_id, manifest)
    check_folders(entry_id, manifest)
    for noun, path in declared_pages(entry_id, manifest):
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


KNOWN_FOLDERS = ("pictures",)


def check_folders(entry_id: str, manifest: dict):
    """The [[folder]] declarations, held to Lumi's `manifest::parse`: a name
    in the window alphabet of at most MAX_FOLDER_NAME, said once; a label —
    required, since it is the review sheet's whole sentence about the
    folder — of one line of at most MAX_FOLDER_LABEL; at most MAX_FOLDERS.
    No path is a field at all: the person chooses the folder, in Lumi."""
    folders = manifest.get("folder", [])
    names = set()
    for folder in folders:
        name = folder.get("name", "")
        if not isinstance(name, str) or not NAME_RE.match(name) or len(name) > MAX_FOLDER_NAME:
            fail(entry_id, f"folder name {name!r} may hold only letters, digits, '-' and '_', up to {MAX_FOLDER_NAME} of them")
        if name in names:
            fail(entry_id, f"two folders are named {name}")
        names.add(name)
        label = str(folder.get("label", "")).strip()
        if not label:
            fail(entry_id, f"the folder {name} has no label — say what it is for, such as \"Save screenshots to\"")
        if len(label) > MAX_FOLDER_LABEL or any(ord(c) < 32 or ord(c) == 127 for c in label):
            fail(entry_id, f"the folder {name}'s label is one line of at most {MAX_FOLDER_LABEL} characters")
        # `manifest::KnownFolder`: one of macOS's own, never a path, and never
        # one macOS guards.
        default = str(folder.get("default", "")).strip()
        if default and default not in KNOWN_FOLDERS:
            fail(entry_id, f'the folder {name} defaults to {default!r}; a folder\'s default is "pictures" — or leave it out and the person chooses')
    if len(folders) > MAX_FOLDERS:
        fail(entry_id, f"the manifest declares {len(folders)} folders; at most {MAX_FOLDERS}")


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


def check_tabs(entry_id: str, manifest: dict):
    """`[tabs.<name>]` and the older keys that say the same things, held to
    Lumi's `manifest::tabs` — one set of rules asked of every one of Lumi's
    tabs, in the same order and the same sentences, so a tab Lumi adds is a
    line in BUILTIN_TABS and nothing here. Returns `{word: {label, page,
    hidden}}` for `declared_pages`."""
    ext = manifest.get("extension", {})
    raw = manifest.get("tabs", {})
    if not isinstance(raw, dict):
        fail(entry_id, "tabs is a table of tables: [tabs.changelog], [tabs.settings], …")
    tabs = {word: {"label": label, "page": None, "hidden": False} for word, label in BUILTIN_TABS.items()}
    spelled = {word: {"page": None, "hidden": None} for word in BUILTIN_TABS}
    offered = ", ".join(list(BUILTIN_TABS)[:-1]) + " and " + list(BUILTIN_TABS)[-1]

    def ui_path(key, path):
        if not is_valid_ui_path(path):
            fail(entry_id, f"{key} points at {path!r}, which is not a plain relative path into ui/")
        return path

    for word, table in raw.items():
        if word not in BUILTIN_TABS:
            fail(entry_id, f"[tabs.{word}] is not one of Lumi's tabs — {offered} are")
        if not isinstance(table, dict):
            fail(entry_id, f"[tabs.{word}] is a table")
        key = f"[tabs.{word}]"
        label = str(table.get("label", "")).strip()
        if label:
            if len(label) > MAX_PAGE_LABEL:
                fail(entry_id, f"{key} label {label!r} is longer than {MAX_PAGE_LABEL} characters — it is a tab, and a tab holds a word or two")
            if label.lower() in RESERVED_PAGE_LABELS and label.lower() != BUILTIN_TABS[word].lower():
                fail(entry_id, f"{key} may not be labelled {label!r}: that is the name of another of Lumi's tabs, and Permissions is always Lumi's")
            tabs[word]["label"] = label
        page = str(table.get("page", "")).strip()
        if page:
            tabs[word]["page"] = ui_path(f"{key} page", page)
            spelled[word]["page"] = f"{key} page"
        if "hidden" in table:
            if not isinstance(table["hidden"], bool):
                fail(entry_id, f"{key} hidden = {table['hidden']!r} is not true or false")
            tabs[word]["hidden"] = table["hidden"]
            spelled[word]["hidden"] = f"{key} hidden"

    # The older spellings, each saying one thing a [tabs] field says.
    for word, keys in (("about", ("about",)), ("settings", ("settings-page", "settings_page"))):
        key = keys[0]
        value = next((str(ext[k]).strip() for k in keys if k in ext), "")
        if not value:
            continue
        if spelled[word]["page"]:
            fail(entry_id, f"{key} and {spelled[word]['page']} both name the {BUILTIN_TABS[word]} tab's page — keep one")
        tabs[word]["page"] = ui_path(key, value)
        spelled[word]["page"] = key
    for word, keys in (("settings", ("settings-tab", "settings_tab")), ("shortcuts", ("shortcuts-tab", "shortcuts_tab"))):
        key = keys[0]
        present = [k for k in keys if k in ext]
        if not present:
            continue
        shown = ext[present[0]]
        if not isinstance(shown, bool):
            fail(entry_id, f"{key} = {shown!r} is not true or false")
        if spelled[word]["hidden"]:
            fail(entry_id, f"{key} and {spelled[word]['hidden']} both say whether the {BUILTIN_TABS[word]} tab is drawn — keep one")
        tabs[word]["hidden"] = not shown
        spelled[word]["hidden"] = f"{key} = {'true' if shown else 'false'}"

    for word, decl in tabs.items():
        if not decl["hidden"]:
            continue
        hidden_key = spelled[word]["hidden"] or f"[tabs.{word}] hidden"
        if word == "about":
            fail(entry_id, f"{hidden_key}: the About tab cannot be hidden — it is where an extension's page opens when every other tab is gone")
        if spelled[word]["page"]:
            fail(entry_id, f"{hidden_key} hides the tab {spelled[word]['page']} draws in — leave one of them out")
        # Only the Shortcuts tab can be known empty from the manifest alone.
        if word == "shortcuts" and not manifest.get("shortcut"):
            fail(entry_id, f"{hidden_key} hides the {BUILTIN_TABS[word]} tab, and this manifest gives Lumi nothing to draw in it")

    # `default = true`: the one tab the page opens on, held to Lumi's rule
    # — one in the whole page, [[page]]s included, and never a tab the
    # manifest itself takes away.
    defaults = []
    for page in manifest.get("page", []):
        if "default" in page:
            if not isinstance(page["default"], bool):
                fail(entry_id, f"the page {page.get('name', '')}'s default = {page['default']!r} is not true or false")
            if page["default"]:
                defaults.append(f"the page {page.get('name', '')}")
    for word in BUILTIN_TABS:
        table = raw.get(word, {})
        if "default" not in table:
            continue
        key = f"[tabs.{word}] default"
        if not isinstance(table["default"], bool):
            fail(entry_id, f"{key} = {table['default']!r} is not true or false")
        if not table["default"]:
            continue
        if tabs[word]["hidden"]:
            fail(entry_id, f"{key} opens the page on the {BUILTIN_TABS[word]} tab, which this manifest hides")
        if word == "shortcuts" and not tabs[word]["page"] and not manifest.get("shortcut"):
            fail(entry_id, f"{key} opens the page on the {BUILTIN_TABS[word]} tab, and this manifest gives Lumi nothing to draw in it")
        defaults.append(key)
    if len(defaults) > 1:
        fail(entry_id, f"{defaults[0]} and {defaults[1]} both say default = true — a page opens on one tab, keep one")

    seen = [str(page.get("label", "")).strip() or page.get("name", "") for page in manifest.get("page", [])]
    seen = [label.lower() for label in seen]
    for decl in tabs.values():
        if decl["hidden"]:
            continue
        if decl["label"].lower() in seen:
            fail(entry_id, f"two tabs are labelled {decl['label']!r}")
        seen.append(decl["label"].lower())
    return tabs


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


def declared_pages(entry_id: str, manifest: dict) -> list:
    """Every ui/ page the manifest names outside [[window]], as (noun, path):
    a page drawn in one of Lumi's tabs, each [[page]], and the installer.
    Lumi's installer refuses a package naming a page it does not ship — a
    tab opening on a 404, an Install button that opens nothing — so they are
    held to the window rule here, in both halves: a plain path, and a file
    that is actually there. The tabs are read through `check_tabs`, so the
    older keys and [tabs] land in one list."""
    pages = []
    for word, decl in check_tabs(entry_id, manifest).items():
        if decl["page"]:
            pages.append((f"{BUILTIN_TABS[word]} tab's page", decl["page"]))
    for page in manifest.get("page", []):
        path = str(page.get("path", "")).strip() or "index.html"
        pages.append((f"page {page.get('name', '')}", path))
    install = manifest.get("install")
    if install is not None:
        page = str(install.get("page", "")).strip()
        if page:
            pages.append(("installer page", page))
    return pages


def build_wasm(entry_id: str, crate: Path, private: bool = False) -> Path:
    """The entry's wasm, built from its source. A private entry's
    diagnostics are one line each (`--message-format=short`): the build
    runs in a public repository's Actions, whose logs anyone can read, and
    rustc's own format quotes the source lines a warning or an error is
    about — the closed source, a few lines at a time."""
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
            *(["--message-format=short"] if private else []),
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


def without_comments(entry_id: str, text: str) -> bytes:
    """A manifest with its comments taken out, for a private entry's
    package. The package is public — anybody can unpack it — and a
    manifest's comments are its author's notes on the source, which for a
    closed-source entry stays closed.

    Every `#` outside a string starts a comment that runs to the end of its
    line: basic, literal and multi-line strings are read past, so `"#378add"`
    keeps its `#`. A line that was only a comment goes, and runs of blank
    lines close up to one; inside a multi-line string nothing is touched.
    Held to the source afterwards: the result must parse to the same
    document, or the pack fails rather than ship a manifest that says
    something else."""
    lines = []  # (text, inside a multi-line string at its start, a comment came off it)
    line: list = []
    protected = cut = False
    state = None  # the open string's delimiter, or None
    at, end = 0, len(text)
    while at < end:
        c = text[at]
        if c == "\n":
            lines.append(("".join(line), protected, cut))
            line, cut = [], False
            protected = state in ('"""', "'''")
            at += 1
        elif state is None:
            if c == "#":
                while at < end and text[at] != "\n":
                    at += 1
                while line and line[-1] in " \t":
                    line.pop()
                cut = True
                continue
            state = next((q for q in ('"""', "'''", '"', "'") if text.startswith(q, at)), None)
            taken = len(state) if state else 1
            line.append(text[at : at + taken])
            at += taken
        elif c == "\\" and state in ('"', '"""'):
            line.append(text[at : at + 2])
            at += 2
        elif text.startswith(state, at):
            # A multi-line string may end with up to two quotes of its own
            # before its closing three.
            taken = len(state)
            while len(state) == 3 and taken < 5 and text.startswith(state[0], at + taken):
                taken += 1
            line.append(text[at : at + taken])
            at += taken
            state = None
        else:
            line.append(c)
            at += 1
    lines.append(("".join(line), protected, cut))

    kept: list = []
    for content, inside, was_cut in lines:
        blank = not inside and content.strip() == ""
        if blank and (was_cut or not kept or kept[-1] == ""):
            continue
        kept.append("" if blank else content)
    while kept and kept[-1] == "":
        kept.pop()
    bare = "\n".join(kept) + "\n"
    if tomllib.loads(bare) != tomllib.loads(text):
        fail(entry_id, "manifest.toml reads differently with its comments taken out; the package is not packed")
    return bare.encode("utf-8")


def pack(
    entry_id: str,
    manifest_path: Path,
    wasm_path: Path,
    icon_path,
    ui_dir: Path,
    strip_comments: bool = False,
) -> bytes:
    """A reproducible tarball: fixed metadata, fixed order, no gzip
    timestamp — an unchanged extension republished is identical bytes,
    so mirrors and caches can compare instead of guessing.

    `CHANGELOG.md` rides in the package as well as being published beside
    it: Lumi's Changelog tab reads the installed copy's, so it says what
    that Mac has and needs neither the store nor the network. It is the
    reviewed source's file, already held to `changelog_of` before this
    runs; a Lumi older than the tab ignores the member.

    `strip_comments`: a private entry's manifest goes in without its
    comments (`without_comments`)."""
    buffer = io.BytesIO()
    members = [("manifest.toml", manifest_path)]
    if icon_path is not None:
        members.append(("icon.svg", icon_path))
    changelog = manifest_path.parent / "CHANGELOG.md"
    if changelog.is_file():
        members.append(("CHANGELOG.md", changelog))
    members.extend(ui_members(entry_id, ui_dir))
    members.append(("extension.wasm", wasm_path))
    with tarfile.open(fileobj=buffer, mode="w") as tar:
        for arcname, path in members:
            info = tar.gettarinfo(path, arcname=arcname)
            info.uid = info.gid = 0
            info.uname = info.gname = ""
            info.mtime = 0
            info.mode = 0o644
            if arcname == "manifest.toml" and strip_comments:
                data = without_comments(entry_id, path.read_text(encoding="utf-8"))
                info.size = len(data)
                tar.addfile(info, io.BytesIO(data))
                continue
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
        category = entry.get("category", "")
        if category not in CATEGORIES:
            fail(entry_id, f"category {category!r} is not one of the store's: {', '.join(CATEGORIES)}")
        if not isinstance(entry.get("featured", False), bool):
            fail(entry_id, "featured is true or false")
        if not isinstance(entry.get("private", False), bool):
            fail(entry_id, "private is true or false")
    return listed


def fetched(entry: dict) -> bool:
    """Whether a private entry's source is checked out. A submodule
    `update = none` leaves an empty directory behind, so the manifest is
    the test."""
    return (ROOT / entry["path"] / entry.get("subdir", ".") / "manifest.toml").is_file()


def require_fetched(entry: dict):
    if entry.get("private") and not fetched(entry):
        fail(
            entry["id"],
            "private source is not checked out; scripts/fetch-private.sh fetches it "
            "with the deploy key, and publishing without it would drop it from the store",
        )


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


def published(entry_id: str, data: bytes, ext: str) -> str:
    """`data` written into the output as `<id>-<sha256[:12]>.<ext>`, and
    its URL: a name that changes whenever the bytes do."""
    name = f"{entry_id}-{hashlib.sha256(data).hexdigest()[:12]}.{ext}"
    (DIST / name).write_bytes(data)
    return f"{BASE_URL}/{name}"


def screenshots_of(entry_id: str, crate: Path, ext: dict) -> list:
    """`[extension] screenshots`, as (path, kind) pairs, read from the
    reviewed crate — never from a web build's output, the way icon.svg is
    read. Held to the store's ceilings and to what the bytes actually are,
    not to what the file is called."""
    declared = ext.get("screenshots", [])
    if not isinstance(declared, list) or not all(isinstance(one, str) for one in declared):
        fail(entry_id, "screenshots is a list of paths")
    if len(declared) > MAX_SCREENSHOTS:
        fail(entry_id, f"{len(declared)} screenshots; the store shows at most {MAX_SCREENSHOTS}")
    shots = []
    for declared_path in declared:
        if not is_valid_ui_path(declared_path):
            fail(entry_id, f"the screenshot {declared_path!r} is not a plain relative path")
        path = crate / declared_path
        if not path.is_file() or path.is_symlink():
            fail(entry_id, f"the screenshot {declared_path} does not exist")
        size = path.stat().st_size
        if size > MAX_SCREENSHOT:
            fail(entry_id, f"the screenshot {declared_path} is {size} bytes; the store takes {MAX_SCREENSHOT}")
        with open(path, "rb") as f:
            head = f.read(8)
        kind = next((k for magic, k in SCREENSHOT_KINDS.items() if head.startswith(magic)), None)
        if kind is None:
            fail(entry_id, f"the screenshot {declared_path} is not a PNG or a JPEG")
        shots.append((path, kind))
    return shots


def store_text(entry_id: str, path: Path, most: int):
    """A store-only text file's contents, or None when it is absent. Text
    a page will draw, so it is held to being text: a plain file, UTF-8,
    no NUL, under the ceiling."""
    name = path.name
    if not path.exists():
        return None
    if not path.is_file() or path.is_symlink():
        fail(entry_id, f"{name} is not a plain file")
    data = path.read_bytes()
    if len(data) > most:
        fail(entry_id, f"{name} is {len(data)} bytes; the store takes {most}")
    try:
        text = data.decode("utf-8")
    except UnicodeDecodeError:
        fail(entry_id, f"{name} is not UTF-8")
    if "\x00" in text:
        fail(entry_id, f"{name} has a NUL byte in it")
    return text


def details_of(entry_id: str, crate: Path):
    """`STORE.md`'s bytes, from the reviewed crate, or None when it has
    none."""
    text = store_text(entry_id, crate / "STORE.md", MAX_DETAILS)
    if text is None:
        return None
    if not text.strip():
        fail(entry_id, "STORE.md is empty; leave it out instead")
    return text.encode("utf-8")


def semver_key(version: str):
    """A version as something that sorts the way versions do: numerically
    by part, and a pre-release before its release. Only for versions
    `SEMVER_RE` accepted."""
    major, minor, patch, pre = SEMVER_RE.match(version).groups()
    tail = (1,) if pre is None else (0, *((0, int(p)) if p.isdigit() else (1, p) for p in pre.split(".")))
    return (int(major), int(minor), int(patch), tail)


def parse_changelog(text: str) -> list:
    """`CHANGELOG.md` as `[{version, date, notes}]`, newest first, each
    `notes` the section's markdown between its heading and the next.
    What sits above the first `##` (a title, a preface) and an Unreleased
    section are not releases and are left out. Raises ValueError with a
    sentence naming the line, for `changelog_of` to report."""
    releases = []
    current = None
    for number, line in enumerate(text.replace("\r\n", "\n").split("\n"), 1):
        if not line.startswith("## ") and line.rstrip() != "##":
            if current is not None:
                current["lines"].append(line)
            continue
        if UNRELEASED_HEADING_RE.match(line):
            current = {"lines": []}  # read and dropped
            continue
        heading = VERSION_HEADING_RE.match(line)
        if not heading:
            raise ValueError(f"line {number}: {line.strip()!r} is not a version heading (`## 1.2.0`) or `## Unreleased`")
        version, date = heading["version"], heading["date"] or ""
        if not SEMVER_RE.match(version):
            raise ValueError(f"line {number}: {version!r} is not a version like 1.2.0")
        if date and not DATE_RE.match(date):
            raise ValueError(f"line {number}: {date!r} is not a date like 2026-09-30")
        current = {"version": version, "date": date, "lines": [], "line": number}
        releases.append(current)
    if not releases:
        raise ValueError("it has no `## <version>` section")
    out = []
    for release in releases:
        notes = "\n".join(release["lines"]).strip("\n").rstrip()
        where = f"line {release['line']}: {release['version']}"
        if not notes.strip():
            raise ValueError(f"{where} has no notes under it")
        if len(notes.encode("utf-8")) > MAX_CHANGE_NOTES:
            raise ValueError(f"{where} is {len(notes.encode('utf-8'))} bytes; a version's notes are at most {MAX_CHANGE_NOTES}")
        if out and semver_key(release["version"]) >= semver_key(out[-1]["version"]):
            raise ValueError(f"{where} is not older than {out[-1]['version']} above it; newest goes first, each once")
        out.append({"version": release["version"], "date": release["date"], "notes": notes})
    return out


def changelog_of(entry_id: str, crate: Path, version: str) -> list:
    """`CHANGELOG.md` from the reviewed crate, required, parsed, and with
    its newest section for the version the manifest ships."""
    text = store_text(entry_id, crate / "CHANGELOG.md", MAX_CHANGELOG_SOURCE)
    if text is None:
        fail(entry_id, "no CHANGELOG.md beside the manifest; every release needs a `## <version>` section there (README: Release notes)")
    try:
        releases = parse_changelog(text)
    except ValueError as why:
        fail(entry_id, f"CHANGELOG.md: {why}")
    if releases[0]["version"] != version:
        fail(entry_id, f"CHANGELOG.md's newest section is {releases[0]['version']}, the manifest ships {version}; "
                       "add the notes for this version on top (`python3 scripts/changelog.py draft <id>` starts one)")
    return releases


def discussion_of(entry_id: str):
    """`{number, url}` of the entry's GitHub Discussion, from the
    DISCUSSIONS variable `discussions.py` fills in CI, or None — on a
    laptop, in a check, or when that job failed. Lumi hides the hearts
    for None rather than show a zero it cannot know."""
    listed = json.loads(os.environ.get("DISCUSSIONS") or "{}")
    return listed.get(entry_id)


def notes_sha256(notes: str) -> str:
    """What a summary is pinned to: a version's notes, byte for byte. An
    edited section leaves its old summary unshown until it is redone."""
    return hashlib.sha256(notes.encode("utf-8")).hexdigest()


def check_summary(summary) -> list:
    """What is wrong with one version's summary envelope, as sentences;
    empty when nothing is."""
    if not isinstance(summary, dict) or summary.get("lumi_notes") != SUMMARY_ENVELOPE:
        return [f"summary is not a lumi_notes {SUMMARY_ENVELOPE} envelope"]
    locales = summary.get("locales")
    if not isinstance(locales, dict) or set(summary) != {"lumi_notes", "locales"}:
        return ["summary holds lumi_notes and locales, nothing else"]
    problems = []
    if sorted(locales) != sorted(SUMMARY_LOCALES):
        problems.append(f"summary locales are {sorted(locales)}; the store writes {SUMMARY_LOCALES}")
    for locale in SUMMARY_LOCALES:
        entry = locales.get(locale)
        if not isinstance(entry, dict) or set(entry) != {"headline", "items"}:
            problems.append(f"{locale}: holds a headline and items, nothing else")
            continue
        headline, items = entry["headline"], entry["items"]
        fields = [("headline", headline, MAX_SUMMARY_HEADLINE)]
        if not isinstance(items, list) or not 1 <= len(items) <= MAX_SUMMARY_ITEMS:
            problems.append(f"{locale}: items is a list of 1 to {MAX_SUMMARY_ITEMS}")
        else:
            fields += [(f"item {n}", item, MAX_SUMMARY_ITEM) for n, item in enumerate(items, 1)]
        for what, value, most in fields:
            if not isinstance(value, str) or not value.strip():
                problems.append(f"{locale}: {what} is empty")
                continue
            if len(value) > most:
                problems.append(f"{locale}: {what} is {len(value)} characters; at most {most}")
            for pattern, kind in SUMMARY_NOT_PLAIN:
                if pattern.search(value):
                    problems.append(f"{locale}: {what} has {kind} in it; plain sentences only")
    return problems


def summaries_of(entry_id: str, releases: list) -> dict:
    """`release-notes/<id>.json`: `{version: {notesSha256, summary}}`, or
    an empty map before the first one is written. The store's own file,
    but edited by hand in review, so held to its shape here — and to
    versions the changelog still has, so it cannot collect strays."""
    text = store_text(entry_id, RELEASE_NOTES_DIR / f"{entry_id}.json", MAX_CHANGES * 4)
    if text is None:
        return {}
    try:
        stored = json.loads(text)
    except json.JSONDecodeError as why:
        fail(entry_id, f"release-notes/{entry_id}.json is not JSON: {why}")
    if not isinstance(stored, dict):
        fail(entry_id, f"release-notes/{entry_id}.json maps versions to summaries")
    for version, one in stored.items():
        where = f"release-notes/{entry_id}.json: {version}"
        if version not in {release["version"] for release in releases}:
            fail(entry_id, f"{where} is not a version in CHANGELOG.md")
        if not isinstance(one, dict) or set(one) != {"notesSha256", "summary"}:
            fail(entry_id, f"{where} holds notesSha256 and summary, nothing else")
        if not re.fullmatch(r"[0-9a-f]{64}", str(one["notesSha256"])):
            fail(entry_id, f"{where}: notesSha256 is a sha256 in hex")
        problems = check_summary(one["summary"])
        if problems:
            fail(entry_id, f"{where}: " + "; ".join(problems))
    return stored


def changes_json(releases: list, summaries: dict) -> bytes:
    """The published history: the newest releases that fit, each with the
    hash of its notes and the store's summary when it was written for
    exactly those notes — `null` otherwise, and readers show the notes.
    Same bytes for the same input, so its content-hashed name only moves
    when something in it does."""
    out = []
    for release in releases[:MAX_CHANGES_VERSIONS]:
        sha = notes_sha256(release["notes"])
        stored = summaries.get(release["version"])
        summary = stored["summary"] if stored and stored["notesSha256"] == sha else None
        out.append({**release, "notesSha256": sha, "summary": summary})
    def encode(items):
        return (json.dumps(items, ensure_ascii=False, indent=1) + "\n").encode("utf-8")
    # Oldest dropped first; the newest always stays (it is at most
    # MAX_CHANGE_NOTES plus a summary, well under the ceiling).
    while len(out) > 1 and len(encode(out)) > MAX_CHANGES:
        out.pop()
    return encode(out)


def check_ui(entry_id: str, manifest: dict, ui_dir: Path):
    """Windows and pages have to point at files that ship — the same
    cross-check Lumi's installer runs at the stage, made here first. Run
    against the tree that is packed, so for a web entry that is the build's
    output, not the (absent) ui/ in the source."""
    for window in manifest.get("window", []):
        declared = window.get("path", "") or "index.html"
        if not (ui_dir / declared).is_file():
            fail(entry_id, f"window {window.get('name')} points at ui/{declared}, which does not exist")
    for noun, declared in declared_pages(entry_id, manifest):
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
    require_fetched(entry)
    crate, _, manifest, _, _ = sources(entry)
    wasm = build_wasm(entry_id, crate, bool(entry.get("private")))
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
        if check and entry.get("private") and not fetched(entry):
            print(f"{entry_id}: skipped — private source not available (no deploy key, as on a fork's pull request)")
            continue
        require_fetched(entry)
        crate, manifest_path, manifest, ext, icon = sources(entry)
        # Before anything is built: a missing or out-of-step changelog is
        # the cheapest thing to tell a PR about.
        releases = changelog_of(entry_id, crate, ext["version"])
        summaries = summaries_of(entry_id, releases)
        # From a build job when the halves are split, built here when they
        # are not — and in both cases the manifest and icon are packed from
        # the reviewed source by this process.
        if built is None:
            wasm = build_wasm(entry_id, crate, bool(entry.get("private")))
            ui_dir = ui_of(entry_id, entry, crate, manifest)
        else:
            wasm = built_wasm(entry_id, built)
            ui_dir = built_ui(entry_id, entry, crate, manifest, built)
        package = pack(entry_id, manifest_path, wasm, icon, ui_dir, strip_comments=bool(entry.get("private")))
        package_name = f"{entry_id}-{ext['version']}.tar.gz"
        package_path = DIST / package_name
        package_path.write_bytes(package)
        # A check has no key to sign with, by design: the job a pull
        # request runs is the one a submission's build script runs in.
        if not check:
            sign(entry_id, package_path)

        # The pictures, the page's text and the icon, beside the package,
        # each named by its content rather than the version: they change
        # without a bump, and what serves them caches a file for a year, so
        # a changed one needs a new name of its own.
        shot_urls = [
            published(entry_id, shot.read_bytes(), kind)
            for shot, kind in screenshots_of(entry_id, crate, ext)
        ]
        details = details_of(entry_id, crate)
        details_url = published(entry_id, details, "md") if details is not None else ""
        icon_url = published(entry_id, icon.read_bytes(), "svg") if icon is not None else ""
        changelog_url = published(entry_id, changes_json(releases, summaries), "json")
        if check:
            newest = releases[0]
            summarized = summaries.get(newest["version"], {}).get("notesSha256") == notes_sha256(newest["notes"])
            print(f"{entry_id} {newest['version']}: what's new, as published —")
            for line in newest["notes"].splitlines()[:12]:
                print(f"    {line}")
            print(f"    (summary: {'yes' if summarized else 'pending — proposed after merge'})")
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
                # The Extension Store's shelf copy. The store's own words
                # (category, featured, from extensions.toml) and the
                # author's (screenshots, and what the manifest adds), for a
                # page drawn before anything is downloaded. Browse copy like
                # the rest: the review sheet reads the verified package.
                "category": entry["category"],
                "featured": entry.get("featured", False),
                "screenshots": shot_urls,
                "details": details_url,
                # The release history: `[{version, date, notes, notesSha256,
                # summary}]`, newest first — the author's CHANGELOG.md
                # sections, and the store's short en/vi summary of each
                # (`release-notes/<id>.json`, or null while none matches
                # the notes). Named by its content, like `details`.
                "changelog": changelog_url,
                # `{number, url}` or null: the entry's thread in the repo's
                # Extensions discussions (`discussions.py`). Lumi reads
                # the hearts on it live from GitHub — the index says which
                # thread, never how many, since a count here is stale the
                # moment it is written.
                "discussion": discussion_of(entry_id),
                "size": len(package),
                "commands": [c.get("label") or c.get("name", "") for c in manifest.get("command", [])],
                "shortcuts": [
                    {
                        "command": s.get("command", ""),
                        "label": next(
                            (c.get("label") or c.get("name", "")
                             for c in manifest.get("command", [])
                             if c.get("name") == s.get("command")),
                            s.get("command", ""),
                        ),
                        "key": s.get("key", ""),
                    }
                    for s in manifest.get("shortcut", [])
                ],
                "pages": [p.get("label") or p.get("name", "") for p in manifest.get("page", [])],
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


def discussion_link(entry: dict) -> str:
    thread = entry.get("discussion")
    if not thread:
        return ""
    return f' <a class="discuss" href="{html.escape(thread["url"], quote=True)}">❤️ Like or discuss</a>'


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
    <p><a class="install" href="lumi://extensions/install?id={html.escape(e["id"], quote=True)}">Install in Lumi</a>{discussion_link(e)}</p>
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
  .discuss {{ margin-left: .75em; }}
</style>
<h1>Lumi extensions</h1>
<p>Install opens Lumi, which downloads the package, verifies the store
signature, and shows what the extension may reach before anything lands.
No Lumi yet? <a href="https://lumikeys.app">Get it first.</a></p>
{rows}
</html>
"""


USAGE = "usage: publish.py [--check | --list | --path ID | --build ID OUT | --sign-built DIR]"

if __name__ == "__main__":
    args = sys.argv[1:]
    if not args:
        main()
    elif args == ["--check"]:
        main(check=True)
    elif args == ["--list"]:
        # Two lines for $GITHUB_OUTPUT: the build matrix, and which of its
        # entries need scripts/fetch-private.sh first.
        listed = listed_entries()
        print("entries=" + json.dumps([e["id"] for e in listed]))
        print("private=" + json.dumps([e["id"] for e in listed if e.get("private")]))
    elif len(args) == 2 and args[0] == "--path":
        entry = next((e for e in listed_entries() if e["id"] == args[1]), None)
        if entry is None:
            sys.exit(f"error: {args[1]} is not in extensions.toml")
        print(entry["path"])
    elif len(args) == 3 and args[0] == "--build":
        build_one(args[1], Path(args[2]))
    elif len(args) == 2 and args[0] == "--sign-built":
        main(built=Path(args[1]))
    else:
        sys.exit(f"error: {' '.join(args)!r} — {USAGE}")
