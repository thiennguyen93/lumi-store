//! The reference extension, and the test fixture — written against
//! `lumi-extension-api`, which is the whole point: this file is what the
//! docs tell somebody to copy, so it uses nothing the SDK does not offer.
//!
//! `translate` is the store plan's worked example: read the selection,
//! open Google Translate on it, in the language the action's `target`
//! param picked — falling back to the `defaultTarget` setting from the
//! Extensions pane, then to Vietnamese, so the three tiers of "where does
//! a value come from" are all exercised here. `spin` and `grow` exist for
//! Lumi's own sandbox tests — a guest the deadline has to stop, and one the
//! memory limit has to refuse — and so does the window's `config`
//! request, which reads a part of the person's setup that this manifest
//! deliberately does not ask for, so the tests can watch it refused. Shipped in the sample on purpose: an SDK
//! example that only shows the happy path teaches nobody what a trap
//! looks like.

use lumi_extension_api as lumi;
use percent_encoding::{utf8_percent_encode, NON_ALPHANUMERIC};

struct Sample;

impl lumi::Guest for Sample {
    fn run_command(name: String, params: String) -> Result<String, String> {
        match name.as_str() {
            "translate" => translate(&params),
            "configure" => {
                // One line is the whole feature: the window is declared in
                // the manifest, its files shipped in the package, and this
                // call may only name what was declared.
                lumi::open_window("settings")?;
                Ok("opened the settings window".to_string())
            }
            "spin" => loop {
                // Nothing but compute, so nothing yields: the epoch
                // interrupt is the only thing that can end this, which is
                // the point.
                std::hint::black_box(0u64);
            },
            "grow" => {
                // Doubling pushes past any limit fast; the limiter refuses
                // the grow and the allocation error surfaces as a trap.
                let mut hoard: Vec<Vec<u8>> = Vec::new();
                loop {
                    hoard.push(vec![0u8; 16 * 1024 * 1024]);
                    std::hint::black_box(&hoard);
                }
            }
            other => Err(format!("the sample has no {other} command")),
        }
    }

    fn run_node(name: String, params: String, items: String) -> Result<String, String> {
        match name.as_str() {
            "shout" => shout(&params, &items),
            other => Err(format!("the sample has no {other} node")),
        }
    }

    /// The window's half of the dialect: the page posts a JSON request to
    /// `/__lumi__/call` and this answers it. The strings are the sample's
    /// own convention — the host carries them opaquely, which is the
    /// point: an extension and its UI agree between themselves.
    fn run_ui(window: String, request: String) -> Result<String, String> {
        // The same page answers in two places: its own window, and the
        // Settings tab of the sample's page in Lumi's Extensions pane,
        // where Lumi names it `:settings`. A colon is outside every window
        // name, so the two can never be confused.
        if window != "settings" && window != ":settings" {
            return Err(format!("the sample has no {window} window"));
        }
        let parsed: serde_json::Value =
            serde_json::from_str(&request).map_err(|err| format!("request: {err}"))?;
        match parsed.get("kind").and_then(|k| k.as_str()) {
            Some("profile") => return profiles(),
            Some("about") => return about(),
            Some("config") => {
                let section = parsed.get("section").and_then(|s| s.as_str()).unwrap_or("");
                return config(section);
            }
            _ => {}
        }
        let text = parsed.get("text").and_then(|t| t.as_str()).unwrap_or("");
        let target = lumi::setting("defaultTarget")
            .filter(|t| !t.is_empty())
            .unwrap_or_else(|| "vi".to_string());
        match parsed.get("kind").and_then(|k| k.as_str()) {
            // What the translate command WOULD open, without opening it:
            // the preview costs no capability at all.
            Some("preview") => Ok(serde_json::json!({ "url": translate_url(&target, text) })
                .to_string()),
            // And the real thing, from a button: the open goes through the
            // wasm's own `open.url`, where `applications` (+`network` for
            // the web address) is checked like anywhere else — the window
            // itself could never reach the browser.
            Some("translate") => {
                lumi::open_url(&translate_url(&target, text))?;
                Ok(serde_json::json!({ "opened": true }).to_string())
            }
            other => Err(format!("the sample's window has no {other:?} request")),
        }
    }
}

fn translate(params: &str) -> Result<String, String> {
    // The three tiers, nearest first: what this binding's field says, what
    // the Extensions pane says, what the sample ships with.
    let target = param(params, "target")
        .or_else(|| lumi::setting("defaultTarget").filter(|t| !t.is_empty()))
        .unwrap_or_else(|| "vi".to_string());
    // Which of Google Translate's four tabs to open. Only `translate` takes
    // text: the other three want a file uploaded or an address typed on the
    // page itself, so they open on that tab with the target language set and
    // read no selection — asking for one would spend a ⌘C for nothing.
    let op = param(params, "op").unwrap_or_else(|| "translate".to_string());
    // The `also` multiselect: every language to open besides `target`, one
    // tab each. The first tab is always `target`, so the list is the whole
    // set of tabs in order.
    let languages = languages(&target, params);
    if op != "translate" {
        for language in &languages {
            let Some(url) = mode_url(&op, language) else {
                return Err(format!("Google Translate has no {op:?} tab"));
            };
            lumi::open_url(&url)?;
        }
        return Ok(format!("opened translate {op} ({})", languages.join(", ")));
    }
    let found = lumi::selection()?;
    if found.text.is_empty() {
        // The alert is the answer here, not a failure: a press with nothing
        // selected is the ordinary miss, and an error would be drawn red
        // over a desk where nothing went wrong.
        lumi::alert("Sample: nothing is selected to translate")?;
        return Ok("nothing selected".to_string());
    }
    for language in &languages {
        lumi::open_url(&translate_url(language, &found.text))?;
    }
    Ok(format!(
        "opened translate ({}) for {} chars, via {}",
        languages.join(", "),
        found.text.chars().count(),
        found.how
    ))
}

/// Which profile the person is in, for the window's header line.
///
/// Only for the words on the page: the sample's one setting is declared
/// `scope = "profile"`, so Lumi already hands `lumi::setting` the live
/// profile's value and saves the window's choice under it. The window
/// uses this to say whose value it is editing. Mapped by hand into the
/// window's JSON because the dialect with the page is the sample's own,
/// not the SDK's.
fn profiles() -> Result<String, String> {
    let book = lumi::profiles()?;
    let active = book.active_profile().map(|p| p.name.clone());
    Ok(serde_json::json!({
        "active": book.active,
        "activeName": active,
        "count": book.profiles.len(),
    })
    .to_string())
}

/// Which Lumi the window is running in, for its footer.
///
/// Free of capability — the version and the edition are nobody's content.
/// The edition is only worth words when it is Pro: Lumi itself never
/// labels a free copy, and an extension that did would be advertising on
/// Lumi's behalf.
fn about() -> Result<String, String> {
    let about = lumi::about();
    let edition = match lumi::license() {
        lumi::Edition::Pro => "pro",
        lumi::Edition::Free => "free",
        lumi::Edition::Inactive => "inactive",
    };
    Ok(serde_json::json!({
        "version": about.version,
        "homepage": about.homepage,
        "edition": edition,
    })
    .to_string())
}

/// One part of the person's setup, as Lumi hands it over — the fixture
/// for Lumi's own tests. The shipped manifest does not declare `config`,
/// so from the real window this is refused by name; a test stages the
/// same component under a manifest that does, and watches it answer.
fn config(section: &str) -> Result<String, String> {
    let value = match section {
        "settings" => lumi::config::settings(),
        "shortcuts" => lumi::config::shortcuts(),
        "snippets" => lumi::config::snippets(),
        "hyperKey" => lumi::config::hyper_key(),
        "doubleTap" => lumi::config::double_tap(),
        "fnKey" => lumi::config::fn_key(),
        other => return Err(format!("no {other:?} part of Lumi's settings")),
    }?;
    Ok(value.to_string())
}

/// `target` first, then each `also` language that is not already there.
///
/// A multiselect arrives as a JSON array in a string, because every param
/// is a string — so it is parsed, and anything that is not an array of
/// strings reads as nothing ticked. The params come out of `config.json`,
/// which anybody can edit, so an entry is kept only if it is one of the
/// codes the manifest offers: a value pasted into a URL is a value that can
/// carry its own `&op=` with it.
fn languages(target: &str, params: &str) -> Vec<String> {
    const OFFERED: [&str; 3] = ["vi", "en", "ja"];
    let also: Vec<String> = param(params, "also")
        .and_then(|raw| serde_json::from_str(&raw).ok())
        .unwrap_or_default();
    let mut languages = vec![target.to_string()];
    for language in also {
        if OFFERED.contains(&language.as_str()) && !languages.contains(&language) {
            languages.push(language);
        }
    }
    languages
}

/// One spelling of the Translate address, shared by the command and the
/// window's requests so the preview can never disagree with the press.
fn translate_url(target: &str, text: &str) -> String {
    format!(
        "https://translate.google.com/?sl=auto&tl={}&text={}&op=translate",
        utf8_percent_encode(target, NON_ALPHANUMERIC),
        utf8_percent_encode(text, NON_ALPHANUMERIC)
    )
}

/// One of Google Translate's tabs that take no text in the address:
/// documents, images and websites. The op is matched against the three the
/// manifest offers rather than pasted into the URL, because a param is a
/// string anybody can write into `config.json`.
fn mode_url(op: &str, target: &str) -> Option<String> {
    let op = match op {
        "docs" | "images" | "websites" => op,
        _ => return None,
    };
    Some(format!(
        "https://translate.google.com/?sl=auto&tl={}&op={op}",
        utf8_percent_encode(target, NON_ALPHANUMERIC)
    ))
}

/// The reference node: upper-case each item's `text`, tack the suffix on.
/// An item without a `text` string passes through untouched — a node that
/// dropped it would kill branches its author never aimed at.
fn shout(params: &str, items: &str) -> Result<String, String> {
    let params: serde_json::Value =
        serde_json::from_str(params).map_err(|err| format!("params: {err}"))?;
    let suffix = params.get("suffix").and_then(|v| v.as_str()).unwrap_or("");
    let mut items: Vec<serde_json::Value> =
        serde_json::from_str(items).map_err(|err| format!("items: {err}"))?;
    for item in &mut items {
        if let Some(text) = item.get("text").and_then(|v| v.as_str()) {
            let louder = format!("{}{suffix}", text.to_uppercase());
            item["text"] = serde_json::Value::String(louder);
        }
    }
    serde_json::to_string(&items).map_err(|err| format!("answer: {err}"))
}

/// One string field out of the params JSON.
fn param(params: &str, name: &str) -> Option<String> {
    let parsed: serde_json::Value = serde_json::from_str(params).ok()?;
    parsed.get(name)?.as_str().map(|s| s.to_string())
}

lumi::register!(Sample);
