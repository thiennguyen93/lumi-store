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
  const hay = hayOf(row);
  return wanted.every((word) => hay.includes(word));
}

/** How the search field reads what is typed — Maccy's four. */
export type SearchMode = "exact" | "fuzzy" | "regexp" | "mixed";

/** What a row is searched by, folded once per row. */
function hayOf(row: Entry): string {
  let hay = folded.get(row);
  if (hay === undefined) {
    hay = fold(`${row.title} ${row.search} ${row.appName ?? ""}`);
    folded.set(row, hay);
  }
  return hay;
}

/** How well `needle` is spread through `hay` in order — fzf's idea: every
 *  letter must appear, in order; letters next to each other and at the
 *  start of a word count for more, gaps for less. `null` when a letter is
 *  missing. The whole word appearing as it is always wins. */
export function fuzzyScore(hay: string, needle: string): number | null {
  if (!needle) return 0;
  const first = needle[0] ?? "";
  let best: number | null = null;
  // Greedy from each place the first letter appears, best of them: from
  // the first alone, "clpy" would take the c of "cargo" in "cargo clippy".
  let start = hay.indexOf(first);
  for (let tries = 0; start >= 0 && tries < MAX_STARTS; tries++) {
    const score = fuzzyFrom(hay, needle, start);
    if (score !== null && (best === null || score > best)) best = score;
    start = hay.indexOf(first, start + 1);
  }
  if (best === null) return null;
  return best + (hay.includes(needle) ? 10 + needle.length * 3 : 0);
}

/** How many starts `fuzzyScore` tries, so a long row stays cheap. */
const MAX_STARTS = 40;

function fuzzyFrom(hay: string, needle: string, start: number): number | null {
  let score = 0;
  let from = start;
  let prev = -2;
  for (const ch of needle) {
    const at = hay.indexOf(ch, from);
    if (at < 0) return null;
    score += 1;
    if (at === prev + 1) score += 3;
    if (at === 0 || /[\s\p{P}]/u.test(hay[at - 1] ?? " ")) score += 2;
    if (prev >= 0) score -= Math.min(3, (at - prev - 1) * 0.1);
    prev = at;
    from = at + 1;
  }
  return score;
}

/** A query compiled as a regular expression, case-insensitive; `null` when
 *  it does not compile — a search half typed, like `(ab`. */
function compiled(query: string): RegExp | null {
  try {
    return new RegExp(query, "iu");
  } catch {
    return null;
  }
}

/** The rows the query finds, in the order to show them.
 *
 * - exact: every word appears as typed (diacritics and case aside).
 * - fuzzy: every word's letters appear in order; best matches first.
 * - regexp: the query is a regular expression, against the text as copied.
 * - mixed: exact, else regexp, else fuzzy — the first that finds anything,
 *   as Maccy's Mixed does. */
export function search(rows: Entry[], query: string, mode: SearchMode): Entry[] {
  const wanted = words(query);
  if (!wanted.length) return rows;
  const exact = () => rows.filter((row) => matches(row, wanted));
  const regexp = () => {
    const re = compiled(query.trim());
    return re ? rows.filter((row) => re.test(`${row.title} ${row.search} ${row.appName ?? ""}`)) : [];
  };
  const fuzzy = () =>
    rows
      .map((row, at) => {
        const hay = hayOf(row);
        let total = 0;
        for (const word of wanted) {
          const score = fuzzyScore(hay, word);
          if (score === null) return null;
          total += score;
        }
        return { row, at, total };
      })
      .filter((hit): hit is { row: Entry; at: number; total: number } => hit !== null)
      .sort((a, b) => b.total - a.total || a.at - b.at)
      .map((hit) => hit.row);
  switch (mode) {
    case "fuzzy":
      return fuzzy();
    case "regexp":
      return regexp();
    case "mixed": {
      const first = exact();
      if (first.length) return first;
      const second = regexp();
      return second.length ? second : fuzzy();
    }
    default:
      return exact();
  }
}

/** Whether the query is one the regexp mode cannot read. */
export function badPattern(query: string, mode: SearchMode): boolean {
  return mode === "regexp" && query.trim() !== "" && compiled(query.trim()) === null;
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
