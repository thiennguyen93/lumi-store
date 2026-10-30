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
//! asked about — `screen` for Screen Recording, [`menu`] needs `menu`,
//! [`timers`] and [`schedules`] need `timers`, [`time_zone`] needs
//! `time-zone`, [`text_input`] needs `text-input` — and works only from the
//! `text-input` run, the one told a key —, [`front_app`] needs
//! `front-app`, [`microphone_use`] needs `microphone-use` — its `sites`
//! `microphone-sites` too — and [`offer`] needs `offer`. `alert`, `settings`, `profiles`, [`storage`],
//! [`owner`] and [`hyper_key_enabled`] cost nothing but budget — every host call spends
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
pub use lumi::ext::selection::{Found, Replaced};
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

/// Whether the selection in the frontmost application can be written over,
/// as Accessibility says: `Some(false)` for text nobody can edit there — a
/// web page, a terminal's scrollback — where [`replace_selection`] is
/// refused; `Some(true)` for a field or a document; `None` when the app says
/// neither, where [`replace_selection`] still types or pastes. Ask it before
/// offering to replace. Needs `accessibility` and Lumi 1.47.0.
pub fn selection_editable() -> Result<Option<bool>, String> {
    lumi::ext::selection::editable()
}

/// Put `replacement` where `expected` is selected in the frontmost
/// application — `expected` being the text [`selection`] answered, so a
/// selection the person has changed since is never written over. Answers
/// how it went in: `"accessibility"`, `"typed"` or `"pasted"`.
///
/// Through Accessibility where the app takes it; else typed when it is
/// short; else pasted, the board put back after — only when you also
/// declare `clipboard`. Refused, with nothing typed, where
/// [`selection_editable`] answers `Some(false)`, and since Lumi 1.59.0 where
/// `expected` holds U+FFFC — a picture in the selection, an image or an
/// emoji drawn as one, which no text written over it can put back: ask
/// `text.contains('\u{FFFC}')` before offering to replace. Your panels close
/// first.
///
/// Needs `accessibility` and `input`, and answers only something the person
/// did: a command, or a request from one of your windows. Needs Lumi 1.47.0.
pub fn replace_selection(expected: &str, replacement: &str) -> Result<String, String> {
    lumi::ext::selection::replace(expected, replacement)
}

/// [`replace_selection`], every rule of it, then the text written selected
/// again where it was written — whatever its length: "I love you" written
/// over as "tôi yêu em nhiều" is selected as those sixteen characters.
/// `Replaced::how` is [`replace_selection`]'s answer; `Replaced::selected`
/// is whether the text is selected now — false where the app gives no
/// place for a selection or rewrote the text on its way in, and the caret
/// is then where the write left it. Unlike [`replace_selection`], your panels
/// stay up — only one holding the keyboard gives it back first — so open
/// your panel beside the selection again after this, and it moves beside
/// the new one without blinking. Needs Lumi 1.48.0 — say so with
/// `min-lumi-version`.
pub fn replace_selection_and_select(expected: &str, replacement: &str) -> Result<Replaced, String> {
    lumi::ext::selection::replace_and_select(expected, replacement)
}

/// Copy the selection in the frontmost application the way that application
/// copies it — its own ⌘C — so the board holds what it puts there: the text
/// as it lays it out, and the formatting, links and pictures it keeps, which
/// no reading of the text carries. `true` once the board has changed;
/// `false` when nothing changed within a moment — nothing selected, or
/// nothing the app will copy. Unlike [`selection`]'s ⌘C, the board is not
/// put back: it is the person's copy, and a clipboard history keeps it as
/// one. Asked from one of your panels while it holds the keys, the keys are
/// lent to the app for the copy, as [`selection`] lends them. Refused with
/// one of Lumi's own windows in front.
///
/// Needs `clipboard`, `input` and `accessibility`, and answers only something
/// the person did: a command, or a request from one of your windows. Needs
/// Lumi 1.59.0 — say so with `min-lumi-version`.
pub fn copy_selection() -> Result<bool, String> {
    lumi::ext::selection::copy()
}

/// Whether you are told of the selections the person makes — the
/// `selection` event, and `keyboard-selection` (Lumi 1.50.0) — now: the
/// switch on your Permissions sheet, which the person and you both move.
/// Needs `selection-watch` and Lumi 1.47.0.
pub fn selection_watching() -> Result<bool, String> {
    lumi::ext::selection::watching()
}

/// Move that switch, for a setting of your own. The person moving it is
/// told to you as `selection-watching`; this call is not. Needs
/// `selection-watch` and Lumi 1.47.0.
pub fn set_selection_watching(on: bool) -> Result<(), String> {
    lumi::ext::selection::set_watching(on)
}

/// The names of the other extensions told of the person's selections now.
/// Lumi does not choose between you — each opens its own panel — so you can
/// say so, or offer to step aside. Needs `selection-watch` and Lumi 1.47.0.
pub fn selection_watchers() -> Result<Vec<String>, String> {
    lumi::ext::selection::watchers()
}

/// Lumi's own text transforms — UPPERCASE, Sort lines, Pretty-print JSON:
/// what a Transform selection shortcut offers — by name. Pure, so no
/// capability. Needs Lumi 1.47.0.
///
/// ```ignore
/// use lumi_extension_api::{selection, replace_selection, transforms};
///
/// let found = selection()?;
/// let shouted = transforms::apply("upper", &found.text)?;
/// replace_selection(&found.text, &shouted)?;
/// ```
pub mod transforms {
    use super::lumi::ext::transforms as wit;

    pub use wit::Transform;

    /// Every built-in transform, in the order Lumi lists them: its `id`,
    /// its `label` and its `group` (`"case"`, `"lines"` or `"encode"`).
    pub fn all() -> Result<Vec<Transform>, String> {
        wit::all()
    }

    /// `text` through the transform `id` names. Refused for an id [`all`]
    /// does not list and for text over 1 MiB; a transform that cannot do
    /// what it says — JSON that does not parse — answers why instead.
    pub fn apply(id: &str, text: &str) -> Result<String, String> {
        wit::apply(id, text)
    }
}

/// Translation on this Mac, with the translator built into macOS — the one
/// the Translate app uses. The text never leaves the Mac, so no capability.
/// Languages are BCP 47 ids as the system names them (`"en"`, `"vi"`,
/// `"zh-TW"`). Needs Lumi 1.51.0 and macOS 26; on an older macOS every
/// function answers why.
///
/// ```ignore
/// use lumi_extension_api::{selection, translation};
///
/// let found = selection()?;
/// // No source: Lumi's guess when it is sure. No target: the person's own
/// // first language that is not the text's.
/// let done = translation::translate(&translation::Request {
///     text: found.text,
///     source: None,
///     target: None,
///     quality: translation::Quality::Fast,
/// })?;
/// ```
pub mod translation {
    use super::lumi::ext::translation as wit;

    pub use wit::{Guess, Quality, Readiness, Request, Translated};

    /// Every language this Mac translates.
    pub fn languages() -> Result<Vec<String>, String> {
        wit::languages()
    }

    /// The person's own languages this Mac translates: the Mac's preferred
    /// languages in their order, then its region's language.
    pub fn preferred() -> Result<Vec<String>, String> {
        wit::preferred()
    }

    /// How ready this Mac is to translate `source` into `target`:
    /// installed, downloadable (macOS downloads it once, for every app) or
    /// unsupported.
    pub fn status(source: &str, target: &str) -> Result<Readiness, String> {
        wit::status(source, target)
    }

    /// Up to three guesses at the language of `text`, most likely first,
    /// each with its confidence from 0 to 1. A sentence is told reliably, a
    /// word or two often is not: weigh the confidence.
    pub fn detect(text: &str) -> Result<Vec<Guess>, String> {
        wit::detect(text)
    }

    /// `request.text` translated, line by line: blank lines, indents, and
    /// web and email addresses come back as they were. An empty `source` is
    /// Lumi's guess when it is at least 0.8 sure; an empty `target` is the
    /// first of [`preferred`] that is not the source. Refused over 20,000
    /// characters and for a pair that is not installed — each answers why.
    pub fn translate(request: &Request) -> Result<Translated, String> {
        wit::translate(request)
    }

    /// macOS's own prompt to download what `source` → `target` needs, and
    /// how ready the pair is once the person is done with it: still
    /// `Downloadable` when they declined, or while macOS downloads in the
    /// background — ask [`status`] again later. At the top of the screen,
    /// one at a time, taken down after two minutes unanswered. Only from a
    /// command or one of your windows.
    pub fn prepare(source: &str, target: &str) -> Result<Readiness, String> {
        wit::prepare(source, target)
    }
}

/// Words looked up in the dictionaries built into macOS — the ones the
/// Dictionary app shows. Only those the person turned on in Dictionary ›
/// Settings, in their order, so a lookup downloads nothing. Looked up on
/// this Mac, so no capability. Needs Lumi 1.55.0.
///
/// ```ignore
/// use lumi_extension_api::{dictionary, selection};
///
/// let found = selection()?;
/// // Every dictionary turned on, in the person's order.
/// for entry in dictionary::lookup(&found.text, &[])? {
///     let said = entry.pronunciations.first().map(|p| p.text.as_str()).unwrap_or("");
///     let first = entry.groups.first().and_then(|g| g.senses.first());
///     // `entry.text` is the whole entry as plain text, always there.
/// }
/// ```
pub mod dictionary {
    use super::lumi::ext::dictionary as wit;

    pub use wit::{Book, Entry, Example, Group, Notation, Pronunciation, Sense};

    /// The dictionaries the person turned on, in their order. Empty when
    /// they turned them all off, or on a macOS that no longer lets Lumi list
    /// them — where [`lookup`] still answers, in plain text, from the first.
    pub fn dictionaries() -> Result<Vec<Book>, String> {
        wit::dictionaries()
    }

    /// `text` looked up in `books` — ids from [`dictionaries`] — in that
    /// order; none named: every one, in the person's order. "houses" finds
    /// "house", case does not matter, phrases work. At most 8 entries a
    /// dictionary, 64 senses an entry and 3 examples a sense; empty when
    /// nothing matches. Refused over 256 characters and for a book that is
    /// not turned on.
    pub fn lookup(text: &str, books: &[String]) -> Result<Vec<Entry>, String> {
        wit::lookup(text, books)
    }

    /// Where the dictionaries' term around character `at` of `text` is, as
    /// a start and a length in characters — "running total" in a sentence —
    /// or `None`.
    pub fn term(text: &str, at: u32) -> Result<Option<(u32, u32)>, String> {
        wit::term(text, at)
    }

    /// The Dictionary app, brought forward at `text` — or, for empty text,
    /// as the person left it, where its Settings turn dictionaries on. Only
    /// from a command or one of your windows.
    pub fn show(text: &str) -> Result<(), String> {
        wit::show(text)
    }
}

/// Feature flags: names typed into Lumi's hidden Feature Flags screen, each
/// with a value and on or off. Hidden from this crate's documentation and
/// from Lumi's: not a part of the API anybody is promised. Lumi hands every
/// extension the same list and never learns which name you look for, and a
/// value is a string it gives no meaning — reading both is yours.
#[doc(hidden)]
pub mod flags {
    use super::lumi::ext::feature_flags as wit;

    pub use wit::Flag;

    /// The flags that are on, each its name and its value, as typed. Needs
    /// Lumi 1.56.0.
    pub fn enabled() -> Vec<Flag> {
        wit::enabled()
    }

    /// Whether the flag `name` is on — matched here, in your extension,
    /// exactly as typed, never in Lumi. Read [`enabled`] for any other rule.
    pub fn on(name: &str) -> bool {
        enabled().iter().any(|flag| flag.name == name)
    }

    /// The value of the flag `name` while it is on, exactly as typed —
    /// empty for a plain switch — or `None` when it is off or not there.
    /// Parse it however you like.
    pub fn value(name: &str) -> Option<String> {
        enabled().into_iter().find(|flag| flag.name == name).map(|flag| flag.value)
    }
}

/// The AI the person set up in Lumi — Apple Intelligence and the models on
/// their Mac, Claude Code on their own plan, providers on their own keys.
/// They choose the models in Settings › AI; you choose among them for each
/// of your features, and never see a key. Costs `ai`. Needs Lumi 1.52.0.
///
/// `system` is the model's instructions and `input` the text to work on,
/// always sent as data. Text that would leave the Mac waits on the person,
/// who may send it, run it on their Mac instead, or decline — a
/// `FailureKind::Declined`, nothing to show. Their limits and plan hold, and
/// a model that cannot run falls back, the answer's `fell_back` saying so.
///
/// ```ignore
/// use lumi_extension_api::{ai, alert, selection};
///
/// let found = selection()?;
/// match ai::complete(&ai::Request {
///     system: "Summarize the text in two sentences.".into(),
///     input: found.text,
///     model: None,
///     max_tokens: None,
///     thinking: ai::Thinking::Off,
///     answer_language: Some("same".into()),
///     format: ai::Format::Text,
/// }) {
///     Ok(answer) => alert(&answer.text)?,
///     Err(failure) if matches!(failure.kind, ai::FailureKind::Declined | ai::FailureKind::Stopped) => {}
///     Err(failure) => alert(&failure.message)?,
/// }
/// ```
pub mod ai {
    use super::lumi::ext::ai as wit;

    pub use wit::{Answer, Failure, FailureKind, Format, Model, Place, Request, Thinking, Usage};

    /// Whether a model answers now. Asks the engines on this Mac.
    pub fn ready() -> Result<bool, String> {
        wit::ready()
    }

    /// Make a model ready to answer. When none answers, Lumi offers the
    /// person the text model it would download for `language` (`None` for
    /// any), in its own panel with the model's size and licence, and
    /// answers once it is installed or the person said not now — `true`
    /// when a model answers then. Only from a press. Lumi 1.64.0.
    pub fn prepare(language: Option<&str>) -> Result<bool, String> {
        wit::prepare(language)
    }

    /// The models your extension may ask for now, the person's default
    /// first. `Model::id` is what `Request::model` takes.
    pub fn models() -> Result<Vec<Model>, String> {
        wit::models()
    }

    /// Ask, and wait for the whole answer — for a command, with no window
    /// to stream into. Only from a press: a command, a menu row or one of
    /// your windows.
    pub fn complete(request: &Request) -> Result<Answer, Failure> {
        wit::complete(request)
    }

    /// Ask, and have the answer streamed to your own windows as `lumi:ai`
    /// events, returning the call's id at once. Only from a press.
    pub fn start(request: &Request) -> Result<u64, Failure> {
        wit::start(request)
    }

    /// Stop call `id` wherever it is. False when no call of yours has it.
    pub fn cancel(id: u64) -> Result<bool, String> {
        wit::cancel(id)
    }
}

/// Speech to text: the microphone, what the Mac plays, both at once in a
/// call, or a recording in your storage, heard by the speech model the
/// person chose in Settings › AI. You get text, never the sound. Costs
/// `speech`; hearing the microphone costs `microphone` too, what the Mac
/// plays `system-audio`, and a call both. Needs Lumi 1.64.0.
///
/// One live recording at a time: `start` returns its id, and what is heard
/// comes to your own windows as `lumi:transcribe` events — each segment said
/// again as it grows (`partial`) and once more as its final, under one id —
/// until `stop`, the person's longest recording, or the person pressing
/// Stop beside your name in the menu bar. One app's sound is the person's
/// to pick, in Lumi's own panel; you are never told which.
///
/// ```ignore
/// use lumi_extension_api::{alert, transcribe};
///
/// // From a command: a recording in storage, heard whole.
/// let heard = transcribe::complete(&transcribe::Request {
///     source: transcribe::Source::Blob(blob),
///     languages: vec!["vi".into()],
///     model: None,
///     speakers: transcribe::Speakers::Off,
///     hints: vec![],
///     partials: false,
///     words: false,
///     max_seconds: None,
/// });
/// match heard {
///     Ok(transcript) => alert(&transcript.text)?,
///     Err(failure) if failure.kind == transcribe::FailureKind::Unprepared => {
///         transcribe::prepare("vi", transcribe::Speakers::Off)?;
///     }
///     Err(failure) if failure.kind == transcribe::FailureKind::Stopped => {}
///     Err(failure) => alert(&failure.message)?,
/// }
/// ```
pub mod transcribe {
    use super::lumi::ext::transcribe as wit;

    pub use super::lumi::ext::translation::Readiness;
    pub use wit::{Failure, FailureKind, Heard, Levels, Model, Place, Playing, Request, Segment, Source, Speaker, Speakers, Transcript, Word};

    /// How ready this Mac is to hear `language` (`""` for any) with
    /// `speakers`: `Installed` when a model runs now, `Downloadable` when
    /// Lumi can download one, `Unsupported` otherwise. With speakers told
    /// apart or named, as ready as the less ready of the speech model and
    /// the speakers model; `Speakers::Named` costs `voices`.
    pub fn status(language: &str, speakers: Speakers) -> Result<Readiness, String> {
        wit::status(language, speakers)
    }

    /// The speech models you may ask for, the person's default first.
    /// `Model::id` is what `Request::model` takes.
    pub fn models() -> Result<Vec<Model>, String> {
        wit::models()
    }

    /// Have Lumi offer the person the speech model it would pick for
    /// `language`, in its own panel, and answer once it is installed or they
    /// said not now. Only from a press.
    pub fn prepare(language: &str, speakers: Speakers) -> Result<Readiness, String> {
        wit::prepare(language, speakers)
    }

    /// [`status`] for a recording heard among `languages` (none for any),
    /// as a `Request` with those `languages` is: Apple Speech, which hears
    /// one language at a time, counts only when there is one. Ask it with
    /// the list you will start with. Lumi 1.65.0 or later.
    pub fn status_for(languages: &[&str], speakers: Speakers) -> Result<Readiness, String> {
        wit::status_for(&languages.iter().map(|l| l.to_string()).collect::<Vec<_>>(), speakers)
    }

    /// [`prepare`] for a recording heard among `languages`: the model Lumi
    /// offers hears them all. Only from a press. Lumi 1.65.0 or later.
    pub fn prepare_for(languages: &[&str], speakers: Speakers) -> Result<Readiness, String> {
        wit::prepare_for(&languages.iter().map(|l| l.to_string()).collect::<Vec<_>>(), speakers)
    }

    /// Hear a recording in your storage (`Source::Blob`) and wait for the
    /// whole transcript — for a command, with no window to stream into.
    /// Only from a press.
    pub fn complete(request: &Request) -> Result<Transcript, Failure> {
        wit::complete(request)
    }

    /// Start hearing any source, what is heard streamed to your own windows
    /// as `lumi:transcribe` events; returns the recording's id at once. Only
    /// from a press.
    pub fn start(request: &Request) -> Result<u64, Failure> {
        wit::start(request)
    }

    /// [`start`], going on from the voices of `previous`, an earlier
    /// recording of yours: a voice heard there keeps its label, a new one is
    /// numbered after them. Live, with speakers told apart, and within ten
    /// minutes of `previous` ending; otherwise as [`start`]. The `started`
    /// event says `continues` when it went on. Only from a press.
    pub fn start_after(request: &Request, previous: u64) -> Result<u64, Failure> {
        wit::start_after(request, previous)
    }

    /// Stop recording `id`: what was said up to now is still heard, and its
    /// transcript told. False when no recording of yours has it.
    pub fn stop(id: u64) -> Result<bool, String> {
        wit::stop(id)
    }

    /// Throw recording `id` away: nothing more of it is heard or told.
    /// False when no recording of yours has it.
    pub fn cancel(id: u64) -> Result<bool, String> {
        wit::cancel(id)
    }

    /// Go on hearing live recording `id` with `model` — an id from
    /// [`models`], or the person's default for `None` — without stopping
    /// it. The model hearing now goes on until the new one is ready, then
    /// every utterance after is the new model's; your windows hear
    /// `switched`. Answers the model hearing now. Refused, the model before
    /// goes on: [`FailureKind::Unprepared`] for one that cannot hear now,
    /// [`FailureKind::Declined`] where the person kept the voice on this
    /// Mac. Only from a press.
    pub fn switch(id: u64, model: Option<&str>) -> Result<Model, Failure> {
        wit::switch(id, model)
    }
}

/// The people your recordings name by their voice. Lumi keeps each voice —
/// a print of how they sound and a few seconds of them speaking, encrypted,
/// on this Mac only — and you get its id and name, never the sound or the
/// print. A recording with `Speakers::Named` names a remembered voice in
/// each segment's `speaker`; no other extension recognizes the voices you
/// remember, and the person can rename or forget any of them on your
/// extension's page in Settings › AI › Extensions & Privacy, which your
/// windows hear as `lumi:voices`. Costs `voices`,
/// declared beside `speech`. Needs Lumi 1.64.0.
///
/// ```ignore
/// use lumi_extension_api::voices;
///
/// // From a press in your window, beside "Speaker 2" of recording `id`:
/// match voices::remember(id, 1, "Linh")? {
///     voices::Answer::Remembered(voice) | voices::Answer::Already(voice) => keep(voice.id),
///     voices::Answer::Cancelled => {}
/// }
/// ```
pub mod voices {
    use super::lumi::ext::voices as wit;

    pub use wit::{Answer, HeldVoice, Voice};

    /// The voices you keep, in the order they were remembered.
    pub fn list() -> Result<Vec<Voice>, String> {
        wit::list()
    }

    /// Ask to remember voice `label` of recording `recording` — a
    /// `transcribe::start` id, or a transcript's — as `name`. Lumi asks the
    /// person in its own panel, with the voice's seconds to play first; it
    /// needs at least five seconds of the voice, from a recording that told
    /// speakers apart, while Lumi still keeps what it heard: as it records
    /// and for ten minutes after, while your windows are open. A voice you
    /// already keep answers `Already`, unasked. Only from a press.
    pub fn remember(recording: u64, label: u32, name: &str) -> Result<Answer, String> {
        wit::remember(recording, label, name)
    }

    /// The voices of `recording`, one of yours, that [`remember`] could take
    /// now — each with how much of it Lumi keeps and whether that is
    /// `enough` — so you offer to save a voice only where it would work.
    /// Empty once Lumi keeps nothing of the recording: ten minutes after it
    /// ended, when your windows closed, or when Lumi restarted. Lumi 1.65.0
    /// or later.
    pub fn held(recording: u64) -> Result<Vec<HeldVoice>, String> {
        wit::held(recording)
    }

    /// Call voice `id` `name`. False when you keep no such voice. Only from
    /// a press.
    pub fn rename(id: &str, name: &str) -> Result<bool, String> {
        wit::rename(id, name)
    }

    /// Forget voice `id`: its print, its seconds and its name. False when
    /// you keep no such voice.
    pub fn forget(id: &str) -> Result<bool, String> {
        wit::forget(id)
    }
}

/// Recordings made into files of your own: what Lumi hears, compressed and
/// written as an M4A blob in your storage when the recording ends. Needs the
/// `keep-audio` capability, beside `microphone` or `system-audio` — and
/// nothing of `speech`; [`longest_minutes`](recordings::longest_minutes) and
/// [`set_longest_minutes`](recordings::set_longest_minutes) need only the
/// source, since they cap a transcription too.
pub mod recordings {
    use super::lumi::ext::recordings as wit;

    pub use super::lumi::ext::transcribe::{Failure, FailureKind, Playing};
    pub use wit::{Kept, Request, Source};

    /// Record what `request` hears, answering at once the id of the blob it
    /// becomes in your [`storage`](super::storage) once it ends — an M4A
    /// file, yours to read, play from `/__lumi__/blob/<id>`, save, write
    /// into a folder or delete like any blob. Your pages hear
    /// `recording-started`, `level` where asked, and `recorded` or
    /// `recording-failed` (`lumi:recordings`). It records until you stop it,
    /// the person stops it from the menu bar, it reaches `max_seconds` or the
    /// person's longest recording, no page of yours is left, the Mac sleeps
    /// or locks, or you are switched off. One recording at a time, a transcription included. Costs
    /// `keep-audio` and the source's own word. Only from a press.
    pub fn start(request: &Request) -> Result<String, Failure> {
        wit::start(*request)
    }

    /// Stop recording `id`, keeping what it heard. False when it is not
    /// going.
    pub fn stop(id: &str) -> Result<bool, String> {
        wit::stop(id)
    }

    /// Stop recording `id` and keep nothing of it. False when it is not
    /// going.
    pub fn cancel(id: &str) -> Result<bool, String> {
        wit::cancel(id)
    }

    /// Keep what live transcription `recording` — a `transcribe::start` id —
    /// hears, on the transcript's own clock, answering at once the ids of the
    /// blobs it becomes when the transcription ends: [`Kept::audio`], every
    /// stream mixed into one channel, and for a call [`Kept::sides`], its
    /// two sides apart in a file of two channels — the microphone in the
    /// first, what the Mac played in the second. Call it in the same run as
    /// the start. Refused for a transcription that is not yours, not live or
    /// over. Only from a press.
    pub fn keep(recording: u64) -> Result<Kept, String> {
        wit::keep(recording)
    }

    /// How long a live recording of yours may run, in minutes — this
    /// module's and a live `transcribe::start` alike: one number kept by
    /// Lumi, starting at your manifest's `longest-recording-minutes` (30
    /// where it says none), that the Longest recording field on your
    /// Permissions sheet and [`set_longest_minutes`] both move. Your pages
    /// hear `lumi:longest-recording` whenever it moves. Needs `microphone`
    /// or `system-audio`, not `keep-audio`. Lumi 1.65.0.
    pub fn longest_minutes() -> Result<u32, String> {
        wit::longest_minutes()
    }

    /// Set your longest recording, 1 to 480 minutes — for a Longest
    /// recording in your own settings. A recording already going keeps the
    /// length it started with. Needs `microphone` or `system-audio`. Lumi
    /// 1.65.0.
    pub fn set_longest_minutes(minutes: u32) -> Result<(), String> {
        wit::set_longest_minutes(minutes)
    }
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
/// internals and no network of its own: it talks to your extension through `fetch`
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

/// [`open_window`], `after_ms` milliseconds from now — from the run of a
/// `selection` or `keyboard-selection` event only, as its one opening of
/// the panel beside that selection. Answers at once; the panel opens when
/// the time is up unless the person has pressed, typed or scrolled since,
/// or the selection is two seconds old. For a panel that waits for the
/// person to finish: a double-click may yet become a triple-click, within
/// the event's `clickInterval`. At most 1000; 0 is [`open_window`]. Needs
/// Lumi 1.50.0.
pub fn open_window_after(name: &str, after_ms: u32) -> Result<(), String> {
    lumi::ext::ui::open_window_after(name, after_ms)
}

/// Close one of your own windows by its manifest `name` — a panel's Esc.
/// One that is not open is not an error.
///
/// However a window of yours leaves the screen for good — this, a panel's
/// Esc or click-away, a [`paste`] taking it down, the person's red button —
/// `events = ["window-closed"]` tells [`Guest::on_event`], once per close,
/// with `{"v":1, "window":<its manifest name>, "at":<ms since the Unix
/// epoch>}`. Never for [`hide_window`]. It needs no capability, and Lumi
/// 1.37.0 or later — say so with `min-lumi-version`.
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

/// Take one of your own windows off screen without closing it, by its
/// manifest `name`: its page keeps running and keeps everything in it, where
/// [`close_window`] ends a window's page and blanks a panel's (unless the
/// panel declares `keep-alive`, whose page is only hidden). `true` when it
/// was on screen and is off it now; one already off screen, closed or never
/// opened answers `false` and is left as it is — and so does one in full
/// screen, which has a Space of its own: taken away, it would leave the person
/// on an empty one. [`show_window`] puts it back.
///
/// For getting out of the way of something on the screen — an editor while
/// Lumi reads the text under it, heard as the `screen-capture` event:
///
/// ```ignore
/// fn on_event(name: String, payload: String) -> Result<(), String> {
///     if name == "screen-capture" {
///         if payload.contains(r#""phase":"start""#) {
///             lumi_extension_api::hide_window("editor")?;
///         } else {
///             lumi_extension_api::show_window("editor")?;
///         }
///     }
///     Ok(())
/// }
/// ```
///
/// Works from [`Guest::on_event`]. Needs Lumi 1.36.0 or later — say so with
/// `min-lumi-version`.
pub fn hide_window(name: &str) -> Result<bool, String> {
    lumi::ext::ui::hide_window(name)
}

/// Put back one of your own windows [`hide_window`] took off screen: where it
/// stood among everybody's windows, and with the keyboard if it had it.
/// `true` when it did. Any other window answers `false` and is left as it is
/// — this restores, it never opens — and one the person opened or closed in
/// between stays as they left it. Works from [`Guest::on_event`]. Needs Lumi
/// 1.36.0 or later.
pub fn show_window(name: &str) -> Result<bool, String> {
    lumi::ext::ui::show_window(name)
}

/// [`show_window`], on the display your window `beside` stands on now: the
/// window comes back at the place it had on its own display — as far from
/// the same edges — held inside that one. On the same display, or with
/// `beside` not on screen, it is [`show_window`]. For a window stepped aside
/// in favour of a smaller one the person can carry to another display — a
/// browser minimized to a pill — which should come back where that one is:
///
/// ```no_run
/// // The pill pressed: the browser back on the pill's display, the pill gone.
/// lumi_extension_api::show_window_on("browser", "pill")?;
/// lumi_extension_api::close_window("pill")?;
/// # Ok::<(), String>(())
/// ```
///
/// `false` for a window [`hide_window`] did not take away, which does not
/// move. Both are names your manifest declares. Works from
/// [`Guest::on_event`]. Needs Lumi 1.65.0 or later.
pub fn show_window_on(name: &str, beside: &str) -> Result<bool, String> {
    lumi::ext::ui::show_window_on(name, beside)
}

/// [`open_window`], on the display your window `beside` stands on now. A
/// window that opens where it was left (`remember-frame`) opens at that place
/// carried to this display — as far from the same edges, held inside — and
/// one that opens at a corner or in the middle opens at that one of this
/// display; one that opens at the pointer or a selection opens there, as
/// ever. For a smaller window standing in for a bigger one, opened as the
/// bigger one is put away — a browser minimized to a pill — which should
/// appear on the display the person was looking at:
///
/// ```no_run
/// // Minimize: the pill on the browser's display, then the browser away.
/// lumi_extension_api::open_window_on("pill", "browser")?;
/// lumi_extension_api::hide_window("browser")?;
/// # Ok::<(), String>(())
/// ```
///
/// One already up is focused where it stands, as [`open_window`] does; with
/// `beside` not on screen, or on the same display, it is [`open_window`].
/// Both are names your manifest declares. Needs Lumi 1.65.0 or later.
pub fn open_window_on(name: &str, beside: &str) -> Result<(), String> {
    lumi::ext::ui::open_window_on(name, beside)
}

/// Bring up Lumi's Settings on your extension's Settings tab — for a
/// "Settings…" in one of your windows. Only for a press.
pub fn open_settings() -> Result<(), String> {
    lumi::ext::ui::open_settings()
}

/// Switch your extension off, as the switch beside it under Extensions in
/// Lumi's Settings does — for a "Quit" of your own. Your windows close, your
/// menu bar item and rows go, and none of your code runs until the person
/// switches it on again there; you cannot switch yourself back on. Only for
/// a press — a command, a menu bar row or one of your windows. Needs Lumi
/// 1.61.0 or later.
pub fn switch_off() -> Result<(), String> {
    lumi::ext::ui::switch_off()
}

/// Bring up Lumi's Settings on your extension with its Permissions sheet
/// open — what it may reach, and the switches Lumi keeps over it: its
/// folders, its menu bar rows, loading its panels ahead. Only for a press.
/// Needs Lumi 1.44.0 or later.
pub fn open_permissions() -> Result<(), String> {
    lumi::ext::ui::open_permissions()
}

/// Whether Lumi loads your panels ahead — those whose `[[window]]` says
/// `preload = true` — as your extension is loaded: at launch, once installed
/// or updated, when switched on. One switch, kept by Lumi — on from install
/// unless the manifest says `preload-default = false`, then where it was
/// left — that your own settings move with [`set_preload_enabled`] and
/// the person moves with the Preload switch on your Permissions sheet.
/// Off, such a panel loads at its first opening instead, and keeps its page
/// from then on (`keep-alive`). Works from [`Guest::on_event`] too. Declare
/// `events = ["preload-enabled"]` to be told when the person moves it on the
/// sheet, with `{"v":1, "enabled":bool, "at":<ms since the Unix epoch>}`.
/// Needs the `preload` capability, and is refused for an extension none of
/// whose panels says `preload`. Needs Lumi 1.45.0 or later — say so with
/// `min-lumi-version`.
pub fn preload_enabled() -> Result<bool, String> {
    lumi::ext::ui::preload_enabled()
}

/// Turn loading ahead on or off — the switch [`preload_enabled`] reads, for a
/// "Start when Lumi opens" in your own settings. On, your panels are loaded
/// ahead now; off, a page loaded ahead and not opened yet is let go. From any
/// run but an uninstall. Needs the `preload` capability, and is refused for an
/// extension none of whose panels says `preload`. Needs Lumi 1.45.0 or later.
pub fn set_preload_enabled(on: bool) -> Result<(), String> {
    lumi::ext::ui::set_preload_enabled(on)
}

/// Put your own words on one of the tabs of your page in Lumi's Settings →
/// Extensions — for a page shown in the language the person picked, whose
/// tabs should follow it. `tab` is named as a call from it arrives:
/// `":about"`, `":settings"`, `":shortcuts"`, `":changelog"` or
/// `":page:<name>"`; `None` puts back your manifest's label. Held to the
/// manifest's rules for a label — up to 24 characters, one line, never
/// Permissions or the name of another of Lumi's tabs (the tab's own back is
/// fine), no two tabs alike — and refused for a tab your manifest does not
/// draw. Lumi keeps it across restarts and updates, so set it from
/// [`Guest::on_lifecycle`] and wherever the language changes; the same label
/// again is no change. The Permissions sheet keeps your manifest's words. A
/// page can do the same itself with `POST /__lumi__/tab-label`. From any run
/// but an uninstall; no capability. Needs Lumi 1.61.0 or later — say so with
/// `min-lumi-version`.
///
/// ```ignore
/// let settings = if lumi::setting("language").as_deref() == Some("vi") { "Cài đặt" } else { "Settings" };
/// lumi::set_tab_label(":settings", Some(settings))?;
/// ```
pub fn set_tab_label(tab: &str, label: Option<&str>) -> Result<(), String> {
    lumi::ext::ui::set_tab_label(tab, label)
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

/// Choose where beside the selection one of your panels declared
/// `position = "selection"` stands from its next opening — `at` one of
/// `"start"`, `"end"`, `"center"` or `"pointer"`, `side` `"above"`,
/// `"below"` or `"pointer"` (the side of the selection the pointer is at,
/// Lumi 1.48.0), the manifest's `anchor` words — for a setting that lets the
/// person choose. Call it before `open_window`. Words only: Lumi measures the
/// selection and places the panel against the part of it named. For a panel
/// at `position = "menu-bar-item"`, `at` is which of the item's edges it
/// lines up with, and `side` `"below"` or `""` — it always goes below (Lumi
/// 1.61.0). For a panel at `position = "window"`, `at` is which of the other
/// window's edges it lines up with and `side` `"above"` or `"below"`; the
/// window stays the manifest's (Lumi 1.66.0). A panel at any other position
/// is refused. Needs Lumi 1.47.0 or later — say so with `min-lumi-version`.
pub fn set_anchor(name: &str, at: &str, side: &str) -> Result<(), String> {
    lumi::ext::ui::set_anchor(name, at, side)
}

/// Choose light or dark for one of your panels — "light", "dark" or
/// "system" — for a theme setting. Applies at once if the panel is up, and
/// Lumi keeps it across a restart and an update (Lumi 1.61.0), so set it
/// when the setting changes, not before every showing.
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

/// Bring one of your windows that is up to the front of the windows at its
/// level, without the keyboard: the window holding it keeps it. For windows
/// of yours that overlap, ordered as you say. Levels still stand: a panel
/// up with the keyboard sits above pinned panels, whatever you raise under
/// it. Only a window that is up, from a request your page sends on a press.
/// Needs Lumi 1.41.0 or later — say so with `min-lumi-version`.
pub fn raise_window(name: &str) -> Result<(), String> {
    lumi::ext::ui::raise_window(name)
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
/// 180–1200 for a window and 120–1600 by 32–1200 for a panel (Lumi 1.47.0),
/// as the manifest's `width` and `height` are; answers the size it became.
/// A panel at a corner keeps that corner and grows away from it; a panel
/// beside the selection keeps the edge facing it; anything else keeps its
/// top-left. The next open starts at the manifest's size again. A page can
/// do the same itself with `POST /__lumi__/size`.
/// Needs Lumi 1.34.0 or later — say so with `min-lumi-version`.
pub fn set_size(name: &str, width: f64, height: f64) -> Result<Size, String> {
    lumi::ext::ui::set_size(name, width, height)
}

/// What [`set_size`] answers: the content size a window became.
pub use lumi::ext::ui::Size;

/// Send `message` (JSON text) to one of your own windows or pages — a
/// window by its manifest `name`, or `":about"`, `":settings"`,
/// `":page:<name>"`. The page hears it as a `lumi:message` event whose
/// `detail` is the JSON. `Ok(false)`: not on screen, nothing sent — but a
/// panel put away that keeps its page (`keep-alive`, Lumi 1.45) is told. Works
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

/// Save one setting, as your Settings page would: for a menu row that
/// switches it — `set_setting("method", "vni")` — without the person opening
/// the page. Held to the field's own rules, filed under the live profile
/// for a field declared `scope = "profile"`, and told to your pages; the
/// rest of this run's [`settings`] read the new value. Only for something
/// the person did: a command, a menu bar row or one of your windows. Needs
/// Lumi 1.61.0.
pub fn set_setting(name: &str, value: &str) -> Result<(), String> {
    let mut values = serde_json::Map::new();
    values.insert(name.to_string(), serde_json::Value::String(value.to_string()));
    lumi::ext::settings::write(&serde_json::Value::Object(values).to_string())
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
    /// which your component's own clock does not give: it is UTC. The name
    /// filled in is not told back: this costs no capability, and Lumi lets a
    /// component learn the time zone only through one that says so —
    /// [`time_zone`](crate::time_zone), and [`timers`](crate::timers), whose
    /// clock times fire on the person's clock.
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

/// macOS's own "is it you?" dialog — Touch ID, an Apple Watch or the login
/// password — before you show or do something only the Mac's owner should,
/// from a run with no page to ask from: a command, a menu bar row. A page
/// asks for the same dialog itself with `POST /__lumi__/authenticate`. Lumi
/// puts it up with your extension's name in it and answers yes or no; what a
/// yes unlocks is yours to decide and to forget again. No capability; every
/// call costs budget. Needs Lumi 1.37.0.
///
/// ```ignore
/// use lumi_extension_api::owner;
///
/// if owner::authenticate("delete every saved item")? {
///     // The person at the Mac is its owner: do it.
/// }
/// ```
pub mod owner {
    use super::lumi::ext::owner as wit;

    /// Whether the dialog can be shown on this Mac at all — a password is
    /// set — without showing it, so you offer what needs it only where it
    /// works.
    pub fn available() -> Result<bool, String> {
        wit::available()
    }

    /// Ask, and wait for the person: `true` once they confirm, `false` when
    /// they cancel, fail, or leave it two minutes. `reason` finishes macOS's
    /// "Lumi is trying to …", one line of at most 120 characters; Lumi adds
    /// your extension's name. An error, never a yes, when another dialog is
    /// up or this one cannot be shown — treat it as a no. Only while
    /// answering a press; their time answering is not counted against your
    /// run.
    pub fn authenticate(reason: &str) -> Result<bool, String> {
        wit::authenticate(reason)
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

    /// Whether your rows show in Lumi's menu bar menu: one switch, kept by
    /// Lumi, that your own settings move with [`set_shown`] and the person
    /// moves with the Menu bar switch on your Permissions sheet. Off, [`set`]
    /// goes on keeping your tree, and it comes back as you left it when the
    /// switch is on again. Declare `events = ["menu-shown"]` to be told in
    /// [`Guest::on_event`](crate::Guest::on_event) when the person moves it
    /// on the sheet, with `{"v":1, "shown":bool, "at":<ms since the Unix
    /// epoch>}`. Needs `menu` and Lumi 1.44.0.
    pub fn shown() -> Result<bool, String> {
        wit::shown()
    }

    /// Show or hide your rows — the switch [`shown`] reads and the person's
    /// Menu bar switch on your Permissions sheet moves, for a "Show in the
    /// menu bar" in your own settings. Your tree is kept either way. From any
    /// run but an uninstall. Needs `menu` and Lumi 1.45.0 — say so with
    /// `min-lumi-version`.
    pub fn set_shown(shown: bool) -> Result<(), String> {
        wit::set_shown(shown)
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

/// An item of your own in the menu bar, beside Lumi's icon: an icon, a few
/// characters, or both — a state somebody wants at a glance without opening
/// a menu.
///
/// ```ignore
/// use lumi::menu_bar_item::{self, Item};
///
/// menu_bar_item::set(&Item::icon("globe").text("VI").tooltip("Typing in Vietnamese"))?;
/// ```
///
/// Lumi keeps the last item you set, across restarts and updates, and draws
/// it with none of your code running; switching your extension off takes it
/// away, uninstalling forgets it. A press on it opens a menu Lumi draws: your
/// extension's name (left out with `menu-bar-item-heading = false` in your
/// manifest), then your [`menu`](crate::menu) tree when you declare `menu`,
/// then "Settings…", onto your Settings tab in Lumi — "Open in Lumi…", onto
/// your page, when you draw no Settings tab — (left out with
/// `menu-bar-item-settings = false`, unless your menu has no enabled row of
/// its own) — so a press on it means what your rows already say. The person can ⌘-drag it where they want it,
/// and it keeps that place.
///
/// A menu bar too full for every item hides the ones that do not fit, as
/// macOS does for any app's — beside a notch, most often — and tells nobody.
/// The person decides which stay.
///
/// Needs the `menu-bar-item` capability and Lumi 1.61.0 or later — say so
/// with `min-lumi-version`.
pub mod menu_bar_item {
    use super::lumi::ext::menu_bar_item as wit;

    /// What the item shows. Build it with [`Item::icon`] or
    /// [`Item::text_only`], then [`Item::text`] and [`Item::tooltip`] as
    /// needed.
    #[derive(Debug, Clone, Default, PartialEq, Eq)]
    pub struct Item {
        pub icon: Option<String>,
        pub text: Option<String>,
        pub tooltip: Option<String>,
        /// A loop for the icon to play: [`Item::frames`].
        pub frames: Option<Frames>,
    }

    /// A loop for the item's icon: its frames in order, each spelled as
    /// [`Item::icon`] is, and how many a second.
    #[derive(Debug, Clone, PartialEq, Eq)]
    pub struct Frames {
        pub icons: Vec<String>,
        pub per_second: u8,
    }

    impl Item {
        /// An item drawn as an icon, spelled as a `[[command]]` icon is: a
        /// Lucide icon's name from Lumi's set (`"globe"`), or an `.svg`
        /// under your `ui/` of at most 64 KiB. Drawn 18 points tall in the
        /// menu bar's own ink, whatever colours the file has, and no wider
        /// than twice its height.
        pub fn icon(icon: &str) -> Self {
            Item {
                icon: Some(icon.to_string()),
                ..Item::default()
            }
        }

        /// An item drawn as text: at most 16 characters on one line.
        pub fn text_only(text: &str) -> Self {
            Item {
                text: Some(text.to_string()),
                ..Item::default()
            }
        }

        /// Text beside the icon: at most 16 characters on one line.
        pub fn text(mut self, text: &str) -> Self {
            self.text = Some(text.to_string());
            self
        }

        /// What a pointer resting on the item reads: at most 120 characters.
        /// Your extension's name without one.
        pub fn tooltip(mut self, tooltip: &str) -> Self {
            self.tooltip = Some(tooltip.to_string());
            self
        }

        /// Play the icon as a loop, to show that something is going on:
        /// `icons` in order, each spelled as [`Item::icon`] is, `per_second`
        /// of them a second — 2 to 24 frames, 1 to 12 a second. Lumi plays
        /// it with nothing asked of you per frame, and draws [`Item::icon`]
        /// still while Reduce Motion is on (the first frame without one). An
        /// item set again with the same frames and other text keeps the loop
        /// going where it was. Needs Lumi 1.65.0.
        pub fn frames(mut self, icons: &[&str], per_second: u8) -> Self {
            self.frames = Some(Frames {
                icons: icons.iter().map(|icon| icon.to_string()).collect(),
                per_second,
            });
            self
        }
    }

    /// Draw your item, or change it. The same item again is no change, so
    /// you may set it from every run — an event that may or may not have
    /// changed what it shows.
    ///
    /// An item with [`Item::frames`] plays them (`set-animated`); one
    /// without stops a loop set before.
    pub fn set(item: &Item) -> Result<(), String> {
        let still = wit::Item {
            icon: item.icon.clone(),
            text: item.text.clone(),
            tooltip: item.tooltip.clone(),
        };
        match &item.frames {
            Some(frames) => wit::set_animated(
                &still,
                &wit::Frames {
                    icons: frames.icons.clone(),
                    per_second: frames.per_second,
                },
            ),
            None => wit::set(&still),
        }
    }

    /// Take your item out of the menu bar.
    pub fn clear() -> Result<(), String> {
        wit::clear()
    }

    /// Whether your item shows: one switch, kept by Lumi, that your own
    /// settings move with [`set_shown`] and the person moves with the "Show
    /// its own item in the menu bar" switch on your Permissions sheet. Off, [`set`] goes on
    /// keeping your item, and it comes back as you left it when the switch
    /// is on again. Declare `events = ["menu-bar-item-shown"]` to be told in
    /// [`Guest::on_event`](crate::Guest::on_event) when the person moves it,
    /// with `{"v":1, "shown":bool, "at":<ms since the Unix epoch>}`.
    pub fn shown() -> Result<bool, String> {
        wit::shown()
    }

    /// Show or hide your item — the switch [`shown`] reads, for a "Show in
    /// the menu bar" in your own settings. Your item is kept either way. From
    /// any run but an uninstall.
    pub fn set_shown(shown: bool) -> Result<(), String> {
        wit::set_shown(shown)
    }
}

/// Your extension's own timers: Lumi runs your
/// [`Guest::on_event`](crate::Guest::on_event) with `"timer"` at the times you
/// set — with every one of your windows closed, and after Lumi restarts.
///
/// A timer is a name of yours, a [`When`] and a [`Repeat`]. Lumi keeps them on
/// the Mac, across restarts and updates, and never learns what one is for;
/// switching your extension off holds them, uninstalling removes them. Setting
/// a name again replaces the timer of that name.
///
/// ```ignore
/// use lumi::timers::{self, Clock, Repeat, When};
///
/// // Every day as the Mac's clock reaches 00:00.
/// timers::set("day", When::Clock(Clock { date: None, hour: 0, minute: 0 }), Repeat::Daily)?;
/// // Once, an hour from now.
/// timers::set("later", When::After(60 * 60 * 1000), Repeat::Once)?;
/// ```
///
/// One that came due while the Mac slept, Lumi was quit or your extension was
/// off fires once, as soon as it can, with [`Fired::late`] set and the repeats
/// it folded in counted in [`Fired::missed`]. A firing is told at least once —
/// one Lumi could not finish telling is told again — so a run that must not
/// act twice keeps its own note of what it did. Its run is any event's: no
/// window opens from it; [`alert`](crate::alert), [`post`](crate::post) to an
/// open window, [`menu`](crate::menu) and [`storage`](crate::storage) all work.
///
/// At most 128 timers; a name is 1–128 bytes with no control characters, kept
/// as you wrote it — keep anything secret in [`storage`](crate::storage), not
/// in a name. A time less than 30 seconds ahead is set 30 seconds ahead; one
/// more than five years ahead is refused, as is [`Repeat::Every`] under 30
/// seconds.
///
/// Your component's clock is UTC. A [`Clock`] time is read on the Mac's clock,
/// in the person's time zone, and moves when the zone or the clock changes —
/// which is how a timer set on it tells you where the person is, and one
/// reason these need a capability. To read the zone itself, see
/// [`time_zone`](crate::time_zone).
///
/// Needs the `timers` capability, `events = ["timer"]` in your manifest, and
/// Lumi 1.59.0 — say so with `min-lumi-version`.
pub mod timers {
    use super::lumi::ext::timers as wit;

    pub use wit::{Clock, Day, Listed, Repeat, Timer, When};

    /// The [`Guest::on_event`](crate::Guest::on_event) name a timer fires as.
    pub const EVENT: &str = "timer";

    /// Set the timer called `name`, replacing one of that name.
    pub fn set(name: &str, when: When, repeat: Repeat) -> Result<(), String> {
        wit::set(name, when, repeat)
    }

    /// Remove the timer called `name`; `true` when there was one.
    pub fn cancel(name: &str) -> Result<bool, String> {
        wit::cancel(name)
    }

    /// Every timer still to fire, by name, each with `due`, when it next
    /// fires in milliseconds since the Unix epoch. An `After` reads back as
    /// the `At` it named. A timer firing once is not listed while it is
    /// being told.
    pub fn list() -> Result<Vec<Listed>, String> {
        wit::list()
    }

    /// One timer firing, as [`fired`] reads it.
    #[derive(Debug, Clone, PartialEq, Eq)]
    pub struct Fired {
        /// The name you set it under.
        pub name: String,
        /// When it fired, in milliseconds since the Unix epoch.
        pub at: u64,
        /// It fired more than a minute after it was due: the Mac slept, Lumi
        /// was quit, or your extension was off.
        pub late: bool,
        /// How many further repeats came due meanwhile, folded into this one.
        pub missed: u64,
    }

    /// The timer that fired, when [`Guest::on_event`](crate::Guest::on_event)
    /// was called for one.
    pub fn fired(name: &str, payload: &str) -> Option<Fired> {
        if name != EVENT {
            return None;
        }
        read_fired(payload)
    }

    /// A `timer` or `schedule` payload: the two are one shape.
    pub(crate) fn read_fired(payload: &str) -> Option<Fired> {
        let value: serde_json::Value = serde_json::from_str(payload).ok()?;
        Some(Fired {
            name: value.get("name")?.as_str()?.to_string(),
            at: value.get("at")?.as_u64()?,
            late: value.get("late").and_then(serde_json::Value::as_bool).unwrap_or(false),
            missed: value.get("missed").and_then(serde_json::Value::as_u64).unwrap_or(0),
        })
    }
}

/// Your extension's own schedules: Lumi runs your
/// [`Guest::on_event`](crate::Guest::on_event) with `"schedule"` every time
/// the Mac's clock reaches a moment a cron expression names — with every one
/// of your windows closed, and after Lumi restarts.
///
/// ```ignore
/// // 09:00 on weekdays, and every quarter hour from 09:00 to 17:45.
/// lumi::schedules::set("morning", "0 9 * * mon-fri")?;
/// lumi::schedules::set("tick", "*/15 9-17 * * *")?;
/// ```
///
/// The expression is the five fields every cron has: minute (0–59), hour
/// (0–23), day of the month (1–31), month (1–12 or `jan`–`dec`) and day of the
/// week (0–7, Sunday 0 or 7, or `sun`–`sat`), each `*`, a number, a range, a
/// list, or any of them with a `/step`; or `@yearly`, `@annually`,
/// `@monthly`, `@weekly`, `@daily` or `@hourly`. Given both a day of the month
/// and a day of the week, neither starting with `*`, a day is either one. It
/// is read on the Mac's clock, in the person's time zone.
///
/// Schedules live beside your [`timers`](crate::timers), on the same clock and
/// under the same rules — told at least once, a firing that came due while
/// the Mac slept or Lumi was quit told once with `late`, the moments folded
/// into it counted in `missed` — and with the same capability. Their names are
/// their own. Setting one again to the expression it has changes nothing, so
/// you may set it from every run.
///
/// Needs the `timers` capability, `events = ["schedule"]` in your manifest,
/// and Lumi 1.60.0 — say so with `min-lumi-version`.
pub mod schedules {
    use super::lumi::ext::schedules as wit;

    pub use super::timers::Fired;
    pub use wit::Schedule;

    /// The [`Guest::on_event`](crate::Guest::on_event) name a schedule fires as.
    pub const EVENT: &str = "schedule";

    /// Set the schedule called `name` to `expr`, replacing one of that name —
    /// or changing nothing, when it has that expression already.
    pub fn set(name: &str, expr: &str) -> Result<(), String> {
        wit::set(name, expr)
    }

    /// Remove the schedule called `name`; `true` when there was one.
    pub fn cancel(name: &str) -> Result<bool, String> {
        wit::cancel(name)
    }

    /// Every schedule, by name, each with `expr` as you set it and `due`, when
    /// it next fires in milliseconds since the Unix epoch.
    pub fn list() -> Result<Vec<Schedule>, String> {
        wit::list()
    }

    /// The schedule that fired, when [`Guest::on_event`](crate::Guest::on_event)
    /// was called for one.
    pub fn fired(name: &str, payload: &str) -> Option<Fired> {
        if name != EVENT {
            return None;
        }
        super::timers::read_fired(payload)
    }
}

/// This Mac's time zone: its name, and how far from UTC it stands at any
/// moment. Your component's clock is UTC and carries no time zone database;
/// this is how it reads the person's clock — a date the way they would write
/// it, "today" where they are.
///
/// ```ignore
/// let now = lumi::time_zone::current()?;          // "Europe/Lisbon", 60
/// let today = lumi::time_zone::local_day(at_ms)?; // 2026-10-21 where they are
/// ```
///
/// Declare `events = ["time-zone"]` to hear the zone change, once per change,
/// in [`Guest::on_event`](crate::Guest::on_event); [`changed`] reads it. A
/// change of clocks for summer is not a change of zone and is not told —
/// [`offset_at`] answers across it.
///
/// Needs the `time-zone` capability — what it tells is where the person is —
/// and Lumi 1.59.0; say so with `min-lumi-version`.
pub mod time_zone {
    use super::lumi::ext::time_zone as wit;

    pub use wit::Zone;

    /// The [`Guest::on_event`](crate::Guest::on_event) name a change of zone
    /// arrives as.
    pub const EVENT: &str = "time-zone";

    /// The zone this Mac's clock is in now: its IANA name, and whole minutes
    /// east of UTC now, summer time included.
    pub fn current() -> Result<Zone, String> {
        wit::current()
    }

    /// Whole minutes east of UTC this Mac's zone stands at `at`, in
    /// milliseconds since the Unix epoch — past or future, summer time
    /// included.
    pub fn offset_at(at: u64) -> Result<i32, String> {
        wit::offset_at(at)
    }

    /// The day on the person's calendar at `at`, in milliseconds since the
    /// Unix epoch: [`offset_at`], then the date — no time zone database in
    /// your component.
    pub fn local_day(at: u64) -> Result<super::timers::Day, String> {
        let offset = i64::from(offset_at(at)?);
        let at = i64::try_from(at).map_err(|_| "time_zone::local_day: that moment is too far ahead".to_string())?;
        let (year, month, day) = civil(at.saturating_add(offset * 60_000).div_euclid(86_400_000));
        let year = u16::try_from(year).map_err(|_| format!("time_zone::local_day: the year {year} has no day here"))?;
        Ok(super::timers::Day { year, month, day })
    }

    /// The date `days` after 1970-01-01 on the proleptic Gregorian calendar
    /// (Howard Hinnant's `civil_from_days`).
    fn civil(days: i64) -> (i64, u8, u8) {
        let z = days + 719_468;
        let era = z.div_euclid(146_097);
        let doe = z.rem_euclid(146_097);
        let yoe = (doe - doe / 1_460 + doe / 36_524 - doe / 146_096) / 365;
        let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
        let mp = (5 * doy + 2) / 153;
        let day = (doy - (153 * mp + 2) / 5 + 1) as u8;
        let month = if mp < 10 { mp + 3 } else { mp - 9 } as u8;
        let year = yoe + era * 400 + i64::from(month <= 2);
        (year, month, day)
    }

    /// The new zone, when [`Guest::on_event`](crate::Guest::on_event) was
    /// called for a change of it.
    pub fn changed(name: &str, payload: &str) -> Option<Zone> {
        if name != EVENT {
            return None;
        }
        let value: serde_json::Value = serde_json::from_str(payload).ok()?;
        Some(Zone {
            id: value.get("id")?.as_str()?.to_string(),
            offset_minutes: i32::try_from(value.get("offsetMinutes")?.as_i64()?).ok()?,
        })
    }

    #[cfg(test)]
    mod tests {
        #[test]
        fn a_day_count_is_the_calendar_s_date() {
            assert_eq!(super::civil(0), (1970, 1, 1));
            assert_eq!(super::civil(-1), (1969, 12, 31));
            assert_eq!(super::civil(59), (1970, 3, 1));
            assert_eq!(super::civil(11_016), (2000, 2, 29));
            assert_eq!(super::civil(20_747), (2026, 10, 21));
            assert_eq!(super::civil(20_819), (2027, 1, 1));
        }
    }
}

/// Typing through your extension: every key typed in any app passes through
/// it while Lumi types through it, and it answers how the word changes — a
/// way to type a language whose letters the keyboard does not have is the
/// case it is built for. Lumi knows no language; what a key becomes is yours.
///
/// Each key arrives as `on_event("text-input", …)` with the keys since the
/// word began, oldest first. Read them with [`keys`](text_input::keys), replay them through
/// your engine — nothing of a run survives it, so the list is how you know
/// where the word stands — and answer the last one with [`answer`](text_input::answer) or
/// [`replace`](text_input::replace), or not at all to let the key type itself.
///
/// The run is sealed: only [`answer`](text_input::answer) and `settings()` work in it, it has
/// about 25 milliseconds, and the key is held until it answers. A run that is
/// late, traps or refuses has its key typed as pressed; three failures in a
/// minute and Lumi stops typing through you until you are switched on again.
///
/// Needs the `text-input` capability and `events = ["text-input"]`; the
/// manifest may not declare `network` or `ai` beside it. Lumi 1.61.0.
///
/// ```ignore
/// fn on_event(name: String, payload: String) -> Result<(), String> {
///     let Some(keys) = lumi::text_input::keys(&name, &payload) else { return Ok(()) };
///     let (delete, insert, word_ended) = my_engine::replay(&keys);
///     lumi::text_input::replace(delete, &insert, word_ended)
/// }
/// ```
pub mod text_input {
    use super::lumi::ext::text_input as wit;

    /// How the text before the caret changes: `delete_before` characters
    /// (Unicode scalar values, at most as many as your answers typed into
    /// this word), `delete_after` (0 in this release), `insert` (printable,
    /// at most 64 characters), and `commit` to end the word.
    pub use wit::Edit;

    /// The [`Guest::on_event`](crate::Guest::on_event) name a key arrives as.
    pub const EVENT: &str = "text-input";

    /// The name the switch arrives as when somebody else moved it.
    pub const ENABLED_EVENT: &str = "text-input-enabled";

    /// One key of the word: the character it typed on the person's keyboard
    /// layout (empty for Backspace), and its `KeyboardEvent.code` name — the
    /// physical key, `"KeyA"`, `"Digit2"`, `"Backspace"` — for an engine that
    /// works by key rather than by character.
    #[derive(Debug, Clone, PartialEq, Eq)]
    pub struct Key {
        pub text: String,
        pub code: String,
    }

    impl Key {
        /// Whether this key is Backspace, told only while a word is open.
        pub fn is_backspace(&self) -> bool {
            self.code == "Backspace"
        }

        /// Whether this key is Escape, told only while a word is open. The
        /// word ends after it whatever you answer; answering with the keys as
        /// they were typed is how an engine undoes what it made of them.
        pub fn is_escape(&self) -> bool {
            self.code == "Escape"
        }
    }

    /// The keys since the word began, oldest first, when
    /// [`Guest::on_event`](crate::Guest::on_event) was called for a key.
    pub fn keys(name: &str, payload: &str) -> Option<Vec<Key>> {
        if name != EVENT {
            return None;
        }
        let value: serde_json::Value = serde_json::from_str(payload).ok()?;
        value
            .get("keys")?
            .as_array()?
            .iter()
            .map(|key| {
                Some(Key {
                    text: key.get("text")?.as_str()?.to_string(),
                    code: key.get("code")?.as_str()?.to_string(),
                })
            })
            .collect()
    }

    /// Answer the key this run was told of. Once per run, and only from the
    /// `text-input` run.
    pub fn answer(edit: &Edit) -> Result<(), String> {
        wit::answer(edit)
    }

    /// [`answer`] for the usual case: delete `delete_before` characters
    /// before the caret, type `insert`, and end the word if `commit`.
    pub fn replace(delete_before: u32, insert: &str, commit: bool) -> Result<(), String> {
        wit::answer(&Edit { delete_before, delete_after: 0, insert: insert.to_string(), commit })
    }

    /// Whether Lumi types through your extension now — the switch on your
    /// Permissions sheet. Refused from the `text-input` run.
    pub fn enabled() -> Result<bool, String> {
        wit::enabled()
    }

    /// Turn typing through your extension on or off — a command bound to a
    /// shortcut is the usual way to switch languages. On switches off any
    /// other extension Lumi typed through. Refused from the `text-input` run.
    pub fn set_enabled(on: bool) -> Result<(), String> {
        wit::set_enabled(on)
    }

    /// Where the switch stands now, when [`Guest::on_event`](crate::Guest::on_event)
    /// was called because somebody else moved it: the person on your
    /// Permissions sheet, or Lumi switching you off because another
    /// extension was switched on to type through. Hear it with
    /// `events = ["text-input-enabled"]`.
    pub fn enabled_changed(name: &str, payload: &str) -> Option<bool> {
        if name != ENABLED_EVENT {
            return None;
        }
        let value: serde_json::Value = serde_json::from_str(payload).ok()?;
        value.get("enabled")?.as_bool()
    }

    #[cfg(test)]
    mod tests {
        #[test]
        fn the_keys_come_out_in_the_order_they_were_typed() {
            let payload = r#"{"v":1,"keys":[{"text":"a","code":"KeyA"},{"text":"","code":"Backspace"}]}"#;
            let keys = super::keys("text-input", payload).expect("keys");
            assert_eq!(keys.len(), 2);
            assert_eq!((keys[0].text.as_str(), keys[0].code.as_str()), ("a", "KeyA"));
            assert!(keys[1].is_backspace());
            assert!(super::keys("timer", payload).is_none());
            assert_eq!(super::enabled_changed("text-input-enabled", r#"{"v":1,"enabled":false,"at":1}"#), Some(false));
        }
    }
}

/// Which app is in front, as the person moves between them — for an
/// extension that keeps something per app, a typing extension remembering
/// its switch for each being the usual one.
///
/// Hear it with `events = ["front-app"]`; needs the `front-app` capability.
/// Every switch is told, Lumi's own windows coming forward included. Nothing
/// is told when your extension starts, so what is in front then is unknown
/// until the person next switches. Lumi 1.61.0.
pub mod front_app {
    /// The [`Guest::on_event`](crate::Guest::on_event) name a switch arrives as.
    pub const EVENT: &str = "front-app";

    /// The app that came to the front.
    #[derive(Debug, Clone, PartialEq, Eq)]
    pub struct App {
        /// Its bundle id, `"com.apple.TextEdit"` — `None` for a process that
        /// has none.
        pub id: Option<String>,
        /// The name macOS shows for it.
        pub name: Option<String>,
        /// When it came to the front, in milliseconds since the Unix epoch.
        pub at: u64,
    }

    /// The app that came to the front, when
    /// [`Guest::on_event`](crate::Guest::on_event) was called for a switch.
    pub fn changed(name: &str, payload: &str) -> Option<App> {
        if name != EVENT {
            return None;
        }
        let value: serde_json::Value = serde_json::from_str(payload).ok()?;
        let text = |field: &str| value.get(field).and_then(serde_json::Value::as_str).map(str::to_string);
        Some(App { id: text("app"), name: text("name"), at: value.get("at")?.as_u64()? })
    }
}

/// Which apps are using a microphone now — every process capturing from any
/// input device, named by the app responsible for it (a browser for its tabs,
/// an app for its helpers), one entry per app. Lumi itself is never in it.
/// What an app does with the microphone is not told: a call, dictation and a
/// voice memo look the same, and what a use means is yours to decide.
///
/// Read it with [`apps`]. Hear it with `events = ["microphone-use"]` to be
/// told the whole set whenever it changes — and once as it stands when your
/// extension starts hearing — read with [`changed`]: always the whole set,
/// never a change, so compare it with the last you were told.
///
/// Needs the `microphone-use` capability, macOS 14 and Lumi 1.65.0; say so
/// with `min-lumi-version`.
///
/// ```ignore
/// fn on_event(name: String, payload: String) -> Result<(), String> {
///     if let Some(apps) = lumi::microphone_use::changed(&name, &payload) {
///         for app in &apps {
///             // app.id, app.name, app.since
///         }
///     }
///     Ok(())
/// }
/// ```
pub mod microphone_use {
    use super::lumi::ext::microphone_use as wit;

    /// The [`Guest::on_event`](crate::Guest::on_event) name the set arrives
    /// as.
    pub const EVENT: &str = "microphone-use";

    /// One app using a microphone.
    #[derive(Debug, Clone, PartialEq, Eq)]
    pub struct AppUsing {
        /// Its bundle id — `None` for a process that has none.
        pub id: Option<String>,
        /// The name macOS shows for it, or its process's name.
        pub name: String,
        /// When Lumi first saw it using a microphone this time, in
        /// milliseconds since the Unix epoch.
        pub since: u64,
    }

    /// Every app using a microphone now, by name.
    pub fn apps() -> Result<Vec<AppUsing>, String> {
        Ok(wit::apps()?
            .into_iter()
            .map(|app| AppUsing { id: app.app, name: app.name, since: app.since })
            .collect())
    }

    /// The hosts of the web pages the windows of `app` show now — the
    /// window in front first, at most 16 — for `app`, a bundle id from
    /// [`apps`], while it is using a microphone; refused for any other.
    /// Hosts only, never a path or a title. Needs the `microphone-sites`
    /// capability, declared beside `microphone-use`.
    pub fn sites(app: &str) -> Result<Vec<String>, String> {
        wit::sites(app)
    }

    /// The whole set, when [`Guest::on_event`](crate::Guest::on_event) was
    /// called with it.
    pub fn changed(name: &str, payload: &str) -> Option<Vec<AppUsing>> {
        if name != EVENT {
            return None;
        }
        let value: serde_json::Value = serde_json::from_str(payload).ok()?;
        value
            .get("apps")?
            .as_array()?
            .iter()
            .map(|app| {
                Some(AppUsing {
                    id: app.get("app").and_then(serde_json::Value::as_str).map(str::to_string),
                    name: app.get("name")?.as_str()?.to_string(),
                    since: app.get("since")?.as_u64()?,
                })
            })
            .collect()
    }
}

/// An offer: one line of your words and one button, drawn by Lumi at the top
/// right of the display, whose press runs one of your `[[command]]`s as the
/// person's press — the one way a run nobody pressed, an event or a timer,
/// puts something in front of the person. Lumi decides where and for how
/// long (15 seconds, held while the pointer is over it), puts it away on its
/// ✕, its button, its time or [`withdraw`], and limits how often you may ask.
///
/// The command's params carry `"offer": {"id", "data"}` beside its declared
/// defaults — [`pressed`] reads them — `data` handed back exactly as you gave
/// it.
///
/// Needs the `offer` capability and Lumi 1.65.0. The person may turn it off
/// on your Permissions sheet; [`allowed`] says whether they have.
///
/// ```ignore
/// let offer = lumi::offer::Offer {
///     text: "Your timer is up.".into(),
///     command: "again".into(),
///     button: Some("Again".into()),
///     data: None,
///     after: 0,
/// };
/// if lumi::offer::show(&offer).is_err() {
///     lumi::alert("Your timer is up.")?;
/// }
/// ```
pub mod offer {
    use super::lumi::ext::offer as wit;

    /// What to offer.
    #[derive(Debug, Clone, PartialEq, Eq, Default)]
    pub struct Offer {
        /// One line, at most 120 characters.
        pub text: String,
        /// One of your `[[command]]`s, by name: what the button runs.
        pub command: String,
        /// The button's label, at most 24 characters; `None` for the
        /// command's own label.
        pub button: Option<String>,
        /// At most 256 bytes, handed back to the command as it was.
        pub data: Option<String>,
        /// Milliseconds to wait before it shows, at most 10000.
        pub after: u32,
    }

    /// What the button press hands the command it runs.
    #[derive(Debug, Clone, PartialEq, Eq)]
    pub struct Pressed {
        /// What [`show`] answered.
        pub id: u64,
        /// The data you gave, as you gave it.
        pub data: Option<String>,
    }

    /// Show `offer`, replacing yours that is up or waiting. Answers its id.
    pub fn show(offer: &Offer) -> Result<u64, String> {
        wit::show(&wit::Offer {
            text: offer.text.clone(),
            command: offer.command.clone(),
            button: offer.button.clone(),
            data: offer.data.clone(),
            after: offer.after,
        })
    }

    /// Take back offer `id`, up or waiting; true when it was still there.
    pub fn withdraw(id: u64) -> Result<bool, String> {
        wit::withdraw(id)
    }

    /// Whether the person lets you offer from the background — the switch
    /// on your Permissions sheet.
    pub fn allowed() -> Result<bool, String> {
        wit::allowed()
    }

    /// The offer a command's run was pressed from, read from the run's
    /// `params` — `None` for a run that came from anywhere else.
    pub fn pressed(params: &str) -> Option<Pressed> {
        let value: serde_json::Value = serde_json::from_str(params).ok()?;
        let offer = value.get("offer")?;
        Some(Pressed {
            id: offer.get("id")?.as_u64()?,
            data: offer.get("data").and_then(serde_json::Value::as_str).map(str::to_string),
        })
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
