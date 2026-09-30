// What the search found, marked in the preview card and scrolled to — the
// card's own text, whatever drew it: plain text, a rich copy's formatting,
// the words read in an image, a JSON tree, highlighted code, a PDF's text.
//
// Marked with the CSS Custom Highlight API rather than by wrapping the
// words in elements: every one of those views owns its DOM (React, pdf.js,
// lowlight), and a highlight is ranges laid over it that touch nothing. A
// WebKit without the API (before Safari 17.2) marks nothing, and still
// scrolls to the first match, which is only ranges and geometry.

import { useEffect, type RefObject } from "react";
import { highlights, type Used, words } from "./search";

/** The name `::highlight()` in panel.css draws. */
const NAME = "search";

/** How much of the card's text is searched for marks: a long text file
 *  should not make every keystroke walk megabytes. */
const MOST = 100_000;

/** The card's own text, not what frames it: its head, its foot, controls. */
const FRAME = ".card-head, .card-foot, button, input";

type Piece = { node: Text; start: number };

export function usePreviewMarks(card: RefObject<HTMLElement | null>, query: string, used: Used, shownFor: unknown) {
  useEffect(() => {
    const root = card.current;
    const registry = typeof CSS !== "undefined" && "highlights" in CSS ? CSS.highlights : null;
    const clear = () => registry?.delete(NAME);
    if (!root || !words(query).length) {
      clear();
      return;
    }
    // Scrolled to once per row and query: after that the person may be
    // reading somewhere else, and a late render must not pull them back.
    let scrolled = false;
    // One pass per burst of changes; a timer rather than a frame, so a
    // window that is not being drawn still gets its marks.
    let timer = 0;
    const mark = () => {
      timer = 0;
      const ranges = rangesIn(root, query, used);
      if (registry) {
        if (ranges.length) registry.set(NAME, new Highlight(...ranges));
        else registry.delete(NAME);
      }
      const first = ranges[0];
      if (first && !scrolled) {
        scrolled = true;
        bringIntoView(first, root);
      }
    };
    const soon = () => {
      if (!timer) timer = window.setTimeout(mark, 16);
    };
    soon();
    // The full text, a rich copy's formatting, a PDF's pages: all arrive
    // after the row is picked, so the marks follow what is drawn.
    const watch = new MutationObserver(soon);
    watch.observe(root, { childList: true, subtree: true, characterData: true });
    return () => {
      watch.disconnect();
      window.clearTimeout(timer);
      clear();
    };
  }, [card, query, used, shownFor]);
}

/** Every stretch of the card's text the query finds, as ranges. The text
 *  nodes are read as one string, so a word split across two of them —
 *  highlighted code splits a line into tokens — is still one match. */
function rangesIn(root: HTMLElement, query: string, used: Used): Range[] {
  const pieces: Piece[] = [];
  let text = "";
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: (node) =>
      node.parentElement?.closest(FRAME) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT,
  });
  for (let node = walker.nextNode(); node && text.length < MOST; node = walker.nextNode()) {
    const value = (node as Text).data;
    if (!value) continue;
    pieces.push({ node: node as Text, start: text.length });
    text += value;
  }
  if (!pieces.length) return [];
  const ranges: Range[] = [];
  for (const [from, to] of highlights(text, query, used)) {
    const start = at(pieces, from);
    const end = at(pieces, to);
    if (!start || !end) continue;
    const range = document.createRange();
    range.setStart(start.node, start.offset);
    range.setEnd(end.node, end.offset);
    ranges.push(range);
  }
  return ranges;
}

/** The text node and offset `offset` of the joined text falls in. An end
 *  exactly at a node's end stays in that node. */
function at(pieces: Piece[], offset: number): { node: Text; offset: number } | null {
  let low = 0;
  let high = pieces.length - 1;
  while (low < high) {
    const mid = (low + high + 1) >> 1;
    if (pieces[mid]!.start < offset) low = mid;
    else high = mid - 1;
  }
  const piece = pieces[low];
  if (!piece) return null;
  return { node: piece.node, offset: Math.min(offset - piece.start, piece.node.data.length) };
}

/** Scroll each box that holds the range, inside the card, so the range sits
 *  a third of the way down (and in from the left, for code that scrolls
 *  sideways). Nothing moves when it is already in sight. */
function bringIntoView(range: Range, root: HTMLElement) {
  for (let box = range.startContainer.parentElement; box && root.contains(box); box = box.parentElement) {
    // Read again at each box: scrolling the one inside moved it.
    const rect = range.getBoundingClientRect();
    if (!rect.width && !rect.height) return;
    const style = getComputedStyle(box);
    const outer = box.getBoundingClientRect();
    if (/(auto|scroll)/.test(style.overflowY) && box.scrollHeight > box.clientHeight) {
      if (rect.top < outer.top || rect.bottom > outer.bottom) {
        box.scrollTop += rect.top - outer.top - box.clientHeight / 3;
      }
    }
    if (/(auto|scroll)/.test(style.overflowX) && box.scrollWidth > box.clientWidth) {
      if (rect.left < outer.left || rect.right > outer.right) {
        box.scrollLeft += rect.left - outer.left - box.clientWidth / 4;
      }
    }
    if (box === root) break;
  }
}
