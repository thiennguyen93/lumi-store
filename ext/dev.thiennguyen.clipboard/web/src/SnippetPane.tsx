// What a copy expands to when it is one of the person's snippet triggers
// (src/snippets.rs): each expansion, the profiles whose snippet gives it,
// its web addresses live, and a button that copies it. Lumi matched and
// expanded it; the extension copies or opens only what the item still
// expands to. Each folds away under its own head — a long one out of the
// way of the next — and opens again by the same press.

import { type ReactNode, useRef, useState } from "react";
import type { Expansion } from "./bridge";
import { ChevronRightGlyph, CopyGlyph, RefreshGlyph } from "./icons";
import { linked } from "./LinkedText";
import { useScrollFade } from "./scrollFade";

export function SnippetPane({
  expansions,
  grip,
  onCopy,
  onOpen,
}: {
  expansions: Expansion[];
  /** The line above the section, to drag (Preview.tsx `Grip`). */
  grip?: ReactNode;
  onCopy?: (text: string) => void;
  onOpen?: (url: string) => void;
}) {
  // Only when some expansions can change and others cannot does each that
  // can carry a mark, so the one sentence (`SnippetNote`) can say which it
  // is about.
  // The section scrolls in the room the card gives it, its ends fading
  // while there is more beyond them — the link list's way.
  const box = useRef<HTMLDivElement>(null);
  useScrollFade(box);
  // The expansions folded away, by place. For this preview only: the pane
  // is drawn afresh for each row (its key is the row's), so every copy
  // opens with what it expands to in view.
  const [folded, setFolded] = useState<ReadonlySet<number>>(new Set());
  const fold = (at: number) =>
    setFolded((was) => {
      const next = new Set(was);
      if (!next.delete(at)) next.add(at);
      return next;
    });
  const { mixed } = changing(expansions);
  return (
    <section className="snippet" aria-label="Expands to">
      {grip}
      <div ref={box} className="snippet-scroll">
        {expansions.map((one, at) => (
          <div className="expansion" key={at}>
            <header className="snippet-head">
              <button
                type="button"
                className="snippet-toggle"
                aria-expanded={!folded.has(at)}
                aria-controls={`expansion-${at}`}
                title={folded.has(at) ? "Show what it expands to" : "Fold it away"}
                // The caret stays in the search field, as it does for a row.
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => fold(at)}
              >
                <ChevronRightGlyph />
                <span className="snippet-from">
                  Expands to{one.profiles.length ? ` · ${one.profiles.join(", ")}` : ""}
                </span>
                {mixed && one.dynamic && (
                  <span className="snippet-mark" title="May change each time it's shown" aria-label="May change">
                    <RefreshGlyph />
                  </span>
                )}
              </button>
              {onCopy && (
                <button
                  type="button"
                  className="bare"
                  title="Copy"
                  aria-label="Copy what it expands to"
                  // The caret stays in the search field, as it does for a row.
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => onCopy(one.text)}
                >
                  <CopyGlyph />
                </button>
              )}
            </header>
            {!folded.has(at) && (
              <div id={`expansion-${at}`} className="body snippet-text">
                {linked(one.text, one.links, onOpen)}
              </div>
            )}
          </div>
        ))}
      </div>
      <SnippetNote expansions={expansions} />
    </section>
  );
}

/** How many of these expansions are made afresh each time, and whether
 *  they sit beside ones that are not. */
function changing(expansions: Expansion[]): { count: number; mixed: boolean } {
  const count = expansions.filter((one) => one.dynamic).length;
  return { count, mixed: count > 0 && count < expansions.length };
}

/**
 * The one sentence for every expansion that can change, at the foot of the
 * section — which reaches the card's foot, so it sits over "Copied …" —
 * said once rather than under each, where two profiles' scripts would say
 * it twice, and kept still rather than scrolled with the expansions it is
 * about. In the section, not in the card's foot: there it made the foot
 * taller than an image's, and the rule above moved between the two kinds.
 *
 * "May": a script or a variable is expanded again each time, and whether
 * that comes out different — a date within one day, a script that only
 * reshapes what its pattern caught — nothing here can tell. Beside fixed
 * ones it carries the ↻ the changing ones are marked with.
 */
function SnippetNote({ expansions }: { expansions: Expansion[] }) {
  const { count, mixed } = changing(expansions);
  if (!count) return null;
  return (
    <p className="snippet-fresh">
      {mixed && <RefreshGlyph />}
      {count > 1 ? "May change each time they're shown" : "May change each time it's shown"}
    </p>
  );
}
