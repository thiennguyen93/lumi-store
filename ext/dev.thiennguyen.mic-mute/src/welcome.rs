//! The Welcome window (`ui/welcome.html`): the tour `on_lifecycle` opens —
//! what Mic Mute does; the key, tapped or held, tried for real while the
//! window is up; the menu bar icon and its panel; and what shows while
//! talking. The other first-party tours' shape (Clipboard Manager,
//! Screenshot, Selection Bar, Gõ tiếng Việt).
//!
//! **On install, and on an update from before 0.3.0 only** (the owner,
//! 2026-11-11). 0.3.0 is where the panel, the coloured icon and the card
//! came, so somebody coming from 0.2 or 0.1 is shown them once; an update
//! after that opens nothing, since a window coming up after every update
//! would stand over whatever the person was doing for news the store's
//! changelog already says.
//!
//! The page keeps the tour itself — which step, the stage, the key through
//! Lumi's `/__lumi__/shortcuts`, the While Talking choice through
//! `/__lumi__/settings` — and asks the component only what a page cannot
//! know: why it was opened, the microphones (the panel's own answers, so the
//! stage shows the person's real ones and moves when the real key is
//! pressed), and the two ways out.

use lumi_extension_api as lumi;
use lumi::storage;
use serde_json::json;

/// The window, as the manifest names it.
pub const WELCOME: &str = "welcome";

/// The storage key holding the version an update replaced, for the page to
/// say "From 0.2.0". The page is told nothing about why the window is open,
/// so the hook writes it down and the page's first `welcome` takes it — the
/// tour opened again later from Lumi's About page is then a plain welcome.
const WELCOME_FROM: &str = "welcome.from";

/// Every request the page sends that this module answers; `state`,
/// `toggle` and `use:<id>` are the panel's, answered as the panel's are.
/// Not read by [`on_page`], whose arms are literals: a test holds this list
/// and the panel's against `ui/welcome.js`, so neither side can gain a
/// request alone.
#[cfg(test)]
const KINDS: [&str; 3] = ["welcome", "settings", "close"];

/// Whether an update from `from` opens the tour: one from a version before
/// 0.3.0. A version that does not read as one is no reason to stand a
/// window over the person's work.
pub fn opens_after_update(from: &str) -> bool {
    let mut parts = from.trim().split('.').map(|part| part.split(|c: char| !c.is_ascii_digit()).next().unwrap_or(""));
    let major = parts.next().and_then(|part| part.parse::<u64>().ok());
    let minor = parts.next().and_then(|part| part.parse::<u64>().ok());
    matches!((major, minor), (Some(0), Some(minor)) if minor < 3)
}

/// A first install: the tour, as a plain welcome.
pub fn on_install() -> Result<(), String> {
    storage::delete(WELCOME_FROM)?;
    lumi::open_window(WELCOME)
}

/// An update: the tour, told what it replaced, when that was before 0.3.0;
/// otherwise nothing.
pub fn on_update(from: &str) -> Result<(), String> {
    if !opens_after_update(from) {
        return Ok(());
    }
    let rev = storage::get(WELCOME_FROM)?.map(|entry| entry.rev);
    storage::put(WELCOME_FROM, from, rev).map_err(storage::PutError::into_message)?;
    lumi::open_window(WELCOME)
}

/// The page's own requests — one of [`KINDS`] — or `None` for one that is
/// not this module's.
pub fn on_page(request: &str) -> Option<Result<String, String>> {
    Some(match request {
        // Why the window is open: `from`, the version an update replaced,
        // taken so it is said once.
        "welcome" => (|| {
            let from = storage::get(WELCOME_FROM)?.map(|entry| entry.value).filter(|from| !from.is_empty());
            if from.is_some() {
                storage::delete(WELCOME_FROM)?;
            }
            Ok(json!({ "v": 1, "from": from, "version": env!("CARGO_PKG_VERSION") }).to_string())
        })(),
        // Out of the tour, into Mic Mute's Settings tab. A press.
        "settings" => lumi::close_window(WELCOME).and_then(|()| lumi::open_settings()).map(|()| String::new()),
        "close" => lumi::close_window(WELCOME).map(|()| String::new()),
        _ => return None,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_an_update_from_before_0_3_opens_the_tour() {
        for from in ["0.1.0", "0.2.0", "0.2.9", "0.2.0-beta.1", " 0.2.1 "] {
            assert!(opens_after_update(from), "{from} should open it");
        }
        for from in ["0.3.0", "0.3.1", "0.10.0", "1.0.0", "", "garbage", "0", "x.1.0"] {
            assert!(!opens_after_update(from), "{from} should not open it");
        }
    }

    /// Every request `welcome.js` sends, as `call("…")`.
    fn sent_by_the_page() -> Vec<String> {
        let page = include_str!("../ui/welcome.js");
        page.split("call(\"").skip(1).filter_map(|rest| rest.split('"').next()).map(str::to_string).collect()
    }

    #[test]
    fn the_page_sends_only_what_is_answered_and_everything_answered_is_sent() {
        let sent = sent_by_the_page();
        let answered: Vec<&str> = KINDS.iter().chain(crate::MICROPHONE_REQUESTS.iter()).copied().collect();
        for request in &sent {
            assert!(answered.contains(&request.as_str()), "welcome.js sends {request:?}, which nothing answers");
        }
        for request in answered {
            assert!(sent.iter().any(|sent| sent == request), "{request:?} is answered but welcome.js never sends it");
        }
    }
}
