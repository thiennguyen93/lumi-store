// Search runs here, over the index the panel loaded once, so typing costs
// no call into the extension — which Lumi instantiates fresh per call.

import type { Entry } from "./types";

/** Lowercase, and without Vietnamese (or any) diacritics, so `tieng viet`
 *  finds `Tiếng Việt`: typing without the input method is the ordinary way
 *  to search quickly. `đ` is a letter of its own, not a d with a mark, so
 *  NFD leaves it alone and it is folded by hand. */
export function fold(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{M}+/gu, "")
    .replace(/[đĐ]/g, "d")
    .toLowerCase();
}

export function words(query: string): string[] {
  return fold(query).split(/\s+/).filter(Boolean);
}

const folded = new WeakMap<Entry, string>();

/** Every word must appear somewhere in the row: its title, its search text
 *  (which carries text read out of an image) or the app it came from. */
export function matches(row: Entry, wanted: string[]): boolean {
  if (!wanted.length) return true;
  let hay = folded.get(row);
  if (hay === undefined) {
    hay = fold(`${row.title} ${row.search} ${row.appName ?? ""}`);
    folded.set(row, hay);
  }
  return wanted.every((word) => hay.includes(word));
}

/** The kinds the panel filters by, in ⇥ order. `text` takes rich text
 *  too: to the person both are "something I typed". */
export const FILTERS = ["all", "text", "link", "image", "color", "file"] as const;
export type Filter = (typeof FILTERS)[number];

export const FILTER_LABELS: Record<Filter, string> = {
  all: "All",
  text: "Text",
  link: "Links",
  image: "Images",
  color: "Colours",
  file: "Files",
};

export function inFilter(row: Entry, filter: Filter): boolean {
  if (filter === "all") return true;
  if (filter === "text") return row.kind === "text" || row.kind === "rich";
  return row.kind === filter;
}

/** ⌘ + pin letter for pins, ⌘1–⌘9 for the first nine other rows shown. */
export function shortcuts(shown: Entry[]): Map<string, string> {
  const keys = new Map<string, string>();
  let n = 1;
  for (const row of shown) {
    if (row.pin) keys.set(row.id, row.pin);
    else if (n <= 9) keys.set(row.id, String(n++));
  }
  return keys;
}

export function ago(ms: number, now = Date.now()): string {
  const s = Math.max(0, Math.round((now - ms) / 1000));
  if (s < 45) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  if (d < 7) return d === 1 ? "yesterday" : `${d} days ago`;
  return new Date(ms).toLocaleDateString();
}

/** The row's age in a few characters, for the end of a row: 10s, 4m, 2h, 3d. */
export function since(ms: number, now = Date.now()): string {
  const s = Math.max(0, Math.round((now - ms) / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 60) return `${d}d`;
  return `${Math.floor(d / 30)}mo`;
}
