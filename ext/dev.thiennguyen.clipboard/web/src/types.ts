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
}

export interface ListAnswer {
  items: Entry[];
  pasteOnSelect: boolean;
  /** The preview pane's width as last dragged, or null for never. */
  previewWidth: number | null;
}

/** The About page's `stats` answer. `since` is Lumi's clock, in ms. */
export interface Stats {
  kept: number;
  limit: number;
  pinned: number;
  images: number;
  since: number | null;
}

export type Request =
  | { kind: "list" }
  | { kind: "preview"; id: string }
  | { kind: "paste"; id: string; plain: boolean }
  | { kind: "pin"; id: string }
  | { kind: "delete"; id: string }
  | { kind: "clear" }
  | { kind: "close" }
  | { kind: "stats" }
  | { kind: "previewWidth"; width: number };
