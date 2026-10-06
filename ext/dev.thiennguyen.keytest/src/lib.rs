//! Keyboard Test: a tab in the extension's page in Lumi's Extensions pane
//! that lights each key of a MacBook keyboard as it is pressed.
//!
//! **Nearly all of it is the page.** Key events are the page's own — the
//! webview hears them while it has focus — and cleaning is the page's too:
//! it asks Lumi over the bridge to hold the keyboard (`/__lumi__/input-hold`),
//! which is what the manifest's one capability, `input-hold`, is for —
//! nothing in this component reaches it. How long cleaning lasts and whether
//! it takes the trackpad are settings, in the Settings tab Lumi draws.
//!
//! What is answered here is what the page cannot keep or learn by itself:
//!
//! - **Whether Lumi's Hyper key has Caps Lock** (`lumi::hyper_key_enabled`,
//!   free), so the page can say how to test Caps Lock.
//! - **Which keyboard the page draws**, ANSI or ISO. It is the page's memory,
//!   switched on the page and nowhere else, so it lives in this extension's
//!   own storage rather than in `[[settings]]` — a declared setting is drawn
//!   in the Settings tab, where a second switch for the same thing does not
//!   belong. Storage costs no capability and survives updates.

use lumi_extension_api as lumi;
use lumi_extension_api::storage::{self, PutError};

/// The storage key the layout is kept under.
const LAYOUT_KEY: &str = "layout";

/// The layouts the page draws; the first is what a new install shows.
const LAYOUTS: [&str; 2] = ["ansi", "iso"];

struct KeyTest;

impl lumi::Guest for KeyTest {
    fn run_command(name: String, _params: String) -> Result<String, String> {
        Err(format!("Keyboard Test has no {name} command"))
    }

    fn run_node(name: String, _params: String, _items: String) -> Result<String, String> {
        Err(format!("Keyboard Test has no {name} node"))
    }

    /// The Keyboard test tab's requests:
    ///
    /// - `{"kind":"state"}` → `{"hyperKeyEnabled": bool, "layout": "ansi"|"iso"}`,
    ///   asked as the page opens and whenever it gets the keyboard back;
    /// - `{"kind":"set-layout","layout":"iso"}` → `{"layout": "iso"}`, when
    ///   the page's own switch is pressed.
    fn run_ui(window: String, request: String) -> Result<String, String> {
        if window != ":page:keytest" {
            return Err(format!("Keyboard Test has no {window} page"));
        }
        let asked: serde_json::Value =
            serde_json::from_str(&request).map_err(|err| format!("request: {err}"))?;
        match asked.get("kind").and_then(|kind| kind.as_str()) {
            Some("state") => Ok(serde_json::json!({
                "hyperKeyEnabled": lumi::hyper_key_enabled()?,
                "layout": stored_layout()?,
            })
            .to_string()),
            Some("set-layout") => {
                let layout = asked
                    .get("layout")
                    .and_then(|layout| layout.as_str())
                    .filter(|layout| LAYOUTS.contains(layout))
                    .ok_or_else(|| "set-layout needs a layout: ansi or iso".to_string())?;
                keep_layout(layout)?;
                Ok(serde_json::json!({ "layout": layout }).to_string())
            }
            _ => Err("Keyboard Test's page asks for state or set-layout".to_string()),
        }
    }

    fn on_lifecycle(_event: lumi::Lifecycle) -> Result<(), String> {
        Ok(())
    }

    /// Keyboard Test asks to hear no events, so this is never called.
    fn on_event(_name: String, _payload: String) -> Result<(), String> {
        Ok(())
    }
}

/// The layout last chosen, or the first one when none has been — or when
/// what is stored is not one the page draws.
fn stored_layout() -> Result<&'static str, String> {
    let stored = storage::get(LAYOUT_KEY)?;
    Ok(stored
        .and_then(|entry| LAYOUTS.into_iter().find(|layout| *layout == entry.value))
        .unwrap_or(LAYOUTS[0]))
}

/// Keep `layout`, over whatever another run wrote in between: the page is
/// the one place it is chosen, so the latest press wins.
fn keep_layout(layout: &str) -> Result<(), String> {
    loop {
        let seen = storage::get(LAYOUT_KEY)?;
        match storage::put(LAYOUT_KEY, layout, seen.map(|entry| entry.rev)) {
            Err(PutError::Conflict) => continue,
            other => return other.map(drop).map_err(PutError::into_message),
        }
    }
}

lumi::register!(KeyTest);
