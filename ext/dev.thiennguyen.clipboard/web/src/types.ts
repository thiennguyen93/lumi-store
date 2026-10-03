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
  /** The row's own text, as copied, its first kilobyte. */
  search: string;
  /** The text Lumi read in the row's image, as read; absent while reading
   *  is off, or when there was none. */
  ocrSearch?: string;
  thumb: string | null;
  blobs: string[];
  /** Lumi read text in this item's image: Copy text in image is offered. */
  ocr?: boolean;
  /** The image has been read, text found or not. */
  ocrRead?: boolean;
  /** A file row's files' shared extension ("pdf"), "/" for folders; absent
   *  when they differ, have none, or the row is older than this field. */
  fileExt?: string;
  /** How many files a file row holds, when more than one. */
  fileCount?: number;
}

export interface ListAnswer {
  items: Entry[];
  pasteOnSelect: boolean;
  /** The preview pane's width as last dragged, or null for never. */
  previewWidth: number | null;
  /** The height of the part above the preview's line — a picture over its
   *  read text, a copy over what it expands to — as last dragged, or null
   *  for the default. */
  previewSplit?: number | null;
  /** What a PDF's 100% fits beside the list and in the zoomed panel, as
   *  last picked; a place never picked is left out. */
  pdfFit?: { pane?: "width" | "height"; zoomed?: "width" | "height" };
  /** The glass the panel is on (the Appearance setting). */
  appearance?: "popover" | "hud" | "sidebar";
  /** Light or dark as the panel is shown: "dark" for dark glass. */
  theme?: "light" | "dark" | "system";
  /** How the search field reads a query (the Search setting). */
  searchMode?: "exact" | "fuzzy" | "regexp" | "mixed";
  /** The panel's Pin key, as the setting spells it: "cmd+p". */
  pinKey?: string;
  /** On the opening list only: the menu bar's Delete All Unpinned… opened
   *  the panel to delete here, where ⌘Z can bring the rows back. */
  clear?: boolean;
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

/**
 * One of the extension's own `[[shortcut]]`s as Lumi holds it — the `ess`
 * list of `GET /__lumi__/shortcuts`. `state` is what the install came to:
 * `registered` (armed, `key` set), `taken` (something held `declared` —
 * `holder` says what, `reason` says it in a sentence), `invalid` (a key Lumi
 * cannot register) or `cleared`.
 */
export interface ExtensionShortcut {
  command: string;
  label: string;
  key: string | null;
  declared: string;
  state: "registered" | "taken" | "invalid" | "cleared";
  reason: string | null;
  holder: ShortcutHolder | null;
}

/** Who holds a combination, as Lumi names them. */
export type ShortcutHolder =
  | { kind: "shortcut"; profile: string; profileName: string; name: string }
  | { kind: "extension"; extensionId: string; extensionName: string; command: string; commandLabel: string }
  | { kind: "app"; label: string };

/** `PUT /__lumi__/shortcuts`' 409: who is in the way, for a second ask with
 *  `replace`. */
export interface ShortcutRefusal {
  said: string;
  holders: ShortcutHolder[];
}

/** `GET /__lumi__/shortcuts`: the person's rows on each command (`commands`),
 *  the pane's switch (`on`), and the extension's own keys (`ess`). */
export interface OwnShortcuts {
  on: boolean;
  commands: { name: string; label: string; rows: { trigger: string; enabled: boolean }[] }[];
  /** Absent on a Lumi older than `[[shortcut]]`. */
  ess?: ExtensionShortcut[];
}

export type Request =
  /** `opening`: the panel's first list since it opened — the extension
   *  empties the trash of what the last panel deleted. */
  | { kind: "list"; opening?: boolean }
  /** The Welcome window's: why it is up (`from` is the version an update
   *  replaced, null for an install), and its two buttons. */
  | { kind: "welcome" }
  | { kind: "openPanel" }
  | { kind: "preview"; id: string }
  /** `pinned`, here and on every request below that would put the panel
   *  away: the panel is pinned, so it stays up. */
  | { kind: "paste"; id: string; plain: boolean; pinned?: boolean }
  /** A press that started to move: Lumi drags the item (or its `file`-th
   *  file) out of the panel. Refused once the button is up. */
  | { kind: "drag"; id: string; file?: number }
  | { kind: "pin"; id: string }
  | { kind: "delete"; id: string }
  | { kind: "delete"; ids: string[] }
  | { kind: "restore"; id: string }
  | { kind: "restore"; ids: string[] }
  | { kind: "copy"; id: string; plain?: boolean; pinned?: boolean }
  /** All the text in a row's image, or — `from` and `to`, each
   *  `[line, word]` of its `Layout` — the words selected on the picture,
   *  which the extension puts together from its own reading. */
  | { kind: "copyText"; id: string; pinned?: boolean; from?: [number, number]; to?: [number, number] }
  /** Read a few of the images Lumi's reader never reached; asked again
   *  while `more`. */
  | { kind: "readImages" }
  /** Where the text in a row's image is, read now if it never was. */
  | { kind: "layout"; id: string }
  | { kind: "copyPath"; id: string; pinned?: boolean }
  /** One of a colour row's formats; the extension takes only a colour. */
  | { kind: "copyColor"; text: string; pinned?: boolean }
  /** What a row expands to as a snippet trigger, from the preview; taken
   *  only if the row still expands to it. */
  | { kind: "copySnippet"; id: string; text: string; pinned?: boolean }
  /** A link row's address; with `url`, one of the links the preview listed
   *  for a text or rich row — opened only if the item still has it — or,
   *  with `snippet`, one in what the row expands to. */
  | { kind: "open"; id: string; url?: string; snippet?: boolean; pinned?: boolean }
  | { kind: "reveal"; id: string; pinned?: boolean }
  | { kind: "saveImage"; id: string; name: string }
  | { kind: "clearAll" }
  | { kind: "settings" }
  /** About's links: the docs or the store page, by name — the extension
   *  holds the addresses — and the Welcome tour. */
  | { kind: "openDocs"; pinned?: boolean }
  | { kind: "openStore"; pinned?: boolean }
  | { kind: "tour" }
  | { kind: "setPin"; id: string; pin: string | null }
  | { kind: "clear" }
  | { kind: "close" }
  /** The title bar's pin: keep the panel up while working elsewhere. */
  | { kind: "pinPanel"; pinned: boolean }
  | { kind: "stats" }
  | { kind: "previewWidth"; width: number }
  /** Null puts the line back where the page draws it. */
  | { kind: "previewSplit"; height: number | null }
  | { kind: "pdfFit"; zoomed: boolean; fit: "width" | "height" }
  /** The Settings tab's: the apps seen in the history, and a pattern list
   *  tried against a sample. */
  | { kind: "apps" }
  /** Every profile and the live one, for "Match snippets" to tick. */
  | { kind: "profiles" }
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

/** Where the text in an image is (`history::Layout`): frames are
 *  `[x, y, width, height]` in the image's pixels, origin top-left. */
export interface Layout {
  width: number;
  height: number;
  lines: { text: string; frame: Frame; words: { text: string; frame: Frame }[] }[];
}
export type Frame = [number, number, number, number];
