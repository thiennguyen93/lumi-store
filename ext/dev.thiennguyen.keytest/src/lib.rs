//! Keyboard Test: a tab in the extension's page in Lumi's Extensions pane
//! that lights each key of a MacBook keyboard as it is pressed.
//!
//! **Nearly all of it is the page.** Key events are the page's own — the
//! webview hears them while it has focus — and the layout it remembers goes
//! through the bridge's settings route, which needs no call into this
//! component. The one thing the page cannot learn by itself is whether
//! Lumi's Hyper key has Caps Lock, and that is the one request answered
//! here: `lumi::hyper_key_enabled`, which costs no capability. So the
//! manifest still declares none, and the review sheet can say "reaches
//! nothing outside Lumi", the honest description of a keyboard tester.

use lumi_extension_api as lumi;

struct KeyTest;

impl lumi::Guest for KeyTest {
    fn run_command(name: String, _params: String) -> Result<String, String> {
        Err(format!("Keyboard Test has no {name} command"))
    }

    fn run_node(name: String, _params: String, _items: String) -> Result<String, String> {
        Err(format!("Keyboard Test has no {name} node"))
    }

    /// `{"kind":"hyper"}` from the Keyboard test tab, answered with
    /// `{"hyperKeyEnabled": bool}` — so the page can say how to test Caps
    /// Lock, which is never delivered as itself while the Hyper key is on.
    fn run_ui(window: String, request: String) -> Result<String, String> {
        if window != ":page:keytest" {
            return Err(format!("Keyboard Test has no {window} page"));
        }
        if !request.contains("\"hyper\"") {
            return Err("Keyboard Test's page asks only {\"kind\":\"hyper\"}".to_string());
        }
        let on = lumi::hyper_key_enabled()?;
        Ok(format!("{{\"hyperKeyEnabled\":{on}}}"))
    }

    fn on_lifecycle(_event: lumi::Lifecycle) -> Result<(), String> {
        Ok(())
    }
}

lumi::register!(KeyTest);
