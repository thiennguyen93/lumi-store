//! Enough of RTF to preview it: the text, its paragraphs, and the run
//! styles a copy from TextEdit or Pages carries — bold, italic, underline,
//! strike-through, size and colour. Everything else — fonts, pictures,
//! headers, the document info — is skipped. The HTML made here is built
//! from escaped text and a fixed set of tags; nothing in the RTF reaches it
//! as markup.

use std::fmt::Write;

/// How many characters of text the preview is given; the pane shows a few
/// lines.
const MAX_CHARS: usize = 4000;

/// Destinations whose contents are not text.
const SKIPPED: &[&str] = &[
    "stylesheet", "info", "pict", "header", "footer", "headerl", "headerr", "footerl",
    "footerr", "footnote", "listtable", "listoverridetable", "rsidtbl", "generator", "themedata",
    "colorschememapping", "latentstyles", "datastore", "xmlnstbl", "object", "field", "fldinst",
    "expandedcolortbl", "filetbl", "revtbl", "pgdsctbl", "shppict", "nonshppict",
];

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
}

/// The fonts a document names, by number.
type Fonts = Vec<(i64, String)>;

/// The RTF as HTML, or `None` when it is not RTF.
pub fn to_html(rtf: &str) -> Option<String> {
    if !rtf.trim_start().starts_with("{\\rtf") {
        return None;
    }
    let mut out = Out::default();
    let mut stack: Vec<Group> = Vec::new();
    let mut group = Group { style: Style::default(), skip: false, uc: 1, colors: false, fonts: false };
    let mut colors: Vec<Option<(u8, u8, u8)>> = Vec::new();
    let mut rgb = (0u8, 0u8, 0u8);
    // Characters still to drop after a `\u`.
    let mut drop = 0usize;
    let bytes = rtf.as_bytes();
    let mut i = 0;
    while i < bytes.len() && out.chars < MAX_CHARS {
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
                            } else if let (Some(byte), false) = (hex, group.skip) {
                                out.push_char(cp1252(byte), &group.style, &colors);
                            }
                        }
                        b'\n' | b'\r' if !group.skip => out.push_break(),
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
                } else if drop > 0 {
                    drop -= 1;
                } else if !group.skip {
                    out.push_char(c, &group.style, &colors);
                }
            }
        }
    }
    Some(out.finish())
}

#[derive(Default)]
struct Out {
    fonts: Fonts,
    html: String,
    /// The style of the open `<span>`, if one is open.
    open: Option<Style>,
    chars: usize,
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
        match c {
            '&' => self.html.push_str("&amp;"),
            '<' => self.html.push_str("&lt;"),
            '>' => self.html.push_str("&gt;"),
            '"' => self.html.push_str("&quot;"),
            _ => self.html.push(c),
        }
        self.chars += 1;
    }

    fn push_break(&mut self) {
        self.close();
        self.html.push_str("<br>");
        self.chars += 1;
    }

    fn close(&mut self) {
        if self.open.take().is_some() {
            self.html.push_str("</span>");
        }
    }

    fn finish(mut self) -> String {
        self.close();
        self.html
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
    fn what_is_not_rtf_is_refused() {
        assert_eq!(to_html("<b>x</b>"), None);
    }
}
