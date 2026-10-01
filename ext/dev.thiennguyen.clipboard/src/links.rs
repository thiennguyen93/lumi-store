//! The web addresses in a copy, for the preview's list of links: what a
//! rich copy links to — its HTML's `<a href>`s, or its RTF's `HYPERLINK`
//! fields — and every address written out in its text.
//!
//! **Found here, not in the page.** The page lists what this finds, and
//! Open in browser names one of them back; `lib.rs` opens it only when it
//! is still one of the links this finds in the stored item. So a click
//! opens only an address that was copied, whatever the page sends.
//!
//! **Found once.** A copy never changes, so its links are found when it is
//! kept and stored in its record ([`KeptLinks`]); a preview reads them
//! back. A record kept before that, or by older rules ([`LINKS_VERSION`]),
//! has them found again, once, the first time it is previewed.
//!
//! Only `http:` and `https:` addresses are links here — `mailto:`, a
//! `javascript:` href, a page-relative one are not something to hand the
//! browser — plus `www.` written without a scheme, as every linkifier
//! takes it. A bare `example.com` is not one: a file name or a version
//! number looks just like it.

use crate::history::{kind_of, uti, Kind, Rep};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// The rules a record's kept links were found by. Bumped whenever what
/// `links_of` finds changes, so that links kept by older rules are found
/// again rather than shown as they were.
pub const LINKS_VERSION: u32 = 1;

/// A web address a copy links to or writes out.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Link {
    pub url: String,
    /// The words it is linked under in a rich copy, when they are not the
    /// address itself.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub text: Option<String>,
}

/// What a record keeps of its links: those the preview lists, and how many
/// there are in all, found by rules `v`.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct KeptLinks {
    pub v: u32,
    /// The first `LINKS_LISTED` — all the preview shows, and so all a click
    /// can ask to open.
    pub list: Vec<Link>,
    /// Every one found, up to `LINKS_FOUND`.
    pub count: usize,
}

impl KeptLinks {
    /// Found by the rules this build has.
    pub fn current(&self) -> bool {
        self.v == LINKS_VERSION
    }
}

/// The links to keep with a copy: a text or rich copy's; none for any other
/// kind — a link row is its one address, and a file row's text is names.
pub fn kept(items: &[Vec<Rep>]) -> KeptLinks {
    let mut list = match kind_of(items) {
        Kind::Text | Kind::Rich => links_of(items),
        _ => Vec::new(),
    };
    let count = list.len();
    list.truncate(LINKS_LISTED);
    KeptLinks { v: LINKS_VERSION, list, count }
}

/// The most links the preview lists; the rest are only counted.
pub const LINKS_LISTED: usize = 50;

/// The most links looked for in one copy: a pasted crawl of a thousand
/// addresses is counted this far and no further.
pub const LINKS_FOUND: usize = 500;

/// How many characters of a link's words are kept.
const TEXT_CHARS: usize = 200;

/// An address longer than this is not one a browser takes.
const URL_BYTES: usize = 8 * 1024;

/// Every web address in the item, first seen first: a rich copy's links
/// (its HTML's, else its RTF's), then what its plain text writes out. The
/// same address twice is one link — with the words of whichever said them.
pub fn links_of(items: &[Vec<Rep>]) -> Vec<Link> {
    let rep = |kind: &str| items.iter().flatten().find(|rep| rep.uti == kind).and_then(|rep| rep.text.as_deref());
    let mut found = Found::default();
    if let Some(html) = rep(uti::HTML) {
        anchors(html, &mut found);
    } else if let Some(links) = rep(uti::RTF).and_then(crate::rtf::links) {
        for (address, text) in links {
            if !found.add(&address, Some(&text)) {
                break;
            }
        }
    }
    if let Some(text) = rep(uti::TEXT) {
        written(text, &mut found);
    }
    found.links
}

/// The web addresses written out in a piece of plain text — what a snippet
/// expands to — first seen first, as many as the preview lists.
pub fn in_text(text: &str) -> Vec<Link> {
    let mut found = Found::default();
    written(text, &mut found);
    found.links.truncate(LINKS_LISTED);
    found.links
}

/// Whether `url` is a web address exactly as written: what the page may
/// name for a link it was shown but this side cannot find again.
pub fn is_web_address(url: &str) -> bool {
    web_address(url).as_deref() == Some(url)
}

/// The address as macOS's `NSURL` takes it on every macOS Lumi runs on:
/// what follows the host percent-encoded where it is not plain ASCII — a
/// Vietnamese word in a path, a space — which macOS 14 does by itself and
/// earlier versions refuse the whole address over. What is already
/// percent-encoded stays as it is.
pub fn for_opening(url: &str) -> String {
    let after_scheme = url.find("://").map_or(0, |at| at + 3);
    let host_end = url[after_scheme..].find(['/', '?', '#']).map_or(url.len(), |at| after_scheme + at);
    let mut out = url[..host_end].to_string();
    for c in url[host_end..].chars() {
        if c.is_ascii_graphic() && !matches!(c, '"' | '<' | '>' | '\\' | '^' | '`' | '{' | '|' | '}') {
            out.push(c);
        } else {
            let mut buf = [0u8; 4];
            for byte in c.encode_utf8(&mut buf).bytes() {
                out.push_str(&format!("%{byte:02X}"));
            }
        }
    }
    out
}

#[derive(Default)]
struct Found {
    links: Vec<Link>,
    /// Each address's place in `links`, by `same_address`.
    seen: HashMap<String, usize>,
}

impl Found {
    /// One more address, if it is a web one; `false` once there is no room
    /// for more.
    fn add(&mut self, raw: &str, text: Option<&str>) -> bool {
        let Some(url) = web_address(raw) else {
            return self.links.len() < LINKS_FOUND;
        };
        let text = text.map(words).filter(|text| !text.is_empty() && same_address(text) != same_address(&url));
        let key = same_address(&url);
        match self.seen.get(&key) {
            Some(&at) => {
                let link = &mut self.links[at];
                if link.text.is_none() {
                    link.text = text;
                }
            }
            None if self.links.len() < LINKS_FOUND => {
                self.seen.insert(key, self.links.len());
                self.links.push(Link { url, text });
            }
            None => {}
        }
        self.links.len() < LINKS_FOUND
    }
}

/// An `http:` or `https:` address with a host, tidied the way a browser
/// tidies an href — tabs and line breaks dropped, the ends trimmed — or
/// `None` for anything else.
fn web_address(raw: &str) -> Option<String> {
    let url: String = raw.chars().filter(|c| !matches!(c, '\t' | '\n' | '\r')).collect();
    let url = url.trim();
    let rest = strip_prefix_ci(url, "https://").or_else(|| strip_prefix_ci(url, "http://"))?;
    let host = rest.split(['/', '?', '#']).next().unwrap_or_default();
    let fine = !host.is_empty()
        && url.len() <= URL_BYTES
        && !url.chars().any(|c| c.is_whitespace() || c.is_control());
    fine.then(|| url.to_string())
}

/// What two spellings of one address have in common: no scheme, no `www.`,
/// no trailing slash, the host in lowercase — so `https://lumikeys.app/`
/// linked under "lumikeys.app" and written out again further down is one
/// link, not three.
fn same_address(text: &str) -> String {
    let rest = strip_prefix_ci(text, "https://").or_else(|| strip_prefix_ci(text, "http://")).unwrap_or(text);
    let rest = strip_prefix_ci(rest, "www.").unwrap_or(rest);
    let rest = rest.trim_end_matches('/');
    let host_end = rest.find(['/', '?', '#']).unwrap_or(rest.len());
    format!("{}{}", rest[..host_end].to_lowercase(), &rest[host_end..])
}

fn strip_prefix_ci<'a>(text: &'a str, prefix: &str) -> Option<&'a str> {
    text.get(..prefix.len()).filter(|head| head.eq_ignore_ascii_case(prefix)).map(|_| &text[prefix.len()..])
}

/// The `<a href>`s of a copy's HTML, with the words inside each. Read with
/// a scanner rather than a parser: this wants the links, not the page, and
/// a tag cut off or left open costs one link at most.
fn anchors(html: &str, found: &mut Found) {
    // ASCII-lowercased, so every byte offset into it is one into `html`.
    let lower = html.to_ascii_lowercase();
    let mut at = 0;
    while let Some(open) = lower[at..].find("<a") {
        let start = at + open + 2;
        at = start;
        // `<a href…>`, not `<abbr>`, `<audio>` or a bare `<a>`.
        if !lower.as_bytes().get(start).is_some_and(u8::is_ascii_whitespace) {
            continue;
        }
        let Some(tag_end) = tag_end(&lower, start) else { break };
        let body_end = lower[tag_end..].find("</a").map_or(tag_end, |end| tag_end + end);
        if let Some(href) = attribute(&html[start..tag_end - 1], "href") {
            if !found.add(&decode(&href), Some(&decode(&strip_tags(&html[tag_end..body_end])))) {
                return;
            }
        }
        at = tag_end;
    }
}

/// Just past the `>` that ends a tag whose attributes start at `from`, a
/// `>` inside a quoted value not counting.
fn tag_end(lower: &str, from: usize) -> Option<usize> {
    let mut quote = None;
    for (i, byte) in lower.bytes().enumerate().skip(from) {
        match (quote, byte) {
            (Some(q), b) if b == q => quote = None,
            (None, b'"' | b'\'') => quote = Some(byte),
            (None, b'>') => return Some(i + 1),
            _ => {}
        }
    }
    None
}

/// The value of attribute `name` in a tag's attributes, as written —
/// quoted with either quote, or bare.
fn attribute(attrs: &str, name: &str) -> Option<String> {
    let bytes = attrs.as_bytes();
    let mut i = 0;
    while i < bytes.len() {
        // The attribute's name.
        while i < bytes.len() && (bytes[i].is_ascii_whitespace() || bytes[i] == b'/') {
            i += 1;
        }
        let name_start = i;
        while i < bytes.len() && !bytes[i].is_ascii_whitespace() && !matches!(bytes[i], b'=' | b'/') {
            i += 1;
        }
        let this = &attrs[name_start..i];
        while i < bytes.len() && bytes[i].is_ascii_whitespace() {
            i += 1;
        }
        // No `=`: a bare attribute, no value.
        if bytes.get(i) != Some(&b'=') {
            if i == name_start {
                i += 1;
            }
            continue;
        }
        i += 1;
        while i < bytes.len() && bytes[i].is_ascii_whitespace() {
            i += 1;
        }
        let value = match bytes.get(i) {
            Some(&q @ (b'"' | b'\'')) => {
                let end = attrs[i + 1..].find(q as char).map_or(attrs.len(), |end| i + 1 + end);
                let value = &attrs[i + 1..end];
                i = end + 1;
                value
            }
            _ => {
                let end = attrs[i..].find(|c: char| c.is_ascii_whitespace()).map_or(attrs.len(), |end| i + end);
                let value = &attrs[i..end];
                i = end;
                value
            }
        };
        if this.eq_ignore_ascii_case(name) {
            return Some(value.to_string());
        }
    }
    None
}

/// The text of some HTML, its tags left out.
fn strip_tags(html: &str) -> String {
    let mut out = String::new();
    let mut in_tag = false;
    for c in html.chars() {
        match c {
            '<' => in_tag = true,
            '>' if in_tag => {
                in_tag = false;
                out.push(' ');
            }
            c if !in_tag => out.push(c),
            _ => {}
        }
    }
    out
}

/// HTML's character references: numeric ones, and the named ones a copy's
/// links and their words actually carry. Anything else is left as written.
fn decode(text: &str) -> String {
    const NAMED: &[(&str, &str)] = &[
        ("amp", "&"), ("lt", "<"), ("gt", ">"), ("quot", "\""), ("apos", "'"), ("nbsp", "\u{a0}"),
        ("ndash", "–"), ("mdash", "—"), ("hellip", "…"), ("lsquo", "‘"), ("rsquo", "’"),
        ("ldquo", "“"), ("rdquo", "”"), ("middot", "·"), ("bull", "•"), ("copy", "©"), ("reg", "®"),
        ("trade", "™"),
    ];
    let mut out = String::with_capacity(text.len());
    let mut rest = text;
    while let Some(amp) = rest.find('&') {
        out.push_str(&rest[..amp]);
        rest = &rest[amp..];
        let Some(semi) = rest[1..].find(';').map(|at| at + 1).filter(|&at| at <= 12) else {
            out.push('&');
            rest = &rest[1..];
            continue;
        };
        let name = &rest[1..semi];
        let number = |digits: &str, radix| u32::from_str_radix(digits, radix).ok().and_then(char::from_u32);
        let decoded = match name.strip_prefix('#') {
            Some(hex) if hex.starts_with(['x', 'X']) => number(&hex[1..], 16).map(String::from),
            Some(dec) => number(dec, 10).map(String::from),
            None => NAMED.iter().find(|(n, _)| *n == name).map(|(_, c)| c.to_string()),
        };
        match decoded {
            Some(c) => {
                out.push_str(&c);
                rest = &rest[semi + 1..];
            }
            None => {
                out.push('&');
                rest = &rest[1..];
            }
        }
    }
    out.push_str(rest);
    out
}

/// A link's words on one line: runs of whitespace one space, the ends
/// trimmed, at most `TEXT_CHARS` of them.
fn words(text: &str) -> String {
    let mut out = String::new();
    for (n, word) in text.split_whitespace().enumerate() {
        if n > 0 {
            out.push(' ');
        }
        out.push_str(word);
    }
    if out.chars().count() > TEXT_CHARS {
        out = out.chars().take(TEXT_CHARS).collect::<String>() + "…";
    }
    out
}

/// The addresses written out in text: from `http://`, `https://` or `www.`
/// at the start of a word, up to the first space or character no address
/// is written with, less the punctuation of the sentence it ends.
fn written(text: &str, found: &mut Found) {
    static START: std::sync::OnceLock<regex_lite::Regex> = std::sync::OnceLock::new();
    let start = START.get_or_init(|| regex_lite::Regex::new(r"(?i)https?://|www\.").expect("the link pattern is fixed"));
    let mut at = 0;
    while let Some(m) = start.find_at(text, at) {
        let begin = m.start();
        at = m.end();
        // Inside a word, an address or an e-mail: `xhttps://`, `a.www.b`,
        // `me@www.example.com`, `ftp://www.…`.
        if text[..begin].chars().next_back().is_some_and(|c| c.is_alphanumeric() || matches!(c, '.' | '@' | '/' | '-' | '_' | '+')) {
            continue;
        }
        let end = begin + text[begin..].find(not_in_address).unwrap_or(text.len() - begin);
        let address = trimmed(&text[begin..end]);
        at = begin + address.len().max(m.len());
        let url = if address.len() >= 4 && address[..4].eq_ignore_ascii_case("www.") {
            // `www.` alone, or `www..x`, is no address.
            if address.len() == 4 || address[4..].starts_with('.') {
                continue;
            }
            format!("https://{address}")
        } else {
            address.to_string()
        };
        if !found.add(&url, None) {
            return;
        }
    }
}

/// A character an address written in text ends before: a space, a control
/// character, one of the few ASCII ones an address is never written with,
/// or the CJK and typographic punctuation a sentence closes it with.
fn not_in_address(c: char) -> bool {
    c.is_whitespace()
        || c.is_control()
        || matches!(c, '<' | '>' | '"' | '`' | '{' | '}' | '|' | '\\' | '^')
        || matches!(
            c,
            '“' | '”' | '‘' | '’' | '«' | '»' | '…' | '、' | '。' | '，' | '；' | '：' | '！' | '？' | '「' | '」'
                | '『' | '』' | '（' | '）' | '【' | '】' | '〈' | '〉' | '《' | '》'
        )
}

/// An address less what ends the sentence around it: a full stop, a comma,
/// a quote — and a closing bracket it never opened, as in "(see
/// https://example.com/a)", while `…/Rust_(programming_language)` keeps
/// its own.
fn trimmed(address: &str) -> &str {
    let mut address = address;
    loop {
        let Some(last) = address.chars().next_back() else { return address };
        let unopened = |open: char, close: char| {
            last == close && address.matches(close).count() > address.matches(open).count()
        };
        if matches!(last, '.' | ',' | ':' | ';' | '!' | '?' | '\'' | '*' | '~')
            || unopened('(', ')')
            || unopened('[', ']')
        {
            address = &address[..address.len() - last.len_utf8()];
        } else {
            return address;
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn rep(kind: &str, text: &str) -> Rep {
        Rep {
            uti: kind.into(),
            text: Some(text.into()),
            blob: None,
            bytes: text.len() as u64,
            file_size: None,
            path: None,
            file_token: None,
        }
    }

    fn urls(items: &[Vec<Rep>]) -> Vec<String> {
        links_of(items).into_iter().map(|link| link.url).collect()
    }

    fn in_text(text: &str) -> Vec<String> {
        urls(&[vec![rep(uti::TEXT, text)]])
    }

    #[test]
    fn every_address_written_in_text_is_a_link_in_order() {
        assert_eq!(
            in_text("Docs at https://lumikeys.app/docs, code on http://github.com/x/y.\nAlso www.example.com!"),
            vec!["https://lumikeys.app/docs", "http://github.com/x/y", "https://www.example.com"],
        );
    }

    #[test]
    fn the_sentence_around_an_address_is_not_part_of_it() {
        assert_eq!(in_text("(see https://example.com/a)"), vec!["https://example.com/a"]);
        assert_eq!(
            in_text("https://en.wikipedia.org/wiki/Rust_(programming_language)."),
            vec!["https://en.wikipedia.org/wiki/Rust_(programming_language)"],
        );
        assert_eq!(in_text("[docs](https://thiennguyen.dev) and <https://a.test/b>"), vec!["https://thiennguyen.dev", "https://a.test/b"]);
        assert_eq!(in_text("“https://a.test/x”, 「https://b.test」"), vec!["https://a.test/x", "https://b.test"]);
        assert_eq!(in_text("'https://a.test/q?x=1&y=2#top'"), vec!["https://a.test/q?x=1&y=2#top"]);
    }

    #[test]
    fn an_address_keeps_its_own_letters_whatever_the_script() {
        assert_eq!(in_text("Xem https://vi.wikipedia.org/wiki/Việt_Nam nhé"), vec!["https://vi.wikipedia.org/wiki/Việt_Nam"]);
    }

    #[test]
    fn what_only_looks_like_an_address_is_not_one() {
        let none: Vec<String> = Vec::new();
        assert_eq!(in_text("xhttps://a.test me@www.example.com ftp://www.a.test a.www.b"), none);
        assert_eq!(in_text("https:// and http:/// and www. alone, example.com/docs"), none);
    }

    #[test]
    fn the_same_address_twice_is_one_link() {
        assert_eq!(
            in_text("https://lumikeys.app https://lumikeys.app/ http://LUMIKEYS.app www.lumikeys.app"),
            vec!["https://lumikeys.app"],
        );
    }

    #[test]
    fn a_rich_copy_s_links_come_with_their_words_and_its_text_s_after() {
        let html = r#"<p>Read <a class="x" href="https://lumikeys.app/docs?a=1&amp;b=2">the &ldquo;docs&rdquo;</a>,
            <A HREF='https://github.com/thiennguyen93'><b>my</b>
            GitHub</A>, <a href=https://bare.test/x>https://bare.test/x</a>
            <a href="/relative">here</a> <a href="javascript:alert(1)">evil</a> <a href="mailto:a@b.c">mail</a>
            <a name="top">no href</a> <abbr title="x">abbr</abbr></p>"#;
        let links = links_of(&[vec![
            rep(uti::HTML, html),
            rep(uti::TEXT, "Read the “docs”, my GitHub https://bare.test/x and https://plain.test"),
        ]]);
        assert_eq!(
            links,
            vec![
                Link { url: "https://lumikeys.app/docs?a=1&b=2".into(), text: Some("the “docs”".into()) },
                Link { url: "https://github.com/thiennguyen93".into(), text: Some("my GitHub".into()) },
                // Its words are its address: nothing to add.
                Link { url: "https://bare.test/x".into(), text: None },
                Link { url: "https://plain.test".into(), text: None },
            ],
        );
    }

    #[test]
    fn a_quote_or_a_bracket_inside_a_tag_does_not_end_it() {
        let html = r#"<a title="1 > 0" data-href="https://not.this" href="https://this.test">x</a>"#;
        assert_eq!(urls(&[vec![rep(uti::HTML, html)]]), vec!["https://this.test"]);
    }

    #[test]
    fn an_rtf_copy_s_hyperlinks_are_its_links() {
        let rtf = r#"{\rtf1\ansi{\fonttbl\f0 Helvetica;}
Docs: {\field{\*\fldinst{HYPERLINK "https://lumikeys.app/"}}{\fldrslt \ul Lumi docs}} and
{\field{\*\fldinst{HYPERLINK \\l "top"}}{\fldrslt back up}} and
{\field{\*\fldinst{PAGE}}{\fldrslt 3}}}"#;
        let links = links_of(&[vec![rep(uti::RTF, rtf), rep(uti::TEXT, "Docs: Lumi docs and back up and 3")]]);
        assert_eq!(links, vec![Link { url: "https://lumikeys.app/".into(), text: Some("Lumi docs".into()) }]);
    }

    #[test]
    fn a_crawl_of_addresses_is_read_only_so_far() {
        let text: String = (0..LINKS_FOUND + 20).map(|n| format!("https://site{n}.test ")).collect();
        let found = in_text(&text);
        assert_eq!(found.len(), LINKS_FOUND);
        assert_eq!(found[0], "https://site0.test");
    }

    #[test]
    fn an_address_is_opened_percent_encoded_after_its_host() {
        assert_eq!(
            for_opening("https://vi.wikipedia.org/wiki/Việt Nam?q=a|b#x"),
            "https://vi.wikipedia.org/wiki/Vi%E1%BB%87t%20Nam?q=a%7Cb#x",
        );
        assert_eq!(for_opening("https://a.test/already%20encoded"), "https://a.test/already%20encoded");
        assert_eq!(for_opening("https://a.test"), "https://a.test");
    }

    #[test]
    fn only_a_text_or_rich_copy_keeps_links_and_only_as_many_as_are_listed() {
        let many: String = (0..LINKS_LISTED + 5).map(|n| format!("https://site{n}.test ")).collect();
        let text = kept(&[vec![rep(uti::TEXT, &many)]]);
        assert_eq!((text.v, text.list.len(), text.count), (LINKS_VERSION, LINKS_LISTED, LINKS_LISTED + 5));
        assert!(text.current());
        let rich = kept(&[vec![rep(uti::HTML, r#"<a href="https://a.test">a</a>"#), rep(uti::TEXT, "a")]]);
        assert_eq!(rich.list, vec![Link { url: "https://a.test".into(), text: Some("a".into()) }]);
        // A link row, a colour, a file: nothing to list.
        for items in [
            vec![rep(uti::TEXT, "https://a.test")],
            vec![rep(uti::TEXT, "#fff")],
            vec![rep(uti::FILE_URL, "file:///www.a.test.pdf"), rep(uti::TEXT, "www.a.test.pdf")],
        ] {
            let none = kept(&[items]);
            assert_eq!((none.list.len(), none.count), (0, 0));
        }
    }

    #[test]
    fn references_are_decoded_and_unknown_ones_left_alone() {
        assert_eq!(decode("a&amp;b &#233;&#xE9; &unknown; & x &;"), "a&b éé &unknown; & x &;");
    }
}
