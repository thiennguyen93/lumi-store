//! Metronome: a tab in the extension's page in Lumi's Extensions pane.
//!
//! **Nearly all of it is the page** (`web/`). The beat is Web Audio in the
//! page's own webview, scheduled on the audio clock; the themes, the
//! presets and the keys are drawn and answered there. The theme is a
//! `[[settings]]` field, read and saved by the pages through Lumi's bridge
//! directly.
//!
//! What is answered here is the one thing a page cannot do for itself:
//! **keep the practice between openings.** Lumi closes the tab's page each
//! time another tab is chosen, and a page's own web storage is not the
//! extension's, so the practice as it was left and the person's presets go
//! to this extension's storage (`lumi::storage`, encrypted, removed with
//! the extension, no capability), as one JSON document the page reads as
//! it opens and writes after every change:
//!
//! - `{"op":"load"}` → the document, or `null` before the first save;
//! - `{"op":"save","saved":{…}}` → `{"ok":true}`.
//!
//! The document is the page's to shape and to check: it is read back
//! through the page's own validation (`web/src/engine/store.ts`), so here
//! it is only held to being a JSON object of a sane size — storage is a
//! file like any other, and so is what a page sends.

use lumi_extension_api as lumi;
use lumi_extension_api::storage::{self, PutError};

/// The storage key the practice and presets are kept under.
const PRACTICE_KEY: &str = "practice";

/// More than a practice and a few hundred presets could ever come to, and
/// far under storage's 1 MB a value.
const MOST_BYTES: usize = 256 * 1024;

/// The tab the calls come from, as Lumi names a `[[page]]`.
const PAGE: &str = ":page:metronome";

struct Metronome;

impl lumi::Guest for Metronome {
    fn run_command(name: String, _params: String) -> Result<String, String> {
        Err(format!("Metronome has no {name} command"))
    }

    fn run_node(name: String, _params: String, _items: String) -> Result<String, String> {
        Err(format!("Metronome has no {name} node"))
    }

    fn run_ui(window: String, request: String) -> Result<String, String> {
        if window != PAGE {
            return Err(format!("Metronome has no {window} page"));
        }
        let asked: serde_json::Value =
            serde_json::from_str(&request).map_err(|err| format!("request: {err}"))?;
        match asked.get("op").and_then(|op| op.as_str()) {
            Some("load") => Ok(storage::get(PRACTICE_KEY)?
                .map(|entry| entry.value)
                .unwrap_or_else(|| "null".to_string())),
            Some("save") => {
                let saved = asked
                    .get("saved")
                    .filter(|saved| saved.is_object())
                    .ok_or_else(|| "save needs the practice as an object".to_string())?;
                let text = saved.to_string();
                if text.len() > MOST_BYTES {
                    return Err("The practice and presets are too large to keep".to_string());
                }
                keep(&text)?;
                Ok(r#"{"ok":true}"#.to_string())
            }
            _ => Err("Metronome's page asks to load or save".to_string()),
        }
    }

    fn on_lifecycle(_event: lumi::Lifecycle) -> Result<(), String> {
        Ok(())
    }

    /// Metronome asks to hear no events, so this is never called.
    fn on_event(_name: String, _payload: String) -> Result<(), String> {
        Ok(())
    }
}

/// Keep `text` over whatever another run wrote in between: the page sends
/// the whole document every time, so the latest one sent is the one to keep.
fn keep(text: &str) -> Result<(), String> {
    loop {
        let seen = storage::get(PRACTICE_KEY)?;
        match storage::put(PRACTICE_KEY, text, seen.map(|entry| entry.rev)) {
            Err(PutError::Conflict) => continue,
            other => return other.map(drop).map_err(PutError::into_message),
        }
    }
}

lumi::register!(Metronome);
