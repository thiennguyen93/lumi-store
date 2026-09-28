//! Keyboard Test: a tab in the extension's page in Lumi's Extensions pane
//! that lights each key of a MacBook keyboard as it is pressed.
//!
//! **All of it is the page.** Key events are the page's own — the webview
//! hears them while it has focus — and the one thing kept between visits,
//! the layout picked, goes through the bridge's settings route, which
//! needs no call into this component. So the component answers every
//! export with "nothing here", and the manifest declares no capability:
//! the review sheet can say "reaches nothing outside Lumi", which is the
//! honest description of a keyboard tester.

use lumi_extension_api as lumi;

struct KeyTest;

impl lumi::Guest for KeyTest {
    fn run_command(name: String, _params: String) -> Result<String, String> {
        Err(format!("Keyboard Test has no {name} command"))
    }

    fn run_node(name: String, _params: String, _items: String) -> Result<String, String> {
        Err(format!("Keyboard Test has no {name} node"))
    }

    fn run_ui(window: String, _request: String) -> Result<String, String> {
        Err(format!("Keyboard Test's {window} page asks nothing of its code"))
    }

    fn on_lifecycle(_event: lumi::Lifecycle) -> Result<(), String> {
        Ok(())
    }
}

lumi::register!(KeyTest);
