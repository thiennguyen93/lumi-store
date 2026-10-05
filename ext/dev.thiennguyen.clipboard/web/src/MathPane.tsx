// The math in a text or rich copy, under its text: each piece the extension
// found (src/math.rs) as it is written, typeset, and its answers, a click
// on one copying it. Copy all copies every answer, one piece a line. The
// extension copies an answer only while it still works it out of the item.
//
// Where each piece is in the copy is marked over the text with the CSS
// Custom Highlight API, as the search's matches are (previewMarks.ts): the
// text is React's, and a highlight touches none of it. Hovering a piece
// marks its own stretch harder. The extension counts where a piece is in
// the copy's plain text; a rich copy draws its formatting instead, with
// other spaces and line breaks, so each piece is found in what is drawn by
// its characters, spaces aside, each after the one before.

import { type RefObject, useLayoutEffect, useRef, useState } from "react";
import type { MathFound, MathSort } from "./bridge";
import { CopyGlyph } from "./icons";
import { useScrollFade } from "./scrollFade";
import { Tex } from "./Tex";

const SORT_WORDS: Record<MathSort, string> = {
  expression: "Expression",
  percentage: "Percentage",
  linear: "Linear equation",
  quadratic: "Quadratic equation",
  equation: "Equation",
  check: "Check",
};

/** The names panel.css draws with `::highlight()`. */
const ALL = "math";
const ONE = "math-on";

export function MathPane({
  list,
  text,
  body,
  onCopy,
}: {
  list: MathFound[];
  /** The copy's plain text, which the pieces' offsets count in. */
  text: string;
  /** Where the copy is drawn: its text, or its formatting. */
  body: RefObject<HTMLElement | null>;
  onCopy?: (text: string) => void;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  useScrollFade(scroller);
  const [hovered, setHovered] = useState<number | null>(null);
  useMathMarks(body, list, text, hovered);
  const all = list
    .filter((found) => found.answers?.length)
    .map((found) => found.answers!.map((answer) => answer.copy).join(", "))
    .join("\n");
  const many = `${list.length} found`;
  return (
    <section className="math" aria-label={`Math, ${many}`}>
      <header className="math-head">
        <span>Math · {many}</span>
        {all && onCopy && (
          <button
            type="button"
            className="bare math-all"
            title="Copy every answer"
            // The caret stays in the search field, as it does for a row.
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => onCopy(all)}
          >
            <CopyGlyph />
            Copy all
          </button>
        )}
      </header>
      <div className="math-list" ref={scroller}>
        {list.map((found, i) => (
          <div
            key={`${found.from}:${found.to}`}
            className="math-card"
            onMouseEnter={() => setHovered(i)}
            onMouseLeave={() => setHovered((now) => (now === i ? null : now))}
          >
            <div className="math-top">
              <span className="math-kind">{SORT_WORDS[found.sort]}</span>
              {found.holds !== undefined && (
                <span className={found.holds ? "math-verdict pass" : "math-verdict fail"}>
                  {found.holds ? "✓ True" : "✕ False"}
                </span>
              )}
            </div>
            <Tex className="math-tex" tex={found.tex} />
            {!!found.answers?.length && (
              <div className="math-answers">
                {found.answers.map((answer) => (
                  <button
                    key={answer.copy}
                    type="button"
                    className="math-answer"
                    title={`Copy ${answer.copy}`}
                    aria-label={`Copy ${answer.copy}`}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => onCopy?.(answer.copy)}
                  >
                    <Tex tex={answer.tex} />
                    <CopyGlyph />
                  </button>
                ))}
              </div>
            )}
            {/* Under the answers, where a narrow pane has room for all of it. */}
            {found.note && <div className="math-note">{found.note}</div>}
          </div>
        ))}
      </div>
    </section>
  );
}

/** Every piece's stretch of the text marked, the hovered one harder. */
function useMathMarks(body: RefObject<HTMLElement | null>, list: MathFound[], text: string, hovered: number | null) {
  const registry = typeof CSS !== "undefined" && "highlights" in CSS ? CSS.highlights : null;
  useLayoutEffect(() => {
    const root = body.current;
    if (!registry || !root) return;
    const ranges = rangesOf(root, list.map((found) => text.slice(found.from, found.to)));
    const shown = ranges.filter((range): range is Range => !!range);
    if (shown.length) registry.set(ALL, new Highlight(...shown));
    const one = hovered === null ? null : ranges[hovered];
    if (one) registry.set(ONE, new Highlight(one));
    else registry.delete(ONE);
    return () => {
      registry.delete(ALL);
      registry.delete(ONE);
    };
  }, [body, list, text, hovered, registry]);
}

/** Where each of `pieces` is in the element's text, in order: matched by
 *  everything but whitespace, so `1 + 2` in the copy's text is found in
 *  formatting that draws it `1+ 2`, or across a bold run. `null` for a
 *  piece not found after the one before it. */
function rangesOf(root: HTMLElement, pieces: string[]): (Range | null)[] {
  // The drawn text with its whitespace left out, and where each of its
  // characters is.
  const where: [Text, number][] = [];
  let drawn = "";
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode() as Text | null; node; node = walker.nextNode() as Text | null) {
    for (let i = 0; i < node.data.length; i++) {
      if (/\s/.test(node.data[i]!)) continue;
      where.push([node, i]);
      drawn += node.data[i];
    }
  }
  let after = 0;
  return pieces.map((piece) => {
    const wanted = piece.replace(/\s+/g, "");
    const at = wanted ? drawn.indexOf(wanted, after) : -1;
    if (at < 0) return null;
    after = at + wanted.length;
    const [first, last] = [where[at]!, where[after - 1]!];
    const range = document.createRange();
    range.setStart(first[0], first[1]);
    range.setEnd(last[0], last[1] + 1);
    return range;
  });
}
