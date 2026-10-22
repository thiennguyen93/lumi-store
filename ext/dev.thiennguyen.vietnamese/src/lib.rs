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
use lumi_extension_api::{self as lumi, front_app, menu, menu_bar_item, text_input, Guest, Lifecycle};

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
        Settings {
            vni: settings.get("method").and_then(|value| value.as_str()) == Some("vni"),
            modern_tone: flag(settings, "modernTone", true),
            esc_restore: flag(settings, "escRestore", true),
            english_restore: flag(settings, "englishRestore", false),
        }
    }
}

/// One switch from the settings object: on unless it says `"false"`, and its
/// manifest default where it says nothing.
fn flag(settings: &serde_json::Value, name: &str, default: bool) -> bool {
    settings.get(name).and_then(|value| value.as_str()).map_or(default, |value| value != "false")
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
/// The storage key holding that app's name, for the popover's "remembered
/// for" line.
const FRONT_NAME: &str = "front-name";
/// The storage key holding the name of each app in [`APPS`], by id — for the
/// popover's per-app tile, which draws those apps' icons and names them to
/// VoiceOver and in a tooltip. Written for an app only once the switch is
/// remembered there, never for every app that comes forward: the apps
/// somebody moves between are a diary, and these are the ones they asked to
/// have kept.
const APP_NAMES: &str = "app-names";

/// The app last in front, as `front-app` last told it.
fn front() -> Option<String> {
    lumi::storage::get(FRONT).ok().flatten().map(|entry| entry.value).filter(|id| !id.is_empty())
}

/// Its name, as `front-app` last told it.
fn front_name() -> Option<String> {
    lumi::storage::get(FRONT_NAME).ok().flatten().map(|entry| entry.value).filter(|name| !name.is_empty())
}

/// A JSON object kept under `key`, or an empty one.
fn stored_map(key: &str) -> serde_json::Map<String, serde_json::Value> {
    lumi::storage::get(key)
        .ok()
        .flatten()
        .and_then(|entry| serde_json::from_str::<serde_json::Value>(&entry.value).ok())
        .and_then(|value| value.as_object().cloned())
        .unwrap_or_default()
}

/// Keep `map` under `key`, over whatever revision is there.
fn store_map(key: &str, map: serde_json::Map<String, serde_json::Value>) -> Result<(), String> {
    let rev = lumi::storage::get(key)?.map(|entry| entry.rev);
    lumi::storage::put(key, &serde_json::Value::Object(map).to_string(), rev)
        .map(|_| ())
        .map_err(lumi::storage::PutError::into_message)
}

/// What the person left the switch at in each app.
fn remembered() -> serde_json::Map<String, serde_json::Value> {
    stored_map(APPS)
}

/// Keep `name` for `app`, unless it is kept already — so an app remembered
/// before names were kept is named the next time it comes forward.
fn name_app(app: &str, name: Option<String>) -> Result<(), String> {
    let Some(name) = name.filter(|name| !name.is_empty()) else {
        return Ok(());
    };
    let mut names = stored_map(APP_NAMES);
    if names.get(app).and_then(serde_json::Value::as_str) == Some(name.as_str()) {
        return Ok(());
    }
    names.insert(app.to_string(), serde_json::Value::String(name));
    store_map(APP_NAMES, names)
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
    apps.insert(app.clone(), serde_json::Value::Bool(on));
    store_map(APPS, apps)?;
    name_app(&app, front_name())
}

/// The other apps the switch is remembered at `on` for, as `(id, name)` by
/// name — the popover's per-app tile shows them, beside a switch already
/// naming the app in front, which is left out. An app remembered before
/// names were kept goes by its id until it comes forward again.
pub fn alike(
    on: bool,
    apps: &serde_json::Map<String, serde_json::Value>,
    names: &serde_json::Map<String, serde_json::Value>,
    front: Option<&str>,
) -> Vec<(String, String)> {
    let mut alike: Vec<(String, String)> = apps
        .iter()
        .filter(|(id, left)| left.as_bool() == Some(on) && Some(id.as_str()) != front)
        .map(|(id, _)| {
            let name = names.get(id).and_then(serde_json::Value::as_str).unwrap_or(id);
            (id.clone(), name.to_string())
        })
        .collect();
    alike.sort_by_cached_key(|(id, name)| (name.to_lowercase(), id.clone()));
    alike
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

/// The names of the extension's own tabs in Settings — Settings, About and
/// Changelog, in the order `[tabs] order` draws them — in the display
/// language: Vietnamese unless it says English, where `None` puts back the
/// manifest's English names and Lumi's own Changelog. Not the Shortcuts tab:
/// it is hidden, its key recorded on the Settings tab, and Lumi refuses a
/// label for a tab the manifest does not draw, which would fail the whole
/// run.
pub fn tab_labels(language: Option<&str>) -> [(&'static str, Option<&'static str>); 3] {
    let vi = language != Some("en");
    [
        (":settings", vi.then_some("Cài đặt")),
        (":about", vi.then_some("Giới thiệu")),
        (":changelog", vi.then_some("Nhật ký thay đổi")),
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

/// The menu a right-click on the V or E opens — VoiceOver's way in, the
/// popover being the click's ([`popover_state`]): the switch, the typing method, the engine's
/// switches, the extension's own Settings… and, last, Quit — which switches
/// the extension off in Lumi (`lumi::switch_off`), not Lumi. The method and
/// the switches are the Settings tab's own rows, put where a press reaches
/// them, as UniKey's, EVKey's and Gõ Nhanh's menus put theirs; a press saves
/// the setting as the tab would (`lumi::set_setting`). Lumi's own heading and
/// Settings row are left out (`menu-bar-item-heading`,
/// `menu-bar-item-settings`): these say both. Every word in the display
/// language: Vietnamese unless it says English, as the Settings tab reads it.
pub fn menu_entries(on: bool, settings: &serde_json::Value) -> Vec<menu::Entry> {
    let language = settings.get("language").and_then(|value| value.as_str());
    let words = |vi: &'static str, en: &'static str| if language == Some("en") { en } else { vi };
    let vni = Settings::from_json(settings).vni;
    let mut entries = vec![menu::Entry::check(TOGGLE_ROW, menu_label(language), on), menu::Entry::separator("s1")];
    for (value, label) in METHODS {
        entries.push(menu::Entry::check(&format!("{METHOD_ROW}{value}"), label, vni == (value == "vni")));
    }
    entries.push(menu::Entry::separator("s2"));
    for (setting, default, vi, en) in OPTIONS {
        entries.push(menu::Entry::check(&format!("{OPTION_ROW}{setting}"), words(vi, en), flag(settings, setting, default)));
    }
    entries.push(menu::Entry::separator("s3"));
    entries.push(menu::Entry::item(SETTINGS_ROW, words("Cài đặt…", "Settings…")).icon(SETTINGS_ICON));
    entries.push(menu::Entry::separator("s4"));
    entries.push(menu::Entry::item(QUIT_ROW, words("Thoát", "Quit")).icon(QUIT_ICON));
    entries
}

/// The typing methods, by the `method` setting's value, as the Settings tab
/// names them.
const METHODS: [(&str, &str); 2] = [("telex", "Telex"), ("vni", "VNI")];

/// The engine's switches the menu holds: the setting, its manifest default,
/// and its words — the Settings tab's own.
const OPTIONS: [(&str, bool, &str, &str); 4] = [
    ("modernTone", true, "Đặt dấu kiểu mới", "Place tone marks the modern way"),
    ("escRestore", true, "Esc trả lại phím đã gõ", "Escape gives back the keys"),
    ("englishRestore", false, "Giữ nguyên từ tiếng Anh", "Keep English words as typed"),
    ("perApp", true, "Nhớ bật hay tắt cho từng ứng dụng", "Remember on or off for each app"),
];

/// The menu row ids a press comes back with: a method's row is
/// `method:<value>`, a switch's `option:<setting>`.
const TOGGLE_ROW: &str = "toggle";
const METHOD_ROW: &str = "method:";
const OPTION_ROW: &str = "option:";
const SETTINGS_ROW: &str = "settings";
const QUIT_ROW: &str = "quit";

/// The glyphs beside the last two rows, from Lumi's Lucide set: the gear and
/// the power button Lumi's own menu draws beside its Settings… and Quit Lumi,
/// so the rows read as the ones they stand in for.
const SETTINGS_ICON: &str = "settings";
const QUIT_ICON: &str = "power";

/// The popover a click on the V or E opens, under it (`[[window]] popover`,
/// `position = "menu-bar-item"`) — the menu above answers a right-click, and
/// VoiceOver, which presses the item rather than clicking it.
const POPOVER: &str = "popover";

/// What the popover shows, as JSON its page reads (popover.js): the switch,
/// the typing method, the four switches by setting, the app the switch is
/// remembered for and the other apps it is remembered alike for ([`alike`],
/// `{id, name}` each) — both only while it is remembered per app — and the
/// display language. Every value read as the menu reads it
/// ([`menu_entries`]), so the two never disagree.
pub fn popover_state(
    on: bool,
    settings: &serde_json::Value,
    app: Option<&str>,
    alike: &[(String, String)],
) -> serde_json::Value {
    let options: serde_json::Map<String, serde_json::Value> = OPTIONS
        .iter()
        .map(|(setting, default, ..)| (setting.to_string(), serde_json::Value::Bool(flag(settings, setting, *default))))
        .collect();
    let english = settings.get("language").and_then(|value| value.as_str()) == Some("en");
    let per_app = flag(settings, "perApp", true);
    let alike: Vec<serde_json::Value> = alike
        .iter()
        .filter(|_| per_app)
        .map(|(id, name)| serde_json::json!({ "id": id, "name": name }))
        .collect();
    serde_json::json!({
        "v": 1,
        "on": on,
        "method": if Settings::from_json(settings).vni { "vni" } else { "telex" },
        "options": options,
        "app": app.filter(|_| per_app),
        "alike": alike,
        "language": if english { "en" } else { "vi" },
    })
}

/// [`popover_state`] as it stands: the switch, the settings and the apps
/// remembered, read now.
fn popover_now(on: bool, settings: &serde_json::Value) -> serde_json::Value {
    let alike = alike(on, &remembered(), &stored_map(APP_NAMES), front().as_deref());
    popover_state(on, settings, front_name().as_deref(), &alike)
}

/// A request from the popover's page: `"state"` for what to show, `"close"`
/// for its Escape, or the id of the menu row it stands for — carried out as
/// a press on that row ([`pressed`]) — answered with what to show next.
fn popover_request(request: &str) -> Result<String, String> {
    match request {
        // Every showing asks: the look is put on before the answer is drawn.
        // A look refused is no reason to show an empty popover.
        "state" => {
            let _ = apply_appearance();
        }
        "close" => return lumi::close_window(POPOVER).map(|()| String::new()),
        id => pressed(id)?,
    }
    Ok(popover_now(text_input::enabled()?, &lumi::settings()).to_string())
}

/// What a press on a row of that menu does, read against the settings it was
/// drawn from.
#[derive(Debug, PartialEq, Eq)]
pub enum Press {
    Toggle,
    /// Save `method` as this value.
    Method(&'static str),
    /// Save this switch as the other of what its tick showed.
    Option { setting: &'static str, on: bool },
    Settings,
    Quit,
}

/// The press on row `id`, or `None` for a row this build does not draw.
pub fn press_of(id: &str, settings: &serde_json::Value) -> Option<Press> {
    if let Some(value) = id.strip_prefix(METHOD_ROW) {
        return METHODS.iter().find(|(known, _)| *known == value).map(|(known, _)| Press::Method(known));
    }
    if let Some(name) = id.strip_prefix(OPTION_ROW) {
        return OPTIONS
            .iter()
            .find(|(setting, ..)| *setting == name)
            .map(|(setting, default, ..)| Press::Option { setting, on: !flag(settings, setting, *default) });
    }
    match id {
        TOGGLE_ROW => Some(Press::Toggle),
        SETTINGS_ROW => Some(Press::Settings),
        QUIT_ROW => Some(Press::Quit),
        _ => None,
    }
}

/// Carry out a press on the menu, and draw it again where a setting moved —
/// Lumi rebuilt it before telling the press, so a tick shows what is saved,
/// never what was clicked.
fn pressed(id: &str) -> Result<(), String> {
    match press_of(id, &lumi::settings()).ok_or_else(|| format!("no menu row {id}"))? {
        Press::Toggle => toggle(),
        Press::Method(value) => lumi::set_setting("method", value).and_then(|()| draw_menu()),
        Press::Option { setting, on } => {
            lumi::set_setting(setting, if on { "true" } else { "false" }).and_then(|()| draw_menu())
        }
        Press::Settings => lumi::open_settings(),
        // Off in Lumi, as the switch under Extensions would put it: the item
        // and the typing go, and nothing of this runs until the person
        // switches it on again there.
        Press::Quit => lumi::switch_off(),
    }
}

/// The first version with an item of its own in the menu bar.
const FIRST_WITH_ITEM: (u64, u64, u64) = (0, 1, 1);

/// Whether `version` drew no item of its own, so its rows lived in Lumi's
/// menu bar menu. Its rows leave that menu once the V or E holds them —
/// the same switch twice over is one too many — through Lumi's own switch
/// for them (`menu::set_shown`), moved once: at install, and on the update
/// from such a version. Never on a later update, so rows the person put back
/// from the Permissions sheet stay where they put them. A version that does
/// not read as three numbers is left alone.
fn drew_no_item(version: &str) -> bool {
    let mut parts = version.split('.').map(|part| part.parse::<u64>().ok());
    match (parts.next().flatten(), parts.next().flatten(), parts.next().flatten(), parts.next()) {
        (Some(major), Some(minor), Some(patch), None) => (major, minor, patch) < FIRST_WITH_ITEM,
        _ => false,
    }
}

/// The menu bar item's icon: V while typing is on, E while it is off — the
/// letters every Vietnamese input method shows — each a key with its letter
/// cut out, shipped under `ui/` and drawn by Lumi in the menu bar's ink.
pub fn menu_bar_icon(on: bool) -> &'static str {
    if on {
        "menu-bar-v.svg"
    } else {
        "menu-bar-e.svg"
    }
}

/// What a pointer resting on the item reads, in the display language.
pub fn menu_bar_tooltip(on: bool, language: Option<&str>) -> &'static str {
    match (language, on) {
        (Some("en"), true) => "Vietnamese typing is on",
        (Some("en"), false) => "Vietnamese typing is off",
        (_, true) => "Gõ tiếng Việt: đang bật",
        (_, false) => "Gõ tiếng Việt: đang tắt",
    }
}

/// The one row in Lumi's menu bar menu — whether typing is on, and the way to
/// switch it — and the item of the extension's own in the menu bar, which
/// shows the same at a glance and opens a menu holding that row. Drawn
/// together, wherever the switch or the language may have moved; Lumi keeps
/// both, and the same item again is no change.
fn draw_menu() -> Result<(), String> {
    let on = text_input::enabled()?;
    let settings = lumi::settings();
    let language = settings.get("language").and_then(|value| value.as_str());
    // `set_rows`, not `set`: only it draws a row's icon.
    menu::set_rows(&menu_entries(on, &settings))?;
    // The popover, when it is up, shows the same; `false` when it is not.
    let _ = lumi::post(POPOVER, &popover_now(on, &settings).to_string());
    menu_bar_item::set(&menu_bar_item::Item::icon(menu_bar_icon(on)).tooltip(menu_bar_tooltip(on, language)))
}

/// The look the popover is drawn in, by the `popoverAppearance` setting:
/// `"light"`, `"dark"`, or `"system"` — Lumi's Appearance, as every other
/// window — for that or anything this build does not know.
pub fn popover_appearance(settings: &serde_json::Value) -> &'static str {
    match settings.get("popoverAppearance").and_then(|value| value.as_str()) {
        Some("light") => "light",
        Some("dark") => "dark",
        _ => "system",
    }
}

/// Put the popover in the look its setting names (`lumi::set_theme`), at
/// once if it is up. Lumi keeps the choice until it quits and nothing runs
/// when it starts, so it is asked again wherever a run may change windows:
/// installing or updating, the Settings tab saving it, and the popover's
/// page asking what to show — which, the first time after a launch, is a
/// moment after the popover opened in Lumi's own look.
fn apply_appearance() -> Result<(), String> {
    lumi::set_theme(POPOVER, popover_appearance(&lumi::settings()))
}

/// What the Settings tab sends after it saves the popover's appearance.
const APPEARANCE_CHANGED: &str = "appearance";

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
        if window == POPOVER {
            return popover_request(&request);
        }
        if let Some(id) = menu::pressed(&window, &request) {
            return pressed(&id).map(|()| String::new());
        }
        if window == ":settings" && request == LANGUAGE_CHANGED {
            return draw_menu().and_then(|()| label_tabs()).map(|()| String::new());
        }
        if window == ":settings" && request == APPEARANCE_CHANGED {
            return apply_appearance().map(|()| String::new());
        }
        if let Some(url) = about_link(&request).filter(|_| window == ":about") {
            return lumi::open_url(url).map(|()| String::new());
        }
        Err("no window".to_string())
    }

    fn on_lifecycle(event: Lifecycle) -> Result<(), String> {
        match event {
            Lifecycle::Installed => {
                menu::set_shown(false)?;
                // A look that cannot be put on is no reason to skip the
                // Welcome; it is still said, after.
                let look = apply_appearance();
                welcome::on_install().and(look)
            }
            Lifecycle::Updated(from) => {
                if drew_no_item(&from) {
                    menu::set_shown(false)?;
                }
                let look = apply_appearance();
                draw_menu().and_then(|()| label_tabs()).and(look)
            }
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
            let app_name = app.name.unwrap_or_default();
            let id = app.id.unwrap_or_default();
            let rev = lumi::storage::get(FRONT)?.map(|entry| entry.rev);
            lumi::storage::put(FRONT, &id, rev).map_err(lumi::storage::PutError::into_message)?;
            let rev = lumi::storage::get(FRONT_NAME)?.map(|entry| entry.rev);
            lumi::storage::put(FRONT_NAME, &app_name, rev).map_err(lumi::storage::PutError::into_message)?;
            if per_app() {
                if let Some(on) = remembered().get(&id).and_then(serde_json::Value::as_bool) {
                    name_app(&id, Some(app_name))?;
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
    fn the_rows_leave_lumis_menu_only_coming_from_a_version_without_an_item() {
        assert!(drew_no_item("0.1.0"));
        assert!(drew_no_item("0.0.9"));
        // Its own item was there already: the person's choice stands.
        assert!(!drew_no_item("0.1.1"));
        assert!(!drew_no_item("0.2.0"));
        assert!(!drew_no_item("1.0.0"));
        // Not three numbers: left alone.
        assert!(!drew_no_item("0.1.0-beta"));
        assert!(!drew_no_item("0.1"));
        assert!(!drew_no_item("0.1.0.1"));
        assert!(!drew_no_item(""));
    }

    /// Each row's id and tick, in order, separators as `-`.
    fn drawn(entries: &[menu::Entry]) -> Vec<(String, bool)> {
        entries
            .iter()
            .map(|entry| match entry.kind {
                menu::Kind::Separator => ("-".to_string(), false),
                _ => (entry.id.clone(), entry.checked),
            })
            .collect()
    }

    #[test]
    fn the_menu_holds_the_method_and_the_switches_the_settings_tab_holds() {
        let rows = |pairs: &[(&str, bool)]| pairs.iter().map(|(id, on)| (id.to_string(), *on)).collect::<Vec<_>>();
        // Never saved: every manifest default, Telex.
        assert_eq!(
            drawn(&menu_entries(true, &serde_json::json!({}))),
            rows(&[
                ("toggle", true),
                ("-", false),
                ("method:telex", true),
                ("method:vni", false),
                ("-", false),
                ("option:modernTone", true),
                ("option:escRestore", true),
                ("option:englishRestore", false),
                ("option:perApp", true),
                ("-", false),
                ("settings", false),
                ("-", false),
                ("quit", false),
            ])
        );
        let saved = serde_json::json!({
            "method": "vni", "modernTone": "false", "escRestore": "false",
            "englishRestore": "true", "perApp": "false",
        });
        let ticks: Vec<(String, bool)> =
            drawn(&menu_entries(false, &saved)).into_iter().filter(|(id, _)| id != "-").collect();
        assert_eq!(
            ticks,
            rows(&[
                ("toggle", false),
                ("method:telex", false),
                ("method:vni", true),
                ("option:modernTone", false),
                ("option:escRestore", false),
                ("option:englishRestore", true),
                ("option:perApp", false),
                ("settings", false),
                ("quit", false),
            ])
        );
    }

    #[test]
    fn the_menu_reads_in_the_display_language() {
        let labels = |language: serde_json::Value| -> Vec<String> {
            menu_entries(true, &serde_json::json!({ "language": language }))
                .into_iter()
                .filter(|entry| entry.kind != menu::Kind::Separator)
                .map(|entry| entry.label)
                .collect()
        };
        assert_eq!(
            labels(serde_json::json!("en")),
            [
                "Vietnamese typing",
                "Telex",
                "VNI",
                "Place tone marks the modern way",
                "Escape gives back the keys",
                "Keep English words as typed",
                "Remember on or off for each app",
                "Settings…",
                "Quit",
            ]
        );
        let vietnamese = [
            "Gõ tiếng Việt",
            "Telex",
            "VNI",
            "Đặt dấu kiểu mới",
            "Esc trả lại phím đã gõ",
            "Giữ nguyên từ tiếng Anh",
            "Nhớ bật hay tắt cho từng ứng dụng",
            "Cài đặt…",
            "Thoát",
        ];
        assert_eq!(labels(serde_json::json!("vi")), vietnamese);
        // Never chosen, or a value this build does not know: Vietnamese.
        assert_eq!(labels(serde_json::Value::Null), vietnamese);
        assert_eq!(labels(serde_json::json!("fr")), vietnamese);
    }

    #[test]
    fn the_popover_shows_what_is_saved_and_the_app_only_when_remembered_per_app() {
        let notes = [("com.apple.Notes".to_string(), "Notes".to_string())];
        let state = popover_state(true, &serde_json::json!({}), Some("Slack"), &notes);
        assert_eq!(
            state,
            serde_json::json!({
                "v": 1,
                "on": true,
                "method": "telex",
                "options": { "modernTone": true, "escRestore": true, "englishRestore": false, "perApp": true },
                "app": "Slack",
                "alike": [{ "id": "com.apple.Notes", "name": "Notes" }],
                "language": "vi",
            })
        );
        let shared = popover_state(false, &serde_json::json!({ "perApp": "false", "language": "en", "method": "vni" }), Some("Slack"), &notes);
        assert_eq!(shared["app"], serde_json::Value::Null, "the same in every app names none");
        assert_eq!(shared["alike"], serde_json::json!([]), "and shows no other app");
        assert_eq!(shared["on"], false);
        assert_eq!(shared["method"], "vni");
        assert_eq!(shared["language"], "en");
        assert_eq!(popover_state(true, &serde_json::json!({}), None, &[])["app"], serde_json::Value::Null);
    }

    /// The per-app tile shows the other apps left as the switch is now, by
    /// name, and an app nobody named yet by its id.
    #[test]
    fn the_apps_alike_are_the_others_left_the_same_way() {
        let apps = serde_json::json!({
            "com.tinyspeck.slackmacgap": true,
            "com.apple.Notes": true,
            "com.apple.Terminal": false,
            "com.microsoft.VSCode": false,
            "org.example.unnamed": true,
            "com.apple.mail": "yes",
        });
        let names = serde_json::json!({
            "com.tinyspeck.slackmacgap": "Slack",
            "com.apple.Notes": "Notes",
            "com.apple.Terminal": "Terminal",
            "com.microsoft.VSCode": "Visual Studio Code",
            "com.apple.mail": "Mail",
        });
        let (apps, names) = (apps.as_object().unwrap(), names.as_object().unwrap());
        let ids = |list: Vec<(String, String)>| list.into_iter().map(|(id, name)| format!("{id}={name}")).collect::<Vec<_>>();
        assert_eq!(
            ids(alike(true, apps, names, Some("com.tinyspeck.slackmacgap"))),
            ["com.apple.Notes=Notes", "org.example.unnamed=org.example.unnamed"],
            "the app in front is the switch's own line, and a value that is not a switch is nobody's",
        );
        assert_eq!(
            ids(alike(false, apps, names, None)),
            ["com.apple.Terminal=Terminal", "com.microsoft.VSCode=Visual Studio Code"],
        );
        assert!(alike(true, &serde_json::Map::new(), names, None).is_empty());
    }

    /// The popover's look is its own setting, never one of the switches the
    /// menu and the popover draw.
    #[test]
    fn the_popover_appearance_is_a_setting_of_the_settings_tab_alone() {
        let look = |value: serde_json::Value| popover_appearance(&serde_json::json!({ "popoverAppearance": value }));
        assert_eq!(look("light".into()), "light");
        assert_eq!(look("dark".into()), "dark");
        assert_eq!(look("system".into()), "system");
        assert_eq!(look("sepia".into()), "system");
        assert_eq!(popover_appearance(&serde_json::json!({})), "system");
        let settings = serde_json::json!({ "popoverAppearance": "dark" });
        assert!(menu_entries(true, &settings).iter().all(|entry| !entry.id.contains("ppearance")));
        assert!(popover_state(true, &settings, None, &[])["options"].get("popoverAppearance").is_none());
        let manifest = include_str!("../manifest.toml");
        assert!(manifest.contains("name = \"popoverAppearance\"") && manifest.contains("default = \"system\""));
    }

    /// The popover and the right-click menu are two drawings of one state.
    #[test]
    fn the_popover_and_the_menu_never_disagree() {
        for settings in [
            serde_json::json!({}),
            serde_json::json!({ "method": "vni", "modernTone": "false", "englishRestore": "true", "perApp": "false" }),
        ] {
            for on in [true, false] {
                let state = popover_state(on, &settings, None, &[]);
                for entry in menu_entries(on, &settings) {
                    if let Some(setting) = entry.id.strip_prefix(OPTION_ROW) {
                        assert_eq!(state["options"][setting], entry.checked, "{setting}");
                    } else if let Some(method) = entry.id.strip_prefix(METHOD_ROW) {
                        assert_eq!(state["method"] == method, entry.checked, "{method}");
                    } else if entry.id == TOGGLE_ROW {
                        assert_eq!(state["on"], entry.checked);
                    }
                }
            }
        }
    }

    #[test]
    fn a_press_saves_the_other_of_what_its_tick_showed() {
        let none = serde_json::json!({});
        assert_eq!(press_of("method:vni", &none), Some(Press::Method("vni")));
        assert_eq!(press_of("method:telex", &none), Some(Press::Method("telex")));
        // Defaults count as what the tick showed.
        assert_eq!(press_of("option:modernTone", &none), Some(Press::Option { setting: "modernTone", on: false }));
        assert_eq!(
            press_of("option:englishRestore", &none),
            Some(Press::Option { setting: "englishRestore", on: true })
        );
        let saved = serde_json::json!({ "perApp": "false" });
        assert_eq!(press_of("option:perApp", &saved), Some(Press::Option { setting: "perApp", on: true }));
        assert_eq!(press_of("toggle", &none), Some(Press::Toggle));
        assert_eq!(press_of("settings", &none), Some(Press::Settings));
        assert_eq!(press_of("quit", &none), Some(Press::Quit));
        // Nothing this build draws: no method or setting it does not know.
        assert_eq!(press_of("method:viqr", &none), None);
        assert_eq!(press_of("option:language", &none), None);
        assert_eq!(press_of("about", &none), None);
    }

    /// Every row the menu draws is one a press is understood on.
    #[test]
    fn every_row_drawn_is_one_a_press_reaches() {
        let settings = serde_json::json!({});
        for entry in menu_entries(true, &settings) {
            if entry.kind != menu::Kind::Separator {
                assert!(press_of(&entry.id, &settings).is_some(), "{}", entry.id);
            }
        }
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

    /// The item says the switch at a glance: V on, E off, each a file the
    /// package ships, and its tooltip in the display language.
    #[test]
    fn the_menu_bar_item_shows_the_switch() {
        assert_eq!(menu_bar_icon(true), "menu-bar-v.svg");
        assert_eq!(menu_bar_icon(false), "menu-bar-e.svg");
        for on in [true, false] {
            let file = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("ui").join(menu_bar_icon(on));
            assert!(file.is_file(), "{} ships", file.display());
        }
        assert_eq!(menu_bar_tooltip(true, Some("en")), "Vietnamese typing is on");
        assert_eq!(menu_bar_tooltip(false, None), "Gõ tiếng Việt: đang tắt");
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
        let vietnamese =
            [(":settings", Some("Cài đặt")), (":about", Some("Giới thiệu")), (":changelog", Some("Nhật ký thay đổi"))];
        assert_eq!(tab_labels(Some("vi")), vietnamese);
        assert_eq!(tab_labels(None), vietnamese);
        // English is the manifest's own names, put back.
        assert_eq!(tab_labels(Some("en")), [(":settings", None), (":about", None), (":changelog", None)]);
        // Held to Lumi's 24 characters.
        assert!(vietnamese.iter().all(|(_, label)| label.unwrap().chars().count() <= 24));
    }
}
