//! The math written in a text or rich copy, for the preview's Math section:
//! each sum worked out, each one-variable equation of degree one or two
//! solved, each written equality checked, each "15% of 200" taken.
//!
//! **Found here, not in the page.** The page draws what this finds, as
//! TeX, and copies an answer only by naming it back: `lib.rs` puts it on
//! the pasteboard only while it is one this still finds in the stored item.
//!
//! **Found once.** A copy never changes, so its math is found when it is
//! kept and stored in its record ([`KeptMath`]); a record kept before that,
//! or by older rules ([`MATH_VERSION`]), has it found again, once, the
//! first time it is previewed. The row's short answer ([`row_answer`]) is
//! kept in the index beside the title.
//!
//! **What counts.** Prose is full of digits joined by `-` and `/` that are
//! not sums: dates, phone numbers, ranges, versions, ratios like `24/7`,
//! sizes like `1920x1080`. A stretch written tight (no spaces) whose only
//! joins are those is left alone; so is a number with two decimal points,
//! a lone number, and anything with a word in it that is not a function,
//! `pi`, `of`, or the one-letter unknowns `x`, `y`, `z`.

use crate::history::{kind_of, Kind, Rep};
use serde::{Deserialize, Serialize};

/// The rules a record's kept math was found by. Bumped whenever what
/// `found_in` finds or how it writes it changes — or which copies `kept`
/// looks in: 1 kept an empty list for every rich copy, 2 works them out.
pub const MATH_VERSION: u32 = 2;

/// The most pieces of math the preview lists for one copy.
pub const MATH_LISTED: usize = 20;

/// A stretch longer than this many tokens is not one somebody wrote as a
/// sum: a column of numbers, a table pasted as text.
const LONGEST_RUN: usize = 120;

/// What kind of math a piece is, as the card's label says it.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Sort {
    /// A sum worked out: `1 + 2 + 5 + 10`.
    Expression,
    /// `15% of 200`.
    Percentage,
    /// An equation of degree one in one unknown.
    Linear,
    /// An equation of degree two in one unknown.
    Quadratic,
    /// An equation whose unknown cancels out: true for every value, or none.
    Equation,
    /// An equality with no unknown, true or false: `2 + 2 = 5`.
    Check,
}

/// One answer: as drawn (TeX) and as copied (plain text).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Answer {
    pub tex: String,
    pub copy: String,
}

/// A piece of math in the copy's text.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Found {
    /// Where it is in the preview's text, in UTF-16 code units — what the
    /// page's strings and DOM ranges count in.
    pub from: usize,
    pub to: usize,
    pub sort: Sort,
    /// The math as written, typeset.
    pub tex: String,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub answers: Vec<Answer>,
    /// A word on the side: the discriminant, "Double root", why there is
    /// no answer.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub note: Option<String>,
    /// A `Check`'s verdict.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub holds: Option<bool>,
    /// The answer in a few characters, for the row in the list.
    pub short: String,
}

/// What a record keeps of its math, found by rules `v`.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct KeptMath {
    pub v: u32,
    pub list: Vec<Found>,
}

impl KeptMath {
    /// Found by the rules this build has.
    pub fn current(&self) -> bool {
        self.v == MATH_VERSION
    }
}

/// The math to keep with a copy: a text or rich copy's — a rich one's as
/// its plain text writes it — and none for any other kind. Found in the
/// text the preview has, so the offsets are that text's; the page finds a
/// rich copy's pieces in its formatting by their characters.
pub fn kept(items: &[Vec<Rep>]) -> KeptMath {
    let list = match kind_of(items) {
        Kind::Text | Kind::Rich => found_in(&crate::history::preview_text(items)),
        _ => Vec::new(),
    };
    KeptMath { v: MATH_VERSION, list }
}

/// The answer the list shows on a row: the one piece's short answer, or
/// how many there are.
pub fn row_answer(list: &[Found]) -> String {
    match list {
        [] => String::new(),
        [one] => one.short.clone(),
        many => format!("∑ {}", many.len()),
    }
}

/// Every answer of every piece, one a line: what Copy all puts on the
/// pasteboard.
pub fn all_answers(list: &[Found]) -> String {
    list.iter()
        .filter(|found| !found.answers.is_empty())
        .map(|found| found.answers.iter().map(|answer| answer.copy.as_str()).collect::<Vec<_>>().join(", "))
        .collect::<Vec<_>>()
        .join("\n")
}

/// Whether `text` is something the page may copy for this math: one
/// answer, or all of them.
pub fn is_answer(list: &[Found], text: &str) -> bool {
    !text.is_empty()
        && (list.iter().flat_map(|found| &found.answers).any(|answer| answer.copy == text) || all_answers(list) == text)
}

/// Every piece of math in `text`, first written first.
pub fn found_in(text: &str) -> Vec<Found> {
    let tokens = tokenize(text);
    let mut list = Vec::new();
    for run in runs(&tokens) {
        if list.len() >= MATH_LISTED {
            break;
        }
        let Some(run) = trim(run) else { continue };
        if run.len() > LONGEST_RUN || not_math(run) || glued(text, run) {
            continue;
        }
        let Some(mut found) = work_out(run) else { continue };
        found.from = utf16_at(text, run[0].start);
        found.to = utf16_at(text, run[run.len() - 1].end);
        list.push(found);
    }
    list
}

fn utf16_at(text: &str, byte: usize) -> usize {
    text[..byte].encode_utf16().count()
}

// ---------------------------------------------------------------- tokens

#[derive(Debug, Clone, Copy, PartialEq)]
enum Func {
    Sqrt,
    Sin,
    Cos,
    Tan,
    Log,
    Ln,
    Abs,
    Exp,
}

#[derive(Debug, Clone, Copy, PartialEq)]
enum Tok {
    Num(f64),
    Var(char),
    Pi,
    Func(Func),
    /// `+ - * / ^ = % ( )`, `√`, and a superscript digit's power.
    Op(char),
    Sup(u32),
    /// `of`, after a percentage.
    Of,
    Space,
    /// Anything that ends a stretch of math: a word, a newline, a colon.
    Break,
}

#[derive(Debug, Clone, Copy)]
struct Token {
    tok: Tok,
    start: usize,
    end: usize,
}

fn tokenize(text: &str) -> Vec<Token> {
    let mut out: Vec<Token> = Vec::new();
    let mut chars = text.char_indices().peekable();
    while let Some((start, c)) = chars.next() {
        let mut end = start + c.len_utf8();
        let tok = if c.is_ascii_digit() {
            // Digits, and `.` or `,` with a digit after it, as one token:
            // judged whole below.
            let mut written = String::from(c);
            while let Some(&(at, next)) = chars.peek() {
                let joins = (next == '.' || next == ',')
                    && text[at + 1..].chars().next().is_some_and(|after| after.is_ascii_digit());
                if !(next.is_ascii_digit() || joins) {
                    break;
                }
                written.push(next);
                end = at + next.len_utf8();
                chars.next();
            }
            number(&written).map_or(Tok::Break, Tok::Num)
        } else if c.is_alphabetic() {
            let mut word = String::from(c);
            while let Some(&(at, next)) = chars.peek() {
                if !next.is_alphabetic() {
                    break;
                }
                word.push(next);
                end = at + next.len_utf8();
                chars.next();
            }
            word_token(&word)
        } else {
            match c {
                ' ' | '\t' | '\u{a0}' => Tok::Space,
                '+' | '-' | '*' | '/' | '^' | '=' | '%' | '(' | ')' | '√' => Tok::Op(c),
                '−' | '–' => Tok::Op('-'),
                '×' | '·' | '∙' | '⋅' => Tok::Op('*'),
                '÷' => Tok::Op('/'),
                '²' => Tok::Sup(2),
                '³' => Tok::Sup(3),
                _ => Tok::Break,
            }
        };
        out.push(Token { tok, start, end });
    }
    times_between_numbers(&mut out);
    out
}

/// A number as written: `450000`, `3.5`, `1,000,000` (commas before groups
/// of three), `1,5` (a decimal comma). Two decimal points — a version, a
/// date — or commas that fit neither are not a number.
fn number(written: &str) -> Option<f64> {
    let dots = written.matches('.').count();
    let commas = written.matches(',').count();
    let plain = if commas == 0 {
        (dots <= 1).then(|| written.to_string())?
    } else {
        let head = written.split('.').next().unwrap_or_default();
        let groups: Vec<&str> = head.split(',').collect();
        let thousands = groups.len() > 1 && groups[0].len() <= 3 && groups[1..].iter().all(|g| g.len() == 3);
        if thousands && dots <= 1 {
            written.replace(',', "")
        } else if commas == 1 && dots == 0 {
            written.replace(',', ".")
        } else {
            return None;
        }
    };
    plain.parse().ok()
}

fn word_token(word: &str) -> Tok {
    match word.to_lowercase().as_str() {
        "sqrt" => Tok::Func(Func::Sqrt),
        "sin" => Tok::Func(Func::Sin),
        "cos" => Tok::Func(Func::Cos),
        "tan" => Tok::Func(Func::Tan),
        "log" => Tok::Func(Func::Log),
        "ln" => Tok::Func(Func::Ln),
        "abs" => Tok::Func(Func::Abs),
        "exp" => Tok::Func(Func::Exp),
        "pi" | "π" => Tok::Pi,
        "of" => Tok::Of,
        _ if word == "x" || word == "y" || word == "z" => Tok::Var(word.chars().next().unwrap_or('x')),
        _ => Tok::Break,
    }
}

/// `3 x 4` is a product, not an unknown: an `x` with a number either side
/// is a times sign.
fn times_between_numbers(tokens: &mut [Token]) {
    let solid = |t: &Token| t.tok != Tok::Space;
    for i in 0..tokens.len() {
        if tokens[i].tok != Tok::Var('x') {
            continue;
        }
        let before = tokens[..i].iter().rev().find(|t| solid(t)).map(|t| t.tok);
        let after = tokens[i + 1..].iter().find(|t| solid(t)).map(|t| t.tok);
        if matches!(before, Some(Tok::Num(_))) && matches!(after, Some(Tok::Num(_))) {
            tokens[i].tok = Tok::Op('×');
        }
    }
}

/// The stretches between breaks.
fn runs(tokens: &[Token]) -> impl Iterator<Item = &[Token]> {
    tokens.split(|t| t.tok == Tok::Break).filter(|run| !run.is_empty())
}

/// A stretch without what cannot start or end a sum — spaces, a dangling
/// operator, a bracket that closes nothing — or `None` if nothing is left.
fn trim(mut run: &[Token]) -> Option<&[Token]> {
    loop {
        let before = run.len();
        while let Some(first) = run.first() {
            let keeps = matches!(first.tok, Tok::Num(_) | Tok::Var(_) | Tok::Pi | Tok::Func(_) | Tok::Op('-' | '(' | '√'));
            if keeps {
                break;
            }
            run = &run[1..];
        }
        while let Some(last) = run.last() {
            let keeps = matches!(last.tok, Tok::Num(_) | Tok::Var(_) | Tok::Pi | Tok::Sup(_) | Tok::Op(')' | '%'));
            if keeps {
                break;
            }
            run = &run[..run.len() - 1];
        }
        // An opening bracket never closed, or a closing one never opened,
        // at either end: "(see 1+2" or "1+2)".
        let mut depth = 0i32;
        let mut lowest = 0i32;
        for t in run {
            match t.tok {
                Tok::Op('(') => depth += 1,
                Tok::Op(')') => {
                    depth -= 1;
                    lowest = lowest.min(depth);
                }
                _ => {}
            }
        }
        if lowest < 0 && run.last().is_some_and(|t| t.tok == Tok::Op(')')) {
            run = &run[..run.len() - 1];
        } else if depth > 0 && run.first().is_some_and(|t| t.tok == Tok::Op('(')) {
            run = &run[1..];
        }
        if run.is_empty() {
            return None;
        }
        if run.len() == before {
            return Some(run);
        }
    }
}

/// Digits joined tight by `-`, `/` or a tight `x` and nothing else: a date,
/// a phone number, a range, a ratio, a size — not a sum somebody wants
/// worked out.
fn not_math(run: &[Token]) -> bool {
    let tight = run.iter().all(|t| t.tok != Tok::Space);
    tight
        && run
            .iter()
            .all(|t| matches!(t.tok, Tok::Num(_) | Tok::Op('-' | '/' | '×')))
}

/// Written onto a word, it is part of the word: `f(x) = 2x`, `COVID-19`,
/// `H2O+`.
fn glued(text: &str, run: &[Token]) -> bool {
    let before = text[..run[0].start].chars().next_back();
    let after = text[run[run.len() - 1].end..].chars().next();
    before.is_some_and(char::is_alphanumeric) || after.is_some_and(char::is_alphanumeric)
}

// ---------------------------------------------------------------- parse

#[derive(Debug, Clone, Copy, PartialEq)]
enum Bin {
    Add,
    Sub,
    Mul,
    /// Written side by side: `5x`, `2(3 + 1)`.
    Juxt,
    Div,
    Pow,
    Of,
}

#[derive(Debug, Clone, PartialEq)]
enum Ast {
    Num(f64),
    Var(char),
    Pi,
    Neg(Box<Ast>),
    Pct(Box<Ast>),
    Call(Func, Box<Ast>),
    Bin(Bin, Box<Ast>, Box<Ast>),
}

struct Parser {
    toks: Vec<Tok>,
    at: usize,
}

impl Parser {
    fn peek(&self) -> Option<Tok> {
        self.toks.get(self.at).copied()
    }

    fn eat(&mut self, tok: Tok) -> bool {
        if self.peek() == Some(tok) {
            self.at += 1;
            true
        } else {
            false
        }
    }

    fn sum(&mut self) -> Option<Ast> {
        let mut left = self.term()?;
        loop {
            let op = match self.peek() {
                Some(Tok::Op('+')) => Bin::Add,
                Some(Tok::Op('-')) => Bin::Sub,
                _ => return Some(left),
            };
            self.at += 1;
            left = Ast::Bin(op, Box::new(left), Box::new(self.term()?));
        }
    }

    fn term(&mut self) -> Option<Ast> {
        let mut left = self.unary()?;
        loop {
            let (op, right) = match self.peek() {
                Some(Tok::Op('*' | '×')) => {
                    self.at += 1;
                    (Bin::Mul, self.unary()?)
                }
                Some(Tok::Op('/')) => {
                    self.at += 1;
                    (Bin::Div, self.unary()?)
                }
                // Only a percentage is taken "of" something.
                Some(Tok::Of) if matches!(left, Ast::Pct(_)) => {
                    self.at += 1;
                    (Bin::Of, self.unary()?)
                }
                // Side by side, but never two numbers: `12 34` is not 408.
                Some(Tok::Var(_) | Tok::Pi | Tok::Func(_) | Tok::Op('(' | '√')) => (Bin::Juxt, self.power()?),
                _ => return Some(left),
            };
            left = Ast::Bin(op, Box::new(left), Box::new(right));
        }
    }

    fn unary(&mut self) -> Option<Ast> {
        if self.eat(Tok::Op('-')) {
            return Some(Ast::Neg(Box::new(self.unary()?)));
        }
        if self.eat(Tok::Op('+')) {
            return self.unary();
        }
        self.power()
    }

    fn power(&mut self) -> Option<Ast> {
        let base = self.postfix()?;
        if self.eat(Tok::Op('^')) {
            return Some(Ast::Bin(Bin::Pow, Box::new(base), Box::new(self.unary()?)));
        }
        Some(base)
    }

    fn postfix(&mut self) -> Option<Ast> {
        let mut value = self.primary()?;
        loop {
            value = match self.peek() {
                Some(Tok::Op('%')) => Ast::Pct(Box::new(value)),
                Some(Tok::Sup(n)) => Ast::Bin(Bin::Pow, Box::new(value), Box::new(Ast::Num(n as f64))),
                _ => return Some(value),
            };
            self.at += 1;
        }
    }

    fn primary(&mut self) -> Option<Ast> {
        let tok = self.peek()?;
        self.at += 1;
        match tok {
            Tok::Num(n) => Some(Ast::Num(n)),
            Tok::Var(v) => Some(Ast::Var(v)),
            Tok::Pi => Some(Ast::Pi),
            Tok::Op('(') => {
                let inside = self.sum()?;
                self.eat(Tok::Op(')')).then_some(inside)
            }
            Tok::Op('√') => Some(Ast::Call(Func::Sqrt, Box::new(self.postfix()?))),
            Tok::Func(func) => {
                let arg = if self.eat(Tok::Op('(')) {
                    let inside = self.sum()?;
                    if !self.eat(Tok::Op(')')) {
                        return None;
                    }
                    inside
                } else {
                    self.postfix()?
                };
                Some(Ast::Call(func, Box::new(arg)))
            }
            _ => None,
        }
    }
}

/// A stretch as `left` and, for an equation or equality, `right`.
fn parse(run: &[Token]) -> Option<(Ast, Option<Ast>)> {
    let toks: Vec<Tok> = run.iter().map(|t| t.tok).filter(|tok| *tok != Tok::Space).collect();
    // Two numbers with only a space between are two numbers, not a product.
    let spaced_numbers = run
        .iter()
        .filter(|t| t.tok != Tok::Space)
        .collect::<Vec<_>>()
        .windows(2)
        .any(|pair| matches!((pair[0].tok, pair[1].tok), (Tok::Num(_) | Tok::Sup(_), Tok::Num(_))));
    if spaced_numbers {
        return None;
    }
    let mut parser = Parser { toks, at: 0 };
    let left = parser.sum()?;
    let right = if parser.eat(Tok::Op('=')) { Some(parser.sum()?) } else { None };
    (parser.at == parser.toks.len()).then_some((left, right))
}

// ---------------------------------------------------------------- work out

fn work_out(run: &[Token]) -> Option<Found> {
    let (left, right) = parse(run)?;
    let mut unknowns = Vec::new();
    unknowns_in(&left, &mut unknowns);
    if let Some(right) = &right {
        unknowns_in(right, &mut unknowns);
    }
    match (right, unknowns.as_slice()) {
        (None, []) => expression(&left),
        (Some(right), []) => check(&left, &right),
        (Some(right), [unknown]) => equation(&left, &right, *unknown),
        // An unknown with nothing to solve for, or more than one.
        _ => None,
    }
}

fn unknowns_in(ast: &Ast, out: &mut Vec<char>) {
    match ast {
        Ast::Var(v) if !out.contains(v) => out.push(*v),
        Ast::Neg(a) | Ast::Pct(a) | Ast::Call(_, a) => unknowns_in(a, out),
        Ast::Bin(_, a, b) => {
            unknowns_in(a, out);
            unknowns_in(b, out);
        }
        _ => {}
    }
}

/// Whether there is anything to work out: an operation between two things,
/// or a function. A lone `-5`, `10%` or `(3)` is a number as written.
fn worth_working_out(ast: &Ast) -> bool {
    match ast {
        Ast::Bin(..) | Ast::Call(..) => true,
        Ast::Neg(a) | Ast::Pct(a) => worth_working_out(a),
        _ => false,
    }
}

fn found(sort: Sort, tex: String, answers: Vec<Answer>, short: String) -> Found {
    Found { from: 0, to: 0, sort, tex, answers, note: None, holds: None, short }
}

fn expression(ast: &Ast) -> Option<Found> {
    if !worth_working_out(ast) {
        return None;
    }
    let value = eval(ast, None)?;
    let mut answers = vec![Answer { tex: format!("= {}", tex_number(value)), copy: plain(value) }];
    if let Some((n, d)) = fraction(value) {
        answers.push(Answer { tex: format!("= {}", tex_fraction(n, d)), copy: format!("{n}/{d}") });
    }
    let sort = if matches!(ast, Ast::Bin(Bin::Of, ..)) { Sort::Percentage } else { Sort::Expression };
    let short = format!("= {}", shown(value));
    Some(found(sort, tex(ast), answers, short))
}

fn check(left: &Ast, right: &Ast) -> Option<Found> {
    let (l, r) = (eval(left, None)?, eval(right, None)?);
    let holds = (l - r).abs() <= 1e-9 * l.abs().max(r.abs()).max(1.0);
    let tex = format!("{} = {}", tex(left), tex(right));
    let mut found = found(Sort::Check, tex, Vec::new(), if holds { "✓ true".into() } else { "✕ false".into() });
    found.holds = Some(holds);
    if !holds {
        found.note = Some(format!("Left {} · right {}", shown(l), shown(r)));
    }
    Some(found)
}

fn equation(left: &Ast, right: &Ast, v: char) -> Option<Found> {
    let mut coefficients = sub(&poly(left, v)?, &poly(right, v)?);
    let scale = coefficients.iter().fold(0f64, |m, c| m.max(c.abs())).max(1.0);
    while coefficients.last().is_some_and(|c| c.abs() <= 1e-12 * scale) {
        coefficients.pop();
    }
    let tex = format!("{} = {}", tex(left), tex(right));
    let c = |i: usize| coefficients.get(i).copied().map(clean).unwrap_or(0.0);
    match coefficients.len() {
        0 | 1 => {
            let always = coefficients.is_empty();
            let mut found = found(Sort::Equation, tex, Vec::new(), if always { format!("any {v}") } else { "no solution".into() });
            found.note = Some(if always { format!("True for every {v}") } else { "No solution".into() });
            Some(found)
        }
        2 => {
            let root = clean(-c(0) / c(1));
            let answer = Answer { tex: format!("{v} = {}", tex_value(root)), copy: format!("{v} = {}", plain(root)) };
            Some(found(Sort::Linear, tex, vec![answer], format!("{v} = {}", shown(root))))
        }
        3 => Some(quadratic(tex, v, c(2), c(1), c(0))),
        // Degree three and up: not solved, so not listed.
        _ => None,
    }
}

fn quadratic(tex: String, v: char, a: f64, b: f64, c: f64) -> Found {
    let d = clean(b * b - 4.0 * a * c);
    let whole = [a, b, c, d].iter().all(|n| n.fract() == 0.0 && n.abs() < 1e12);
    let mut found = if d == 0.0 {
        let root = clean(-b / (2.0 * a));
        let answer = Answer { tex: format!("{v} = {}", tex_value(root)), copy: format!("{v} = {}", plain(root)) };
        let mut found = found(Sort::Quadratic, tex, vec![answer], format!("{v} = {}", shown(root)));
        found.note = Some("Double root".into());
        return found;
    } else if d > 0.0 {
        let r = d.sqrt();
        let mut roots = [clean((-b - r) / (2.0 * a)), clean((-b + r) / (2.0 * a))];
        roots.sort_by(f64::total_cmp);
        let rational = roots.iter().all(|x| x.fract() == 0.0 || fraction(*x).is_some());
        if rational {
            let answers = roots
                .iter()
                .enumerate()
                .map(|(i, x)| Answer { tex: format!("{v}_{{{}}} = {}", i + 1, tex_value(*x)), copy: format!("{v} = {}", plain(*x)) })
                .collect();
            found(Sort::Quadratic, tex, answers, format!("{v} = {}, {}", shown(roots[0]), shown(roots[1])))
        } else {
            let mut answers = Vec::new();
            let short = if whole {
                let (tex, plain) = surd(-b as i64, d as i64, (2.0 * a) as i64, false);
                answers.push(Answer { tex: format!("{v} = {tex}"), copy: format!("{v} = {plain}") });
                format!("{v} = {plain}")
            } else {
                format!("{v} ≈ {}, {}", approx(roots[0]), approx(roots[1]))
            };
            for (i, x) in roots.iter().enumerate() {
                answers.push(Answer { tex: format!("{v}_{{{}}} \\approx {}", i + 1, tex_plain(&approx(*x))), copy: approx(*x) });
            }
            found(Sort::Quadratic, tex, answers, short)
        }
    } else {
        let (answer, short) = if whole {
            let (tex, plain) = surd(-b as i64, -d as i64, (2.0 * a) as i64, true);
            (Answer { tex: format!("{v} = {tex}"), copy: format!("{v} = {plain}") }, format!("{v} = {plain}"))
        } else {
            let re = clean(-b / (2.0 * a));
            let im = clean((-d).sqrt() / (2.0 * a.abs()));
            let plain = format!("{} ± {}i", approx(re), approx(im));
            (Answer { tex: format!("{v} = {} \\pm {}\\,i", tex_plain(&approx(re)), tex_plain(&approx(im))), copy: format!("{v} = {plain}") }, format!("{v} = {plain}"))
        };
        let mut found = found(Sort::Quadratic, tex, vec![answer], short);
        found.note = Some(format!("Complex roots · Δ = {}", shown(d)));
        return found;
    };
    found.note = Some(format!("Δ = {}", shown(d)));
    found
}

/// `(p ± √d) / q` with whole numbers, the root taken apart (`√12` = `2√3`)
/// and the fraction reduced; `i` after the root for a negative
/// discriminant. As TeX and as plain text.
fn surd(p: i64, d: i64, q: i64, imaginary: bool) -> (String, String) {
    let (mut k, mut m) = (1i64, d);
    let mut f = 2i64;
    while f * f <= m && f < 1_000_000 {
        while m % (f * f) == 0 {
            m /= f * f;
            k *= f;
        }
        f += 1;
    }
    let mut g = gcd(gcd(p, k), q);
    if q < 0 {
        g = -g;
    }
    let (p, k, q) = (p / g, k / g, q / g);
    let i = if imaginary { "i" } else { "" };
    let (root_tex, root_plain) = match (k, m) {
        (k, 1) => (format!("{}{i}", if k == 1 && imaginary { String::new() } else { k.to_string() }), format!("{}{i}", if k == 1 && imaginary { String::new() } else { k.to_string() })),
        (1, m) => (format!("\\sqrt{{{m}}}{i}"), format!("√{m}{i}")),
        (k, m) => (format!("{k}\\sqrt{{{m}}}{i}"), format!("{k}√{m}{i}")),
    };
    match (p, q) {
        (0, 1) => (format!("\\pm {root_tex}"), format!("±{root_plain}")),
        (0, q) => (format!("\\pm \\frac{{{root_tex}}}{{{q}}}"), format!("±{root_plain}/{q}")),
        (p, 1) => (format!("{p} \\pm {root_tex}"), format!("{p} ± {root_plain}")),
        (p, q) => (format!("\\frac{{{p} \\pm {root_tex}}}{{{q}}}"), format!("({p} ± {root_plain}) / {q}")),
    }
}

fn gcd(a: i64, b: i64) -> i64 {
    let (mut a, mut b) = (a.abs(), b.abs());
    while b != 0 {
        (a, b) = (b, a % b);
    }
    a.max(1)
}

fn eval(ast: &Ast, x: Option<f64>) -> Option<f64> {
    let value = match ast {
        Ast::Num(n) => *n,
        Ast::Var(_) => x?,
        Ast::Pi => std::f64::consts::PI,
        Ast::Neg(a) => -eval(a, x)?,
        Ast::Pct(a) => eval(a, x)? / 100.0,
        Ast::Call(func, a) => {
            let a = eval(a, x)?;
            match func {
                Func::Sqrt if a < 0.0 => return None,
                Func::Sqrt => a.sqrt(),
                Func::Sin => a.sin(),
                Func::Cos => a.cos(),
                Func::Tan => a.tan(),
                Func::Log if a <= 0.0 => return None,
                Func::Log => a.log10(),
                Func::Ln if a <= 0.0 => return None,
                Func::Ln => a.ln(),
                Func::Abs => a.abs(),
                Func::Exp => a.exp(),
            }
        }
        Ast::Bin(op, a, b) => {
            let (a, b) = (eval(a, x)?, eval(b, x)?);
            match op {
                Bin::Add => a + b,
                Bin::Sub => a - b,
                Bin::Mul | Bin::Juxt | Bin::Of => a * b,
                Bin::Div if b == 0.0 => return None,
                Bin::Div => a / b,
                Bin::Pow => a.powf(b),
            }
        }
    };
    value.is_finite().then_some(value)
}

/// `ast` as a polynomial in `v`, lowest power first — `None` when it is
/// not one (an unknown under a root, in a denominator, as a power).
fn poly(ast: &Ast, v: char) -> Option<Vec<f64>> {
    const HIGHEST: usize = 8;
    let p = match ast {
        Ast::Var(w) if *w == v => vec![0.0, 1.0],
        Ast::Neg(a) => poly(a, v)?.iter().map(|c| -c).collect(),
        Ast::Pct(a) => poly(a, v)?.iter().map(|c| c / 100.0).collect(),
        Ast::Bin(Bin::Add, a, b) => add(&poly(a, v)?, &poly(b, v)?),
        Ast::Bin(Bin::Sub, a, b) => sub(&poly(a, v)?, &poly(b, v)?),
        Ast::Bin(Bin::Mul | Bin::Juxt | Bin::Of, a, b) => mul(&poly(a, v)?, &poly(b, v)?),
        Ast::Bin(Bin::Div, a, b) => {
            let d = constant(b)?;
            if d == 0.0 {
                return None;
            }
            poly(a, v)?.iter().map(|c| c / d).collect()
        }
        Ast::Bin(Bin::Pow, a, b) => {
            let n = constant(b)?;
            if n.fract() != 0.0 || !(0.0..=HIGHEST as f64).contains(&n) {
                return None;
            }
            let base = poly(a, v)?;
            (0..n as usize).fold(vec![1.0], |p, _| mul(&p, &base))
        }
        _ => vec![constant(ast)?],
    };
    (p.len() <= HIGHEST + 1 && p.iter().all(|c| c.is_finite())).then_some(p)
}

/// The value of a part with no unknown in it.
fn constant(ast: &Ast) -> Option<f64> {
    let mut unknowns = Vec::new();
    unknowns_in(ast, &mut unknowns);
    if unknowns.is_empty() {
        eval(ast, None)
    } else {
        None
    }
}

fn add(a: &[f64], b: &[f64]) -> Vec<f64> {
    (0..a.len().max(b.len())).map(|i| a.get(i).unwrap_or(&0.0) + b.get(i).unwrap_or(&0.0)).collect()
}

fn sub(a: &[f64], b: &[f64]) -> Vec<f64> {
    add(a, &b.iter().map(|c| -c).collect::<Vec<_>>())
}

fn mul(a: &[f64], b: &[f64]) -> Vec<f64> {
    let mut out = vec![0.0; a.len() + b.len() - 1];
    for (i, x) in a.iter().enumerate() {
        for (j, y) in b.iter().enumerate() {
            out[i + j] += x * y;
        }
    }
    out
}

// ---------------------------------------------------------------- numbers

/// Float noise taken off: `0.1 + 0.2` is `0.3`, `2.9999999999` is `3`.
fn clean(x: f64) -> f64 {
    let rounded = x.round();
    let x = if (x - rounded).abs() <= 1e-9 * x.abs().max(1.0) { rounded } else { x };
    if x == 0.0 {
        0.0
    } else {
        x
    }
}

/// To ten significant digits, without trailing zeros.
fn significant(x: f64, digits: i32) -> String {
    let x = clean(x);
    if x.fract() == 0.0 && x.abs() < 1e15 {
        return format!("{x:.0}");
    }
    if x.abs() >= 1e15 || x.abs() < 1e-6 {
        let s = format!("{:.*e}", (digits - 1) as usize, x);
        let (mantissa, exponent) = s.split_once('e').unwrap_or((&s, "0"));
        let mantissa = mantissa.trim_end_matches('0').trim_end_matches('.');
        return format!("{mantissa}e{exponent}");
    }
    let decimals = (digits - 1 - x.abs().log10().floor() as i32).max(0) as usize;
    let s = format!("{x:.decimals$}");
    if s.contains('.') {
        s.trim_end_matches('0').trim_end_matches('.').to_string()
    } else {
        s
    }
}

/// As copied: plain digits, a calculator takes it back.
fn plain(x: f64) -> String {
    significant(x, 10)
}

/// For a root that is not exact.
fn approx(x: f64) -> String {
    significant(x, 6)
}

/// As shown in a row: thousands grouped.
fn shown(x: f64) -> String {
    group(&plain(x), ",")
}

fn group(s: &str, comma: &str) -> String {
    if s.contains('e') {
        return s.to_string();
    }
    let (sign, rest) = s.strip_prefix('-').map_or(("", s), |rest| ("-", rest));
    let (whole, fraction) = rest.split_once('.').map_or((rest, None), |(w, f)| (w, Some(f)));
    if whole.len() <= 4 {
        return s.to_string();
    }
    let mut out = String::new();
    for (i, c) in whole.chars().enumerate() {
        if i > 0 && (whole.len() - i) % 3 == 0 {
            out.push_str(comma);
        }
        out.push(c);
    }
    match fraction {
        Some(f) => format!("{sign}{out}.{f}"),
        None => format!("{sign}{out}"),
    }
}

/// A plain-text number as TeX: thousands grouped, `1.5e20` as a power.
fn tex_plain(s: &str) -> String {
    match s.split_once('e') {
        Some((mantissa, exponent)) => format!("{mantissa} \\times 10^{{{}}}", exponent.trim_start_matches('+')),
        None => group(s, "{,}"),
    }
}

fn tex_number(x: f64) -> String {
    tex_plain(&plain(x))
}

/// A root as TeX: a fraction when it is one, else the number.
fn tex_value(x: f64) -> String {
    match fraction(x) {
        Some((n, d)) => tex_fraction(n, d),
        None => tex_number(x),
    }
}

fn tex_fraction(n: i64, d: i64) -> String {
    if n < 0 {
        format!("-\\frac{{{}}}{{{d}}}", -n)
    } else {
        format!("\\frac{{{n}}}{{{d}}}")
    }
}

/// `x` as `n/d` with `d` at most 1000, when it is one and not whole.
fn fraction(x: f64) -> Option<(i64, i64)> {
    if x.fract() == 0.0 || x.abs() > 1e9 {
        return None;
    }
    // Continued fraction convergents.
    let (mut h0, mut h1, mut k0, mut k1) = (0i64, 1i64, 1i64, 0i64);
    let mut rest = x;
    for _ in 0..32 {
        let a = rest.floor();
        let (h2, k2) = (a as i64 * h1 + h0, a as i64 * k1 + k0);
        if k2 > 1000 {
            return None;
        }
        (h0, h1, k0, k1) = (h1, h2, k1, k2);
        if (h1 as f64 / k1 as f64 - x).abs() <= 1e-12 * x.abs().max(1.0) {
            return (k1 > 1).then_some((h1, k1));
        }
        let left = rest - a;
        if left == 0.0 {
            return None;
        }
        rest = 1.0 / left;
    }
    None
}

// ---------------------------------------------------------------- TeX

/// How tightly a node binds, for where TeX needs brackets.
fn binding(ast: &Ast) -> u8 {
    match ast {
        Ast::Bin(Bin::Add | Bin::Sub, ..) => 1,
        Ast::Bin(Bin::Mul | Bin::Juxt | Bin::Of, ..) => 2,
        Ast::Neg(_) => 3,
        Ast::Bin(Bin::Div | Bin::Pow, ..) => 4,
        Ast::Num(n) if *n < 0.0 => 3,
        _ => 5,
    }
}

fn tex(ast: &Ast) -> String {
    match ast {
        Ast::Num(n) => tex_number(*n),
        Ast::Var(v) => v.to_string(),
        Ast::Pi => "\\pi".into(),
        Ast::Neg(a) => format!("-{}", tex_at(a, 3)),
        Ast::Pct(a) => format!("{}\\%", tex_at(a, 5)),
        Ast::Call(Func::Sqrt, a) => format!("\\sqrt{{{}}}", tex(a)),
        Ast::Call(Func::Abs, a) => format!("\\left|{}\\right|", tex(a)),
        Ast::Call(func, a) => {
            let name = match func {
                Func::Sin => "\\sin",
                Func::Cos => "\\cos",
                Func::Tan => "\\tan",
                Func::Log => "\\log",
                Func::Ln => "\\ln",
                _ => "\\exp",
            };
            format!("{name}\\left({}\\right)", tex(a))
        }
        Ast::Bin(op, a, b) => match op {
            Bin::Add => format!("{} + {}", tex_at(a, 1), tex_at(b, 2)),
            Bin::Sub => format!("{} - {}", tex_at(a, 1), tex_at(b, 2)),
            Bin::Mul => format!("{} \\cdot {}", tex_at(a, 2), tex_at(b, 3)),
            Bin::Of => format!("{}\\ \\text{{of}}\\ {}", tex_at(a, 2), tex_at(b, 3)),
            Bin::Juxt => {
                let (l, r) = (tex_at(a, 2), tex_at(b, 4));
                // Two numbers side by side would read as one.
                if l.ends_with(|c: char| c.is_ascii_digit() || c == '}') && r.starts_with(|c: char| c.is_ascii_digit()) {
                    format!("{l} \\cdot {r}")
                } else {
                    format!("{l}{r}")
                }
            }
            Bin::Div => format!("\\frac{{{}}}{{{}}}", tex(a), tex(b)),
            Bin::Pow => format!("{}^{{{}}}", tex_at(a, 5), tex(b)),
        },
    }
}

fn tex_at(ast: &Ast, least: u8) -> String {
    if binding(ast) < least {
        format!("\\left({}\\right)", tex(ast))
    } else {
        tex(ast)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn one(text: &str) -> Found {
        let list = found_in(text);
        assert_eq!(list.len(), 1, "{text}: {list:#?}");
        list.into_iter().next().unwrap()
    }

    fn copies(found: &Found) -> Vec<&str> {
        found.answers.iter().map(|a| a.copy.as_str()).collect()
    }

    fn spans(text: &str) -> Vec<String> {
        let units: Vec<u16> = text.encode_utf16().collect();
        found_in(text).iter().map(|f| String::from_utf16_lossy(&units[f.from..f.to])).collect()
    }

    #[test]
    fn the_owners_example() {
        let text = "Tôi có biểu thức 1+2   +5 + 10 và phương trình x^(2)-5x+6=0";
        let list = found_in(text);
        assert_eq!(spans(text), ["1+2   +5 + 10", "x^(2)-5x+6=0"]);
        assert_eq!(list[0].sort, Sort::Expression);
        assert_eq!(copies(&list[0]), ["18"]);
        assert_eq!(list[0].tex, "1 + 2 + 5 + 10");
        assert_eq!(list[1].sort, Sort::Quadratic);
        assert_eq!(copies(&list[1]), ["x = 2", "x = 3"]);
        assert_eq!(list[1].tex, "x^{2} - 5x + 6 = 0");
        assert_eq!(list[1].short, "x = 2, 3");
    }

    #[test]
    fn sums_are_worked_out() {
        assert_eq!(copies(&one("(450000 + 320000 + 95000) / 3")), ["288333.3333", "865000/3"]);
        assert_eq!(one("0.1 + 0.2").short, "= 0.3");
        assert_eq!(copies(&one("1/3 + 1/6")), ["0.5", "1/2"]);
        assert_eq!(copies(&one("√(16) + 3^2 * 2")), ["22"]);
        assert_eq!(copies(&one("2³ − 1")), ["7"]);
        assert_eq!(copies(&one("sqrt 2 * sqrt 2")), ["2"]);
        assert_eq!(copies(&one("sin(pi/6) + cos(0)")), ["1.5", "3/2"]);
        assert_eq!(copies(&one("3 x 4")), ["12"], "an x between numbers is a times sign");
        assert_eq!(copies(&one("1,000 + 1,5")), ["1001.5", "2003/2"]);
        assert_eq!(one("12000 * 3").short, "= 36,000");
    }

    #[test]
    fn percentages_are_taken() {
        let found = one("a 10% of 865000 tip");
        assert_eq!(found.sort, Sort::Percentage);
        assert_eq!(copies(&found), ["86500"]);
        assert_eq!(found.tex, "10\\%\\ \\text{of}\\ 865{,}000");
        assert_eq!(copies(&one("200 * 15%")), ["30"]);
    }

    #[test]
    fn equations_are_solved() {
        assert_eq!(copies(&one("3x + 7 = 22")), ["x = 5"]);
        assert_eq!(copies(&one("2x = 1")), ["x = 0.5"]);
        assert_eq!(one("2x = 1").answers[0].tex, "x = \\frac{1}{2}");
        assert_eq!(copies(&one("x^2 = 2"))[0], "x = ±√2");
        assert_eq!(copies(&one("x^2 - 4x + 1 = 0"))[0], "x = 2 ± √3");
        assert_eq!(copies(&one("2x^2 + 3x - 1 = 0"))[0], "x = (-3 ± √17) / 4");
        let complex = one("x^2 + 2x + 5 = 0");
        assert_eq!(copies(&complex), ["x = -1 ± 2i"]);
        assert_eq!(complex.note.as_deref(), Some("Complex roots · Δ = -16"));
        assert_eq!(one("x² - 6x + 9 = 0").note.as_deref(), Some("Double root"));
        assert_eq!(one("x + 1 = x + 1").note.as_deref(), Some("True for every x"));
        assert_eq!(one("x + 1 = x + 2").note.as_deref(), Some("No solution"));
    }

    #[test]
    fn equalities_are_checked() {
        let found = one("2+2=5");
        assert_eq!(found.holds, Some(false));
        assert_eq!(found.note.as_deref(), Some("Left 4 · right 5"));
        assert_eq!(one("√16 + 3² * 2 = 22").holds, Some(true));
    }

    #[test]
    fn what_is_not_math_is_left_alone() {
        for text in [
            "Meeting at 10:30 on 05/10/2026, call 0903-123-456.",
            "Build 0.55.1 runs 24/7 and takes 1-2 days.",
            "Released 2026-10-05.",
            "Screen 1920x1080",
            "Call +84 903 123 456",
            "COVID-19 and x-ray",
            "Step 3. Then -5",
            "Solve 2x^3 - 3x^2 - 11x + 6 = 0",
            "x + y = 3",
            "f(x) = 2x",
            "Just words and 42.",
            "- item one\n- item two",
        ] {
            assert!(found_in(text).is_empty(), "{text}: {:#?}", found_in(text));
        }
    }

    #[test]
    fn spans_count_in_utf16() {
        let text = "😀 é 1+1";
        let list = found_in(text);
        assert_eq!((list[0].from, list[0].to), (5, 8));
    }

    #[test]
    fn rows_say_the_answer_or_how_many() {
        assert_eq!(row_answer(&found_in("1+1")), "= 2");
        assert_eq!(row_answer(&found_in("1+1 and 2+2")), "∑ 2");
        assert_eq!(row_answer(&found_in("nothing")), "");
    }

    #[test]
    fn only_answers_shown_can_be_copied() {
        let list = found_in("1+1 and 3x = 6");
        assert!(is_answer(&list, "2"));
        assert!(is_answer(&list, "x = 2"));
        assert!(is_answer(&list, "2\nx = 2"));
        assert!(!is_answer(&list, "rm -rf ~"));
        assert!(!is_answer(&list, ""));
    }
}
