// The shapes the extension's `run-ui` answers with. They mirror
// `history::Entry` in src/history.rs (serde camelCase) by hand — change one,
// change the other.

export type Kind = "text" | "link" | "color" | "rich" | "file" | "image";

export interface Entry {
  id: string;
  hash: string;
  pin: string | null;
  first: number;
  last: number;
  count: number;
  app: string | null;
  appName: string | null;
  kind: Kind;
  title: string;
  search: string;
  thumb: string | null;
  blobs: string[];
  /** Lumi read text in this item's image: Copy text in image is offered. */
  ocr?: boolean;
  /** A file row's files' shared extension ("pdf"), "/" for folders; absent
   *  when they differ, have none, or the row is older than this field. */
  fileExt?: string;
}

export interface ListAnswer {
  items: Entry[];
  pasteOnSelect: boolean;
  /** The preview pane's width as last dragged, or null for never. */
  previewWidth: number | null;
  /** The glass the panel is on (the Appearance setting). */
  appearance?: "popover" | "hud" | "sidebar";
  /** Light or dark as the panel is shown: "dark" for dark glass. */
  theme?: "light" | "dark" | "system";
  /** How the search field reads a query (the Search setting). */
  searchMode?: "exact" | "fuzzy" | "regexp" | "mixed";
  /** The panel's Pin key, as the setting spells it: "alt+p". */
  pinKey?: string;
}

/** The About page's `stats` answer. `since` is Lumi's clock, in ms. */
export interface Stats {
  kept: number;
  /** How long rows are kept, as the `keep` setting spells it. */
  keep: string;
  pinned: number;
  images: number;
  since: number | null;
}

export type Request =
  /** `opening`: the panel's first list since it opened — the extension
   *  empties the trash of what the last panel deleted. */
  | { kind: "list"; opening?: boolean }
  | { kind: "preview"; id: string }
  | { kind: "paste"; id: string; plain: boolean }
  | { kind: "pin"; id: string }
  | { kind: "delete"; id: string }
  | { kind: "delete"; ids: string[] }
  | { kind: "restore"; id: string }
  | { kind: "restore"; ids: string[] }
  | { kind: "copy"; id: string; plain?: boolean }
  | { kind: "copyText"; id: string }
  | { kind: "open"; id: string }
  | { kind: "reveal"; id: string }
  | { kind: "saveImage"; id: string; name: string }
  | { kind: "clearAll" }
  | { kind: "settings" }
  | { kind: "setPin"; id: string; pin: string | null }
  | { kind: "clear" }
  | { kind: "close" }
  | { kind: "stats" }
  | { kind: "previewWidth"; width: number }
  /** The Settings tab's: the apps seen in the history, and a pattern list
   *  tried against a sample. */
  | { kind: "apps" }
  | { kind: "dress" }
  | { kind: "tryPatterns"; patterns: string; sample: string };

/** The `keep` setting's words, as the Settings tab and Dashboard say them. */
export const KEEP_LABELS: Record<string, string> = {
  "5m": "5 minutes",
  "1h": "1 hour",
  "1d": "1 day",
  "1w": "1 week",
  "1mo": "1 month",
  "3mo": "3 months",
};
