//! Clipboard History: keeps what you copy and pastes it back from a panel.
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

use history::{Copy, Index, Order, Outcome, Rules};
use host::{Host, PutError};
use lumi_extension_api as lumi;
use serde_json::{json, Value};

/// The panel's `[[window]]` name.
pub const PANEL: &str = "history";

/// What Lumi calls the About page (`about = "about.html"`) when it asks
/// `run-ui` something. It is not a window of the manifest's, and it only
/// reads: nothing it can send pastes, pins or forgets.
pub const ABOUT: &str = ":about";

/// Storage key of the row list.
const INDEX: &str = "index";

/// Storage key of the preview pane's width, as the person last dragged it.
const PREVIEW_WIDTH: &str = "panel.previewWidth";

/// What a stored width may be: a pane, not a sliver or a wall.
const PREVIEW_WIDTHS: std::ops::RangeInclusive<u64> = 120..=2000;

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
        match name.as_str() {
            "open" => {
                host::Lumi.open_panel()?;
                Ok(String::new())
            }
            _ => Err(format!("Clipboard History has no {name} command")),
        }
    }

    fn run_node(name: String, _params: String, _items: String) -> Result<String, String> {
        Err(format!("Clipboard History has no {name} node"))
    }

    fn run_ui(window: String, request: String) -> Result<String, String> {
        let request: Value =
            serde_json::from_str(&request).map_err(|err| format!("bad request: {err}"))?;
        let answer = match window.as_str() {
            PANEL => ui(&host::Lumi, &request),
            ABOUT => about(&host::Lumi, &request),
            _ => return Err(format!("Clipboard History has no {window} window")),
        };
        answer.map(|answer| answer.to_string())
    }

    fn on_lifecycle(_event: lumi::Lifecycle) -> Result<(), String> {
        Ok(())
    }

    fn on_event(name: String, payload: String) -> Result<(), String> {
        on_event(&host::Lumi, &name, &payload)
    }
}

lumi::register!(Clipboard);

/// One host event, from the `on-event` export.
pub fn on_event(host: &impl Host, name: &str, payload: &str) -> Result<(), String> {
    match name {
        "clipboard" => on_copy(host, payload)?,
        "clipboard-ocr" => on_ocr(host, payload)?,
        // Events this build does not know are Lumi being newer than the
        // component, not something wrong with the copy.
        _ => return Ok(()),
    }
    tell_about(host);
    Ok(())
}

/// Hand the About page, if it is on screen, the counts as they are now.
/// Lumi refuses the page's own `call` while Settings is behind another app,
/// which is exactly when copies arrive — so the news comes to it instead.
/// Best effort: the copy is kept whether or not anybody is looking.
fn tell_about(host: &impl Host) {
    if let Ok(stats) = stats(host) {
        let _ = host.post(ABOUT, &stats.to_string());
    }
}

/// The person's settings, read once per call — Lumi freezes them for the
/// call anyway.
struct Prefs {
    rules: Rules,
    order: Order,
    paste_on_select: bool,
}

fn prefs(host: &impl Host) -> Prefs {
    let s = host.settings();
    // Settings arrive as text or as numbers depending on how they were
    // saved; take either rather than fall back to the default on a spelling.
    let size = match &s["size"] {
        Value::Number(n) => n.as_u64(),
        Value::String(t) => t.trim().parse().ok(),
        _ => None,
    }
    .unwrap_or(200) as usize;
    let apps = s["ignoreApps"]
        .as_str()
        .unwrap_or_default()
        .lines()
        .map(|l| l.trim().to_string())
        .filter(|l| !l.is_empty())
        .collect();
    let (rules, _refused) = Rules::new(size, apps, s["ignorePatterns"].as_str().unwrap_or(""));
    Prefs {
        rules,
        order: Order::parse(s["sort"].as_str().unwrap_or("last")),
        paste_on_select: match &s["pasteOnSelect"] {
            Value::Bool(b) => *b,
            Value::String(t) => t != "false",
            _ => true,
        },
    }
}

fn read_index(host: &impl Host) -> Result<(Index, Option<u64>), String> {
    match host.get(INDEX)? {
        None => Ok((Index::default(), None)),
        Some(stored) => {
            let index = serde_json::from_str(&stored.value)
                .map_err(|err| format!("the history index is unreadable: {err}"))?;
            Ok((index, Some(stored.rev)))
        }
    }
}

/// Re-read the index, change it, write it back — again if somebody else
/// wrote it in between. `change` runs once per attempt against a fresh copy.
fn update_index<T>(
    host: &impl Host,
    mut change: impl FnMut(&mut Index) -> Result<T, String>,
) -> Result<T, String> {
    for _ in 0..CAS_ATTEMPTS {
        let (mut index, rev) = read_index(host)?;
        let answer = change(&mut index)?;
        let text = serde_json::to_string(&index).map_err(|err| err.to_string())?;
        match host.put(INDEX, &text, rev) {
            Ok(_) => return Ok(answer),
            Err(PutError::Conflict) => continue,
            Err(PutError::Failed(err)) => return Err(err),
        }
    }
    Err("the history was busy; try again".to_string())
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
    let preview = history::apply(&mut Index::default(), copy.clone(), &prefs.rules, id.clone());
    let wrote_record = if let Outcome::Inserted { record, .. } = &preview {
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
    Ok(())
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
            let (index, _) = read_index(host)?;
            Ok(json!({
                "items": history::sorted(&index, prefs.order),
                "pasteOnSelect": prefs.paste_on_select,
                "previewWidth": preview_width(host),
            }))
        }
        "preview" => {
            // The index carries a one-line title and lowercased search text,
            // neither of which is what the preview pane should show; the
            // record is. Asked per selected row, not per keystroke.
            let record = read_record(host, &id()?)?;
            Ok(json!({ "text": history::preview_text(&record.items) }))
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
            host.paste(&items, prefs(host).paste_on_select)?;
            Ok(json!({}))
        }
        "pin" => {
            let id = id()?;
            let pin = update_index(host, |index| history::toggle_pin(index, &id))?;
            tell_about(host);
            Ok(json!({ "pin": pin }))
        }
        "delete" => {
            let id = id()?;
            let gone = update_index(host, |index| Ok(history::remove(index, &id)))?;
            forget(host, gone.as_slice());
            tell_about(host);
            Ok(json!({}))
        }
        "clear" => {
            let gone = update_index(host, |index| Ok(history::clear_unpinned(index)))?;
            forget(host, &gone);
            tell_about(host);
            Ok(json!({ "removed": gone.len() }))
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
        "close" => {
            host.close_panel()?;
            Ok(json!({}))
        }
        other => Err(format!("the panel has no {other} request")),
    }
}

/// The width the preview pane was last dragged to; `None` for never, or
/// for anything stored that is not a width.
fn preview_width(host: &impl Host) -> Option<u64> {
    let stored = host.get(PREVIEW_WIDTH).ok()??;
    stored.value.parse().ok().filter(|w| PREVIEW_WIDTHS.contains(w))
}

/// The About page's one request.
fn about(host: &impl Host, request: &Value) -> Result<Value, String> {
    match request["kind"].as_str().unwrap_or_default() {
        "stats" => stats(host),
        other => Err(format!("the About page has no {other} request")),
    }
}

/// How much the history holds, read off the index alone — no record is
/// opened, so it costs one storage read.
fn stats(host: &impl Host) -> Result<Value, String> {
    let (index, _) = read_index(host)?;
    let items = &index.items;
    Ok(json!({
        "kept": items.len(),
        "limit": prefs(host).rules.size,
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
        let search = rows[0]["search"].as_str().unwrap();
        assert!(search.contains("tìm kiếm nhanh"), "{search}");
        assert!(search.starts_with("chuyển tính năng"), "the row's own text stays first: {search}");

        // Text for a copy the history no longer has is nothing to do.
        let stray = OCR_FIXTURE.replace("5f2c", "0000");
        on_event(&host, "clipboard-ocr", &stray).unwrap();
    }

    fn list(host: &Memory) -> Vec<Value> {
        ui(host, &json!({"kind": "list"})).unwrap()["items"]
            .as_array()
            .unwrap()
            .clone()
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
        *host.settings.borrow_mut() = json!({ "size": "1" });
        host.blobs.borrow_mut().insert("img".into());
        on_event(&host, "clipboard", &image_event("h1", "img")).unwrap();
        on_event(&host, "clipboard", &event("h2", 2, "newer")).unwrap();
        assert_eq!(list(&host).len(), 1);
        assert!(!host.kv.borrow().contains_key("item.id1"));
        assert!(host.blobs.borrow().is_empty());
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
    fn delete_and_clear_forget_the_record() {
        let host = Memory::default();
        on_event(&host, "clipboard", &event("h1", 1, "one")).unwrap();
        on_event(&host, "clipboard", &event("h2", 2, "two")).unwrap();
        ui(&host, &json!({"kind": "delete", "id": "id1"})).unwrap();
        assert!(!host.kv.borrow().contains_key("item.id1"));
        ui(&host, &json!({"kind": "pin", "id": "id2"})).unwrap();
        ui(&host, &json!({"kind": "clear"})).unwrap();
        assert_eq!(list(&host).len(), 1, "a pin survives Clear");
    }

    #[test]
    fn stats_count_the_index_and_the_about_page_can_only_read() {
        let host = Memory::default();
        let empty = about(&host, &json!({"kind": "stats"})).unwrap();
        assert_eq!(empty, json!({"kept": 0, "limit": 200, "pinned": 0, "images": 0, "since": null}));

        host.blobs.borrow_mut().insert("img".into());
        on_event(&host, "clipboard", &event("h1", 5, "one")).unwrap();
        on_event(&host, "clipboard", &event("h2", 9, "two")).unwrap();
        on_event(&host, "clipboard", &image_event("h3", "img")).unwrap();
        ui(&host, &json!({"kind": "pin", "id": "id1"})).unwrap();
        let stats = about(&host, &json!({"kind": "stats"})).unwrap();
        assert_eq!(stats, json!({"kept": 3, "limit": 200, "pinned": 1, "images": 1, "since": 1}));

        assert!(about(&host, &json!({"kind": "clear"})).is_err());
        assert_eq!(list(&host).len(), 3);
    }

    #[test]
    fn a_copy_and_a_pin_tell_the_about_page() {
        let host = Memory::default();
        on_event(&host, "clipboard", &event("h1", 5, "one")).unwrap();
        ui(&host, &json!({"kind": "pin", "id": "id1"})).unwrap();
        on_event(&host, "screen", "{}").unwrap();
        let posts = host.posts.borrow();
        assert_eq!(posts.len(), 2, "an unknown event tells nobody: {posts:?}");
        assert!(posts.iter().all(|(window, _)| window == ABOUT));
        let last: Value = serde_json::from_str(&posts[1].1).unwrap();
        assert_eq!(last, json!({"kept": 1, "limit": 200, "pinned": 1, "images": 0, "since": 5}));
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
    fn an_unknown_event_or_version_is_not_a_crash() {
        let host = Memory::default();
        assert!(on_event(&host, "screen", "{}").is_ok());
        let newer = json!({"v": 2, "at": 1, "hash": "h", "items": []}).to_string();
        assert!(on_event(&host, "clipboard", &newer).is_err());
        assert!(host.kv.borrow().is_empty());
    }
}
