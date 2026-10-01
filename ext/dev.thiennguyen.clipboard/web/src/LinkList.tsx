// The web addresses in a text or rich copy, under its text in the preview:
// one a line, each opened in the browser by a click. The extension finds
// them (src/links.rs) and opens one only while the item still has it —
// the page names an address it was given, never one of its own.

import { useRef } from "react";
import type { Link } from "./bridge";
import { ExternalGlyph, KindGlyph } from "./icons";
import { shownAddress } from "./links";
import { useScrollFade } from "./scrollFade";

export function LinkList({ links, count, onOpen }: { links: Link[]; count: number; onOpen: (url: string) => void }) {
  const list = useRef<HTMLUListElement>(null);
  useScrollFade(list);
  const many = `${count} ${count === 1 ? "link" : "links"}`;
  return (
    <section className="links" aria-label={many}>
      <header className="links-head">{count > links.length ? `First ${links.length} of ${many}` : many}</header>
      <ul ref={list}>
        {links.map((link) => (
          <li key={link.url}>
            <button
              type="button"
              className="link-line"
              title={link.url}
              aria-label={`Open ${link.text ?? shownAddress(link.url)} in the browser`}
              // The caret stays in the search field, as it does for a row.
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => onOpen(link.url)}
            >
              <KindGlyph kind="link" />
              <span className="link-text">
                {link.text && <span className="link-words">{link.text}</span>}
                <span className="link-address">{shownAddress(link.url)}</span>
              </span>
              <ExternalGlyph />
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
