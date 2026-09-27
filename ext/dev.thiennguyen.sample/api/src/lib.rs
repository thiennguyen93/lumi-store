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
//! fallback only when `clipboard` is granted too), the clipboard pair
//! needs `clipboard`, `open_url` needs `applications` (plus `network` for
//! a web address), `fetch` needs `network`, and everything in [`config`]
//! needs `config`. `alert`, `settings` and `profiles` cost nothing but
//! budget — every host call spends from one per-run allowance, so a loop
//! of two hundred alerts ends the run's credit. [`about`] and [`license`]
//! cost nothing at all.
//!
//! **Bounds you are running under**, so a refusal reads as the mechanism
//! it is: a memory ceiling, a wall-clock deadline that stops a run that
//! computes too long, the host-call allowance above, and a cap on how many
//! bytes your answer may be. Hitting one is reported to the person as the
//! extension being stopped — never as Lumi crashing, which is the point of
//! the sandbox.
//!
//! The WIT world vendored under `wit/` is **0.1.0** — a wire commitment
//! from here, not a moving target. The copy the host builds against lives
//! in Lumi's own tree and CI holds the two byte-identical. A component
//! built against it installs on every Lumi that speaks 0.1. A breaking
//! change will bump the version, and a Lumi asked to install a component
//! built for a version it does not speak refuses it at install and says
//! which way to go — rebuild the extension, or update Lumi. Loading older
//! worlds alongside the current one is planned and not built: until it
//! is, a new world means rebuilding against the new crate.

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
pub use lumi::ext::app::{Edition, Info as About};
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

/// The pasteboard's plain text, or `None` when it holds no text — an
/// image, a file, or nothing at all are one answer here.
pub fn clipboard_text() -> Result<Option<String>, String> {
    lumi::ext::clipboard::read_text()
}

/// Put text on the pasteboard, replacing what was there.
pub fn set_clipboard_text(text: &str) -> Result<(), String> {
    lumi::ext::clipboard::write_text(text)
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
/// command. A name the manifest does not declare is refused here, by
/// name — the declaration is the grant.
pub fn open_window(name: &str) -> Result<(), String> {
    lumi::ext::ui::open_window(name)
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
}
