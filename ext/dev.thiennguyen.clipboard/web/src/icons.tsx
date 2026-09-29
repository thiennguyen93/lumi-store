// Lucide glyphs (ISC), inlined as JSX: the page's CSP allows nothing
// off-origin, and a glyph is too small to be worth a package.

import type { ReactNode } from "react";
import type { FileFamily } from "./fileType";
import type { Kind } from "./types";

function Glyph({ children }: { children: ReactNode }) {
  return (
    <svg className="glyph" viewBox="0 0 24 24" aria-hidden="true">
      {children}
    </svg>
  );
}

export function SearchGlyph() {
  return (
    <Glyph>
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.3-4.3" />
    </Glyph>
  );
}

export function KindGlyph({ kind }: { kind: Kind }) {
  switch (kind) {
    case "link":
      return (
        <Glyph>
          <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
          <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
        </Glyph>
      );
    case "rich":
      return (
        <Glyph>
          <path d="M4 7V4h16v3" />
          <path d="M9 20h6" />
          <path d="M12 4v16" />
        </Glyph>
      );
    case "file":
      return (
        <Glyph>
          <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
          <path d="M14 2v4a2 2 0 0 0 2 2h4" />
        </Glyph>
      );
    case "color":
      return (
        <Glyph>
          <circle cx="13.5" cy="6.5" r=".5" fill="currentColor" />
          <circle cx="17.5" cy="10.5" r=".5" fill="currentColor" />
          <circle cx="8.5" cy="7.5" r=".5" fill="currentColor" />
          <circle cx="6.5" cy="12.5" r=".5" fill="currentColor" />
          <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z" />
        </Glyph>
      );
    case "image":
      return (
        <Glyph>
          <rect width="18" height="18" x="3" y="3" rx="2" />
          <circle cx="9" cy="9" r="2" />
          <path d="m21 15-3.09-3.09a2 2 0 0 0-2.82 0L6 21" />
        </Glyph>
      );
    default:
      return (
        <Glyph>
          <path d="M21 6H3" />
          <path d="M15 12H3" />
          <path d="M17 18H3" />
        </Glyph>
      );
  }
}

const PAGE = "M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z";
const CORNER = "M14 2v4a2 2 0 0 0 2 2h4";

/** A file row's glyph: the page every file gets, with what marks its
 *  family drawn inside — tinted by `data-family` in the stylesheet. */
export function FileGlyph({ family }: { family: FileFamily }) {
  if (family === "folder") {
    return (
      <svg className="glyph" data-family={family} viewBox="0 0 24 24" aria-hidden="true">
        <path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z" />
      </svg>
    );
  }
  return (
    <svg className="glyph" data-family={family} viewBox="0 0 24 24" aria-hidden="true">
      <path d={PAGE} />
      <path d={CORNER} />
      {family === "pdf" && (
        <>
          <path d="M8 17v-5h1.6a1.5 1.5 0 0 1 0 3H8" />
          <path d="M13 17v-5" />
          <path d="M16.5 12H14.5v5" />
        </>
      )}
      {family === "doc" && (
        <>
          <path d="M10 9H8" />
          <path d="M16 13H8" />
          <path d="M16 17H8" />
        </>
      )}
      {family === "sheet" && (
        <>
          <path d="M8 13h8" />
          <path d="M8 17h8" />
          <path d="M12 12v8" />
        </>
      )}
      {family === "slides" && (
        <>
          <rect x="8" y="12" width="8" height="5" rx="1" />
          <path d="M12 17v2.5" />
        </>
      )}
      {family === "code" && (
        <>
          <path d="m10 13-2 2.5 2 2.5" />
          <path d="m14 13 2 2.5-2 2.5" />
        </>
      )}
      {family === "audio" && (
        <>
          <circle cx="9.5" cy="17" r="1.5" />
          <circle cx="14.5" cy="16" r="1.5" />
          <path d="M11 17v-5l5-1v5" />
        </>
      )}
      {family === "video" && <path d="m10 12.5 5 3-5 3Z" />}
      {family === "image" && (
        <>
          <circle cx="10" cy="13" r="1" />
          <path d="m18 19-2.6-2.6a1.5 1.5 0 0 0-2.1 0L8 19.5" />
        </>
      )}
      {family === "archive" && (
        <>
          <path d="M12 11v1" />
          <path d="M12 14v1" />
          <path d="M12 17v1" />
        </>
      )}
    </svg>
  );
}

export function PinGlyph() {
  return (
    <Glyph>
      <path d="M12 17v5" />
      <path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z" />
    </Glyph>
  );
}

/** Stroke units on the 24-grid that read as one line at 14px. */
const MARK_WEIGHT = 2.2 * 14;

/** Lumi's own mark — the bolt in a rounded diamond — for the panel's
 *  breadcrumb, as Lumi's leader menu heads its own. A copy: the bridge
 *  serves no logo. Keep in step with lumi's `src-tauri/icons/lumi.svg`
 *  (and `src/LumiMark.tsx`, whose weight scaling this follows). */
export function LumiMark({ size = 14 }: { size?: number }) {
  return (
    <svg className="mark" width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M10.59 4.81 Q12 3.4 13.41 4.81 L19.19 10.59 Q20.6 12 19.19 13.41
           L13.41 19.19 Q12 20.6 10.59 19.19 L4.81 13.41 Q3.4 12 4.81 10.59 Z"
        fill="none"
        stroke="currentColor"
        strokeWidth={MARK_WEIGHT / size}
      />
      <path d="M13.0 7.2 L9.2 12.9 L11.5 12.9 L11.0 16.8 L14.8 11.1 L12.5 11.1 Z" fill="currentColor" />
    </svg>
  );
}

// The actions menu's.

export function PasteGlyph() {
  return (
    <Glyph>
      <path d="M15 2H9a1 1 0 0 0-1 1v2c0 .6.4 1 1 1h6c.6 0 1-.4 1-1V3c0-.6-.4-1-1-1Z" />
      <path d="M8 4H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2M16 4h2a2 2 0 0 1 2 2v2M11 14h10" />
      <path d="m17 10 4 4-4 4" />
    </Glyph>
  );
}

export function PlainGlyph() {
  return (
    <Glyph>
      <path d="M4 7V4h16v3" />
      <path d="M9 20h6" />
      <path d="M12 4v16" />
    </Glyph>
  );
}

export function ScanTextGlyph() {
  return (
    <Glyph>
      <path d="M3 7V5a2 2 0 0 1 2-2h2" />
      <path d="M17 3h2a2 2 0 0 1 2 2v2" />
      <path d="M21 17v2a2 2 0 0 1-2 2h-2" />
      <path d="M7 21H5a2 2 0 0 1-2-2v-2" />
      <path d="M7 8h8" />
      <path d="M7 12h10" />
      <path d="M7 16h6" />
    </Glyph>
  );
}

export function ExpandGlyph() {
  return (
    <Glyph>
      <path d="M15 3h6v6" />
      <path d="m21 3-7 7" />
      <path d="m3 21 7-7" />
      <path d="M9 21H3v-6" />
    </Glyph>
  );
}

export function CollapseGlyph() {
  return (
    <Glyph>
      <path d="m14 10 7-7" />
      <path d="M20 10h-6V4" />
      <path d="m3 21 7-7" />
      <path d="M4 14h6v6" />
    </Glyph>
  );
}

export function ExternalGlyph() {
  return (
    <Glyph>
      <path d="M15 3h6v6" />
      <path d="M10 14 21 3" />
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
    </Glyph>
  );
}

export function FolderGlyph() {
  return (
    <Glyph>
      <path d="m6 14 1.5-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.54 6a2 2 0 0 1-1.95 1.5H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H18a2 2 0 0 1 2 2v2" />
    </Glyph>
  );
}

export function DownloadGlyph() {
  return (
    <Glyph>
      <path d="M12 15V3" />
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <path d="m7 10 5 5 5-5" />
    </Glyph>
  );
}

export function TrashGlyph() {
  return (
    <Glyph>
      <path d="M3 6h18" />
      <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
      <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
    </Glyph>
  );
}

export function GearGlyph() {
  return (
    <Glyph>
      <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
      <circle cx="12" cy="12" r="3" />
    </Glyph>
  );
}

// The Dashboard's.

export function CopyGlyph() {
  return (
    <Glyph>
      <rect width="14" height="14" x="8" y="8" rx="2" ry="2" />
      <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
    </Glyph>
  );
}
