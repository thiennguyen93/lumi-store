// Words in a rich copy's preview that are one of its links — an `<a>` whose
// href the extension listed, or an address written out in its text — drawn
// as a link and opened by a click (src/links.rs finds them;
// `open` takes back only one of those). Never an `<a href>`: the webview is
// given no address to follow, so nothing in a copy can navigate the panel.

import { createElement, Fragment, type ReactNode } from "react";
import type { Link } from "./bridge";
import { linkPieces } from "./links";

/** The props that make an element a link to `url`. A click that ends a
 *  drag across the text selects it rather than opening anything. */
export function liveLink(url: string, onOpen: (url: string) => void) {
  return {
    className: "link live",
    role: "link",
    tabIndex: -1,
    title: url,
    onClick: () => {
      if (window.getSelection()?.isCollapsed === false) return;
      onOpen(url);
    },
  };
}

/** `text`, with each listed address it writes out made a link. */
export function linked(text: string, links: readonly Link[], onOpen?: (url: string) => void): ReactNode {
  if (!onOpen || !links.length) return text;
  const pieces = linkPieces(text, links);
  if (pieces.length === 1 && typeof pieces[0] === "string") return text;
  return createElement(
    Fragment,
    null,
    ...pieces.map((piece, i) =>
      typeof piece === "string" ? piece : createElement("span", { key: i, ...liveLink(piece.url, onOpen) }, piece.text),
    ),
  );
}
