import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { blobUrl, call, fileUrl, type Expansion, type FileItem, type Link } from "./bridge";
import { AppMark } from "./AppMark";
import { CollapseGlyph, CopyGlyph, ExpandGlyph, FileGlyph, FolderGlyph, KindGlyph, PauseGlyph, PlayGlyph, VolumeGlyph } from "./icons";
import { codeLanguage, fileFamily, isTextFile, type FileFamily } from "./fileType";
import { useItemDrag } from "./itemDrag";
import { LinkList } from "./LinkList";
import { SnippetPane } from "./SnippetPane";
import { PdfViewer } from "./PdfViewer";
import { TextFile } from "./TextFile";
import { linked } from "./LinkedText";
import { RichText } from "./richText";
import { isColor, KIND_WORDS, paint } from "./Row";
import { BLACK, contrast, over, parseColor, type Rgba, toHex, toHsl, toRgb, WHITE } from "./color";
import { ago, type Used } from "./search";
import { usePreviewMarks } from "./previewMarks";
import type { SplitGrip } from "./PreviewSplit";
import type { Entry } from "./types";

/** How long the selection must rest on a row before its full text is
 *  asked for. Arrow keys held down walk many rows a second, and each ask
 *  is a fresh instantiation of the extension. */
const SETTLE_MS = 90;

/** How long a rich row's body stays blank for its formatting before the
 *  plain title stands in. Most answers land well inside it, so the pane
 *  goes straight to the formatted text instead of flashing plain first. */
const HOLD_MS = 400;

type Full = {
  id: string;
  text: string;
  html?: string | null;
  ocr?: string | null;
  fileSize?: number | null;
  fileToken?: string | null;
  files?: FileItem[] | null;
  fileCount?: number;
  links?: Link[] | null;
  linkCount?: number;
  snippets?: Expansion[] | null;
};

/** Previews already asked for, by row — and by whether the row has read
 *  text yet, since OCR lands after the copy. The page is thrown away each
 *  time the panel closes, so this lives exactly as long as one browse. */
const seen = new Map<string, Full>();
const SEEN_MAX = 64;
const seenKey = (row: Entry) => `${row.id}:${row.ocr ? 1 : 0}`;

/** Whether a row can have the whole panel: every one can — text read at
 *  full width, a picture, a film, a PDF, a file's tile or a list of files,
 *  a colour as a big swatch. Kept as the one place that answers, for the
 *  button, ⌘Y and the menu, should a kind ever be left out again. */
export function canZoom(row: Entry | undefined): boolean {
  return !!row;
}

export function Preview({
  row,
  onOpen,
  onCopyColor,
  onCopySnippet,
  query = "",
  used = "exact",
  zoomed = false,
  onZoom,
  split,
}: {
  row: Entry | undefined;
  /** Open a link row's address, or — `url` — one of a row's listed links,
   *  or, with `snippet`, one in what the row expands to. */
  onOpen?: (id: string, url?: string, snippet?: boolean) => void;
  /** Copy one of a colour row's formats. */
  onCopyColor?: (text: string) => void;
  /** Copy what a row expands to as a snippet trigger. */
  onCopySnippet?: (id: string, text: string) => void;
  /** What the list is searched by, marked in the card and scrolled to. */
  query?: string;
  used?: Used;
  /** The card has the whole panel, the list put aside (`canZoom`). */
  zoomed?: boolean;
  onZoom?: () => void;
  /** Moves the line between a picture and its read text, or a copy and
   *  what it expands to (`PreviewSplit`). */
  split?: SplitGrip;
}) {
  const card = useRef<HTMLDivElement>(null);
  usePreviewMarks(card, query, used, row?.id);
  // The full text, keyed by the row it belongs to, so a late answer for a
  // row the selection has already left is never drawn under another.
  const [full, setFull] = useState<Full | null>(null);
  // The rich row that has waited long enough for its formatting: past
  // `HOLD_MS`, or with the ask failed, its plain title is drawn after all.
  const [gaveUp, setGaveUp] = useState<string | null>(null);
  // The row whose read text is what the zoomed panel shows, picture hidden:
  // the read's own ⤢ zooms the panel onto the text, as the head's zooms it
  // onto the picture. Leaving the row or the zoom puts the picture back.
  const [expanded, setExpanded] = useState<string | null>(null);
  useEffect(() => setExpanded(null), [row?.id]);
  useEffect(() => {
    if (!zoomed) setExpanded(null);
  }, [zoomed]);
  // Bumped when Lumi tells of anything a preview is made from changing:
  // another profile switched to, renamed or removed (`lumi:profiles`), the
  // settings — Match snippets, Look in, reading images (`lumi:settings`) —
  // or the snippets themselves (`lumi:snippets`). Every preview kept from
  // before is asked again, the one on screen at once; a pinned panel stays
  // up for hours, and must not show what was true when it opened.
  const [stale, setStale] = useState(0);
  useEffect(() => {
    const changed = () => {
      seen.clear();
      setStale((n) => n + 1);
    };
    const news = ["lumi:profiles", "lumi:settings", "lumi:snippets"];
    for (const name of news) window.addEventListener(name, changed);
    return () => {
      for (const name of news) window.removeEventListener(name, changed);
    };
  }, []);
  // The picture's size in pixels, read off the image once it has loaded;
  // by row, like the text.
  const [size, setSize] = useState<{ id: string; w: number; h: number } | null>(null);

  useEffect(() => {
    // An image has no text to ask for, unless Lumi read some in it.
    if (!row || (row.kind === "image" && !row.ocr)) return;
    const key = seenKey(row);
    const known = seen.get(key);
    if (known) {
      // Back on a row already shown: drawn at once — with no call, unless
      // what it expands to is made afresh each time (a date, a script),
      // which is asked again behind what is drawn.
      setFull(known);
      if (!known.snippets?.some((one) => one.dynamic)) return;
    }
    let live = true;
    const hold = setTimeout(() => live && setGaveUp(row.id), HOLD_MS);
    const timer = setTimeout(async () => {
      try {
        const { text, html, ocr, fileSize, fileToken, files, fileCount, links, linkCount, snippets } = await call({
          kind: "preview",
          id: row.id,
        });
        if (!(text || html || ocr)) {
          if (live) setGaveUp(row.id);
          return;
        }
        const answer = { id: row.id, text, html, ocr, fileSize, fileToken, files, fileCount, links, linkCount, snippets };
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
  }, [row, stale]);

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
  // The row says up front whether its image has text, so the section is
  // drawn — and its room taken — with the picture, not a moment later when
  // the text arrives, which would squeeze the picture after it was drawn.
  const reads = row.kind === "image" && !!row.ocr;
  // The read has the zoomed panel; zoomed onto the picture, it steps aside.
  const wide = reads && zoomed && expanded === row.id;
  const pixels = size?.id === row.id ? `${size.w} × ${size.h} px` : null;
  const weight = row.kind === "file" && mine?.fileSize != null ? bytes(mine.fileSize) : null;

  // A text or rich copy's links, as listed: drawn under it. In a rich
  // copy's body they are clickable too, where its formatting links them or
  // its text writes them out. A plain-text copy's body stays plain text —
  // it is there to be read and selected, not followed.
  const links = (row.kind === "text" || row.kind === "rich") && mine?.links ? mine.links : [];
  const bodyLinks = row.kind === "rich" ? links : [];
  const openLink = onOpen ? (url: string) => onOpen(row.id, url) : undefined;
  // What a text or rich copy expands to, when it is a snippet trigger.
  const expansions = (row.kind === "text" || row.kind === "rich") && mine?.snippets ? mine.snippets : [];

  const from = row.appName || row.app;
  const times = row.count > 1 ? `${row.count}×` : "once";

  return (
    <aside className="preview" aria-live="polite">
      <div className="card" ref={card}>
        <header className="card-head">
          {row.kind === "file" ? (
            <FileGlyph family={fileFamily(row.fileExt)} many={(row.fileCount ?? 0) > 1} />
          ) : (
            <KindGlyph kind={row.kind} />
          )}
          <span>
            {KIND_WORDS[row.kind]}
            {from ? " · " : ""}
            <AppMark key={row.app ?? ""} app={row.app} name={row.appName} withName />
          </span>
          {(pixels || weight) && <span className="dims">{[pixels, weight].filter(Boolean).join(" · ")}</span>}
          {/* Zoomed onto the read, the read's own ⤡ is the way back. */}
          {onZoom && canZoom(row) && !wide && (
            <button
              type="button"
              className="bare zoom"
              aria-pressed={zoomed}
              title={zoomed ? "Back to the list (⌘Y)" : "Give it the whole panel (⌘Y)"}
              aria-label={zoomed ? "Back to the list" : "Expand preview"}
              // The caret stays in the search field, as it does for a row.
              onMouseDown={(event) => event.preventDefault()}
              onClick={onZoom}
            >
              {zoomed ? <CollapseGlyph /> : <ExpandGlyph />}
            </button>
          )}
        </header>
        {row.kind === "image" && row.thumb && !wide && (
          <Pulled id={row.id} className="picture">
            <img
              alt="Copied image"
              src={blobUrl(row.thumb)}
              draggable={false}
              onLoad={(event) => {
                const { naturalWidth: w, naturalHeight: h } = event.currentTarget;
                if (w && h) setSize({ id: row.id, w, h });
              }}
            />
          </Pulled>
        )}
        {reads && (!zoomed || wide) && (
          <section className="ocr-read">
            {/* Only under the picture: zoomed onto the read, nothing is above. */}
            {split && !wide && row.thumb && <Grip {...split} />}
            <header className="ocr-head">
              <span>Text in image</span>
              <button
                type="button"
                className="bare"
                aria-pressed={wide}
                title={wide ? "Back to the list (⎋)" : "Give the text the whole panel"}
                aria-label={wide ? "Back to the list" : "Expand text"}
                // The caret stays in the search field, as it does for a row.
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  if (wide) {
                    onZoom?.();
                    return;
                  }
                  setExpanded(row.id);
                  if (!zoomed) onZoom?.();
                }}
              >
                {wide ? <CollapseGlyph /> : <ExpandGlyph />}
              </button>
            </header>
            <div className="body ocr">{ocr ?? ""}</div>
          </section>
        )}
        {row.kind === "file" &&
          // One file only: several sharing an extension are the list below.
          (row.fileCount ?? 0) <= 1 &&
          // Every one gets a picture of some kind — a viewer, or at least the
          // tile — so a file is never mistaken for a copied path.
          !mine?.files?.length && (
          <FileMedia
            key={row.id}
            id={row.id}
            family={fileFamily(row.fileExt)}
            ext={row.fileExt ?? ""}
            text={isTextFile(row.fileExt)}
            token={mine?.fileToken ?? null}
            name={row.title}
            onSize={(w, h) => setSize({ id: row.id, w, h })}
            whole={zoomed}
          />
        )}
        {/* A text or rich copy, what it expands to and its links share the
            card's room as one block (`Stack`); any other kind is drawn as
            it always was. */}
        <Stack on={row.kind === "text" || row.kind === "rich"} even={expansions.length > 0}>
          {row.kind === "color" && isColor(row.title) ? (
            <ColorCard color={row.title} onCopy={onCopyColor} />
          ) : mine?.files?.length ? (
            <FileList id={row.id} files={mine.files} count={mine.fileCount || mine.files.length} />
          ) : row.kind === "file" && (row.fileCount ?? 0) <= 1 ? (
            <FilePath path={text.split("\n")[0]!} />
          ) : waiting ? (
            <div className="body rich" />
          ) : html ? (
            <RichText
              key={row.id}
              html={html}
              links={bodyLinks}
              onOpen={openLink}
              fallback={<div className="body rich">{linked(text, bodyLinks, openLink)}</div>}
            />
          ) : (
            row.kind === "link" && onOpen ? (
              <LinkBody text={text} onOpen={() => onOpen(row.id)} />
            ) : (
              row.kind !== "image" && (
                <div className={row.kind === "rich" ? "body rich" : "body"}>{linked(text, bodyLinks, openLink)}</div>
              )
            )
          )}
          {/* A trigger copied: what it expands to, under the copy itself. */}
          {expansions.length > 0 && (
            <SnippetPane
              key={`snippets:${row.id}`}
              grip={split && <Grip {...split} />}
              expansions={expansions}
              onCopy={onCopySnippet ? (text) => onCopySnippet(row.id, text) : undefined}
              onOpen={onOpen ? (url) => onOpen(row.id, url, true) : undefined}
            />
          )}
          {/* The text or the formatting stays as it is; its addresses are
              listed under it, each one a click away from the browser. */}
          {links.length > 0 && openLink && (
            <LinkList
              // Its own key: `row.id` is the rich text's, a sibling here, and two
              // siblings sharing one leave the old one's nodes behind.
              key={`links:${row.id}`}
              links={links}
              count={mine?.linkCount || links.length}
              onOpen={openLink}
            />
          )}
        </Stack>
        <footer className="card-foot">
          Copied {ago(row.last)} · {times}
        </footer>
      </div>
    </aside>
  );
}

/**
 * A copy's text, what it expands to and its links, as one block sharing the
 * room the card has left (panel.css `.texts`). With no expansion, each gets
 * all of its content while there is room, and once there is not, the room
 * is shared equally and each scrolls in its share. With one (`even`), the
 * parts split the room equally whatever their length, so the copy and what
 * it expands to sit either side of a rule in the middle.
 */
/** The line between the card's two parts, caught a few pixels either side
 *  of it and dragged up or down (`PreviewSplit`); it sits in the part under
 *  the line. */
function Grip(split: SplitGrip) {
  return (
    <div
      className="split-grip"
      role="separator"
      aria-orientation="horizontal"
      aria-label="Resize the two parts"
      title="Drag to resize · double-click to reset"
      {...split}
    />
  );
}

function Stack({ on, even, children }: { on: boolean; even: boolean; children: ReactNode }) {
  return on ? <div className={even ? "texts even" : "texts"}>{children}</div> : <>{children}</>;
}

/** The panel's dark surface, for what a translucent colour looks like there. */
const DARK: Rgba = { r: 30, g: 30, b: 30, a: 1 };

/** A copied colour: the swatch with the code as copied in its corner, the
 *  colour in the forms it is copied between, which of white or black text
 *  reads on it, and — when it lets something through — what it comes to
 *  over a light and a dark surface. A line copies its text. */
function ColorCard({ color, onCopy }: { color: string; onCopy?: (text: string) => void }) {
  const c = parseColor(color);
  if (!c) return <div className="chip painted" style={paint(color)} />;
  // Contrast is taken over what shows through: the board is light.
  const seen = over(c, WHITE);
  const onWhite = contrast(WHITE, seen);
  const onBlack = contrast(BLACK, seen);
  const copy = (text: string) => onCopy?.(text);
  return (
    <>
      <div className="chip painted" style={paint(color)}>
        <span className="chip-code" style={{ color: onWhite >= onBlack ? "#fff" : "#000" }}>
          {color}
        </span>
      </div>
      <section className="color-info">
        <h3>Formats</h3>
        {[
          ["HEX", toHex(c)],
          ["RGB", toRgb(c)],
          ["HSL", toHsl(c)],
        ].map(([label, text]) => (
          <button key={label} className="format" title="Copy" onClick={() => copy(text!)}>
            <span className="format-label">{label}</span>
            <span className="format-text">{text}</span>
            <CopyGlyph />
          </button>
        ))}
        <h3>Text on it</h3>
        <div className="text-on">
          {(
            [
              ["White", WHITE, onWhite],
              ["Black", BLACK, onBlack],
            ] as const
          ).map(([name, ink, ratio]) => (
            <div key={name} className={ratio >= Math.max(onWhite, onBlack) ? "best" : undefined} title={`${name} text`}>
              <span className="sample" style={{ background: toHex(seen), color: toHex(ink) }}>
                Aa
              </span>
              <span className="ratio">{ratio.toFixed(1)}:1</span>
              <span className={ratio >= 4.5 ? "grade pass" : "grade fail"}>{ratio >= 4.5 ? "AA" : "✕ AA"}</span>
            </div>
          ))}
        </div>
        {c.a < 1 && (
          <>
            <h3>Over light and dark · {Math.round(c.a * 100)}%</h3>
            <div className="over">
              {(
                [
                  ["Light", WHITE],
                  ["Dark", DARK],
                ] as const
              ).map(([name, under]) => {
                const hex = toHex(over(c, under));
                return (
                  <button key={name} className="format" title="Copy" onClick={() => copy(hex)}>
                    <span className="over-swatch" style={{ background: toHex(under) }}>
                      <span style={{ background: color }} />
                    </span>
                    <span className="format-label">{name}</span>
                    <span className="format-text">{hex}</span>
                    <CopyGlyph />
                  </button>
                );
              })}
            </div>
          </>
        )}
      </section>
    </>
  );
}

/** A copied link: the address as plain text, which reads as a link under
 *  the pointer and opens in the browser on a click. The page never hands
 *  the address over itself — `onOpen` sends the row's id, and the extension
 *  reads the address out of the stored item, so a click opens only what was
 *  copied. A drag across the text still selects it: a click that ends a
 *  selection opens nothing. */
function LinkBody({ text, onOpen }: { text: string; onOpen: () => void }) {
  return (
    <div
      className="body link"
      role="link"
      tabIndex={-1}
      title="Open in browser"
      onClick={() => {
        if (window.getSelection()?.isCollapsed === false) return;
        onOpen();
      }}
    >
      {text}
    </div>
  );
}

/** Something in the preview that stands for the whole item — a picture, or
 *  the tile of a file or folder nothing can draw — pulled out of the panel
 *  the way its row is: through Lumi (`clipboard.drag`), never WebKit's own
 *  drag. That one is a session Lumi never hears of from the page, and it
 *  carries no file: an image as a PNG where one is wanted, a copied file or
 *  folder as itself, only come from Lumi's. Hence `draggable={false}` on an
 *  `<img>` inside, and the press kept off the search field as a row keeps it. */
function Pulled({
  id,
  className,
  family,
  children,
}: {
  id: string;
  className: string;
  family?: FileFamily;
  children: ReactNode;
}) {
  const drag = useItemDrag(() => {
    call({ kind: "drag", id }).catch(() => {});
  });
  return (
    <div className={className} data-family={family} onMouseDown={(event) => event.preventDefault()} {...drag}>
      {children}
    </div>
  );
}

/** A copied file: for a PDF, picture, text file, sound or film its player
 *  or viewer once Lumi has given a grant for it; for anything else, and until
 *  then — or when Lumi cannot serve it, an older Lumi or a file moved since —
 *  a tile that says what it is. Never plays by
 *  itself: `controls` and no `autoPlay`, and audio loads nothing until asked.
 *  Keyed by row, so choosing another row takes the player away and stops it. */
function FileMedia({
  id,
  family,
  ext,
  token,
  name,
  text,
  onSize,
  whole = false,
}: {
  /** The row: what a drag of the picture takes out. */
  id: string;
  family: FileFamily;
  ext: string;
  /** A text or code file: its start, as plain text. */
  text: boolean;
  token: string | null;
  name: string;
  onSize: (w: number, h: number) => void;
  /** The panel is zoomed: a PDF scrolls through all its pages, a film plays. */
  whole?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  // Once per grant: a new address for the same file would reload the player.
  const address = useMemo(() => (token ? fileUrl(token) : null), [token]);
  const src = failed ? null : address;
  if (src && text) {
    return (
      <TextFile
        src={src}
        json={ext === "json"}
        markdown={ext === "md" || ext === "markdown"}
        language={codeLanguage(ext)}
        onFail={() => setFailed(true)}
      />
    );
  }
  if (src && family === "image") {
    // The file itself, drawn by the webview: a type it cannot draw (HEIC
    // before macOS 14), or one too big for Lumi to send whole, is the tile.
    return (
      <Pulled id={id} className="picture">
        <img
          alt={name}
          src={src}
          decoding="async"
          draggable={false}
          onLoad={(event) => {
            const { naturalWidth: w, naturalHeight: h } = event.currentTarget;
            if (w && h) onSize(w, h);
          }}
          onError={() => setFailed(true)}
        />
      </Pulled>
    );
  }
  if (src && family === "video") {
    return <VideoPlayer src={src} play={whole} onError={() => setFailed(true)} />;
  }
  if (src && family === "audio") {
    return (
      <div className="player audio">
        <FileGlyph family={family} />
        <audio src={src} controls preload="none" onError={() => setFailed(true)} />
      </div>
    );
  }
  if (src && family === "pdf") {
    return <PdfViewer src={src} name={name} flow={whole} onFail={() => setFailed(true)} />;
  }
  return (
    <Pulled id={id} className="file-tile" family={family}>
      <FileGlyph family={family} />
      <span>{family === "folder" ? "FOLDER" : ext ? ext.toUpperCase() : "FILE"}</span>
    </Pulled>
  );
}

/** A film with a small bar of its own — play, seek, time, sound — in place of
 *  the webview's controls, which are drawn at the size of the video and take
 *  most of a pane this narrow. Always starts muted; the sound is the
 *  person's to turn on. Beside the list it waits to be played; in the zoomed
 *  panel (`play`) it plays as soon as it is reached, the way Quick Look does,
 *  still muted. */
function VideoPlayer({ src, play = false, onError }: { src: string; play?: boolean; onError: () => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(true);
  const [time, setTime] = useState(0);
  const [length, setLength] = useState(0);
  // The caret stays in the search field, as it does for a row.
  const keepFocus = (event: { preventDefault: () => void }) => event.preventDefault();
  const toggle = () => {
    const el = video.current;
    if (el) void (el.paused ? el.play().catch(onError) : el.pause());
  };
  // Zoomed onto it — arrived at with the arrows, or zoomed on it — it plays.
  // Asked once now and once more when it can play: a play asked for while
  // the film is still loading is cut off by the load (AbortError, measured
  // on the first visit to a row). A refusal is not a broken film — the
  // load's own error says that — so it is left paused with its play button.
  useEffect(() => {
    const el = video.current;
    if (!play || !el) return;
    const start = () => {
      if (el.paused) void el.play().catch(() => {});
    };
    start();
    el.addEventListener("canplay", start, { once: true });
    return () => el.removeEventListener("canplay", start);
  }, [play, src]);
  return (
    <div className="player video">
      <video
        ref={video}
        src={src}
        muted
        playsInline
        preload="metadata"
        onClick={toggle}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
        onTimeUpdate={(event) => setTime(event.currentTarget.currentTime)}
        onLoadedMetadata={(event) => setLength(event.currentTarget.duration || 0)}
        onVolumeChange={(event) => setMuted(event.currentTarget.muted)}
        onError={onError}
      />
      <div className="vbar">
        <button type="button" className="vbtn" aria-label={playing ? "Pause" : "Play"} onMouseDown={keepFocus} onClick={toggle}>
          {playing ? <PauseGlyph /> : <PlayGlyph />}
        </button>
        <input
          type="range"
          className="seek"
          aria-label="Seek"
          min={0}
          max={length || 0}
          step="any"
          value={Math.min(time, length || 0)}
          disabled={!length}
          onChange={(event) => {
            if (video.current) video.current.currentTime = Number(event.target.value);
          }}
        />
        <span className="clock">{clock(time)} / {clock(length)}</span>
        <button
          type="button"
          className="vbtn"
          aria-label={muted ? "Unmute" : "Mute"}
          onMouseDown={keepFocus}
          onClick={() => video.current && (video.current.muted = !video.current.muted)}
        >
          <VolumeGlyph muted={muted} />
        </button>
      </div>
    </div>
  );
}

/** A copy of several files, one to a line: its icon, its name, the folder
 *  it is in (home as ~) and its size — in place of a column of paths. */
function FileList({ id, files, count }: { id: string; files: FileItem[]; count: number }) {
  const folders = files.filter((file) => file.folder).length;
  const plain = files.length - folders;
  const parts = [
    plain && `${plain} ${plain === 1 ? "file" : "files"}`,
    folders && `${folders} ${folders === 1 ? "folder" : "folders"}`,
  ].filter(Boolean);
  return (
    <section className="file-list" aria-label={`${count} files`}>
      <header className="file-list-head">
        {parts.join(" · ")}
        {count > files.length && ` · first ${files.length} of ${count}`}
      </header>
      <ul>
        {files.map((file, i) => (
          <FileLine key={i} id={id} at={i} file={file} />
        ))}
      </ul>
    </section>
  );
}

/** One line of the list; pulled out of the panel, that one file goes where
 *  it is dropped. */
function FileLine({ id, at, file }: { id: string; at: number; file: FileItem }) {
  const drag = useItemDrag(() => {
    call({ kind: "drag", id, file: at }).catch(() => {});
  });
  return (
    <li
      title={file.dir ? `${file.dir}/${file.name}` : file.name}
      // The caret stays in the search field, as it does for a row.
      onMouseDown={(event) => event.preventDefault()}
      {...drag}
    >
      <FileGlyph family={file.folder ? "folder" : fileFamily(extension(file.name))} />
      <span className="file-list-text">
        <FileName name={file.name} folder={!!file.folder} />
        {file.dir && <span className="file-list-dir">{home(file.dir)}</span>}
      </span>
      {file.size != null && <span className="file-list-size">{bytes(file.size)}</span>}
    </li>
  );
}

/** Where a lone copied file is: its name, then the folder it is in — not
 *  the bare path, which reads like copied text. Both wrap rather than cut,
 *  and both can be selected. */
function FilePath({ path }: { path: string }) {
  const trimmed = path.length > 1 ? path.replace(/\/+$/, "") : path;
  const cut = trimmed.lastIndexOf("/");
  const name = trimmed.slice(cut + 1) || trimmed;
  const dir = cut > 0 ? trimmed.slice(0, cut) : cut === 0 ? "/" : "";
  return (
    <div className="file-where" title={path}>
      <div className="file-where-name">{name}</div>
      {dir && (
        <div className="file-where-dir">
          <FolderGlyph />
          <span>{home(dir)}</span>
        </div>
      )}
    </div>
  );
}

/** A name cut in its middle when too long, its extension kept: "brag-vert….mp4". */
function FileName({ name, folder }: { name: string; folder: boolean }) {
  const dot = folder ? -1 : name.lastIndexOf(".");
  if (dot <= 0) return <span className="file-list-name"><span className="file-list-stem">{name}</span></span>;
  return (
    <span className="file-list-name">
      <span className="file-list-stem">{name.slice(0, dot)}</span>
      <span className="file-list-ext">{name.slice(dot)}</span>
    </span>
  );
}

/** "mp4" of "brag.MP4"; nothing for ".zshrc" or "README". */
function extension(name: string): string | undefined {
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : undefined;
}

/** A folder under someone's home written the way Finder's Go menu does: ~/Desktop. */
function home(dir: string): string {
  return dir.replace(/^\/Users\/[^/]+(?=\/|$)/, "~");
}

/** 0:07, 12:03, 1:02:03. */
function clock(seconds: number): string {
  const whole = Math.max(0, Math.floor(Number.isFinite(seconds) ? seconds : 0));
  const h = Math.floor(whole / 3600);
  const m = Math.floor((whole % 3600) / 60);
  const s = String(whole % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${s}` : `${m}:${s}`;
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
