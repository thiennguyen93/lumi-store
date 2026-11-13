//! Keyboard Cleaner: a tab in the extension's page in Lumi's Extensions pane
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
//! - **Whether Clean My Keyboard Now was pressed** in Lumi's menu bar menu
//!   (the `menu` capability: Open and Clean My Keyboard Now). Only the page
//!   can hold the keyboard, and only while it is in front, so the row brings
//!   the Keyboard tab up (`ui.open-tab`) and leaves a word in storage that
//!   the page takes as it asks for its state — on load, as it gets the
//!   keyboard back, and when told (`ui.post`) while it is already up. The
//!   word is taken once, by whichever ask comes first, and only within
//!   [`CLEAN_ASK_LASTS_MS`] of the press: the keyboard must never lock
//!   because of a press somebody made a while ago.

use lumi_extension_api as lumi;
use lumi_extension_api::storage::{self, PutError};

/// The storage key the layout is kept under.
const LAYOUT_KEY: &str = "layout";

/// The layouts the page draws; the first is what a new install shows.
const LAYOUTS: [&str; 2] = ["ansi", "iso"];

/// The `[[page]]` the menu's rows bring up, as a call from it arrives —
/// the name `ui.open-tab` and `ui.post` both take.
const PAGE: &str = ":page:keytest";

/// The storage key Clean My Keyboard Now's press is kept under: when it was
/// pressed, in ms since the Unix epoch, or `"0"` once taken.
const CLEAN_ASK_KEY: &str = "clean-asked";

/// How long after the press the page may still take it: long enough for
/// Settings to come forward and the tab's page to load the first time,
/// short enough that a press whose page never came up locks nothing later.
const CLEAN_ASK_LASTS_MS: i64 = 10_000;

/// The menu's rows, by the id a press tells back.
const OPEN_ROW: &str = "open";
const CLEAN_ROW: &str = "clean";

struct KeyTest;

impl lumi::Guest for KeyTest {
    fn run_command(name: String, _params: String) -> Result<String, String> {
        Err(format!("Keyboard Cleaner has no {name} command"))
    }

    fn run_node(name: String, _params: String, _items: String) -> Result<String, String> {
        Err(format!("Keyboard Cleaner has no {name} node"))
    }

    /// The Keyboard tab's requests:
    ///
    /// - `{"kind":"state"}` → `{"hyperKeyEnabled": bool, "layout": "ansi"|"iso",
    ///   "clean": bool}`, asked as the page opens, whenever it gets the
    ///   keyboard back and when the menu's Clean row tells it to; `clean` is
    ///   the menu's press, taken by this answer ([`take_clean_ask`]);
    /// - `{"kind":"set-layout","layout":"iso"}` → `{"layout": "iso"}`, when
    ///   the page's own switch is pressed.
    fn run_ui(window: String, request: String) -> Result<String, String> {
        if let Some(row) = lumi::menu::pressed(&window, &request) {
            return pressed(&row).map(|()| String::new());
        }
        if window != PAGE {
            return Err(format!("Keyboard Cleaner has no {window} page"));
        }
        let asked: serde_json::Value =
            serde_json::from_str(&request).map_err(|err| format!("request: {err}"))?;
        match asked.get("kind").and_then(|kind| kind.as_str()) {
            Some("state") => Ok(serde_json::json!({
                "hyperKeyEnabled": lumi::hyper_key_enabled()?,
                "layout": stored_layout()?,
                "clean": take_clean_ask()?,
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
            _ => Err("Keyboard Cleaner's page asks for state or set-layout".to_string()),
        }
    }

    /// The menu's rows are set once installed and again with every update,
    /// and Lumi keeps them from there. Nothing else happens here.
    fn on_lifecycle(event: lumi::Lifecycle) -> Result<(), String> {
        match event {
            lumi::Lifecycle::Installed | lumi::Lifecycle::Updated(_) => draw_menu(),
            lumi::Lifecycle::Uninstalling => Ok(()),
        }
    }

    /// Keyboard Cleaner asks to hear no events, so this is never called.
    fn on_event(_name: String, _payload: String) -> Result<(), String> {
        Ok(())
    }
}

/// Open and Clean My Keyboard Now, in Lumi's menu bar menu under the
/// extension's name.
fn draw_menu() -> Result<(), String> {
    use lumi::menu::Entry;
    lumi::menu::set_rows(&[
        // Lucide's keyboard, drawn here in its hand (`ui/icons/`): Lumi's
        // own set has none.
        Entry::item(OPEN_ROW, "Open").icon("icons/keyboard.svg"),
        Entry::item(CLEAN_ROW, "Clean My Keyboard Now").icon("lock"),
    ])
}

/// A press on one of the menu's rows. Both bring the Keyboard tab up; Clean
/// first leaves the word the page takes to start cleaning, so a page that
/// loads or gets the keyboard after this cannot miss it, and tells a page
/// already up to ask for it.
fn pressed(row: &str) -> Result<(), String> {
    match row {
        OPEN_ROW => lumi::open_tab(PAGE),
        CLEAN_ROW => {
            keep(CLEAN_ASK_KEY, &now_ms().to_string())?;
            if let Err(err) = lumi::open_tab(PAGE) {
                // No page will come up to take it: nothing may lock later.
                let _ = keep(CLEAN_ASK_KEY, "0");
                return Err(err);
            }
            // Only a page on screen hears it; one still loading asks as it
            // loads. A page that cannot answer yet asks again once it has
            // the keyboard.
            lumi::post(PAGE, r#"{"kind":"clean"}"#)?;
            Ok(())
        }
        other => Err(format!("Keyboard Cleaner has no {other} row")),
    }
}

/// Whether Clean My Keyboard Now was pressed a moment ago and nobody has
/// taken it yet — taking it, so two asks of the page's (its load and its
/// focus, nearly at once) cannot both start a clean. Taken by writing over
/// the revision read: the ask that loses the race is told no.
fn take_clean_ask() -> Result<bool, String> {
    let Some(entry) = storage::get(CLEAN_ASK_KEY)? else {
        return Ok(false);
    };
    let Ok(pressed_at) = entry.value.parse::<i64>() else {
        return Ok(false);
    };
    if pressed_at <= 0 {
        return Ok(false);
    }
    match storage::put(CLEAN_ASK_KEY, "0", Some(entry.rev)) {
        Ok(_) => Ok(fresh(pressed_at, now_ms())),
        Err(PutError::Conflict) => Ok(false),
        Err(err) => Err(err.into_message()),
    }
}

/// Whether a press at `pressed_at` may still start a clean at `now`: not
/// one from the future either, which a clock set back would make.
fn fresh(pressed_at: i64, now: i64) -> bool {
    (0..=CLEAN_ASK_LASTS_MS).contains(&(now - pressed_at))
}

fn now_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_or(0, |since| since.as_millis() as i64)
}

/// Write `value` over whatever another run wrote in between.
fn keep(key: &str, value: &str) -> Result<(), String> {
    loop {
        let seen = storage::get(key)?;
        match storage::put(key, value, seen.map(|entry| entry.rev)) {
            Err(PutError::Conflict) => continue,
            other => return other.map(drop).map_err(PutError::into_message),
        }
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
    keep(LAYOUT_KEY, layout)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_press_starts_a_clean_only_for_a_moment_after_it() {
        assert!(fresh(1_000, 1_000));
        assert!(fresh(1_000, 1_000 + CLEAN_ASK_LASTS_MS));
        assert!(!fresh(1_000, 1_001 + CLEAN_ASK_LASTS_MS), "a press long ago locks nothing");
        assert!(!fresh(1_000, 999), "nor one the clock says is still to come");
    }
}

lumi::register!(KeyTest);
