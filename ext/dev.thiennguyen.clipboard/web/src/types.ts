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
}

export interface ListAnswer {
  items: Entry[];
  pasteOnSelect: boolean;
  /** The preview pane's width as last dragged, or null for never. */
  previewWidth: number | null;
  /** The glass the panel is on (the Appearance setting). */
  appearance?: "popover" | "hud" | "sidebar";
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
  | { kind: "clearAll" }
  | { kind: "settings" }
  | { kind: "setPin"; id: string; pin: string | null }
  | { kind: "clear" }
  | { kind: "close" }
  | { kind: "stats" }
  | { kind: "previewWidth"; width: number };
