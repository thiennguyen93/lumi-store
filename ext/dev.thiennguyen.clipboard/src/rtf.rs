//! Enough of RTF to preview it: the text, its paragraphs, and the run
//! styles a copy from TextEdit or Pages carries — bold, italic, underline,
//! strike-through, size and colour — and its links. Everything else —
//! fonts, pictures, headers, the document info — is skipped. The HTML made
//! here is built from escaped text and a fixed set of tags; nothing in the
//! RTF reaches it as markup.

use std::fmt::Write;

/// How many characters of text the preview is given; the pane shows a few
/// lines.
const MAX_CHARS: usize = 4000;

/// Destinations whose contents are not text. `fldinst` is a field's
/// instruction (`HYPERLINK "…"`), read for its address and never shown;
/// the field's result beside it (`fldrslt`) is the text a reader sees.
const SKIPPED: &[&str] = &[
    "stylesheet", "info", "pict", "header", "footer", "headerl", "headerr", "footerl",
    "footerr", "footnote", "listtable", "listoverridetable", "rsidtbl", "generator", "themedata",
    "colorschememapping", "latentstyles", "datastore", "xmlnstbl", "object", "fldinst",
    "expandedcolortbl", "filetbl", "revtbl", "pgdsctbl", "shppict", "nonshppict",
];

/// The most of a field's instruction kept: `HYPERLINK "<address>"` and its
/// switches, not a document.
const MAX_INSTRUCTION: usize = 4096;

#[derive(Clone, Default, PartialEq)]
struct Style {
    bold: bool,
    italic: bool,
    underline: bool,
    strike: bool,
    /// Half-points, as RTF counts them.
    size: Option<u32>,
    color: Option<usize>,
    font: Option<i64>,
}

#[derive(Clone)]
struct Group {
    style: Style,
    skip: bool,
    /// Characters to drop after a `\u` escape, `\ucN`.
    uc: usize,
    colors: bool,
    fonts: bool,
    /// Inside a field's instruction: its text is read, not shown.
    instruction: bool,
    /// Inside a hyperlink's result: the text the link is written under.
    link: bool,
}

/// The fonts a document names, by number.
type Fonts = Vec<(i64, String)>;

/// The RTF as HTML, or `None` when it is not RTF.
pub fn to_html(rtf: &str) -> Option<String> {
    read(rtf, MAX_CHARS).map(Out::finish)
}

/// Every web link in the RTF, in order: the address of each `HYPERLINK`
/// field and the text it is written under. The whole document, not the
/// preview's first few thousand characters — a link near the end is still
/// one of the copy's links. `None` when it is not RTF.
pub fn links(rtf: &str) -> Option<Vec<(String, String)>> {
    read(rtf, usize::MAX).map(|out| out.finish_links())
}

fn read(rtf: &str, max_chars: usize) -> Option<Out> {
    if !rtf.trim_start().starts_with("{\\rtf") {
        return None;
    }
    let mut out = Out::default();
    let mut stack: Vec<Group> = Vec::new();
    let mut group = Group {
        style: Style::default(),
        skip: false,
        uc: 1,
        colors: false,
        fonts: false,
        instruction: false,
        link: false,
    };
    let mut colors: Vec<Option<(u8, u8, u8)>> = Vec::new();
    let mut rgb = (0u8, 0u8, 0u8);
    // Characters still to drop after a `\u`.
    let mut drop = 0usize;
    // The instruction of the field being read: `HYPERLINK "https://…"`.
    let mut instruction = String::new();
    let bytes = rtf.as_bytes();
    let mut i = 0;
    while i < bytes.len() && out.chars < max_chars {
        match bytes[i] {
            b'{' => {
                stack.push(group.clone());
                i += 1;
                // `{\*\dest …}`: a destination this reader may not know.
                if rtf[i..].starts_with("\\*") {
                    group.skip = true;
                    group.fonts = false;
                    group.colors = false;
                }
            }
            b'}' => {
                if let Some(outer) = stack.pop() {
                    // The end of a hyperlink's result is the end of the link.
                    if group.link && !outer.link {
                        out.close_link();
                    }
                    group = outer;
                }
                i += 1;
            }
            b'\\' => {
                i += 1;
                let Some(&next) = bytes.get(i) else { break };
                if next.is_ascii_alphabetic() {
                    let start = i;
                    while i < bytes.len() && bytes[i].is_ascii_alphabetic() {
                        i += 1;
                    }
                    let word = &rtf[start..i];
                    let num_start = i;
                    if i < bytes.len() && bytes[i] == b'-' {
                        i += 1;
                    }
                    while i < bytes.len() && bytes[i].is_ascii_digit() {
                        i += 1;
                    }
                    let param: Option<i64> = rtf[num_start..i].parse().ok();
                    if i < bytes.len() && bytes[i] == b' ' {
                        i += 1;
                    }
                    if drop > 0 {
                        drop -= 1;
                        continue;
                    }
                    if word == "fldinst" {
                        group.instruction = true;
                        instruction.clear();
                    }
                    if SKIPPED.contains(&word) {
                        group.skip = true;
                        continue;
                    }
                    if word == "fonttbl" {
                        group.fonts = true;
                        group.skip = true;
                        continue;
                    }
                    if group.fonts {
                        if word == "f" {
                            out.fonts.push((param.unwrap_or(0), String::new()));
                        }
                        continue;
                    }
                    if word == "colortbl" {
                        group.colors = true;
                        group.skip = true;
                        continue;
                    }
                    if group.colors {
                        let value = param.unwrap_or(0).clamp(0, 255) as u8;
                        match word {
                            "red" => rgb.0 = value,
                            "green" => rgb.1 = value,
                            "blue" => rgb.2 = value,
                            _ => {}
                        }
                        continue;
                    }
                    if group.skip {
                        continue;
                    }
                    let on = param != Some(0);
                    let style = &mut group.style;
                    match word {
                        "b" => style.bold = on,
                        "i" => style.italic = on,
                        "ul" => style.underline = on,
                        "ulnone" => style.underline = false,
                        "strike" => style.strike = on,
                        "fs" => style.size = param.map(|p| p.clamp(8, 144) as u32),
                        "f" => style.font = param,
                        "cf" => style.color = param.and_then(|p| usize::try_from(p).ok()).filter(|&p| p > 0),
                        "plain" => *style = Style::default(),
                        "pard" => {}
                        "par" | "line" => out.push_break(),
                        "tab" => out.push_char('\t', &group.style, &colors),
                        "uc" => group.uc = param.unwrap_or(1).clamp(0, 10) as usize,
                        "u" => {
                            if let Some(code) = param {
                                let code = if code < 0 { code + 65536 } else { code };
                                if let Some(c) = u32::try_from(code).ok().and_then(char::from_u32) {
                                    out.push_char(c, &group.style, &colors);
                                }
                                drop = group.uc;
                            }
                        }
                        // A field's result: for a hyperlink, the words the
                        // link is written under, as a link.
                        "fldrslt" => {
                            if let Some(address) = hyperlink(&instruction).filter(|_| !group.link) {
                                out.open_link(address);
                                group.link = true;
                            }
                            instruction.clear();
                        }
                        "emdash" => out.push_char('—', &group.style, &colors),
                        "endash" => out.push_char('–', &group.style, &colors),
                        "bullet" => out.push_char('•', &group.style, &colors),
                        "lquote" => out.push_char('‘', &group.style, &colors),
                        "rquote" => out.push_char('’', &group.style, &colors),
                        "ldblquote" => out.push_char('“', &group.style, &colors),
                        "rdblquote" => out.push_char('”', &group.style, &colors),
                        _ => {}
                    }
                } else {
                    i += 1;
                    match next {
                        b'\'' => {
                            let hex = rtf.get(i..i + 2).and_then(|h| u8::from_str_radix(h, 16).ok());
                            i += 2;
                            if drop > 0 {
                                drop -= 1;
                            } else if let (Some(byte), true) = (hex, group.instruction) {
                                if instruction.len() < MAX_INSTRUCTION {
                                    instruction.push(cp1252(byte));
                                }
                            } else if let (Some(byte), false) = (hex, group.skip) {
                                out.push_char(cp1252(byte), &group.style, &colors);
                            }
                        }
                        b'\n' | b'\r' if !group.skip => out.push_break(),
                        // `HYPERLINK \\l "bookmark"`: the switch is part of
                        // what the instruction says.
                        b'{' | b'}' | b'\\' if group.instruction => {
                            if instruction.len() < MAX_INSTRUCTION {
                                instruction.push(next as char);
                            }
                        }
                        b'~' if !group.skip => out.push_char('\u{a0}', &group.style, &colors),
                        b'{' | b'}' | b'\\' if !group.skip => {
                            if drop > 0 {
                                drop -= 1;
                            } else {
                                out.push_char(next as char, &group.style, &colors);
                            }
                        }
                        _ => {}
                    }
                }
            }
            b'\r' | b'\n' => i += 1,
            _ => {
                let c = rtf[i..].chars().next().unwrap_or(' ');
                i += c.len_utf8();
                if group.fonts {
                    if let Some((_, name)) = out.fonts.last_mut() {
                        if c != ';' && name.len() < 64 {
                            name.push(c);
                        }
                    }
                } else if group.colors {
                    if c == ';' {
                        colors.push(if colors.is_empty() && rgb == (0, 0, 0) { None } else { Some(rgb) });
                        rgb = (0, 0, 0);
                    }
                } else if group.instruction {
                    if instruction.len() < MAX_INSTRUCTION {
                        instruction.push(c);
                    }
                } else if drop > 0 {
                    drop -= 1;
                } else if !group.skip {
                    out.push_char(c, &group.style, &colors);
                }
            }
        }
    }
    Some(out)
}

/// The address a `HYPERLINK` field goes to — `HYPERLINK "https://…" \o "tip"`,
/// quoted or not. `None` for any other field, and for a jump inside the
/// document (`HYPERLINK \l "bookmark"`), whose first word is a switch.
fn hyperlink(instruction: &str) -> Option<String> {
    let rest = instruction.trim_start();
    let rest = rest.get(..9).filter(|word| word.eq_ignore_ascii_case("HYPERLINK")).map(|_| &rest[9..])?;
    let rest = rest.trim_start();
    let address = match rest.strip_prefix('"') {
        Some(quoted) => quoted.split('"').next()?,
        None => rest.split_whitespace().next()?,
    };
    (!address.is_empty() && !address.starts_with('\\')).then(|| address.to_string())
}

#[derive(Default)]
struct Out {
    fonts: Fonts,
    html: String,
    /// The style of the open `<span>`, if one is open.
    open: Option<Style>,
    chars: usize,
    /// The hyperlink being written: its address and its text so far.
    link: Option<(String, String)>,
    /// The hyperlinks written, in order.
    links: Vec<(String, String)>,
}

impl Out {
    fn push_char(&mut self, c: char, style: &Style, colors: &[Option<(u8, u8, u8)>]) {
        if self.open.as_ref() != Some(style) {
            self.close();
            self.html.push_str("<span");
            let mut css = String::new();
            if style.bold {
                css.push_str("font-weight:bold;");
            }
            if style.italic {
                css.push_str("font-style:italic;");
            }
            match (style.underline, style.strike) {
                (true, true) => css.push_str("text-decoration:underline line-through;"),
                (true, false) => css.push_str("text-decoration:underline;"),
                (false, true) => css.push_str("text-decoration:line-through;"),
                _ => {}
            }
            if let Some(size) = style.size {
                let _ = write!(css, "font-size:{}pt;", size as f32 / 2.0);
            }
            if let Some((_, name)) = style.font.and_then(|at| self.fonts.iter().find(|(n, _)| *n == at)) {
                // Letters, digits, spaces and a little punctuation: a font
                // name, never the end of the attribute.
                let name: String = name
                    .trim()
                    .chars()
                    .filter(|c| c.is_alphanumeric() || matches!(c, ' ' | '-' | '.' | '_'))
                    .collect();
                if !name.is_empty() {
                    let _ = write!(css, "font-family:'{name}';");
                }
            }
            if let Some(Some((r, g, b))) = style.color.and_then(|at| colors.get(at)) {
                let _ = write!(css, "color:rgb({r},{g},{b});");
            }
            if !css.is_empty() {
                let _ = write!(self.html, " style=\"{css}\"");
            }
            self.html.push('>');
            self.open = Some(style.clone());
        }
        escape(&mut self.html, c);
        if let Some((_, text)) = &mut self.link {
            text.push(c);
        }
        self.chars += 1;
    }

    fn push_break(&mut self) {
        self.close();
        self.html.push_str("<br>");
        if let Some((_, text)) = &mut self.link {
            text.push(' ');
        }
        self.chars += 1;
    }

    /// An `<a>` around what follows, until `close_link`. The address is an
    /// attribute's escaped text; the page draws an `<a>` as link-coloured
    /// text and follows nothing.
    fn open_link(&mut self, address: String) {
        self.close_link();
        self.close();
        self.html.push_str("<a href=\"");
        for c in address.chars() {
            escape(&mut self.html, c);
        }
        self.html.push_str("\">");
        self.link = Some((address, String::new()));
    }

    fn close_link(&mut self) {
        if let Some(link) = self.link.take() {
            self.close();
            self.html.push_str("</a>");
            self.links.push(link);
        }
    }

    fn close(&mut self) {
        if self.open.take().is_some() {
            self.html.push_str("</span>");
        }
    }

    fn finish(mut self) -> String {
        self.close_link();
        self.close();
        self.html
    }

    fn finish_links(mut self) -> Vec<(String, String)> {
        self.close_link();
        self.links
    }
}

/// `c` as HTML text — or an attribute's, inside double quotes.
fn escape(html: &mut String, c: char) {
    match c {
        '&' => html.push_str("&amp;"),
        '<' => html.push_str("&lt;"),
        '>' => html.push_str("&gt;"),
        '"' => html.push_str("&quot;"),
        _ => html.push(c),
    }
}

/// A `\'hh` byte in Windows-1252, the code page RTF writers default to.
fn cp1252(byte: u8) -> char {
    const HIGH: [char; 32] = [
        '€', '\u{81}', '‚', 'ƒ', '„', '…', '†', '‡', 'ˆ', '‰', 'Š', '‹', 'Œ', '\u{8d}', 'Ž', '\u{8f}',
        '\u{90}', '‘', '’', '“', '”', '•', '–', '—', '˜', '™', 'š', '›', 'œ', '\u{9d}', 'ž', 'Ÿ',
    ];
    match byte {
        0x80..=0x9f => HIGH[(byte - 0x80) as usize],
        _ => byte as char,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const TEXTEDIT: &str = r"{\rtf1\ansi\ansicpg1252\cocoartf2822
{\fonttbl\f0\fswiss\fcharset0 Helvetica;}
{\colortbl;\red255\green255\blue255;\red255\green0\blue0;}
{\*\expandedcolortbl;;\csgenericrgb\c100000\c0\c0;}
\pard\tx560\pardirnatural\partightenfactor0

\f0\fs24 \cf0 Plain \b bold\b0  and \i italic\i0 \
\cf2 red \ul under\ulnone}";

    #[test]
    fn a_textedit_copy_keeps_its_text_and_styles() {
        let html = to_html(TEXTEDIT).unwrap();
        assert!(html.contains("Plain "), "{html}");
        assert!(
            html.contains("<span style=\"font-weight:bold;font-size:12pt;font-family:'Helvetica';\">bold</span>"),
            "{html}"
        );
        assert!(html.contains("font-style:italic;"), "{html}");
        assert!(html.contains("<br>"), "{html}");
        assert!(html.contains("color:rgb(255,0,0);\">red "), "{html}");
        assert!(html.contains("text-decoration:underline;"), "{html}");
        assert!(!html.contains("Helvetica;"), "the font table is not text: {html}");
        assert!(!html.contains("csgenericrgb"), "{html}");
    }

    #[test]
    fn text_is_escaped_never_markup() {
        let html = to_html(r"{\rtf1 <img src=x onerror=alert(1)> \{ & \}}").unwrap();
        assert!(!html.contains("<img"), "{html}");
        assert!(html.contains("&lt;img src=x onerror=alert(1)&gt;"), "{html}");
        assert!(html.contains("{ &amp; }"), "{html}");
    }

    #[test]
    fn unicode_and_code_page_escapes_become_characters() {
        let html = to_html(r"{\rtf1 Vi\u7879?t \'93q\'94 caf\'e9}").unwrap();
        assert!(html.contains("Việt “q” café"), "{html}");
    }

    #[test]
    fn a_font_name_cannot_close_the_attribute() {
        let html = to_html(r#"{\rtf1{\fonttbl\f0 Evil"onclick='x';}\f0 hi}"#).unwrap();
        assert!(html.contains("font-family:'Evilonclickx';"), "{html}");
    }

    #[test]
    fn a_hyperlink_s_words_are_shown_as_a_link_and_other_fields_as_text() {
        let rtf = r#"{\rtf1 See {\field{\*\fldinst{HYPERLINK "https://a.test/?x=1&y=2"}}{\fldrslt \ul Lumi <docs>}}, {\field{\*\fldinst{HYPERLINK \\l "top"}}{\fldrslt top}} and page {\field{\*\fldinst{PAGE}}{\fldrslt 3}}.}"#;
        let html = to_html(rtf).unwrap();
        assert!(html.contains("<a href=\"https://a.test/?x=1&amp;y=2\"><span style=\"text-decoration:underline;\">"), "{html}");
        assert!(html.contains("Lumi &lt;docs&gt;</span></a>"), "{html}");
        assert!(html.contains("top"), "a jump inside the document is text: {html}");
        assert_eq!(html.matches("<a ").count(), 1, "{html}");
        assert!(html.contains("page 3."), "{html}");
        assert!(!html.contains("HYPERLINK") && !html.contains("PAGE"), "an instruction is not text: {html}");
        assert_eq!(
            links(rtf).unwrap(),
            vec![("https://a.test/?x=1&y=2".to_string(), "Lumi <docs>".to_string())],
        );
    }

    #[test]
    fn a_link_cut_off_by_the_preview_s_length_is_still_closed() {
        let rtf = format!(r#"{{\rtf1 {{\field{{\*\fldinst{{HYPERLINK "https://a.test"}}}}{{\fldrslt {}}}}}}}"#, "x".repeat(MAX_CHARS + 10));
        let html = to_html(&rtf).unwrap();
        assert!(html.ends_with("</span></a>"), "{}", &html[html.len() - 40..]);
        assert_eq!(links(&rtf).unwrap()[0].1.len(), MAX_CHARS + 10);
    }

    #[test]
    fn what_is_not_rtf_is_refused() {
        assert_eq!(to_html("<b>x</b>"), None);
    }
}
