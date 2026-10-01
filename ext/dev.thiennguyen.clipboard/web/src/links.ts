// The links a preview draws — the list under a text or rich copy
// (LinkList.tsx), and a rich copy's own body (richText.tsx, LinkedText.tsx):
// how an address is written for a person, and where the text writes out one
// of the addresses the extension found. The extension finds them
// (src/links.rs); nothing here decides what is a link — a stretch of text
// is one only when it is, character for character, an address it listed.

import type { Link } from "./bridge";

/** An address as a person reads it: no `http://` or `https://`, no slash
 *  after a bare host, and percent-escapes read back as the letters they
 *  are (`Vi%E1%BB%87t` → `Việt`). Escapes of `/`, `?`, `#` and the like
 *  stay, so the address still reads as the one it is. */
export function shownAddress(url: string): string {
  let shown = url.replace(/^https?:\/\//i, "");
  if (/^[^/?#]+\/$/.test(shown)) shown = shown.slice(0, -1);
  try {
    shown = decodeURI(shown);
  } catch {
    // A stray `%` that starts no escape: shown as written.
  }
  return shown;
}

/** The listed link an `<a>`'s href is, tidied as the extension tidies one
 *  (tabs and line breaks out, the ends trimmed); undefined for an href it
 *  did not list — a page-relative one, `mailto:`, `javascript:`. */
export function linkOfHref(href: string | null, links: readonly Link[]): Link | undefined {
  if (!href) return undefined;
  const tidy = href.replace(/[\t\n\r]/g, "").trim();
  return links.find((link) => link.url === tidy);
}

/** A stretch of text, or one that writes out a listed address. */
export type Piece = string | { text: string; url: string };

/** `text` cut where it writes out one of `links`: as listed, or — for an
 *  address the extension wrote `www.` text into — without the `https://` it
 *  added. Leftmost first and, where two start together, the longer; one
 *  that starts inside a word (`xhttps://…`) is left as text. */
export function linkPieces(text: string, links: readonly Link[]): Piece[] {
  const written: { text: string; url: string }[] = [];
  for (const { url } of links) {
    written.push({ text: url, url });
    if (/^https:\/\/www\./i.test(url)) written.push({ text: url.slice("https://".length), url });
  }
  if (!written.length || !text) return [text];
  const pieces: Piece[] = [];
  let from = 0;
  let at = 0;
  while (at < text.length) {
    let best: { start: number; text: string; url: string } | null = null;
    for (const w of written) {
      let start = text.indexOf(w.text, at);
      while (start >= 0 && inWord(text, start)) start = text.indexOf(w.text, start + 1);
      if (start < 0) continue;
      if (!best || start < best.start || (start === best.start && w.text.length > best.text.length)) {
        best = { start, ...w };
      }
    }
    if (!best) break;
    if (best.start > from) pieces.push(text.slice(from, best.start));
    pieces.push({ text: best.text, url: best.url });
    from = at = best.start + best.text.length;
  }
  if (from < text.length) pieces.push(text.slice(from));
  return pieces;
}

/** Whether what starts at `at` continues a word, an address or an e-mail —
 *  the extension's own rule for where an address may start. */
function inWord(text: string, at: number): boolean {
  const before = text[at - 1];
  return before !== undefined && /[\p{L}\p{N}.@/\-_+]/u.test(before);
}
