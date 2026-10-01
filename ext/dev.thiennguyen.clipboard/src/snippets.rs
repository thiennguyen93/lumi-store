//! What a copy expands to, when the copy is one of the person's snippet
//! triggers: `;addr` copied out of a note shows the address it stands for,
//! with its links live and a button to copy it.
//!
//! **Lumi decides what is a trigger and what it expands to** — the
//! `snippets` interface, matching and rendering exactly as typing would.
//! What this side decides is which copies to ask about, in whose profiles,
//! and what to keep: an expansion that comes out the same every time is
//! kept with the record under the revision Lumi gave it, since the copy
//! never changes and neither does the snippet until somebody edits it. One
//! that changes — a date, a random value, a script — is expanded fresh each
//! time it is shown and never kept.
//!
//! What is *not* kept is whether the copy is a trigger at all: that is a
//! fact about the person's snippets, which change outside this history —
//! a snippet added, a profile switched — and asking costs Lumi one lookup.

use crate::history::{self, Kind, Rep};
use crate::host::{Host, Within};
use crate::links::{self, Link};
use serde::{Deserialize, Serialize};

/// The longest copy that can be a trigger: the most Lumi holds of what is
/// typed. A longer copy is not asked about at all.
pub const LONGEST: usize = 64;

/// The `matchSnippets` setting.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Matching {
    Off,
    /// The live profile's snippets — the default.
    Current,
    All,
    /// The profiles ticked in `snippetProfiles`.
    Selected,
}

impl Matching {
    pub fn parse(word: Option<&str>) -> Self {
        match word {
            Some("off") => Matching::Off,
            Some("all") => Matching::All,
            Some("selected") => Matching::Selected,
            _ => Matching::Current,
        }
    }
}

/// The ticked profiles, as `snippetProfiles` holds them: ids joined by
/// commas. Profile ids are letters, digits, `-` and `_`, so nothing else
/// is kept.
pub fn picked(setting: &str) -> Vec<String> {
    let mut ids: Vec<String> = Vec::new();
    for id in setting.split(',').map(str::trim) {
        let fine = !id.is_empty() && id.len() <= 64 && id.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_');
        if fine && !ids.iter().any(|seen| seen == id) {
            ids.push(id.to_string());
        }
    }
    ids
}

/// Whose snippets the setting asks about; `None` when it asks about none.
pub fn within(matching: Matching, picked: &[String]) -> Option<Within> {
    match matching {
        Matching::Off => None,
        Matching::Current => Some(Within::Active),
        Matching::All => Some(Within::All),
        Matching::Selected if picked.is_empty() => None,
        Matching::Selected => Some(Within::Only(picked.to_vec())),
    }
}

/// The text a copy would be a trigger as: a text or rich copy's plain text,
/// without the spaces and line breaks a copied word so often brings along.
/// `None` for any other copy, an empty one, or one longer than a trigger.
pub fn trigger_text(items: &[Vec<Rep>]) -> Option<String> {
    if !matches!(history::kind_of(items), Kind::Text | Kind::Rich) {
        return None;
    }
    let text = history::plain_text(items)?.trim();
    (!text.is_empty() && text.chars().count() <= LONGEST).then(|| text.to_string())
}

/// One expansion a record keeps: a snippet's that comes out the same every
/// time, under the revision it was expanded at.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Kept {
    pub profile: String,
    pub snippet: String,
    pub revision: String,
    pub text: String,
}

/// One expansion as the preview shows it: the text, every profile whose
/// snippet expands the copy to it, and the web addresses in it.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Shown {
    pub text: String,
    pub profiles: Vec<String>,
    /// Expanded fresh for this preview: it may read differently next time.
    pub dynamic: bool,
    pub links: Vec<Link>,
}

/// What a lookup found, and what the record should keep after it.
#[derive(Debug, Default)]
pub struct Looked {
    pub shown: Vec<Shown>,
    pub kept: Vec<Kept>,
}

/// What `text` expands to in those profiles: every snippet Lumi finds,
/// a kept expansion used where its revision still stands, the rest asked
/// for. Several snippets expanding to one text are one entry naming each
/// profile, in Lumi's order. A snippet that will not expand — switched off
/// or edited between the two calls, or one Lumi refuses — is left out.
pub fn look(host: &impl Host, text: &str, within: &Within, kept: &[Kept]) -> Result<Looked, String> {
    let hits = host.find_snippets(text, within)?;
    let mut looked = Looked::default();
    // (text, profile ids, dynamic), in the order first found.
    let mut found: Vec<(String, Vec<String>, bool)> = Vec::new();
    for hit in hits {
        let held = kept
            .iter()
            .find(|one| hit.fixed && one.profile == hit.profile && one.snippet == hit.snippet && one.revision == hit.revision);
        let (expanded, fixed) = match held {
            Some(one) => {
                looked.kept.push(one.clone());
                (one.text.clone(), true)
            }
            None => {
                let Ok(expansion) = host.expand_snippet(&hit.profile, &hit.snippet, text) else {
                    continue;
                };
                // Under the revision this expansion answered, not the hit's:
                // a snippet edited between the two is kept as it now is.
                if expansion.fixed {
                    looked.kept.push(Kept {
                        profile: hit.profile.clone(),
                        snippet: hit.snippet.clone(),
                        revision: expansion.revision,
                        text: expansion.text.clone(),
                    });
                }
                (expansion.text, expansion.fixed)
            }
        };
        match found.iter_mut().find(|(same, _, _)| *same == expanded) {
            Some((_, profiles, dynamic)) => {
                if !profiles.contains(&hit.profile) {
                    profiles.push(hit.profile);
                }
                *dynamic |= !fixed;
            }
            None => found.push((expanded, vec![hit.profile], !fixed)),
        }
    }
    if found.is_empty() {
        return Ok(looked);
    }
    // Names to show; an id Lumi no longer lists is shown as itself.
    let names = host.profiles().map(|(_, rows)| rows).unwrap_or_default();
    let name = |id: &str| names.iter().find(|row| row.id == id).map_or_else(|| id.to_string(), |row| row.name.clone());
    looked.shown = found
        .into_iter()
        .map(|(text, profiles, dynamic)| Shown {
            links: links::in_text(&text),
            profiles: profiles.iter().map(|id| name(id)).collect(),
            text,
            dynamic,
        })
        .collect();
    Ok(looked)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::host::memory::Memory;
    use crate::host::Profile;

    fn text_item(text: &str) -> Vec<Vec<Rep>> {
        vec![vec![Rep {
            uti: history::uti::TEXT.to_string(),
            text: Some(text.to_string()),
            blob: None,
            bytes: text.len() as u64,
            file_size: None,
            path: None,
            file_token: None,
        }]]
    }

    fn book(host: &Memory) {
        *host.book.borrow_mut() = (
            "p_work".to_string(),
            vec![
                Profile { id: "default".to_string(), name: "Default".to_string() },
                Profile { id: "p_work".to_string(), name: "Work".to_string() },
            ],
        );
    }

    fn snippet(host: &Memory, profile: &str, id: &str, trigger: &str, text: &str, fixed: bool, revision: &str) {
        host.snippets.borrow_mut().push((
            profile.to_string(),
            id.to_string(),
            trigger.to_string(),
            text.to_string(),
            fixed,
            revision.to_string(),
        ));
    }

    #[test]
    fn the_setting_reads_as_whose_snippets() {
        assert_eq!(within(Matching::parse(None), &[]), Some(Within::Active));
        assert_eq!(within(Matching::parse(Some("off")), &[]), None);
        assert_eq!(within(Matching::parse(Some("all")), &[]), Some(Within::All));
        assert_eq!(within(Matching::parse(Some("selected")), &[]), None, "nothing ticked, nothing asked");
        let ids = picked(" p_work, default,,p_work, ../x ");
        assert_eq!(ids, ["p_work", "default"]);
        assert_eq!(within(Matching::Selected, &ids), Some(Within::Only(ids.clone())));
    }

    #[test]
    fn only_a_short_text_or_rich_copy_is_a_trigger_trimmed() {
        assert_eq!(trigger_text(&text_item("  ;addr\n")).as_deref(), Some(";addr"));
        assert_eq!(trigger_text(&text_item("   ")), None);
        assert_eq!(trigger_text(&text_item(&"a".repeat(LONGEST + 1))), None);
        assert_eq!(trigger_text(&text_item(&"a".repeat(LONGEST))).map(|t| t.len()), Some(LONGEST));
        // A link row and a colour row are not asked about.
        assert_eq!(trigger_text(&text_item("https://lumikeys.app")), None);
        assert_eq!(trigger_text(&text_item("#ff8800")), None);
    }

    #[test]
    fn the_same_text_from_two_profiles_is_one_entry_naming_both() {
        let host = Memory::default();
        book(&host);
        snippet(&host, "default", "a", ";addr", "12 Main St https://maps.example.com/a", true, "r1");
        snippet(&host, "p_work", "a", ";addr", "12 Main St https://maps.example.com/a", true, "r1");
        snippet(&host, "p_work", "d", ";addr", "today", false, "r9");
        let looked = look(&host, ";addr", &Within::All, &[]).expect("looks");
        assert_eq!(looked.shown.len(), 2);
        assert_eq!(looked.shown[0].profiles, ["Default", "Work"]);
        assert!(!looked.shown[0].dynamic);
        assert_eq!(looked.shown[0].links[0].url, "https://maps.example.com/a");
        assert_eq!(looked.shown[1].profiles, ["Work"]);
        assert!(looked.shown[1].dynamic);
        // Only the fixed ones are kept.
        assert_eq!(looked.kept.len(), 2);
        assert!(looked.kept.iter().all(|one| one.snippet == "a"));
    }

    #[test]
    fn a_kept_expansion_is_used_while_its_revision_stands() {
        let host = Memory::default();
        book(&host);
        snippet(&host, "p_work", "a", ";addr", "12 Main St", true, "r1");
        let first = look(&host, ";addr", &Within::Active, &[]).expect("looks");
        assert_eq!(host.expanded.borrow().len(), 1);
        let again = look(&host, ";addr", &Within::Active, &first.kept).expect("looks");
        assert_eq!(host.expanded.borrow().len(), 1, "not expanded again");
        assert_eq!(again.kept, first.kept);
        assert_eq!(again.shown[0].text, "12 Main St");

        // Edited: a new revision, expanded again, kept anew.
        host.snippets.borrow_mut()[0].3 = "34 Side St".to_string();
        host.snippets.borrow_mut()[0].5 = "r2".to_string();
        let edited = look(&host, ";addr", &Within::Active, &again.kept).expect("looks");
        assert_eq!(host.expanded.borrow().len(), 2);
        assert_eq!(edited.shown[0].text, "34 Side St");
        assert_eq!(edited.kept[0].revision, "r2");
    }

    #[test]
    fn a_changing_expansion_is_fresh_each_time_and_never_kept() {
        let host = Memory::default();
        book(&host);
        snippet(&host, "p_work", "d", ";d", "today", false, "r1");
        let first = look(&host, ";d", &Within::Active, &[]).expect("looks");
        let second = look(&host, ";d", &Within::Active, &first.kept).expect("looks");
        assert!(first.kept.is_empty() && second.kept.is_empty());
        assert_ne!(first.shown[0].text, second.shown[0].text);
        assert_eq!(host.expanded.borrow().len(), 2);
    }

    #[test]
    fn no_match_asks_for_no_names() {
        let host = Memory::default();
        let looked = look(&host, ";nothing", &Within::All, &[]).expect("looks");
        assert!(looked.shown.is_empty() && looked.kept.is_empty());
        assert!(host.expanded.borrow().is_empty());
    }
}
