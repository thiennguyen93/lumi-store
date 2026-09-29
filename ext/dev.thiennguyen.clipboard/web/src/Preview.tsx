import { useEffect, useState } from "react";
import { blobUrl, call } from "./bridge";
import { CollapseGlyph, ExpandGlyph, KindGlyph } from "./icons";
import { RichText } from "./richText";
import { HEX, KIND_WORDS } from "./Row";
import { ago } from "./search";
import type { Entry } from "./types";

/** How long the selection must rest on a row before its full text is
 *  asked for. Arrow keys held down walk many rows a second, and each ask
 *  is a fresh instantiation of the extension. */
const SETTLE_MS = 90;

/** How long a rich row's body stays blank for its formatting before the
 *  plain title stands in. Most answers land well inside it, so the pane
 *  goes straight to the formatted text instead of flashing plain first. */
const HOLD_MS = 400;

type Full = { id: string; text: string; html?: string | null; ocr?: string | null; fileSize?: number | null };

/** Previews already asked for, by row — and by whether the row has read
 *  text yet, since OCR lands after the copy. The page is thrown away each
 *  time the panel closes, so this lives exactly as long as one browse. */
const seen = new Map<string, Full>();
const SEEN_MAX = 64;
const seenKey = (row: Entry) => `${row.id}:${row.ocr ? 1 : 0}`;

export function Preview({ row }: { row: Entry | undefined }) {
  // The full text, keyed by the row it belongs to, so a late answer for a
  // row the selection has already left is never drawn under another.
  const [full, setFull] = useState<Full | null>(null);
  // The rich row that has waited long enough for its formatting: past
  // `HOLD_MS`, or with the ask failed, its plain title is drawn after all.
  const [gaveUp, setGaveUp] = useState<string | null>(null);
  // The row whose read text is drawn over the whole card, picture hidden.
  // Leaving the row puts its picture back, coming back included.
  const [expanded, setExpanded] = useState<string | null>(null);
  useEffect(() => setExpanded(null), [row?.id]);
  // The picture's size in pixels, read off the image once it has loaded;
  // by row, like the text.
  const [size, setSize] = useState<{ id: string; w: number; h: number } | null>(null);

  useEffect(() => {
    // An image has no text to ask for, unless Lumi read some in it.
    if (!row || (row.kind === "image" && !row.ocr)) return;
    const key = seenKey(row);
    const known = seen.get(key);
    if (known) {
      // Back on a row already shown: drawn at once, no call.
      setFull(known);
      return;
    }
    let live = true;
    const hold = setTimeout(() => live && setGaveUp(row.id), HOLD_MS);
    const timer = setTimeout(async () => {
      try {
        const { text, html, ocr, fileSize } = await call({ kind: "preview", id: row.id });
        if (!(text || html || ocr)) {
          if (live) setGaveUp(row.id);
          return;
        }
        const answer = { id: row.id, text, html, ocr, fileSize };
        seen.delete(key);
        seen.set(key, answer);
        if (seen.size > SEEN_MAX) seen.delete(seen.keys().next().value!);
        if (live) setFull(answer);
      } catch {
        // The title stays in the pane; a preview is not worth an error.
        if (live) setGaveUp(row.id);
      }
    }, SETTLE_MS);
    return () => {
      live = false;
      clearTimeout(timer);
      clearTimeout(hold);
    };
  }, [row]);

  if (!row) return <aside className="preview empty-card" />;

  // The title until the full text arrives, so the pane is never empty
  // while the extension is asked.
  const mine = full?.id === row.id ? full : (seen.get(seenKey(row)) ?? null);
  // Still waiting on a rich row's formatting: the body keeps its place,
  // blank, rather than drawing the title plain for a moment.
  const waiting = row.kind === "rich" && !mine && gaveUp !== row.id;
  const text = mine?.text || row.title;
  const html = row.kind === "rich" ? mine?.html : null;
  const ocr = row.kind === "image" ? mine?.ocr : null;
  const wide = !!ocr && expanded === row.id;
  const pixels = size?.id === row.id ? `${size.w} × ${size.h} px` : null;

  const weight = row.kind === "file" && mine?.fileSize != null ? bytes(mine.fileSize) : null;
  const from = row.appName || row.app;
  const times = row.count > 1 ? `${row.count}×` : "once";

  return (
    <aside className="preview" aria-live="polite">
      <div className="card">
        <header className="card-head">
          <KindGlyph kind={row.kind} />
          <span>
            {KIND_WORDS[row.kind]}
            {from ? ` · ${from}` : ""}
          </span>
          {(pixels || weight) && <span className="dims">{pixels ?? weight}</span>}
        </header>
        {row.kind === "image" && row.thumb && !wide && (
          <div className="picture">
            <img
              alt="Copied image"
              src={blobUrl(row.thumb)}
              onLoad={(event) => {
                const { naturalWidth: w, naturalHeight: h } = event.currentTarget;
                if (w && h) setSize({ id: row.id, w, h });
              }}
            />
          </div>
        )}
        {ocr && (
          <section className="ocr-read">
            <header className="ocr-head">
              <span>Text in image</span>
              <button
                type="button"
                className="cap quiet"
                aria-pressed={wide}
                title={wide ? "Show the image" : "Give the text the whole card"}
                aria-label={wide ? "Collapse text" : "Expand text"}
                // The caret stays in the search field, as it does for a row.
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => setExpanded(wide ? null : row.id)}
              >
                {wide ? <CollapseGlyph /> : <ExpandGlyph />}
              </button>
            </header>
            <div className="body ocr">{ocr}</div>
          </section>
        )}
        {row.kind === "color" && HEX.test(row.title) && (
          <div className="chip" style={{ background: row.title }} />
        )}
        {waiting ? (
          <div className="body rich" />
        ) : html ? (
          <RichText key={row.id} html={html} fallback={<div className="body rich">{text}</div>} />
        ) : (
          row.kind !== "image" && <div className={row.kind === "rich" ? "body rich" : "body"}>{text}</div>
        )}
        <footer className="card-foot">
          Copied {ago(row.last)} · {times}
        </footer>
      </div>
    </aside>
  );
}

/** A size the way Finder writes one: decimal units, whole kilobytes, one
 *  decimal from a megabyte up — "812 bytes", "234 KB", "1.2 MB". */
function bytes(n: number): string {
  if (n < 1000) return `${n} ${n === 1 ? "byte" : "bytes"}`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = n / 1000;
  let unit = 0;
  while (value >= 1000 && unit < units.length - 1) {
    value /= 1000;
    unit++;
  }
  const digits = unit === 0 ? 0 : 1;
  return `${value.toLocaleString(undefined, { maximumFractionDigits: digits })} ${units[unit]}`;
}
