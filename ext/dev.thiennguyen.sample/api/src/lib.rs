//! Write Lumi extensions in Rust.
//!
//! An extension is a `cdylib` crate compiled to `wasm32-wasip2`, installed
//! beside a `manifest.toml` that declares its identity, its capabilities,
//! and what it contributes — commands for shortcuts, nodes for flows,
//! settings for its own pane. This crate is the guest half of that
//! contract: the typed bindings for everything the host offers, and the
//! macro that wires your type into the component's exports.
//!
//! ```ignore
//! use lumi_extension_api as lumi;
//!
//! struct MyExtension;
//!
//! impl lumi::Guest for MyExtension {
//!     fn run_command(name: String, params: String) -> Result<String, String> {
//!         let found = lumi::selection()?;
//!         lumi::alert(&format!("You selected {} chars", found.text.chars().count()))?;
//!         Ok("done".to_string())
//!     }
//!
//!     fn run_node(name: String, params: String, items: String) -> Result<String, String> {
//!         Err(format!("no {name} node"))
//!     }
//!
//!     fn run_ui(window: String, request: String) -> Result<String, String> {
//!         Err(format!("no {window} window"))
//!     }
//!
//!     fn on_lifecycle(event: lumi::Lifecycle) -> Result<(), String> {
//!         // Nothing to do is the ordinary answer.
//!         Ok(())
//!     }
//!
//!     fn on_event(name: String, payload: String) -> Result<(), String> {
//!         // Called only for events the manifest asks to hear.
//!         Ok(())
//!     }
//! }
//!
//! lumi::register!(MyExtension);
//! ```
//!
//! **What a call can reach is the manifest's business, not this crate's.**
//! Every function below exists whether or not your manifest declares the
//! capability behind it; an undeclared one is refused by the host at the
//! call, by name, so the person who sees the error is you with the
//! manifest open. The costs, from the WIT world this crate is generated
//! against: `selection` needs `accessibility` (and reads through the ⌘C
//! fallback only when `clipboard` is granted too), the clipboard reads and
//! writes need `clipboard`, [`paste`] needs `clipboard`, `input` and
//! `accessibility` — and answers only a command or one of your windows,
//! never [`Guest::on_event`] or [`Guest::on_lifecycle`] —, `open_url` needs `applications` (plus `network` for
//! a web address), `fetch` needs `network`, and everything in [`config`]
//! needs `config`. `alert`, `settings`, `profiles`, [`storage`] and
//! [`hyper_key_enabled`] cost nothing but budget — every host call spends
//! from one per-run allowance, so a loop of two hundred alerts ends the
//! run's credit. [`about`] and [`license`] cost nothing at all.
//!
//! **Bounds you are running under**, so a refusal reads as the mechanism
//! it is: a memory ceiling, a wall-clock deadline that stops a run that
//! computes too long, the host-call allowance above, and a cap on how many
//! bytes your answer may be. Hitting one is reported to the person as the
//! extension being stopped — never as Lumi crashing, which is the point of
//! the sandbox.
//!
//! **Lifecycle.** [`Guest::on_lifecycle`] hears three moments: installed
//! (after the package's own installer, if any, has saved its answers),
//! updated (with the version it replaced), and uninstalling (the last run
//! the extension gets, before its files go). It runs only while the
//! extension is switched on, its answer is only ever written to Lumi's log,
//! and it cannot stop what triggered it. Uninstalling is short — a few
//! seconds, since the person is waiting on the button — and opens no
//! windows, because the `ui/` files are about to be deleted: an uninstall
//! survey is a web page, opened with [`open_url`]. A Welcome window is an
//! ordinary declared window, opened from `installed` with [`open_window`].
//!
//! **Events.** [`Guest::on_event`] hears what happens outside the
//! extension, by name, with a JSON payload carrying its own `"v"`. It is
//! called only for the events the manifest asks for and under
//! `on_lifecycle`'s rules: only while switched on, its answer only logged,
//! no windows, no [`paste`]. An extension that asks for none returns
//! `Ok(())` and is never called.
//!
//! The WIT world vendored under `wit/` is **0.3.0** — a wire commitment
//! from here, not a moving target. The copy the host builds against lives
//! in Lumi's own tree and CI holds the two byte-identical. 0.3 is the
//! second break: `on-event` joined the exports, and a component built
//! against 0.2 has none, so a Lumi that speaks 0.3 refuses it at install
//! and says to rebuild it — against this crate, which is the whole
//! migration: add `on_event`, returning `Ok(())`. 0.2 was the same for
//! `on_lifecycle`. 0.3 also brought [`storage`], [`write_clipboard`],
//! [`paste`] and [`close_window`]; an extension using any of them needs
//! Lumi 1.25.0, which its manifest's `min-lumi-version` says. A Lumi
//! asked to install a component built for a version it does not speak
//! says which way to go — rebuild the extension, or update Lumi. Loading
//! older worlds alongside the current one is planned and not built.

// In a module of its own because `pub_export_macro` emits helper macros at
// the crate root *and* re-imports them where the macro ran — at the root
// itself that is one name defined twice. The public surface is the
// re-exports below, not the module.
/// The raw generated bindings. Hidden because the surface of this crate
/// is the functions and re-exports below; reached by path only from
/// [`register!`], which needs the module for `with_types_in`.
#[doc(hidden)]
pub mod bindings {
    wit_bindgen::generate!({
        world: "extension",
        path: "wit",
        pub_export_macro: true,
    });
}

pub use bindings::lumi;
pub use bindings::Guest;
/// One moment in the extension's own life — what [`Guest::on_lifecycle`]
/// is handed. `Updated` carries the version that was replaced.
pub use bindings::Lifecycle;
pub use lumi::ext::app::{Edition, Info as About};
/// One representation of one pasteboard item, for [`write_clipboard`] and
/// [`paste`]: a uniform type identifier and its bytes.
pub use lumi::ext::clipboard::{Data, Rep};
pub use lumi::ext::net::{Request, Response};
pub use lumi::ext::profiles::{Book as Profiles, Profile};
pub use lumi::ext::selection::Found;

/// Wire your extension type into the component's exports. Call once, at
/// the crate root, on the type that implements [`Guest`].
#[macro_export]
macro_rules! register {
    // An identifier, not a type: the generated `export!` matches its input
    // as a bare name, so `register!(path::To<T>)` is not sayable — name the
    // type locally first, which every extension does anyway.
    ($ty:ident) => {
        $crate::bindings::export!($ty with_types_in $crate::bindings);
    };
}

/// The selected text in the frontmost application.
///
/// `Found::how` says how it was read — `"accessibility"`, `"copy"`, or
/// `"nothing"` — and an empty `text` with `"nothing"` is the ordinary
/// miss, not an error. Needs `accessibility`; the ⌘C fallback behind
/// `"copy"` exists only when the manifest also declares `clipboard`.
pub fn selection() -> Result<Found, String> {
    lumi::ext::selection::read()
}

/// Draw a line of text over the frontmost application, in Lumi's own
/// alert style. The way an extension talks to the person at the keyboard.
pub fn alert(text: &str) -> Result<(), String> {
    lumi::ext::alert::show(text)
}

/// Hand a URL to whatever application claimed its scheme. Web and mail
/// addresses only — the host's allowlist, because this URL was assembled
/// out of values read off somebody's desk.
pub fn open_url(url: &str) -> Result<(), String> {
    lumi::ext::open::url(url)
}

/// Select one file in Finder: a `file:` URL (what a copied file carries)
/// or an absolute path. Only for something the person did — a command or
/// a press in one of your windows.
pub fn reveal(target: &str) -> Result<(), String> {
    lumi::ext::open::reveal(target)
}

/// The pasteboard's plain text, or `None` when it holds no text — an
/// image, a file, or nothing at all are one answer here.
pub fn clipboard_text() -> Result<Option<String>, String> {
    lumi::ext::clipboard::read_text()
}

/// Put text on the pasteboard, replacing what was there.
pub fn set_clipboard_text(text: &str) -> Result<(), String> {
    lumi::ext::clipboard::write_text(text)
}

/// Replace the pasteboard with whole items — each a list of [`Rep`], the
/// same thing in several types, the richest first. [`Data::Blob`] names a
/// blob in your own [`storage`], which goes on the board without passing
/// through your component. At most 160 MB in all. Lumi marks the board as
/// yours, so when you hear the copy you can tell it was your own write.
pub fn write_clipboard(items: &[Vec<Rep>]) -> Result<(), String> {
    lumi::ext::clipboard::write_all(items)
}

/// [`write_clipboard`], then ⌘V into the app in front — what a clipboard
/// history does when a row is picked. Your panels close first, so the
/// keystroke lands where the caret was; the board keeps what was pasted.
///
/// Needs `clipboard`, `input` and `accessibility`, and answers only
/// something the person did: a command, or a request from one of your
/// windows. Refused from [`Guest::on_event`] and [`Guest::on_lifecycle`].
pub fn paste(items: &[Vec<Rep>]) -> Result<(), String> {
    lumi::ext::clipboard::paste(items)
}

/// Drag whole items out of the window the person is pressing in, into
/// whatever app they drop them on — Finder, a browser's upload field, a
/// chat. A file URL carries the file; an image with no file becomes a PNG
/// file where a file is wanted (Finder, the desktop) and stays an image
/// elsewhere; anything else goes as its types, like [`write_clipboard`]. The
/// board the person copies with is not touched.
///
/// `close_on_drop` takes your panels down after a drop that took the items;
/// a drag given up never closes anything.
///
/// Needs `clipboard`. Call it from a request your page sends when a press
/// on an item starts to move: Lumi refuses it unless one of your windows is
/// key and the mouse button is still down in it. Needs Lumi 1.26.0 or
/// later — say so with `min-lumi-version`.
pub fn drag(items: &[Vec<Rep>], close_on_drop: bool) -> Result<(), String> {
    lumi::ext::clipboard::drag(items, lumi::ext::clipboard::DragOptions { close_on_drop })
}

/// One HTTP request, through the host — which is where the user's own
/// local-network setting is enforced, whatever this request asks for.
pub fn fetch(request: &Request) -> Result<Response, String> {
    lumi::ext::net::fetch(request)
}

/// Open (or focus) one of your own windows, by its manifest `name`.
///
/// A window is declared under `[[window]]` and drawn from the `ui/` files
/// that shipped in your package — any static bundle; a React build's
/// output is the expected shape. The page runs with no access to Lumi's
/// internals and no network: it talks to your extension through `fetch`
/// against its own origin — `GET`/`PUT /__lumi__/settings` for your
/// settings, and
/// `POST /__lumi__/call` with any string, which arrives at your
/// [`Guest::run_ui`] under the same budget and capability gate as a
/// command. A borderless window can be dragged by its page: `POST
/// /__lumi__/drag` on a press hands that press to macOS as a window
/// drag, while it is the window in front. A name the manifest does not declare
/// is refused here, by name — the declaration is the grant.
pub fn open_window(name: &str) -> Result<(), String> {
    lumi::ext::ui::open_window(name)
}

/// Close one of your own windows by its manifest `name` — a panel's Esc.
/// One that is not open is not an error.
pub fn close_window(name: &str) -> Result<(), String> {
    lumi::ext::ui::close_window(name)
}

/// Bring up Lumi's Settings on your extension's Settings tab — for a
/// "Settings…" in one of your windows. Only for a press.
pub fn open_settings() -> Result<(), String> {
    lumi::ext::ui::open_settings()
}

/// Choose the glass one of your panels opens on from now on — "popover",
/// "hud" or "sidebar" — for an appearance setting. The panel's manifest
/// entry must declare a `material`.
pub fn set_material(name: &str, material: &str) -> Result<(), String> {
    lumi::ext::ui::set_material(name, material)
}

/// Choose light or dark for one of your panels — "light", "dark" or
/// "system" — for a theme setting. Applies at once if the panel is up.
pub fn set_theme(name: &str, theme: &str) -> Result<(), String> {
    lumi::ext::ui::set_theme(name, theme)
}

/// Pin one of your panels, or let it go. A pinned panel stays up while the
/// person works in another app; a paste from it hands the keyboard back and
/// leaves it up. Escape, your shortcut and [`close_window`] still put it
/// away, pin and all — every show starts unpinned. Only a panel that is up,
/// from a request your page sends on a press. Needs Lumi 1.29.0 or later —
/// say so with `min-lumi-version`.
pub fn set_pinned(name: &str, pinned: bool) -> Result<(), String> {
    lumi::ext::ui::set_pinned(name, pinned)
}

/// Make one of your windows' unified title bar `height` points tall, and
/// macOS's traffic lights move to stay centred in it — a compact mode, a
/// second row of controls. Answers the height it became, clamped to 32–96;
/// draw your toolbar at that. Only a window declared `titlebar = "unified"`
/// that is open. Needs Lumi 1.30.0 or later — say so with `min-lumi-version`.
pub fn set_titlebar_height(name: &str, height: f64) -> Result<f64, String> {
    lumi::ext::ui::set_titlebar_height(name, height)
}

/// Send `message` (JSON text) to one of your own windows or pages — a
/// window by its manifest `name`, or `":about"`, `":settings"`,
/// `":page:<name>"`. The page hears it as a `lumi:message` event whose
/// `detail` is the JSON. `Ok(false)`: not on screen, nothing sent. Works
/// from [`Guest::on_event`], and reaches a page even while Lumi is behind
/// another app — the way to keep an open page current.
pub fn post(window: &str, message: &str) -> Result<bool, String> {
    lumi::ext::ui::post(window, message)
}

/// Your settings, as chosen in the Extensions pane: one key per field the
/// manifest declares, defaults already filled in for anything untouched.
/// A field declared `scope = "profile"` holds the live profile's value —
/// your code reads it the same way either way.
pub fn settings() -> serde_json::Value {
    serde_json::from_str(&lumi::ext::settings::read())
        .unwrap_or_else(|_| serde_json::Value::Object(serde_json::Map::new()))
}

/// One string setting, for the common case of reading a single field.
pub fn setting(name: &str) -> Option<String> {
    settings()
        .get(name)
        .and_then(|value| value.as_str())
        .map(|value| value.to_string())
}

/// Every profile on this Mac, and which one is live.
///
/// A profile is a whole set of the person's automations — shortcuts,
/// menus, snippets, flows — and they switch between them, one live at a
/// time. Your extension is installed once for the whole Mac, so this is
/// how it tells the sets apart: key anything you keep per profile by
/// [`Profile::id`], which survives a rename, and show [`Profile::name`],
/// which does not.
///
/// One call answers both halves, so the list and the live id are always
/// from the same moment. Ask again whenever you need it rather than
/// holding on to an answer: the person may switch at any time, and
/// nothing tells your component that they did.
///
/// ```ignore
/// let book = lumi::profiles()?;
/// let here = book.active_profile().map(|p| p.name.as_str()).unwrap_or("?");
/// lumi::alert(&format!("{here} — one of {} profiles", book.profiles.len()))?;
/// ```
pub fn profiles() -> Result<Profiles, String> {
    lumi::ext::profiles::read()
}

impl Profiles {
    /// The live profile's row. `None` only if the answer broke its own
    /// promise that `active` is one of `profiles` — never in practice, and
    /// an `Option` rather than a panic so your code cannot be the thing
    /// that trips over it.
    pub fn active_profile(&self) -> Option<&Profile> {
        self.profiles.iter().find(|profile| profile.id == self.active)
    }
}

/// Which Lumi is running: its version, homepage and author.
///
/// Check `version` before relying on something a newer Lumi added — it is
/// `"major.minor.patch"`, so compare the numbers rather than matching the
/// string.
///
/// ```ignore
/// let lumi = lumi::about();
/// lumi::alert(&format!("Running in Lumi {}", lumi.version))?;
/// ```
pub fn about() -> About {
    lumi::ext::app::about()
}

/// Whether this Mac has Lumi Pro: [`Edition::Pro`], [`Edition::Free`] with
/// no licence at all, or [`Edition::Inactive`] for a licence that is not
/// granting Pro right now.
///
/// The edition is the whole of what an extension learns about the licence —
/// never the key, the seat, or who bought it. Ask each time you need it:
/// the person can buy, lapse or renew while your extension is installed.
pub fn license() -> Edition {
    lumi::ext::app::license()
}

/// Whether Lumi's Hyper key is switched on in the live profile. While it
/// is, Caps Lock belongs to Lumi — remapped and never delivered as itself —
/// so a page listening for keys should not wait for one.
///
/// Needs no capability; it spends one host call, like `settings`. It is the
/// switch alone: the modifiers the Hyper key adds and what a tap does are
/// under [`config::hyper_key`], which needs `config`. Ask when you need it:
/// the person can flip it, or switch profile, at any time. Needs Lumi 1.23.0
/// or later — say so with `min-lumi-version` in your manifest.
pub fn hyper_key_enabled() -> Result<bool, String> {
    lumi::ext::app::hyper_key_enabled()
}

/// Your extension's own storage: a small key–value store and a store of
/// blobs, kept by Lumi on this Mac and encrypted with a key Lumi holds in the
/// Keychain. Your component never sees the key, no other extension can read
/// your data, and none of it is in a Lumi backup. It survives updates and is
/// removed when the person uninstalls your extension.
///
/// Costs no capability; each call spends one host call from the run's
/// allowance. Nothing lives in memory between runs — every command, node and
/// page request starts a fresh instance — so this is where state goes.
///
/// **Key names are not encrypted**: they are file names. Keep what matters in
/// the value and use random ids where a name would say something. Names are
/// 1–128 lowercase letters, digits, `.`, `-` or `_`, not starting with `.`;
/// a value is at most 1 MB, and the whole store 512 MB.
///
/// Two runs can write at once — a page request and a command, say — so
/// [`storage::put`] takes the revision you read and refuses with
/// [`storage::PutError::Conflict`] if something wrote in between: read again,
/// reapply your change, write again.
///
/// ```ignore
/// use lumi_extension_api::storage::{self, PutError};
/// loop {
///     let seen = storage::get("count")?;
///     let n = seen.as_ref().map_or(0, |e| e.value.parse().unwrap_or(0)) + 1;
///     match storage::put("count", &n.to_string(), seen.map(|e| e.rev)) {
///         Err(PutError::Conflict) => continue,
///         other => break other.map(drop).map_err(PutError::into_message)?,
///     }
/// }
/// ```
///
/// Needs Lumi 1.25.0 or later — say so with `min-lumi-version`.
pub mod storage {
    use super::lumi::ext::storage as wit;

    pub use wit::Entry;

    /// Why a [`put`] did not write.
    #[derive(Debug, Clone, PartialEq, Eq)]
    pub enum PutError {
        /// Something else wrote the key since you read it.
        Conflict,
        /// Anything else, in a sentence.
        Failed(String),
    }

    impl PutError {
        pub fn into_message(self) -> String {
            match self {
                PutError::Conflict => "another run wrote the value first".to_string(),
                PutError::Failed(message) => message,
            }
        }
    }

    pub fn get(key: &str) -> Result<Option<Entry>, String> {
        wit::get(key)
    }

    /// Write `value` if `key` is still at `if_rev` — `None` meaning it must
    /// not exist yet. Answers the new revision.
    pub fn put(key: &str, value: &str, if_rev: Option<u64>) -> Result<u64, PutError> {
        wit::put(key, value, if_rev).map_err(|err| {
            if err == "conflict" {
                PutError::Conflict
            } else {
                PutError::Failed(err)
            }
        })
    }

    /// Removing a key that is not there is not an error.
    pub fn delete(key: &str) -> Result<(), String> {
        wit::delete(key)
    }

    /// Every key starting with `prefix`, sorted.
    pub fn keys(prefix: &str) -> Result<Vec<String>, String> {
        wit::keys(prefix)
    }

    /// Store bytes (at most 4 MB) and answer their id.
    pub fn blob_write(bytes: &[u8]) -> Result<String, String> {
        wit::blob_write(bytes)
    }

    pub fn blob_read(id: &str) -> Result<Vec<u8>, String> {
        wit::blob_read(id)
    }

    pub fn blob_delete(id: &str) -> Result<(), String> {
        wit::blob_delete(id)
    }

    /// Offer a blob to the person as a file, through Lumi's Save panel with
    /// `name` filled in. Your panels close first; the call returns once the
    /// Save panel is up, and does not say where the file went. Only while
    /// answering a press — a command or one of your windows.
    ///
    /// Needs Lumi 1.26.0 or later.
    pub fn blob_save(id: &str, name: &str) -> Result<(), String> {
        wit::blob_save(id, name)
    }

    /// Every blob and its size in bytes, sorted by id.
    pub fn blobs() -> Result<Vec<(String, u64)>, String> {
        wit::blobs()
    }

    /// Bytes used on disk and the most your extension may use.
    pub fn usage() -> Result<(u64, u64), String> {
        wit::usage().map(|space| (space.bytes, space.limit))
    }
}

/// The pixels on screen: one picture of a display, a window or an area.
/// Every function here needs the `screen` capability.
///
/// The picture goes into your extension's [`storage`] as a PNG blob and you
/// get its id — a page shows it at `/__lumi__/blob/<id>`,
/// [`write_clipboard`] takes it as [`Data::Blob`], [`storage::blob_save`]
/// hands it to the person. Delete it when you are done with it: it counts
/// against your store's space like any other blob.
///
/// Coordinates are points, origin at the top-left of the main display, y
/// down. Lumi's own windows, yours included, are never in the picture.
///
/// Capturing also needs macOS's Screen Recording permission, which is
/// Lumi's, not yours: the person turns it on once, in System Settings, for
/// every extension that declares `screen`. Without it a capture is refused
/// with a sentence saying where the switch is — show it to them. Capturing
/// needs macOS 14 or later.
///
/// ```ignore
/// use lumi_extension_api::screen::{self, Target};
/// // Let the person drag out an area, then take a picture of it.
/// let Some(area) = screen::select_area()? else { return Ok("cancelled".into()) };
/// let shot = screen::capture(Target::Area(area))?;
/// // shot.blob is a PNG of what they chose.
/// ```
///
/// Needs Lumi 1.30.0 or later — say so with `min-lumi-version`.
pub mod screen {
    use super::lumi::ext::screen as wit;

    pub use wit::{PickedWindow, Rect, Shot, Target, Window};

    /// Whether Lumi holds Screen Recording, as far as macOS will say
    /// without trying. `true` is reliable; `false` may be stale for a
    /// permission given since Lumi started — only [`capture`] tells for
    /// certain. Use it to word a hint, never to refuse to try.
    pub fn permitted() -> Result<bool, String> {
        wit::permitted()
    }

    /// Take one picture. Only while answering a press — a command or one of
    /// your windows — never from an event or a lifecycle hook.
    pub fn capture(target: Target) -> Result<Shot, String> {
        wit::capture(target)
    }

    /// Let the person drag out an area of the screen: every display dims,
    /// the pointer becomes a crosshair, and what they drag is the answer.
    /// `None` when they press Escape, right-click, or leave it for two
    /// minutes. Takes no picture — pass the area to [`capture`] — and needs
    /// no macOS permission. The time they take is not counted against your
    /// run. Only while answering a press, like [`capture`].
    pub fn select_area() -> Result<Option<Rect>, String> {
        wit::select_area()
    }

    /// Let the person pick a window: every display dims, the window under
    /// the pointer lights up, and the one they click is the answer. `None`
    /// when they press Escape, right-click, or leave it for two minutes.
    /// Applications' windows, the menu bar, its items and the Dock are
    /// offered — the Dock only with Screen Recording — and Lumi's own
    /// windows never are. Takes no picture — pass
    /// `Target::Window(Window { id: Some(picked.id), shadow })` to
    /// [`capture`] — and needs no macOS permission. Only while answering a
    /// press.
    pub fn select_window() -> Result<Option<PickedWindow>, String> {
        wit::select_window()
    }
}

/// The person's automations and Lumi's own settings, read-only, as the live
/// profile holds them. Every function here needs the `config` capability.
///
/// Each answer is a JSON value in the same camelCase fields and values Lumi
/// saves the document with, so the shape you read today is the shape the
/// next Lumi hands you too — new fields may appear, existing ones keep
/// their names. Read when you need it: the person can edit a row or switch
/// profile at any moment, and nothing tells your component that they did.
///
/// A row that runs another extension's command arrives without its
/// `action.params` — what the person typed into that extension's form is
/// that extension's to read. Rows running your own commands keep theirs.
///
/// There is no write, by design. If your extension wants to change what a
/// keystroke does, offer a command or a flow node and let the person bind
/// it; reading is how you fit around what they already have — offering a
/// combination nobody holds, or not expanding over a snippet they wrote.
///
/// ```ignore
/// let shortcuts = lumi::config::shortcuts()?;
/// let rows = shortcuts["bindings"].as_array().map(Vec::len).unwrap_or(0);
/// lumi::alert(&format!("{rows} shortcuts in this profile"))?;
/// ```
pub mod config {
    use super::lumi::ext::config as wit;

    fn parsed(text: Result<String, String>) -> Result<serde_json::Value, String> {
        serde_json::from_str(&text?).map_err(|err| format!("Lumi answered with bad JSON: {err}"))
    }

    /// Lumi's general settings: `appearance`, `startAtLogin`,
    /// `showProfileInMenuBar`, `appShortcuts`, `alert`, `leader` and
    /// `arrange`.
    pub fn settings() -> Result<serde_json::Value, String> {
        parsed(wit::settings())
    }

    /// `{"enabled": …, "bindings": [...]}`: the Shortcuts pane's switch and
    /// every row in it — ordinary combinations, double-taps, Fn
    /// combinations, leader menus and their steps. A row whose
    /// own `enabled` is false is written down but not armed — and so is
    /// every row while the pane's `enabled` is false.
    pub fn shortcuts() -> Result<serde_json::Value, String> {
        parsed(wit::shortcuts())
    }

    /// Snippet expansion: its switch, its options, and every snippet under
    /// `items`.
    pub fn snippets() -> Result<serde_json::Value, String> {
        parsed(wit::snippets())
    }

    /// The Caps Lock Hyper key: whether it is on, which modifiers it holds,
    /// and what a tap on its own does.
    pub fn hyper_key() -> Result<serde_json::Value, String> {
        parsed(wit::hyper_key())
    }

    /// Double-tap: the switch and the timing, plus the rows it arms under
    /// `bindings` — the same rows [`shortcuts`] lists, picked out.
    pub fn double_tap() -> Result<serde_json::Value, String> {
        parsed(wit::double_tap())
    }

    /// Shortcuts held on the Fn key: the switch, plus the rows it arms
    /// under `bindings`.
    pub fn fn_key() -> Result<serde_json::Value, String> {
        parsed(wit::fn_key())
    }

    /// Your own `[[shortcut]]`s as Lumi holds them — a list, one per
    /// declaration in manifest order, each `{"command", "label", "key",
    /// "declared", "state", "reason", "holder"}`. `key` is the accelerator
    /// armed now or null; `state` is `"registered"`, `"taken"` (something
    /// held the declared key at install — `holder` says what, `reason`
    /// says it in a sentence), `"invalid"` or `"cleared"`. Needs no
    /// capability: these are yours. Lumi tries each key once, at install,
    /// and never chooses between your key and a row of the person's —
    /// read this, from `on_lifecycle` or a window, and decide.
    pub fn extension_shortcuts() -> Result<serde_json::Value, String> {
        parsed(wit::extension_shortcuts())
    }

    /// Arm, change or clear one of your own `[[shortcut]]`s. `key` is an
    /// accelerator in the recorder's spelling (`Shift+Super+KeyC`), or
    /// `None` to clear. Refused with a sentence when something holds the
    /// key, unless `replace` — which takes it off the person's row, in
    /// whichever profile, or off Lumi's own; another extension's key is
    /// never taken. Answers the entry as it now stands, in
    /// [`extension_shortcuts`]' shape. Needs no capability.
    pub fn set_extension_shortcut(
        command: &str,
        key: Option<&str>,
        replace: bool,
    ) -> Result<serde_json::Value, String> {
        parsed(wit::set_extension_shortcut(command, key, replace))
    }
}
