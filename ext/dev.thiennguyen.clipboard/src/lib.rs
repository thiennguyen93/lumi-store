//! Clipboard Manager: keeps what you copy and pastes it back from a panel.
//!
//! **Lumi does the parts that must not be left to an extension.** It
//! watches the pasteboard, drops anything a password manager marks as
//! concealed or transient before this component ever hears of it, writes
//! images and other large data straight into this extension's blob store,
//! and encrypts everything this extension stores with a key it keeps in the
//! Keychain. What arrives here is a `clipboard` event describing one copy;
//! what this component decides is whether to keep it and where it goes in
//! the history — `history.rs`, all of it.
//!
//! **Nothing in here survives between calls.** Lumi instantiates the
//! component fresh for every event and every panel request, so the history
//! lives in storage: an `index` of rows, and one `item.<id>` record per row.
//! The panel reads the index once when it opens and searches it in the
//! page, so typing in the search field costs no call here.

pub mod history;
pub mod host;
pub mod links;
pub mod rtf;
pub mod snippets;

use history::{Copy, Index, Order, Outcome, Rules};
use host::{Host, PutError};
use lumi_extension_api as lumi;
use serde_json::{json, Value};
use std::collections::{HashMap, HashSet};

/// The panel's `[[window]]` name.
pub const PANEL: &str = "history";

/// The Welcome window's `[[window]]` name: a six-step tour opened by
/// `on_lifecycle` when the extension is installed or updated. Its own
/// choice, not Lumi's — Lumi opens nothing on an install — and what it is
/// for is the one thing an install can leave undone: the `[[shortcut]]`.
/// Lumi tries ⌘⇧C once at install and, when something holds it, arms
/// nothing and says who (`GET /__lumi__/shortcuts`' `ess`); the tour's
/// third step is where the person hears that and decides.
pub const WELCOME: &str = "welcome";

/// Storage key of the version an update replaced, written by `on_lifecycle`
/// for the Welcome window's first request to read and clear: the window is
/// a page, and a page is told nothing about why it was opened.
const WELCOME_FROM: &str = "welcome.from";

/// What Lumi calls the Dashboard tab (`[[page]] name = "dashboard"`) when
/// it asks `run-ui` something. It is not a window of the manifest's, and it
/// only reads: nothing it can send pastes, pins or forgets. The About page
/// asks nothing — it is words.
pub const DASHBOARD: &str = ":page:dashboard";

/// What Lumi calls the Settings tab (`settings-page`). It saves through
/// Lumi's own `PUT /__lumi__/settings`; what it asks here only reads.
pub const SETTINGS: &str = ":settings";

/// Where the panel's About sends the person: this extension's page on
/// lumikeys.app (the manifest's `homepage` too), and the extensions list
/// there. Fixed here — the page
/// names which one, never the address, so it cannot have anything else
/// opened through this.
const DOCS_URL: &str = "https://lumikeys.app/extensions/dev.thiennguyen.clipboard/";
const STORE_URL: &str = "https://lumikeys.app/extensions";

/// How long a row is kept, as the `keep` setting spells it.
/// The keep when none is set, as the manifest's default says.
const DEFAULT_KEEP: (&str, i64) = ("3mo", 90 * 24 * 60 * 60_000);

const KEEPS: &[(&str, i64)] = &[
    ("5m", 5 * 60_000),
    ("1h", 60 * 60_000),
    ("1d", 24 * 60 * 60_000),
    ("1w", 7 * 24 * 60 * 60_000),
    ("1mo", 30 * 24 * 60 * 60_000),
    ("3mo", 90 * 24 * 60 * 60_000),
];

/// However long rows are kept, no more than this many unpinned: the panel
/// reads the whole index each time it opens.
const MAX_ITEMS: usize = 1000;

/// The most of a pattern list or a sample the Settings tab may send to be
/// tried: a few lines typed by hand, not a document.
const MAX_TRY: usize = 16 * 1024;

/// Storage key of the row list.
const INDEX: &str = "index";

/// Storage key of the preview pane's width, as the person last dragged it.
const PREVIEW_WIDTH: &str = "panel.previewWidth";

/// Storage key of where the line across the preview sits, as the person
/// last dragged it: the height of the part above it — a picture over the
/// text read in it, or a copy over what it expands to. Missing, the page's
/// default stands.
const PREVIEW_SPLIT: &str = "panel.previewSplit";

/// Storage key of what a PDF's 100% fits, as last picked on its bar: one
/// for the pane beside the list and one for the zoomed panel, as
/// `{"pane": "height", "zoomed": "width"}` — either may be missing.
const PDF_FIT: &str = "panel.pdfFit";

/// What a stored width may be: a pane, not a sliver or a wall.
const PREVIEW_WIDTHS: std::ops::RangeInclusive<u64> = 120..=2000;

/// What a stored split may be: a part, not a sliver or a wall.
const PREVIEW_SPLITS: std::ops::RangeInclusive<u64> = 40..=2000;

/// How often a write of the index is retried when a panel request and a
/// copy land together. Each retry re-reads and re-applies, so five is five
/// genuine collisions in a row — not a number that matters in practice.
pub(crate) const CAS_ATTEMPTS: usize = 5;

fn record_key(id: &str) -> String {
    format!("item.{id}")
}

struct Clipboard;

impl lumi::Guest for Clipboard {
    fn run_command(name: String, _params: String) -> Result<String, String> {
        command(&host::Lumi, &name)?;
        Ok(String::new())
    }

    fn run_node(name: String, _params: String, _items: String) -> Result<String, String> {
        Err(format!("Clipboard Manager has no {name} node"))
    }

    fn run_ui(window: String, request: String) -> Result<String, String> {
        let request: Value =
            serde_json::from_str(&request).map_err(|err| format!("bad request: {err}"))?;
        let answer = match window.as_str() {
            PANEL => ui(&host::Lumi, &request),
            WELCOME => welcome(&host::Lumi, &request),
            DASHBOARD => dashboard(&host::Lumi, &request),
            SETTINGS => settings(&host::Lumi, &request),
            _ => return Err(format!("Clipboard Manager has no {window} window")),
        };
        answer.map(|answer| answer.to_string())
    }

    fn on_lifecycle(event: lumi::Lifecycle) -> Result<(), String> {
        on_lifecycle(&host::Lumi, &event)
    }

    fn on_event(name: String, payload: String) -> Result<(), String> {
        on_event(&host::Lumi, &name, &payload)
    }
}

lumi::register!(Clipboard);

/// One lifecycle moment, from the `on-lifecycle` export: the Welcome
/// window on an install and on an update. Nothing on an uninstall — the
/// windows are gone by then, and the history's storage goes with the
/// extension without any help from here.
pub fn on_lifecycle(host: &impl Host, event: &lumi::Lifecycle) -> Result<(), String> {
    match event {
        lumi::Lifecycle::Installed => host.open_window(WELCOME),
        lumi::Lifecycle::Updated(from) => {
            // Best effort, and before the window: a tour that cannot say
            // what changed is still the tour, and one opened before the
            // flag lands would read as a first install.
            let rev = host.get(WELCOME_FROM).ok().flatten().map(|s| s.rev);
            let _ = host.put(WELCOME_FROM, from, rev);
            host.open_window(WELCOME)
        }
        lumi::Lifecycle::Uninstalling => Ok(()),
    }
}

/// A request from the Welcome window.
fn welcome(host: &impl Host, request: &Value) -> Result<Value, String> {
    match request["kind"].as_str().unwrap_or_default() {
        // Why the window is up: the version an update replaced, or null for
        // an install. Read once — the flag is cleared here, so a Welcome
        // reopened from the pane's Open button is a plain welcome again.
        "welcome" => {
            let from = host.get(WELCOME_FROM)?.map(|stored| stored.value);
            if from.is_some() {
                let _ = host.delete(WELCOME_FROM);
            }
            Ok(json!({ "from": from, "version": env!("CARGO_PKG_VERSION") }))
        }
        // The tour's "Try it": the panel comes up over the window, dressed
        // as Settings says, the way the command opens it.
        "openPanel" => {
            show_panel(host)?;
            Ok(json!({}))
        }
        "settings" => {
            host.close_window(WELCOME)?;
            host.open_settings()?;
            Ok(json!({}))
        }
        "close" => {
            host.close_window(WELCOME)?;
            Ok(json!({}))
        }
        other => Err(format!("the Welcome window has no {other} request")),
    }
}

/// One host event, from the `on-event` export.
pub fn on_event(host: &impl Host, name: &str, payload: &str) -> Result<(), String> {
    match name {
        "clipboard" => on_copy(host, payload)?,
        "clipboard-ocr" => on_ocr(host, payload)?,
        // Events this build does not know are Lumi being newer than the
        // component, not something wrong with the copy.
        _ => return Ok(()),
    }
    tell_dashboard(host);
    tell_panel(host);
    Ok(())
}

/// What the panel is told when the history changed under it — a copy, a
/// copy made again, the text read in an image: read the list again. The
/// news, not the rows: a thousand of them are more than a post may carry,
/// and the panel reads them in one `list` anyway.
pub const HISTORY_CHANGED: &str = r#"{"kind":"history"}"#;

/// Tell the panel, if it is up — pinned or not — that the history changed,
/// so a copy made while it is open shows up in it. Best effort: Lumi
/// answers `false` and sends nothing when the panel is put away.
fn tell_panel(host: &impl Host) {
    let _ = host.post(PANEL, HISTORY_CHANGED);
}

/// What the panel is told when it is asked for while already up — the
/// shortcut pressed again, or the tour's "Try it". It stays as it is, and
/// shows where the keys go now; pinned and left for another app, it takes
/// the keyboard back first (`focus`).
pub const SUMMONED: &str = r#"{"kind":"summoned"}"#;

/// Asked only to learn whether the panel is up — Lumi answers `false` and
/// sends nothing when it is not on screen. A kind the page does not know,
/// so it does nothing with it.
const PING: &str = r#"{"kind":"ping"}"#;

/// One of the manifest's `[[command]]`s: the panel shown, hidden or
/// toggled.
fn command(host: &impl Host, name: &str) -> Result<(), String> {
    match name {
        "open" => show_panel(host),
        "hide" => host.close_window(PANEL),
        "toggle" => {
            if host.post(PANEL, PING) == Ok(true) {
                host.close_window(PANEL)
            } else {
                open_panel(host)
            }
        }
        _ => Err(format!("Clipboard Manager has no {name} command")),
    }
}

/// Show only ever brings the panel up: run while it is up, it does not put
/// it away — Escape, Hide and Toggle do. Lumi sends a press's `open-window`
/// on a panel that holds the keyboard away again (Maccy's habit), so an up
/// panel is never asked for that way: the post doubles as the question.
fn show_panel(host: &impl Host) -> Result<(), String> {
    if host.post(PANEL, SUMMONED) == Ok(true) {
        return Ok(());
    }
    open_panel(host)
}

/// Open the panel, put away, in the glass and the theme the person chose —
/// set before it is drawn on them; a Lumi that cannot set them opens it all
/// the same.
fn open_panel(host: &impl Host) -> Result<(), String> {
    dress(host);
    host.open_window(PANEL)
}

/// Hand the Dashboard, if it is on screen, the counts as they are now.
/// Lumi refuses the page's own `call` while Settings is behind another app,
/// which is exactly when copies arrive — so the news comes to it instead.
/// Best effort: the copy is kept whether or not anybody is looking.
fn tell_dashboard(host: &impl Host) {
    if let Ok(stats) = stats(host) {
        let _ = host.post(DASHBOARD, &stats.to_string());
    }
}

/// The person's settings, read once per call — Lumi freezes them for the
/// call anyway.
struct Prefs {
    rules: Rules,
    /// How long rows are kept, as the setting spells it: "1d", "1mo"…
    keep: &'static str,
    order: Order,
    paste_on_select: bool,
    /// "Close the panel after dragging an item out"; off, so several items
    /// can be dragged out one after another.
    close_after_drag: bool,
    /// "Search text in images": Lumi reads text in copied images, and the
    /// preview shows what it read.
    ocr: bool,
    /// The panel's glass: "popover", "hud" or "sidebar".
    appearance: &'static str,
    /// "light", "dark" or "system".
    theme: &'static str,
    /// How the panel reads a search: "exact", "fuzzy", "regexp", "mixed".
    search: &'static str,
    /// The panel's Pin key, as the page spells it ("cmd+p"); the page
    /// checks it and falls back to its default on anything it cannot read.
    pin_key: String,
    /// "Match snippets": whose snippet triggers a copy is looked up as.
    match_snippets: snippets::Matching,
    /// The profiles ticked for `Matching::Selected`.
    snippet_profiles: Vec<String>,
}

impl Prefs {
    /// The theme the panel is shown in: dark glass is dark whatever was
    /// chosen, since AppKit's HUD material has no light version worth the
    /// name.
    fn shown_theme(&self) -> &'static str {
        if self.appearance == "hud" { "dark" } else { self.theme }
    }
}

/// Put the chosen glass and theme on the panel: before it opens, and when
/// Settings changes them while it is up.
fn dress(host: &impl Host) {
    let prefs = prefs(host);
    let _ = host.set_material(PANEL, prefs.appearance);
    let _ = host.set_theme(PANEL, prefs.shown_theme());
}

fn prefs(host: &impl Host) -> Prefs {
    let s = host.settings();
    // Settings arrive as text or as numbers depending on how they were
    // saved; take either rather than fall back to the default on a spelling.
    let (keep, keep_ms) = KEEPS
        .iter()
        .find(|(word, _)| s["keep"].as_str() == Some(word))
        .copied()
        .unwrap_or(DEFAULT_KEEP);
    let apps = s["ignoreApps"]
        .as_str()
        .unwrap_or_default()
        .lines()
        .map(|l| l.trim().to_string())
        .filter(|l| !l.is_empty())
        .collect();
    let (mut rules, _refused) = Rules::new(MAX_ITEMS, apps, s["ignorePatterns"].as_str().unwrap_or(""));
    rules.keep_ms = Some(keep_ms);
    Prefs {
        rules,
        keep,
        order: Order::parse(s["sort"].as_str().unwrap_or("last")),
        paste_on_select: match &s["pasteOnSelect"] {
            Value::Bool(b) => *b,
            Value::String(t) => t != "false",
            _ => true,
        },
        close_after_drag: match &s["closeAfterDrag"] {
            Value::Bool(b) => *b,
            Value::String(t) => t == "true",
            _ => false,
        },
        ocr: match &s["ocr"] {
            Value::Bool(b) => *b,
            Value::String(t) => t != "false",
            _ => true,
        },
        appearance: match s["appearance"].as_str() {
            Some("hud") => "hud",
            Some("sidebar") => "sidebar",
            _ => "popover",
        },
        pin_key: s["pinKey"].as_str().filter(|k| k.len() <= 32).unwrap_or("cmd+p").to_string(),
        search: match s["search"].as_str() {
            Some("exact") => "exact",
            Some("fuzzy") => "fuzzy",
            Some("regexp") => "regexp",
            _ => "mixed",
        },
        theme: match s["theme"].as_str() {
            Some("light") => "light",
            Some("dark") => "dark",
            _ => "system",
        },
        match_snippets: snippets::Matching::from_settings(&s["matchSnippets"], s["snippetsIn"].as_str()),
        snippet_profiles: snippets::picked(s["snippetProfiles"].as_str().unwrap_or_default()),
    }
}

fn read_index(host: &impl Host) -> Result<(Index, Option<u64>), String> {
    match host.get(INDEX)? {
        None => Ok((Index::default(), None)),
        Some(stored) => {
            let mut index = serde_json::from_str(&stored.value)
                .map_err(|err| format!("the history index is unreadable: {err}"))?;
            history::settle_pins(&mut index);
            Ok((index, Some(stored.rev)))
        }
    }
}

/// Re-read the index, change it, write it back — again if somebody else
/// wrote it in between. `change` runs once per attempt against a fresh copy.
fn update_index<T>(
    host: &impl Host,
    change: impl FnMut(&mut Index) -> Result<T, String>,
) -> Result<T, String> {
    write_index(host, None, change).map(|(answer, _)| answer)
}

/// `update_index`, from an index already read (`read`, at its revision) when
/// there is one — read again only if somebody wrote it since — answering the
/// index as written too.
fn write_index<T>(
    host: &impl Host,
    mut read: Option<(Index, Option<u64>)>,
    mut change: impl FnMut(&mut Index) -> Result<T, String>,
) -> Result<(T, Index), String> {
    for _ in 0..CAS_ATTEMPTS {
        let (mut index, rev) = match read.take() {
            Some(read) => read,
            None => read_index(host)?,
        };
        let answer = change(&mut index)?;
        let text = serde_json::to_string(&index).map_err(|err| err.to_string())?;
        match host.put(INDEX, &text, rev) {
            Ok(_) => return Ok((answer, index)),
            Err(PutError::Conflict) => continue,
            Err(PutError::Failed(err)) => return Err(err),
        }
    }
    Err("the history was busy; try again".to_string())
}

/// What opening the panel does to the history, on one read of the index —
/// and no write at all when there is nothing to do, as on most openings:
/// - what the last panel deleted goes for good: ⌘Z can no longer want it;
/// - what has aged out since the last copy goes: with nothing copied for a
///   day, a day's keep still ends;
/// - once per `history::UPKEEP`, rows kept by older builds are brought up
///   to date (`Upkeep`).
///
/// Answers the index as it now stands, for the list.
fn open_history(host: &impl Host, prefs: &Prefs) -> Result<Index, String> {
    let (index, rev) = read_index(host)?;
    let now = host.now();
    let cutoff = now.saturating_sub(prefs.rules.keep_ms.unwrap_or(i64::MAX));
    let aged = index.items.iter().any(|e| e.pin.is_none() && e.last < cutoff);
    let upkeep = (index.upkeep < history::UPKEEP).then(|| Upkeep::of(host, &index));
    if index.trash.is_empty() && !aged && upkeep.is_none() {
        return Ok(index);
    }
    let ((gone, expired), index) = write_index(host, Some((index, rev)), |index| {
        let mut gone = history::empty_trash(index);
        let aged_out = history::evict(index, prefs.rules.size, prefs.rules.keep_ms, now);
        let expired = !aged_out.is_empty();
        gone.extend(aged_out);
        if let Some(upkeep) = &upkeep {
            upkeep.apply(index);
        }
        Ok((gone, expired))
    })?;
    forget(host, &gone);
    if expired {
        tell_dashboard(host);
    }
    Ok(index)
}

/// Rows kept by older builds, brought up to date from their records — once
/// per `history::UPKEEP`, which is bumped with any rule here:
/// - file rows kept before titles were read by name carry Finder's
///   file-reference id as their title (`/.file/id=6571367.2286…`): titled
///   again, by the path Lumi resolved or the names Finder wrote beside it;
/// - file rows kept before `file_count` say they hold several files only in
///   their title ("a.mp4 + 2 more"): counted;
/// - rows kept before colours were told apart from what came with them are
///   Rich (a colour copied from an editor, HTML and all) or Text
///   (`#rrggbbaa`, `rgb()`, `hsl()`): given the kind their record says;
/// - rows kept before search text was kept as copied hold it lowercased
///   (`Index::search_as_copied` unset): given their text as copied, so a
///   row found far into its text shows that stretch as it was written.
///
/// A row that needs any of it has its record read once. A record that
/// cannot be read leaves its row as it was — a row that still works. Worked
/// out before the write and applied by id, so it lands the same on an index
/// read again after a race.
#[derive(Default)]
struct Upkeep {
    titles: HashMap<String, (String, String)>,
    counts: HashMap<String, u32>,
    colors: HashSet<String>,
    /// Each row's search text as copied, and the text read in its image —
    /// `None` when the index holds them as copied already.
    searches: Option<HashMap<String, (String, Option<String>)>>,
}

impl Upkeep {
    fn of(host: &impl Host, index: &Index) -> Upkeep {
        use history::Kind;
        let mut upkeep = Upkeep { searches: (!index.search_as_copied).then(HashMap::new), ..Upkeep::default() };
        for entry in &index.items {
            let by_id = entry.kind == Kind::File && entry.title.contains("/.file/id=");
            let uncounted = entry.kind == Kind::File
                && entry.file_count == 0
                && entry.title.contains(" + ")
                && entry.title.ends_with(" more");
            let colour = matches!(entry.kind, Kind::Rich | Kind::Text) && history::is_color(&entry.title);
            if !(by_id || uncounted || colour || upkeep.searches.is_some()) {
                continue;
            }
            let Ok(record) = read_record(host, &entry.id) else { continue };
            if by_id {
                let title = history::title_of(&record.items, Kind::File);
                if !title.is_empty() && title != entry.title {
                    upkeep.titles.insert(entry.id.clone(), (title, history::file_ext_of(&record.items)));
                }
            }
            if uncounted {
                let count = history::file_count_of(&record.items);
                if count > 0 {
                    upkeep.counts.insert(entry.id.clone(), count);
                }
            }
            if colour && history::kind_of(&record.items) == Kind::Color {
                upkeep.colors.insert(entry.id.clone());
            }
            if let Some(searches) = &mut upkeep.searches {
                let read = record.ocr.as_deref().map(history::ocr_search_of);
                searches.insert(entry.id.clone(), (history::search_of(&record.items), read));
            }
        }
        upkeep
    }

    fn apply(&self, index: &mut Index) {
        for entry in &mut index.items {
            if let Some((title, ext)) = self.titles.get(&entry.id) {
                entry.title = title.clone();
                entry.file_ext = ext.clone();
            }
            if let Some(count) = self.counts.get(&entry.id) {
                entry.file_count = *count;
            }
            if self.colors.contains(&entry.id) {
                entry.kind = history::Kind::Color;
            }
            if let Some((search, read)) = self.searches.as_ref().and_then(|searches| searches.get(&entry.id)) {
                entry.search = search.clone();
                if let Some(read) = read {
                    entry.ocr_search = read.clone();
                }
            }
        }
        index.search_as_copied = true;
        index.upkeep = history::UPKEEP;
    }
}

/// Delete what an evicted or removed row held. Best effort: a record or
/// blob left behind is storage wasted, not a history that is wrong, and a
/// failure here must not undo the index write that already happened.
fn forget(host: &impl Host, entries: &[history::Entry]) {
    for entry in entries {
        let _ = host.delete(&record_key(&entry.id));
        for blob in &entry.blobs {
            let _ = host.delete_blob(blob);
        }
    }
}

fn on_copy(host: &impl Host, payload: &str) -> Result<(), String> {
    let copy: Copy =
        serde_json::from_str(payload).map_err(|err| format!("bad clipboard event: {err}"))?;
    if copy.v != 1 {
        return Err(format!("clipboard event version {} is newer than this build", copy.v));
    }
    let prefs = prefs(host);
    let id = host.new_id()?;

    // The record goes in first, under a key nobody else knows yet: a row in
    // the index whose record is missing is a row that cannot be pasted,
    // while a record with no row is only space, and is removed below if the
    // index write fails.
    let mut preview = history::apply(&mut Index::default(), copy.clone(), &prefs.rules, id.clone());
    let wrote_record = if let Outcome::Inserted { record, .. } = &mut preview {
        // Its links, found now and kept with it: the copy never changes,
        // so no preview has to look for them again.
        record.links = Some(links::kept(&record.items));
        let text = serde_json::to_string(record).map_err(|err| err.to_string())?;
        host.put(&record_key(&id), &text, None).map_err(|err| match err {
            PutError::Conflict => "a history record already had that id".to_string(),
            PutError::Failed(err) => err,
        })?;
        true
    } else {
        false
    };

    let outcome = update_index(host, |index| {
        Ok(history::apply(index, copy.clone(), &prefs.rules, id.clone()))
    });

    match outcome {
        // The row was added after all, or the copy was already there.
        Ok(Outcome::Inserted { evicted, .. }) => forget(host, &evicted),
        Ok(Outcome::Bumped { blobs, .. }) | Ok(Outcome::Ignored { blobs }) => {
            if wrote_record {
                let _ = host.delete(&record_key(&id));
            }
            for blob in blobs {
                let _ = host.delete_blob(&blob);
            }
        }
        Err(err) => {
            // Lumi deletes the event's blobs when the call fails, so only
            // the record is ours to clean up.
            if wrote_record {
                let _ = host.delete(&record_key(&id));
            }
            return Err(err);
        }
    }
    Ok(())
}

/// The text Lumi read in a copied image, a second or two after the copy.
fn on_ocr(host: &impl Host, payload: &str) -> Result<(), String> {
    #[derive(serde::Deserialize)]
    struct Ocr {
        v: u32,
        hash: String,
        text: String,
    }
    let ocr: Ocr = serde_json::from_str(payload).map_err(|err| format!("bad OCR event: {err}"))?;
    if ocr.v != 1 {
        return Err(format!("OCR event version {} is newer than this build", ocr.v));
    }
    update_index(host, |index| Ok(history::add_ocr(index, &ocr.hash, &ocr.text)))?;
    // The text as read, into the record, for Copy text in image. Best
    // effort: the row is findable by it already, which is the part that
    // must not fail.
    if !ocr.text.trim().is_empty() {
        let _ = keep_ocr(host, &ocr.hash, &ocr.text);
    }
    Ok(())
}

fn keep_ocr(host: &impl Host, hash: &str, text: &str) -> Result<(), String> {
    let (index, _) = read_index(host)?;
    let Some(entry) = index.items.iter().find(|e| e.hash == hash) else {
        return Ok(());
    };
    update_record(host, &entry.id, |record| record.ocr = Some(text.to_string()))
}

/// The links the preview lists for an item, as its record keeps them. A
/// record kept before records kept them, or by older rules, has them found
/// now and kept — so that is done once per item, not once per preview.
fn links_of_record(host: &impl Host, id: &str, record: &history::Record) -> links::KeptLinks {
    if let Some(kept) = record.links.as_ref().filter(|kept| kept.current()) {
        return kept.clone();
    }
    let kept = links::kept(&record.items);
    // Best effort: unkept, they are only found again next time.
    let _ = update_record(host, id, |record| record.links = Some(kept.clone()));
    kept
}

/// What the copy expands to as a snippet trigger, in the profiles the
/// setting names — nothing when it names none, or the copy is not one a
/// trigger can be. Expansions that come out the same every time are kept
/// with the record (`snippets::look`), written back only when that changed.
/// Best effort throughout: a Lumi that cannot answer leaves the preview
/// without the section, never without the preview.
fn snippets_of_record(host: &impl Host, id: &str, record: &history::Record, prefs: &Prefs) -> Vec<snippets::Shown> {
    let Some(text) = snippets::trigger_text(&record.items) else { return Vec::new() };
    let Some(within) = snippets::within(prefs.match_snippets, &prefs.snippet_profiles) else { return Vec::new() };
    let kept = record.snippets.clone().unwrap_or_default();
    let Ok(looked) = snippets::look(host, &text, &within, &kept) else { return Vec::new() };
    if looked.kept != kept {
        let now = Some(looked.kept.clone()).filter(|kept| !kept.is_empty());
        let _ = update_record(host, id, |record| record.snippets = now.clone());
    }
    looked.shown
}

/// Change one stored record — compare-and-swap, as the index is: the text
/// read in an image and a preview's links can land on it together. A record
/// gone since has nothing to change.
fn update_record(host: &impl Host, id: &str, change: impl Fn(&mut history::Record)) -> Result<(), String> {
    let key = record_key(id);
    for _ in 0..CAS_ATTEMPTS {
        let Some(stored) = host.get(&key)? else { return Ok(()) };
        let mut record: history::Record =
            serde_json::from_str(&stored.value).map_err(|err| err.to_string())?;
        change(&mut record);
        let value = serde_json::to_string(&record).map_err(|err| err.to_string())?;
        match host.put(&key, &value, Some(stored.rev)) {
            Ok(_) => return Ok(()),
            Err(PutError::Conflict) => continue,
            Err(PutError::Failed(err)) => return Err(err),
        }
    }
    Err("the record was busy".to_string())
}

fn read_record(host: &impl Host, id: &str) -> Result<history::Record, String> {
    let stored = host
        .get(&record_key(id))?
        .ok_or_else(|| "That item is no longer in the history.".to_string())?;
    serde_json::from_str(&stored.value).map_err(|err| format!("that item is unreadable: {err}"))
}

/// A request from the panel.
fn ui(host: &impl Host, request: &Value) -> Result<Value, String> {
    let id = || {
        request["id"]
            .as_str()
            .map(str::to_string)
            .ok_or_else(|| "the request names no item".to_string())
    };
    match request["kind"].as_str().unwrap_or_default() {
        "list" => {
            let prefs = prefs(host);
            // The panel's first list since it opened tidies the history as it
            // reads it (`open_history`); a list asked again — after a copy, a
            // pin, a delete — only reads it.
            let index = if request["opening"].as_bool() == Some(true) {
                open_history(host, &prefs)?
            } else {
                read_index(host)?.0
            };
            let mut items = history::sorted(&index, prefs.order);
            for entry in &mut items {
                // Its own field (`ocrSearch`), so the panel can say a row
                // was found by the words in its image.
                if !prefs.ocr {
                    // Reading is off: no row offers, or is found by, the
                    // text in its image.
                    entry.ocr_search.clear();
                    entry.ocr = false;
                }
            }
            Ok(json!({
                "items": items,
                "pasteOnSelect": prefs.paste_on_select,
                // For the page to match its text to the glass: "hud" is
                // dark whatever the system says.
                "appearance": prefs.appearance,
                "theme": prefs.shown_theme(),
                "searchMode": prefs.search,
                "pinKey": prefs.pin_key,
                "previewWidth": preview_width(host),
                "previewSplit": preview_split(host),
                "pdfFit": pdf_fit(host),
            }))
        }
        "preview" => {
            // The index carries a one-line title and lowercased search text,
            // neither of which is what the preview pane should show; the
            // record is. Asked per selected row, not per keystroke.
            // An image's text as Lumi read it, while reading is on.
            let id = id()?;
            let record = read_record(host, &id)?;
            let prefs = prefs(host);
            let ocr = record.ocr.as_deref().filter(|text| prefs.ocr && !text.trim().is_empty());
            // The web addresses in a text or rich copy, for the list under
            // its text — as kept with it, not looked for again.
            let links = links_of_record(host, &id, &record);
            // What the copy expands to, when it is a snippet's trigger.
            let expanded = snippets_of_record(host, &id, &record, &prefs);
            Ok(json!({
                "text": history::preview_text(&record.items),
                "html": history::preview_html(&record.items),
                "ocr": ocr,
                "fileSize": history::files_size_of(&record.items),
                "fileToken": history::file_token_of(&record.items),
                // Several files: each one, for the list the preview draws.
                "files": Some(history::files_list_of(&record.items)).filter(|files| !files.is_empty()),
                "fileCount": history::file_count_of(&record.items),
                "links": Some(&links.list).filter(|list| !list.is_empty()),
                "linkCount": links.count,
                "snippets": Some(&expanded).filter(|shown| !shown.is_empty()),
            }))
        }
        "paste" => {
            let record = read_record(host, &id()?)?;
            let items = if request["plain"].as_bool() == Some(true) {
                history::plain(&record.items)
            } else {
                record.items
            };
            if items.is_empty() {
                return Err("That item has no plain text to paste.".to_string());
            }
            // With "Paste on select" off, choosing a row only puts it on the
            // pasteboard — for somebody who wants to paste it themselves, or
            // somewhere a synthesised ⌘V is not welcome. The panel closes
            // either way. Read here rather than sent by the panel, so a
            // stale panel cannot disagree with the setting.
            let keystroke = prefs(host).paste_on_select;
            host.paste(&items, keystroke)?;
            if !keystroke {
                put_away(host, request)?;
            }
            Ok(json!({}))
        }
        "pin" => {
            let id = id()?;
            let pin = update_index(host, |index| history::toggle_pin(index, &id))?;
            tell_dashboard(host);
            Ok(json!({ "pin": pin }))
        }
        // One id, or `ids` — ⌘⇧Z doing a Delete all again, exactly the
        // rows it took the first time.
        "delete" => {
            let ids: Vec<String> = match request["ids"].as_array() {
                Some(ids) => ids.iter().filter_map(|id| id.as_str().map(str::to_string)).collect(),
                None => vec![id()?],
            };
            // Into the trash, not gone: ⌘Z may want it back before the
            // panel closes. Its record and blobs go when the panel next opens.
            update_index(host, |index| {
                for id in &ids {
                    history::trash(index, id);
                }
                Ok(())
            })?;
            tell_dashboard(host);
            Ok(json!({}))
        }
        // One id, or `ids` for what a Delete all took.
        "restore" => {
            let ids: Vec<String> = match request["ids"].as_array() {
                Some(ids) => ids.iter().filter_map(|id| id.as_str().map(str::to_string)).collect(),
                None => vec![id()?],
            };
            let outcomes = update_index(host, |index| {
                Ok(ids.iter().map(|id| history::restore(index, id)).collect::<Vec<_>>())
            })?;
            let mut back = 0;
            for outcome in &outcomes {
                match outcome {
                    history::Restored::Back => back += 1,
                    history::Restored::Surplus(entry) => forget(host, std::slice::from_ref(&**entry)),
                    history::Restored::Gone => {}
                }
            }
            tell_dashboard(host);
            Ok(json!({ "restored": back == ids.len() && back > 0, "count": back }))
        }
        "setPin" => {
            let id = id()?;
            let wanted = match &request["pin"] {
                Value::Null => None,
                Value::String(s) if s.chars().count() == 1 => s.chars().next(),
                _ => return Err("the pin is not a letter".to_string()),
            };
            let pin = update_index(host, |index| history::set_pin(index, &id, wanted))?;
            tell_dashboard(host);
            Ok(json!({ "pin": pin }))
        }
        // Delete all unpinned, and delete all: into the trash, like one
        // delete, so ⌘Z can bring every row back until the panel reopens.
        "clear" | "clearAll" => {
            let keep_pins = request["kind"] == "clear";
            let ids = update_index(host, |index| Ok(history::trash_all(index, keep_pins)))?;
            tell_dashboard(host);
            Ok(json!({ "ids": ids }))
        }
        // A press on a row (or on one file of a row's list) that started to
        // move: Lumi drags the item out, from the panel, into wherever it is
        // dropped. The pasteboard is not touched.
        "drag" => {
            let record = read_record(host, &id()?)?;
            let items = match request["file"].as_u64() {
                Some(at) => history::file_item_at(&record.items, at as usize)
                    .map(|item| vec![item])
                    .ok_or("That file is not in the item.")?,
                None => record.items,
            };
            host.drag(&items, prefs(host).close_after_drag)?;
            Ok(json!({}))
        }
        // Put an item on the pasteboard and put the panel away — no ⌘V.
        "copy" => {
            let record = read_record(host, &id()?)?;
            let items = if request["plain"].as_bool() == Some(true) {
                history::plain(&record.items)
            } else {
                record.items
            };
            if items.is_empty() {
                return Err("That item has no plain text to copy.".to_string());
            }
            host.paste(&items, false)?;
            put_away(host, request)?;
            Ok(json!({}))
        }
        "copyText" => {
            let record = read_record(host, &id()?)?;
            let text = record
                .ocr
                .filter(|text| prefs(host).ocr && !text.trim().is_empty())
                .ok_or_else(|| "Lumi read no text in that image.".to_string())?;
            let rep = history::Rep { uti: "public.utf8-plain-text".to_string(), bytes: text.len() as u64, text: Some(text), blob: None, file_size: None, path: None, file_token: None };
            host.paste(&[vec![rep]], false)?;
            put_away(host, request)?;
            Ok(json!({}))
        }
        // Copy path(s): the places, as text — not the files, which Copy is.
        "copyPath" => {
            let record = read_record(host, &id()?)?;
            let text = history::paths_text_of(&record.items).ok_or_else(|| "Lumi does not know where that file is.".to_string())?;
            let rep = history::Rep { uti: "public.utf8-plain-text".to_string(), bytes: text.len() as u64, text: Some(text), blob: None, file_size: None, path: None, file_token: None };
            host.paste(&[vec![rep]], false)?;
            put_away(host, request)?;
            Ok(json!({}))
        }
        // One of a colour row's formats, from the preview. The page writes
        // the text, so only a colour is taken: the webview cannot put
        // anything else on the pasteboard through this.
        "copyColor" => {
            let text = request["text"].as_str().map(str::trim).unwrap_or_default();
            if !history::is_color(text) {
                return Err("That is not a colour.".to_string());
            }
            let rep = history::Rep { uti: "public.utf8-plain-text".to_string(), bytes: text.len() as u64, text: Some(text.to_string()), blob: None, file_size: None, path: None, file_token: None };
            host.paste(&[vec![rep]], false)?;
            put_away(host, request)?;
            // Best effort: the copy happened whether or not it is said.
            let _ = host.alert(&format!("Copied {text}"));
            Ok(json!({}))
        }
        // What a row expands to as a snippet trigger, from the preview's
        // Copy. Taken only when the row still expands to it — or, for an
        // expansion made fresh each time (a date, a random value), when one
        // of those is among its snippets: what the person saw is what they
        // copy, and this side cannot make the same value twice.
        "copySnippet" => {
            let id = id()?;
            let record = read_record(host, &id)?;
            let wanted = request["text"].as_str().unwrap_or_default();
            let shown = snippets_of_record(host, &id, &record, &prefs(host));
            if wanted.is_empty() || !shown.iter().any(|one| one.text == wanted || one.dynamic) {
                return Err("That is not what the item expands to.".to_string());
            }
            let rep = history::Rep { uti: "public.utf8-plain-text".to_string(), bytes: wanted.len() as u64, text: Some(wanted.to_string()), blob: None, file_size: None, path: None, file_token: None };
            host.paste(&[vec![rep]], false)?;
            put_away(host, request)?;
            let _ = host.alert("Copied the snippet's expansion");
            Ok(json!({}))
        }
        // A link row's address — or, with `url`, one of the links the
        // preview listed for a text or rich row: opened only when it is one
        // the stored item keeps, so the page can name an address but never
        // make one up. With `snippet`, a link in what the row expands to,
        // found again the way `copySnippet` finds its text.
        "open" => {
            let id = id()?;
            let record = read_record(host, &id)?;
            let url = match request["url"].as_str() {
                Some(wanted) if request["snippet"].as_bool() == Some(true) => {
                    let shown = snippets_of_record(host, &id, &record, &prefs(host));
                    let listed = shown.iter().any(|one| {
                        one.links.iter().any(|link| link.url == wanted) || (one.dynamic && links::is_web_address(wanted))
                    });
                    if !listed {
                        return Err("That link is not in what the item expands to.".to_string());
                    }
                    wanted.to_string()
                }
                Some(wanted) => links_of_record(host, &id, &record)
                    .list
                    .into_iter()
                    .find(|link| link.url == wanted)
                    .map(|link| link.url)
                    .ok_or_else(|| "That link is not in the item.".to_string())?,
                None => history::link_of(&record.items).ok_or_else(|| "That item is not a web address.".to_string())?,
            };
            host.open_url(&links::for_opening(&url))?;
            put_away(host, request)?;
            Ok(json!({}))
        }
        // The menu's Settings… / ⌘,: the panel goes, Settings comes.
        "settings" => {
            host.close_window(PANEL)?;
            host.open_settings()?;
            Ok(json!({}))
        }
        // About's links: the docs and the store page, in the browser.
        "openDocs" | "openStore" => {
            host.open_url(if request["kind"] == "openDocs" { DOCS_URL } else { STORE_URL })?;
            put_away(host, request)?;
            Ok(json!({}))
        }
        // About's Welcome tour: the panel goes, the tour comes — the same
        // window an install opens.
        "tour" => {
            host.close_window(PANEL)?;
            host.open_window(WELCOME)?;
            Ok(json!({}))
        }
        "reveal" => {
            let record = read_record(host, &id()?)?;
            let file = history::file_url_of(&record.items).ok_or_else(|| "That item is not a file.".to_string())?;
            host.reveal(&file)?;
            put_away(host, request)?;
            Ok(json!({}))
        }
        // Save image as…: the panel suggests a name (it has the local
        // clock; the component has only UTC), the type picks the suffix.
        // Lumi takes the panel down itself before its Save panel comes up.
        "saveImage" => {
            let record = read_record(host, &id()?)?;
            let (blob, suffix) =
                history::image_file_of(&record.items).ok_or_else(|| "That item has no image to save.".to_string())?;
            let stem = request["name"].as_str().and_then(history::file_stem).unwrap_or_else(|| "Image".to_string());
            host.save_blob(&blob, &format!("{stem}.{suffix}"))?;
            Ok(json!({}))
        }
        "previewWidth" => {
            let width = request["width"]
                .as_u64()
                .filter(|w| PREVIEW_WIDTHS.contains(w))
                .ok_or_else(|| "the width is not one a pane can be".to_string())?;
            for _ in 0..CAS_ATTEMPTS {
                let rev = host.get(PREVIEW_WIDTH)?.map(|s| s.rev);
                match host.put(PREVIEW_WIDTH, &width.to_string(), rev) {
                    Ok(_) => return Ok(json!({})),
                    Err(PutError::Conflict) => continue,
                    Err(PutError::Failed(err)) => return Err(err),
                }
            }
            Err("the width was busy; try again".to_string())
        }
        // A height for the part above the line, or null to put the line
        // back where the page draws it.
        "previewSplit" => {
            if request["height"].is_null() {
                host.delete(PREVIEW_SPLIT)?;
                return Ok(json!({}));
            }
            let height = request["height"]
                .as_u64()
                .filter(|h| PREVIEW_SPLITS.contains(h))
                .ok_or_else(|| "the height is not one a part can be".to_string())?;
            for _ in 0..CAS_ATTEMPTS {
                let rev = host.get(PREVIEW_SPLIT)?.map(|s| s.rev);
                match host.put(PREVIEW_SPLIT, &height.to_string(), rev) {
                    Ok(_) => return Ok(json!({})),
                    Err(PutError::Conflict) => continue,
                    Err(PutError::Failed(err)) => return Err(err),
                }
            }
            Err("the split was busy; try again".to_string())
        }
        "pdfFit" => {
            let place = if request["zoomed"].as_bool() == Some(true) { "zoomed" } else { "pane" };
            let fit = request["fit"]
                .as_str()
                .filter(|fit| matches!(*fit, "width" | "height"))
                .ok_or_else(|| "a PDF fits its width or its height".to_string())?;
            for _ in 0..CAS_ATTEMPTS {
                let stored = host.get(PDF_FIT)?;
                let rev = stored.as_ref().map(|s| s.rev);
                let mut fits = pdf_fit(host);
                fits[place] = json!(fit);
                match host.put(PDF_FIT, &fits.to_string(), rev) {
                    Ok(_) => return Ok(json!({})),
                    Err(PutError::Conflict) => continue,
                    Err(PutError::Failed(err)) => return Err(err),
                }
            }
            Err("the fit was busy; try again".to_string())
        }
        "close" => {
            host.close_window(PANEL)?;
            Ok(json!({}))
        }
        // The pin in the panel's title bar: stay up while the person works
        // in another app. Lumi takes the pin off when the panel goes.
        "pinPanel" => {
            let pinned = request["pinned"].as_bool().ok_or("the pin is not on or off")?;
            host.set_pinned(PANEL, pinned)?;
            Ok(json!({ "pinned": pinned }))
        }
        // A pinned panel told it was asked for (`SUMMONED`): the keyboard
        // back from whichever app has it. The page's own request, not a
        // press, so Lumi hands it over where the panel stands and never
        // puts the panel away; one that holds the keyboard already keeps it.
        "focus" => {
            host.open_window(PANEL)?;
            Ok(json!({}))
        }
        other => Err(format!("the panel has no {other} request")),
    }
}

/// Put the panel away after something done from it — a copy, a link opened,
/// a file shown — unless the person pinned it (`pinned` in the request: the
/// page is the one that knows), which is asking for exactly the opposite.
/// Escape and Settings… close it pinned or not.
fn put_away(host: &impl Host, request: &Value) -> Result<(), String> {
    if request["pinned"].as_bool() == Some(true) {
        return Ok(());
    }
    host.close_window(PANEL)
}

/// The width the preview pane was last dragged to; `None` for never, or
/// for anything stored that is not a width.
fn preview_width(host: &impl Host) -> Option<u64> {
    let stored = host.get(PREVIEW_WIDTH).ok()??;
    stored.value.parse().ok().filter(|w| PREVIEW_WIDTHS.contains(w))
}

/// The height of the part above the preview's line, as last dragged; None
/// for never, or for back to the default.
fn preview_split(host: &impl Host) -> Option<u64> {
    let stored = host.get(PREVIEW_SPLIT).ok()??;
    stored.value.parse().ok().filter(|h| PREVIEW_SPLITS.contains(h))
}

/// What a PDF's 100% fits, beside the list (`pane`) and in the zoomed panel
/// (`zoomed`), as last picked; a place never picked, or holding anything
/// but a fit, is left out and the page's default stands.
fn pdf_fit(host: &impl Host) -> Value {
    let stored: Value = host
        .get(PDF_FIT)
        .ok()
        .flatten()
        .and_then(|s| serde_json::from_str(&s.value).ok())
        .unwrap_or(Value::Null);
    let mut fits = serde_json::Map::new();
    for place in ["pane", "zoomed"] {
        if let Some(fit) = stored[place].as_str().filter(|fit| matches!(*fit, "width" | "height")) {
            fits.insert(place.to_string(), json!(fit));
        }
    }
    Value::Object(fits)
}

/// The Dashboard's one request.
fn dashboard(host: &impl Host, request: &Value) -> Result<Value, String> {
    match request["kind"].as_str().unwrap_or_default() {
        "stats" => stats(host),
        other => Err(format!("the Dashboard has no {other} request")),
    }
}

fn settings(host: &impl Host, request: &Value) -> Result<Value, String> {
    match request["kind"].as_str().unwrap_or_default() {
        "stats" => stats(host),
        "apps" => Ok(json!({ "apps": seen_apps(host)? })),
        // Every profile and the live one, for "Match snippets" to tick.
        "profiles" => {
            let (active, rows) = host.profiles()?;
            let rows: Vec<Value> = rows.into_iter().map(|row| json!({ "id": row.id, "name": row.name })).collect();
            Ok(json!({ "active": active, "profiles": rows }))
        }
        // Sent after the tab saves Appearance: the panel, if it is up,
        // changes with it.
        "dress" => {
            dress(host);
            Ok(json!({}))
        }
        "tryPatterns" => {
            let patterns = request["patterns"].as_str().unwrap_or_default();
            let sample = request["sample"].as_str().unwrap_or_default();
            if patterns.len() > MAX_TRY || sample.len() > MAX_TRY {
                return Err("that is too long to try".to_string());
            }
            Ok(try_patterns(patterns, sample))
        }
        other => Err(format!("the Settings tab has no {other} request")),
    }
}

/// The apps copies in the history came from, most recent first, one each:
/// what "Never keep copies from" offers to pick from.
fn seen_apps(host: &impl Host) -> Result<Vec<Value>, String> {
    let (index, _) = read_index(host)?;
    let mut items: Vec<&history::Entry> = index.items.iter().collect();
    items.sort_by_key(|e| std::cmp::Reverse(e.last));
    let mut seen = std::collections::HashSet::new();
    Ok(items
        .into_iter()
        .filter_map(|e| Some((e.app.as_deref()?, e.app_name.as_deref())))
        .filter(|(id, _)| seen.insert(*id))
        .map(|(id, name)| json!({ "id": id, "name": name.unwrap_or(id) }))
        .collect())
}

/// The pattern list as the history will use it — the same engine, the same
/// one-per-line reading — tried against a sample: which lines do not
/// compile, and which line (1-based) would keep the sample out, if any.
fn try_patterns(patterns: &str, sample: &str) -> Value {
    let mut errors = Vec::new();
    let mut matched = None;
    for (at, line) in patterns.lines().enumerate() {
        let line = line.trim();
        if line.is_empty() {
            continue;
        }
        match regex_lite::Regex::new(line) {
            Ok(re) => {
                if matched.is_none() && !sample.is_empty() && re.is_match(sample) {
                    matched = Some(at + 1);
                }
            }
            Err(err) => errors.push(json!({ "line": at + 1, "error": err.to_string() })),
        }
    }
    json!({ "errors": errors, "matched": matched })
}

/// How much the history holds, read off the index alone — no record is
/// opened, so it costs one storage read.
fn stats(host: &impl Host) -> Result<Value, String> {
    let (index, _) = read_index(host)?;
    let items = &index.items;
    Ok(json!({
        "kept": items.len(),
        "keep": prefs(host).keep,
        "pinned": items.iter().filter(|e| e.pin.is_some()).count(),
        "images": items.iter().filter(|e| e.kind == history::Kind::Image).count(),
        // Milliseconds, Lumi's clock; null for an empty history.
        "since": items.iter().map(|e| e.first).min(),
    }))
}

#[cfg(test)]
mod tests {
    use super::*;
    use host::memory::Memory;

    fn event(hash: &str, at: i64, text: &str) -> String {
        json!({
            "v": 1, "at": at, "hash": hash,
            "source": { "bundleId": "com.apple.Notes", "name": "Notes" },
            "items": [[{ "uti": "public.utf8-plain-text", "text": text, "bytes": text.len() }]]
        })
        .to_string()
    }

    fn image_event(hash: &str, blob: &str) -> String {
        json!({
            "v": 1, "at": 1, "hash": hash,
            "items": [[{ "uti": "public.png", "blob": blob, "bytes": 10 }]]
        })
        .to_string()
    }

    /// The payload exactly as Lumi's `ext::events::payload` writes it — a
    /// text rep, an HTML rep, an image as a blob, and a rep too big to carry
    /// that arrives as its size alone. Lumi's own test holds that side to
    /// the same keys; the two together are the contract, so a rename on
    /// either side fails a test instead of silently losing every copy.
    const FIXTURE: &str = include_str!("fixtures/clipboard-v1.json");

    #[test]
    fn lumi_s_payload_lands_as_a_row() {
        let host = Memory::default();
        on_event(&host, "clipboard", FIXTURE).unwrap();
        let rows = list(&host);
        assert_eq!(rows.len(), 1, "{rows:?}");
        let row = &rows[0];
        assert_eq!(row["kind"], "rich");
        assert_eq!(row["title"], "Chuyển tính năng sang extension");
        assert_eq!(row["appName"], "Safari");
        assert_eq!(row["thumb"], "0123456789abcdef0123456789abcdef");

        // The same copy pasted back from this history: Lumi marks it with
        // the extension's id and hashes it the same, so the row is counted
        // again rather than added twice, and keeps saying Safari.
        let mut again: Value = serde_json::from_str(FIXTURE).unwrap();
        again["origin"] = json!("dev.thiennguyen.clipboard");
        again["source"] = json!({ "bundleId": "com.apple.TextEdit", "name": "TextEdit" });
        on_event(&host, "clipboard", &again.to_string()).unwrap();
        let rows = list(&host);
        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0]["count"], 2);
        assert_eq!(rows[0]["appName"], "Safari");
    }

    /// `on-event("clipboard-ocr", …)` as Lumi sends it, for the fixture copy
    /// above (same hash): the image's words join that row's search.
    const OCR_FIXTURE: &str = include_str!("fixtures/clipboard-ocr-v1.json");

    #[test]
    fn lumi_s_ocr_text_makes_the_row_findable_by_its_image() {
        let host = Memory::default();
        on_event(&host, "clipboard", FIXTURE).unwrap();
        on_event(&host, "clipboard-ocr", OCR_FIXTURE).unwrap();
        let rows = list(&host);
        let read = rows[0]["ocrSearch"].as_str().unwrap().to_lowercase();
        assert!(read.contains("tìm kiếm nhanh"), "{read}");
        let own = rows[0]["search"].as_str().unwrap().to_lowercase();
        assert!(own.starts_with("chuyển tính năng"), "the row's own text is its own: {own}");
        assert!(!own.contains("tìm kiếm nhanh"), "and the image's words are not in it: {own}");

        // Text for a copy the history no longer has is nothing to do.
        let stray = OCR_FIXTURE.replace("5f2c", "0000");
        on_event(&host, "clipboard-ocr", &stray).unwrap();
    }

    #[test]
    fn rows_kept_lowercased_get_their_text_back_as_copied_once() {
        let host = Memory::default();
        on_event(&host, "clipboard", FIXTURE).unwrap();
        on_event(&host, "clipboard-ocr", OCR_FIXTURE).unwrap();
        let (index, _) = read_index(&host).unwrap();
        assert!(index.search_as_copied, "a history started now starts as copied");
        let copied = index.items[0].search.clone();
        let read = index.items[0].ocr_search.clone();
        assert_ne!(copied, copied.to_lowercase(), "the fixture has capitals to lose");

        // As an older build kept it: lowercased, and nothing to say it was.
        update_index(&host, |index| {
            index.search_as_copied = false;
            index.upkeep = 0;
            for entry in &mut index.items {
                entry.search = entry.search.to_lowercase();
                entry.ocr_search = entry.ocr_search.to_lowercase();
            }
            Ok(())
        })
        .unwrap();

        ui(&host, &json!({"kind": "list", "opening": true})).unwrap();
        let (index, _) = read_index(&host).unwrap();
        assert_eq!(index.items[0].search, copied);
        assert_eq!(index.items[0].ocr_search, read);
        assert!(index.search_as_copied);

        // Done once: what the index holds now is left as it is.
        update_index(&host, |index| {
            index.items[0].search = "left alone".into();
            Ok(())
        })
        .unwrap();
        ui(&host, &json!({"kind": "list", "opening": true})).unwrap();
        assert_eq!(read_index(&host).unwrap().0.items[0].search, "left alone");
    }

    #[test]
    fn colours_copied_with_html_are_colours_and_old_rows_are_told_again() {
        let host = Memory::default();
        let colour = FIXTURE.replace("Chuyển tính năng sang extension", "#12345678");
        on_event(&host, "clipboard", &colour).unwrap();
        let (index, _) = read_index(&host).unwrap();
        assert_eq!(index.items[0].kind, history::Kind::Color);

        // As an older build kept it.
        update_index(&host, |index| {
            index.items[0].kind = history::Kind::Rich;
            index.upkeep = 0;
            Ok(())
        })
        .unwrap();
        ui(&host, &json!({"kind": "list", "opening": true})).unwrap();
        assert_eq!(read_index(&host).unwrap().0.items[0].kind, history::Kind::Color);
    }

    #[test]
    fn copy_color_takes_a_colour_and_nothing_else() {
        let host = Memory::default();
        ui(&host, &json!({"kind": "copyColor", "text": "rgb(55 138 221 / 0.5)"})).unwrap();
        assert_eq!(*host.keystrokes.borrow(), [false], "a copy, not a paste");
        assert!(ui(&host, &json!({"kind": "copyColor", "text": "rm -rf ~"})).is_err());
        assert!(ui(&host, &json!({"kind": "copyColor"})).is_err());
        assert_eq!(host.keystrokes.borrow().len(), 1, "nothing else reached the pasteboard");
        assert_eq!(*host.alerts.borrow(), ["Copied rgb(55 138 221 / 0.5)"], "said once, for the copy that happened");
    }

    #[test]
    fn a_copy_before_the_panel_opens_does_not_skip_reading_old_rows_again() {
        let host = Memory::default();
        on_event(&host, "clipboard", FIXTURE).unwrap();
        update_index(&host, |index| {
            index.search_as_copied = false;
            index.upkeep = 0;
            index.items[0].search = index.items[0].search.to_lowercase();
            Ok(())
        })
        .unwrap();
        // A new copy lands on the old index before anyone opens the panel.
        let mut other: Value = serde_json::from_str(FIXTURE).unwrap();
        other["hash"] = json!("another");
        on_event(&host, "clipboard", &other.to_string()).unwrap();
        assert!(!read_index(&host).unwrap().0.search_as_copied);
        assert_eq!(read_index(&host).unwrap().0.upkeep, 0, "nor the rest of the upkeep");
    }

    #[test]
    fn opening_the_panel_reads_the_index_once_and_writes_it_only_with_something_to_do() {
        let host = Memory::default();
        on_event(&host, "clipboard", &event("h1", 1, "one")).unwrap();
        on_event(&host, "clipboard", &event("h2", 2, "two")).unwrap();
        let index_reads = |host: &Memory| host.reads.borrow().iter().filter(|key| *key == INDEX).count();

        host.reads.borrow_mut().clear();
        let rev = host.kv.borrow()[INDEX].rev;
        let rows = ui(&host, &json!({"kind": "list", "opening": true})).unwrap()["items"].as_array().unwrap().len();
        assert_eq!(rows, 2);
        assert_eq!(index_reads(&host), 1);
        assert_eq!(host.kv.borrow()[INDEX].rev, rev, "nothing to do, nothing written");

        // Something deleted last time: one read, one write, and the list is
        // the index as written.
        ui(&host, &json!({"kind": "delete", "id": "id1"})).unwrap();
        host.reads.borrow_mut().clear();
        let shown = ui(&host, &json!({"kind": "list", "opening": true})).unwrap();
        assert_eq!(shown["items"].as_array().unwrap().len(), 1);
        assert_eq!(index_reads(&host), 1);
        assert!(read_index(&host).unwrap().0.trash.is_empty());
        assert!(!host.kv.borrow().contains_key("item.id1"));
    }

    #[test]
    fn rows_of_an_older_build_are_brought_up_to_date_once_and_then_not_looked_at() {
        let host = Memory::default();
        // A row whose title reads as a colour while its record is no colour:
        // the upkeep reads its record, and would at every opening if it did
        // not say it was done.
        on_event(&host, "clipboard", &event("h1", 1, "#fff\nand more")).unwrap();
        update_index(&host, |index| {
            index.items[0].title = "#fff".into();
            index.upkeep = 0;
            Ok(())
        })
        .unwrap();
        let record_reads = |host: &Memory| host.reads.borrow().iter().filter(|key| key.starts_with("item.")).count();

        host.reads.borrow_mut().clear();
        ui(&host, &json!({"kind": "list", "opening": true})).unwrap();
        assert_eq!(record_reads(&host), 1);
        assert_eq!(read_index(&host).unwrap().0.upkeep, history::UPKEEP);
        assert_eq!(read_index(&host).unwrap().0.items[0].kind, history::Kind::Text, "no colour after all");

        host.reads.borrow_mut().clear();
        ui(&host, &json!({"kind": "list", "opening": true})).unwrap();
        assert_eq!(record_reads(&host), 0, "done once");
    }

    fn list(host: &Memory) -> Vec<Value> {
        ui(host, &json!({"kind": "list"})).unwrap()["items"]
            .as_array()
            .unwrap()
            .clone()
    }

    /// A full history: `MAX_ITEMS` text rows, each with a kilobyte of
    /// search text — the most an index holds.
    fn full_history() -> Memory {
        let host = Memory::default();
        let mut index = Index::default();
        let rules = Rules::new(MAX_ITEMS, vec![], "").0;
        for n in 0..MAX_ITEMS {
            let text = format!("{n} {}", "lorem ipsum dolor sit amet ".repeat(40));
            let copy: history::Copy = serde_json::from_str(&event(&format!("h{n}"), n as i64, &text)).unwrap();
            history::apply(&mut index, copy, &rules, format!("id{n}"));
        }
        host.put(INDEX, &serde_json::to_string(&index).unwrap(), None).unwrap();
        host
    }

    /// From the repo root:
    /// `cargo test --manifest-path ext/dev.thiennguyen.clipboard/Cargo.toml --release --lib opening_a_full_history -- --ignored --nocapture`
    #[test]
    #[ignore = "a measurement, not a check"]
    fn opening_a_full_history_costs() {
        let host = full_history();
        let bytes = host.kv.borrow()[INDEX].value.len();
        let runs = 50;
        let start = std::time::Instant::now();
        for _ in 0..runs {
            ui(&host, &json!({"kind": "list", "opening": true})).unwrap();
        }
        let each = start.elapsed() / runs;
        host.reads.borrow_mut().clear();
        ui(&host, &json!({"kind": "list", "opening": true})).unwrap();
        let reads = host.reads.borrow();
        let index_reads = reads.iter().filter(|key| *key == INDEX).count();
        let record_reads = reads.iter().filter(|key| key.starts_with("item.")).count();
        println!(
            "opening a list of {MAX_ITEMS} rows ({} KB index): {each:?} a call, {index_reads} index reads, {record_reads} record reads",
            bytes / 1024
        );
    }

    #[test]
    fn a_copy_lands_as_a_row_and_a_record() {
        let host = Memory::default();
        on_event(&host, "clipboard", &event("h1", 1, "hello")).unwrap();
        let rows = list(&host);
        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0]["title"], "hello");
        assert_eq!(rows[0]["appName"], "Notes");
        assert!(host.kv.borrow().contains_key("item.id1"));
    }

    #[test]
    fn a_duplicate_leaves_no_orphan_record_and_drops_its_blobs() {
        let host = Memory::default();
        host.blobs.borrow_mut().extend(["a".to_string(), "b".to_string()]);
        on_event(&host, "clipboard", &image_event("h1", "a")).unwrap();
        on_event(&host, "clipboard", &image_event("h1", "b")).unwrap();
        let kv = host.kv.borrow();
        assert_eq!(kv.keys().filter(|k| k.starts_with("item.")).count(), 1);
        assert!(host.blobs.borrow().contains("a"));
        assert!(!host.blobs.borrow().contains("b"));
    }

    #[test]
    fn eviction_removes_records_and_blobs() {
        let host = Memory::default();
        *host.settings.borrow_mut() = json!({ "keep": "5m" });
        host.blobs.borrow_mut().insert("img".into());
        on_event(&host, "clipboard", &image_event("h1", "img")).unwrap();
        on_event(&host, "clipboard", &event("h2", 6 * 60_000, "newer")).unwrap();
        assert_eq!(list(&host).len(), 1);
        assert!(!host.kv.borrow().contains_key("item.id1"));
        assert!(host.blobs.borrow().is_empty());
    }

    #[test]
    fn opening_the_panel_drops_what_aged_out_without_a_copy() {
        let host = Memory::default();
        *host.settings.borrow_mut() = json!({ "keep": "1h" });
        on_event(&host, "clipboard", &event("h1", 1_000, "old")).unwrap();
        on_event(&host, "clipboard", &event("h2", 50 * 60_000, "newer")).unwrap();
        host.now.set(61 * 60_000 + 1_000);
        ui(&host, &json!({"kind": "list", "opening": true})).unwrap();
        let rows = list(&host);
        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0]["title"], "newer");
        assert!(!host.kv.borrow().contains_key("item.id1"));
        assert_eq!(settings(&host, &json!({"kind": "stats"})).unwrap()["keep"], "1h");
    }

    #[test]
    fn a_racing_write_is_retried() {
        let host = Memory::default();
        on_event(&host, "clipboard", &event("h1", 1, "one")).unwrap();
        host.conflicts.set(2);
        ui(&host, &json!({"kind": "pin", "id": "id1"})).unwrap();
        assert_eq!(list(&host)[0]["pin"], "b");
    }

    #[test]
    fn a_pinned_panel_stays_up_after_a_copy() {
        let host = Memory::default();
        on_event(&host, "clipboard", &event("h1", 1, "one")).unwrap();
        ui(&host, &json!({"kind": "pinPanel", "pinned": true})).unwrap();
        assert_eq!(host.opened.borrow().last().unwrap(), &format!("pinned {PANEL} true"));
        ui(&host, &json!({"kind": "copy", "id": "id1", "pinned": true})).unwrap();
        assert_eq!(host.pasted.borrow().len(), 1, "copied");
        assert_eq!(host.closed.get(), 0, "and still up");
        ui(&host, &json!({"kind": "copy", "id": "id1"})).unwrap();
        assert_eq!(host.closed.get(), 1, "unpinned, a copy puts it away");
        ui(&host, &json!({"kind": "close", "pinned": true})).unwrap();
        assert_eq!(host.closed.get(), 2, "Escape closes it pinned or not");
        assert!(ui(&host, &json!({"kind": "pinPanel"})).is_err(), "on or off, nothing else");
    }

    #[test]
    fn show_only_ever_brings_the_panel_up() {
        let host = Memory::default();
        let opens = || host.opened.borrow().iter().filter(|o| o.starts_with("open-window")).count();
        command(&host, "open").unwrap();
        assert_eq!(opens(), 1, "opened");
        // Run again while up: told, never opened again — a press's
        // open-window on a panel with the keyboard is Lumi putting it away.
        host.posts.borrow_mut().clear();
        command(&host, "open").unwrap();
        command(&host, "open").unwrap();
        assert_eq!(opens(), 1, "still the one open");
        assert_eq!(host.closed.get(), 0, "and never put away");
        assert_eq!(*host.posts.borrow(), [(PANEL.to_string(), SUMMONED.to_string()), (PANEL.to_string(), SUMMONED.to_string())]);
        let message: Value = serde_json::from_str(SUMMONED).unwrap();
        assert_eq!(message, json!({"kind": "summoned"}));
        // Pinned and left, the page asks for the keyboard back itself.
        ui(&host, &json!({"kind": "focus"})).unwrap();
        assert_eq!(opens(), 2);
        // Escape puts it away; the next Show opens it again.
        ui(&host, &json!({"kind": "close"})).unwrap();
        assert_eq!(host.closed.get(), 1);
        command(&host, "open").unwrap();
        assert_eq!(opens(), 3, "opened again");
    }

    #[test]
    fn hide_and_toggle_put_the_panel_away_and_toggle_brings_it_back() {
        let host = Memory::default();
        let opens = || host.opened.borrow().iter().filter(|o| o.starts_with("open-window")).count();
        command(&host, "hide").unwrap();
        assert_eq!(host.closed.get(), 1, "hiding a panel not up is not an error");
        command(&host, "toggle").unwrap();
        assert_eq!(opens(), 1, "not up: shown");
        command(&host, "toggle").unwrap();
        assert_eq!((opens(), host.closed.get()), (1, 2), "up: put away");
        command(&host, "open").unwrap();
        command(&host, "hide").unwrap();
        assert_eq!(host.closed.get(), 3);
        // Toggle asks with a ping the page does nothing with; only Show
        // tells it it was asked for.
        let count = |message: &str| host.posts.borrow().iter().filter(|(_, m)| m == message).count();
        assert_eq!((count(PING), count(SUMMONED)), (2, 1));
        assert!(command(&host, "nope").is_err());
    }

    #[test]
    fn plain_paste_sends_text_only() {
        let host = Memory::default();
        let rich = json!({
            "v": 1, "at": 1, "hash": "h",
            "items": [[
                { "uti": "public.utf8-plain-text", "text": "bold" },
                { "uti": "public.html", "text": "<b>bold</b>" }
            ]]
        });
        on_event(&host, "clipboard", &rich.to_string()).unwrap();
        ui(&host, &json!({"kind": "paste", "id": "id1", "plain": true})).unwrap();
        ui(&host, &json!({"kind": "paste", "id": "id1"})).unwrap();
        let pasted = host.pasted.borrow();
        assert_eq!(pasted[0][0].len(), 1);
        assert_eq!(pasted[1][0].len(), 2);
        assert_eq!(*host.keystrokes.borrow(), [true, true]);
        let shown = ui(&host, &json!({"kind": "preview", "id": "id1"})).unwrap();
        assert_eq!(shown["text"], "bold");
        assert_eq!(shown["html"], "<b>bold</b>");
    }

    #[test]
    fn paste_on_select_off_copies_without_a_keystroke() {
        let host = Memory::default();
        *host.settings.borrow_mut() = json!({ "pasteOnSelect": false });
        on_event(&host, "clipboard", &event("h1", 1, "one")).unwrap();
        ui(&host, &json!({"kind": "paste", "id": "id1"})).unwrap();
        assert_eq!(*host.keystrokes.borrow(), [false]);
    }

    #[test]
    fn drag_hands_the_whole_record_to_the_host_and_touches_nothing_else() {
        let host = Memory::default();
        on_event(&host, "clipboard", &event("h1", 1, "one")).unwrap();
        ui(&host, &json!({"kind": "drag", "id": "id1"})).unwrap();
        let dragged = host.dragged.borrow();
        assert_eq!(dragged.len(), 1);
        assert_eq!(dragged[0].0[0][0].text.as_deref(), Some("one"));
        assert!(host.pasted.borrow().is_empty(), "the pasteboard is not touched");
        assert_eq!(host.closed.get(), 0, "the panel stays up while the drag is made");
    }

    #[test]
    fn drag_of_one_file_hands_only_that_file() {
        let host = Memory::default();
        let files = json!({ "v": 1, "at": 1, "hash": "h1", "items": [
            [{ "uti": "public.file-url", "text": "file:///a.mp4", "bytes": 13 }],
            [{ "uti": "public.file-url", "text": "file:///b.log", "bytes": 13 }],
        ]}).to_string();
        on_event(&host, "clipboard", &files).unwrap();
        ui(&host, &json!({"kind": "drag", "id": "id1", "file": 1})).unwrap();
        let dragged = host.dragged.borrow();
        assert_eq!(dragged[0].0.len(), 1);
        assert_eq!(dragged[0].0[0][0].text.as_deref(), Some("file:///b.log"));
        drop(dragged);
        assert!(ui(&host, &json!({"kind": "drag", "id": "id1", "file": 2})).is_err());
    }

    #[test]
    fn drag_closes_the_panel_only_when_the_setting_says_so() {
        let host = Memory::default();
        on_event(&host, "clipboard", &event("h1", 1, "one")).unwrap();
        ui(&host, &json!({"kind": "drag", "id": "id1"})).unwrap();
        *host.settings.borrow_mut() = json!({ "closeAfterDrag": "true" });
        ui(&host, &json!({"kind": "drag", "id": "id1"})).unwrap();
        let closes: Vec<bool> = host.dragged.borrow().iter().map(|(_, close)| *close).collect();
        assert_eq!(closes, [false, true], "off unless asked for");
    }

    #[test]
    fn delete_and_clear_forget_the_record() {
        let host = Memory::default();
        on_event(&host, "clipboard", &event("h1", 1, "one")).unwrap();
        on_event(&host, "clipboard", &event("h2", 2, "two")).unwrap();
        ui(&host, &json!({"kind": "delete", "id": "id1"})).unwrap();
        assert!(host.kv.borrow().contains_key("item.id1"), "kept for ⌘Z until the panel reopens");
        ui(&host, &json!({"kind": "list", "opening": true})).unwrap();
        assert!(!host.kv.borrow().contains_key("item.id1"));
        ui(&host, &json!({"kind": "pin", "id": "id2"})).unwrap();
        ui(&host, &json!({"kind": "clear"})).unwrap();
        assert_eq!(list(&host).len(), 1, "a pin survives Clear");
    }

    #[test]
    fn a_delete_all_is_undone_in_one_step() {
        let host = Memory::default();
        for (hash, at) in [("h1", 1), ("h2", 2), ("h3", 3)] {
            on_event(&host, "clipboard", &event(hash, at, hash)).unwrap();
        }
        ui(&host, &json!({"kind": "pin", "id": "id1"})).unwrap();
        let unpinned = ui(&host, &json!({"kind": "clear"})).unwrap();
        assert_eq!(unpinned["ids"].as_array().unwrap().len(), 2);
        assert_eq!(list(&host).len(), 1, "the pin stays");
        let all = ui(&host, &json!({"kind": "clearAll"})).unwrap();
        assert_eq!(all["ids"], json!(["id1"]));
        assert!(list(&host).is_empty());
        let back = ui(&host, &json!({"kind": "restore", "ids": ["id1", "id2", "id3"]})).unwrap();
        assert_eq!(back["count"], 3);
        assert_eq!(list(&host).len(), 3);
        assert_eq!(list(&host)[0]["pin"], "b", "the pin came back pinned");
        // ⌘⇧Z: the same rows again, by id.
        ui(&host, &json!({"kind": "delete", "ids": ["id2", "id3"]})).unwrap();
        assert_eq!(list(&host).len(), 1);
    }

    #[test]
    fn open_reveal_and_copy_text_take_only_their_kind() {
        let host = Memory::default();
        on_event(&host, "clipboard", &event("h1", 1, "https://example.com/x")).unwrap();
        on_event(&host, "clipboard", &event("h2", 2, "just words")).unwrap();
        ui(&host, &json!({"kind": "open", "id": "id1"})).unwrap();
        assert!(ui(&host, &json!({"kind": "open", "id": "id2"})).is_err());
        assert!(ui(&host, &json!({"kind": "reveal", "id": "id2"})).is_err());
        assert!(ui(&host, &json!({"kind": "copyText", "id": "id2"})).is_err());
        assert_eq!(*host.opened.borrow(), ["open https://example.com/x"]);
        ui(&host, &json!({"kind": "settings"})).unwrap();
        assert_eq!(host.opened.borrow().last().map(String::as_str), Some("settings"));

        // About's links open only their own address, whatever else is sent.
        ui(&host, &json!({"kind": "openDocs", "url": "https://evil.example"})).unwrap();
        ui(&host, &json!({"kind": "openStore"})).unwrap();
        ui(&host, &json!({"kind": "tour"})).unwrap();
        assert_eq!(
            host.opened.borrow()[2..],
            [format!("open {DOCS_URL}"), format!("open {STORE_URL}"), "open-window welcome".to_string()]
        );

        ui(&host, &json!({"kind": "copy", "id": "id2"})).unwrap();
        assert_eq!(*host.keystrokes.borrow(), [false], "copy is no ⌘V");
    }

    #[test]
    fn text_and_rich_rows_preview_their_links_and_open_only_those() {
        let host = Memory::default();
        on_event(&host, "clipboard", &event("h1", 1, "Docs: https://lumikeys.app/docs, and www.example.com/Việt.")).unwrap();
        let rich = json!({ "v": 1, "at": 2, "hash": "h2", "items": [[
            { "uti": "public.html", "text": r#"<a href="https://github.com/x">my code</a>"#, "bytes": 42 },
            { "uti": "public.utf8-plain-text", "text": "my code", "bytes": 7 },
        ]] });
        on_event(&host, "clipboard", &rich.to_string()).unwrap();
        on_event(&host, "clipboard", &event("h3", 3, "https://link.test/only")).unwrap();

        let text = ui(&host, &json!({"kind": "preview", "id": "id1"})).unwrap();
        assert_eq!(
            text["links"],
            json!([{ "url": "https://lumikeys.app/docs" }, { "url": "https://www.example.com/Việt" }])
        );
        assert_eq!(text["linkCount"], 2);
        let rich = ui(&host, &json!({"kind": "preview", "id": "id2"})).unwrap();
        assert_eq!(rich["links"], json!([{ "url": "https://github.com/x", "text": "my code" }]));
        // A link row is its one address; it lists none.
        let link = ui(&host, &json!({"kind": "preview", "id": "id3"})).unwrap();
        assert_eq!(link["links"], Value::Null);

        ui(&host, &json!({"kind": "open", "id": "id1", "url": "https://www.example.com/Việt"})).unwrap();
        ui(&host, &json!({"kind": "open", "id": "id2", "url": "https://github.com/x", "pinned": true})).unwrap();
        // Not one of that row's links: a page cannot have anything opened.
        assert!(ui(&host, &json!({"kind": "open", "id": "id1", "url": "https://github.com/x"})).is_err());
        assert!(ui(&host, &json!({"kind": "open", "id": "id2", "url": "javascript:alert(1)"})).is_err());
        assert_eq!(*host.opened.borrow(), ["open https://www.example.com/Vi%E1%BB%87t", "open https://github.com/x"]);
        assert_eq!(host.closed.get(), 1, "a pinned panel stays up");
    }

    #[test]
    fn links_are_found_once_at_the_copy_and_read_back_from_the_record() {
        let host = Memory::default();
        on_event(&host, "clipboard", &event("h1", 1, "see https://a.test and https://b.test")).unwrap();
        let stored = |host: &Memory| host.kv.borrow()["item.id1"].clone();
        let record: Value = serde_json::from_str(&stored(&host).value).unwrap();
        assert_eq!(
            record["links"],
            json!({ "v": links::LINKS_VERSION, "list": [{ "url": "https://a.test" }, { "url": "https://b.test" }], "count": 2 })
        );

        // What the record keeps is what the preview shows — nothing is
        // looked for again, and nothing written.
        let mut record = record;
        record["links"]["list"] = json!([{ "url": "https://kept.test" }]);
        record["links"]["count"] = json!(1);
        let rev = stored(&host).rev;
        host.put("item.id1", &record.to_string(), Some(rev)).unwrap();
        let rev = stored(&host).rev;
        let shown = ui(&host, &json!({"kind": "preview", "id": "id1"})).unwrap();
        assert_eq!(shown["links"], json!([{ "url": "https://kept.test" }]));
        ui(&host, &json!({"kind": "open", "id": "id1", "url": "https://kept.test", "pinned": true})).unwrap();
        assert_eq!(stored(&host).rev, rev, "a kept list is not written again");
    }

    /// Two profiles, Work live: `;addr` in both, fixed, with a link in it;
    /// `;d` in Work, expanded fresh each time.
    fn snippet_host() -> Memory {
        let host = Memory::default();
        *host.book.borrow_mut() = (
            "p_work".to_string(),
            vec![
                host::Profile { id: "default".to_string(), name: "Default".to_string() },
                host::Profile { id: "p_work".to_string(), name: "Work".to_string() },
            ],
        );
        for profile in ["default", "p_work"] {
            host.snippets.borrow_mut().push((
                profile.to_string(),
                "a".to_string(),
                ";addr".to_string(),
                "12 Main St, https://maps.test/a".to_string(),
                true,
                "r1".to_string(),
            ));
        }
        host.snippets.borrow_mut().push((
            "p_work".to_string(),
            "d".to_string(),
            ";d".to_string(),
            "today".to_string(),
            false,
            "r1".to_string(),
        ));
        host
    }

    #[test]
    fn a_copy_that_is_a_trigger_shows_what_it_expands_to_in_the_profiles_asked() {
        let host = snippet_host();
        on_event(&host, "clipboard", &event("h1", 1, " ;addr\n")).unwrap();
        on_event(&host, "clipboard", &event("h2", 2, "just words")).unwrap();

        // The default: the live profile's.
        let shown = ui(&host, &json!({"kind": "preview", "id": "id1"})).unwrap();
        assert_eq!(
            shown["snippets"],
            json!([{
                "text": "12 Main St, https://maps.test/a",
                "profiles": ["Work"],
                "dynamic": false,
                "links": [{ "url": "https://maps.test/a" }],
            }])
        );
        assert_eq!(host.found.borrow().last().unwrap(), &(";addr".to_string(), host::Within::Active));

        // Every profile's: one entry naming both.
        *host.settings.borrow_mut() = json!({ "matchSnippets": "true", "snippetsIn": "all" });
        let shown = ui(&host, &json!({"kind": "preview", "id": "id1"})).unwrap();
        assert_eq!(shown["snippets"][0]["profiles"], json!(["Default", "Work"]));

        // The ticked ones; none ticked, nothing asked.
        *host.settings.borrow_mut() = json!({ "matchSnippets": "true", "snippetsIn": "selected", "snippetProfiles": "default" });
        let shown = ui(&host, &json!({"kind": "preview", "id": "id1"})).unwrap();
        assert_eq!(shown["snippets"][0]["profiles"], json!(["Default"]));
        let asked = host.found.borrow().len();
        for off in [json!({ "snippetsIn": "selected" }), json!({ "matchSnippets": "false", "snippetsIn": "all" })] {
            *host.settings.borrow_mut() = off;
            let shown = ui(&host, &json!({"kind": "preview", "id": "id1"})).unwrap();
            assert!(shown["snippets"].is_null());
        }
        // Words that are no trigger are asked about and show nothing.
        *host.settings.borrow_mut() = json!({});
        let shown = ui(&host, &json!({"kind": "preview", "id": "id2"})).unwrap();
        assert!(shown["snippets"].is_null());
        assert_eq!(host.found.borrow().len(), asked + 1, "off and nothing-ticked ask nothing");
    }

    #[test]
    fn a_fixed_expansion_is_kept_with_the_record_and_a_changing_one_is_not() {
        let host = snippet_host();
        on_event(&host, "clipboard", &event("h1", 1, ";addr")).unwrap();
        on_event(&host, "clipboard", &event("h2", 2, ";d")).unwrap();
        let stored = |host: &Memory, id: &str| host.kv.borrow()[&format!("item.{id}")].clone();

        ui(&host, &json!({"kind": "preview", "id": "id1"})).unwrap();
        let kept: Value = serde_json::from_str(&stored(&host, "id1").value).unwrap();
        assert_eq!(kept["snippets"][0]["text"], "12 Main St, https://maps.test/a");
        let rev = stored(&host, "id1").rev;
        ui(&host, &json!({"kind": "preview", "id": "id1"})).unwrap();
        assert_eq!(host.expanded.borrow().len(), 1, "expanded once");
        assert_eq!(stored(&host, "id1").rev, rev, "and written once");

        let first = ui(&host, &json!({"kind": "preview", "id": "id2"})).unwrap();
        let second = ui(&host, &json!({"kind": "preview", "id": "id2"})).unwrap();
        assert_ne!(first["snippets"][0]["text"], second["snippets"][0]["text"]);
        assert_eq!(second["snippets"][0]["dynamic"], true);
        let kept: Value = serde_json::from_str(&stored(&host, "id2").value).unwrap();
        assert!(kept.get("snippets").is_none(), "nothing kept: {kept}");
    }

    #[test]
    fn copying_or_opening_an_expansion_takes_only_what_the_item_expands_to() {
        let host = snippet_host();
        on_event(&host, "clipboard", &event("h1", 1, ";addr")).unwrap();
        on_event(&host, "clipboard", &event("h2", 2, ";d")).unwrap();

        ui(&host, &json!({"kind": "copySnippet", "id": "id1", "text": "12 Main St, https://maps.test/a", "pinned": true})).unwrap();
        assert_eq!(host.pasted.borrow().last().unwrap()[0][0].text.as_deref(), Some("12 Main St, https://maps.test/a"));
        assert!(ui(&host, &json!({"kind": "copySnippet", "id": "id1", "text": "anything else"})).is_err());
        // A fresh expansion each time: what the page showed is what it copies.
        ui(&host, &json!({"kind": "copySnippet", "id": "id2", "text": "today #7", "pinned": true})).unwrap();
        assert_eq!(host.pasted.borrow().last().unwrap()[0][0].text.as_deref(), Some("today #7"));

        ui(&host, &json!({"kind": "open", "id": "id1", "url": "https://maps.test/a", "snippet": true, "pinned": true})).unwrap();
        assert_eq!(host.opened.borrow().last().unwrap(), "open https://maps.test/a");
        assert!(ui(&host, &json!({"kind": "open", "id": "id1", "url": "https://elsewhere.test", "snippet": true})).is_err());
        // Not one of the item's own links either.
        assert!(ui(&host, &json!({"kind": "open", "id": "id1", "url": "https://maps.test/a"})).is_err());
        assert!(ui(&host, &json!({"kind": "open", "id": "id2", "url": "javascript:alert(1)", "snippet": true})).is_err());
    }

    #[test]
    fn the_settings_tab_lists_the_profiles_to_tick() {
        let host = snippet_host();
        let answer = settings(&host, &json!({"kind": "profiles"})).unwrap();
        assert_eq!(
            answer,
            json!({ "active": "p_work", "profiles": [{ "id": "default", "name": "Default" }, { "id": "p_work", "name": "Work" }] })
        );
    }

    #[test]
    fn a_record_without_current_links_has_them_found_and_kept_once() {
        let host = Memory::default();
        on_event(&host, "clipboard", &event("h1", 1, "see https://a.test")).unwrap();
        let stored = |host: &Memory| host.kv.borrow()["item.id1"].clone();
        // As kept before records kept links, and as kept by older rules.
        for old in [Value::Null, json!({ "v": 0, "list": [{ "url": "https://stale.test" }], "count": 1 })] {
            let mut record: Value = serde_json::from_str(&stored(&host).value).unwrap();
            if old.is_null() {
                record.as_object_mut().unwrap().remove("links");
            } else {
                record["links"] = old;
            }
            host.put("item.id1", &record.to_string(), Some(stored(&host).rev)).unwrap();

            let shown = ui(&host, &json!({"kind": "preview", "id": "id1"})).unwrap();
            assert_eq!(shown["links"], json!([{ "url": "https://a.test" }]));
            let kept: Value = serde_json::from_str(&stored(&host).value).unwrap();
            assert_eq!(kept["links"]["v"], links::LINKS_VERSION, "found again and kept");
            let rev = stored(&host).rev;
            ui(&host, &json!({"kind": "preview", "id": "id1"})).unwrap();
            assert_eq!(stored(&host).rev, rev, "and only once");
        }
    }

    #[test]
    fn copy_path_copies_where_the_files_are_as_text() {
        let host = Memory::default();
        let one = json!({ "v": 1, "at": 1, "hash": "h1", "items": [[
            { "uti": "public.file-url", "text": "file:///.file/id=1.2", "bytes": 20, "path": "/Users/me/My Notes/a.md" },
        ]] });
        let many = json!({ "v": 1, "at": 2, "hash": "h2", "items": [
            [{ "uti": "public.file-url", "text": "file:///tmp/b%20c.pdf", "bytes": 21 }],
            [{ "uti": "public.file-url", "text": "file:///tmp/folder/", "bytes": 19 }],
        ] });
        let lost = json!({ "v": 1, "at": 3, "hash": "h3", "items": [[
            { "uti": "public.file-url", "text": "file:///.file/id=9.9", "bytes": 20 },
        ]] });
        for copy in [&one, &many, &lost] {
            on_event(&host, "clipboard", &copy.to_string()).unwrap();
        }
        on_event(&host, "clipboard", &event("h4", 4, "just words")).unwrap();

        ui(&host, &json!({"kind": "copyPath", "id": "id1"})).unwrap();
        ui(&host, &json!({"kind": "copyPath", "id": "id2"})).unwrap();
        let pasted = host.pasted.borrow();
        assert_eq!(pasted[0][0][0].uti, "public.utf8-plain-text");
        assert_eq!(pasted[0][0][0].text.as_deref(), Some("/Users/me/My Notes/a.md"), "Lumi's resolved path");
        assert_eq!(pasted[1][0][0].text.as_deref(), Some("/tmp/b c.pdf\n/tmp/folder/"), "one a line, decoded");
        drop(pasted);
        assert!(ui(&host, &json!({"kind": "copyPath", "id": "id3"})).is_err(), "a file-reference URL is no place");
        assert!(ui(&host, &json!({"kind": "copyPath", "id": "id4"})).is_err(), "not a file");
    }

    /// A file row kept under its file-reference id is titled by name when
    /// the panel next opens.
    #[test]
    fn a_file_row_kept_by_its_id_is_renamed_on_opening() {
        let host = Memory::default();
        let copy = json!({ "v": 1, "at": 1, "hash": "h1", "items": [[
            { "uti": "public.file-url", "text": "file:///.file/id=6571367.228661126", "bytes": 35 },
            { "uti": "public.utf8-plain-text", "text": "brag2.mp4", "bytes": 9 },
        ]] });
        on_event(&host, "clipboard", &copy.to_string()).unwrap();
        assert_eq!(list(&host)[0]["title"], "brag2.mp4", "named at the copy");

        // As an older build kept it.
        let (mut index, rev) = read_index(&host).unwrap();
        index.items[0].title = "/.file/id=6571367.228661126".to_string();
        index.items[0].file_ext = String::new();
        index.upkeep = 0;
        host.put(INDEX, &serde_json::to_string(&index).unwrap(), rev).unwrap();
        assert_eq!(list(&host)[0]["title"], "/.file/id=6571367.228661126");

        ui(&host, &json!({"kind": "list", "opening": true})).unwrap();
        assert_eq!(list(&host)[0]["title"], "brag2.mp4");
        assert_eq!(list(&host)[0]["fileExt"], "mp4");
        let shown = ui(&host, &json!({"kind": "preview", "id": "id1"})).unwrap();
        assert_eq!(shown["text"], "brag2.mp4", "no path to show, so the name");
    }

    #[test]
    fn a_file_row_previews_its_size_when_lumi_measured_it() {
        let host = Memory::default();
        let files = |reps: Value| json!({ "v": 1, "at": 1, "hash": "h1", "items": reps }).to_string();
        on_event(&host, "clipboard", &files(json!([
            [{ "uti": "public.file-url", "text": "file:///a.pdf", "bytes": 13, "fileSize": 1234 }],
            [{ "uti": "public.file-url", "text": "file:///b.pdf", "bytes": 13, "fileSize": 766 }],
        ]))).unwrap();
        let shown = ui(&host, &json!({"kind": "preview", "id": "id1"})).unwrap();
        assert_eq!(shown["fileSize"], 2000);

        let host = Memory::default();
        on_event(&host, "clipboard", &files(json!([
            [{ "uti": "public.file-url", "text": "file:///a.pdf", "bytes": 13, "fileSize": 1234 }],
            [{ "uti": "public.file-url", "text": "file:///folder/", "bytes": 15 }],
        ]))).unwrap();
        let shown = ui(&host, &json!({"kind": "preview", "id": "id1"})).unwrap();
        assert_eq!(shown["fileSize"], Value::Null, "a folder has no size, so no total");
    }

    #[test]
    fn an_image_is_saved_under_a_clean_name_and_its_own_suffix() {
        let host = Memory::default();
        host.blobs.borrow_mut().insert("img".into());
        on_event(&host, "clipboard", &image_event("h1", "img")).unwrap();
        on_event(&host, "clipboard", &event("h2", 2, "just words")).unwrap();
        ui(&host, &json!({"kind": "saveImage", "id": "id1", "name": "Image 2026-09-29 at 11.07.12"})).unwrap();
        ui(&host, &json!({"kind": "saveImage", "id": "id1", "name": "../a/b: c"})).unwrap();
        ui(&host, &json!({"kind": "saveImage", "id": "id1", "name": " ..\u{7} "})).unwrap();
        assert_eq!(
            *host.opened.borrow(),
            ["save img Image 2026-09-29 at 11.07.12.png", "save img -a-b- c.png", "save img Image.png"]
        );
        assert!(ui(&host, &json!({"kind": "saveImage", "id": "id2"})).is_err(), "no image in text");
    }

    #[test]
    fn the_text_read_in_an_image_is_kept_as_read() {
        let host = Memory::default();
        host.blobs.borrow_mut().insert("img".into());
        on_event(&host, "clipboard", &image_event("h1", "img")).unwrap();
        assert_eq!(list(&host)[0]["ocr"], Value::Null, "no text read yet");
        let ocr = json!({"v": 1, "hash": "h1", "text": "Invoice TOTAL 42"}).to_string();
        on_event(&host, "clipboard-ocr", &ocr).unwrap();
        assert_eq!(list(&host)[0]["ocr"], true);
        assert_eq!(list(&host)[0]["ocrSearch"], "Invoice TOTAL 42", "found by it, as read");
        ui(&host, &json!({"kind": "copyText", "id": "id1"})).unwrap();
        let pasted = host.pasted.borrow();
        assert_eq!(pasted[0][0][0].text.as_deref(), Some("Invoice TOTAL 42"));
        let shown = ui(&host, &json!({"kind": "preview", "id": "id1"})).unwrap();
        assert_eq!(shown["ocr"], "Invoice TOTAL 42");
        *host.settings.borrow_mut() = json!({ "ocr": "false" });
        let shown = ui(&host, &json!({"kind": "preview", "id": "id1"})).unwrap();
        assert_eq!(shown["ocr"], Value::Null, "reading turned off hides the text");
        assert_eq!(list(&host)[0]["ocr"], Value::Null, "and no row offers it");
        assert_eq!(list(&host)[0]["ocrSearch"], Value::Null, "nor is found by it");
        assert!(ui(&host, &json!({"kind": "copyText", "id": "id1"})).is_err());
    }

    #[test]
    fn a_delete_is_undone_until_the_panel_reopens() {
        let host = Memory::default();
        host.blobs.borrow_mut().insert("img".into());
        on_event(&host, "clipboard", &image_event("h1", "img")).unwrap();
        on_event(&host, "clipboard", &event("h2", 2, "two")).unwrap();
        ui(&host, &json!({"kind": "delete", "id": "id1"})).unwrap();
        ui(&host, &json!({"kind": "delete", "id": "id2"})).unwrap();
        assert!(list(&host).is_empty());
        // A plain reload (after another change) keeps the trash.
        list(&host);
        let back = ui(&host, &json!({"kind": "restore", "id": "id2"})).unwrap();
        assert_eq!(back["restored"], true);
        ui(&host, &json!({"kind": "restore", "id": "id1"})).unwrap();
        assert_eq!(list(&host).len(), 2);
        assert!(host.blobs.borrow().contains("img"), "the picture came back with it");
        // Twice is nothing the second time.
        assert_eq!(ui(&host, &json!({"kind": "restore", "id": "id1"})).unwrap()["restored"], false);

        ui(&host, &json!({"kind": "delete", "id": "id1"})).unwrap();
        ui(&host, &json!({"kind": "list", "opening": true})).unwrap();
        assert!(!host.blobs.borrow().contains("img"), "a new panel empties the trash");
        assert_eq!(ui(&host, &json!({"kind": "restore", "id": "id1"})).unwrap()["restored"], false);
    }

    #[test]
    fn a_restore_of_something_copied_again_keeps_the_new_row() {
        let host = Memory::default();
        on_event(&host, "clipboard", &event("h1", 1, "same")).unwrap();
        ui(&host, &json!({"kind": "delete", "id": "id1"})).unwrap();
        on_event(&host, "clipboard", &event("h1", 5, "same")).unwrap();
        let back = ui(&host, &json!({"kind": "restore", "id": "id1"})).unwrap();
        assert_eq!(back["restored"], false);
        assert_eq!(list(&host).len(), 1);
        assert!(!host.kv.borrow().contains_key("item.id1"), "the surplus record goes");
    }

    #[test]
    fn set_pin_puts_back_the_letter_it_had() {
        let host = Memory::default();
        on_event(&host, "clipboard", &event("h1", 1, "one")).unwrap();
        on_event(&host, "clipboard", &event("h2", 2, "two")).unwrap();
        ui(&host, &json!({"kind": "pin", "id": "id1"})).unwrap();
        ui(&host, &json!({"kind": "pin", "id": "id2"})).unwrap();
        // Undo of unpinning id1 (b), while b is free again: b it is.
        ui(&host, &json!({"kind": "setPin", "id": "id1", "pin": null})).unwrap();
        let again = ui(&host, &json!({"kind": "setPin", "id": "id1", "pin": "b"})).unwrap();
        assert_eq!(again["pin"], "b");
        // A letter somebody else holds is not taken from them.
        let other = ui(&host, &json!({"kind": "setPin", "id": "id1", "pin": "d"})).unwrap();
        assert_ne!(other["pin"], "d");
        assert!(ui(&host, &json!({"kind": "setPin", "id": "id1", "pin": 7})).is_err());
    }

    #[test]
    fn stats_count_the_index_and_the_dashboard_can_only_read() {
        let host = Memory::default();
        let empty = dashboard(&host, &json!({"kind": "stats"})).unwrap();
        assert_eq!(empty, json!({"kept": 0, "keep": "3mo", "pinned": 0, "images": 0, "since": null}));

        host.blobs.borrow_mut().insert("img".into());
        on_event(&host, "clipboard", &event("h1", 5, "one")).unwrap();
        on_event(&host, "clipboard", &event("h2", 9, "two")).unwrap();
        on_event(&host, "clipboard", &image_event("h3", "img")).unwrap();
        ui(&host, &json!({"kind": "pin", "id": "id1"})).unwrap();
        let stats = dashboard(&host, &json!({"kind": "stats"})).unwrap();
        assert_eq!(stats, json!({"kept": 3, "keep": "3mo", "pinned": 1, "images": 1, "since": 1}));

        assert!(dashboard(&host, &json!({"kind": "clear"})).is_err());
        assert_eq!(list(&host).len(), 3);
    }

    #[test]
    fn a_copy_and_a_pin_tell_the_dashboard() {
        let host = Memory::default();
        on_event(&host, "clipboard", &event("h1", 5, "one")).unwrap();
        ui(&host, &json!({"kind": "pin", "id": "id1"})).unwrap();
        on_event(&host, "screen", "{}").unwrap();
        let posts = host.posts.borrow();
        let dashboard: Vec<&str> = posts.iter().filter(|(window, _)| window == DASHBOARD).map(|(_, m)| m.as_str()).collect();
        assert_eq!(dashboard.len(), 2, "an unknown event tells nobody: {posts:?}");
        let last: Value = serde_json::from_str(dashboard[1]).unwrap();
        assert_eq!(last, json!({"kept": 1, "keep": "3mo", "pinned": 1, "images": 0, "since": 5}));
    }

    #[test]
    fn a_copy_or_the_text_read_in_an_image_tells_the_panel_to_read_the_list_again() {
        let host = Memory::default();
        on_event(&host, "clipboard", &event("h1", 1, "one")).unwrap();
        // The same again: the row moves up, so the panel is told too.
        on_event(&host, "clipboard", &event("h1", 2, "one")).unwrap();
        on_event(&host, "clipboard", &image_event("h2", "img")).unwrap();
        on_event(&host, "clipboard-ocr", &json!({"v": 1, "hash": "h2", "text": "read"}).to_string()).unwrap();
        // A pin is the panel's own doing: it reads the list itself.
        ui(&host, &json!({"kind": "pin", "id": "id1"})).unwrap();
        on_event(&host, "screen", "{}").unwrap();
        let told: Vec<String> = host.posts.borrow().iter().filter(|(window, _)| window == PANEL).map(|(_, m)| m.clone()).collect();
        assert_eq!(told, vec![HISTORY_CHANGED; 4]);
        let message: Value = serde_json::from_str(HISTORY_CHANGED).unwrap();
        assert_eq!(message, json!({"kind": "history"}));
    }

    #[test]
    fn the_settings_tab_offers_each_app_seen_once_newest_first() {
        let host = Memory::default();
        // Just before the fixture's own copy, so none of them has aged out.
        on_event(&host, "clipboard", &event("h1", 1790000000000 - 2, "one")).unwrap();
        on_event(&host, "clipboard", &event("h2", 1790000000000 - 1, "two")).unwrap();
        on_event(&host, "clipboard", FIXTURE).unwrap();
        let apps = settings(&host, &json!({"kind": "apps"})).unwrap()["apps"].clone();
        let names: Vec<&str> = apps.as_array().unwrap().iter().map(|a| a["name"].as_str().unwrap()).collect();
        assert_eq!(names.iter().filter(|n| **n == "Notes").count(), 1, "{apps}");
        assert!(names.contains(&"Safari"), "{apps}");
    }

    #[test]
    fn the_theme_is_put_on_the_panel_and_dark_glass_is_always_dark() {
        let host = Memory::default();
        *host.settings.borrow_mut() = json!({"theme": "light", "appearance": "sidebar"});
        settings(&host, &json!({"kind": "dress"})).unwrap();
        *host.settings.borrow_mut() = json!({"theme": "light", "appearance": "hud"});
        settings(&host, &json!({"kind": "dress"})).unwrap();
        let opened = host.opened.borrow();
        assert_eq!(
            *opened,
            vec![
                format!("material {PANEL} sidebar"),
                format!("theme {PANEL} light"),
                format!("material {PANEL} hud"),
                format!("theme {PANEL} dark"),
            ]
        );
        drop(opened);
        assert_eq!(ui(&host, &json!({"kind": "list"})).unwrap()["theme"], "dark");
        assert_eq!(ui(&host, &json!({"kind": "list"})).unwrap()["searchMode"], "mixed");
        *host.settings.borrow_mut() = json!({"search": "exact"});
        assert_eq!(ui(&host, &json!({"kind": "list"})).unwrap()["searchMode"], "exact");
    }

    #[test]
    fn the_settings_tab_tries_patterns_with_the_history_s_own_engine() {
        let host = Memory::default();
        let ask = |patterns: &str, sample: &str| {
            settings(&host, &json!({"kind": "tryPatterns", "patterns": patterns, "sample": sample})).unwrap()
        };
        let tried = ask("^sk-\\w+$\n\n\\b\\d{6}\\b", "code 482913");
        assert_eq!(tried["matched"], 3);
        assert_eq!(tried["errors"], json!([]));
        let tried = ask("(open\nfine", "fine");
        assert_eq!(tried["errors"][0]["line"], 1);
        assert_eq!(tried["matched"], 2);
        assert_eq!(ask("x", "")["matched"], Value::Null);
        let long = "a".repeat(MAX_TRY + 1);
        assert!(settings(&host, &json!({"kind": "tryPatterns", "patterns": long, "sample": ""})).is_err());
        assert!(settings(&host, &json!({"kind": "paste", "id": "x"})).is_err());
    }

    #[test]
    fn a_pdf_fit_is_kept_for_the_pane_and_the_zoomed_panel_apart() {
        let host = Memory::default();
        assert_eq!(ui(&host, &json!({"kind": "list"})).unwrap()["pdfFit"], json!({}));
        ui(&host, &json!({"kind": "pdfFit", "zoomed": false, "fit": "width"})).unwrap();
        ui(&host, &json!({"kind": "pdfFit", "zoomed": true, "fit": "height"})).unwrap();
        assert_eq!(
            ui(&host, &json!({"kind": "list"})).unwrap()["pdfFit"],
            json!({"pane": "width", "zoomed": "height"})
        );
        ui(&host, &json!({"kind": "pdfFit", "zoomed": false, "fit": "height"})).unwrap();
        assert_eq!(ui(&host, &json!({"kind": "list"})).unwrap()["pdfFit"]["pane"], "height");
        assert!(ui(&host, &json!({"kind": "pdfFit", "fit": "page"})).is_err());
    }

    #[test]
    fn the_preview_width_is_kept_and_listed() {
        let host = Memory::default();
        assert_eq!(ui(&host, &json!({"kind": "list"})).unwrap()["previewWidth"], Value::Null);
        ui(&host, &json!({"kind": "previewWidth", "width": 300})).unwrap();
        ui(&host, &json!({"kind": "previewWidth", "width": 340})).unwrap();
        assert_eq!(ui(&host, &json!({"kind": "list"})).unwrap()["previewWidth"], 340);
        assert!(ui(&host, &json!({"kind": "previewWidth", "width": 5})).is_err());
        assert!(ui(&host, &json!({"kind": "previewWidth", "width": "wide"})).is_err());
    }

    #[test]
    fn the_preview_split_is_kept_listed_and_put_back() {
        let host = Memory::default();
        assert_eq!(ui(&host, &json!({"kind": "list"})).unwrap()["previewSplit"], Value::Null);
        ui(&host, &json!({"kind": "previewSplit", "height": 120})).unwrap();
        ui(&host, &json!({"kind": "previewSplit", "height": 240})).unwrap();
        assert_eq!(ui(&host, &json!({"kind": "list"})).unwrap()["previewSplit"], 240);
        assert!(ui(&host, &json!({"kind": "previewSplit", "height": 5})).is_err());
        assert!(ui(&host, &json!({"kind": "previewSplit", "height": "tall"})).is_err());
        ui(&host, &json!({"kind": "previewSplit", "height": null})).unwrap();
        assert_eq!(ui(&host, &json!({"kind": "list"})).unwrap()["previewSplit"], Value::Null);
    }

    #[test]
    fn an_install_opens_the_welcome_window_and_an_update_says_since_when() {
        let host = Memory::default();
        on_lifecycle(&host, &lumi::Lifecycle::Installed).unwrap();
        assert_eq!(*host.opened.borrow(), ["open-window welcome"]);
        let told = welcome(&host, &json!({"kind": "welcome"})).unwrap();
        assert_eq!(told["from"], Value::Null, "a first install is not an update");
        assert_eq!(told["version"], env!("CARGO_PKG_VERSION"));

        on_lifecycle(&host, &lumi::Lifecycle::Updated("0.45.6".to_string())).unwrap();
        assert_eq!(host.opened.borrow().last().map(String::as_str), Some("open-window welcome"));
        let told = welcome(&host, &json!({"kind": "welcome"})).unwrap();
        assert_eq!(told["from"], "0.45.6");
        // Read once: reopened from the pane, the window is a plain welcome.
        let again = welcome(&host, &json!({"kind": "welcome"})).unwrap();
        assert_eq!(again["from"], Value::Null);
        assert!(!host.kv.borrow().contains_key(WELCOME_FROM));

        on_lifecycle(&host, &lumi::Lifecycle::Uninstalling).unwrap();
        assert_eq!(host.opened.borrow().len(), 2, "an uninstall opens nothing");
    }

    #[test]
    fn the_welcome_window_can_show_the_panel_and_put_itself_away() {
        let host = Memory::default();
        *host.settings.borrow_mut() = json!({"appearance": "hud"});
        welcome(&host, &json!({"kind": "openPanel"})).unwrap();
        assert_eq!(
            *host.opened.borrow(),
            [format!("material {PANEL} hud"), format!("theme {PANEL} dark"), format!("open-window {PANEL}")],
            "dressed as Settings says, then opened"
        );
        welcome(&host, &json!({"kind": "close"})).unwrap();
        assert_eq!(host.opened.borrow().last().map(String::as_str), Some("close-window welcome"));
        assert_eq!(host.closed.get(), 0, "the panel is not the window that closed");
        welcome(&host, &json!({"kind": "settings"})).unwrap();
        assert_eq!(host.opened.borrow().last().map(String::as_str), Some("settings"));
        assert!(welcome(&host, &json!({"kind": "paste", "id": "x"})).is_err(), "nothing that pastes");
        assert!(ui(&host, &json!({"kind": "welcome"})).is_err(), "and the panel has no welcome");
    }

    #[test]
    fn an_unknown_event_or_version_is_not_a_crash() {
        let host = Memory::default();
        assert!(on_event(&host, "screen", "{}").is_ok());
        let newer = json!({"v": 2, "at": 1, "hash": "h", "items": []}).to_string();
        assert!(on_event(&host, "clipboard", &newer).is_err());
        assert!(host.kv.borrow().is_empty());
    }
}
