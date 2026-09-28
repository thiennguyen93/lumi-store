import { blobUrl } from "./bridge";
import { PinGlyph } from "./icons";
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
  if (row.kind === "color" && HEX.test(row.title)) {
    return <span className="swatch" style={{ background: row.title }} />;
  }
  if (row.kind === "image" && row.thumb) {
    return (
      <span className="thumb">
        <img alt="" src={blobUrl(row.thumb)} />
      </span>
    );
  }
  return null;
}

export function Row({
  row,
  index,
  selected,
  shortcut,
  onPick,
  onPaste,
}: {
  row: Entry;
  index: number;
  selected: boolean;
  shortcut: string | undefined;
  onPick: (index: number) => void;
  onPaste: (plain: boolean) => void;
}) {
  return (
    <div
      id={`row-${index}`}
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
      {row.pin ? (
        <span className="meta" aria-label="Pinned">
          <PinGlyph />
        </span>
      ) : (
        <span className="meta">
          {row.appName ? `${row.appName} · ` : ""}
          {since(row.last)}
        </span>
      )}
    </div>
  );
}
