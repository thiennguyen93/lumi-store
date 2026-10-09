import { type RefObject, useEffect, useRef, useState } from "react";
import type { PDFDocumentLoadingTask, PDFDocumentProxy, PDFPageProxy, RenderTask } from "pdfjs-dist/legacy/build/pdf.mjs";
import { ChevronLeftGlyph, ChevronRightGlyph, FitHeightGlyph, FitWidthGlyph, MinusGlyph, PlusGlyph } from "./icons";
import { type Fit, fitFor, keepFit } from "./pdfFit";

/** Zoom steps over the fitted page (`Fit`). */
const ZOOMS = [1, 1.5, 2, 3];

/* What 100% fits the page to (`Fit`): the sheet's width, or its height —
   the whole page in view, and narrower than the sheet if the sheet is
   narrower still. Picked on the bar and kept apart for the pane beside the
   list and the zoomed panel (`pdfFit.ts`). */

/** A page's box at 100% × `zoom`, from its shape (height over width), the
 *  sheet's room and the fit. */
function pageBox(shape: number, fit: Fit, room: { width: number; height: number }, zoom: number) {
  const across = fit === "height" && room.height > 0 ? Math.min(room.width, room.height / shape) : room.width;
  const width = Math.floor(across * zoom);
  return { width, height: Math.floor(width * shape) };
}

/** The most pixels one page may take on its canvas; WebKit refuses (draws
 *  nothing) past about 16.7 M, and a page at 3× on a retina screen can ask
 *  for more. Past it the page is drawn less sharp, not bigger. */
const MAX_PIXELS = 16_000_000;

/** pdf.js and its worker, loaded the first time a PDF is shown and never
 *  before: the panel opens on a shortcut and does not pay for them. One
 *  worker serves every document for as long as the page lives — until the
 *  panel closes, or, kept between openings (`keep-alive`), for as long as
 *  Lumi keeps the page.
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
 *  Only the page on show is drawn (in the zoomed panel, the pages near the
 *  view), and the file is read by ranges, so a 500-page PDF opens as fast
 *  as a one-page one. A file pdf.js cannot open
 *  — locked, broken, not a PDF — calls `onFail` and the tile stands in. */
export function PdfViewer({
  src,
  name,
  onFail,
  flow = false,
}: {
  src: string;
  name: string;
  onFail: () => void;
  /** Every page, one under the other, scrolled through at the width — the
   *  zoomed panel, where the PDF is there to be read (`PdfFlow`) — rather
   *  than one page at a time. */
  flow?: boolean;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null);
  const [page, setPage] = useState(1);
  const [zoom, setZoom] = useState(0);
  const [width, setWidth] = useState(0);
  const [height, setHeight] = useState(0);
  const [fit, setFit] = useState<Fit>(() => fitFor(flow));
  useEffect(() => setFit(fitFor(flow)), [flow]);
  const pickFit = (next: Fit) => {
    setFit(next);
    keepFit(flow, next);
  };
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

  // The page on show beside the list, drawn at its fit × zoom and the
  // screen's density. A draw still running when any of these change is cancelled
  // first: one canvas takes one draw at a time.
  useEffect(() => {
    const target = canvas.current;
    if (flow || !doc || !target || !width) return;
    let live = true;
    let task: RenderTask | null = null;
    void (async () => {
      try {
        const sheet = await doc.getPage(page);
        if (!live) return;
        const natural = sheet.getViewport({ scale: 1 });
        const box = pageBox(natural.height / natural.width, fit, { width, height }, ZOOMS[zoom]!);
        task = draw(sheet, target, box.width / natural.width);
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
  }, [doc, page, zoom, width, height, flow, fit]);

  // Into the flow, or zoomed within it, the page being read stays in view
  // rather than the flow opening at its top. By ref: a page turned by
  // scrolling is not a reason to scroll again.
  const reading = useRef(page);
  reading.current = page;
  useEffect(() => {
    const sheet = scroller.current;
    if (!flow || !sheet || !doc) return;
    const at = sheet.querySelector<HTMLElement>(`[data-page="${reading.current}"]`);
    if (at && reading.current > 1) sheet.scrollTo(sheet.scrollLeft, at.offsetTop - FLOW_GAP);
  }, [flow, zoom, doc, fit]);

  const pages = doc?.numPages ?? 0;
  const go = (by: number) => {
    const next = Math.min(Math.max(page + by, 1), pages);
    setPage(next);
    const sheet = scroller.current;
    if (!sheet) return;
    if (flow) {
      const at = sheet.querySelector<HTMLElement>(`[data-page="${next}"]`);
      sheet.scrollTo(sheet.scrollLeft, at ? at.offsetTop - FLOW_GAP : 0);
    } else {
      sheet.scrollTo(0, 0);
    }
  };
  const zoomBy = (by: number) => setZoom((at) => Math.min(Math.max(at + by, 0), ZOOMS.length - 1));
  // The caret stays in the search field, as it does for a row.
  const keepFocus = (event: { preventDefault: () => void }) => event.preventDefault();

  return (
    <div className="player pdf">
      <div className="pdf-sheet" ref={scroller} onScroll={flow ? () => setPage(pageAtTop(scroller.current)) : undefined}>
        {flow ? (
          doc &&
          width > 0 && (
            <PdfFlow
              doc={doc}
              // The flow's own padding comes off the height, so a page fitted
              // to it shows whole between its gaps.
              room={{ width, height: Math.max(0, height - 2 * FLOW_GAP) }}
              fit={fit}
              zoom={ZOOMS[zoom]!}
              root={scroller}
              name={name}
            />
          )
        ) : (
          <canvas ref={canvas} role="img" aria-label={doc ? `${name}, page ${page} of ${pages}` : name} hidden={!doc} />
        )}
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
        <button
          type="button"
          className="vbtn"
          aria-label={fit === "width" ? "Fit height" : "Fit width"}
          title={fit === "width" ? "Fit height: the whole page in view" : "Fit width"}
          disabled={!doc}
          onMouseDown={keepFocus}
          onClick={() => pickFit(fit === "width" ? "height" : "width")}
        >
          {fit === "width" ? <FitHeightGlyph /> : <FitWidthGlyph />}
        </button>
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

/** Space above and between pages in the flow; the CSS says the same. */
const FLOW_GAP = 8;

/** How far past the visible part of the flow a page is drawn ahead of being
 *  scrolled to, and kept after — a page further off gives its canvas back. */
const FLOW_AHEAD = "150% 0px";

/** Draw one page on a canvas at `scale` of its own size, sharp for the
 *  screen but held under `MAX_PIXELS`. */
function draw(sheet: PDFPageProxy, target: HTMLCanvasElement, scale: number): RenderTask {
  const css = sheet.getViewport({ scale });
  const density = Math.min(window.devicePixelRatio || 1, Math.sqrt(MAX_PIXELS / (css.width * css.height)));
  const viewport = sheet.getViewport({ scale: scale * density });
  target.width = Math.floor(viewport.width);
  target.height = Math.floor(viewport.height);
  target.style.width = `${Math.floor(css.width)}px`;
  target.style.height = `${Math.floor(css.height)}px`;
  return sheet.render({ canvas: target, viewport });
}

/** The page at the top of the flow: the last one starting above a third of
 *  the way down, so the counter turns as a page takes over the view. */
function pageAtTop(sheet: HTMLDivElement | null): number {
  if (!sheet) return 1;
  const line = sheet.scrollTop + sheet.clientHeight / 3;
  let at = 1;
  for (const el of sheet.querySelectorAll<HTMLElement>("[data-page]")) {
    if (el.offsetTop > line) break;
    at = Number(el.dataset.page);
  }
  return at;
}

/** Every page of the document at `width`, one under the other, for the
 *  zoomed panel. Each page holds its place from the first page's shape until
 *  its own is known, and is drawn only while near the view (`FLOW_AHEAD`):
 *  a 500-page PDF scrolls like a short one, and never holds 500 canvases. */
function PdfFlow({
  doc,
  room,
  fit,
  zoom,
  root,
  name,
}: {
  doc: PDFDocumentProxy;
  room: { width: number; height: number };
  fit: Fit;
  zoom: number;
  root: RefObject<HTMLDivElement | null>;
  name: string;
}) {
  const [shape, setShape] = useState(1.414);
  useEffect(() => {
    let live = true;
    doc
      .getPage(1)
      .then((sheet) => {
        const natural = sheet.getViewport({ scale: 1 });
        if (live) setShape(natural.height / natural.width);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [doc]);
  return (
    <div className="pdf-flow">
      {Array.from({ length: doc.numPages }, (_, i) => (
        <FlowPage
          key={i + 1}
          doc={doc}
          number={i + 1}
          sizeOf={(own) => pageBox(own ?? shape, fit, room, zoom)}
          root={root}
          name={name}
        />
      ))}
    </div>
  );
}

function FlowPage({
  doc,
  number,
  sizeOf,
  root,
  name,
}: {
  doc: PDFDocumentProxy;
  number: number;
  /** The page's box from its own shape — or, until that is known, the first
   *  page's. */
  sizeOf: (own: number | null) => { width: number; height: number };
  root: RefObject<HTMLDivElement | null>;
  name: string;
}) {
  const box = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [near, setNear] = useState(false);
  const [own, setOwn] = useState<number | null>(null);
  const size = sizeOf(own);
  // Read by the draw, which reruns only when the size does: the function is
  // new on every render of the flow — each scroll — and the size is not.
  const measure = useRef(sizeOf);
  measure.current = sizeOf;

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const observer = new IntersectionObserver(([entry]) => setNear(!!entry?.isIntersecting), {
      root: root.current,
      rootMargin: FLOW_AHEAD,
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [root]);

  useEffect(() => {
    const target = canvas.current;
    if (!target) return;
    if (!near) {
      // Far off: the canvas gives back its pixels.
      target.width = 0;
      target.height = 0;
      return;
    }
    let live = true;
    let task: RenderTask | null = null;
    void (async () => {
      try {
        const sheet = await doc.getPage(number);
        if (!live) return;
        const natural = sheet.getViewport({ scale: 1 });
        setOwn(natural.height / natural.width);
        task = draw(sheet, target, measure.current(natural.height / natural.width).width / natural.width);
        await task.promise;
        sheet.cleanup();
      } catch {
        // Cancelled by the next draw or by scrolling away, or a page pdf.js
        // could not draw: its place stays blank and the rest still scroll.
      }
    })();
    return () => {
      live = false;
      task?.cancel();
    };
    // `size.width` stands for the box: it changes with the fit, zoom and room.
  }, [doc, number, size.width, near]);

  return (
    <div
      ref={box}
      className="pdf-page"
      data-page={number}
      style={{ width: size.width, height: size.height }}
    >
      <canvas ref={canvas} role="img" aria-label={`${name}, page ${number}`} hidden={!near} />
    </div>
  );
}

