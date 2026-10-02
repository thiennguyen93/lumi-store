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
//! memory limit has to refuse — as does `nap`, a guest that waits rather
//! than computes, which only the deadline on the host's poll can stop; it
//! is left out of `manifest.toml`, so only a test's own manifest can reach
//! it. So does the window's `config`
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
            "nap" => {
                // A sleep is `subscribe-duration` and then `block` in the
                // host, where the epoch interrupt cannot reach — so this
                // never comes back unless the host's poll has a deadline.
                std::thread::sleep(std::time::Duration::MAX);
                Ok("woke up".to_string())
            }
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
        // And its Welcome window, which asks for the same `about` and
        // `open-settings` the settings page does — and the two unified
        // windows, whose band buttons ask for `titlebar-height`.
        if !["settings", ":settings", "welcome", "unified", "unified-tall"].contains(&window.as_str()) {
            return Err(format!("the sample has no {window} window"));
        }
        let parsed: serde_json::Value =
            serde_json::from_str(&request).map_err(|err| format!("request: {err}"))?;
        match parsed.get("kind").and_then(|k| k.as_str()) {
            Some("profile") => return profiles(),
            Some("about") => return about(),
            // The one piece of the person's setup that needs no capability.
            Some("hyper") => {
                let on = lumi::hyper_key_enabled()?;
                return Ok(serde_json::json!({ "hyperKeyEnabled": on }).to_string());
            }
            Some("config") => {
                let section = parsed.get("section").and_then(|s| s.as_str()).unwrap_or("");
                return config(section);
            }
            // Storage, exercised once each way: a write, a read of it, the
            // conflict a stale revision earns, and a blob round trip.
            Some("storage") => return storage(),
            // The 0.3 clipboard: a two-item board, one of them out of
            // storage, and the same pasted — which this manifest cannot
            // pay for (`input`), so the tests watch it refused.
            Some("write-all") => return write_all(),
            // A blob handed to the person as a file, under the name asked.
            Some("save-blob") => {
                let name = parsed.get("name").and_then(|n| n.as_str()).unwrap_or("sample.png");
                let blob = lumi::storage::blob_write(&[0x89, b'P', b'N', b'G'])?;
                let saved = lumi::storage::blob_save(&blob, name);
                lumi::storage::blob_delete(&blob)?;
                saved?;
                return Ok(serde_json::json!({ "saved": true }).to_string());
            }
            // A picture of an area, read back out of the store and deleted:
            // what reaches a page is the blob's size, which is how the tests
            // see that the picture went into storage rather than across.
            Some("capture") => {
                let area = lumi::screen::Rect { x: 10.0, y: 20.0, width: 30.0, height: 40.0 };
                let shot = lumi::screen::capture(lumi::screen::Target::Area(area))?;
                let bytes = lumi::storage::blob_read(&shot.blob)?;
                lumi::storage::blob_delete(&shot.blob)?;
                return Ok(serde_json::json!({
                    "bytes": bytes.len(),
                    "width": shot.width,
                    "height": shot.height,
                    "scale": shot.scale,
                    "frame": [shot.frame.x, shot.frame.y, shot.frame.width, shot.frame.height],
                })
                .to_string());
            }
            // A blob the page uploaded (`PUT /__lumi__/blob`), measured from
            // this side and deleted: how big Lumi says it is, which the
            // page compares with what it sent.
            Some("blob-size") => {
                let id = parsed.get("blob").and_then(|b| b.as_str()).unwrap_or("");
                let size = lumi::storage::blobs()?
                    .into_iter()
                    .find(|(blob, _)| blob == id)
                    .map(|(_, size)| size)
                    .ok_or_else(|| format!("no blob {id}"))?;
                lumi::storage::blob_delete(id)?;
                return Ok(serde_json::json!({ "bytes": size }).to_string());
            }
            // The unified window's band, taller or shorter, from its own
            // toolbar's buttons: answers the height it became.
            Some("titlebar-height") => {
                let asked = parsed.get("height").and_then(|h| h.as_f64()).unwrap_or(52.0);
                let height = lumi::set_titlebar_height(&window, asked)?;
                return Ok(serde_json::json!({ "height": height }).to_string());
            }
            // The person's window, then a picture of it by its id.
            Some("pick") => {
                let Some(picked) = lumi::screen::select_window()? else {
                    return Ok(serde_json::json!({ "window": null }).to_string());
                };
                let window = lumi::screen::Window { id: Some(picked.id), shadow: false };
                let shot = lumi::screen::capture(lumi::screen::Target::Window(window))?;
                lumi::storage::blob_delete(&shot.blob)?;
                return Ok(serde_json::json!({ "window": picked.id }).to_string());
            }
            // The person's area, then a picture of it: the two calls a
            // screenshot tool makes, in the order it makes them.
            Some("select") => {
                let Some(area) = lumi::screen::select_area()? else {
                    return Ok(serde_json::json!({ "area": null }).to_string());
                };
                let shot = lumi::screen::capture(lumi::screen::Target::Area(area))?;
                lumi::storage::blob_delete(&shot.blob)?;
                return Ok(serde_json::json!({
                    "area": [area.x, area.y, area.width, area.height],
                })
                .to_string());
            }
            // Lumi's permissions, the four calls: `do` is "check", "ask",
            // "request" or "open". The sample's own manifest does not declare
            // `screen`, so in the sample as shipped each one is refused by
            // name — the point of the arm is the host's tests, which stage a
            // manifest that does.
            Some("permissions") => {
                use lumi::permissions::{self, Permission, Requested, State};
                let screen = Permission::ScreenRecording;
                let answer = match parsed.get("do").and_then(|d| d.as_str()).unwrap_or("check") {
                    "ask" => permissions::ask(screen).map(|()| "asked".to_string()),
                    "request" => permissions::request(screen).map(|requested| {
                        match requested {
                            Requested::Asked => "asked",
                            Requested::AlreadyGranted => "alreadyGranted",
                            Requested::FlowEditorOpen => "flowEditorOpen",
                            Requested::NoWindow => "noWindow",
                        }
                        .to_string()
                    }),
                    "open" => permissions::open_system_settings(screen).map(|()| "opened".to_string()),
                    _ => permissions::check(screen).map(|state| {
                        match state {
                            State::Granted => "granted",
                            State::NotGranted => "notGranted",
                        }
                        .to_string()
                    }),
                }?;
                return Ok(serde_json::json!({ "permission": answer }).to_string());
            }
            // Which snippets a text is the trigger of, and each one expanded
            // — or why it was not: `within` is "active", "all" or a list of
            // profile ids.
            Some("snippets") => {
                use lumi::snippets::{self, Within};
                let text = parsed.get("text").and_then(|t| t.as_str()).unwrap_or("");
                let within = match parsed.get("within") {
                    Some(serde_json::Value::Array(ids)) => Within::Only(
                        ids.iter().filter_map(|id| id.as_str().map(str::to_string)).collect(),
                    ),
                    Some(serde_json::Value::String(all)) if all == "all" => Within::All,
                    _ => Within::Active,
                };
                let hits: Vec<serde_json::Value> = snippets::find(text, within)?
                    .into_iter()
                    .map(|hit| {
                        let expanded = snippets::expand(&hit.profile, &hit.snippet, text);
                        serde_json::json!({
                            "profile": hit.profile,
                            "snippet": hit.snippet,
                            "trigger": hit.trigger,
                            "revision": hit.revision,
                            "fixed": hit.fixed,
                            "text": expanded.as_ref().ok().map(|e| e.text.clone()),
                            "sealed": expanded.as_ref().ok().map(|e| e.sealed),
                            "error": expanded.err(),
                        })
                    })
                    .collect();
                return Ok(serde_json::json!({ "hits": hits }).to_string());
            }
            Some("paste") => {
                lumi::paste(&[vec![text_rep("pasted")]])?;
                return Ok(serde_json::json!({ "pasted": true }).to_string());
            }
            // A press on an item that starts to move: one text item, and
            // the page's choice about closing after the drop.
            Some("drag") => {
                let close = parsed.get("closeOnDrop").and_then(|c| c.as_bool()).unwrap_or(false);
                lumi::drag(&[vec![text_rep("dragged")]], close)?;
                return Ok(serde_json::json!({ "dragged": true }).to_string());
            }
            // Esc in a window: closed by name, the way it was opened.
            Some("close") => {
                lumi::close_window("settings")?;
                return Ok(serde_json::json!({ "closed": true }).to_string());
            }
            // The button the embedded Settings tab draws and the standalone
            // window hides: same door the `configure` command uses.
            Some("open-settings") => {
                lumi::open_window("settings")?;
                return Ok(serde_json::json!({ "opened": true }).to_string());
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

    /// The three moments, one each: a Welcome window after the install, a
    /// line after an update saying from what, and a web page on the way
    /// out. Every one of them is optional — `Ok(())` for all three is an
    /// extension that simply does not care, and is what most will write.
    fn on_lifecycle(event: lumi::Lifecycle) -> Result<(), String> {
        match event {
            // An ordinary declared window: the manifest's `[[window]]` is
            // the grant, exactly as for the `configure` command.
            lumi::Lifecycle::Installed => lumi::open_window("welcome"),
            // `from` is the version the manifest said before; the new one is
            // this build's own manifest, which the component does not read.
            lumi::Lifecycle::Updated(from) => {
                lumi::alert(&format!("Sample was updated from {from}. Thanks for keeping it."))
            }
            // No window here — the files go the moment this returns, and
            // Lumi refuses the open by name. A page in the browser is where
            // an uninstall survey belongs; this one costs `applications`
            // and `network`, both already in the manifest for `translate`.
            lumi::Lifecycle::Uninstalling => lumi::open_url(
                "https://lumikeys.app/docs/extensions?uninstalled=dev.thiennguyen.sample",
            ),
        }
    }

    /// The sample asks for no events, so Lumi never calls this — except
    /// Lumi's own tests, which hand it one and read back what it kept, and
    /// try a paste from here to watch it refused.
    fn on_event(name: String, payload: String) -> Result<(), String> {
        if name == "paste" {
            return lumi::paste(&[vec![text_rep(&payload)]]);
        }
        if name == "capture" {
            return lumi::screen::capture(lumi::screen::Target::Display).map(|_| ());
        }
        lumi::storage::put("last-event", &format!("{name} {payload}"), None)
            .map(|_| ())
            .map_err(lumi::storage::PutError::into_message)
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
fn text_rep(text: &str) -> lumi::Rep {
    lumi::Rep {
        uti: "public.utf8-plain-text".to_string(),
        data: lumi::Data::Text(text.to_string()),
    }
}

fn write_all() -> Result<String, String> {
    let blob = lumi::storage::blob_write(&[0x89, b'P', b'N', b'G'])?;
    let written = lumi::write_clipboard(&[
        vec![text_rep("first")],
        vec![
            lumi::Rep {
                uti: "public.png".to_string(),
                data: lumi::Data::Blob(blob.clone()),
            },
            lumi::Rep {
                uti: "public.data".to_string(),
                data: lumi::Data::Bytes(vec![7; 3]),
            },
        ],
    ]);
    lumi::storage::blob_delete(&blob)?;
    written?;
    Ok(serde_json::json!({ "written": 2 }).to_string())
}

fn storage() -> Result<String, String> {
    use lumi::storage::{self, PutError};
    let first = storage::put("greeting", "xin chào", None).map_err(PutError::into_message)?;
    let read = storage::get("greeting")?.ok_or("the write was not there")?;
    let stale = storage::put("greeting", "again", None);
    let blob = storage::blob_write(&[1, 2, 3])?;
    let back = storage::blob_read(&blob)?;
    storage::blob_delete(&blob)?;
    storage::delete("greeting")?;
    Ok(serde_json::json!({
        "rev": first,
        "value": read.value,
        "conflict": stale == Err(PutError::Conflict),
        "blob": back,
        "keys": storage::keys("")?,
    })
    .to_string())
}

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
