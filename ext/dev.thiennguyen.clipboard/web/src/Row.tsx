import { useLayoutEffect, useRef, useState } from "react";
import { blobUrl, call } from "./bridge";
import { useItemDrag } from "./itemDrag";
import { FileGlyph, KindGlyph, PinGlyph } from "./icons";
import { fileFamily } from "./fileType";
import { AppMark } from "./AppMark";
import { type Found, keptInSight, nextSkip, since, skipped, type Span } from "./search";
import type { Entry } from "./types";

export const HEX = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;

export const KIND_WORDS: Record<Entry["kind"], string> = {
  text: "Text",
  link: "Link",
  color: "Colour",
  rich: "Rich text",
  file: "File",
  image: "Image",
};

/** What stands before a title: the colour itself for a hex colour, the
 *  picture for an image, nothing for the rest — the key-cap already
 *  leads the row. The colour is re-checked here rather than trusted from
 *  `kind`, since it is about to become a CSS value. */
function Lead({ row }: { row: Entry }) {
  // One 16px slot on every row, so titles start in one column: a colour
  // and a picture are their own sign of what they are; everything else
  // gets its kind's glyph — the same one its filter chip wears.
  if (row.kind === "color" && HEX.test(row.title)) {
    return (
      <span className="lead">
        <span className="swatch" style={{ background: row.title }} />
      </span>
    );
  }
  if (row.kind === "image" && row.thumb) {
    return (
      <span className="lead thumb">
        <img alt="" src={blobUrl(row.thumb)} />
      </span>
    );
  }
  if (row.kind === "file") {
    return (
      <span className="lead">
        <FileGlyph family={fileFamily(row.fileExt)} many={(row.fileCount ?? 0) > 1} />
      </span>
    );
  }
  return (
    <span className="lead">
      <KindGlyph kind={row.kind} />
    </span>
  );
}

/** The title, with what the search found in it marked. */
function Title({ text, marks }: { text: string; marks: Span[] }) {
  if (!marks.length) return <>{text}</>;
  const parts = [];
  let at = 0;
  for (const [start, end] of marks) {
    if (start > at) parts.push(text.slice(at, start));
    parts.push(<mark key={start}>{text.slice(start, end)}</mark>);
    at = end;
  }
  if (at < text.length) parts.push(text.slice(at));
  return <>{parts}</>;
}

let measure: CanvasRenderingContext2D | null = null;

/** How wide the ellipsis an overflowing `box` ends in is, in its font. */
function ellipsisWidth(box: HTMLElement): number {
  measure ??= document.createElement("canvas").getContext("2d");
  if (!measure) return 12;
  measure.font = getComputedStyle(box).font;
  return measure.measureText("…").width;
}

/**
 * `found`, fitted to the row as drawn: when the match — with the marks just
 * after it — runs past the title's right edge, the lead before it loses a
 * word at a time until it is in sight, or starts right at the match. The
 * width is measured, not guessed: a row beside a wide preview shows far
 * fewer letters than one on its own.
 */
function useFitted(found: Found) {
  const title = useRef<HTMLSpanElement>(null);
  const [skip, setSkip] = useState(0);
  const [width, setWidth] = useState(0);

  // A new text, or a new width, starts from the whole lead again.
  useLayoutEffect(() => setSkip(0), [found.text, width]);

  useLayoutEffect(() => {
    const box = title.current;
    if (!box) return;
    const watch = new ResizeObserver(() => setWidth(box.clientWidth));
    watch.observe(box);
    return () => watch.disconnect();
  }, []);

  const shown = skipped(found, skip);
  useLayoutEffect(() => {
    const box = title.current;
    if (!box || !found.marks.length) return;
    const marks = box.querySelectorAll("mark");
    const last = marks[Math.min(keptInSight(shown), marks.length) - 1];
    if (!last) return;
    // An overflowing title ends in an ellipsis, drawn over its last letters:
    // the mark has to end before it, not just before the edge.
    const edge = box.getBoundingClientRect().right - (box.scrollWidth > box.clientWidth ? ellipsisWidth(box) : 0);
    if (last.getBoundingClientRect().right <= edge + 0.5) return;
    const next = nextSkip(found, skip);
    if (next !== null) setSkip(next);
  });

  return { title, shown };
}

export function Row({
  row,
  index,
  selected,
  shortcut,
  found,
  popped,
  onPick,
  onPaste,
}: {
  row: Entry;
  index: number;
  selected: boolean;
  shortcut: string | undefined;
  /** The title as the search shows it: from near the match when the
   *  match is far in, what to mark, and where it was when not in sight. */
  found: Found;
  /** Just pinned: its pin pops in. */
  popped: boolean;
  onPick: (index: number) => void;
  onPaste: (plain: boolean) => void;
}) {
  // Pulled out of the panel, the row goes where it is dropped. Picked as it
  // goes, so the preview shows what is being dragged. A refusal — the button
  // already up — is nothing to tell anyone.
  const { title, shown } = useFitted(found);
  const drag = useItemDrag(() => {
    onPick(index);
    call({ kind: "drag", id: row.id }).catch(() => {});
  });
  return (
    <div
      id={`row-${index}`}
      data-id={row.id}
      className="row"
      role="option"
      aria-selected={selected}
      // Keeps the caret in the search field: a click that took focus would
      // send the next letter typed nowhere.
      onMouseDown={(event) => event.preventDefault()}
      onClick={() => onPick(index)}
      onDoubleClick={(event) => onPaste(event.altKey)}
      {...drag}
    >
      {/* The row's key: ⌘ + this pastes it. A pin's is amber, as Lumi's
          leader menu draws a key; the rest are plain. A row without one
          keeps the slot, so titles stay in a column. */}
      <span className={["cap", row.pin ? "pin" : "", shortcut ? "" : "blank"].filter(Boolean).join(" ")}>
        {/* ⌘ spelled out: a bare letter would be typed into the search. */}
        {shortcut ? `⌘${shortcut.toUpperCase()}` : ""}
      </span>
      <Lead row={row} />
      {/* Copied text, so always a text node — never markup. */}
      <span className="title" ref={title}>{shown.text ? <Title text={shown.text} marks={shown.marks} /> : KIND_WORDS[row.kind]}</span>
      {/* Found in nothing the row shows: where, so the row is not a riddle. */}
      {found.note && <span className="found-in">{found.note}</span>}
      {/* Two fixed columns at the end, so a time growing from 9s to 10s
          never shoves the app name: the app, right-aligned against the
          time, and the time (or a pin's glyph) in a column of its own. */}
      {!row.pin && (row.app || row.appName) && (
        <>
          {/* The source application's icon, its name when there is none. */}
          <AppMark app={row.app} name={row.appName} />
          {/* A column of its own too, so it stays put with the others. */}
          <span className="dot" aria-hidden="true">·</span>
        </>
      )}
      {row.pin ? (
        <span className={popped ? "when pop" : "when"} aria-label="Pinned">
          <PinGlyph />
        </span>
      ) : (
        <span className="when">{since(row.last)}</span>
      )}
    </div>
  );
}
