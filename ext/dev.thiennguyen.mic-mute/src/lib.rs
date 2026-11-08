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
//! **An input Lumi cannot mute is said, never shown as muted**: an iPhone
//! used as a microphone has no mute Lumi can set, and a volume of 0 is not
//! silence, so the alert names it.

use lumi::audio_devices::{self, Device, Scope, Transport};
use lumi::{menu, menu_bar_item, storage};
use lumi_extension_api as lumi;

/// The storage key for whether the person wants every microphone muted:
/// `"true"` while they do.
const MUTED: &str = "muted";

/// The row in the icon's menu that switches it.
const TOGGLE_ROW: &str = "toggle";

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

/// Whether the person's setting mutes virtual microphones too.
fn virtual_too() -> bool {
    lumi::settings().get("virtual").and_then(|value| value.as_str()) == Some("true")
}

/// Whether `device` is one Mic Mute mutes: an input Lumi can mute, and a
/// virtual one only with the setting on.
fn mutes(device: &Device, virtual_too: bool) -> bool {
    device.input.as_ref().is_some_and(|side| side.mute_settable) && (virtual_too || device.transport != Transport::Virtual)
}

/// An input that is a microphone the person would expect muted but Lumi
/// cannot mute — said, so it is never mistaken for muted.
fn cannot_mute(device: &Device) -> bool {
    device.input.as_ref().is_some_and(|side| !side.mute_settable) && device.transport != Transport::Virtual
}

/// Hold every input Mic Mute mutes that is not muted as held already. The
/// names of the microphones that could not be muted. A refusal because the
/// person unmuted from Lumi's menu is an error: their word stands.
fn hold_all(devices: &[Device]) -> Result<Vec<String>, String> {
    let virtual_too = virtual_too();
    let mut missed = Vec::new();
    for device in devices {
        if mutes(device, virtual_too) {
            let side = device.input.as_ref().expect("an input, by `mutes`");
            if side.held && side.as_held {
                continue;
            }
            if let Err(said) = audio_devices::hold_muted(&device.id, Scope::Input) {
                match audio_devices::refusal(&said) {
                    Some("refused") => return Err(said),
                    // Gone since it was listed: nothing to say.
                    Some("not-found") => {}
                    _ => missed.push(device.name.clone()),
                }
            }
        } else if cannot_mute(device) {
            missed.push(device.name.clone());
        }
    }
    Ok(missed)
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

/// The icon, its tooltip and its menu's row, for `muted`.
fn draw(muted: bool) -> Result<(), String> {
    let (icon, tooltip) = if muted {
        ("mic-off", "Microphones muted — ⌥⌘M to unmute")
    } else {
        ("mic", "Microphones on — ⌥⌘M to mute")
    };
    menu_bar_item::set(&menu_bar_item::Item::icon(icon).tooltip(tooltip))?;
    menu::set(&[menu::Entry::check(TOGGLE_ROW, "Mute Every Microphone", muted)])
}

/// The key, the right-click or the menu's row: mute everything, or unmute
/// it all.
///
/// What the person wants is written down **first**, and the devices moved
/// after: every hold and release tells an `audio-devices` event, which runs
/// beside this run and reads [`MUTED`] to decide whether to hold — written
/// last, a release's own event read "still muted" and held everything again.
fn toggle() -> Result<(), String> {
    if wanted()? {
        set_wanted(false)?;
        release_all()?;
        draw(false)?;
        return lumi::alert("Microphones on");
    }
    set_wanted(true)?;
    let missed = match hold_all(&audio_devices::devices()?) {
        Ok(missed) => missed,
        Err(said) => {
            set_wanted(false)?;
            return Err(said);
        }
    };
    draw(true)?;
    if missed.is_empty() {
        lumi::alert("Microphones muted")
    } else {
        lumi::alert(&format!("Microphones muted — {} can't be muted", missed.join(", ")))
    }
}

struct MicMute;

impl lumi::Guest for MicMute {
    fn run_command(name: String, _params: String) -> Result<String, String> {
        match name.as_str() {
            "toggle" => toggle().map(|()| String::new()),
            other => Err(format!("Mic Mute has no {other} command")),
        }
    }

    fn run_node(name: String, _params: String, _items: String) -> Result<String, String> {
        Err(format!("Mic Mute has no {name} node"))
    }

    fn run_ui(window: String, request: String) -> Result<String, String> {
        match menu::pressed(&window, &request).as_deref() {
            Some(TOGGLE_ROW) => toggle().map(|()| String::new()),
            _ => Err(format!("Mic Mute has no {window} window")),
        }
    }

    fn on_lifecycle(event: lumi::Lifecycle) -> Result<(), String> {
        match event {
            // Its row belongs in its own icon's menu, not in Lumi's too.
            lumi::Lifecycle::Installed => {
                menu::set_shown(false)?;
                draw(false)
            }
            lumi::Lifecycle::Updated(_) => draw(wanted()?),
            // Lumi lets go of every hold of a removed extension's anyway;
            // this only says so first.
            lumi::Lifecycle::Uninstalling => release_all(),
        }
    }

    fn on_event(name: String, payload: String) -> Result<(), String> {
        let Some(devices) = audio_devices::changed(&name, &payload) else { return Ok(()) };
        if !wanted()? {
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
