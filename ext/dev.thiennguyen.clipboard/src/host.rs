//! Everything this extension asks of Lumi, behind one trait.
//!
//! The history logic in `lib.rs` runs against an in-memory [`Host`] in the
//! tests, so what a copy does to storage, and what a picked row puts on the
//! board, is checked without a Lumi. [`Lumi`] is the only code that speaks
//! to the SDK.

use crate::history::Rep;
pub use lumi_extension_api::Presence;
use lumi_extension_api::{self as lumi, storage};

/// A stored value and the revision it was read at, for compare-and-swap:
/// the `index` is written both by a copy arriving and by the panel, and the
/// two can land in the same moment.
#[derive(Debug, Clone)]
pub struct Stored {
    pub value: String,
    pub rev: u64,
}

/// The storage key the row-id counter lives under.
const SEQ: &str = "seq";

/// Whose snippets to look in, as profile ids.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Within {
    Active,
    All,
    Only(Vec<String>),
}

/// One snippet whose trigger is the whole text asked about.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SnippetHit {
    pub profile: String,
    pub snippet: String,
    pub revision: String,
    /// The same expansion every time — worth keeping.
    pub fixed: bool,
}

/// One snippet, expanded.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Expansion {
    pub text: String,
    pub revision: String,
    pub fixed: bool,
}

/// One of the person's profiles.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Profile {
    pub id: String,
    pub name: String,
}

pub trait Host {
    fn get(&self, key: &str) -> Result<Option<Stored>, String>;
    /// Write `value` if the key is still at `if_rev` (`None`: must not
    /// exist). Answers the new revision, or `Err(Conflict)` on a race.
    fn put(&self, key: &str, value: &str, if_rev: Option<u64>) -> Result<u64, PutError>;
    fn delete(&self, key: &str) -> Result<(), String>;
    fn delete_blob(&self, id: &str) -> Result<(), String>;
    /// Put `items` on the pasteboard and — when `keystroke` — paste them
    /// into the application in front. For a paste Lumi takes the panel down
    /// first (a pinned one only hands the keyboard back): it is key while it
    /// is up, so a ⌘V sent before it goes would land in the panel's own
    /// search field. Without a keystroke the panel is the caller's to close.
    fn paste(&self, items: &[Vec<Rep>], keystroke: bool) -> Result<(), String>;
    /// Drag `items` out of the panel the person is pressing in, into the
    /// application they drop them on; Lumi refuses unless the button is still
    /// down. `close_on_drop`: put the panel away after a drop that took them.
    fn drag(&self, items: &[Vec<Rep>], close_on_drop: bool) -> Result<(), String>;
    /// Close one of the manifest's windows by name — `lib::PANEL` or
    /// `lib::WELCOME`. One that is not open is not an error.
    fn close_window(&self, name: &str) -> Result<(), String>;
    /// Open (or bring forward) one of the manifest's windows by name. One
    /// already up is never closed: a pinned panel the person left takes the
    /// keyboard back where it stands, any other comes to the pointer.
    fn open_window(&self, name: &str) -> Result<(), String>;
    /// Where one of the manifest's windows stands: hidden, up with the
    /// keyboard elsewhere (a pinned panel the person left), or focused.
    fn window_state(&self, name: &str) -> Result<Presence, String>;
    /// The glass the panel opens on next.
    fn set_material(&self, window: &str, material: &str) -> Result<(), String>;
    /// Light, dark or the system's, for the panel — at once if it is up.
    fn set_theme(&self, window: &str, theme: &str) -> Result<(), String>;
    /// Keep the panel up while the person works elsewhere, or let it go.
    fn set_pinned(&self, window: &str, pinned: bool) -> Result<(), String>;
    /// Hand one of this extension's pages a message; `false` when it is
    /// not on screen.
    fn post(&self, window: &str, message: &str) -> Result<bool, String>;
    /// Say something in Lumi's own alert overlay — to the person at the
    /// keyboard, once the panel may already be gone.
    fn alert(&self, text: &str) -> Result<(), String>;
    /// Open a web address — for a press, so Lumi asks no capability of it.
    fn open_url(&self, url: &str) -> Result<(), String>;
    /// Select a file in Finder, by its `file:` URL.
    fn reveal(&self, file_url: &str) -> Result<(), String>;
    /// Hand a stored blob to the person through Lumi's Save panel, as
    /// `name`. Lumi closes the panel first and does not say where it went.
    fn save_blob(&self, blob: &str, name: &str) -> Result<(), String>;
    /// Lumi's Settings, on this extension's Settings tab.
    fn open_settings(&self) -> Result<(), String>;
    /// This extension's rows in Lumi's menu bar menu, the whole tree.
    fn set_menu(&self, entries: &[lumi_extension_api::menu::Entry]) -> Result<(), String>;
    fn settings(&self) -> serde_json::Value;
    /// Now, in ms since the epoch — the clock Lumi stamps copies with.
    fn now(&self) -> i64;
    /// Every profile, in Lumi's order, and the live one's id.
    fn profiles(&self) -> Result<(String, Vec<Profile>), String>;
    /// Every snippet in those profiles whose trigger is the whole of `text`.
    fn find_snippets(&self, text: &str, within: &Within) -> Result<Vec<SnippetHit>, String>;
    /// One snippet expanded as typing `text` would.
    fn expand_snippet(&self, profile: &str, snippet: &str, text: &str) -> Result<Expansion, String>;

    /// A fresh id for a new row, from a counter kept in storage.
    ///
    /// Key names are stored in the clear (Lumi encrypts values, not names),
    /// so an id must say nothing about the copy: derived from its content, a
    /// row's file name would be a fingerprint of what was copied. A counter
    /// says only the order rows were made in, which the index says anyway.
    /// Not random because the component has no random source to ask — Lumi
    /// gives it no WASI — and a counter needs none. Same compare-and-swap as
    /// the index, since two copies can land together.
    fn new_id(&self) -> Result<String, String> {
        for _ in 0..crate::CAS_ATTEMPTS {
            let seen = self.get(SEQ)?;
            let next = seen
                .as_ref()
                .and_then(|s| s.value.parse::<u64>().ok())
                .unwrap_or(0)
                + 1;
            match self.put(SEQ, &next.to_string(), seen.map(|s| s.rev)) {
                Ok(_) => return Ok(format!("id{next}")),
                Err(PutError::Conflict) => continue,
                Err(PutError::Failed(err)) => return Err(err),
            }
        }
        Err("the history was busy; try again".to_string())
    }
}

#[derive(Debug, PartialEq)]
pub enum PutError {
    Conflict,
    Failed(String),
}

/// The real host.
pub struct Lumi;

/// A kept item as the pasteboard takes it. A rep with neither text nor a
/// blob is one Lumi left out at capture — too big, or a type it does not
/// keep — and there is nothing of it to put back.
fn board(items: &[Vec<Rep>]) -> Vec<Vec<lumi::Rep>> {
    items
        .iter()
        .map(|reps| {
            reps.iter()
                .filter_map(|rep| {
                    let data = match (&rep.text, &rep.blob) {
                        (Some(text), _) => lumi::Data::Text(text.clone()),
                        (None, Some(blob)) => lumi::Data::Blob(blob.clone()),
                        (None, None) => return None,
                    };
                    Some(lumi::Rep {
                        uti: rep.uti.clone(),
                        data,
                    })
                })
                .collect::<Vec<_>>()
        })
        .filter(|reps| !reps.is_empty())
        .collect()
}

impl Host for Lumi {
    fn get(&self, key: &str) -> Result<Option<Stored>, String> {
        Ok(storage::get(key)?.map(|entry| Stored {
            value: entry.value,
            rev: entry.rev,
        }))
    }

    fn put(&self, key: &str, value: &str, if_rev: Option<u64>) -> Result<u64, PutError> {
        storage::put(key, value, if_rev).map_err(|err| match err {
            storage::PutError::Conflict => PutError::Conflict,
            storage::PutError::Failed(err) => PutError::Failed(err),
        })
    }

    fn delete(&self, key: &str) -> Result<(), String> {
        storage::delete(key)
    }

    fn delete_blob(&self, id: &str) -> Result<(), String> {
        storage::blob_delete(id)
    }

    fn paste(&self, items: &[Vec<Rep>], keystroke: bool) -> Result<(), String> {
        let items = board(items);
        if keystroke {
            // Lumi closes the panel itself before the ⌘V, and waits for it
            // to be gone — the order this trait's doc asks for.
            lumi::paste(&items)
        } else {
            lumi::write_clipboard(&items)
        }
    }

    fn drag(&self, items: &[Vec<Rep>], close_on_drop: bool) -> Result<(), String> {
        lumi::drag(&board(items), close_on_drop)
    }

    fn close_window(&self, name: &str) -> Result<(), String> {
        lumi::close_window(name)
    }

    fn open_window(&self, name: &str) -> Result<(), String> {
        lumi_extension_api::open_window(name)
    }

    fn window_state(&self, name: &str) -> Result<Presence, String> {
        lumi::window_state(name)
    }

    fn set_material(&self, window: &str, material: &str) -> Result<(), String> {
        lumi_extension_api::set_material(window, material)
    }

    fn set_theme(&self, window: &str, theme: &str) -> Result<(), String> {
        lumi_extension_api::set_theme(window, theme)
    }

    fn set_pinned(&self, window: &str, pinned: bool) -> Result<(), String> {
        lumi_extension_api::set_pinned(window, pinned)
    }

    fn post(&self, window: &str, message: &str) -> Result<bool, String> {
        lumi_extension_api::post(window, message)
    }

    fn alert(&self, text: &str) -> Result<(), String> {
        lumi_extension_api::alert(text)
    }

    fn open_url(&self, url: &str) -> Result<(), String> {
        lumi_extension_api::open_url(url)
    }

    fn reveal(&self, file_url: &str) -> Result<(), String> {
        lumi_extension_api::reveal(file_url)
    }

    fn save_blob(&self, blob: &str, name: &str) -> Result<(), String> {
        lumi_extension_api::storage::blob_save(blob, name)
    }

    fn open_settings(&self) -> Result<(), String> {
        lumi_extension_api::open_settings()
    }

    fn set_menu(&self, entries: &[lumi_extension_api::menu::Entry]) -> Result<(), String> {
        // `set_rows`, for the rows' icons — Lumi 1.34.
        lumi_extension_api::menu::set_rows(entries)
    }

    fn settings(&self) -> serde_json::Value {
        lumi_extension_api::settings()
    }

    fn now(&self) -> i64 {
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map_or(0, |d| d.as_millis() as i64)
    }

    fn profiles(&self) -> Result<(String, Vec<Profile>), String> {
        let book = lumi::profiles()?;
        let rows = book.profiles.into_iter().map(|row| Profile { id: row.id, name: row.name }).collect();
        Ok((book.active, rows))
    }

    fn find_snippets(&self, text: &str, within: &Within) -> Result<Vec<SnippetHit>, String> {
        use lumi::snippets::Within as Asked;
        let asked = match within {
            Within::Active => Asked::Active,
            Within::All => Asked::All,
            Within::Only(ids) => Asked::Only(ids.clone()),
        };
        Ok(lumi::snippets::find(text, asked)?
            .into_iter()
            .map(|hit| SnippetHit { profile: hit.profile, snippet: hit.snippet, revision: hit.revision, fixed: hit.fixed })
            .collect())
    }

    fn expand_snippet(&self, profile: &str, snippet: &str, text: &str) -> Result<Expansion, String> {
        let out = lumi::snippets::expand(profile, snippet, text)?;
        Ok(Expansion { text: out.text, revision: out.revision, fixed: out.fixed })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn rep(uti: &str, text: Option<&str>, blob: Option<&str>) -> Rep {
        Rep {
            uti: uti.to_string(),
            text: text.map(str::to_string),
            blob: blob.map(str::to_string),
            bytes: 0,
            file_size: None,
            path: None, file_token: None,
        }
    }

    /// Text goes back as text and a blob by id; a rep Lumi left out at
    /// capture is dropped, and an item left with nothing is dropped whole
    /// rather than put down as an empty item.
    #[test]
    fn a_kept_item_goes_back_on_the_board_as_it_was_kept() {
        let kept = vec![
            vec![rep("public.utf8-plain-text", Some("hi"), None), rep("public.tiff", None, None)],
            vec![rep("public.png", None, Some("b1"))],
            vec![rep("public.tiff", None, None)],
        ];
        let put = board(&kept);
        assert_eq!(put.len(), 2);
        assert_eq!(put[0].len(), 1);
        assert_eq!(put[0][0].uti, "public.utf8-plain-text");
        assert!(matches!(&put[0][0].data, lumi::Data::Text(t) if t == "hi"));
        assert!(matches!(&put[1][0].data, lumi::Data::Blob(b) if b == "b1"));
    }
}

#[cfg(test)]
pub mod memory {
    //! An in-memory host for the tests: storage is a map, blobs are a set,
    //! and every paste and panel call is recorded.

    use super::*;
    use std::cell::{Cell, RefCell};
    use std::collections::{BTreeMap, BTreeSet};

    #[derive(Default)]
    pub struct Memory {
        pub kv: RefCell<BTreeMap<String, Stored>>,
        /// Every key `get` read, in order — what a request costs in reads.
        pub reads: RefCell<Vec<String>>,
        pub blobs: RefCell<BTreeSet<String>>,
        pub pasted: RefCell<Vec<Vec<Vec<Rep>>>>,
        pub keystrokes: RefCell<Vec<bool>>,
        /// Every `drag`, as (items, close_on_drop).
        pub dragged: RefCell<Vec<(Vec<Vec<Rep>>, bool)>>,
        /// How many times the panel was closed; other windows go to `opened`.
        pub closed: Cell<u32>,
        /// Every `post`, as (window, message) — sent or not.
        pub posts: RefCell<Vec<(String, String)>>,
        /// The windows on screen: opened and not closed since. A `post` to
        /// one answers `true`, as Lumi's does.
        pub up: RefCell<BTreeSet<String>>,
        /// The person is working in another app: a window on screen is `Up`
        /// rather than `Focused`, until `open_window` hands it the keyboard.
        pub away: Cell<bool>,
        /// Every `alert`'s text.
        pub alerts: RefCell<Vec<String>>,
        /// Every `open_url` and `reveal`, as "open <url>" / "reveal <url>".
        pub opened: RefCell<Vec<String>>,
        pub settings: RefCell<serde_json::Value>,
        /// The clock `now` reads; 0 unless a test moves it.
        pub now: Cell<i64>,
        /// Fail the next `n` puts with a conflict, to exercise the retry.
        pub conflicts: Cell<u32>,
        /// The profile book: the live id and every (id, name). Empty means
        /// one profile, `default`, live.
        pub book: RefCell<(String, Vec<Profile>)>,
        /// The person's snippets. A trigger matches its text whole, any
        /// case — enough for what the history does with the answer.
        pub snippets: RefCell<Vec<MockSnippet>>,
        /// Every `find_snippets`, as (text, within).
        pub found: RefCell<Vec<(String, Within)>>,
        /// Every `expand_snippet`, as "profile/snippet". A snippet that is
        /// not fixed expands to its text and how many times it has been.
        pub expanded: RefCell<Vec<String>>,
        /// The menu bar tree last set.
        pub menu: RefCell<Vec<lumi_extension_api::menu::Entry>>,
    }

    /// One of the mock's snippets, as (profile, snippet id, trigger, text,
    /// fixed, revision).
    pub type MockSnippet = (String, String, String, String, bool, String);

    /// Lumi's rule for a storage key (`ext::storage::check_name`): 1–128
    /// lowercase letters, digits, '.', '-' or '_', not starting with '.'.
    /// Held here so a key Lumi refuses fails a test rather than a press.
    fn storage_key(key: &str) -> Result<(), String> {
        let ok = !key.is_empty()
            && key.len() <= 128
            && !key.starts_with('.')
            && key.bytes().all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || matches!(b, b'.' | b'-' | b'_'));
        if ok {
            Ok(())
        } else {
            Err(format!("{key:?} is not a storage key"))
        }
    }

    impl Memory {
        fn book(&self) -> (String, Vec<Profile>) {
            let book = self.book.borrow().clone();
            if book.1.is_empty() {
                ("default".to_string(), vec![Profile { id: "default".to_string(), name: "Default".to_string() }])
            } else {
                book
            }
        }
    }

    impl Host for Memory {
        fn get(&self, key: &str) -> Result<Option<Stored>, String> {
            storage_key(key)?;
            self.reads.borrow_mut().push(key.to_string());
            Ok(self.kv.borrow().get(key).cloned())
        }

        fn put(&self, key: &str, value: &str, if_rev: Option<u64>) -> Result<u64, PutError> {
            storage_key(key).map_err(PutError::Failed)?;
            if self.conflicts.get() > 0 {
                self.conflicts.set(self.conflicts.get() - 1);
                return Err(PutError::Conflict);
            }
            let mut kv = self.kv.borrow_mut();
            let current = kv.get(key).map(|s| s.rev);
            if current != if_rev {
                return Err(PutError::Conflict);
            }
            let rev = current.unwrap_or(0) + 1;
            kv.insert(
                key.to_string(),
                Stored {
                    value: value.to_string(),
                    rev,
                },
            );
            Ok(rev)
        }

        fn delete(&self, key: &str) -> Result<(), String> {
            storage_key(key)?;
            self.kv.borrow_mut().remove(key);
            Ok(())
        }

        fn delete_blob(&self, id: &str) -> Result<(), String> {
            self.blobs.borrow_mut().remove(id);
            Ok(())
        }

        fn paste(&self, items: &[Vec<Rep>], keystroke: bool) -> Result<(), String> {
            self.pasted.borrow_mut().push(items.to_vec());
            self.keystrokes.borrow_mut().push(keystroke);
            Ok(())
        }

        fn drag(&self, items: &[Vec<Rep>], close_on_drop: bool) -> Result<(), String> {
            self.dragged.borrow_mut().push((items.to_vec(), close_on_drop));
            Ok(())
        }

        fn close_window(&self, name: &str) -> Result<(), String> {
            self.up.borrow_mut().remove(name);
            if name == crate::PANEL {
                self.closed.set(self.closed.get() + 1);
            } else {
                self.opened.borrow_mut().push(format!("close-window {name}"));
            }
            Ok(())
        }

        fn open_window(&self, name: &str) -> Result<(), String> {
            self.up.borrow_mut().insert(name.to_string());
            self.away.set(false);
            self.opened.borrow_mut().push(format!("open-window {name}"));
            Ok(())
        }

        fn window_state(&self, name: &str) -> Result<Presence, String> {
            Ok(match (self.up.borrow().contains(name), self.away.get()) {
                (false, _) => Presence::Hidden,
                (true, true) => Presence::Up,
                (true, false) => Presence::Focused,
            })
        }

        fn post(&self, window: &str, message: &str) -> Result<bool, String> {
            self.posts.borrow_mut().push((window.to_string(), message.to_string()));
            Ok(self.up.borrow().contains(window))
        }

        fn alert(&self, text: &str) -> Result<(), String> {
            self.alerts.borrow_mut().push(text.to_string());
            Ok(())
        }

        fn set_material(&self, window: &str, material: &str) -> Result<(), String> {
            self.opened.borrow_mut().push(format!("material {window} {material}"));
            Ok(())
        }

        fn set_theme(&self, window: &str, theme: &str) -> Result<(), String> {
            self.opened.borrow_mut().push(format!("theme {window} {theme}"));
            Ok(())
        }

        fn set_pinned(&self, window: &str, pinned: bool) -> Result<(), String> {
            self.opened.borrow_mut().push(format!("pinned {window} {pinned}"));
            Ok(())
        }

        fn open_url(&self, url: &str) -> Result<(), String> {
            self.opened.borrow_mut().push(format!("open {url}"));
            Ok(())
        }

        fn reveal(&self, file_url: &str) -> Result<(), String> {
            self.opened.borrow_mut().push(format!("reveal {file_url}"));
            Ok(())
        }

        fn save_blob(&self, blob: &str, name: &str) -> Result<(), String> {
            self.opened.borrow_mut().push(format!("save {blob} {name}"));
            Ok(())
        }

        fn open_settings(&self) -> Result<(), String> {
            self.opened.borrow_mut().push("settings".to_string());
            Ok(())
        }

        fn set_menu(&self, entries: &[lumi_extension_api::menu::Entry]) -> Result<(), String> {
            *self.menu.borrow_mut() = entries.to_vec();
            Ok(())
        }

        fn settings(&self) -> serde_json::Value {
            self.settings.borrow().clone()
        }

        fn now(&self) -> i64 {
            self.now.get()
        }

        fn profiles(&self) -> Result<(String, Vec<Profile>), String> {
            Ok(self.book())
        }

        fn find_snippets(&self, text: &str, within: &Within) -> Result<Vec<SnippetHit>, String> {
            self.found.borrow_mut().push((text.to_string(), within.clone()));
            let (active, rows) = self.book();
            let ids: Vec<String> = match within {
                Within::Active => vec![active],
                Within::All => rows.iter().map(|row| row.id.clone()).collect(),
                Within::Only(picked) => rows.iter().map(|row| row.id.clone()).filter(|id| picked.contains(id)).collect(),
            };
            let snippets = self.snippets.borrow();
            Ok(ids
                .iter()
                .flat_map(|id| {
                    snippets
                        .iter()
                        .filter(move |row| &row.0 == id && row.2.eq_ignore_ascii_case(text))
                        .map(|row| SnippetHit { profile: row.0.clone(), snippet: row.1.clone(), revision: row.5.clone(), fixed: row.4 })
                })
                .collect())
        }

        fn expand_snippet(&self, profile: &str, snippet: &str, text: &str) -> Result<Expansion, String> {
            self.expanded.borrow_mut().push(format!("{profile}/{snippet}"));
            let times = self.expanded.borrow().len();
            let snippets = self.snippets.borrow();
            let row = snippets
                .iter()
                .find(|row| row.0 == profile && row.1 == snippet && row.2.eq_ignore_ascii_case(text))
                .ok_or_else(|| "that text is not this snippet's trigger".to_string())?;
            let text = if row.4 { row.3.clone() } else { format!("{} #{times}", row.3) };
            Ok(Expansion { text, revision: row.5.clone(), fixed: row.4 })
        }
    }
}
