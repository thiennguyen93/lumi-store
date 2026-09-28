// Lucide glyphs (ISC), inlined as JSX: the page's CSP allows nothing
// off-origin, and a glyph is too small to be worth a package.

import type { ReactNode } from "react";
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

// The About page's.

export function LockGlyph() {
  return (
    <Glyph>
      <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </Glyph>
  );
}

export function OfflineGlyph() {
  return (
    <Glyph>
      <path d="M12 20h.01" />
      <path d="M8.5 16.43a5 5 0 0 1 7 0" />
      <path d="M2 8.82a15 15 0 0 1 4.17-2.65" />
      <path d="M10.66 5c4.01-.36 8.14.9 11.34 3.76" />
      <path d="M16.85 11.25a10 10 0 0 1 2.22 1.68" />
      <path d="M5 13a10 10 0 0 1 5.24-2.76" />
      <path d="m2 2 20 20" />
    </Glyph>
  );
}

export function HiddenGlyph() {
  return (
    <Glyph>
      <path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" />
      <path d="M6.61 6.61A13.53 13.53 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61" />
      <path d="M14.12 14.12a3 3 0 1 1-4.24-4.24" />
      <path d="m2 2 20 20" />
    </Glyph>
  );
}

export function CopyGlyph() {
  return (
    <Glyph>
      <rect width="14" height="14" x="8" y="8" rx="2" ry="2" />
      <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
    </Glyph>
  );
}
