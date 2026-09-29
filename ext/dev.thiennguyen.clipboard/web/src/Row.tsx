import { blobUrl } from "./bridge";
import { FileGlyph, KindGlyph, PinGlyph } from "./icons";
import { fileFamily } from "./fileType";
import { AppMark } from "./AppMark";
import { since } from "./search";
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
        <FileGlyph family={fileFamily(row.fileExt)} />
      </span>
    );
  }
  return (
    <span className="lead">
      <KindGlyph kind={row.kind} />
    </span>
  );
}

export function Row({
  row,
  index,
  selected,
  shortcut,
  popped,
  onPick,
  onPaste,
}: {
  row: Entry;
  index: number;
  selected: boolean;
  shortcut: string | undefined;
  /** Just pinned: its pin pops in. */
  popped: boolean;
  onPick: (index: number) => void;
  onPaste: (plain: boolean) => void;
}) {
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
      <span className="title">{row.title || KIND_WORDS[row.kind]}</span>
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
