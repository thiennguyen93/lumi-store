//! The history model: what a copy becomes, what is kept, what is thrown
//! away. Plain Rust with no host call in it, so every rule below is tested
//! on the host target and the component only moves bytes between this and
//! Lumi's storage.
//!
//! **Two documents, not one.** `index` holds one small [`Entry`] per item —
//! everything the panel draws and searches — and each item's full content
//! is a [`Record`] under its own key. The panel loads the index once and
//! filters it in the page, so a search costs no call into this component;
//! a paste reads one record. Keeping the content in the index instead would
//! put every copied document into every panel open.
//!
//! **Bytes never pass through here.** Lumi writes an image, a file's data
//! and any very long text into this extension's blob store *before* it
//! tells the component about the copy, and the event carries blob ids. So a
//! screenshot costs the component a string, and the only thing this model
//! must get right about blobs is to hand back every id it stops referring
//! to — [`Outcome`] names them so the caller can delete them.

use serde::{Deserialize, Serialize};

/// Current `index` shape. Bumped only on a change an older build cannot
/// read; a field added with a default is not one.
pub const INDEX_VERSION: u32 = 1;

/// The upkeep `lib` brings rows kept by older builds up to date with
/// (`lib`'s `Upkeep`), once per index. Bumped with every rule added to it or
/// changed, so that every index is gone over again, once. An index kept
/// before upkeep was counted reads as 0, and is gone over.
pub const UPKEEP: u32 = 1;

/// How many characters of text a row's title keeps. The panel draws one
/// line, so more is only weight in the index.
pub const TITLE_CHARS: usize = 200;

/// How much text an entry keeps for searching. The same trade-off Maccy
/// makes at 1k for its title: a search over the first kilobyte finds what
/// people search for, and a pasted log file does not make every keystroke
/// in the search field scan megabytes.
pub const SEARCH_CHARS: usize = 1024;

/// Pin letters, in the order they are handed out. Leaves out the letters
/// the panel already answers with ⌘ held: `a` select all, `c` copy, `k`
/// the actions menu, `p` pin, `q` quit, `v` paste, `w` close, `x` cut, `y`
/// expand the preview (Quick Look's key), `z` undo. A letter taken out
/// later moves the pins on it (`settle_pins`).
pub const PIN_LETTERS: &str = "bdefghijlmnorstu";

/// Uniform type identifiers the model reads. Everything else in an item is
/// kept verbatim for the paste and never interpreted.
pub mod uti {
    pub const TEXT: &str = "public.utf8-plain-text";
    pub const HTML: &str = "public.html";
    pub const RTF: &str = "public.rtf";
    pub const FILE_URL: &str = "public.file-url";
    pub const PNG: &str = "public.png";
    pub const TIFF: &str = "public.tiff";
    pub const JPEG: &str = "public.jpeg";
    pub const HEIC: &str = "public.heic";

    pub fn is_image(uti: &str) -> bool {
        matches!(uti, PNG | TIFF | JPEG | HEIC)
    }
}

/// One representation of one pasteboard item, as Lumi delivers it.
/// Exactly one of `text` and `blob` is set; `bytes` is the size either way,
/// so the panel can say how big an image is without reading it.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Rep {
    pub uti: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub text: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub blob: Option<String>,
    #[serde(default)]
    pub bytes: u64,
    /// A copied file's size on disk, as Lumi measured it at the copy —
    /// on a `public.file-url` rep only, from Lumi 1.26.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub file_size: Option<u64>,
    /// Where a copied file is, as Lumi resolved it at the copy — Finder
    /// writes `file:///.file/id=…`, which names nothing a person can read
    /// and nothing this component can resolve. From Lumi 1.26.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub path: Option<String>,
    /// A grant to play or show the file — `/__lumi__/file/<token>` — that
    /// Lumi gives a PDF, sound or film it copied, from Lumi 1.26. Opaque
    /// here, and no path.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub file_token: Option<String>,
}

/// Where a copy came from: the application in front when it happened.
/// That is Lumi's guess, not a fact — the pasteboard does not say who
/// wrote it — and it is the same guess every clipboard manager makes.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Source {
    #[serde(default)]
    pub bundle_id: Option<String>,
    #[serde(default)]
    pub name: Option<String>,
}

/// The `clipboard` event's payload, version 1. Unknown fields are ignored,
/// which is what lets Lumi add one without a new version.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Copy {
    pub v: u32,
    /// Milliseconds since the Unix epoch, Lumi's clock.
    pub at: i64,
    /// Lumi's hash over the canonical representations: two copies of the
    /// same thing hash the same whatever order the application wrote its
    /// types in, which the component could not work out without reading
    /// every blob.
    pub hash: String,
    #[serde(default)]
    pub source: Source,
    /// Set when the write was an extension's own — a paste from this
    /// history comes back through the watcher like any other copy.
    #[serde(default)]
    pub origin: Option<String>,
    pub items: Vec<Vec<Rep>>,
    /// Text Lumi read out of an image, when there was one.
    #[serde(default)]
    pub ocr: Option<String>,
}

/// What a row is, for its icon and the preview's Type line. Worked out once
/// at capture, so the panel never inspects content.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum Kind {
    Text,
    Link,
    Color,
    Rich,
    File,
    Image,
}

/// One row of the panel.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Entry {
    /// Random, and the key of the item's record (`item.<id>`). Never the
    /// hash: key names are not encrypted, and a hash of a short copy is a
    /// dictionary lookup away from the copy.
    pub id: String,
    pub hash: String,
    #[serde(default)]
    pub pin: Option<char>,
    pub first: i64,
    pub last: i64,
    pub count: u32,
    #[serde(default)]
    pub app: Option<String>,
    #[serde(default)]
    pub app_name: Option<String>,
    pub kind: Kind,
    pub title: String,
    pub search: String,
    /// The image blob the preview draws, when the item has one.
    #[serde(default)]
    pub thumb: Option<String>,
    /// Every blob the record refers to — what has to be deleted with it.
    #[serde(default)]
    pub blobs: Vec<String>,
    /// Whether Lumi read text in this item's image — kept in the record, so
    /// the panel can offer to copy it.
    #[serde(default, skip_serializing_if = "is_false")]
    pub ocr: bool,
    /// The text Lumi read, kept apart from `search`: `list` leaves it out
    /// while reading is off, and the panel can tell a row found by its
    /// image's words from one found by its own.
    #[serde(default, skip_serializing_if = "String::is_empty")]
    pub ocr_search: String,
    /// Whether this row's image has been read, text found or not — by Lumi
    /// after the copy (`clipboard-ocr`) or by this extension since
    /// (`lib`'s `readImages`). An image row without it is one Lumi's reader
    /// never reached: reading was off, Lumi quit first, or a burst of copies
    /// pushed it out of Lumi's short queue.
    #[serde(default, skip_serializing_if = "is_false")]
    pub ocr_read: bool,
    /// What a file row's files are, for the icon its row wears: their
    /// extension, lowercased, when they all share one — `"/"` when they are
    /// all folders. Empty for anything else, and for rows kept before this.
    #[serde(default, skip_serializing_if = "String::is_empty")]
    pub file_ext: String,
    /// How many files a file row holds, when more than one — so its row can
    /// look like several. 0 for one file, anything else, and rows kept before
    /// this (`lib`'s upkeep fills those in).
    #[serde(default, skip_serializing_if = "is_zero")]
    pub file_count: u32,
}

fn is_false(b: &bool) -> bool {
    !*b
}

fn is_zero(n: &u32) -> bool {
    *n == 0
}

#[derive(Debug, Clone, PartialEq, Default, Serialize, Deserialize)]
pub struct Index {
    pub v: u32,
    #[serde(default)]
    pub items: Vec<Entry>,
    /// Rows deleted since the panel last opened, newest last, with their
    /// records and blobs still stored — so ⌘Z can bring one back. Emptied,
    /// and what they held deleted for good, when the panel next opens.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub trash: Vec<Entry>,
    /// Every row's `search` and `ocr_search` are kept as copied, case and
    /// all. Rows kept before that hold them lowercased; `lib`'s upkeep reads
    /// those again from their records, once, and sets this. An index that
    /// starts empty starts with it set.
    #[serde(default, rename = "searchAsCopied", skip_serializing_if = "is_false")]
    pub search_as_copied: bool,
    /// The `UPKEEP` its rows were last brought up to date by; 0 for never.
    /// An index that starts empty starts up to date: nothing in it was kept
    /// the old way.
    #[serde(default, skip_serializing_if = "is_zero")]
    pub upkeep: u32,
}

/// An item's full content, stored under `item.<id>`.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Record {
    pub items: Vec<Vec<Rep>>,
    /// The text Lumi read in the item's image, as read — the index keeps
    /// only a shortened copy for searching.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub ocr: Option<String>,
    /// The links the preview lists, found once when the copy is kept
    /// (`links::kept`) — the copy never changes, so neither do they. Missing
    /// on a record kept before this; found again when `v` is out of date.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub links: Option<crate::links::KeptLinks>,
    /// What the copy expands to as a snippet trigger, for the snippets that
    /// expand the same way every time — each under the revision Lumi
    /// answered, so an edited snippet is expanded again (`snippets::look`).
    /// Missing until a preview first finds one.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub snippets: Option<Vec<crate::snippets::Kept>>,
    /// Where the text read in the image is, line by line and word by word,
    /// so the preview can let the person select it on the picture. Only from
    /// this extension's own read (`lib`'s `readImages` and `layout`): Lumi's
    /// `clipboard-ocr` event carries the text and nothing of where it was.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub ocr_layout: Option<Layout>,
}

/// The text in an image and where it is, in the image's pixels, origin at
/// its top-left. Each frame is `[x, y, width, height]`, rounded to a tenth
/// of a pixel: kept in the record, and the page draws them as shares of
/// `width` and `height` whatever size the picture is shown at.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Layout {
    pub width: u32,
    pub height: u32,
    pub lines: Vec<LayoutLine>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct LayoutLine {
    pub text: String,
    pub frame: [f32; 4],
    #[serde(default)]
    pub words: Vec<LayoutWord>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct LayoutWord {
    pub text: String,
    pub frame: [f32; 4],
}

impl Layout {
    /// Every line, one to a line of text — what Lumi's own reading says.
    pub fn text(&self) -> String {
        self.lines.iter().map(|line| line.text.as_str()).collect::<Vec<_>>().join("\n")
    }

    /// The words from `from` to `to`, each a `(line, word)` and either way
    /// round: words of one line joined by a space, lines by a newline — the
    /// text a person selecting across the picture means. A line without
    /// word boxes counts as one word, its whole text. `None` when either end
    /// is not a word of this layout.
    pub fn text_between(&self, from: (usize, usize), to: (usize, usize)) -> Option<String> {
        let words_in = |line: &LayoutLine| line.words.len().max(1);
        let valid = |(l, w): (usize, usize)| self.lines.get(l).is_some_and(|line| w < words_in(line));
        if !valid(from) || !valid(to) {
            return None;
        }
        let (first, last) = if from <= to { (from, to) } else { (to, from) };
        let mut lines = Vec::new();
        for l in first.0..=last.0 {
            let line = &self.lines[l];
            let start = if l == first.0 { first.1 } else { 0 };
            let end = if l == last.0 { last.1 } else { words_in(line) - 1 };
            if line.words.is_empty() {
                lines.push(line.text.clone());
            } else {
                lines.push(line.words[start..=end].iter().map(|w| w.text.as_str()).collect::<Vec<_>>().join(" "));
            }
        }
        Some(lines.join("\n"))
    }
}

/// The image rows still to be read, newest first, at most `most` — each as
/// its id and the image's blob. A row copied in the last `fresh_ms` is left
/// to Lumi, whose own reader is likely on it already.
pub fn unread_images(index: &Index, now: i64, fresh_ms: i64, most: usize) -> Vec<(String, String)> {
    let mut rows: Vec<&Entry> = index
        .items
        .iter()
        .filter(|e| e.kind == Kind::Image && !e.ocr && !e.ocr_read && now - e.first >= fresh_ms)
        .filter(|e| e.thumb.is_some())
        .collect();
    rows.sort_by_key(|e| std::cmp::Reverse(e.last));
    rows.into_iter().take(most).map(|e| (e.id.clone(), e.thumb.clone().unwrap_or_default())).collect()
}

/// Mark row `id` read, with `text` (empty when the image holds none) — the
/// row's own counterpart of [`add_ocr`]. `false` when the row is gone.
pub fn take_reading(index: &mut Index, id: &str, text: &str) -> bool {
    let Some(entry) = index.items.iter_mut().find(|e| e.id == id) else {
        return false;
    };
    entry.ocr_read = true;
    if !text.trim().is_empty() {
        entry.ocr_search = ocr_search_of(text);
        entry.ocr = true;
    }
    true
}

/// The person's settings, as far as the model cares.
#[derive(Debug, Clone)]
pub struct Rules {
    /// Unpinned items kept at most. Pins never count and are never evicted.
    pub size: usize,
    /// How long an unpinned row is kept after it was last copied, in ms;
    /// `None` for as long as `size` allows.
    pub keep_ms: Option<i64>,
    /// Bundle ids whose copies are dropped.
    pub ignore_apps: Vec<String>,
    /// Patterns; a copy whose text matches any of them is dropped.
    pub ignore_patterns: Vec<regex_lite::Regex>,
}

impl Rules {
    /// Compile the ignore list, one pattern per line. A line that does not
    /// compile is reported and skipped rather than failing the whole list —
    /// the rest of what somebody asked to keep out still is.
    pub fn new(size: usize, ignore_apps: Vec<String>, patterns: &str) -> (Self, Vec<String>) {
        let mut compiled = Vec::new();
        let mut refused = Vec::new();
        for line in patterns.lines().map(str::trim).filter(|l| !l.is_empty()) {
            match regex_lite::Regex::new(line) {
                Ok(re) => compiled.push(re),
                Err(err) => refused.push(format!("{line}: {err}")),
            }
        }
        (
            Rules {
                size: size.max(1),
                keep_ms: None,
                ignore_apps,
                ignore_patterns: compiled,
            },
            refused,
        )
    }
}

/// What applying one copy did, for the caller to carry out against storage.
#[derive(Debug, PartialEq)]
pub enum Outcome {
    /// Nothing kept. `blobs` are the ones Lumi wrote for this copy.
    Ignored { blobs: Vec<String> },
    /// Already in the history; that row moved to the top. `blobs` are the
    /// new copy's, which duplicate the kept row's and are not needed.
    Bumped { id: String, blobs: Vec<String> },
    /// A new row, whose record the caller writes. `evicted` are rows pushed
    /// out by the size limit: their records and blobs go.
    Inserted {
        id: String,
        record: Record,
        evicted: Vec<Entry>,
    },
}

/// Every blob id one copy refers to.
pub fn blobs_of(items: &[Vec<Rep>]) -> Vec<String> {
    items
        .iter()
        .flatten()
        .filter_map(|rep| rep.blob.clone())
        .collect()
}

/// Apply one copy to the index. `new_id` is used only if a row is added.
pub fn apply(index: &mut Index, copy: Copy, rules: &Rules, new_id: String) -> Outcome {
    let blobs = blobs_of(&copy.items);
    // Lumi's clock at the copy: what "older than" is measured from.
    let copy_at = copy.at;

    if ignored(&copy, rules) {
        return Outcome::Ignored { blobs };
    }

    // The same content again — including a paste from this very history,
    // which comes back as a copy with `origin` set — moves the row up and
    // counts it rather than adding a second one. Maccy's `supersedes`
    // compares representations one by one because it has no hash; Lumi's
    // canonical hash is that comparison done once, on its side.
    if let Some(entry) = index.items.iter_mut().find(|e| e.hash == copy.hash) {
        entry.last = entry.last.max(copy.at);
        entry.count = entry.count.saturating_add(1);
        if copy.origin.is_none() {
            // A copy made in another application says where it now lives.
            // A paste from here says only that it came from here.
            entry.app = copy.source.bundle_id.clone();
            entry.app_name = copy.source.name.clone();
        }
        return Outcome::Bumped {
            id: entry.id.clone(),
            blobs,
        };
    }

    let kind = kind_of(&copy.items);
    let entry = Entry {
        id: new_id.clone(),
        hash: copy.hash.clone(),
        pin: None,
        first: copy.at,
        last: copy.at,
        count: 1,
        app: copy.source.bundle_id.clone(),
        app_name: copy.source.name.clone(),
        kind,
        title: title_of(&copy.items, kind),
        search: search_of(&copy.items),
        ocr_search: copy.ocr.as_deref().map(ocr_search_of).unwrap_or_default(),
        ocr: copy.ocr.as_deref().is_some_and(|text| !text.trim().is_empty()),
        ocr_read: copy.ocr.is_some(),
        file_ext: if kind == Kind::File { file_ext_of(&copy.items) } else { String::new() },
        file_count: if kind == Kind::File { file_count_of(&copy.items) } else { 0 },
        thumb: copy
            .items
            .iter()
            .flatten()
            .find(|rep| uti::is_image(&rep.uti))
            .and_then(|rep| rep.blob.clone()),
        blobs,
    };
    index.v = INDEX_VERSION;
    // Nothing kept yet: nothing kept the old way, so nothing to read again.
    if index.items.is_empty() && index.trash.is_empty() {
        index.search_as_copied = true;
        index.upkeep = UPKEEP;
    }
    index.items.push(entry);
    let evicted = evict(index, rules.size, rules.keep_ms, copy_at);

    Outcome::Inserted {
        id: new_id,
        // Its links are `lib`'s to find, once, for the record it writes:
        // this runs again on every retry of the index write.
        record: Record {
            items: copy.items,
            ocr: copy.ocr.filter(|text| !text.trim().is_empty()),
            links: None,
            snippets: None,
            ocr_layout: None,
        },
        evicted,
    }
}

fn ignored(copy: &Copy, rules: &Rules) -> bool {
    if let Some(app) = &copy.source.bundle_id {
        // A paste from this history is never "a copy in an ignored app":
        // the person chose the row, wherever the caret was.
        if copy.origin.is_none() && rules.ignore_apps.iter().any(|a| a == app) {
            return true;
        }
    }
    if rules.ignore_patterns.is_empty() {
        return false;
    }
    let Some(text) = plain_text(&copy.items) else {
        return false;
    };
    rules.ignore_patterns.iter().any(|re| re.is_match(text))
}

/// Drop the unpinned rows last copied more than `keep_ms` before `now`,
/// then keep at most `size` of the rest, dropping the least recently copied.
/// Answers the rows removed. Pins are never dropped.
pub fn evict(index: &mut Index, size: usize, keep_ms: Option<i64>, now: i64) -> Vec<Entry> {
    let mut expired = Vec::new();
    if let Some(keep) = keep_ms {
        let cutoff = now.saturating_sub(keep);
        let (gone, kept): (Vec<Entry>, Vec<Entry>) = std::mem::take(&mut index.items)
            .into_iter()
            .partition(|e| e.pin.is_none() && e.last < cutoff);
        index.items = kept;
        expired = gone;
    }
    let unpinned = index.items.iter().filter(|e| e.pin.is_none()).count();
    if unpinned <= size {
        return expired;
    }
    let mut order: Vec<(i64, usize)> = index
        .items
        .iter()
        .enumerate()
        .filter(|(_, e)| e.pin.is_none())
        .map(|(i, e)| (e.last, i))
        .collect();
    order.sort();
    let mut doomed: Vec<usize> = order[..unpinned - size].iter().map(|(_, i)| *i).collect();
    doomed.sort_unstable_by(|a, b| b.cmp(a));
    let mut evicted: Vec<Entry> = doomed.into_iter().map(|i| index.items.remove(i)).collect();
    evicted.reverse();
    expired.extend(evicted);
    expired
}

/// Pin a row to the first free letter, or unpin it. Answers the letter it
/// now has, or `None` when it was unpinned or every letter is taken.
/// Add the text Lumi read in a copy's image to that row's search, by the
/// copy's hash. `false` when no row has it — the copy was ignored, or rolled
/// out of the history while the image was being read — which is nothing to
/// do, not an error. Appended, not replaced: the row may already be
/// searchable by its own text, and the image's words are extra ways in.
pub fn add_ocr(index: &mut Index, hash: &str, text: &str) -> bool {
    let Some(entry) = index.items.iter_mut().find(|e| e.hash == hash) else {
        return false;
    };
    entry.ocr_search = ocr_search_of(text);
    entry.ocr |= !text.trim().is_empty();
    entry.ocr_read = true;
    true
}

/// Move a pin off a letter no longer handed out — `y`, which pins used to
/// get before ⌘Y became the preview's, and `k`, which ⌘K's actions menu
/// always answered first — onto the first free one, so every pin keeps a
/// key that reaches it. Deterministic, so every read of the
/// same index agrees; the move is written with the next change. With no
/// letter free the pin keeps its old one: still pinned, and still first.
pub fn settle_pins(index: &mut Index) {
    let mut taken: Vec<char> = index
        .items
        .iter()
        .filter_map(|e| e.pin)
        .filter(|c| PIN_LETTERS.contains(*c))
        .collect();
    for entry in index.items.iter_mut() {
        let Some(old) = entry.pin else { continue };
        if PIN_LETTERS.contains(old) {
            continue;
        }
        if let Some(free) = PIN_LETTERS.chars().find(|c| !taken.contains(c)) {
            entry.pin = Some(free);
            taken.push(free);
        }
    }
}

pub fn toggle_pin(index: &mut Index, id: &str) -> Result<Option<char>, String> {
    let taken: Vec<char> = index.items.iter().filter_map(|e| e.pin).collect();
    let entry = index
        .items
        .iter_mut()
        .find(|e| e.id == id)
        .ok_or_else(|| "That item is no longer in the history.".to_string())?;
    if entry.pin.take().is_some() {
        return Ok(None);
    }
    let Some(letter) = PIN_LETTERS.chars().find(|c| !taken.contains(c)) else {
        return Err(format!(
            "All {} pins are in use. Unpin one first.",
            PIN_LETTERS.len()
        ));
    };
    entry.pin = Some(letter);
    Ok(Some(letter))
}

/// Remove one row. Answers it, so its record and blobs can go too.
pub fn remove(index: &mut Index, id: &str) -> Option<Entry> {
    let at = index.items.iter().position(|e| e.id == id)?;
    Some(index.items.remove(at))
}

/// Put one row's pin back as it was: `Some(letter)` pins it under that
/// letter — or the first free one, should another row have taken it
/// meanwhile — and `None` unpins it. Undo's half of `toggle_pin`.
pub fn set_pin(index: &mut Index, id: &str, pin: Option<char>) -> Result<Option<char>, String> {
    let taken: Vec<char> = index
        .items
        .iter()
        .filter(|e| e.id != id)
        .filter_map(|e| e.pin)
        .collect();
    let letter = match pin {
        None => None,
        Some(wanted) if PIN_LETTERS.contains(wanted) && !taken.contains(&wanted) => Some(wanted),
        Some(_) => Some(
            PIN_LETTERS
                .chars()
                .find(|c| !taken.contains(c))
                .ok_or_else(|| format!("All {} pins are in use. Unpin one first.", PIN_LETTERS.len()))?,
        ),
    };
    let entry = index
        .items
        .iter_mut()
        .find(|e| e.id == id)
        .ok_or_else(|| "That item is no longer in the history.".to_string())?;
    entry.pin = letter;
    Ok(letter)
}

/// Delete one row so it can still be undone: out of the history, into the
/// trash, its record and blobs left where they are.
pub fn trash(index: &mut Index, id: &str) -> bool {
    match remove(index, id) {
        Some(entry) => {
            index.trash.push(entry);
            true
        }
        None => false,
    }
}

/// Delete every row — or every unpinned one, `keep_pins` — so it can
/// still be undone: into the trash, as `trash` does one. Answers the ids.
pub fn trash_all(index: &mut Index, keep_pins: bool) -> Vec<String> {
    let (kept, gone): (Vec<Entry>, Vec<Entry>) = std::mem::take(&mut index.items)
        .into_iter()
        .partition(|e| keep_pins && e.pin.is_some());
    index.items = kept;
    let ids = gone.iter().map(|e| e.id.clone()).collect();
    index.trash.extend(gone);
    ids
}

/// The web address a link row is, for Open in browser.
pub fn link_of(items: &[Vec<Rep>]) -> Option<String> {
    let text = plain_text(items)?.trim();
    is_link(text).then(|| text.to_string())
}

/// The `file:` URL a file row carries, for Show in Finder — the first,
/// when several files were copied together.
pub fn file_url_of(items: &[Vec<Rep>]) -> Option<String> {
    items
        .iter()
        .flatten()
        .find(|rep| rep.uti == uti::FILE_URL)
        .and_then(|rep| rep.text.clone())
}

/// Where the copied files are, one path a line, for Copy path — `None` when
/// no file has one to give (a file-reference URL from an older copy, which
/// names a volume and an inode, not a place).
pub fn paths_text_of(items: &[Vec<Rep>]) -> Option<String> {
    let paths = file_paths(items);
    (!paths.is_empty()).then(|| paths.join("\n"))
}

/// The token to play the copied file with — of a copy of exactly one file,
/// since a preview plays one thing; `None` for several, for a file Lumi gave
/// no grant, and for a copy from before Lumi did.
pub fn file_token_of(items: &[Vec<Rep>]) -> Option<String> {
    let mut files = items.iter().flatten().filter(|rep| rep.uti == uti::FILE_URL);
    let only = files.next()?;
    if files.next().is_some() {
        return None;
    }
    only.file_token.clone()
}

/// How much the copied files weigh together, as Lumi measured them — `None`
/// unless every file has a size (a folder, or a copy from before Lumi
/// measured, has none), since a total missing a part would be wrong.
pub fn files_size_of(items: &[Vec<Rep>]) -> Option<u64> {
    let files: Vec<&Rep> = items.iter().flatten().filter(|rep| rep.uti == uti::FILE_URL).collect();
    if files.is_empty() {
        return None;
    }
    files.iter().map(|rep| rep.file_size).sum()
}

/// The image an image row carries, as the blob Lumi stored it in and the
/// file extension its type is saved under — for Save image as….
pub fn image_file_of(items: &[Vec<Rep>]) -> Option<(String, &'static str)> {
    items.iter().flatten().find_map(|rep| {
        let suffix = match rep.uti.as_str() {
            uti::PNG => "png",
            uti::JPEG => "jpg",
            uti::TIFF => "tiff",
            uti::HEIC => "heic",
            _ => return None,
        };
        rep.blob.clone().map(|blob| (blob, suffix))
    })
}

/// A file name for a saved copy out of what the panel suggests: kept to
/// one visible path component, as Lumi's Save panel takes it — no `/` or
/// `:` (Finder's own separator), no control characters, no leading dot —
/// and to a length that leaves the suffix room. `None` when nothing is left.
pub fn file_stem(suggested: &str) -> Option<String> {
    let cleaned: String = suggested
        .chars()
        .filter(|c| !c.is_control())
        .map(|c| if c == '/' || c == ':' { '-' } else { c })
        .take(200)
        .collect();
    let cleaned = cleaned.trim().trim_start_matches('.').trim();
    (!cleaned.is_empty()).then(|| cleaned.to_string())
}

/// What bringing a row back out of the trash came to.
#[derive(Debug, PartialEq)]
pub enum Restored {
    /// Back in the history, where it was.
    Back,
    /// The same thing was copied again since, and that row stands: this
    /// one is surplus — its record and blobs are to be deleted.
    Surplus(Box<Entry>),
    /// Not in the trash (already restored, or the trash was emptied).
    Gone,
}

pub fn restore(index: &mut Index, id: &str) -> Restored {
    let Some(at) = index.trash.iter().position(|e| e.id == id) else {
        return Restored::Gone;
    };
    let entry = index.trash.remove(at);
    if index.items.iter().any(|e| e.hash == entry.hash) {
        return Restored::Surplus(Box::new(entry));
    }
    index.items.push(entry);
    Restored::Back
}

/// Empty the trash, answering what was in it so it can be deleted for good.
pub fn empty_trash(index: &mut Index) -> Vec<Entry> {
    std::mem::take(&mut index.trash)
}


/// Rows in the order the panel draws them: pins first by letter, then the
/// rest by the chosen order.
pub fn sorted(index: &Index, order: Order) -> Vec<Entry> {
    let mut pins: Vec<Entry> = index.items.iter().filter(|e| e.pin.is_some()).cloned().collect();
    pins.sort_by_key(|e| e.pin);
    let mut rest: Vec<Entry> = index.items.iter().filter(|e| e.pin.is_none()).cloned().collect();
    match order {
        Order::LastCopied => rest.sort_by_key(|e| std::cmp::Reverse(e.last)),
        Order::FirstCopied => rest.sort_by_key(|e| std::cmp::Reverse(e.first)),
        Order::MostUsed => rest.sort_by(|a, b| b.count.cmp(&a.count).then(b.last.cmp(&a.last))),
    }
    pins.extend(rest);
    pins
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Order {
    LastCopied,
    FirstCopied,
    MostUsed,
}

impl Order {
    pub fn parse(word: &str) -> Order {
        match word {
            "first" => Order::FirstCopied,
            "used" => Order::MostUsed,
            _ => Order::LastCopied,
        }
    }
}

/// The representations a plain-text paste keeps: the text alone, or the
/// file URLs when that is all there is — a plain paste of copied files is
/// still the files, which is Maccy's #962.
pub fn plain(items: &[Vec<Rep>]) -> Vec<Vec<Rep>> {
    items
        .iter()
        .map(|item| {
            let text: Vec<Rep> = item.iter().filter(|r| r.uti == uti::TEXT).cloned().collect();
            if text.is_empty() {
                item.iter().filter(|r| r.uti == uti::FILE_URL).cloned().collect()
            } else {
                text
            }
        })
        .filter(|item: &Vec<Rep>| !item.is_empty())
        .collect()
}

/// How much text the preview pane is given. It shows a few lines; the rest
/// would be bytes across the bridge for nothing.
pub const PREVIEW_CHARS: usize = 4000;

/// The text the preview pane draws: the item's plain text, or its file
/// paths one per line. Empty for an image, which the pane draws from its
/// blob instead.
pub fn preview_text(items: &[Vec<Rep>]) -> String {
    let files = files_of(items);
    let text = if files.is_empty() {
        plain_text(items).unwrap_or_default().to_string()
    } else {
        // Each file where it is, or by name where Lumi could not say.
        let names = file_names(items);
        files
            .iter()
            .enumerate()
            .map(|(i, (path, _))| path.clone().or_else(|| names.get(i).cloned()).unwrap_or_else(|| "A file".to_string()))
            .collect::<Vec<_>>()
            .join("\n")
    };
    text.chars().take(PREVIEW_CHARS).collect()
}

/// Past this, a copy's HTML is not previewed: a whole web page copied
/// carries its styles and scripts, and the pane shows a few lines.
pub const PREVIEW_HTML_BYTES: usize = 256 * 1024;

/// The markup the preview pane draws a rich copy with: its HTML as copied,
/// or its RTF turned into HTML. `None` for anything else, or HTML too big
/// to be worth the bridge. The page draws it in a sandbox — it is whatever
/// the source app put on the pasteboard.
pub fn preview_html(items: &[Vec<Rep>]) -> Option<String> {
    let rep = |uti: &str| items.iter().flatten().find(|rep| rep.uti == uti).and_then(|rep| rep.text.as_deref());
    if let Some(html) = rep(uti::HTML).filter(|html| html.len() <= PREVIEW_HTML_BYTES) {
        return Some(html.to_string());
    }
    rep(uti::RTF).and_then(crate::rtf::to_html)
}

pub(crate) fn plain_text(items: &[Vec<Rep>]) -> Option<&str> {
    items
        .iter()
        .flatten()
        .find(|rep| rep.uti == uti::TEXT)
        .and_then(|rep| rep.text.as_deref())
}

/// Each copied file: its path when there is one to read — Lumi's, or the
/// URL's own for a plain `file:` URL — and whether it is a folder. A file
/// reference Lumi did not resolve (a copy from before it did, or of a file
/// since gone) has no path: `/.file/id=…` is not one worth showing.
fn files_of(items: &[Vec<Rep>]) -> Vec<(Option<String>, bool)> {
    items
        .iter()
        .flatten()
        .filter(|rep| rep.uti == uti::FILE_URL)
        .filter_map(|rep| {
            let url = rep.text.as_deref()?;
            let path = rep.path.clone().or_else(|| {
                let path = percent_decode(url.strip_prefix("file://").unwrap_or(url));
                (!path.starts_with("/.file/")).then_some(path)
            });
            Some((path, url.ends_with('/')))
        })
        .collect()
}

fn file_paths(items: &[Vec<Rep>]) -> Vec<String> {
    files_of(items).into_iter().filter_map(|(path, _)| path).collect()
}

/// The copied files' names, the way Finder shows them: off each path, or —
/// when a path is missing — the names Finder writes beside the URLs as the
/// copy's plain text, one per line.
fn file_names(items: &[Vec<Rep>]) -> Vec<String> {
    let files = files_of(items);
    let base = |path: &str| path.trim_end_matches('/').rsplit('/').next().unwrap_or_default().to_string();
    if files.iter().all(|(path, _)| path.is_some()) {
        return files.iter().filter_map(|(path, _)| path.as_deref().map(base)).collect();
    }
    match plain_text(items) {
        Some(text) => text.split(['\r', '\n']).map(str::trim).filter(|l| !l.is_empty()).map(str::to_string).collect(),
        None => files.iter().filter_map(|(path, _)| path.as_deref().map(base)).collect(),
    }
}

/// The one extension the copied files share, or `"/"` for folders; empty
/// when they differ or have none. Read off the name alone — nothing is
/// opened — and kept to a short run of letters and digits, since the page
/// picks an icon by it and shows it nowhere. A run of digits alone is no
/// extension: it is what a file reference (`/.file/id=1.2`) ends in.
pub fn file_ext_of(items: &[Vec<Rep>]) -> String {
    let files = files_of(items);
    // By name, so a file reference Lumi resolved — or whose name Finder
    // wrote beside it — has its extension too.
    let names = file_names(items);
    if names.len() != files.len() {
        return String::new();
    }
    let mut exts = names.iter().zip(&files).map(|(name, (_, folder))| {
        if *folder {
            return "/".to_string();
        }
        match name.rsplit_once('.') {
            Some((stem, ext)) if !stem.is_empty() && ext.len() <= 8
                && ext.chars().all(|c| c.is_ascii_alphanumeric())
                && ext.chars().any(|c| c.is_ascii_alphabetic()) => {
                ext.to_ascii_lowercase()
            }
            _ => String::new(),
        }
    });
    let first = exts.next().unwrap_or_default();
    if exts.all(|ext| ext == first) { first } else { String::new() }
}

/// One of several copied files, as the preview lists it.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileItem {
    pub name: String,
    /// The folder it is in, when Lumi knew where it was.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub dir: Option<String>,
    /// Its size in bytes, as Lumi measured it at the copy; a folder has none.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub size: Option<u64>,
    #[serde(skip_serializing_if = "is_false")]
    pub folder: bool,
}

/// The most files the preview lists; the rest are only counted.
pub const FILES_LISTED: usize = 200;

/// A copy of several files, one by one, for the preview's list — empty for
/// a copy of one file (or none), which the preview shows its own way.
pub fn files_list_of(items: &[Vec<Rep>]) -> Vec<FileItem> {
    let reps: Vec<&Rep> = items.iter().flatten().filter(|rep| rep.uti == uti::FILE_URL && rep.text.is_some()).collect();
    if reps.len() < 2 {
        return Vec::new();
    }
    let names = file_names(items);
    files_of(items)
        .into_iter()
        .zip(reps)
        .enumerate()
        .take(FILES_LISTED)
        .map(|(i, ((path, folder), rep))| {
            let trimmed = path.as_deref().map(|p| p.trim_end_matches('/'));
            let dir = trimmed.and_then(|p| p.rsplit_once('/')).map(|(dir, _)| if dir.is_empty() { "/" } else { dir }.to_string());
            let name = names
                .get(i)
                .cloned()
                .or_else(|| trimmed.and_then(|p| p.rsplit('/').next()).map(str::to_string))
                .unwrap_or_else(|| "A file".to_string());
            FileItem { name, dir, size: rep.file_size, folder }
        })
        .collect()
}

/// The `at`-th file of a copy of several, as an item of its own — its
/// `public.file-url` and the name Finder wrote beside it, nothing that
/// belongs to the other files — in `files_list_of`'s order, for a drag of
/// one line of the preview's list.
pub fn file_item_at(items: &[Vec<Rep>], at: usize) -> Option<Vec<Rep>> {
    let rep = items
        .iter()
        .flatten()
        .filter(|rep| rep.uti == uti::FILE_URL && rep.text.is_some())
        .nth(at)?;
    Some(vec![rep.clone()])
}

/// How many files a copy holds, for `Entry::file_count`: the count when it
/// is more than one, else 0.
pub fn file_count_of(items: &[Vec<Rep>]) -> u32 {
    match u32::try_from(files_of(items).len()).unwrap_or(u32::MAX) {
        0 | 1 => 0,
        n => n,
    }
}

pub fn kind_of(items: &[Vec<Rep>]) -> Kind {
    let utis: Vec<&str> = items.iter().flatten().map(|r| r.uti.as_str()).collect();
    if utis.contains(&uti::FILE_URL) {
        return Kind::File;
    }
    if utis.iter().any(|u| uti::is_image(u)) && plain_text(items).is_none() {
        return Kind::Image;
    }
    let plain = plain_text(items).map(str::trim);
    // Before the rich check: an editor or a browser writes HTML or RTF
    // beside a colour code too, and a styled `#378ADD` is still a colour.
    if plain.is_some_and(is_color) {
        return Kind::Color;
    }
    if utis.contains(&uti::HTML) || utis.contains(&uti::RTF) {
        return Kind::Rich;
    }
    match plain {
        Some(text) if is_link(text) => Kind::Link,
        _ => Kind::Text,
    }
}

/// One CSS colour and nothing else — what the panel draws as a swatch:
/// `#rgb`, `#rgba`, `#rrggbb` or `#rrggbbaa`; `rgb()`/`rgba()` and
/// `hsl()`/`hsla()` in either the comma or the space-and-slash syntax.
/// Colour names are left out: "red" or "tan" alone is as likely a word.
pub fn is_color(text: &str) -> bool {
    static COLOR: std::sync::OnceLock<regex_lite::Regex> = std::sync::OnceLock::new();
    COLOR
        .get_or_init(|| {
            let n = r"[+-]?(?:\d+(?:\.\d+)?|\.\d+)";
            let pct = format!(r"{n}%");
            let alpha = format!(r"(?:{n}%?|none)");
            let hue = format!(r"(?:{n}(?:deg|grad|rad|turn)?|none)");
            let any = format!(r"(?:{n}%?|none)");
            let hex = r"#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})";
            // Comma syntax: the three channels all numbers or all percents.
            let rgb_commas = format!(
                r"rgba?\(\s*(?:{n}\s*,\s*{n}\s*,\s*{n}|{pct}\s*,\s*{pct}\s*,\s*{pct})\s*(?:,\s*{n}%?\s*)?\)"
            );
            let rgb_spaces = format!(r"rgba?\(\s*{any}\s+{any}\s+{any}\s*(?:/\s*{alpha}\s*)?\)");
            let hsl_commas = format!(
                r"hsla?\(\s*{n}(?:deg|grad|rad|turn)?\s*,\s*{pct}\s*,\s*{pct}\s*(?:,\s*{n}%?\s*)?\)"
            );
            let hsl_spaces = format!(r"hsla?\(\s*{hue}\s+{any}\s+{any}\s*(?:/\s*{alpha}\s*)?\)");
            regex_lite::Regex::new(&format!(
                r"(?i)^(?:{hex}|{rgb_commas}|{rgb_spaces}|{hsl_commas}|{hsl_spaces})$"
            ))
            .expect("the colour pattern is fixed")
        })
        .is_match(text)
}

/// One web address and nothing else. Deliberately narrow: a row is drawn as
/// a link only when that is all it is.
fn is_link(text: &str) -> bool {
    (text.starts_with("https://") || text.starts_with("http://"))
        && text.len() > 8
        && !text.chars().any(char::is_whitespace)
}

pub fn title_of(items: &[Vec<Rep>], kind: Kind) -> String {
    let raw = match kind {
        // The file's name, as Finder lists it; its folder is the preview's.
        Kind::File => match file_names(items).as_slice() {
            [] => String::new(),
            [one] => one.clone(),
            [first, rest @ ..] => format!("{first} + {} more", rest.len()),
        },
        Kind::Image => "Image".to_string(),
        _ => plain_text(items).unwrap_or_default().to_string(),
    };
    one_line(&raw, TITLE_CHARS)
}

/// Kept as read, case and all: the panel folds it to search, and shows a
/// stretch of it on a row whose match is past its title.
pub fn ocr_search_of(text: &str) -> String {
    text.chars().take(SEARCH_CHARS).collect()
}

pub fn search_of(items: &[Vec<Rep>]) -> String {
    let mut text = String::new();
    if let Some(plain) = plain_text(items) {
        text.push_str(plain);
    }
    for path in file_paths(items) {
        text.push(' ');
        text.push_str(&path);
    }
    // As copied, case and all — `ocr_search_of`'s reason.
    text.chars().take(SEARCH_CHARS).collect()
}

/// A one-line title: leading and trailing whitespace off, line breaks and
/// tabs drawn as ⏎ and ⇥ so a multi-line copy still reads as one, runs of
/// spaces collapsed, and U+FFFC dropped. That last one is the placeholder
/// rich text leaves for an inline image, meaningless in a title — and on
/// macOS 26 two of them next to non-Latin text hang CoreText's truncation
/// (Maccy #1520), which a title drawn one line with an ellipsis is exactly.
pub fn one_line(raw: &str, limit: usize) -> String {
    let mut out = String::new();
    let mut space = false;
    for c in raw.trim().chars() {
        let mapped = match c {
            '\u{FFFC}' => continue,
            '\r' => continue,
            '\n' => '⏎',
            '\t' => '⇥',
            c => c,
        };
        if mapped == ' ' {
            if space {
                continue;
            }
            space = true;
        } else {
            space = false;
        }
        out.push(mapped);
        if out.chars().count() >= limit {
            out.push('…');
            break;
        }
    }
    out
}

fn percent_decode(text: &str) -> String {
    let bytes = text.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' {
            // `get`, not slicing: a `%` before a multi-byte character would
            // put the range mid-character, and a slice there panics.
            if let Some(Ok(byte)) = text.get(i + 1..i + 3).map(|hex| u8::from_str_radix(hex, 16)) {
                out.push(byte);
                i += 3;
                continue;
            }
        }
        out.push(bytes[i]);
        i += 1;
    }
    String::from_utf8_lossy(&out).into_owned()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn text(t: &str) -> Rep {
        Rep {
            uti: uti::TEXT.into(),
            text: Some(t.into()),
            blob: None,
            bytes: t.len() as u64,
            file_size: None,
            path: None, file_token: None,
        }
    }

    fn blob(u: &str, id: &str) -> Rep {
        Rep {
            uti: u.into(),
            text: None,
            blob: Some(id.into()),
            bytes: 10,
            file_size: None,
            path: None, file_token: None,
        }
    }

    fn copy(hash: &str, at: i64, reps: Vec<Rep>) -> Copy {
        Copy {
            v: 1,
            at,
            hash: hash.into(),
            source: Source {
                bundle_id: Some("com.apple.Safari".into()),
                name: Some("Safari".into()),
            },
            origin: None,
            items: vec![reps],
            ocr: None,
        }
    }

    fn rules(size: usize) -> Rules {
        Rules::new(size, vec![], "").0
    }

    #[test]
    fn rows_older_than_the_keep_go_but_pins_stay() {
        let mut index = Index::default();
        let mut keep = rules(10);
        keep.keep_ms = Some(100);
        apply(&mut index, copy("h1", 1, vec![text("old")]), &keep, "a".into());
        apply(&mut index, copy("h2", 2, vec![text("pinned")]), &keep, "b".into());
        toggle_pin(&mut index, "b").unwrap();
        let out = apply(&mut index, copy("h3", 150, vec![text("recent")]), &keep, "c".into());
        let Outcome::Inserted { evicted, .. } = out else { panic!("{out:?}") };
        assert_eq!(evicted.iter().map(|e| e.id.as_str()).collect::<Vec<_>>(), vec!["a"]);
        let ids: Vec<&str> = index.items.iter().map(|e| e.id.as_str()).collect();
        assert_eq!(ids, vec!["b", "c"]);
        // Nothing new: the clock alone moves the cutoff.
        let gone = evict(&mut index, 10, Some(100), 251);
        assert_eq!(gone.iter().map(|e| e.id.as_str()).collect::<Vec<_>>(), vec!["c"]);
    }

    #[test]
    fn a_new_copy_is_inserted_with_its_title_and_kind() {
        let mut index = Index::default();
        let out = apply(&mut index, copy("h1", 1, vec![text("  hello\nworld ")]), &rules(10), "a".into());
        assert!(matches!(out, Outcome::Inserted { ref id, .. } if id == "a"));
        let e = &index.items[0];
        assert_eq!(e.title, "hello⏎world");
        assert_eq!(e.kind, Kind::Text);
        assert_eq!(e.search, "  hello\nworld ");
    }

    #[test]
    fn the_same_content_bumps_rather_than_duplicates() {
        let mut index = Index::default();
        apply(&mut index, copy("h1", 1, vec![text("x")]), &rules(10), "a".into());
        let out = apply(&mut index, copy("h1", 5, vec![blob(uti::PNG, "dup")]), &rules(10), "b".into());
        assert_eq!(out, Outcome::Bumped { id: "a".into(), blobs: vec!["dup".into()] });
        assert_eq!(index.items.len(), 1);
        assert_eq!(index.items[0].count, 2);
        assert_eq!(index.items[0].last, 5);
        assert_eq!(index.items[0].first, 1);
    }

    #[test]
    fn a_paste_from_here_keeps_the_row_s_application() {
        let mut index = Index::default();
        apply(&mut index, copy("h1", 1, vec![text("x")]), &rules(10), "a".into());
        let mut again = copy("h1", 2, vec![text("x")]);
        again.origin = Some("dev.thiennguyen.clipboard".into());
        again.source.bundle_id = Some("com.apple.TextEdit".into());
        apply(&mut index, again, &rules(10), "b".into());
        assert_eq!(index.items[0].app.as_deref(), Some("com.apple.Safari"));
    }

    #[test]
    fn ignored_apps_and_patterns_drop_the_copy_and_hand_back_its_blobs() {
        let (r, refused) = Rules::new(10, vec!["com.apple.Safari".into()], "^secret\n(unclosed");
        assert_eq!(refused.len(), 1, "a bad line is reported, not fatal");
        let mut index = Index::default();
        let out = apply(&mut index, copy("h1", 1, vec![blob(uti::PNG, "p")]), &r, "a".into());
        assert_eq!(out, Outcome::Ignored { blobs: vec!["p".into()] });

        let (r, _) = Rules::new(10, vec![], "^secret");
        let out = apply(&mut index, copy("h2", 1, vec![text("secret sauce")]), &r, "a".into());
        assert!(matches!(out, Outcome::Ignored { .. }));
        assert!(index.items.is_empty());
    }

    #[test]
    fn eviction_drops_the_oldest_unpinned_and_never_a_pin() {
        let mut index = Index::default();
        apply(&mut index, copy("h1", 1, vec![text("one")]), &rules(2), "a".into());
        toggle_pin(&mut index, "a").unwrap();
        apply(&mut index, copy("h2", 2, vec![text("two")]), &rules(2), "b".into());
        apply(&mut index, copy("h3", 3, vec![text("three")]), &rules(2), "c".into());
        let out = apply(&mut index, copy("h4", 4, vec![blob(uti::PNG, "img")]), &rules(2), "d".into());
        let Outcome::Inserted { evicted, .. } = out else { panic!() };
        assert_eq!(evicted.iter().map(|e| e.id.as_str()).collect::<Vec<_>>(), ["b"]);
        let ids: Vec<&str> = index.items.iter().map(|e| e.id.as_str()).collect();
        assert_eq!(ids, ["a", "c", "d"]);
    }

    #[test]
    fn pins_take_free_letters_in_order_and_toggle_off() {
        let mut index = Index::default();
        for (i, id) in ["a", "b"].iter().enumerate() {
            apply(&mut index, copy(&format!("h{i}"), i as i64, vec![text(id)]), &rules(10), (*id).into());
        }
        assert_eq!(toggle_pin(&mut index, "a").unwrap(), Some('b'));
        assert_eq!(toggle_pin(&mut index, "b").unwrap(), Some('d'));
        assert_eq!(toggle_pin(&mut index, "a").unwrap(), None);
        assert_eq!(toggle_pin(&mut index, "a").unwrap(), Some('b'));
    }

    #[test]
    fn a_pin_on_a_letter_no_longer_handed_out_moves_to_a_free_one() {
        let mut index = Index::default();
        for (i, id) in ["a", "b", "c"].iter().enumerate() {
            apply(&mut index, copy(&format!("h{i}"), i as i64, vec![text(id)]), &rules(10), (*id).into());
        }
        toggle_pin(&mut index, "a").unwrap(); // b
        index.items.iter_mut().find(|e| e.id == "b").unwrap().pin = Some('y');
        settle_pins(&mut index);
        let pin = |id: &str| index.items.iter().find(|e| e.id == id).unwrap().pin;
        assert_eq!(pin("a"), Some('b'), "a pin on a letter still handed out stays");
        assert_eq!(pin("b"), Some('d'), "the pin on y takes the first free letter");
        assert_eq!(pin("c"), None);
    }

    /// Every ⌘-letter the panel answers before it looks for a row — its own
    /// keys (App.tsx `onKeyDown`) and the search field's — is one no row is
    /// pinned to: a pin there shows a key-cap that never pastes it.
    #[test]
    fn no_row_is_pinned_to_a_letter_the_panel_answers() {
        for taken in "ackpqvwxyz".chars() {
            assert!(!PIN_LETTERS.contains(taken), "⌘{taken} is the panel's");
        }
        assert_eq!(PIN_LETTERS.len(), 16);
    }

    /// Pins kept on `k` by older builds move off it when the index is read.
    #[test]
    fn a_pin_on_k_moves_to_a_letter_that_pastes() {
        let mut index = Index::default();
        for (i, id) in ["a", "b"].iter().enumerate() {
            apply(&mut index, copy(&format!("h{i}"), i as i64, vec![text(id)]), &rules(10), (*id).into());
        }
        toggle_pin(&mut index, "a").unwrap(); // b
        index.items.iter_mut().find(|e| e.id == "b").unwrap().pin = Some('k');
        settle_pins(&mut index);
        let pin = |id: &str| index.items.iter().find(|e| e.id == id).unwrap().pin;
        assert_eq!(pin("a"), Some('b'));
        assert_eq!(pin("b"), Some('d'), "off k, onto the first free letter");
    }

    #[test]
    fn kinds_are_told_apart() {
        assert_eq!(kind_of(&[vec![text("#378ADD")]]), Kind::Color);
        assert_eq!(kind_of(&[vec![text("#12g")]]), Kind::Text);
        assert_eq!(kind_of(&[vec![text("  #12345678\n")]]), Kind::Color);
        let html = |h: &str| Rep { uti: uti::HTML.into(), text: Some(h.into()), blob: None, bytes: 8, file_size: None, path: None, file_token: None };
        assert_eq!(
            kind_of(&[vec![text("#12345678"), html("<span>#12345678</span>")]]),
            Kind::Color,
            "a colour copied from an editor, HTML and all, is still a colour"
        );
        assert_eq!(kind_of(&[vec![text("https://github.com/p0deje/Maccy")]]), Kind::Link);
        assert_eq!(kind_of(&[vec![text("see https://x.y")]]), Kind::Text);
        assert_eq!(kind_of(&[vec![blob(uti::PNG, "p")]]), Kind::Image);
        assert_eq!(
            kind_of(&[vec![text("b"), Rep { uti: uti::HTML.into(), text: Some("<b>b</b>".into()), blob: None, bytes: 8, file_size: None, path: None, file_token: None }]]),
            Kind::Rich
        );
        let file = Rep { uti: uti::FILE_URL.into(), text: Some("file:///Users/me/a%20b.txt".into()), blob: None, bytes: 0, file_size: None, path: None, file_token: None };
        assert_eq!(kind_of(&[vec![file.clone()]]), Kind::File);
        assert_eq!(title_of(&[vec![file]], Kind::File), "a b.txt");
    }

    #[test]
    fn colours_are_css_colour_values_and_nothing_else() {
        for yes in [
            "#abc", "#ABCD", "#378ADD", "#12345678",
            "rgb(255, 0, 0)", "rgba(255,0,0,0.5)", "rgb(100%, 0%, 0%)", "rgba(0, 0, 0, 50%)",
            "rgb(255 0 0)", "rgb(255 0 0 / 0.5)", "RGB(10% 20% 30% / 40%)", "rgb(none 0 0)",
            "hsl(120, 100%, 50%)", "hsla(120deg, 100%, 50%, .3)", "hsl(0.5turn 60% 40%)",
            "hsl(120 100 50 / 50%)", "hsl(-30 50% 50%)",
        ] {
            assert!(is_color(yes), "{yes}");
        }
        for no in [
            "#12", "#12345", "#1234567", "#123456789", "#12g", "123456", "red",
            "rgb(255, 0)", "rgb(255, 0%, 0)", "rgb(255, 0, 0", "rgb(a, b, c)", "rgb(255 0 0) x",
            "hsl(120, 100, 50)", "hsl(120 100% 50%) / 1", "rgb()", "color: #fff",
        ] {
            assert!(!is_color(no), "{no}");
        }
    }

    #[test]
    fn titles_are_one_line_capped_and_free_of_object_placeholders() {
        assert_eq!(one_line("a\u{FFFC}\u{FFFC}b   c\td", 100), "ab c⇥d");
        let long = "x".repeat(300);
        assert_eq!(one_line(&long, TITLE_CHARS).chars().count(), TITLE_CHARS + 1);
    }

    #[test]
    fn image_text_is_searchable() {
        let mut index = Index::default();
        let mut c = copy("h1", 1, vec![blob(uti::PNG, "p")]);
        c.ocr = Some("Search History".into());
        apply(&mut index, c, &rules(10), "a".into());
        assert_eq!(index.items[0].ocr_search, "Search History", "kept as read");
        assert_eq!(index.items[0].thumb.as_deref(), Some("p"));
    }

    /// Finder's file references read by the path Lumi resolved, or — for a
    /// copy from before it did — by the names Finder wrote beside them;
    /// the id itself is never shown.
    #[test]
    fn a_file_reads_by_its_name_and_previews_by_its_path() {
        let reference = |id: &str, path: Option<&str>| Rep {
            uti: uti::FILE_URL.into(),
            text: Some(format!("file:///.file/id=6571367.{id}")),
            blob: None,
            bytes: 30,
            file_size: None,
            path: path.map(str::to_string),
            file_token: None,
        };
        let resolved = [vec![reference("1", Some("/Users/me/Movies/brag2.mp4"))]];
        assert_eq!(title_of(&resolved, Kind::File), "brag2.mp4");
        assert_eq!(preview_text(&resolved), "/Users/me/Movies/brag2.mp4");
        assert_eq!(file_ext_of(&resolved), "mp4");

        let two = [
            vec![reference("1", Some("/a/brag2.mp4")), text("brag2.mp4\rnotes.txt")],
            vec![reference("2", Some("/b/notes.txt"))],
        ];
        assert_eq!(title_of(&two, Kind::File), "brag2.mp4 + 1 more");
        assert_eq!(preview_text(&two), "/a/brag2.mp4\n/b/notes.txt");
        assert!(search_of(&two).contains("/b/notes.txt"));

        let old = [vec![reference("1", None), text("brag2.mp4")]];
        assert_eq!(title_of(&old, Kind::File), "brag2.mp4");
        assert_eq!(preview_text(&old), "brag2.mp4");
        assert_eq!(file_ext_of(&old), "mp4");
        assert!(!title_of(&old, Kind::File).contains(".file/id"));
    }

    #[test]
    fn only_a_lone_file_with_a_grant_is_played() {
        let file = |token: Option<&str>| Rep {
            uti: uti::FILE_URL.into(),
            text: Some("file:///a/x.mp4".into()),
            blob: None,
            bytes: 0,
            file_size: None,
            path: None,
            file_token: token.map(str::to_string),
        };
        assert_eq!(file_token_of(&[vec![file(Some("t1"))]]), Some("t1".to_string()));
        assert_eq!(file_token_of(&[vec![file(None)]]), None);
        assert_eq!(file_token_of(&[vec![file(Some("t1"))], vec![file(Some("t2"))]]), None);
        assert_eq!(file_token_of(&[vec![text("x")]]), None);
    }

    #[test]
    fn files_share_an_extension_or_have_none() {
        let file = |url: &str| vec![Rep { uti: uti::FILE_URL.into(), text: Some(url.into()), blob: None, bytes: 0, file_size: None, path: None, file_token: None }];
        let ext = |urls: &[&str]| file_ext_of(&urls.iter().map(|u| file(u)).collect::<Vec<_>>());
        assert_eq!(ext(&["file:///a/Talk%20Final.PDF"]), "pdf");
        assert_eq!(ext(&["file:///a/x.mp4", "file:///b/y.MP4"]), "mp4");
        assert_eq!(ext(&["file:///a/x.mp4", "file:///b/y.mp3"]), "");
        assert_eq!(ext(&["file:///a/folder/", "file:///b/other/"]), "/");
        assert_eq!(ext(&["file:///a/.zshrc"]), "");
        assert_eq!(ext(&["file:///.file/id=1.2"]), "");
        assert_eq!(ext(&["file:///a/README"]), "");
    }

    #[test]
    fn several_files_are_listed_by_name_folder_and_size() {
        let file = |url: &str, path: Option<&str>, size: Option<u64>| vec![Rep { uti: uti::FILE_URL.into(), text: Some(url.into()), blob: None, bytes: 0, file_size: size, path: path.map(str::to_string), file_token: None }];
        assert!(files_list_of(&[file("file:///a/x.mp4", None, Some(1))]).is_empty());
        let list = files_list_of(&[
            file("file:///.file/id=1.2", Some("/Users/me/Desktop/brag.mp4"), Some(2_000)),
            file("file:///Users/me/Downloads/lumi%20(2).log", None, Some(10)),
            file("file:///Users/me/Projects/", None, None),
            file("file:///top.txt", None, None),
        ]);
        assert_eq!(list.len(), 4);
        assert_eq!(list[0], FileItem { name: "brag.mp4".into(), dir: Some("/Users/me/Desktop".into()), size: Some(2_000), folder: false });
        assert_eq!(list[1].name, "lumi (2).log");
        assert_eq!(list[1].dir.as_deref(), Some("/Users/me/Downloads"));
        assert_eq!(list[2], FileItem { name: "Projects".into(), dir: Some("/Users/me".into()), size: None, folder: true });
        assert_eq!(list[3].dir.as_deref(), Some("/"));
    }

    #[test]
    fn one_file_of_several_is_its_own_item() {
        let file = |url: &str| Rep { uti: uti::FILE_URL.into(), text: Some(url.into()), blob: None, bytes: 0, file_size: None, path: None, file_token: None };
        let items = [vec![file("file:///a/x.mp4"), text("x.mp4\ry.log")], vec![file("file:///b/y.log")]];
        assert_eq!(file_item_at(&items, 0), Some(vec![file("file:///a/x.mp4")]));
        assert_eq!(file_item_at(&items, 1), Some(vec![file("file:///b/y.log")]));
        assert_eq!(file_item_at(&items, 2), None);
        assert_eq!(file_item_at(&[vec![text("x")]], 0), None);
    }

    #[test]
    fn only_several_files_are_counted() {
        let file = |url: &str| vec![Rep { uti: uti::FILE_URL.into(), text: Some(url.into()), blob: None, bytes: 0, file_size: None, path: None, file_token: None }];
        let count = |urls: &[&str]| file_count_of(&urls.iter().map(|u| file(u)).collect::<Vec<_>>());
        assert_eq!(count(&["file:///a/x.mp4"]), 0);
        assert_eq!(count(&["file:///a/x.mp4", "file:///b/y.mp4", "file:///c/z.log"]), 3);
        assert_eq!(count(&["file:///a/", "file:///b/"]), 2);
        assert_eq!(file_count_of(&[vec![text("x")]]), 0);
    }

    #[test]
    fn plain_keeps_text_or_files_only() {
        let html = Rep { uti: uti::HTML.into(), text: Some("<b>x</b>".into()), blob: None, bytes: 8, file_size: None, path: None, file_token: None };
        assert_eq!(plain(&[vec![text("x"), html.clone()]]), vec![vec![text("x")]]);
        let file = Rep { uti: uti::FILE_URL.into(), text: Some("file:///a".into()), blob: None, bytes: 0, file_size: None, path: None, file_token: None };
        assert_eq!(plain(&[vec![file.clone(), blob(uti::PNG, "p")]]), vec![vec![file]]);
        assert!(plain(&[vec![html]]).is_empty());
    }

    #[test]
    fn clear_keeps_pins_and_clear_all_does_not() {
        let mut index = Index::default();
        apply(&mut index, copy("h1", 1, vec![text("one")]), &rules(10), "a".into());
        apply(&mut index, copy("h2", 2, vec![text("two")]), &rules(10), "b".into());
        toggle_pin(&mut index, "b").unwrap();
        assert_eq!(trash_all(&mut index, true), vec!["a".to_string()]);
        assert_eq!(index.items[0].id, "b");
        assert_eq!(trash_all(&mut index, false), vec!["b".to_string()]);
        assert!(index.items.is_empty());
        assert_eq!(index.trash.len(), 2, "both can still come back");
    }

    #[test]
    fn a_link_and_a_file_are_found_for_their_actions() {
        assert_eq!(link_of(&[vec![text(" https://a.b/c ")]]), Some("https://a.b/c".to_string()));
        assert_eq!(link_of(&[vec![text("see https://a.b")]]), None);
        let file = Rep { uti: uti::FILE_URL.into(), text: Some("file:///.file/id=1.2".into()), blob: None, bytes: 0, file_size: None, path: None, file_token: None };
        assert_eq!(file_url_of(&[vec![file]]), Some("file:///.file/id=1.2".to_string()));
        assert_eq!(file_url_of(&[vec![text("x")]]), None);
    }

    #[test]
    fn sorted_puts_pins_first_then_the_chosen_order() {
        let mut index = Index::default();
        apply(&mut index, copy("h1", 1, vec![text("one")]), &rules(10), "a".into());
        apply(&mut index, copy("h2", 2, vec![text("two")]), &rules(10), "b".into());
        apply(&mut index, copy("h1", 3, vec![text("one")]), &rules(10), "x".into());
        apply(&mut index, copy("h3", 4, vec![text("three")]), &rules(10), "c".into());
        toggle_pin(&mut index, "b").unwrap();
        let ids = |o| sorted(&index, o).into_iter().map(|e| e.id).collect::<Vec<_>>();
        assert_eq!(ids(Order::LastCopied), ["b", "c", "a"]);
        assert_eq!(ids(Order::FirstCopied), ["b", "c", "a"]);
        assert_eq!(ids(Order::MostUsed), ["b", "a", "c"]);
    }
}
