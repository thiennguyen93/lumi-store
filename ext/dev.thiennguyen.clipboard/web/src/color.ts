/** A colour row's colour, read and written again in the forms a front-end
 *  developer or a designer copies it between — the preview's Formats. The
 *  reading takes what the history calls a colour (`history::is_color`):
 *  hex with three, four, six or eight digits, `rgb()`/`rgba()` and
 *  `hsl()`/`hsla()` with commas or with spaces and a slash. Pure, so the
 *  tests run it without a page. */

/** Channels 0–255, unrounded; alpha 0–1. */
export type Rgba = { r: number; g: number; b: number; a: number };

const NUM = String.raw`[+-]?(?:\d+(?:\.\d+)?|\.\d+)`;
const ARG = new RegExp(String.raw`^(${NUM})(%|deg|grad|rad|turn)?$|^none$`, "i");

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/** One argument as a number and its unit, or null when it is not one. */
function arg(text: string): { n: number; unit: string } | null {
  const m = ARG.exec(text);
  if (!m) return null;
  if (!m[1]) return { n: 0, unit: "" }; // `none`
  return { n: Number(m[1]), unit: (m[2] ?? "").toLowerCase() };
}

function alphaOf(text: string | undefined): number | null {
  if (text === undefined) return 1;
  const a = arg(text);
  if (!a || (a.unit && a.unit !== "%")) return null;
  return clamp(a.unit === "%" ? a.n / 100 : a.n, 0, 1);
}

/** The arguments inside `name(…)`, in either syntax: three, then alpha. */
function args(body: string): { three: string[]; alpha?: string } | null {
  if (body.includes(",")) {
    const parts = body.split(",").map((p) => p.trim());
    if (parts.length !== 3 && parts.length !== 4) return null;
    return { three: parts.slice(0, 3), alpha: parts[3] };
  }
  const [main, alpha, extra] = body.split("/").map((p) => p.trim());
  if (extra !== undefined || main === undefined) return null;
  const three = main.split(/\s+/);
  if (three.length !== 3) return null;
  return { three, alpha };
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1));
  return [f(0) * 255, f(8) * 255, f(4) * 255];
}

export function parseColor(input: string): Rgba | null {
  const text = input.trim();
  const hex = /^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.exec(text)?.[1];
  if (hex) {
    const full = hex.length <= 4 ? [...hex].map((c) => c + c).join("") : hex;
    const byte = (i: number) => parseInt(full.slice(i * 2, i * 2 + 2), 16);
    return { r: byte(0), g: byte(1), b: byte(2), a: full.length === 8 ? byte(3) / 255 : 1 };
  }
  const call = /^(rgba?|hsla?)\((.*)\)$/i.exec(text);
  if (!call) return null;
  const parsed = args(call[2]!.trim());
  if (!parsed) return null;
  const a = alphaOf(parsed.alpha);
  const three = parsed.three.map(arg);
  if (a === null || three.some((x) => !x)) return null;
  const [x, y, z] = three as { n: number; unit: string }[];
  if (call[1]!.toLowerCase().startsWith("rgb")) {
    const channel = (c: { n: number; unit: string }) => {
      if (c.unit && c.unit !== "%") return NaN;
      return clamp(c.unit === "%" ? (c.n / 100) * 255 : c.n, 0, 255);
    };
    const [r, g, b] = [channel(x!), channel(y!), channel(z!)];
    return [r, g, b].some(Number.isNaN) ? null : { r: r!, g: g!, b: b!, a };
  }
  const turns: Record<string, number> = { "": 1, deg: 1, grad: 0.9, rad: 180 / Math.PI, turn: 360 };
  const scale = turns[x!.unit];
  if (scale === undefined || [y!, z!].some((c) => c.unit && c.unit !== "%")) return null;
  const h = (((x!.n * scale) % 360) + 360) % 360;
  const [r, g, b] = hslToRgb(h, clamp(y!.n / 100, 0, 1), clamp(z!.n / 100, 0, 1));
  return { r, g, b, a };
}

const byte = (n: number) => clamp(Math.round(n), 0, 255);
const hex2 = (n: number) => byte(n).toString(16).padStart(2, "0").toUpperCase();
const round = (n: number, places = 0) => Number(n.toFixed(places));
const alphaTail = (c: Rgba) => (c.a < 1 ? ` / ${round(c.a, 2)}` : "");

/** `#RRGGBB`, or `#RRGGBBAA` when the colour lets something through. */
export function toHex(c: Rgba): string {
  return `#${hex2(c.r)}${hex2(c.g)}${hex2(c.b)}${c.a < 1 ? hex2(c.a * 255) : ""}`;
}

export function toRgb(c: Rgba): string {
  return `rgb(${byte(c.r)} ${byte(c.g)} ${byte(c.b)}${alphaTail(c)})`;
}

export function toHsl(c: Rgba): string {
  const [r, g, b] = [c.r / 255, c.g / 255, c.b / 255];
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  let h = 0;
  let s = 0;
  if (d) {
    s = d / (1 - Math.abs(2 * l - 1));
    h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    h = (h * 60 + 360) % 360;
  }
  return `hsl(${round(h)} ${round(s * 100)}% ${round(l * 100)}%${alphaTail(c)})`;
}

/** The colour laid over an opaque one: what the eye gets. */
export function over(c: Rgba, under: Rgba): Rgba {
  const mix = (top: number, bottom: number) => top * c.a + bottom * (1 - c.a);
  return { r: mix(c.r, under.r), g: mix(c.g, under.g), b: mix(c.b, under.b), a: 1 };
}

export const WHITE: Rgba = { r: 255, g: 255, b: 255, a: 1 };
export const BLACK: Rgba = { r: 0, g: 0, b: 0, a: 1 };

function luminance(c: Rgba): number {
  const lin = (v: number) => {
    const s = v / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(c.r) + 0.7152 * lin(c.g) + 0.0722 * lin(c.b);
}

/** WCAG 2 contrast ratio of two opaque colours, 1 to 21. */
export function contrast(x: Rgba, y: Rgba): number {
  const [a, b] = [luminance(x), luminance(y)];
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}
