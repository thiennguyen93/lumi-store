//! Mic Mute: one key mutes every microphone on the Mac, and a microphone
//! plugged in while muted is muted too, until the same key unmutes them all.
//!
//! **Lumi does the muting; this decides what to mute.** Every input is held
//! muted through Lumi's `audio-devices` (`hold_muted`), and Lumi puts each
//! device back as it was once this lets go — or once Mic Mute is switched
//! off, removed, or Lumi quits. What "every microphone" means is this
//! extension's: an input Lumi can mute, and a virtual one (a meeting app's
//! loopback) only when the person's `virtual` setting says so.
//!
//! **Whether the person wants the microphones muted is kept here**, in
//! storage under [`MUTED`]: an event run knows nothing else, and it is what
//! tells a microphone that has just arrived apart from one the person never
//! muted. While it is on, every `audio-devices` event holds whatever input
//! is not held as wanted — a device plugged in, or one somebody unmuted in
//! System Settings: the promise is that nothing hears until the key is
//! pressed again.
//!
//! **An input Lumi cannot mute is never shown as muted**: an iPhone used as
//! a microphone has no mute Lumi can set, and a volume of 0 is not silence,
//! so the panel lists it as "Can't Mute" — where it can still be chosen as
//! the Mac's input (the owner, 2026-11-11). A mute says only "Muted".
//!
//! **⌥⌘M is held as well as pressed** (0.2.0, `hold = true`, Lumi 1.79.0):
//! Lumi runs `toggle` once when the key goes down and once when it comes
//! up. **A hold is always a talk, and a talk always ends muted**: held at
//! least [`HOLD_MS`], the microphones are on while it lasts and muted when
//! it is let go, whether they were muted or on when it began (the owner,
//! 2026-11-11). **A tap is the toggle**: from muted it leaves them on, from
//! on it mutes them. While muted, the key going down unmutes at once, so the
//! first word is heard; while on, it changes nothing, and the up mutes —
//! for a tap a hundred milliseconds after the press rather than at it, the
//! price of not knowing at the down which it is. A talk is kept in storage
//! under [`TALKING`] (the pair Lumi numbered, and whether it began on), so an
//! `audio-devices` event in the middle of one does not mute what the person
//! is holding open; an up Lumi sends because it lost the key (a password
//! field, the Mac asleep) mutes them again, the safe side.
//!
//! **What shows while talking is the person's choice** (0.3.0, the
//! `while-talking` setting): the item always animates ([`TALK_FRAMES`]), and
//! "Card" adds the [`CARD`] window at the top right — orange while held,
//! "Unmuted" after a tap, red when Lumi ended the talk on its own — while
//! "Screen Glow" lights the edge of every display ([`GLOW`], an overlay every
//! press goes through, kept out of a call's screen share). "Icon Only" and
//! "Screen Glow" say a talk Lumi ended with an alert instead, since the
//! person may still be holding the key and talking. The owner picked all
//! three variants of this surface (design review, 2026-11-10) and asked for
//! the choice to be the person's.
//!
//! **A click on the item opens [`PANEL`]** (0.3.0): the switch as a round
//! button, every microphone with what it is now, the key and Settings. A
//! right-click still switches without opening anything, and Lumi's own menu
//! of the item — the one VoiceOver presses — keeps the check row.

use lumi::audio_devices::{self, Device, Scope, Transport};
use lumi::hold::{self, Phase, Why};
use lumi::{menu, menu_bar_item, storage};
use lumi_extension_api as lumi;
use serde_json::json;

/// The storage key for whether the person wants every microphone muted:
/// `"true"` while they do.
const MUTED: &str = "muted";

/// The row in the icon's menu that switches it.
const TOGGLE_ROW: &str = "toggle";

/// The storage key for a talk under way: the pair of the key's down that
/// unmuted the microphones, while the key is held.
const TALKING: &str = "talking";

/// How long the key must be held for its release to mute again — shorter is
/// a tap, which toggles. The manifest's `held-after-ms` is the same number,
/// so the talk is shown exactly when its release would mute.
const HOLD_MS: u64 = 200;

/// The panel a click on the item opens (`[[window]] panel`).
const PANEL: &str = "panel";

/// The card at the top right while talking (`[[window]] card`).
const CARD: &str = "card";

/// The glow round every display while talking (`[[window]] glow`,
/// `kind = "overlay"`): opened on the key going down, closed on its coming
/// up — every down gets its up from Lumi, a lost one included, so it never
/// stays.
const GLOW: &str = "glow";

/// The storage key for what the card says now — the very post it was sent,
/// `{"v": 1, "state"}` with `state` `"talking"`, `"muted"`, `"unmuted"` or
/// `"ended"` — which its page asks for each time it shows, since a post
/// misses a page that has not loaded yet.
const CARD_SAYS: &str = "card";

/// The item while talking: the microphone with three orange bars beside it,
/// six frames under `ui/icons/` (each with a `.dark.svg` twin), played by
/// Lumi at [`TALK_PER_SECOND`]. Under Reduce Motion Lumi draws the item's
/// still icon, the live microphone.
const TALK_FRAMES: [&str; 6] = [
    "icons/talk-1.svg",
    "icons/talk-2.svg",
    "icons/talk-3.svg",
    "icons/talk-4.svg",
    "icons/talk-5.svg",
    "icons/talk-6.svg",
];
const TALK_PER_SECOND: u8 = 8;

/// Whether the person wants every microphone muted.
fn wanted() -> Result<bool, String> {
    Ok(storage::get(MUTED)?.is_some_and(|entry| entry.value == "true"))
}

fn set_wanted(on: bool) -> Result<(), String> {
    let rev = storage::get(MUTED)?.map(|entry| entry.rev);
    storage::put(MUTED, if on { "true" } else { "false" }, rev)
        .map(|_| ())
        .map_err(storage::PutError::into_message)
}

/// A talk under way: a key's down whose up has not come.
#[derive(Clone, Copy, PartialEq, Eq)]
struct Talk {
    pair: u64,
    /// The microphones were on when it began, so it changed nothing at the
    /// down, and its up mutes them whether tapped or held.
    began_on: bool,
}

/// The talk under way, kept as `"<pair>"` (it began muted, and unmuted) or
/// `"<pair>:on"` (it began on).
fn talking() -> Result<Option<Talk>, String> {
    Ok(storage::get(TALKING)?.and_then(|entry| {
        let (pair, began_on) = match entry.value.strip_suffix(":on") {
            Some(pair) => (pair.to_string(), true),
            None => (entry.value, false),
        };
        pair.parse().ok().map(|pair| Talk { pair, began_on })
    }))
}

fn set_talking(talk: Option<Talk>) -> Result<(), String> {
    match talk {
        Some(talk) => {
            let rev = storage::get(TALKING)?.map(|entry| entry.rev);
            let kept = if talk.began_on { format!("{}:on", talk.pair) } else { talk.pair.to_string() };
            storage::put(TALKING, &kept, rev).map(|_| ()).map_err(storage::PutError::into_message)
        }
        None => storage::delete(TALKING),
    }
}

/// Whether `pair` is the talk under way.
fn talking_as(pair: u64) -> Result<Option<Talk>, String> {
    Ok(talking()?.filter(|talk| talk.pair == pair))
}

/// Whether the person's setting mutes virtual microphones too.
fn virtual_too() -> bool {
    lumi::settings().get("virtual").and_then(|value| value.as_str()) == Some("true")
}

/// What shows while talking besides the item, as the person's
/// `while-talking` setting says. A value this version does not know — one a
/// later version wrote — is the card, the default.
#[derive(Clone, Copy, PartialEq, Eq)]
enum WhileTalking {
    IconOnly,
    Card,
    Glow,
}

fn while_talking() -> WhileTalking {
    match lumi::settings().get("while-talking").and_then(|value| value.as_str()) {
        Some("icon") => WhileTalking::IconOnly,
        Some("glow") => WhileTalking::Glow,
        _ => WhileTalking::Card,
    }
}

/// Whether `device` is one Mic Mute mutes: an input Lumi can mute, and a
/// virtual one only with the setting on.
fn mutes(device: &Device, virtual_too: bool) -> bool {
    device.input.as_ref().is_some_and(|side| side.mute_settable) && (virtual_too || device.transport != Transport::Virtual)
}

/// An input that is a microphone the person would expect muted but Lumi
/// cannot mute — listed in the panel as "Can't Mute", so it is never
/// mistaken for muted.
fn cannot_mute(device: &Device) -> bool {
    device.input.as_ref().is_some_and(|side| !side.mute_settable) && device.transport != Transport::Virtual
}

/// Hold every input Mic Mute mutes that is not muted as held already. A
/// refusal because the person unmuted from Lumi's menu is an error: their
/// word stands. Any other refusal is passed over: a microphone that could not
/// be muted is the panel's to show ("Can't Mute"), not the mute's to say.
fn hold_all(devices: &[Device]) -> Result<(), String> {
    let virtual_too = virtual_too();
    for device in devices.iter().filter(|device| mutes(device, virtual_too)) {
        let side = device.input.as_ref().expect("an input, by `mutes`");
        if side.held && side.as_held {
            continue;
        }
        if let Err(said) = audio_devices::hold_muted(&device.id, Scope::Input) {
            if audio_devices::refusal(&said) == Some("refused") {
                return Err(said);
            }
        }
    }
    Ok(())
}

/// Let go of every input Mic Mute holds; Lumi puts each back as it was.
fn release_all() -> Result<(), String> {
    for device in audio_devices::devices()? {
        if device.input.as_ref().is_some_and(|side| side.held) {
            audio_devices::release(&device.id, Scope::Input)?;
        }
    }
    Ok(())
}

/// What the panel draws: whether the microphones are muted, whether a talk
/// is under way, and every microphone Mic Mute mutes — each as the device
/// reads now, never as Mic Mute hopes, which one is the Mac's input
/// (`default`), as the Sound settings mark it, and whether macOS will make
/// it the input (`choosable`, Lumi 1.79.0), for a press on its row. One it
/// cannot mute — an iPhone used as a microphone — is listed too, saying so,
/// since the panel is also where the Mac's input is chosen (the owner,
/// 2026-11-11); a virtual one Mic Mute leaves alone is listed only if macOS
/// will make it the input. A name is the device's own text; the page sets
/// it as text.
fn panel_state() -> Result<serde_json::Value, String> {
    let virtual_too = virtual_too();
    let talking = talking()?.is_some();
    let muted = wanted()? && !talking;
    let choices = audio_devices::default_choices(Scope::Input)?;
    let devices: Vec<serde_json::Value> = audio_devices::devices()?
        .iter()
        .filter(|device| mutes(device, virtual_too) || cannot_mute(device) || choices.contains(&device.id))
        .map(|device| {
            let kind = match device.transport {
                Transport::BuiltIn => "built-in",
                Transport::Bluetooth | Transport::BluetoothLe => "bluetooth",
                Transport::Usb => "usb",
                Transport::Continuity => "phone",
                _ => "other",
            };
            let input = device.input.as_ref();
            let state = if !input.is_some_and(|side| side.mute_settable && side.muted.is_some()) {
                "cannot"
            } else if input.and_then(|side| side.muted) == Some(true) {
                "muted"
            } else {
                "on"
            };
            let default = device.input.as_ref().is_some_and(|side| side.is_default);
            json!({
                "id": device.id,
                "name": device.name,
                "kind": kind,
                "state": state,
                "default": default,
                "choosable": choices.contains(&device.id),
            })
        })
        .collect();
    Ok(json!({ "v": 1, "muted": muted, "talking": talking, "devices": devices }))
}

/// The panel, told what stands now if it is open — or kept loaded, put away:
/// a post is news for whoever is looking, and a closed panel asks again when
/// it opens.
fn tell_panel() -> Result<(), String> {
    lumi::post(PANEL, &panel_state()?.to_string()).map(|_| ())
}

/// The card, saying `says` — written down first, so a page that loads after
/// the post asks for it and finds it — and opened. Opening is a press's to
/// do, which every run of the key is.
fn card(says: &str) -> Result<(), String> {
    let told = json!({ "v": 1, "state": says }).to_string();
    let rev = storage::get(CARD_SAYS)?.map(|entry| entry.rev);
    storage::put(CARD_SAYS, &told, rev).map_err(storage::PutError::into_message)?;
    lumi::post(CARD, &told)?;
    lumi::open_window(CARD)
}

/// The icon, its tooltip and its menu's row, for `muted` — and the panel,
/// told.
///
/// The panel and the card in macOS's light or dark rather than Lumi's
/// (`set_theme`'s `"macos"`, Lumi 1.79.0): both stand by the menu bar,
/// which is drawn in macOS's look whatever Lumi's own Appearance says, so a
/// Lumi set to Dark on a light Mac put a dark panel under a light bar. Lumi
/// keeps the choice and follows macOS as it changes, so this is said once,
/// at an install or an update. The glow is left Lumi's: it draws an orange
/// edge and nothing a look could put on the wrong ground.
fn dress() -> Result<(), String> {
    lumi::set_theme(PANEL, "macos")?;
    lumi::set_theme(CARD, "macos")
}

/// The icon is drawn in colour (0.3.0, `Item::coloured`, Lumi 1.79.0): the
/// microphone in the bar's own ink, with a red slash when muted and an
/// orange dot when live — orange being macOS's colour for a microphone in
/// use, red every meeting app's for muted. The shapes differ as well as the
/// colours (a slash, a dot), and the tooltip says it, so no state rests on
/// colour alone. Each file has a `.dark.svg` twin for a dark bar.
fn draw(muted: bool) -> Result<(), String> {
    let (icon, tooltip) = if muted {
        ("icons/muted.svg", "Microphones muted — hold ⌥⌘M to talk, tap to unmute")
    } else {
        ("icons/live.svg", "Microphones on — ⌥⌘M to mute")
    };
    menu_bar_item::set(&menu_bar_item::Item::icon(icon).tooltip(tooltip).coloured())?;
    menu::set(&[menu::Entry::check(TOGGLE_ROW, "Mute Every Microphone", muted)])?;
    tell_panel()
}

/// The item while talking: the live microphone with orange bars playing
/// beside it — under Reduce Motion, the live microphone still.
fn draw_talking() -> Result<(), String> {
    menu_bar_item::set(
        &menu_bar_item::Item::icon("icons/live.svg")
            .frames(&TALK_FRAMES, TALK_PER_SECOND)
            .tooltip("Talking — let go of ⌥⌘M to mute")
            .coloured(),
    )?;
    tell_panel()
}

/// Mute everything, or unmute it all — and, when `say`, say so: the key, the
/// right-click and the menu's row do, while the panel's button does not,
/// since the panel in front of the person already shows it. Said on the card
/// at the top right when "While talking" is Card, so a mute is said where an
/// unmute is (0.3.0, the owner: the card said Unmuted and never Muted); in
/// Lumi's alert otherwise. A mute says only that: a microphone it could not
/// reach is the panel's to show, as "Can't Mute" (the owner, 2026-11-11 —
/// the alert named it, and that was more than a glance needs).
///
/// What the person wants is written down **first**, and the devices moved
/// after: every hold and release tells an `audio-devices` event, which runs
/// beside this run and reads [`MUTED`] to decide whether to hold — written
/// last, a release's own event read "still muted" and held everything again.
fn switch(say: bool) -> Result<(), String> {
    let on_card = while_talking() == WhileTalking::Card;
    if wanted()? {
        set_wanted(false)?;
        release_all()?;
        draw(false)?;
        return match (say, on_card) {
            (false, _) => Ok(()),
            (true, true) => card("unmuted"),
            (true, false) => lumi::alert("Microphones on"),
        };
    }
    set_wanted(true)?;
    if let Err(said) = hold_all(&audio_devices::devices()?) {
        set_wanted(false)?;
        return Err(said);
    }
    draw(true)?;
    match (say, on_card) {
        (false, _) => Ok(()),
        (true, true) => card("muted"),
        (true, false) => lumi::alert("Microphones muted"),
    }
}

/// The key, the right-click or the menu's row: mute everything, or unmute
/// it all, and say which.
fn toggle() -> Result<(), String> {
    switch(true)
}

/// The key going down, held (`hold`): a talk begins. While muted, the
/// microphones are unmuted at once; while on, nothing moves, and the up
/// mutes them (the module note).
///
/// The talk is written down **before** the devices move, [`toggle`]'s rule:
/// the release tells an `audio-devices` event, which must read that the
/// microphones are open on purpose.
///
/// A down unmutes and draws nothing — a press with no key (the item's
/// right-click, the menu's row, which Lumi runs as a down and an up at once)
/// and a key's alike. At a key's down nobody knows whether it is tapped or
/// held, and the talking card drawn here stood a moment
/// before every tap's Unmuted (the owner, 2026-11-11). Lumi says when it is
/// a hold ([`key_held`], `held-after-ms`), and a tap's up draws the dot. Not
/// even the icon: a held run waits behind this one on its lane, and drawing
/// here (the icon, the menu, the panel told) made the down take up to
/// 210 ms — past the 200 ms the held is due at (measured 2026-11-11).
fn key_down(pair: u64) -> Result<(), String> {
    if !wanted()? {
        return set_talking(Some(Talk { pair, began_on: true }));
    }
    set_talking(Some(Talk { pair, began_on: false }))?;
    release_all()
}

/// The key still down at 200 ms (`held-after-ms`): a hold, so the talk is
/// shown — the icon's moving bars, and the card or the glow as "While
/// talking" says, whichever way the talk began. Nothing for a pair that is
/// not the talk under way.
///
/// The card or the glow first, the icon after: drawing the icon tells the
/// panel too, which reads every device, and the card waited behind it —
/// 26 to 157 ms after the held was due (measured 2026-11-11).
fn key_held(pair: u64) -> Result<(), String> {
    if talking_as(pair)?.is_none() {
        return Ok(());
    }
    match while_talking() {
        WhileTalking::Card => card("talking")?,
        WhileTalking::Glow => lumi::open_window(GLOW)?,
        WhileTalking::IconOnly => {}
    }
    draw_talking()
}

/// The key coming up: the end of the talk this pair began — muted after a
/// hold, whichever way it began; after a tap, the toggle: left on if it
/// began muted, muted if it began on. Nothing for a pair that is not the
/// talk under way.
///
/// How it ends is said by `why`: a tap that leaves the microphones on says
/// "Unmuted", one that mutes them "Muted"; a release after a hold that
/// began muted mutes them quietly, back where the person was, and one that
/// began on says "Muted", since they were on before; a key Lumi lost or a
/// shortcut gone mutes them and **says so**, since the person may still be
/// holding the key and talking; the Mac going away mutes them with nobody
/// there to tell.
fn key_up(pair: u64, held_ms: u64, why: Option<Why>) -> Result<(), String> {
    let Some(talk) = talking_as(pair)? else {
        return Ok(());
    };
    let shows = while_talking();
    // The glow goes with the talk whichever way it ended. Closed whatever
    // the setting says now: the person may have moved it mid-talk.
    lumi::close_window(GLOW)?;
    let tapped = held_ms < HOLD_MS && matches!(why, Some(Why::Released) | Some(Why::Tapped));
    if tapped && !talk.began_on {
        // A tap from muted: unmuted is where the person wanted to end up.
        set_wanted(false)?;
        set_talking(None)?;
        draw(false)?;
        return match shows {
            WhileTalking::Card => card("unmuted"),
            WhileTalking::IconOnly | WhileTalking::Glow => lumi::alert("Microphones on"),
        };
    }
    // Let go after a hold, a tap from on, or lost by Lumi: muted, the safe
    // side. Wanted written first, `switch`'s rule: every hold tells an event
    // that reads it.
    set_wanted(true)?;
    let held = hold_all(&audio_devices::devices()?);
    set_talking(None)?;
    if let Err(said) = held {
        set_wanted(false)?;
        lumi::close_window(CARD)?;
        draw(false)?;
        return Err(said);
    }
    draw(true)?;
    let ended_by_lumi = matches!(why, Some(Why::Lost) | Some(Why::Unbound) | Some(Why::Other));
    let away = why == Some(Why::Away);
    match (ended_by_lumi, talk.began_on && !away, shows) {
        (true, _, WhileTalking::Card) => card("ended"),
        (true, _, WhileTalking::IconOnly | WhileTalking::Glow) => {
            lumi::close_window(CARD)?;
            lumi::alert("Microphones muted · Push to Talk ended")
        }
        // On before, muted now: said, as a toggle that mutes is.
        (false, true, WhileTalking::Card) => card("muted"),
        (false, true, WhileTalking::IconOnly | WhileTalking::Glow) => lumi::alert("Microphones muted"),
        // Muted before and muted again: back where the person was.
        (false, false, _) => lumi::close_window(CARD),
    }
}

/// A press in the panel: what it shows next, or nothing for a press that
/// puts it away. `use:<id>` is a press on a microphone's row: that one
/// becomes the Mac's input, as in Sound settings, and stays so whatever
/// Mic Mute does after — muting moves no default.
fn panel_pressed(request: &str) -> Result<String, String> {
    if let Some(id) = request.strip_prefix("use:") {
        audio_devices::set_default(id, Scope::Input)?;
        return Ok(panel_state()?.to_string());
    }
    match request {
        "state" => Ok(panel_state()?.to_string()),
        "toggle" => {
            switch(false)?;
            Ok(panel_state()?.to_string())
        }
        "settings" => {
            lumi::close_window(PANEL)?;
            lumi::open_settings()?;
            Ok(String::new())
        }
        "close" => lumi::close_window(PANEL).map(|()| String::new()),
        other => Err(format!("Mic Mute's panel has no {other}")),
    }
}

/// The card's page: what to say, and its ask to be put away once a passing
/// state has been read — refused quietly while a talk is under way, which a
/// late timer from the last one would otherwise close.
fn card_asked(request: &str) -> Result<String, String> {
    match request {
        // The post as it was sent; a plain word kept by an earlier 0.3.0
        // build is said as that state alone.
        "state" => Ok(match storage::get(CARD_SAYS)?.map(|entry| entry.value) {
            Some(told) if told.starts_with('{') => told,
            Some(word) => json!({ "v": 1, "state": word }).to_string(),
            None => json!({ "v": 1, "state": "talking" }).to_string(),
        }),
        "done" => {
            if talking()?.is_none() {
                lumi::close_window(CARD)?;
            }
            Ok(String::new())
        }
        other => Err(format!("Mic Mute's card has no {other}")),
    }
}

struct MicMute;

impl lumi::Guest for MicMute {
    fn run_command(name: String, params: String) -> Result<String, String> {
        match name.as_str() {
            "toggle" => match hold::of(&params) {
                Some(held) if held.phase == Phase::Down => key_down(held.pair),
                Some(held) if held.phase == Phase::Held => key_held(held.pair),
                Some(held) => key_up(held.pair, held.held_ms.unwrap_or(0), held.why),
                // Lumi always says the half of the press a held command's
                // run is; none is a toggle, as before.
                None => toggle(),
            }
            .map(|()| String::new()),
            other => Err(format!("Mic Mute has no {other} command")),
        }
    }

    fn run_node(name: String, _params: String, _items: String) -> Result<String, String> {
        Err(format!("Mic Mute has no {name} node"))
    }

    fn run_ui(window: String, request: String) -> Result<String, String> {
        match window.as_str() {
            PANEL => panel_pressed(&request),
            CARD => card_asked(&request),
            _ => match menu::pressed(&window, &request).as_deref() {
                Some(TOGGLE_ROW) => toggle().map(|()| String::new()),
                _ => Err(format!("Mic Mute has no {window} window")),
            },
        }
    }

    fn on_lifecycle(event: lumi::Lifecycle) -> Result<(), String> {
        match event {
            // Its row belongs in its own icon's menu, not in Lumi's too.
            lumi::Lifecycle::Installed => {
                menu::set_shown(false)?;
                draw(false)?;
                dress()
            }
            // A talk an older version began has no up coming to this one.
            lumi::Lifecycle::Updated(_) => {
                set_talking(None)?;
                draw(wanted()?)?;
                dress()
            }
            // Lumi lets go of every hold of a removed extension's anyway;
            // this only says so first.
            lumi::Lifecycle::Uninstalling => release_all(),
        }
    }

    fn on_event(name: String, payload: String) -> Result<(), String> {
        let Some(devices) = audio_devices::changed(&name, &payload) else { return Ok(()) };
        // A microphone came, went or changed: an open panel shows it.
        tell_panel()?;
        // A talk open on purpose is not a microphone somebody unmuted.
        if !wanted()? || talking()?.is_some() {
            return Ok(());
        }
        // A microphone plugged in, or one somebody unmuted: held as wanted.
        // Refused, the person unmuted from Lumi's menu — their word stands,
        // and the icon follows it.
        if hold_all(&devices).is_err() {
            set_wanted(false)?;
            draw(false)?;
        }
        Ok(())
    }
}

lumi::register!(MicMute);
