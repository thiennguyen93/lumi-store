import { useEffect, useMemo, useRef, useState } from "react";
import { blobUrl, call, fileUrl } from "./bridge";
import { AppMark } from "./AppMark";
import { CollapseGlyph, ExpandGlyph, FileGlyph, KindGlyph, PauseGlyph, PlayGlyph, VolumeGlyph } from "./icons";
import { fileFamily, isTextFile, type FileFamily } from "./fileType";
import { PdfViewer } from "./PdfViewer";
import { TextFile } from "./TextFile";
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

type Full = { id: string; text: string; html?: string | null; ocr?: string | null; fileSize?: number | null; fileToken?: string | null };

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
        const { text, html, ocr, fileSize, fileToken } = await call({ kind: "preview", id: row.id });
        if (!(text || html || ocr)) {
          if (live) setGaveUp(row.id);
          return;
        }
        const answer = { id: row.id, text, html, ocr, fileSize, fileToken };
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
          {row.kind === "file" ? <FileGlyph family={fileFamily(row.fileExt)} /> : <KindGlyph kind={row.kind} />}
          <span>
            {KIND_WORDS[row.kind]}
            {from ? " · " : ""}
            <AppMark key={row.app ?? ""} app={row.app} name={row.appName} withName />
          </span>
          {(pixels || weight) && <span className="dims">{[pixels, weight].filter(Boolean).join(" · ")}</span>}
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
        {row.kind === "file" && (MEDIA_FAMILIES.has(fileFamily(row.fileExt)) || isTextFile(row.fileExt)) && (
          <FileMedia
            key={row.id}
            family={fileFamily(row.fileExt)}
            ext={row.fileExt ?? ""}
            text={isTextFile(row.fileExt)}
            token={mine?.fileToken ?? null}
            name={row.title}
            onSize={(w, h) => setSize({ id: row.id, w, h })}
          />
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

/** A copied PDF, picture, text file, sound or film: its player or viewer
 *  once Lumi has given a grant for it, and until then — or when Lumi cannot serve it, an older Lumi
 *  or a file moved since — a tile that says what it is. Never plays by
 *  itself: `controls` and no `autoPlay`, and audio loads nothing until asked.
 *  Keyed by row, so choosing another row takes the player away and stops it. */
function FileMedia({
  family,
  ext,
  token,
  name,
  text,
  onSize,
}: {
  family: FileFamily;
  ext: string;
  /** A text or code file: its start, as plain text. */
  text: boolean;
  token: string | null;
  name: string;
  onSize: (w: number, h: number) => void;
}) {
  const [failed, setFailed] = useState(false);
  // Once per grant: a new address for the same file would reload the player.
  const address = useMemo(() => (token ? fileUrl(token) : null), [token]);
  const src = failed ? null : address;
  if (src && text) {
    return <TextFile src={src} json={ext === "json"} onFail={() => setFailed(true)} />;
  }
  if (src && family === "image") {
    // The file itself, drawn by the webview: a type it cannot draw (HEIC
    // before macOS 14), or one too big for Lumi to send whole, is the tile.
    return (
      <div className="picture">
        <img
          alt={name}
          src={src}
          decoding="async"
          onLoad={(event) => {
            const { naturalWidth: w, naturalHeight: h } = event.currentTarget;
            if (w && h) onSize(w, h);
          }}
          onError={() => setFailed(true)}
        />
      </div>
    );
  }
  if (src && family === "video") {
    return <VideoPlayer src={src} onError={() => setFailed(true)} />;
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
    return <PdfViewer src={src} name={name} onFail={() => setFailed(true)} />;
  }
  return (
    <div className="file-tile" data-family={family}>
      <FileGlyph family={family} />
      <span>{ext.toUpperCase()}</span>
    </div>
  );
}

/** A film with a small bar of its own — play, seek, time, sound — in place of
 *  the webview's controls, which are drawn at the size of the video and take
 *  most of a pane this narrow. Starts muted and never by itself; the sound is
 *  the person's to turn on. */
function VideoPlayer({ src, onError }: { src: string; onError: () => void }) {
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

/** 0:07, 12:03, 1:02:03. */
function clock(seconds: number): string {
  const whole = Math.max(0, Math.floor(Number.isFinite(seconds) ? seconds : 0));
  const h = Math.floor(whole / 3600);
  const m = Math.floor((whole % 3600) / 60);
  const s = String(whole % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${s}` : `${m}:${s}`;
}

/** The families that get a tile of their own above the paths. */
const MEDIA_FAMILIES = new Set<FileFamily>(["pdf", "image", "audio", "video"]);

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
