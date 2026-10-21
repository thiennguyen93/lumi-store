// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Thien Nguyen

//! Lumi Gõ tiếng Việt: Telex and VNI in every app, on Lumi's `text-input`
//! primitive, with Gõ Nhanh's core as the engine.
//!
//! **Every key's run is fresh.** Lumi tells `on_event("text-input", …)` the
//! keys of the word so far and nothing survives a run, so [`respond`] replays
//! the whole word through a new engine and answers the last key with what it
//! made of it — delete so many characters, type this. A word ends at a space
//! or punctuation (`commit`), which keeps the replay to one word.
//!
//! **The engine works by key, the payload is by character.** Gõ Nhanh reads
//! macOS keycodes and Shift, the way a key tap sees them; Lumi tells each
//! key's character on the person's layout. So [`physical`] maps the character
//! back to the key a US layout types it with — which also makes the engine
//! follow the layout the person types on, rather than the key's position. A
//! character no Latin key types (⌥-letters, anything outside ASCII) ends the
//! word as typed.
//!
//! **The switch, per app.** Lumi keeps one switch (`text_input::enabled`);
//! this extension remembers it for each app (`front-app`), in its own
//! storage, and moves it when the person switches app. The run that sees keys
//! is sealed — it may read its settings and answer, nothing else — so the
//! keys never reach that storage.

use gonhanh_core::data::keys as kc;
use gonhanh_core::engine::Engine;
use lumi_extension_api::{self as lumi, front_app, menu, text_input, Guest, Lifecycle};

mod welcome;

/// The engine's settings, read from the extension's settings object.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Settings {
    pub vni: bool,
    pub modern_tone: bool,
    pub esc_restore: bool,
    pub english_restore: bool,
}

impl Settings {
    /// From the settings object Lumi hands a run: strings, as every setting is.
    pub fn from_json(settings: &serde_json::Value) -> Self {
        let on = |name: &str, default: bool| {
            settings.get(name).and_then(|value| value.as_str()).map_or(default, |value| value != "false")
        };
        Settings {
            vni: settings.get("method").and_then(|value| value.as_str()) == Some("vni"),
            modern_tone: on("modernTone", true),
            esc_restore: on("escRestore", true),
            english_restore: on("englishRestore", false),
        }
    }
}

/// The answer to the last of `keys`, the keys of the word so far — or `None`,
/// which lets the key type itself.
pub fn respond(keys: &[text_input::Key], settings: Settings) -> Option<text_input::Edit> {
    let mut engine = Engine::new();
    engine.set_method(if settings.vni { 1 } else { 0 });
    engine.set_modern_tone(settings.modern_tone);
    engine.set_esc_restore(settings.esc_restore);
    engine.set_english_auto_restore(settings.english_restore);

    let (last, before) = keys.split_last()?;
    for key in before {
        let (code, caps, shift) = physical(key)?;
        engine.on_key_ext(code, caps, false, shift);
    }
    let Some((code, caps, shift)) = physical(last) else {
        // A character no Latin key types: the word ends here, as typed.
        return Some(edit(0, &last.text, true));
    };
    let result = engine.on_key_ext(code, caps, false, shift);
    let boundary = code == kc::SPACE || code == kc::ESC || kc::is_break_ext(code, shift);
    if result.action != 1 {
        // Nothing to change: the key types itself, and a boundary ends the
        // word so the next one replays alone.
        return boundary.then(|| edit(0, &last.text, true));
    }
    let count = usize::from(result.count).min(result.chars.len());
    let mut insert: String = result.chars[..count].iter().filter_map(|&unit| char::from_u32(unit)).collect();
    // Gõ Nhanh's own apps type a punctuation key after the replacement unless
    // the engine consumed it; the edit has to say so itself.
    let consumed = result.flags & 0x01 != 0;
    if kc::is_break_ext(code, shift) && code != kc::SPACE && code != kc::ESC && !consumed {
        insert.push_str(&last.text);
    }
    Some(edit(u32::from(result.backspace), &insert, boundary))
}

fn edit(delete_before: u32, insert: &str, commit: bool) -> text_input::Edit {
    text_input::Edit { delete_before, delete_after: 0, insert: insert.to_string(), commit }
}

/// The macOS keycode, Caps and Shift a key-tap engine expects for a key,
/// from the character it typed — as a US layout types it.
pub fn physical(key: &text_input::Key) -> Option<(u16, bool, bool)> {
    match key.code.as_str() {
        "Backspace" => return Some((kc::DELETE, false, false)),
        "Escape" => return Some((kc::ESC, false, false)),
        _ => {}
    }
    let mut characters = key.text.chars();
    let character = characters.next()?;
    if characters.next().is_some() {
        return None;
    }
    if character.is_ascii_alphabetic() {
        const LETTERS: [u16; 26] = [
            kc::A, kc::B, kc::C, kc::D, kc::E, kc::F, kc::G, kc::H, kc::I, kc::J, kc::K, kc::L, kc::M,
            kc::N, kc::O, kc::P, kc::Q, kc::R, kc::S, kc::T, kc::U, kc::V, kc::W, kc::X, kc::Y, kc::Z,
        ];
        let at = usize::from(character.to_ascii_lowercase() as u8 - b'a');
        let upper = character.is_ascii_uppercase();
        return Some((*LETTERS.get(at)?, upper, upper));
    }
    const DIGITS: [u16; 10] = [kc::N0, kc::N1, kc::N2, kc::N3, kc::N4, kc::N5, kc::N6, kc::N7, kc::N8, kc::N9];
    let (code, shift) = match character {
        '0'..='9' => (*DIGITS.get(usize::from(character as u8 - b'0'))?, false),
        ')' => (kc::N0, true),
        '!' => (kc::N1, true),
        '@' => (kc::N2, true),
        '#' => (kc::N3, true),
        '$' => (kc::N4, true),
        '%' => (kc::N5, true),
        '^' => (kc::N6, true),
        '&' => (kc::N7, true),
        '*' => (kc::N8, true),
        '(' => (kc::N9, true),
        ' ' => (kc::SPACE, false),
        '.' => (kc::DOT, false),
        '>' => (kc::DOT, true),
        ',' => (kc::COMMA, false),
        '<' => (kc::COMMA, true),
        '/' => (kc::SLASH, false),
        '?' => (kc::SLASH, true),
        ';' => (kc::SEMICOLON, false),
        ':' => (kc::SEMICOLON, true),
        '\'' => (kc::QUOTE, false),
        '"' => (kc::QUOTE, true),
        '[' => (kc::LBRACKET, false),
        '{' => (kc::LBRACKET, true),
        ']' => (kc::RBRACKET, false),
        '}' => (kc::RBRACKET, true),
        '\\' => (kc::BACKSLASH, false),
        '|' => (kc::BACKSLASH, true),
        '-' => (kc::MINUS, false),
        '_' => (kc::MINUS, true),
        '=' => (kc::EQUAL, false),
        '+' => (kc::EQUAL, true),
        '`' => (kc::BACKQUOTE, false),
        '~' => (kc::BACKQUOTE, true),
        _ => return None,
    };
    Some((code, shift, shift))
}

/// The storage key holding, per app, whether typing was left on there.
const APPS: &str = "apps";
/// The storage key holding the app last in front.
const FRONT: &str = "front";

/// The app last in front, as `front-app` last told it.
fn front() -> Option<String> {
    lumi::storage::get(FRONT).ok().flatten().map(|entry| entry.value).filter(|id| !id.is_empty())
}

/// What the person left the switch at in each app.
fn remembered() -> serde_json::Map<String, serde_json::Value> {
    lumi::storage::get(APPS)
        .ok()
        .flatten()
        .and_then(|entry| serde_json::from_str::<serde_json::Value>(&entry.value).ok())
        .and_then(|value| value.as_object().cloned())
        .unwrap_or_default()
}

fn per_app() -> bool {
    lumi::setting("perApp").as_deref() != Some("false")
}

/// Remember the switch for the app in front.
fn remember(on: bool) -> Result<(), String> {
    let Some(app) = front() else {
        return Ok(());
    };
    let mut apps = remembered();
    apps.insert(app, serde_json::Value::Bool(on));
    let rev = lumi::storage::get(APPS)?.map(|entry| entry.rev);
    lumi::storage::put(APPS, &serde_json::Value::Object(apps).to_string(), rev)
        .map(|_| ())
        .map_err(lumi::storage::PutError::into_message)
}

/// The menu row's words in the display language the person chose
/// (`language`): Vietnamese unless it says English, as the Settings tab reads
/// it.
pub fn menu_label(language: Option<&str>) -> &'static str {
    match language {
        Some("en") => "Vietnamese typing",
        _ => "Gõ tiếng Việt",
    }
}

/// The names of the extension's own tabs in Settings — Settings, About, and
/// the Shortcuts tab Lumi draws for its `[[shortcut]]` — in the display
/// language: Vietnamese unless it says English, where `None` puts back the
/// manifest's English names.
pub fn tab_labels(language: Option<&str>) -> [(&'static str, Option<&'static str>); 3] {
    let vi = language != Some("en");
    [
        (":settings", vi.then_some("Cài đặt")),
        (":about", vi.then_some("Giới thiệu")),
        (":shortcuts", vi.then_some("Phím tắt")),
    ]
}

/// Name the tabs in the display language. Lumi keeps a label across restarts
/// and updates, and the same one again is no change, so this runs where the
/// language may be new: install, update, and a save from the Settings tab.
fn label_tabs() -> Result<(), String> {
    for (tab, label) in tab_labels(lumi::setting("language").as_deref()) {
        lumi::set_tab_label(tab, label)?;
    }
    Ok(())
}

/// The one row in Lumi's menu bar menu: whether typing is on, and the way to
/// switch it.
fn draw_menu() -> Result<(), String> {
    let on = text_input::enabled()?;
    let label = menu_label(lumi::setting("language").as_deref());
    menu::set(&[menu::Entry::check("toggle", label, on)])
}

/// What the Settings tab sends (`POST /__lumi__/call`) after it saves a new
/// display language. Nothing tells a component its settings changed, and the
/// menu row is drawn from the stored tree until somebody draws it again, so
/// the page asks for it to be drawn in the new language, and the tabs named
/// in it.
const LANGUAGE_CHANGED: &str = "language";

/// What the About tab sends when the person presses one of its links, and
/// where each leads: the extension's page in the store (the manifest's
/// `homepage`), its source, and its author's mail. The page may not leave its
/// own files, so the component opens the address in the browser or the mail
/// app — a press, which costs no capability — and only these addresses, never
/// one the page names.
const ABOUT_LINKS: [(&str, &str); 3] = [
    ("homepage", "https://lumikeys.app/extensions/dev.thiennguyen.vietnamese/"),
    ("source", "https://github.com/thiennguyen93/lumi-store/tree/main/ext/dev.thiennguyen.vietnamese"),
    ("contact", "mailto:hi@thiennguyen.dev"),
];

/// Where an About tab link leads, by the word the page sends.
fn about_link(request: &str) -> Option<&'static str> {
    ABOUT_LINKS.iter().find(|(word, _)| *word == request).map(|(_, url)| *url)
}

/// The person switching typing on or off — a shortcut, the command, or the
/// menu row — remembered for the app in front.
fn toggle() -> Result<(), String> {
    let on = !text_input::enabled()?;
    text_input::set_enabled(on)?;
    if per_app() {
        remember(on)?;
    }
    draw_menu()
}

struct VietnameseTyping;

impl Guest for VietnameseTyping {
    fn run_command(name: String, _params: String) -> Result<String, String> {
        match name.as_str() {
            "toggle" => toggle().map(|()| String::new()),
            other => Err(format!("no command named {other}")),
        }
    }

    fn run_node(name: String, _params: String, _items: String) -> Result<String, String> {
        Err(format!("no node named {name}"))
    }

    fn run_ui(window: String, request: String) -> Result<String, String> {
        if let Some(ask) = welcome::asked(&window, &request) {
            return welcome::answer(ask);
        }
        if let Some(id) = menu::pressed(&window, &request) {
            if id == "toggle" {
                return toggle().map(|()| String::new());
            }
        }
        if window == ":settings" && request == LANGUAGE_CHANGED {
            return draw_menu().and_then(|()| label_tabs()).map(|()| String::new());
        }
        if let Some(url) = about_link(&request).filter(|_| window == ":about") {
            return lumi::open_url(url).map(|()| String::new());
        }
        Err("no window".to_string())
    }

    fn on_lifecycle(event: Lifecycle) -> Result<(), String> {
        match event {
            Lifecycle::Installed => welcome::on_install(),
            Lifecycle::Updated(_) => draw_menu().and_then(|()| label_tabs()),
            Lifecycle::Uninstalling => Ok(()),
        }
    }

    fn on_event(name: String, payload: String) -> Result<(), String> {
        if let Some(keys) = text_input::keys(&name, &payload) {
            // The sealed run: settings and the answer, nothing else.
            let settings = Settings::from_json(&lumi::settings());
            return match respond(&keys, settings) {
                Some(edit) => text_input::answer(&edit),
                None => Ok(()),
            };
        }
        if let Some(app) = front_app::changed(&name, &payload) {
            let id = app.id.unwrap_or_default();
            let rev = lumi::storage::get(FRONT)?.map(|entry| entry.rev);
            lumi::storage::put(FRONT, &id, rev).map_err(lumi::storage::PutError::into_message)?;
            if per_app() {
                if let Some(on) = remembered().get(&id).and_then(serde_json::Value::as_bool) {
                    if on != text_input::enabled()? {
                        text_input::set_enabled(on)?;
                    }
                }
            }
            return draw_menu();
        }
        if text_input::enabled_changed(&name, &payload).is_some() {
            return draw_menu();
        }
        Ok(())
    }
}

lumi::register!(VietnameseTyping);

#[cfg(test)]
mod tests {
    use super::*;

    const TELEX: Settings = Settings { vni: false, modern_tone: true, esc_restore: true, english_restore: false };

    /// A US layout's `KeyboardEvent.code` for a character.
    fn code(character: char) -> &'static str {
        match character {
            ' ' => "Space",
            '.' => "Period",
            ',' => "Comma",
            _ => "KeyA",
        }
    }

    /// Types `script` through `respond` the way Lumi's host does — the keys
    /// of the word replayed, the answer held to its bounds — and answers the
    /// document. `⌫` is Backspace and `⎋` Escape.
    fn typed(script: &str, settings: Settings) -> String {
        let mut doc = String::new();
        let mut keys: Vec<text_input::Key> = Vec::new();
        let mut shadow = String::new();
        for character in script.chars() {
            let key = match character {
                '⌫' => text_input::Key { text: String::new(), code: "Backspace".to_string() },
                '⎋' => text_input::Key { text: String::new(), code: "Escape".to_string() },
                c => text_input::Key { text: c.to_string(), code: code(c).to_string() },
            };
            let told = key.code == "Backspace" || key.code == "Escape";
            if told && shadow.is_empty() {
                // No word open: the application's own key.
                if key.code == "Backspace" {
                    doc.pop();
                }
                keys.clear();
                continue;
            }
            keys.push(key.clone());
            let identity = match key.code.as_str() {
                "Backspace" => edit(1, "", false),
                "Escape" => edit(0, "", true),
                _ => edit(0, &key.text, false),
            };
            let answer = respond(&keys, settings).unwrap_or(identity);
            assert!(answer.delete_before as usize <= shadow.chars().count(), "{script:?}: deletes past the word");
            assert!(!answer.insert.chars().any(char::is_control), "{script:?}: a control character");
            for _ in 0..answer.delete_before {
                doc.pop();
                shadow.pop();
            }
            doc.push_str(&answer.insert);
            shadow.push_str(&answer.insert);
            if answer.commit || key.code == "Escape" {
                keys.clear();
                shadow.clear();
            }
        }
        doc
    }

    #[test]
    fn telex_types_vietnamese() {
        assert_eq!(typed("Tieengs Vieetj ", TELEX), "Tiếng Việt ");
        assert_eq!(typed("dduwowcj nguwowif ", TELEX), "được người ");
        assert_eq!(typed("hoaf ", TELEX), "hoà ", "modern tone placement by default");
        assert_eq!(typed("hoaf ", Settings { modern_tone: false, ..TELEX }), "hòa ");
    }

    #[test]
    fn vni_types_vietnamese() {
        let vni = Settings { vni: true, ..TELEX };
        assert_eq!(typed("Tie61ng Vie65t ", vni), "Tiếng Việt ");
    }

    #[test]
    fn backspace_and_escape_work_inside_a_word() {
        assert_eq!(typed("dduwowc⌫cj ", TELEX), "được ");
        assert_eq!(typed("vieet⎋", TELEX), "vieet", "Escape gives back the keys as typed");
        assert_eq!(typed("vieet⎋", Settings { esc_restore: false, ..TELEX }), "viêt");
    }

    #[test]
    fn english_words_can_be_kept_as_typed() {
        let keep = Settings { english_restore: true, ..TELEX };
        assert_eq!(typed("permission system ", keep), "permission system ");
    }

    #[test]
    fn a_character_no_latin_key_types_ends_the_word_as_typed() {
        assert_eq!(physical(&text_input::Key { text: "å".to_string(), code: "KeyA".to_string() }), None);
        assert_eq!(typed("aå", TELEX), "aå");
    }

    #[test]
    fn the_engine_follows_the_layout_not_the_key_position() {
        // A Dvorak `s` sits where QWERTY has `;`: the character decides.
        let key = text_input::Key { text: "s".to_string(), code: "Semicolon".to_string() };
        assert_eq!(physical(&key), Some((kc::S, false, false)));
        let key = text_input::Key { text: "@".to_string(), code: "Digit2".to_string() };
        assert_eq!(physical(&key), Some((kc::N2, true, true)));
    }

    #[test]
    fn settings_arrive_as_strings() {
        let settings = serde_json::json!({"method": "vni", "modernTone": "false", "escRestore": "true", "englishRestore": "true"});
        assert_eq!(
            Settings::from_json(&settings),
            Settings { vni: true, modern_tone: false, esc_restore: true, english_restore: true }
        );
        assert_eq!(Settings::from_json(&serde_json::json!({})), TELEX);
    }

    #[test]
    fn the_menu_row_reads_in_the_display_language() {
        assert_eq!(menu_label(Some("en")), "Vietnamese typing");
        assert_eq!(menu_label(Some("vi")), "Gõ tiếng Việt");
        // Never chosen, or a value this build does not know: Vietnamese, the
        // manifest's default.
        assert_eq!(menu_label(None), "Gõ tiếng Việt");
        assert_eq!(menu_label(Some("fr")), "Gõ tiếng Việt");
    }

    #[test]
    fn the_about_tab_opens_only_its_own_links() {
        assert_eq!(about_link("homepage"), Some("https://lumikeys.app/extensions/dev.thiennguyen.vietnamese/"));
        assert_eq!(about_link("contact"), Some("mailto:hi@thiennguyen.dev"));
        assert!(about_link("source").is_some_and(|url| url.starts_with("https://github.com/")));
        // Anything else the page sends opens nothing, a URL included.
        assert_eq!(about_link("https://example.com"), None);
        assert_eq!(about_link(""), None);
    }

    #[test]
    fn the_tabs_are_named_in_the_display_language() {
        let vietnamese = [(":settings", Some("Cài đặt")), (":about", Some("Giới thiệu")), (":shortcuts", Some("Phím tắt"))];
        assert_eq!(tab_labels(Some("vi")), vietnamese);
        assert_eq!(tab_labels(None), vietnamese);
        // English is the manifest's own names, put back.
        assert_eq!(tab_labels(Some("en")), [(":settings", None), (":about", None), (":shortcuts", None)]);
        // Held to Lumi's 24 characters.
        assert!(vietnamese.iter().all(|(_, label)| label.unwrap().chars().count() <= 24));
    }
}
