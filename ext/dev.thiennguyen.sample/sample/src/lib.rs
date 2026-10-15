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
            // A panel that opens in the background (`focus = false`) at the
            // bottom-right corner: the keys stay where the person was typing.
            "card" => {
                lumi::open_window("card")?;
                Ok("{}".to_string())
            }
            // A panel beside the selection, placed by Lumi: what is selected
            // is posted to its kept page first, so it is on the page in the
            // panel's first frame, then the panel opens next to it.
            "peek" => peek(&params),
            // The page does the rest: the hold is asked for over the bridge,
            // and nothing of it reaches this component.
            "hold" | "hold-panel" => {
                lumi::open_window(&name)?;
                Ok("{}".to_string())
            }
            "configure" => {
                // One line is the whole feature: the window is declared in
                // the manifest, its files shipped in the package, and this
                // call may only name what was declared.
                lumi::open_window("settings")?;
                Ok("opened the settings window".to_string())
            }
            // What a yes unlocks is the extension's to decide; here it is
            // only the sentence that says which it was.
            "confirm" => {
                if !lumi::owner::available()? {
                    return Ok("this Mac cannot ask: no password is set".to_string());
                }
                Ok(if lumi::owner::authenticate("try the owner check")? {
                    "confirmed: it is you".to_string()
                } else {
                    "not confirmed".to_string()
                })
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
        // A press on one of the sample's rows in Lumi's menu bar menu, which
        // arrives here as the window `:menu`.
        if let Some(id) = lumi::menu::pressed(&window, &request) {
            return menu_pressed(&id).map(|()| String::new());
        }
        // The same page answers in two places: its own window, and the
        // Settings tab of the sample's page in Lumi's Extensions pane,
        // where Lumi names it `:settings`. A colon is outside every window
        // name, so the two can never be confused.
        // And its Welcome window, which asks for the same `about` and
        // `open-settings` the settings page does — and the two unified
        // windows, whose band buttons ask for `titlebar-height`.
        // And the background card, whose Close asks for `close-card`, and
        // whose "Load ahead when Lumi starts" reads and sets the switch Lumi
        // keeps over loading it ahead (`preload`, `set-preload`) — the one
        // the sample's Permissions sheet shows too.
        if window == "card" {
            return match serde_json::from_str::<serde_json::Value>(&request)
                .ok()
                .and_then(|parsed| parsed.get("kind").and_then(|k| k.as_str()).map(str::to_string))
                .as_deref()
            {
                Some("close-card") => lumi::close_window("card").map(|()| "{}".to_string()),
                Some("preload") => preload_state(),
                Some("set-preload") => {
                    let on = serde_json::from_str::<serde_json::Value>(&request)
                        .ok()
                        .and_then(|parsed| parsed.get("on").and_then(|on| on.as_bool()))
                        .ok_or_else(|| "set-preload needs on, true or false".to_string())?;
                    lumi::set_preload_enabled(on)?;
                    preload_state()
                }
                _ => Err("the card asks for close-card, preload or set-preload".to_string()),
            };
        }
        // The peek panel's buttons — each a transform's id, or the one for
        // the snippet the selection is a trigger of — and its search field.
        if window == "peek" {
            let parsed: serde_json::Value =
                serde_json::from_str(&request).map_err(|err| format!("request: {err}"))?;
            let id = parsed.get("id").and_then(|id| id.as_str());
            return match (parsed.get("kind").and_then(|k| k.as_str()), id) {
                (Some("apply"), Some(id)) => peek_apply(id),
                (Some("snippet"), _) => peek_snippet(),
                (Some("search"), _) => peek_search(parsed.get("query").and_then(|q| q.as_str()).unwrap_or("")),
                (Some("translate"), _) => peek_translate(),
                (Some("summarize"), _) => peek_summarize(),
                (Some("stop"), _) => {
                    let id = parsed.get("call").and_then(|id| id.as_u64()).unwrap_or(0);
                    Ok(serde_json::json!({ "stopped": lumi::ai::cancel(id)? }).to_string())
                }
                (Some("prepare"), _) => {
                    let field = |name: &str| parsed.get(name).and_then(|v| v.as_str()).unwrap_or("").to_string();
                    peek_prepare(&field("source"), &field("target"))
                }
                _ => Err("the peek panel asks for apply, with a transform's id, snippet, search, translate, prepare, summarize or stop"
                    .to_string()),
            };
        }
        if !["settings", ":settings", "welcome", "unified", "unified-tall"].contains(&window.as_str()) {
            return Err(format!("the sample has no {window} window"));
        }
        let parsed: serde_json::Value =
            serde_json::from_str(&request).map_err(|err| format!("request: {err}"))?;
        match parsed.get("kind").and_then(|k| k.as_str()) {
            Some("profile") => return profiles(),
            // Lumi's transforms and the selection's write half, one call each,
            // for the tests to drive: the list, one transform by id, whether
            // the selection can be written over, and a replacement of it.
            Some("transforms") => {
                let all: Vec<serde_json::Value> = lumi::transforms::all()?
                    .into_iter()
                    .map(|t| serde_json::json!({ "id": t.id, "label": t.label, "group": t.group }))
                    .collect();
                return Ok(serde_json::Value::Array(all).to_string());
            }
            Some("transform") => {
                let id = parsed.get("id").and_then(|i| i.as_str()).unwrap_or("");
                let text = parsed.get("text").and_then(|t| t.as_str()).unwrap_or("");
                return Ok(serde_json::json!({ "text": lumi::transforms::apply(id, text)? }).to_string());
            }
            // The translator, one call each, for the tests to drive.
            Some("translation") => {
                let ready = readiness_word;
                let guesses: Vec<serde_json::Value> = lumi::translation::detect("Xin chào")?
                    .into_iter()
                    .map(|guess| serde_json::json!({ "language": guess.language, "confidence": guess.confidence }))
                    .collect();
                return Ok(serde_json::json!({
                    "languages": lumi::translation::languages()?,
                    "preferred": lumi::translation::preferred()?,
                    "en-vi": ready(lumi::translation::status("en", "vi")?),
                    "en-de": ready(lumi::translation::status("en", "de")?),
                    "guesses": guesses,
                })
                .to_string());
            }
            Some("translate") => {
                let field = |name: &str| parsed.get(name).and_then(|v| v.as_str()).map(str::to_string);
                let done = lumi::translation::translate(&lumi::translation::Request {
                    text: field("text").unwrap_or_default(),
                    source: field("source"),
                    target: field("target"),
                    quality: if field("quality").as_deref() == Some("best") {
                        lumi::translation::Quality::Best
                    } else {
                        lumi::translation::Quality::Fast
                    },
                })?;
                return Ok(serde_json::json!({ "text": done.text, "source": done.source, "target": done.target }).to_string());
            }
            Some("prepare") => {
                let field = |name: &str| parsed.get(name).and_then(|v| v.as_str()).unwrap_or("").to_string();
                let readiness = lumi::translation::prepare(&field("source"), &field("target"))?;
                return Ok(serde_json::json!({ "readiness": readiness_word(readiness) }).to_string());
            }
            // The selection-watch switch, read, moved and shared — for the
            // tests to see what each costs.
            Some("watching") => {
                return Ok(serde_json::json!({ "watching": lumi::selection_watching()? }).to_string());
            }
            Some("set-watching") => {
                let on = parsed.get("on").and_then(|on| on.as_bool()).unwrap_or(true);
                lumi::set_selection_watching(on)?;
                return Ok("{}".to_string());
            }
            Some("watchers") => {
                return Ok(serde_json::json!({ "watchers": lumi::selection_watchers()? }).to_string());
            }
            Some("editable") => {
                return Ok(serde_json::json!({ "editable": lumi::selection_editable()? }).to_string());
            }
            Some("replace") => {
                let expected = parsed.get("expected").and_then(|e| e.as_str()).unwrap_or("");
                let replacement = parsed.get("replacement").and_then(|r| r.as_str()).unwrap_or("");
                return Ok(serde_json::json!({ "how": lumi::replace_selection(expected, replacement)? }).to_string());
            }
            Some("replace-and-select") => {
                let expected = parsed.get("expected").and_then(|e| e.as_str()).unwrap_or("");
                let replacement = parsed.get("replacement").and_then(|r| r.as_str()).unwrap_or("");
                let done = lumi::replace_selection_and_select(expected, replacement)?;
                return Ok(serde_json::json!({ "how": done.how, "selected": done.selected }).to_string());
            }
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
            // A blob written into a declared folder, as the page names it —
            // the folder and the file name are the tests' to choose, so they
            // can see an undeclared folder refused and a name checked.
            Some("folder-write") => {
                let folder = parsed.get("folder").and_then(|f| f.as_str()).unwrap_or("saves");
                let name = parsed.get("name").and_then(|n| n.as_str()).unwrap_or("sample {date}.png");
                let blob = lumi::storage::blob_write(&[0x89, b'P', b'N', b'G'])?;
                let written = lumi::folders::write(folder, name, &blob);
                lumi::storage::blob_delete(&blob)?;
                return match written {
                    Ok(()) => Ok(serde_json::json!({ "written": true }).to_string()),
                    Err(lumi::folders::Problem::NotChosen) => Ok(serde_json::json!({ "problem": "not-chosen" }).to_string()),
                    Err(lumi::folders::Problem::Gone) => Ok(serde_json::json!({ "problem": "gone" }).to_string()),
                    Err(lumi::folders::Problem::Refused(said)) => Err(said),
                };
            }
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
            // The same area, as a JPEG at screen size and at the quality
            // the page asked for — the encoding is what the tests read off
            // the host's log, and a quality of 0 is how they see it clamped.
            Some("capture-as") => {
                let area = lumi::screen::Rect { x: 10.0, y: 20.0, width: 30.0, height: 40.0 };
                let quality = parsed.get("quality").and_then(|q| q.as_u64()).unwrap_or(85).min(255) as u8;
                let shot = lumi::screen::capture_as(
                    lumi::screen::Target::Area(area),
                    lumi::screen::Encoding {
                        format: lumi::screen::Format::Jpeg,
                        quality,
                        resolution: lumi::screen::Resolution::Points,
                    },
                )?;
                lumi::storage::blob_delete(&shot.blob)?;
                return Ok(serde_json::json!({ "width": shot.width, "height": shot.height }).to_string());
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
            // This window at the size the page asked, through the component
            // — the size it became is what reaches the page.
            Some("size") => {
                let width = parsed.get("width").and_then(|w| w.as_f64()).unwrap_or(480.0);
                let height = parsed.get("height").and_then(|h| h.as_f64()).unwrap_or(360.0);
                let size = lumi::set_size(&window, width, height)?;
                return Ok(serde_json::json!({ "width": size.width, "height": size.height }).to_string());
            }
            // A picture of the page's own, read: the blob is written, read
            // with what the page asked for, and deleted. What reaches the
            // page is the reading in brief, which is all the tests need.
            Some("ocr") => {
                let blob = lumi::storage::blob_write(&[0x89, b'P', b'N', b'G'])?;
                let read = lumi::ocr::read(&lumi::ocr::Source::Blob(blob.clone()), &ocr_options(&parsed));
                lumi::storage::blob_delete(&blob)?;
                return Ok(reading_json(&read?).to_string());
            }
            // The same area `capture` takes, read and never kept.
            Some("ocr-screen") => {
                let area = lumi::screen::Rect { x: 10.0, y: 20.0, width: 30.0, height: 40.0 };
                let reading = lumi::ocr::read(
                    &lumi::ocr::Source::Screen(lumi::screen::Target::Area(area)),
                    &ocr_options(&parsed),
                )?;
                return Ok(reading_json(&reading).to_string());
            }
            Some("ocr-languages") => {
                return Ok(serde_json::json!(lumi::ocr::languages(lumi::ocr::Level::Accurate)?).to_string());
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
            // The window in front, named, then captured by the id it came
            // back with — so the name is the picture's whatever comes to
            // the front in between.
            Some("front-named") => {
                let Some(front) = lumi::screen::about_window(None)? else {
                    return Ok(serde_json::json!({ "window": null }).to_string());
                };
                let window = lumi::screen::Window { id: Some(front.id), shadow: false };
                let shot = lumi::screen::capture(lumi::screen::Target::Window(window))?;
                lumi::storage::blob_delete(&shot.blob)?;
                return Ok(serde_json::json!({
                    "window": front.id,
                    "app": front.app,
                    "bundleId": front.bundle_id,
                    "title": front.title,
                })
                .to_string());
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
            // "request" or "open" — the Permissions part of the settings page
            // (`ui/app.js`). The manifest declares `screen`, the capability
            // Screen Recording is for; without it each call is refused by
            // name, which the host's tests stage a manifest to watch.
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
            // The same drag, its file named: `names` from the request.
            Some("drag-named") => {
                let names: Vec<Option<String>> = parsed
                    .get("names")
                    .and_then(|n| n.as_array())
                    .map(|n| n.iter().map(|name| name.as_str().map(str::to_string)).collect())
                    .unwrap_or_default();
                lumi::drag_named(&[vec![text_rep("dragged")]], &names, false)?;
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
            // The menu first and the window regardless: a refused tree is a
            // line in Lumi's log, not a reason to skip the welcome.
            lumi::Lifecycle::Installed => {
                let drawn = draw_menu();
                lumi::open_window("welcome")?;
                drawn
            }
            // `from` is the version the manifest said before; the new one is
            // this build's own manifest, which the component does not read.
            lumi::Lifecycle::Updated(from) => {
                let drawn = draw_menu();
                lumi::alert(&format!("Sample was updated from {from}. Thanks for keeping it."))?;
                drawn
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
        // The person moved the Preload switch on the Permissions
        // sheet: the card is told, kept and loaded ahead or not, so its own
        // switch follows.
        if name == "preload-enabled" {
            return lumi::post("card", &preload_state()?).map(|_| ());
        }
        if name == "selection" {
            return peek_beside(&payload);
        }
        if name == "paste" {
            return lumi::paste(&[vec![text_rep(&payload)]]);
        }
        if name == "capture" {
            return lumi::screen::capture(lumi::screen::Target::Display).map(|_| ());
        }
        // A blob is the extension's own: read from an event, the reading is
        // kept where the test can find it. The screen is a capture, and
        // refused here exactly as `capture` is.
        if name == "ocr" {
            let blob = lumi::storage::blob_write(&[0x89, b'P', b'N', b'G'])?;
            let read = lumi::ocr::read(&lumi::ocr::Source::Blob(blob.clone()), &lumi::ocr::Options::default());
            lumi::storage::blob_delete(&blob)?;
            return lumi::storage::put("last-event", &read?.text, None)
                .map(|_| ())
                .map_err(lumi::storage::PutError::into_message);
        }
        if name == "ocr-screen" {
            let source = lumi::ocr::Source::Screen(lumi::screen::Target::Display);
            return lumi::ocr::read(&source, &lumi::ocr::Options::default()).map(|_| ());
        }
        lumi::storage::put("last-event", &format!("{name} {payload}"), None)
            .map(|_| ())
            .map_err(lumi::storage::PutError::into_message)
    }
}

/// The switch over loading the card ahead, as the card draws it — `kind` so
/// the same object arrives as a `lumi:message`.
fn preload_state() -> Result<String, String> {
    Ok(serde_json::json!({ "kind": "preload", "on": lumi::preload_enabled()? }).to_string())
}

/// `ocr.read`'s options from a page's request: every field the page
/// leaves out is the default.
fn ocr_options(parsed: &serde_json::Value) -> lumi::ocr::Options {
    let mut options = lumi::ocr::Options::default();
    if parsed.get("level").and_then(|l| l.as_str()) == Some("fast") {
        options.level = lumi::ocr::Level::Fast;
    }
    if let Some(languages) = parsed.get("languages").and_then(|l| l.as_array()) {
        options.languages = languages.iter().filter_map(|l| l.as_str().map(str::to_string)).collect();
    }
    if let Some(correct) = parsed.get("correct").and_then(|c| c.as_bool()) {
        options.language_correction = correct;
    }
    options.minimum_text_height = parsed.get("min").and_then(|m| m.as_f64()).map(|m| m as f32);
    options.alternatives = parsed.get("alternatives").and_then(|a| a.as_u64()).unwrap_or(0).min(255) as u8;
    options.words = parsed.get("words").and_then(|w| w.as_bool()).unwrap_or(false);
    options
}

fn reading_json(reading: &lumi::ocr::Reading) -> serde_json::Value {
    serde_json::json!({
        "text": reading.text,
        "size": [reading.width, reading.height],
        "frame": reading.frame.map(|f| [f.x, f.y, f.width, f.height]),
        "scale": reading.scale,
        "truncated": reading.truncated,
        "lines": reading.lines.iter().map(|line| serde_json::json!({
            "text": line.text,
            "frame": [line.frame.x, line.frame.y, line.frame.width, line.frame.height],
            "corners": line.corners.iter().map(|p| [p.x, p.y]).collect::<Vec<_>>(),
            "words": line.words.iter().map(|w| w.text.clone()).collect::<Vec<_>>(),
            "alternatives": line.alternatives.len(),
        })).collect::<Vec<_>>(),
    })
}

/// The languages the menu offers, as Google Translate's codes and the
/// menu's words.
const MENU_TARGETS: &[(&str, &str)] = &[("vi", "Vietnamese"), ("en", "English"), ("ja", "Japanese")];

/// The storage key holding the language the menu translates into.
const MENU_TARGET: &str = "menu-target";

fn menu_target() -> String {
    lumi::storage::get(MENU_TARGET)
        .ok()
        .flatten()
        .map(|entry| entry.value)
        .unwrap_or_else(|| "vi".to_string())
}

/// The sample's rows in Lumi's menu bar menu: a command, a choice kept in
/// storage and shown as ticks, and a window. Set on install and on update,
/// and again after every press that changes what a row shows — Lumi keeps
/// the tree between runs, and never flips a tick by itself.
fn draw_menu() -> Result<(), String> {
    use lumi::menu::Entry;
    let target = menu_target();
    // Icons on an item and a submenu, the two kinds that carry one; the
    // check rows draw their ticks.
    let mut entries = vec![
        Entry::item("translate", "Translate Selection").icon("speech"),
        // A press on a menu bar row leaves the app in front where it is, its
        // selection with it — so the peek panel opens beside that selection
        // from here too, and from a dev build, where shortcuts never fire:
        // one row per place it can stand, for trying each.
        Entry::submenu("peek", "Peek at the Selection").icon("highlighter"),
    ];
    for side in ["above", "below"] {
        for (at, label) in [("pointer", "By the Pointer"), ("start", "At the Start"), ("end", "At the End"), ("center", "In the Middle")] {
            entries.push(Entry::item(&format!("peek.{at}.{side}"), &format!("{label}, {}", if side == "above" { "Above" } else { "Below" })).under("peek"));
        }
        if side == "above" {
            entries.push(Entry::separator("peek.s").under("peek"));
        }
    }
    entries.extend([
        Entry::separator("s1"),
        Entry::submenu("to", "Translate To").icon("globe"),
    ]);
    for (code, name) in MENU_TARGETS {
        entries.push(Entry::check(&format!("to.{code}"), name, *code == target).under("to"));
    }
    entries.push(Entry::separator("s2"));
    entries.push(Entry::item("settings", "Sample Settings…").icon("settings"));
    lumi::menu::set_rows(&entries)
}

fn menu_pressed(id: &str) -> Result<(), String> {
    match id {
        "translate" => {
            let params = serde_json::json!({ "target": menu_target() }).to_string();
            translate(&params).map(|_| ())
        }
        _ if id.starts_with("peek.") => {
            // `peek.<at>.<side>`: the row's own place, as a binding's fields.
            let mut parts = id.split('.').skip(1);
            let (at, side) = (parts.next().unwrap_or("pointer"), parts.next().unwrap_or("above"));
            peek(&serde_json::json!({ "at": at, "side": side }).to_string()).map(|_| ())
        }
        "settings" => lumi::open_window("settings"),
        _ => {
            let Some(code) = id.strip_prefix("to.") else {
                return Err(format!("the sample has no {id} row"));
            };
            let rev = lumi::storage::get(MENU_TARGET)?.map(|entry| entry.rev);
            lumi::storage::put(MENU_TARGET, code, rev).map_err(lumi::storage::PutError::into_message)?;
            draw_menu()
        }
    }
}

/// The `peek` command: the selection, told to the peek panel's page and
/// shown beside it. The page sees the first few dozen characters and the
/// count — a sample has no use for more of somebody's text than it shows.
/// Where it stands is said first, with `set_anchor`: the binding's fields,
/// or — from the menu bar, which has none — the manifest's own `anchor`.
fn peek(params: &str) -> Result<String, String> {
    let at = param(params, "at").unwrap_or_else(|| "pointer".to_string());
    let side = param(params, "side").unwrap_or_else(|| "pointer".to_string());
    lumi::set_anchor("peek", &at, &side)?;
    let found = lumi::selection()?;
    // Whether the buttons can do anything here: text on a web page cannot be
    // written over, and the panel says so rather than offering them.
    let editable = lumi::selection_editable()?;
    lumi::post("peek", &peek_message(&found.text, &found.how, editable)?)?;
    lumi::open_window("peek")?;
    Ok(format!("peeked at {} chars", found.text.chars().count()))
}

/// What the peek panel shows: the first words of `text`, how many
/// characters, whether it can be edited, Lumi's case transforms — as Lumi
/// names them — for its buttons, and what the person's own snippets make of
/// the text, when it is one of their triggers. One shape for the command and
/// for a selection the panel comes up beside by itself.
fn peek_message(text: &str, how: &str, editable: Option<bool>) -> Result<String, String> {
    let buttons: Vec<serde_json::Value> = lumi::transforms::all()?
        .into_iter()
        .filter(|transform| transform.group == "case")
        .take(4)
        .map(|transform| serde_json::json!({ "id": transform.id, "label": transform.label }))
        .collect();
    // The page is told what the button will say, not what it will do: the
    // press reads the selection and looks it up again (`peek_snippet`), so
    // nothing the page holds is ever opened or typed.
    let snippet = snippet_of(text).map(|expanded| match as_link(&expanded) {
        Some(link) => serde_json::json!({
            "link": true,
            "label": link.split_once("://").map_or(link, |(_, rest)| rest).chars().take(60).collect::<String>(),
        }),
        None => serde_json::json!({
            "link": false,
            "label": expanded.chars().take(60).collect::<String>(),
        }),
    });
    // Whether this Mac translates at all — macOS 26 — so the panel offers
    // Translate only where pressing it can do something.
    let translates = lumi::translation::languages().is_ok_and(|languages| !languages.is_empty());
    // Whether the person set up a model this extension may ask — so the
    // panel offers Summarize only where there is something to ask. The list,
    // not `ready`: nothing on the Mac is asked whether it answers just to
    // draw a button.
    let summarizes = lumi::ai::models().is_ok_and(|models| !models.is_empty());
    Ok(serde_json::json!({
        "text": text.chars().take(60).collect::<String>(),
        "chars": text.chars().count(),
        "how": how,
        "editable": editable,
        "transforms": buttons,
        "snippet": snippet,
        "translates": translates,
        "summarizes": summarizes,
    })
    .to_string())
}

/// What the person's own snippets make of `selected`, when its trimmed text
/// is one of their triggers in the live profile: the first match that
/// expands to something worth showing. `None` for everything else, which is
/// nearly every selection, and for a lookup Lumi refused — the panel is
/// about the selection first, and a snippet is a bonus on it.
///
/// Any snippet counts, whatever its expand mode: one the person set to
/// **Never from typing** is kept for exactly this, and Lumi answers it like
/// any other — `find` does not ask how a snippet fires.
///
/// A **sealed** expansion is skipped rather than shown. It holds something
/// read from the clipboard, and this panel is drawn over whatever app is in
/// front, so it is not where somebody's one-time code should appear. The
/// sample declares `clipboard`, so Lumi does answer it — what to do with it
/// is the extension's call, and this is the sample's.
fn snippet_of(selected: &str) -> Option<String> {
    let trigger = selected.trim();
    if trigger.is_empty() {
        return None;
    }
    lumi::snippets::find(trigger, lumi::snippets::Within::Active)
        .ok()?
        .into_iter()
        .find_map(|hit| {
            let expansion = lumi::snippets::expand(&hit.profile, &hit.snippet, trigger).ok()?;
            (!expansion.sealed && !expansion.text.trim().is_empty()).then_some(expansion.text)
        })
}

/// Whether an expansion is an address to open — the sample's own reading of
/// it. Lumi hands back text and knows nothing about what it is: the same
/// snippet is a link to this extension and a sentence to another, and which
/// is the extension's to decide. Web addresses only, one word, so a snippet
/// that expands to a sentence mentioning one is still a sentence.
fn as_link(text: &str) -> Option<&str> {
    let text = text.trim();
    let rest = text.strip_prefix("https://").or_else(|| text.strip_prefix("http://"))?;
    (!rest.is_empty() && !text.chars().any(char::is_whitespace)).then_some(text)
}

/// A selection made with the mouse, told by Lumi as it is made: the peek
/// panel comes up beside it — the one window this event's run may open,
/// once, without the keyboard. The anchor is the manifest's (by the
/// pointer, above), which at a release is the hand that just selected.
fn peek_beside(payload: &str) -> Result<(), String> {
    let parsed: serde_json::Value = serde_json::from_str(payload).map_err(|err| format!("selection: {err}"))?;
    let text = parsed.get("text").and_then(|t| t.as_str()).unwrap_or("");
    let editable = parsed.get("editable").and_then(|e| e.as_bool());
    lumi::post("peek", &peek_message(text, "accessibility", editable)?)?;
    lumi::open_window("peek")
}

/// A button on the peek panel: the selection as it is now, through the
/// transform pressed, written back over it and selected again — see
/// [`write_over`] for what the panel does after.
fn peek_apply(id: &str) -> Result<String, String> {
    let found = lumi::selection()?;
    if found.text.is_empty() {
        lumi::alert("Nothing is selected any more")?;
        return Ok(serde_json::json!({ "how": "nothing" }).to_string());
    }
    let changed = lumi::transforms::apply(id, &found.text)?;
    write_over(&found.text, &changed)
}

/// The peek panel's snippet button: the selection read again as it is now,
/// looked up again, and acted on by what it expands to — a link opened in
/// the browser, any other text written over the selection in its place.
/// Looked up again rather than taken from the page, so what is opened or
/// typed is always what the person's own snippet says at the press.
fn peek_snippet() -> Result<String, String> {
    let found = lumi::selection()?;
    let Some(expanded) = snippet_of(&found.text) else {
        lumi::alert("The selection is not one of your snippets any more")?;
        return Ok(serde_json::json!({ "how": "nothing" }).to_string());
    };
    if let Some(link) = as_link(&expanded) {
        lumi::open_url(link)?;
        return Ok(serde_json::json!({ "how": "opened" }).to_string());
    }
    // The trigger was matched trimmed, so the spaces around it in the
    // selection stay where they were and only the trigger is replaced.
    let text = &found.text;
    let lead = text.len() - text.trim_start().len();
    let tail = text.trim_end().len();
    let replacement = format!("{}{expanded}{}", &text[..lead], &text[tail..]);
    write_over(text, &replacement)
}

/// Write `changed` over the selection that read `expected`, and keep the
/// panel with it: with the new text selected it is shown it and asked for
/// again, which moves it beside the new selection — Lumi measures it,
/// whatever its length now — for the next button. Not selected, the panel is
/// about nothing any more and goes. A refusal is said in an alert, where the
/// person can read it.
fn write_over(expected: &str, changed: &str) -> Result<String, String> {
    match lumi::replace_selection_and_select(expected, changed) {
        Ok(done) => {
            if done.selected {
                lumi::post("peek", &peek_message(changed, "accessibility", Some(true))?)?;
                lumi::open_window("peek")?;
            } else {
                lumi::close_window("peek")?;
            }
            Ok(serde_json::json!({ "how": done.how, "selected": done.selected }).to_string())
        }
        Err(refused) => {
            let _ = lumi::alert(&refused);
            Err(refused)
        }
    }
}

/// The peek panel's Translate button: the selection as it is now, into the
/// person's own language — or, when it is already in that one, into their
/// next — by the translator built into macOS.
///
/// The direction is worked out here rather than left to Lumi, so that a pair
/// not on this Mac yet can be offered for download before anything is
/// translated: the source is Lumi's top guess when it is sure, the target the
/// first of the person's languages that is not the source. The page is told
/// the first words of the translation, as it is told the first words of the
/// selection, and the languages; a refusal is said in an alert.
fn peek_translate() -> Result<String, String> {
    use lumi::translation::{self, Readiness};

    let found = lumi::selection()?;
    if found.text.trim().is_empty() {
        lumi::alert("Nothing is selected any more")?;
        return Ok(serde_json::json!({ "how": "nothing" }).to_string());
    }
    let Some(source) = translation::detect(&found.text)?
        .into_iter()
        .next()
        .filter(|guess| guess.confidence >= 0.8)
        .map(|guess| guess.language)
    else {
        lumi::alert("Couldn't tell what language that is")?;
        return Ok(serde_json::json!({ "how": "unsure" }).to_string());
    };
    let Some(target) = translation::preferred()?.into_iter().find(|language| *language != source) else {
        lumi::alert("That is already in your language")?;
        return Ok(serde_json::json!({ "how": "same" }).to_string());
    };
    match translation::status(&source, &target)? {
        Readiness::Installed => {}
        // Asked about on the panel, never put up unasked: the person
        // presses Download… and only then does macOS's prompt appear.
        Readiness::Downloadable => {
            lumi::post("peek", &serde_json::json!({ "download": true, "source": source, "target": target }).to_string())?;
            return Ok(serde_json::json!({ "how": "download" }).to_string());
        }
        Readiness::Unsupported => {
            lumi::alert(&format!("This Mac can't translate {source} into {target}"))?;
            return Ok(serde_json::json!({ "how": "unsupported" }).to_string());
        }
    }
    let request = translation::Request {
        text: found.text,
        source: Some(source),
        target: Some(target),
        quality: translation::Quality::Fast,
    };
    match translation::translate(&request) {
        Ok(done) => {
            lumi::post(
                "peek",
                &serde_json::json!({
                    "translated": done.text.chars().take(60).collect::<String>(),
                    "chars": done.text.chars().count(),
                    "source": done.source,
                    "target": done.target,
                })
                .to_string(),
            )?;
            Ok(serde_json::json!({ "source": done.source, "target": done.target }).to_string())
        }
        Err(refused) => {
            let _ = lumi::alert(&refused);
            Err(refused)
        }
    }
}

/// The peek panel's Summarize button: the selection summed up by the AI the
/// person set up in Lumi, on their default model, streamed to the panel as
/// `lumi:ai` events under the call's id — which the page is told here, and
/// which its Stop button sends back. Whether the text may leave the Mac, and
/// which model runs, are Lumi's to settle with the person; the extension says
/// only what to do with the text.
fn peek_summarize() -> Result<String, String> {
    let found = lumi::selection()?;
    if found.text.trim().is_empty() {
        lumi::alert("Nothing is selected any more")?;
        return Ok(serde_json::json!({ "how": "nothing" }).to_string());
    }
    let request = lumi::ai::Request {
        system: "Summarize the text in one or two sentences. Answer with the summary only.".to_string(),
        input: found.text,
        model: None,
        max_tokens: Some(256),
        thinking: lumi::ai::Thinking::Off,
        answer_language: Some("same".to_string()),
        format: lumi::ai::Format::Text,
    };
    match lumi::ai::start(&request) {
        Ok(id) => Ok(serde_json::json!({ "call": id }).to_string()),
        Err(failure) => {
            if !matches!(failure.kind, lumi::ai::FailureKind::Declined | lumi::ai::FailureKind::Stopped) {
                let _ = lumi::alert(&failure.message);
            }
            Ok(serde_json::json!({ "failed": failure.message }).to_string())
        }
    }
}

/// The peek panel's Download… button: macOS's own prompt for the pair the
/// panel was told about, and — once the languages are on this Mac — the
/// translation, the panel shown again beside the selection, since the prompt
/// took the keyboard while it was up. Still downloading, or declined: the
/// panel says so and stays as it is.
fn peek_prepare(source: &str, target: &str) -> Result<String, String> {
    let readiness = lumi::translation::prepare(source, target)?;
    if readiness == lumi::translation::Readiness::Installed {
        let answer = peek_translate()?;
        lumi::open_window("peek")?;
        return Ok(answer);
    }
    lumi::post(
        "peek",
        &serde_json::json!({ "download": true, "source": source, "target": target, "readiness": readiness_word(readiness) })
            .to_string(),
    )?;
    Ok(serde_json::json!({ "readiness": readiness_word(readiness) }).to_string())
}

/// A pair's readiness as the page and the tests read it.
fn readiness_word(readiness: lumi::translation::Readiness) -> &'static str {
    match readiness {
        lumi::translation::Readiness::Installed => "installed",
        lumi::translation::Readiness::Downloadable => "downloadable",
        lumi::translation::Readiness::Unsupported => "unsupported",
    }
}

/// The peek panel's search field, typed in once its page asked for the
/// keyboard: the words, searched for on the web. The browser coming forward
/// takes the keyboard from the panel, which goes with it.
fn peek_search(query: &str) -> Result<String, String> {
    let query = query.trim();
    if query.is_empty() {
        return Err("type something to search for".to_string());
    }
    lumi::open_url(&format!("https://duckduckgo.com/?q={}", utf8_percent_encode(query, NON_ALPHANUMERIC)))?;
    Ok(serde_json::json!({ "searched": query.chars().count() }).to_string())
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
