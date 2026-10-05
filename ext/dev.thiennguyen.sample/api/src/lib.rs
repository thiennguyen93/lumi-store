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
//! a web address), `fetch` needs `network`, everything in [`config`]
//! needs `config`, [`screen`] needs `screen`, [`snippets`] needs
//! `snippets`, and [`permissions`] needs the capability of the permission
//! asked about — `screen` for Screen Recording, and [`menu`] needs `menu`. `alert`, `settings`, `profiles`, [`storage`] and
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
pub use lumi::ext::clipboard::{Data, Image, Rep};
pub use lumi::ext::net::{Request, Response};
pub use lumi::ext::profiles::{Book as Profiles, Profile};
pub use lumi::ext::selection::Found;
/// Where one of your windows stands — what [`window_state`] answers.
pub use lumi::ext::ui::Presence;

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

/// The pasteboard read back as [`write_clipboard`] writes it: one list per
/// item, of the [`Rep`]s it holds among `types` — uniform type identifiers,
/// in the order you want them — or every type it holds when `types` is
/// empty. An item holding none of them is left out. Words come back as
/// [`Data::Text`] (a type that is text or a URL to macOS, in UTF-8);
/// everything else as a [`Data::Blob`] in your own [`storage`], yours to
/// delete. At most 160 MB in all. Needs `clipboard` and Lumi 1.36.0.
pub fn read_clipboard(types: &[&str]) -> Result<Vec<Vec<Rep>>, String> {
    let types: Vec<String> = types.iter().map(|t| t.to_string()).collect();
    lumi::ext::clipboard::read_all(&types)
}

/// The picture on the pasteboard, as a PNG blob in your own [`storage`] —
/// whatever the board held it as — with its size in pixels, or `None` when
/// it holds no picture. The bytes never pass through your component; the
/// blob is yours to delete. Needs `clipboard` and Lumi 1.36.0.
pub fn clipboard_image() -> Result<Option<Image>, String> {
    lumi::ext::clipboard::read_image()
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
/// file — for every app from Lumi 1.34, Electron apps and browsers included;
/// before it, only those that read a file promise, such as Finder — and
/// stays an image to an app that takes images; anything else goes as its types, like [`write_clipboard`]. The
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

/// [`drag`], naming the files: `names[i]` is what item `i` is called where
/// it becomes a file — an image with no file of its own — without the
/// extension, which is the file's own (`.png`). `{date}` and `{time}` are
/// filled in as [`storage::blob_save_dated`] fills them. Lumi makes it a file name:
/// `/` and `:` become `-`, control characters and a leading dot go, and it
/// is cut to 120 characters. `None`, an empty name, or an item past the end
/// of `names` gets the name macOS gives a screenshot; an item with a file
/// URL keeps its file's name. More names than items is refused.
///
/// A screenshot app passes the name its own file-name setting would save
/// under, so a picture dragged out lands with the same name as one saved.
/// Needs `clipboard` and Lumi 1.34.0 or later.
pub fn drag_named(items: &[Vec<Rep>], names: &[Option<String>], close_on_drop: bool) -> Result<(), String> {
    lumi::ext::clipboard::drag_named(items, names, lumi::ext::clipboard::DragOptions { close_on_drop })
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
///
/// One already up is focused, never closed, from your command's press too:
/// a pinned panel the person left takes the keyboard back where it stands,
/// any other comes to the pointer. For a key that also puts it away, ask
/// [`window_state`] and [`close_window`] it yourself. Until Lumi 1.31 a
/// press on a panel that held the keyboard closed it instead.
pub fn open_window(name: &str) -> Result<(), String> {
    lumi::ext::ui::open_window(name)
}

/// Close one of your own windows by its manifest `name` — a panel's Esc.
/// One that is not open is not an error.
pub fn close_window(name: &str) -> Result<(), String> {
    lumi::ext::ui::close_window(name)
}

/// Where one of your own windows stands, by its manifest `name`:
/// [`Presence::Hidden`] off screen, [`Presence::Up`] on screen with the
/// keyboard elsewhere — a pinned panel the person left, even with the
/// pointer over it — or [`Presence::Focused`]. For a command that decides
/// for itself, a toggle say:
///
/// ```ignore
/// match lumi_extension_api::window_state("history")? {
///     Presence::Focused => lumi_extension_api::close_window("history"),
///     _ => lumi_extension_api::open_window("history"),
/// }
/// ```
///
/// Works from [`Guest::on_event`] too. Needs Lumi 1.31.0 or later — say so
/// with `min-lumi-version`.
pub fn window_state(name: &str) -> Result<Presence, String> {
    lumi::ext::ui::window_state(name)
}

/// Bring up Lumi's Settings on your extension's Settings tab — for a
/// "Settings…" in one of your windows. Only for a press.
pub fn open_settings() -> Result<(), String> {
    lumi::ext::ui::open_settings()
}

/// Choose the glass one of your panels opens on from now on — "popover",
/// "hud" or "sidebar" — for an appearance setting. The panel's manifest
/// entry must declare one of those three; a `"clear"` panel stays clear.
pub fn set_material(name: &str, material: &str) -> Result<(), String> {
    lumi::ext::ui::set_material(name, material)
}

/// Choose where one of your panels opens from now on — `"cursor"`,
/// `"center"`, `"top-left"`, `"top-right"`, `"bottom-left"` or
/// `"bottom-right"`, the manifest's `position` words — for a setting that
/// lets the person pick a corner. Call it before `open_window`; a panel that
/// is already up moves there at once. A window is refused: macOS places it.
/// Needs Lumi 1.34.0 or later — say so with `min-lumi-version`.
pub fn set_position(name: &str, position: &str) -> Result<(), String> {
    lumi::ext::ui::set_position(name, position)
}

/// Choose light or dark for one of your panels — "light", "dark" or
/// "system" — for a theme setting. Applies at once if the panel is up.
pub fn set_theme(name: &str, theme: &str) -> Result<(), String> {
    lumi::ext::ui::set_theme(name, theme)
}

/// Pin one of your panels, or let it go. A pinned panel stays up while the
/// person works in another app; a paste from it hands the keyboard back and
/// leaves it up. Escape and [`close_window`] still put it away, pin and
/// all; every show starts unpinned. Your shortcut does not, from Lumi 1.31:
/// it focuses the panel ([`open_window`]). Only a panel that is up,
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

/// Give one of your open windows or panels a new content size, in points —
/// to fit a list that grew, a stack of cards. Clamped to 240–1600 by
/// 180–1200, as the manifest's `width` and `height` are; answers the size it
/// became. A panel at a corner keeps that corner and grows away from it;
/// anything else keeps its top-left. The next open starts at the manifest's
/// size again. A page can do the same itself with `POST /__lumi__/size`.
/// Needs Lumi 1.34.0 or later — say so with `min-lumi-version`.
pub fn set_size(name: &str, width: f64, height: f64) -> Result<Size, String> {
    lumi::ext::ui::set_size(name, width, height)
}

/// What [`set_size`] answers: the content size a window became.
pub use lumi::ext::ui::Size;

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
/// nothing tells your component that they did. A page of yours on screen
/// is told — a `lumi:profiles` event carrying this same answer, from Lumi
/// 1.31.0 — so a window can ask again then.
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

    /// [`blob_save`], with every `{date}` and `{time}` in `name` filled in
    /// from the Mac's own clock and time zone — `2026-10-02`, `14.03.11` —
    /// which your component cannot read: its clock is UTC. Lumi never tells
    /// you the name it filled in.
    ///
    /// ```ignore
    /// storage::blob_save_dated(&shot.blob, "Screenshot {date} at {time}.png")?;
    /// ```
    ///
    /// Needs Lumi 1.34.0 or later.
    pub fn blob_save_dated(id: &str, name: &str) -> Result<(), String> {
        wit::blob_save_dated(id, name)
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
/// Lumi's, not yours: the person allows it once, for every extension that
/// declares `screen`. You never ask for it. Without it a capture is refused
/// with a sentence, and Lumi opens its Settings to ask for the permission
/// itself — return the refusal as your command's error. Capturing needs
/// macOS 14 or later.
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

    pub use wit::{Encoding, Format, PickedWindow, Rect, Resolution, Shot, Target, Window, WindowInfo};

    /// Whether Lumi holds Screen Recording. Takes no picture, and is right
    /// for a permission given since Lumi started too — for a status line,
    /// say. You need not ask it first: without the permission [`capture`],
    /// [`select_area`] and [`select_window`] are refused, and Lumi asks. To
    /// ask before, see [`permissions`](crate::permissions).
    pub fn permitted() -> Result<bool, String> {
        wit::permitted()
    }

    /// Take one picture. Only while answering a press — a command or one of
    /// your windows — never from an event or a lifecycle hook.
    pub fn capture(target: Target) -> Result<Shot, String> {
        wit::capture(target)
    }

    /// [`capture`], written as `encoding` says — JPEG at a quality, or one
    /// pixel a point rather than the display's own. Lumi takes the picture
    /// at that size and encodes it once, so it is ready to copy or save
    /// with no page of yours on screen. JPEG has no transparency: a
    /// window's corners and shadow are laid on white.
    ///
    /// ```ignore
    /// use lumi_extension_api::screen::{self, Encoding, Format, Resolution, Target};
    /// let shot = screen::capture_as(
    ///     Target::Display,
    ///     Encoding { format: Format::Jpeg, quality: 85, resolution: Resolution::Points },
    /// )?;
    /// ```
    ///
    /// Needs Lumi 1.34.0 or later — say so with `min-lumi-version`.
    pub fn capture_as(target: Target, encoding: Encoding) -> Result<Shot, String> {
        wit::capture_as(target, encoding)
    }

    /// Let the person drag out an area of the screen: every display dims,
    /// the pointer becomes a crosshair, and what they drag is the answer.
    /// `None` when they press Escape, right-click, or leave it for two
    /// minutes. Takes no picture — pass the area to [`capture`]. Refused at
    /// once without Screen Recording, so nobody drags out an area that
    /// cannot be captured. The time they take is not counted against your
    /// run. Only while answering a press, like [`capture`].
    pub fn select_area() -> Result<Option<Rect>, String> {
        wit::select_area()
    }

    /// Let the person pick a window: every display dims, the window under
    /// the pointer lights up, and the one they click is the answer. `None`
    /// when they press Escape, right-click, or leave it for two minutes.
    /// Applications' windows, the menu bar, its items and the Dock are
    /// offered, and Lumi's own windows never are. Takes no picture — pass
    /// `Target::Window(Window { id: Some(picked.id), shadow })` to
    /// [`capture`]. Refused at once without Screen Recording, like
    /// [`select_area`]. Only while answering a press.
    pub fn select_window() -> Result<Option<PickedWindow>, String> {
        wit::select_window()
    }

    /// Whose a window is — the application's name, its bundle id, the
    /// window's title — for `Some(id)` from [`select_window`], or for
    /// `None` the window in front, the one [`capture`] takes for a
    /// `Window` with no id. `None` back for a window no longer on screen.
    ///
    /// The front window comes back with its id. Capture by that id, and the
    /// picture is the window just described even if another came to the
    /// front in between:
    ///
    /// ```ignore
    /// if let Some(front) = screen::about_window(None)? {
    ///     let window = Window { id: Some(front.id), shadow: false };
    ///     let shot = screen::capture(Target::Window(window))?;
    ///     // label it `front.app`: "Safari"
    /// }
    /// ```
    ///
    /// Takes no picture and needs no permission, though `title` is `None`
    /// without Screen Recording. Only the windows [`select_window`] would
    /// offer are described, never Lumi's own. Only while answering a press.
    /// Needs Lumi 1.34.
    pub fn about_window(window: Option<u32>) -> Result<Option<WindowInfo>, String> {
        wit::about_window(window)
    }
}

/// Text in a picture, with where each line and word of it is — read by
/// macOS's own recogniser. Lumi reads; what the text is for is yours.
///
/// What a read costs follows the picture. One already in your storage
/// ([`Source::Blob`]) reaches nothing new: no capability, and it may be read
/// from anywhere, an event included. The screen ([`Source::Screen`]) is a
/// capture, with everything [`screen::capture`](crate::screen::capture)
/// asks — the `screen` capability, Screen Recording, and a press behind it.
///
/// Positions are the picture's pixels, origin top-left. For the screen,
/// `reading.frame` and `reading.scale` say where those pixels were: a point
/// on screen is `frame.x + x / scale`, `frame.y + y / scale`.
///
/// ```ignore
/// use lumi_extension_api::ocr::{self, Options, Source};
/// let shot = lumi_extension_api::screen::capture(area)?;
/// let reading = ocr::read(&Source::Blob(shot.blob.clone()), &Options { words: true, ..Options::default() })?;
/// for line in &reading.lines {
///     // line.text, line.frame, line.words — draw them over the picture.
/// }
/// ```
///
/// Half a second to two seconds a read at [`Level::Accurate`], counted
/// against your run. Needs macOS 13 (14 for the screen) and Lumi 1.34.0 or
/// later — say so with `min-lumi-version`.
pub mod ocr {
    use super::lumi::ext::ocr as wit;

    pub use wit::{Alternative, Level, Line, Options, Point, Reading, Source, Word};

    impl Default for Options {
        /// Lumi's own reading: the accurate recogniser, languages told from
        /// the picture, dictionary correction on, the default smallest text,
        /// no alternatives and no word boxes.
        fn default() -> Self {
            Options {
                level: Level::Accurate,
                languages: Vec::new(),
                language_correction: true,
                minimum_text_height: None,
                alternatives: 0,
                words: false,
            }
        }
    }

    /// Read one picture. A blob that is not a picture, one over 64
    /// megapixels, and the screen without a press behind it are refused
    /// with a sentence saying so.
    pub fn read(source: &Source, options: &Options) -> Result<Reading, String> {
        wit::read(source, options)
    }

    /// The languages `level` reads, as [`Options::languages`] names them.
    pub fn languages(level: Level) -> Result<Vec<String>, String> {
        wit::languages(level)
    }
}

/// The person's snippets, asked about a whole text: is it a trigger, and
/// what does it expand to. For text that came from somewhere other than the
/// keyboard — a copy in a history, a line in a document — when you want to
/// say what Lumi would make of it. Every function here needs the `snippets`
/// capability.
///
/// A snippet counts when it is switched on and has a trigger; where and when
/// it would fire while typing — its applications, the profile's Snippets
/// switch — is not asked, since nothing is being typed. A trigger matches
/// exactly as typing would match it: the snippet's own case sensitivity,
/// and a regular expression covering the whole text.
///
/// ```ignore
/// use lumi_extension_api::snippets::{self, Within};
/// for hit in snippets::find(";addr", Within::All)? {
///     let expansion = snippets::expand(&hit.profile, &hit.snippet, ";addr")?;
///     // Keep expansion.text under hit.revision only when expansion.fixed.
/// }
/// ```
///
/// Nothing tells your component when the person edits a snippet; a page of
/// yours on screen is told, with a `lumi:snippets` event, and can ask again.
///
/// Needs Lumi 1.31.0 or later — say so with `min-lumi-version`.
pub mod snippets {
    use super::lumi::ext::snippets as wit;

    pub use wit::{Expansion, Hit, Within};

    /// Every snippet in those profiles whose trigger is the whole of
    /// `text`: profile by profile, then in the order each lists them. A
    /// text longer than 64 characters — more than a trigger can be typed
    /// in — matches nothing, and costs nothing past the call. A profile id
    /// in [`Within::Only`] that no profile has is skipped. Trim the text
    /// first if surrounding spaces should not count.
    pub fn find(text: &str, within: Within) -> Result<Vec<Hit>, String> {
        wit::find(text, &within)
    }

    /// Expand one snippet as typing `text` would: variables rendered, a
    /// script run against what its pattern caught. Refused when `text` is
    /// no longer its trigger or the snippet is gone or switched off — and,
    /// for a snippet that reads the clipboard, unless you also declare
    /// `clipboard`.
    ///
    /// An expansion with `fixed` set is the same every time and worth
    /// keeping under its `revision`; any other is fresh each call — a date,
    /// a random value, whatever a script computes.
    pub fn expand(profile: &str, snippet: &str, text: &str) -> Result<Expansion, String> {
        wit::expand(profile, snippet, text)
    }
}

/// macOS permissions Lumi holds on behalf of every extension. The grant is
/// always Lumi's — macOS credits the app, never an extension inside it — so
/// you ask Lumi, and Lumi asks macOS. Each permission needs the capability
/// it is for: [`Permission::ScreenRecording`] needs `screen`.
///
/// You rarely need this at all: without Screen Recording a capture or a
/// `select_area` is refused and Lumi shows its own sheet by itself. Reach for
/// it to ask *before* — on a Welcome page, say — and pick one of two recipes.
///
/// **Lumi's sheet**, one call. Lumi opens Settings on a sheet with your
/// extension's name that walks the person through macOS's questions:
///
/// ```ignore
/// use lumi_extension_api::permissions::{self, Permission};
/// permissions::ask(Permission::ScreenRecording)?;
/// ```
///
/// **Your own page.** Explain it in your words, then ask macOS directly —
/// from one of your windows, which is what lets macOS list Lumi. Tell the
/// person first that macOS's first button is Deny:
///
/// ```ignore
/// use lumi_extension_api::permissions::{self, Permission, Requested, State};
/// if permissions::check(Permission::ScreenRecording)? == State::NotGranted {
///     match permissions::request(Permission::ScreenRecording)? {
///         Requested::Asked | Requested::AlreadyGranted => {}
///         // Not asked — fall back to Lumi's sheet, which says why.
///         Requested::FlowEditorOpen | Requested::NoWindow => {
///             permissions::ask(Permission::ScreenRecording)?
///         }
///     }
///     // macOS shows its dialog once in Lumi's life; after that the switch
///     // is in System Settings:
///     permissions::open_system_settings(Permission::ScreenRecording)?;
/// }
/// ```
///
/// `ask`, `request` and `open_system_settings` answer only something the
/// person did — a command or a press in one of your windows — never
/// [`Guest::on_event`](crate::Guest::on_event) or a lifecycle hook. `check`
/// is a question and works anywhere.
///
/// Needs Lumi 1.33.0 or later — say so with `min-lumi-version`.
pub mod permissions {
    use super::lumi::ext::permissions as wit;

    pub use wit::{Permission, Requested, State};

    /// Whether Lumi holds `permission` now. Takes no picture and asks
    /// nothing.
    pub fn check(permission: Permission) -> Result<State, String> {
        wit::check(permission)
    }

    /// Lumi's own sheet in Settings, worded with your extension's name.
    /// Comes back as soon as the sheet is up; does nothing when Lumi already
    /// holds the permission.
    pub fn ask(permission: Permission) -> Result<(), String> {
        wit::ask(permission)
    }

    /// macOS's own request, for a page of yours that explained it first.
    /// [`Requested`] says whether macOS was asked, or why not.
    pub fn request(permission: Permission) -> Result<Requested, String> {
        wit::request(permission)
    }

    /// System Settings at the permission's list, where Lumi's switch is.
    pub fn open_system_settings(permission: Permission) -> Result<(), String> {
        wit::open_system_settings(permission)
    }
}

/// Folders the person chose for your extension to write files into — a
/// screenshot saved straight to a folder, an export, a backup — so a save
/// does not have to ask where every time.
///
/// Declare each in your manifest; the review sheet lists it, and a name you
/// did not declare is refused:
///
/// ```toml
/// [[folder]]
/// name = "saves"
/// label = "Save screenshots to"
/// ```
///
/// The person picks the folder in Lumi's own panel — from your
/// [`choose`](folders::choose), or from your extension's Permissions sheet —
/// and Lumi keeps it. You are told its name ("Desktop") and never its path.
/// Nothing is ever written over: a name already taken is written as
/// "Name 2".
///
/// ```ignore
/// use lumi_extension_api::folders::{self, Problem};
/// match folders::write("saves", "Screenshot {date} at {time}.png", &shot.blob) {
///     Ok(()) => {}
///     // Nothing chosen, or the folder went away: ask where, this once.
///     Err(Problem::NotChosen | Problem::Gone) => storage::blob_save_dated(&shot.blob, "Screenshot {date} at {time}.png")?,
///     Err(Problem::Refused(said)) => return Err(said),
/// }
/// ```
///
/// Needs no capability — the declaration is the grant — and Lumi 1.34.0 or
/// later; say so with `min-lumi-version`.
pub mod folders {
    use super::lumi::ext::folders as wit;

    pub use wit::{Chosen, Problem};

    /// The folder chosen for `name`, or `None`.
    pub fn status(name: &str) -> Result<Option<Chosen>, String> {
        wit::status(name)
    }

    /// Ask the person to choose a folder for `name`, in Lumi's Open panel —
    /// `None` when they cancel, which keeps the earlier choice. Only while
    /// answering a press; their time choosing is not counted against your
    /// run.
    pub fn choose(name: &str) -> Result<Option<Chosen>, String> {
        wit::choose(name)
    }

    /// Forget the folder chosen for `name`.
    pub fn forget(name: &str) -> Result<(), String> {
        wit::forget(name)
    }

    /// Write blob `blob` from your storage into the folder chosen for
    /// `name`, as `file_name` — one name, no `/`, not starting with `.`, with
    /// every `{date}` and `{time}` filled in from the Mac's clock. A name
    /// already there is written as "Name 2". Any size of blob. Only while
    /// answering a press.
    pub fn write(name: &str, file_name: &str, blob: &str) -> Result<(), Problem> {
        wit::write(name, file_name, blob)
    }

    /// Show the folder chosen for `name` in Finder. Only while answering a
    /// press.
    pub fn reveal(name: &str) -> Result<(), String> {
        wit::reveal(name)
    }
}

/// Files the person picks in Lumi's Open panel, read into your [`storage`].
/// No capability: the person choosing each file is the grant, and you learn
/// its name and bytes, never its folder. Needs Lumi 1.36.0.
///
/// ```ignore
/// use lumi_extension_api::files;
///
/// for file in files::open(&["public.image"], false, "Open a picture to edit")? {
///     // `file.blob` is in your storage; `file.name` is "Holiday.heic".
/// }
/// ```
pub mod files {
    use super::lumi::ext::files as wit;

    pub use wit::Opened;

    /// Ask the person for files of `types` — uniform type identifiers such
    /// as `public.image`; empty for any file — one at a time or `multiple`,
    /// under a line saying what they are for (`message`, after your
    /// extension's name). Empty when they cancel. Each comes back as a blob
    /// in your storage, at most one blob's limit; a file too big refuses the
    /// whole call and leaves nothing written. Only while answering a press;
    /// their time choosing is not counted against your run.
    pub fn open(types: &[&str], multiple: bool, message: &str) -> Result<Vec<Opened>, String> {
        wit::open(&wit::OpenOptions {
            types: types.iter().map(|t| t.to_string()).collect(),
            multiple,
            message: message.to_string(),
        })
    }

    /// Hand blob `blob` to the person as a file, in Lumi's Save panel with
    /// `name` filled in — `{date}` and `{time}` in it filled in from this
    /// Mac's clock — and wait for their answer: `true` once the file is
    /// written, `false` when they cancel. Where it went is theirs and is
    /// never told back. Only while answering a press; their time choosing
    /// is not counted against your run. [`storage::blob_save`] answers as
    /// soon as the panel is up; use this when what you do next depends on
    /// the file having been saved — closing what it was saved from.
    ///
    /// [`storage::blob_save`]: super::storage::blob_save
    pub fn save(blob: &str, name: &str) -> Result<bool, String> {
        wit::save(blob, name)
    }
}

/// Your extension's own rows in Lumi's menu bar menu, built while it runs.
/// Every function here needs the `menu` capability.
///
/// Lumi draws them in a section of their own after Recent: a submenu titled
/// with your extension's name and icon — or, when the whole tree is one
/// plain [`Entry::item`], that item on its own with your icon beside it, so
/// its label has to say what it does. Lumi keeps the last tree you set,
/// across restarts and updates, and draws it without running your code: set
/// it once when you are installed, and again whenever a row should change.
///
/// ```ignore
/// use lumi_extension_api::menu::{self, Entry};
///
/// fn draw(paused: bool) -> Result<(), String> {
///     menu::set(&[
///         Entry::item("show", "Show History…"),
///         Entry::check("pause", "Pause Recording", paused),
///         Entry::separator("s1"),
///         Entry::submenu("pins", "Pinned"),
///         Entry::item("pin.1", "hi@example.com").under("pins"),
///         Entry::item("count", "1,204 items").disabled(),
///     ])
/// }
/// ```
///
/// A press arrives at [`Guest::run_ui`](crate::Guest::run_ui) with the
/// window `:menu`; [`pressed`] reads it. It is something the person did, so
/// the handler may open a window or paste. Lumi never flips a check row
/// itself — set the tree again with the new state:
///
/// ```ignore
/// fn run_ui(window: String, request: String) -> Result<String, String> {
///     if let Some(id) = menu::pressed(&window, &request) {
///         if id == "pause" { /* flip your state, then */ draw(!paused)?; }
///         return Ok(String::new());
///     }
///     // … your windows' requests …
/// }
/// ```
///
/// At most 64 entries, ids of 1 to 64 bytes and unique, a `parent` that
/// names a submenu listed before it, and two levels of submenu below your
/// own. Switching your extension off hides the rows; uninstalling removes
/// them.
///
/// Needs Lumi 1.33.0 or later — say so with `min-lumi-version`.
pub mod menu {
    use super::lumi::ext::menu as wit;

    pub use wit::Kind;

    /// The `run-ui` window a press on one of your rows arrives as.
    pub const WINDOW: &str = ":menu";

    /// One row. Build it with the constructors, then [`Entry::under`],
    /// [`Entry::disabled`] as needed.
    #[derive(Debug, Clone, PartialEq, Eq)]
    pub struct Entry {
        pub id: String,
        pub parent: Option<String>,
        pub kind: Kind,
        pub label: String,
        pub enabled: bool,
        pub checked: bool,
        /// Set with [`Entry::icon`]; drawn by [`set_rows`] only.
        pub icon: Option<String>,
    }

    impl Entry {
        fn new(id: &str, kind: Kind, label: &str, checked: bool) -> Self {
            Entry {
                id: id.to_string(),
                parent: None,
                kind,
                label: label.to_string(),
                enabled: true,
                checked,
                icon: None,
            }
        }

        /// A row that is pressed.
        pub fn item(id: &str, label: &str) -> Self {
            Self::new(id, Kind::Item, label, false)
        }

        /// A row with a tick when `checked`.
        pub fn check(id: &str, label: &str, checked: bool) -> Self {
            Self::new(id, Kind::Check, label, checked)
        }

        /// A line between rows. Needs an id like every entry.
        pub fn separator(id: &str) -> Self {
            Self::new(id, Kind::Separator, "", false)
        }

        /// A row opening the entries put [`under`](Entry::under) it. One
        /// left empty is not drawn.
        pub fn submenu(id: &str, label: &str) -> Self {
            Self::new(id, Kind::Submenu, label, false)
        }

        /// Inside the submenu `parent`, which has to come earlier in the list.
        pub fn under(mut self, parent: &str) -> Self {
            self.parent = Some(parent.to_string());
            self
        }

        /// Dimmed and not pressable — a status line.
        pub fn disabled(mut self) -> Self {
            self.enabled = false;
            self
        }

        /// A glyph beside the row, spelled as a `[[command]]` icon is: a
        /// Lucide icon's name from Lumi's set (`"scan"`) or an `.svg` under
        /// your `ui/`. Drawn in the menu's own ink. On an item or a submenu
        /// only — a check row draws its tick. Needs [`set_rows`].
        pub fn icon(mut self, icon: &str) -> Self {
            self.icon = Some(icon.to_string());
            self
        }
    }

    /// Replace your whole tree. An empty slice is [`clear`]. Draws no icons:
    /// an entry given one is refused here, naming [`set_rows`].
    pub fn set(entries: &[Entry]) -> Result<(), String> {
        if let Some(entry) = entries.iter().find(|e| e.icon.is_some()) {
            return Err(format!(
                "menu::set draws no icons, and {:?} has one: use menu::set_rows, which needs Lumi 1.34.0",
                entry.id
            ));
        }
        let entries: Vec<wit::Entry> = entries
            .iter()
            .map(|e| wit::Entry {
                id: e.id.clone(),
                parent: e.parent.clone(),
                kind: e.kind,
                label: e.label.clone(),
                enabled: e.enabled,
                checked: e.checked,
            })
            .collect();
        wit::set(&entries)
    }

    /// [`set`], drawing each entry's [`icon`](Entry::icon). Needs Lumi
    /// 1.34.0 — say so with `min-lumi-version`. Apart from `set` because a
    /// build that calls a function asks Lumi for it when it loads: `set`
    /// reaching for this one too would make every extension with a menu
    /// need 1.34, icons or not.
    pub fn set_rows(entries: &[Entry]) -> Result<(), String> {
        let rows: Vec<wit::Row> = entries
            .iter()
            .map(|e| wit::Row {
                id: e.id.clone(),
                parent: e.parent.clone(),
                kind: e.kind,
                label: e.label.clone(),
                enabled: e.enabled,
                checked: e.checked,
                icon: e.icon.clone(),
            })
            .collect();
        wit::set_rows(&rows)
    }

    /// Take your rows out of the menu.
    pub fn clear() -> Result<(), String> {
        wit::clear()
    }

    /// The id of the row pressed, when `run_ui` was called for a press on
    /// your menu rather than by one of your windows.
    pub fn pressed(window: &str, request: &str) -> Option<String> {
        if window != WINDOW {
            return None;
        }
        let value: serde_json::Value = serde_json::from_str(request).ok()?;
        value.get("id")?.as_str().map(str::to_string)
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
