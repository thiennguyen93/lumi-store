// A small picture of each theme, for choosing between them by sight as
// macOS's own Appearance does — drawn from the page's tokens, so each
// follows light and dark like the theme it stands for.

import type { JSX } from "react";
import type { Look } from "../looks";

const W = 120;
const H = 76;

function arc(cx: number, cy: number, r: number, from: number, to: number): string {
  const at = (deg: number) => {
    const rad = ((deg - 90) * Math.PI) / 180;
    return `${(cx + r * Math.cos(rad)).toFixed(2)} ${(cy + r * Math.sin(rad)).toFixed(2)}`;
  };
  return `M ${at(from)} A ${r} ${r} 0 ${to - from > 180 ? 1 : 0} 1 ${at(to)}`;
}

function Orbit() {
  return (
    <>
      {[0, 1, 2, 3].map((i) => (
        <path key={i} d={arc(60, 38, 25, i * 90 + 3, (i + 1) * 90 - 3)} className={i === 0 ? "th-accent" : i === 1 ? "th-lit" : "th-quiet"} strokeWidth={6} fill="none" />
      ))}
      <circle cx={60} cy={38} r={17} className="th-face" />
      <rect x={52} y={35} width={16} height={6} rx={2} className="th-ink" />
    </>
  );
}

function Classic() {
  return (
    <>
      <path d="M 52 8 L 68 8 L 84 68 L 36 68 Z" className="th-face th-edge" />
      <rect x={56} y={16} width={8} height={44} rx={2} className="th-quiet-fill" />
      <line x1={60} y1={62} x2={71} y2={14} className="th-rod" />
      <rect x={63} y={30} width={9} height={6} rx={1.5} transform="rotate(13 67.5 33)" className="th-accent-fill" />
      <circle cx={60} cy={62} r={2.6} className="th-ink" />
    </>
  );
}

function Pads() {
  return (
    <>
      {[0, 1, 2, 3].map((i) => (
        <g key={i}>
          <rect x={14 + i * 24} y={22} width={20} height={30} rx={4} className={i === 1 ? "th-lit-wash th-edge" : "th-face th-edge"} />
          {i === 0 && <rect x={14} y={22} width={20} height={3} className="th-accent-fill" />}
          <rect x={20 + i * 24} y={34} width={8} height={5} rx={1.5} className="th-ink" />
        </g>
      ))}
    </>
  );
}

function Simple() {
  return (
    <>
      <rect x={14} y={8} width={92} height={22} rx={5} className="th-face th-edge" />
      {[0, 1, 2, 3].map((i) => (
        <circle key={i} cx={22 + i * 8} cy={15} r={2.6} className={i === 0 ? "th-accent-fill" : i === 1 ? "th-lit-fill" : "th-quiet-fill"} />
      ))}
      <rect x={20} y={21} width={22} height={5} rx={1.5} className="th-ink" />
      <rect x={82} y={13} width={18} height={11} rx={3} className="th-lit-fill" />
      {[38, 50, 62].map((y) => (
        <g key={y}>
          <rect x={14} y={y} width={30} height={4} rx={1.5} className="th-ink" />
          <rect x={80} y={y - 2} width={26} height={8} rx={4} className="th-quiet-fill" />
        </g>
      ))}
    </>
  );
}

const DRAWN: Record<Look, () => JSX.Element> = { orbit: Orbit, classic: Classic, pads: Pads, simple: Simple };

export function Thumb({ look }: { look: Look }) {
  const Drawn = DRAWN[look];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="th" aria-hidden="true">
      <Drawn />
    </svg>
  );
}
