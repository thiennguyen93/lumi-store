// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Thien Nguyen

//! The Welcome window (`ui/welcome.html`): two short steps `on_lifecycle`
//! opens on a first install — what the extension does, with the display
//! language and the typing method to choose right there, and where the keys
//! typed go.
//!
//! **An install only, not an update.** Clipboard Manager and Selection Bar
//! open theirs on every update to say what is new; this one is typed through
//! all day, and a window coming up over the text after each update would be
//! in the way of the one thing it is for. What an update changes is the
//! store's to say.
//!
//! The page keeps the tour and saves what is chosen itself
//! (`/__lumi__/settings`); this only answers what a page cannot do: redraw
//! the menu row and the tab names in a new language, and the two ways out.

use lumi_extension_api as lumi;
use serde_json::Value;

use crate::{draw_menu, label_tabs};

/// The window, as the manifest names it.
pub const WELCOME: &str = "welcome";

/// What the About or Settings tab sends (`POST /__lumi__/call`) to open the
/// Welcome again: a page of the extension's own replaces Lumi's About page,
/// and with it the button Lumi draws for every declared window.
const OPEN_AGAIN: &str = "welcome";

/// Every kind the page sends. Not read by [`on_page`], whose arms are
/// literals: a test holds this list against both those arms and
/// `ui/welcome.js`, so neither side can gain a kind alone.
#[cfg(test)]
const KINDS: [&str; 3] = ["language", "settings", "close"];

/// What one `run_ui` asks of the Welcome, by the window it came from — the
/// Welcome's own page, or a tab asking for it again.
#[derive(Debug, PartialEq, Eq)]
pub enum Ask {
    /// Open the window: from the About or Settings tab.
    Open,
    /// A request of the Welcome page's own, `{"kind": …}`.
    Page(String),
}

/// Whether a `run_ui` is the Welcome's to answer.
pub fn asked(window: &str, request: &str) -> Option<Ask> {
    match window {
        WELCOME => Some(Ask::Page(request.to_string())),
        ":about" | ":settings" if request == OPEN_AGAIN => Some(Ask::Open),
        _ => None,
    }
}

/// Answer what [`asked`] found.
pub fn answer(ask: Ask) -> Result<String, String> {
    match ask {
        // From a press on the tab: Lumi brings the window up over Settings.
        Ask::Open => lumi::open_window(WELCOME).map(|()| String::new()),
        Ask::Page(request) => on_page(&request),
    }
}

/// A first install: the menu row and the tab names, then the Welcome. A row
/// or a name Lumi refused is no reason to keep the Welcome closed, and the
/// next redraw tries again, so the error is only answered once the window is
/// up — for Lumi's log.
pub fn on_install() -> Result<(), String> {
    let drawn = draw_menu().and_then(|()| label_tabs());
    lumi::open_window(WELCOME)?;
    drawn
}

/// The page's requests, `{"kind": …}` — one of [`KINDS`].
fn on_page(request: &str) -> Result<String, String> {
    let request: Value =
        serde_json::from_str(request).map_err(|err| format!("the Welcome page sent a request that is not JSON: {err}"))?;
    match request.get("kind").and_then(Value::as_str) {
        // A new display language saved by the page: the menu row and the
        // tab names follow, as they do after the Settings tab's.
        Some("language") => draw_menu().and_then(|()| label_tabs()).map(|()| "{}".to_string()),
        // Out of the tour, into the Settings tab. A press.
        Some("settings") => {
            lumi::close_window(WELCOME)?;
            lumi::open_settings()?;
            Ok("{}".to_string())
        }
        Some("close") => {
            lumi::close_window(WELCOME)?;
            Ok("{}".to_string())
        }
        Some(other) => Err(format!("the Welcome page asked for {other}, which Gõ tiếng Việt does not answer")),
        None => Err("the Welcome page sent a request with no kind".to_string()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{respond, Settings};
    use lumi_extension_api::text_input;

    const TELEX: Settings = Settings { vni: false, modern_tone: true, esc_restore: true, english_restore: false };
    const VNI: Settings = Settings { vni: true, ..TELEX };

    /// `word` typed key by key through [`respond`], the way Lumi types
    /// through the extension: each key's answer applied to what the word
    /// shows so far.
    fn spell(word: &str, settings: Settings) -> String {
        let mut keys: Vec<text_input::Key> = Vec::new();
        let mut shown: Vec<char> = Vec::new();
        for character in word.chars() {
            keys.push(text_input::Key { text: character.to_string(), code: String::new() });
            match respond(&keys, settings) {
                Some(edit) => {
                    shown.truncate(shown.len().saturating_sub(edit.delete_before as usize));
                    shown.extend(edit.insert.chars());
                }
                None => shown.push(character),
            }
        }
        shown.into_iter().collect()
    }

    /// The stage (`SCENE` and `BOX` in ui/welcome.js) shows each key doing
    /// what the engine does with it, in its own method: the note and the box
    /// never type a word the extension would not.
    #[test]
    fn the_stage_types_what_the_engine_types() {
        assert_eq!(spell("Vieetj", TELEX), "Việt");
        let page = include_str!("../ui/welcome.js");
        for (name, count) in [("SCENE", 4), ("BOX", 2)] {
            let start = page.find(&format!("const {name} = {{")).unwrap_or_else(|| panic!("welcome.js has no {name}"));
            let scene = &page[start..start + page[start..].find("\n};").expect("it ends")];
            for (method, settings) in [("telex", TELEX), ("vni", VNI)] {
                let block = &scene[scene.find(&format!("{method}: [")).unwrap_or_else(|| panic!("{name}: no {method} words"))..];
                let block = &block[..block.find("\n  ],").expect("the words end")];
                let mut words = 0;
                for line in block.lines().filter(|line| line.contains("keys: \"")) {
                    let quoted: Vec<&str> = line.split('"').skip(1).step_by(2).collect();
                    let (keys, shows) = quoted.split_first().expect("keys");
                    assert_eq!(keys.chars().count(), shows.len(), "{name} {method} {keys}: one shown word per key");
                    for (at, shown) in shows.iter().enumerate() {
                        let typed: String = keys.chars().take(at + 1).collect();
                        assert_eq!(spell(&typed, settings), *shown, "{name} {method}: {typed:?}");
                    }
                    words += 1;
                }
                assert_eq!(words, count, "{name} {method}");
            }
        }
    }

    #[test]
    fn the_welcome_answers_its_own_window_and_the_tabs_asking_for_it() {
        assert_eq!(asked(WELCOME, r#"{"kind":"close"}"#), Some(Ask::Page(r#"{"kind":"close"}"#.to_string())));
        assert_eq!(asked(":about", "welcome"), Some(Ask::Open));
        assert_eq!(asked(":settings", "welcome"), Some(Ask::Open));
        // The Settings tab's own request, and the menu's, are not the Welcome's.
        assert_eq!(asked(":settings", "language"), None);
        assert_eq!(asked(":menu", r#"{"id":"toggle"}"#), None);
    }

    #[test]
    fn a_kind_it_does_not_know_is_refused() {
        assert!(on_page(r#"{"kind":"open"}"#).unwrap_err().contains("asked for open"));
        assert!(on_page("{}").unwrap_err().contains("no kind"));
        assert!(on_page("close").unwrap_err().contains("not JSON"));
    }

    /// Every kind the page sends has an arm here, and every arm is a kind
    /// the page sends.
    #[test]
    fn the_page_and_the_component_agree_on_the_kinds() {
        let source = include_str!("welcome.rs");
        let start = source.find("fn on_page(").expect("no on_page");
        let end = start + source[start..].find("\n}\n").expect("on_page ends");
        let arms: Vec<&str> = source[start..end]
            .match_indices("Some(\"")
            .map(|(at, _)| {
                let rest = &source[start + at + 6..end];
                &rest[..rest.find('"').expect("a closing quote")]
            })
            .collect();
        assert_eq!(arms.len(), KINDS.len(), "on_page answers {arms:?}, KINDS lists {KINDS:?}");
        for kind in KINDS {
            assert!(arms.contains(&kind), "on_page does not answer {kind}");
        }
        let page = include_str!("../ui/welcome.js");
        let sent: Vec<&str> = page
            .match_indices("kind: \"")
            .map(|(at, _)| {
                let rest = &page[at + 7..];
                &rest[..rest.find('"').expect("a closing quote")]
            })
            .collect();
        for kind in KINDS {
            assert!(sent.contains(&kind), "welcome.js never sends {kind}");
        }
        for kind in sent {
            assert!(KINDS.contains(&kind), "welcome.js sends {kind}, which on_page does not answer");
        }
    }

    /// The window the install opens is declared, laid out for its page, and
    /// its page ships: without either the Welcome opens on nothing.
    #[test]
    fn the_window_is_declared_and_its_page_ships() {
        let manifest = include_str!("../manifest.toml");
        // At the start of a line: a comment may name `[[window]]` too.
        let block = manifest
            .split("\n[[window]]")
            .nth(1)
            .and_then(|rest| rest.split("\n[").next())
            .expect("no [[window]]");
        for line in ["name = \"welcome\"", "path = \"welcome.html\"", "resizable = false", "maximizable = false"] {
            assert!(block.contains(line), "the welcome window lacks `{line}`");
        }
        let page = include_str!("../ui/welcome.html");
        assert!(page.contains("src=\"welcome.js\"") && page.contains("href=\"welcome.css\""));
    }
}
