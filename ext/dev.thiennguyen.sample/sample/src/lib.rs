//! The reference extension, and the test fixture — written against
//! `lumi-extension-api`, which is the whole point: this file is what the
//! docs tell somebody to copy, so it uses nothing the SDK does not offer.
//!
//! `translate` is the store plan's worked example: read the selection,
//! open Google Translate on it, in the language the action's `target`
//! param picked — falling back to the `defaultTarget` setting from the
//! Extensions pane, then to Vietnamese, so the three tiers of "where does
//! a value come from" are all exercised here. `spin` and `grow` exist for
//! `ext::runtime`'s tests — a guest the deadline has to stop, and one the
//! memory limiter has to refuse. Shipped in the sample on purpose: an SDK
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
        if window != "settings" {
            return Err(format!("the sample has no {window} window"));
        }
        let parsed: serde_json::Value =
            serde_json::from_str(&request).map_err(|err| format!("request: {err}"))?;
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
    let found = lumi::selection()?;
    if found.text.is_empty() {
        // The alert is the answer here, not a failure: a press with nothing
        // selected is the ordinary miss, and an error would be drawn red
        // over a desk where nothing went wrong.
        lumi::alert("Sample: nothing is selected to translate")?;
        return Ok("nothing selected".to_string());
    }
    lumi::open_url(&translate_url(&target, &found.text))?;
    Ok(format!(
        "opened translate ({target}) for {} chars, via {}",
        found.text.chars().count(),
        found.how
    ))
}

/// One spelling of the Translate address, shared by the command and the
/// window's requests so the preview can never disagree with the press.
fn translate_url(target: &str, text: &str) -> String {
    format!(
        "https://translate.google.com/?sl=auto&tl={target}&text={}&op=translate",
        utf8_percent_encode(text, NON_ALPHANUMERIC)
    )
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
