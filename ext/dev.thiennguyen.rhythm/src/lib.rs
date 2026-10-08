//! Rhythm Keys: a rhythm game in a window of its own.
//!
//! **The game is the page** (`ui/`): it reads every song it is given — tempo,
//! beats, onsets — and writes its charts, plays it, judges the keys. What it
//! cannot do from a page is answered here:
//!
//! - **Keeping things.** The library (songs, collections) and the player's
//!   progress (settings, best scores, the daily streak) are two keys in this
//!   extension's own storage, written whole, last write wins: one window
//!   writes them. The songs and their readings are blobs the page writes and
//!   reads itself (`POST /__lumi__/download`, `PUT`/`GET /__lumi__/blob`);
//!   only letting go of them is asked here, since a page cannot delete a blob.
//! - **Finding free music.** A page has no network; the search goes out from
//!   here to Openverse, one fixed address, with only the words asked for.
//! - **Songs from the Mac**, through Lumi's Open panel (`files.open`), each
//!   arriving as a blob the page then reads.
//! - **A song's own page**, opened for a press on its licence.
//!
//! And the ways in: the `play` command, a row in Lumi's menu bar menu, and
//! the window itself opening once, right after install.

use lumi_extension_api as lumi;
use lumi_extension_api::storage::{self, PutError};

/// The one window, and the manifest name the command opens.
const WINDOW: &str = "game";

/// What the page may keep, and nothing else: the library, and the player's
/// progress. Values are the page's JSON, held as written.
const KEYS: [&str; 2] = ["library", "progress"];

/// Openverse's audio search. The only address this extension asks for
/// itself; downloads are the page's, through the bridge.
const SEARCH: &str = "https://api.openverse.org/v1/audio/";

/// The longest search the page may send, in bytes: a few words, not a payload.
const MAX_QUERY: usize = 200;

/// Lumi's Open panel, offered audio files only.
const AUDIO: [&str; 1] = ["public.audio"];

struct RhythmKeys;

impl lumi::Guest for RhythmKeys {
    fn run_command(name: String, _params: String) -> Result<String, String> {
        match name.as_str() {
            "play" => {
                lumi::open_window(WINDOW)?;
                Ok(String::new())
            }
            _ => Err(format!("Rhythm Keys has no {name} command")),
        }
    }

    fn run_node(name: String, _params: String, _items: String) -> Result<String, String> {
        Err(format!("Rhythm Keys has no {name} node"))
    }

    /// The window's requests, each a JSON object with a `kind`:
    ///
    /// - `load` → `{"library": string|null, "progress": string|null}`;
    /// - `save` `{key, value}` → `{}`, `key` one of [`KEYS`];
    /// - `search` `{q}` → Openverse's own answer, as it came;
    /// - `open-files` → `[{"name", "blob"}]`, empty when the person cancels;
    /// - `forget` `{blobs: [id]}` → `{}`, a blob already gone not an error;
    /// - `usage` → `{"bytes", "limit"}`, the storage this extension holds;
    /// - `open` `{url}` → `{}`, a song's page, `https` only.
    fn run_ui(window: String, request: String) -> Result<String, String> {
        if let Some(row) = lumi::menu::pressed(&window, &request) {
            return match row.as_str() {
                "play" => lumi::open_window(WINDOW).map(|()| String::new()),
                _ => Err(format!("Rhythm Keys has no {row} row")),
            };
        }
        if window != WINDOW {
            return Err(format!("Rhythm Keys has no {window} window"));
        }
        let asked: serde_json::Value =
            serde_json::from_str(&request).map_err(|err| format!("request: {err}"))?;
        let text = |field: &str| asked.get(field).and_then(|value| value.as_str());
        match text("kind") {
            Some("load") => {
                let mut answer = serde_json::Map::new();
                for key in KEYS {
                    let value = storage::get(key)?.map(|entry| entry.value);
                    answer.insert(key.to_string(), value.map_or(serde_json::Value::Null, serde_json::Value::String));
                }
                Ok(serde_json::Value::Object(answer).to_string())
            }
            Some("save") => {
                let key = text("key")
                    .filter(|key| KEYS.contains(key))
                    .ok_or_else(|| "save keeps library or progress".to_string())?;
                let value = text("value").ok_or_else(|| "save needs a value".to_string())?;
                keep(key, value)?;
                Ok("{}".to_string())
            }
            Some("search") => {
                let q = text("q").map(str::trim).unwrap_or_default();
                if q.is_empty() || q.len() > MAX_QUERY {
                    return Err("search needs a few words".to_string());
                }
                search(q)
            }
            Some("open-files") => {
                let opened = lumi::files::open(&AUDIO, true, "Choose songs to play in Rhythm Keys.")?;
                let list: Vec<serde_json::Value> = opened
                    .into_iter()
                    .map(|file| serde_json::json!({ "name": file.name, "blob": file.blob }))
                    .collect();
                Ok(serde_json::Value::Array(list).to_string())
            }
            Some("forget") => {
                let blobs = asked.get("blobs").and_then(|blobs| blobs.as_array()).cloned().unwrap_or_default();
                for blob in blobs.iter().filter_map(|blob| blob.as_str()) {
                    // Already gone is what was asked for.
                    let _ = storage::blob_delete(blob);
                }
                Ok("{}".to_string())
            }
            Some("usage") => {
                let (bytes, limit) = storage::usage()?;
                Ok(serde_json::json!({ "bytes": bytes, "limit": limit }).to_string())
            }
            Some("open") => {
                let url = text("url")
                    .filter(|url| url.starts_with("https://"))
                    .ok_or_else(|| "open takes an https address".to_string())?;
                lumi::open_url(url)?;
                Ok("{}".to_string())
            }
            _ => Err("Rhythm Keys' window asks for load, save, search, open-files, forget, usage or open".to_string()),
        }
    }

    /// The menu bar row on install and on every update, which may change
    /// it; on install, the window too, so the first thing seen is the game
    /// asking for a song.
    fn on_lifecycle(event: lumi::Lifecycle) -> Result<(), String> {
        match event {
            lumi::Lifecycle::Installed => {
                // Best effort: a row that cannot be set must not keep the
                // window from opening.
                let _ = menu();
                lumi::open_window(WINDOW)
            }
            lumi::Lifecycle::Updated(_) => menu(),
            lumi::Lifecycle::Uninstalling => Ok(()),
        }
    }

    /// Rhythm Keys asks to hear no events, so this is never called.
    fn on_event(_name: String, _payload: String) -> Result<(), String> {
        Ok(())
    }
}

/// The one row in Lumi's menu bar menu.
fn menu() -> Result<(), String> {
    use lumi::menu::Entry;
    lumi::menu::set_rows(&[Entry::item("play", "Play Rhythm Keys").icon("music")])
}

/// Keep `value` under `key`, over whatever another run wrote in between: the
/// one window is the one writer, so its latest write is the one meant.
fn keep(key: &str, value: &str) -> Result<(), String> {
    loop {
        let seen = storage::get(key)?;
        match storage::put(key, value, seen.map(|entry| entry.rev)) {
            Err(PutError::Conflict) => continue,
            other => return other.map(drop).map_err(PutError::into_message),
        }
    }
}

/// Twenty songs for `q` from Openverse, music only, handed to the page as
/// Openverse answered: the page picks what it shows.
fn search(q: &str) -> Result<String, String> {
    let url = format!("{SEARCH}?q={}&category=music&page_size=20", encode(q));
    let answer = lumi::fetch(&lumi::Request {
        method: String::new(),
        url,
        headers: Vec::new(),
        body: None,
    })?;
    match answer.status {
        200..=299 => Ok(answer.body),
        429 => Err("Too many searches for now. Try again in a minute.".to_string()),
        _ => Err("Free music search is not answering right now.".to_string()),
    }
}

/// `q` as a query value: the unreserved characters as they are, everything
/// else percent-encoded, byte by byte.
fn encode(q: &str) -> String {
    let mut out = String::with_capacity(q.len() * 3);
    for byte in q.bytes() {
        match byte {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => out.push(byte as char),
            _ => out.push_str(&format!("%{byte:02X}")),
        }
    }
    out
}

lumi::register!(RhythmKeys);

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_query_is_encoded_byte_by_byte() {
        assert_eq!(encode("lo-fi beats"), "lo-fi%20beats");
        assert_eq!(encode("nhạc & jazz"), "nh%E1%BA%A1c%20%26%20jazz");
        assert_eq!(encode("a=b?c"), "a%3Db%3Fc");
    }
}
