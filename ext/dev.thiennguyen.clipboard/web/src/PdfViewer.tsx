import { useEffect, useRef, useState } from "react";
import type { PDFDocumentLoadingTask, PDFDocumentProxy, RenderTask } from "pdfjs-dist/legacy/build/pdf.mjs";
import { ChevronLeftGlyph, ChevronRightGlyph, MinusGlyph, PlusGlyph } from "./icons";

/** Zoom steps over the page fitted to the pane's width. */
const ZOOMS = [1, 1.5, 2, 3];

/** The most pixels one page may take on its canvas; WebKit refuses (draws
 *  nothing) past about 16.7 M, and a page at 3× on a retina screen can ask
 *  for more. Past it the page is drawn less sharp, not bigger. */
const MAX_PIXELS = 16_000_000;

/** pdf.js and its worker, loaded the first time a PDF is shown and never
 *  before: the panel opens on a shortcut and does not pay for them. One
 *  worker serves every document for as long as the page lives — the page
 *  is thrown away when the panel closes.
 *
 *  The worker is Vite's `?worker`, not `?url`: a `?url` file is copied as
 *  is, while `?worker` is bundled and lowered to the build's target like
 *  the page — pdf.js' legacy build still has syntax Safari 16.0 lacks. It
 *  lands as a same-origin file, which is all `default-src 'self'` allows a
 *  worker to be (a blob: or data: worker is refused). */
type Pdfjs = typeof import("pdfjs-dist/legacy/build/pdf.mjs");
let loading: Promise<{ lib: Pdfjs; fonts: typeof import("./pdfFonts").ShippedFonts }> | null = null;
function pdfjs() {
  loading ??= Promise.all([
    import("pdfjs-dist/legacy/build/pdf.mjs"),
    import("pdfjs-dist/legacy/build/pdf.worker.mjs?worker"),
    import("./pdfFonts"),
  ]).then(([lib, { default: PdfWorker }, { ShippedFonts }]) => {
    lib.GlobalWorkerOptions.workerPort = new PdfWorker();
    return { lib, fonts: ShippedFonts };
  });
  // A failed load (a chunk the package lost) is tried again next time.
  loading.catch(() => (loading = null));
  return loading;
}

/** The last document's teardown. The worker is shared, and pdf.js refuses a
 *  new document on it while an old one is still being destroyed — which is
 *  what walking the rows quickly does — so a load waits for this first. */
let closing: Promise<void> = Promise.resolve();

/** A copied PDF, a page at a time, on a canvas: pdf.js draws it, with a bar
 *  of its own the size of the video's — the webview's PDF viewer puts a
 *  toolbar over the page that is too big for this pane and cannot be styled.
 *  Only the page on show is drawn, and the file is read by ranges, so a
 *  500-page PDF opens as fast as a one-page one. A file pdf.js cannot open
 *  — locked, broken, not a PDF — calls `onFail` and the tile stands in. */
export function PdfViewer({
  src,
  name,
  onFail,
  whole = false,
}: {
  src: string;
  name: string;
  onFail: () => void;
  /** The whole page in view — the zoomed panel, tall enough to read one —
   *  rather than the page fitted to the width and scrolled. */
  whole?: boolean;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null);
  const [page, setPage] = useState(1);
  const [zoom, setZoom] = useState(0);
  const [width, setWidth] = useState(0);
  const [height, setHeight] = useState(0);
  // The latest `onFail`, so a new closure from the parent does not reload the file.
  const fail = useRef(onFail);
  fail.current = onFail;

  // The document. Leaving the row destroys it, which also stops a load
  // still under way; `live` keeps StrictMode's double run from keeping two.
  useEffect(() => {
    let live = true;
    let task: PDFDocumentLoadingTask | null = null;
    void (async () => {
      try {
        const { lib, fonts } = await pdfjs();
        await closing;
        if (!live) return;
        task = lib.getDocument({
          url: src,
          // The CSP has no 'wasm-unsafe-eval' (pdf.js 6 no longer evals
          // at all): JPEG 2000 and a few colour spaces go undrawn.
          useWasm: false,
          // Glyphs drawn as paths: no FontFace, nothing for `font-src`.
          disableFontFace: true,
          useSystemFonts: false,
          // Fonts a PDF names but does not embed: shipped, fetched by the
          // page (`pdfFonts.ts`). The URL only has to be set; the factory
          // maps each name to its file.
          standardFontDataUrl: "standard_fonts/",
          BinaryDataFactory: fonts,
          // Lumi answers a custom scheme with whole bodies, so streaming
          // gains nothing; ranges it does answer, up to 8 MB each, and a
          // file over 32 MB only by range.
          disableStream: true,
          disableRange: false,
          rangeChunkSize: 512 * 1024,
          // Only the ranges a page on show needs, not the rest behind it.
          disableAutoFetch: true,
        });
        const opened = await task.promise;
        if (live) setDoc(opened);
      } catch {
        // A password it was not given, a broken file, a load cut short.
        if (live) fail.current();
      }
    })();
    return () => {
      live = false;
      setDoc(null);
      if (task) {
        const gone = task;
        closing = closing.then(() => gone.destroy()).catch(() => {});
      }
    };
  }, [src]);

  // The pane's width, which the page is fitted to.
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      setWidth(Math.floor(entry?.contentRect.width ?? 0));
      setHeight(Math.floor(entry?.contentRect.height ?? 0));
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // The page on show, drawn at the pane's width × zoom and the screen's
  // density. A draw still running when any of these change is cancelled
  // first: one canvas takes one draw at a time.
  useEffect(() => {
    const target = canvas.current;
    if (!doc || !target || !width) return;
    let live = true;
    let task: RenderTask | null = null;
    void (async () => {
      try {
        const sheet = await doc.getPage(page);
        if (!live) return;
        const natural = sheet.getViewport({ scale: 1 });
        const across = width / natural.width;
        const fit = whole && height ? Math.min(across, height / natural.height) : across;
        const fitted = fit * ZOOMS[zoom]!;
        const css = sheet.getViewport({ scale: fitted });
        const density = Math.min(window.devicePixelRatio || 1, Math.sqrt(MAX_PIXELS / (css.width * css.height)));
        const viewport = sheet.getViewport({ scale: fitted * density });
        target.width = Math.floor(viewport.width);
        target.height = Math.floor(viewport.height);
        target.style.width = `${Math.floor(css.width)}px`;
        target.style.height = `${Math.floor(css.height)}px`;
        task = sheet.render({ canvas: target, viewport });
        await task.promise;
        sheet.cleanup();
      } catch {
        // Cancelled by the next draw, or a page pdf.js could not draw: the
        // bar still works, and another page may.
      }
    })();
    return () => {
      live = false;
      task?.cancel();
    };
  }, [doc, page, zoom, width, height, whole]);

  const pages = doc?.numPages ?? 0;
  const go = (by: number) => {
    setPage((at) => Math.min(Math.max(at + by, 1), pages));
    scroller.current?.scrollTo(0, 0);
  };
  const zoomBy = (by: number) => setZoom((at) => Math.min(Math.max(at + by, 0), ZOOMS.length - 1));
  // The caret stays in the search field, as it does for a row.
  const keepFocus = (event: { preventDefault: () => void }) => event.preventDefault();

  return (
    <div className="player pdf">
      <div className="pdf-sheet" ref={scroller}>
        <canvas ref={canvas} role="img" aria-label={doc ? `${name}, page ${page} of ${pages}` : name} hidden={!doc} />
      </div>
      <div className="pdf-bar">
        <button type="button" className="vbtn" aria-label="Previous page" disabled={page <= 1} onMouseDown={keepFocus} onClick={() => go(-1)}>
          <ChevronLeftGlyph />
        </button>
        <span className="clock">{pages ? `${page} / ${pages}` : "…"}</span>
        <button type="button" className="vbtn" aria-label="Next page" disabled={page >= pages} onMouseDown={keepFocus} onClick={() => go(1)}>
          <ChevronRightGlyph />
        </button>
        <span className="pdf-gap" />
        <button type="button" className="vbtn" aria-label="Zoom out" disabled={!doc || zoom <= 0} onMouseDown={keepFocus} onClick={() => zoomBy(-1)}>
          <MinusGlyph />
        </button>
        <span className="clock">{Math.round(ZOOMS[zoom]! * 100)}%</span>
        <button type="button" className="vbtn" aria-label="Zoom in" disabled={!doc || zoom >= ZOOMS.length - 1} onMouseDown={keepFocus} onClick={() => zoomBy(1)}>
          <PlusGlyph />
        </button>
      </div>
    </div>
  );
}
