// `pnpm dev` only (see main.tsx): a stand-in for Lumi's bridge, answering
// the requests src/lib.rs answers, over a history held in memory. Paste and
// close have nowhere to go in a browser, so they say what Lumi would do.

import { setAppIconUrl, setBlobUrl, setFileUrl } from "../bridge";
import type { Entry, ExtensionShortcut, Request, ShortcutHolder } from "../types";
import { MOCK_MATH } from "./mockMath";

const now = Date.now();
const min = 60_000;

/** Where each mock file is: a file row is titled by its name, as the
 *  extension titles one, and previews by this path. */
const filePaths = new Map<string, string>();

function entry(partial: Partial<Entry> & Pick<Entry, "id" | "kind" | "title">): Entry {
  if (partial.kind === "file") {
    filePaths.set(partial.id, partial.title);
    partial = { ...partial, title: partial.title.replace(/\/$/, "").split("/").pop() ?? partial.title };
  }
  return {
    hash: partial.id,
    pin: null,
    first: partial.last ?? now - 3 * min,
    last: now - 3 * min,
    count: 1,
    appName: null,
    // As the extension keeps it: the text as copied, a file's path.
    search: filePaths.get(partial.id) ?? partial.title,
    thumb: null,
    blobs: [],
    // A stand-in bundle id, so the row asks for an icon.
    app: partial.appName ? `mock.${partial.appName.toLowerCase()}` : null,
    ...partial,
  };
}

const LOREM =
  "Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.";

const RELEASE_NOTE = [
  "Release 0.59 checklist:",
  "1. Store page → https://lumikeys.app/extensions/dev.thiennguyen.clipboard/",
  "2. PR: https://github.com/thiennguyen93/lumi-store/pull/14 (review by Fri).",
  "3. Docs at www.lumikeys.app/docs/extensions, and the wiki https://vi.wikipedia.org/wiki/Việt_Nam.",
].join("\n");

let rows: Entry[] = [
  entry({ id: "a", kind: "text", title: "hello@example.com", pin: "b", appName: "Mail", count: 3, last: now - 2 * 86_400_000 }),
  entry({ id: "b", kind: "text", title: "ssh deploy@staging.example.com", pin: "d", appName: "Terminal", count: 12, last: now - 7 * 86_400_000 }),
  entry({ id: "c", kind: "link", title: "https://lumikeys.app", appName: "Safari", last: now - 10_000 }),
  entry({ id: "d", kind: "text", title: "Meeting moved to Thursday, 3 pm", appName: "Notes", last: now - min }),
  entry({ id: "e", kind: "image", title: "Image", thumb: "shot", appName: "Screenshot", last: now - 4 * min, search: "", ocrSearch: "Lumi · Clipboard Manager · Search history", ocr: true }),
  entry({ id: "f", kind: "color", title: "#378ADD", appName: "Figma", count: 2, last: now - 9 * min }),
  entry({ id: "f2", kind: "color", title: "#378ADD80", appName: "VS Code", last: now - 9 * min - 1 }),
  entry({ id: "f3", kind: "color", title: "rgba(220, 38, 38, 0.35)", appName: "Chrome", last: now - 9 * min - 2 }),
  entry({ id: "f4", kind: "color", title: "hsl(140 60% 40% / 15%)", appName: "Chrome", last: now - 9 * min - 3 }),
  entry({ id: "g", kind: "file", title: "/Users/me/Downloads/lumi-1.23.0.dmg", fileExt: "dmg", appName: "Finder", last: now - 12 * min }),
  entry({ id: "h", kind: "rich", title: "Quarterly report — final draft", appName: "Chrome", last: now - 20 * min }),
  entry({ id: "i", kind: "text", title: "cargo clippy --all-targets -- -D warnings", appName: "Terminal", count: 5, last: now - 60 * min }),
  entry({ id: "j", kind: "text", title: "pnpm tauri dev", appName: "Terminal", count: 9, last: now - 120 * min }),
  entry({ id: "k", kind: "text", title: "example.com/docs/getting-started", appName: "Chrome", last: now - 180 * min }),
  entry({ id: "l", kind: "link", title: "https://developer.apple.com/design/human-interface-guidelines", appName: "Safari", last: now - 240 * min }),
  // Snippet triggers copied: what each expands to is under it.
  entry({ id: "sn1", kind: "text", title: ";addr", appName: "Notes", last: now - 30_000 }),
  entry({ id: "sn2", kind: "text", title: ";d", appName: "Slack", last: now - 40_000 }),
  entry({ id: "sn3", kind: "text", title: ";tk123", appName: "Claude", last: now - 45_000 }),
  entry({ id: "sn4", kind: "text", title: ";mix", appName: "Notes", last: now - 50_000 }),
  // Plain text with math in it: worked out under the text.
  ...Object.entries(MOCK_MATH).map(([id, one], i) =>
    entry({ id, kind: one.html ? "rich" : "text", title: one.text, math: one.short || undefined, appName: "Notes", last: now - 15_000 - i * 1000 }),
  ),
  // Text with several addresses in it: its preview lists them under it.
  entry({ id: "t", kind: "text", title: RELEASE_NOTE.replace(/\n/g, "⏎").slice(0, 200), search: RELEASE_NOTE, appName: "Slack", last: now - 250 * min }),
  entry({ id: "m", kind: "file", title: "/Users/me/Desktop/invoice-2041.pdf", fileExt: "pdf", appName: "Finder", last: now - 26 * 60 * min }),
  entry({ id: "m2", kind: "file", title: "/Users/me/Desktop/broken.pdf", fileExt: "pdf", appName: "Finder", last: now - 26 * 60 * min - 1 }),
  entry({ id: "m3", kind: "file", title: "/Users/me/Pictures/sunset.png", fileExt: "png", appName: "Finder", last: now - 26 * 60 * min - 2 }),
  entry({ id: "m4", kind: "file", title: "/Users/me/Pictures/IMG_0042.heic", fileExt: "heic", appName: "Finder", last: now - 26 * 60 * min - 3 }),
  entry({ id: "n", kind: "file", title: "/Users/me/Movies/demo.mp4", fileExt: "mp4", appName: "Finder", last: now - 27 * 60 * min }),
  entry({ id: "o", kind: "file", title: "/Users/me/Music/song.mp3", fileExt: "mp3", appName: "Finder", last: now - 28 * 60 * min }),
  entry({ id: "p4", kind: "file", title: "/Users/me/Projects/api/main.go", fileExt: "go", appName: "Finder", last: now - 29 * 60 * min + 3 }),
  entry({ id: "p5", kind: "file", title: "/Users/me/Projects/web/App.tsx", fileExt: "tsx", appName: "Finder", last: now - 29 * 60 * min + 4 }),
  entry({ id: "p3", kind: "file", title: "/Users/me/Projects/lumi/package.json", fileExt: "json", appName: "Finder", last: now - 29 * 60 * min + 2 }),
  entry({ id: "p6", kind: "file", title: "/Users/me/Projects/lumi/README.md", fileExt: "md", appName: "Finder", last: now - 29 * 60 * min + 5 }),
  entry({ id: "p2", kind: "file", title: "/Users/me/Documents/notes.md", fileExt: "md", appName: "Finder", last: now - 29 * 60 * min + 1 }),
  entry({ id: "p", kind: "file", title: "/Users/me/Sites/index.html", fileExt: "html", appName: "Finder", last: now - 29 * 60 * min }),
  entry({ id: "q", kind: "file", title: "/Users/me/Projects/", fileExt: "/", appName: "Finder", last: now - 30 * 60 * min }),
  entry({ id: "q2", kind: "file", title: "/Users/me/logo.taolao", fileExt: "taolao", appName: "Finder", last: now - 30 * 60 * min - 1 }),
  entry({ id: "q3", kind: "file", title: "/Users/me/Projects/lumi/Makefile", fileExt: "", appName: "Finder", last: now - 30 * 60 * min - 2 }),
  entry({ id: "r1", kind: "file", title: "brag-vertical.mp4 + 2 more", fileCount: 3, appName: "Finder", last: now - 31 * 60 * min }),
  entry({ id: "r2", kind: "file", title: "brag2.mp4 + 1 more", fileExt: "mp4", fileCount: 2, appName: "Finder", last: now - 32 * 60 * min }),
  entry({ id: "r3", kind: "file", title: "Projects + 1 more", fileExt: "/", fileCount: 2, appName: "Finder", last: now - 33 * 60 * min }),
  // Long enough that a word near its end is past the title: `laborum`.
  // Old, so it stays below what the store pictures show.
  entry({ id: "s", kind: "text", title: `${LOREM.slice(0, 200)}…`, search: LOREM, appName: "Notes", last: now - 40 * 24 * 60 * min }),
];

// The mock's copies of several files, as `preview` lists them.
const MOCK_FILES: Record<string, { name: string; dir?: string; size?: number; folder?: boolean }[]> = {
  r1: [
    { name: "brag-vertical.mp4", dir: "/Users/me/Desktop", size: 18_912_004 },
    { name: "brag5.mp4", dir: "/Users/me/Downloads", size: 3_402_118 },
    { name: "lumi (2).log", dir: "/Users/me/Downloads", size: 84_210 },
  ],
  r2: [
    { name: "brag2.mp4", dir: "/Users/me/Movies", size: 12_004_550 },
    { name: "brag3-with-a-much-longer-name-than-fits-the-pane.mp4", dir: "/Users/me/Movies/Screen Recordings/2026/September", size: 9_880 },
  ],
  r3: [
    { name: "Projects", dir: "/Users/me", folder: true },
    { name: "Archive", dir: "/Volumes/Backup", folder: true },
  ],
};

// The mock's links, as `preview` lists them (src/links.rs finds them).
const MOCK_LINKS: Record<string, { url: string; text?: string }[]> = {
  h: [
    { url: "https://lumikeys.app/docs", text: "the docs" },
    { url: "https://github.com/thiennguyen93", text: "GitHub" },
    { url: "https://example.com/reports/q3-final-draft-with-a-much-longer-address-than-fits.pdf" },
  ],
  t: [
    { url: "https://lumikeys.app/extensions/dev.thiennguyen.clipboard/" },
    { url: "https://github.com/thiennguyen93/lumi-store/pull/14" },
    { url: "https://www.lumikeys.app/docs/extensions" },
    { url: "https://vi.wikipedia.org/wiki/Việt_Nam" },
  ],
};

let previewWidth: number | null = null;
let previewSplit: number | null = null;
let pdfFit: { pane?: "width" | "height"; zoomed?: "width" | "height" } = {};
// The mock's profiles, Work live, and what each snippet trigger expands to
// in them — as `preview` answers it (src/snippets.rs).
// A hundred of them, so the Look in menu is seen at the size it is built for.
const MOCK_BOOK = {
  active: "p_work",
  profiles: [
    { id: "default", name: "Default" },
    { id: "p_work", name: "Work" },
    // Long, as people name them, so a head that cannot wrap is seen at its widest.
    { id: "p_home", name: "Home — personal đây là một cái tên rất dài dài vô cùng" },
    ...Array.from({ length: 97 }, (_, i) => ({
      id: `p_${i}`,
      name: `${["Client", "Project", "Team", "Studio", "Agency", "Lab", "Shop", "Ops"][i % 8]} ${String(i + 1).padStart(3, "0")}`,
    })),
  ],
};
const MOCK_SNIPPETS: Record<string, { profile: string; text: () => string; dynamic: boolean }[]> = {
  ";addr": [
    { profile: "default", text: () => "12 Nguyen Hue, District 1, Ho Chi Minh City\nhttps://maps.example.com/12-nguyen-hue", dynamic: false },
    { profile: "p_work", text: () => "12 Nguyen Hue, District 1, Ho Chi Minh City\nhttps://maps.example.com/12-nguyen-hue", dynamic: false },
    { profile: "p_home", text: () => "Flat 4B, 88 Le Loi", dynamic: false },
  ],
  ";d": [{ profile: "p_work", text: () => new Date().toISOString().slice(0, 19).replace("T", " "), dynamic: true }],
  // Two profiles' scripts, both changing; and one fixed beside one changing.
  ";tk123": [
    // Long enough to wrap over many lines, as a script's output can be.
    { profile: "p_work", text: () => `https://google.com?q=otr-123${"nguyen_ngoc_phuoc_thien".repeat(8)}`, dynamic: true },
    { profile: "p_home", text: () => "STG-123", dynamic: true },
  ],
  ";mix": [
    { profile: "p_work", text: () => "Fixed text", dynamic: false },
    { profile: "p_home", text: () => new Date().toISOString().slice(11, 19), dynamic: true },
  ],
};

function mockExpansions(title: string) {
  const ids =
    settings.matchSnippets === "false"
      ? []
      : settings.snippetsIn === "all"
        ? MOCK_BOOK.profiles.map((p) => p.id)
        : settings.snippetsIn === "selected"
          ? (settings.snippetProfiles ?? "").split(",").filter(Boolean)
          : [MOCK_BOOK.active];
  const found: { text: string; profiles: string[]; dynamic: boolean; links: { url: string }[] }[] = [];
  for (const one of (MOCK_SNIPPETS[title.trim().toLowerCase()] ?? []).filter((s) => ids.includes(s.profile))) {
    const text = one.text();
    const name = MOCK_BOOK.profiles.find((p) => p.id === one.profile)!.name;
    const same = found.find((f) => f.text === text);
    if (same) same.profiles.push(name);
    else found.push({ text, profiles: [name], dynamic: one.dynamic, links: [...text.matchAll(/https?:\/\/\S+/g)].map((m) => ({ url: m[0] })) });
  }
  return found.length ? found : null;
}

// What Lumi keeps for `GET /__lumi__/settings`, as text the way it stores it.
let settings: Record<string, string> = {
  keep: "3mo",
  pinKey: "cmd+p",
  revealKey: "cmd+shift+h",
  revealAllKey: "alt+shift+cmd+h",
  lockKey: "cmd+shift+l",
  theme: "system",
  search: new URLSearchParams(location.search).get("search") ?? "mixed",
  pasteOnSelect: "true",
  ocr: "true",
  sort: "last",
  appearance: "popover",
  ignoreApps: "com.example.terminal",
  ignorePatterns: "^sk-[A-Za-z0-9]{20,}$\n\\b\\d{6}\\b",
  matchSnippets: "true",
  snippetsIn: "current",
  snippetProfiles: "p_work,p_home,p_3,p_gone",
  privacyIdle: "never",
  // `?confirm` and `?lock` open with "Confirm it's you before showing" and
  // the history lock on.
  privacyConfirm: String(new URLSearchParams(location.search).has("confirm")),
  lockHistory: String(new URLSearchParams(location.search).has("lock")),
  lockAfter: new URLSearchParams(location.search).get("lockAfter") ?? "close",
};
// The extension's `lock.until` and `lock.open`, and what the "Is it you?"
// dialog answers: `mockAuth(false)` for a cancel, `mockAuth("unavailable")`
// for a Mac — or a Lumi — that cannot ask (`GET` answers `available:
// false`, `POST` a 503).
// What the panel shows in privacy mode (`privacy.shown`), and until when
// once the panel closed. A browser tab never closes the panel: `mockClosed()`
// in the console stands for Lumi's `window-closed`, then reload to reopen —
// kept in the tab's session storage, as the extension keeps them.
type Kept = {
  lockUntil: number | null;
  lockOpen: boolean;
  shown: { all: boolean; except: string[]; confirmed: boolean } | null;
  shownUntil: number | null;
};
const kept: Kept = { lockUntil: null, lockOpen: false, shown: null, shownUntil: null, ...JSON.parse(sessionStorage.getItem("mock.kept") ?? "{}") };
let { lockUntil, lockOpen, shown, shownUntil } = kept;
const keep = () => sessionStorage.setItem("mock.kept", JSON.stringify({ lockUntil, lockOpen, shown, shownUntil }));
let authAnswer: boolean | "unavailable" = true;
const LOCK_MS: Record<string, number | null> = { close: null, "1m": 60_000, "5m": 300_000, "15m": 900_000 };
Object.assign(window, {
  mockAuth(answer: boolean | "unavailable") {
    authAnswer = answer;
  },
  mockClosed() {
    const cover = IDLE_MS[settings.privacyIdle ?? "never"] ?? null;
    shownUntil = shown && cover !== null ? Date.now() + cover : null;
    if (lockOpen) {
      const ms = settings.lockHistory === "true" ? (LOCK_MS[settings.lockAfter ?? "close"] ?? null) : null;
      lockUntil = ms === null ? null : Date.now() + ms;
      lockOpen = false;
    }
    keep();
    say(`panel closed: shown until ${shownUntil ?? "now"}, unlocked until ${lockUntil ?? "now"}`);
  },
});
function unlockedNow(opening: boolean): boolean {
  if (!opening) return lockOpen;
  lockOpen = lockUntil !== null && lockUntil > Date.now();
  keep();
  return lockOpen;
}

function shownOnOpening() {
  const back = privacy && shownUntil !== null && shownUntil > Date.now() ? shown : null;
  if (!back) shown = null;
  keep();
  return back;
}

// Privacy mode, the extension's switch (src/lib.rs `PRIVACY`); `?privacy`
// opens the panel with it on.
let privacy = new URLSearchParams(location.search).has("privacy");
// Every row whose preview was asked for, in order — what a covered row
// must never be in. `mockPreviews` in the console reads it.
const previewed: string[] = [];
const IDLE_MS: Record<string, number | null> = { "30s": 30_000, "1m": 60_000, "5m": 300_000, never: null };
let trash: Entry[] = [];

const PIN_LETTERS = "bdefghijlmnorstu";

// `mockEditSnippet(";addr", "Somewhere else")` in the console: the person
// edits a snippet in Lumi — `null` removes it — as Lumi tells every page of
// an extension holding `snippets` (`lumi:snippets`).
Object.assign(window, {
  mockEditSnippet(trigger: string, text: string | null) {
    const rows = MOCK_SNIPPETS[trigger] ?? [];
    if (text === null) delete MOCK_SNIPPETS[trigger];
    else MOCK_SNIPPETS[trigger] = rows.map((row) => ({ ...row, text: () => text }));
    window.dispatchEvent(new CustomEvent("lumi:snippets", { detail: {} }));
  },
});

// `mockSwitch("p_home")` in the console: the person switches profile, as
// Lumi tells every page on screen (`lumi:profiles`).
Object.assign(window, {
  mockSwitch(id: string) {
    MOCK_BOOK.active = id;
    window.dispatchEvent(new CustomEvent("lumi:profiles", { detail: structuredClone(MOCK_BOOK) }));
  },
});

// `mockCopy("some text")` in the console: a copy made while the panel is up,
// as the extension tells the panel of one (`ui.post`, `{"kind":"history"}`).
Object.assign(window, {
  mockCopy(title: string) {
    rows = [entry({ id: `copy-${Date.now()}`, kind: "text", title, appName: "Notes", last: Date.now() }), ...rows];
    window.dispatchEvent(new CustomEvent("lumi:message", { detail: { kind: "history" } }));
  },
});

// `mockPrivacy(true)` in the console: privacy mode flipped from the menu
// bar or a key, as the extension tells the panel and the Settings tab
// (`{"kind":"privacy"}`). `mockKeyboard(false)`: a pinned panel's keyboard
// gone to another app, as Lumi tells it (`lumi:keyboard`).
Object.assign(window, {
  mockPrivacy(on: boolean) {
    privacy = on;
    say(`privacy mode ${on ? "on" : "off"} from the menu bar`);
    window.dispatchEvent(new CustomEvent("lumi:message", { detail: { kind: "privacy" } }));
  },
  mockKeyboard(held: boolean) {
    window.dispatchEvent(new CustomEvent("lumi:keyboard", { detail: { held } }));
  },
  mockPreviews: previewed,
});

// `mockSummon()` in the console: the shortcut pressed again, as the extension
// tells the panel each time it is asked for (`{"kind":"summoned"}`). Pinned,
// what the keys work on hails.
Object.assign(window, {
  mockSummon() {
    window.dispatchEvent(new CustomEvent("lumi:message", { detail: { kind: "summoned" } }));
  },
});

function sorted(): Entry[] {
  const pins = rows.filter((r) => r.pin).sort((a, b) => (a.pin! < b.pin! ? -1 : 1));
  const rest = rows.filter((r) => !r.pin).sort((a, b) => b.last - a.last);
  return [...pins, ...rest];
}

function say(text: string) {
  console.info(`[mock Lumi] ${text}`);
  document.title = text;
}

function answer(request: Request): unknown {
  switch (request.kind) {
    // `?from=0.45.6` opens the tour as an update would.
    case "welcome":
      return { from: new URLSearchParams(location.search).get("from"), version: "0.46.0" };
    case "openPanel":
      say("would open the panel");
      return {};
    case "list":
      if (request.opening) trash = [];
      return {
        items: sorted(),
        pasteOnSelect: true,
        previewWidth,
        previewSplit,
        pdfFit,
        pinKey: settings.pinKey ?? "cmd+p",
        revealKey: settings.revealKey ?? "cmd+shift+h",
        revealAllKey: settings.revealAllKey ?? "alt+shift+cmd+h",
        lockKey: settings.lockKey ?? "cmd+shift+l",
        searchMode: (settings.search ?? "mixed") as "exact" | "fuzzy" | "regexp" | "mixed",
        appearance: (new URLSearchParams(location.search).get("appearance") ?? "popover") as "popover" | "hud" | "sidebar",
        privacy,
        privacyConfirm: settings.privacyConfirm === "true" && settings.lockHistory !== "true",
        lock: { on: settings.lockHistory === "true", unlocked: settings.lockHistory === "true" && unlockedNow(request.opening === true) },
        shown: request.opening === true ? shownOnOpening() : null,
      };
    case "unlocked":
      lockOpen = true;
      keep();
      say("unlocked until the panel closes");
      return {};
    case "lock":
      lockUntil = null;
      lockOpen = false;
      shown = null;
      keep();
      say("locked now");
      return {};
    case "shown":
      if (privacy) shown = request.all || request.except.length || request.confirmed ? { all: request.all, except: request.except, confirmed: request.confirmed } : null;
      shownUntil = null;
      keep();
      return {};
    case "privacy":
    case "setPrivacy":
      if (request.on !== undefined) {
        // Off with "Confirm it's you before showing" asks first, and a no
        // leaves it on (src/lib.rs `set_private`).
        if (!request.on && privacy && settings.privacyConfirm === "true" && settings.lockHistory !== "true") {
          if (authAnswer === "unavailable") throw new Error("owner.authenticate: the dialog cannot be shown here (macOS could not ask (LAError -5))");
          say("Is it you? Lumi is trying to turn off privacy mode (Clipboard Manager)");
          if (!authAnswer) return { privacy };
        }
        privacy = request.on;
        say(`would turn privacy mode ${privacy ? "on" : "off"}`);
      }
      return { privacy };
    case "preview": {
      previewed.push(request.id);
      const row = rows.find((r) => r.id === request.id);
      const text = !row
        ? ""
        : row.kind === "file"
          ? (filePaths.get(row.id) ?? row.title)
          : row.search.length > row.title.length
            ? row.search
            : `${row.title}\n\n(the full text of the copy would be here)`;
      const html = row && MOCK_MATH[row.id]?.html
        ? MOCK_MATH[row.id]!.html!
        : row?.kind === "rich"
          ? `<meta charset="utf-8"><div style="color: rgb(0, 0, 0); font-family: Georgia;">${row.title.replace(/</g, "&lt;")} 🎉</div><p style="color: rgb(34, 34, 34)">Some <b>bold</b>, <i>italic</i>, <s>struck</s>, <u>under</u> and <span style="color: rgb(220, 38, 38)">red</span> <span style="font-family: Menlo">mono</span> <a href="https://lumikeys.app/docs">the docs</a>, <a href="https://github.com/thiennguyen93">GitHub</a>, <a href="mailto:hi@example.com">mail me</a>.</p><p>Draft: https://example.com/reports/q3-final-draft-with-a-much-longer-address-than-fits.pdf</p><ul><li>one ✅</li><li>two</li></ul><img src="https://x.test/a.png"><script>parent.document.body.remove()</script>`
          : null;
      const ocr = row?.ocr && settings.ocr !== "false" ? ["Lumi", "Clipboard Manager", "Search history", ...Array.from({ length: 60 }, (_, i) => `Line ${i + 1} of a long read`)].join("\n") : null;
      const fileSize = row?.kind === "file" ? (row.title.endsWith(".pdf") ? 1_234_567 : 48_213_904) : null;
      const fileToken = row?.kind === "file" && /\.(pdf|png|heic|mp3|mp4|html|md|json|go|tsx)$/.test(row.title) ? row.title : null;
      const files = row ? MOCK_FILES[row.id] : undefined;
      const links = row ? MOCK_LINKS[row.id] : undefined;
      const snippets = row && (row.kind === "text" || row.kind === "rich") ? mockExpansions(row.title) : null;
      const math = row ? (MOCK_MATH[row.id]?.math ?? null) : null;
      return { text: math ? row!.title : text, html, ocr, fileSize, fileToken, files: files ?? null, fileCount: files?.length ?? 0, links: links ?? null, linkCount: links?.length ?? 0, snippets, math };
    }
    case "drag":
      say(`would drag ${request.id}${request.file != null ? ` (file ${request.file})` : ""} out of the panel`);
      return {};
    case "paste":
      say(`would ${request.pinned ? "hand the keyboard back" : "close the panel"} and paste ${request.plain ? "plain text of " : ""}${request.id}`);
      return {};
    case "pin": {
      const row = rows.find((r) => r.id === request.id);
      if (!row) throw new Error("That item is no longer in the history.");
      if (row.pin) row.pin = null;
      else row.pin = [...PIN_LETTERS].find((c) => !rows.some((r) => r.pin === c)) ?? null;
      return { pin: row.pin };
    }
    case "delete": {
      const ids = "ids" in request ? request.ids : [request.id];
      trash.push(...rows.filter((r) => ids.includes(r.id)));
      rows = rows.filter((r) => !ids.includes(r.id));
      return {};
    }
    case "restore": {
      const ids = "ids" in request ? request.ids : [request.id];
      const back = trash.filter((r) => ids.includes(r.id));
      trash = trash.filter((r) => !ids.includes(r.id));
      rows.push(...back);
      return { restored: back.length === ids.length && back.length > 0, count: back.length };
    }
    case "clearAll": {
      const ids = rows.map((r) => r.id);
      trash.push(...rows);
      rows = [];
      return { ids };
    }
    case "copy":
      say(`would copy ${request.plain ? "plain text of " : ""}${request.id} and ${request.pinned ? "stay up" : "close"}`);
      return {};
    case "settings":
      say("would close the panel and open Settings on this extension's tab");
      return {};
    case "openDocs":
    case "openStore":
      say(`would open the ${request.kind === "openDocs" ? "docs" : "store page"} and ${request.pinned ? "stay up" : "close"}`);
      return {};
    case "tour":
      say("would close the panel and open the Welcome tour");
      return {};
    case "copyText":
      say(
        `would copy ${request.from ? `words ${request.from.join(".")}–${request.to?.join(".")} of` : ""} the text read in ${request.id} and ${request.pinned ? "stay up" : "close"}`,
      );
      return {};
    case "readImages":
      return { read: 0, more: false };
    case "layout":
      return { layout: rows.find((r) => r.id === request.id)?.ocr ? MOCK_LAYOUT : null };
    case "copyColor":
      say(`would copy ${request.text} and ${request.pinned ? "stay up" : "close"}`);
      return {};
    case "copyMath":
      say(`would copy ${JSON.stringify(request.text)} and ${request.pinned ? "stay up" : "close"}`);
      return {};
    case "copySnippet":
      say(`would copy what ${request.id} expands to and ${request.pinned ? "stay up" : "close"}`);
      return {};
    case "profiles":
      return MOCK_BOOK;
    case "copyPath":
      say(`would copy the path of ${rows.find((r) => r.id === request.id)?.title}`);
      return {};
    case "open":
      say(`would open ${request.url ?? rows.find((r) => r.id === request.id)?.title} in the browser and ${request.pinned ? "stay up" : "close"}`);
      return {};
    case "saveImage":
      say(`would close the panel and offer ${request.id} to save as "${request.name}.png"`);
      return {};
    case "reveal":
      say(`would show ${rows.find((r) => r.id === request.id)?.title} in Finder`);
      return {};
    case "setPin": {
      const row = rows.find((r) => r.id === request.id);
      if (!row) throw new Error("That item is no longer in the history.");
      const taken = rows.some((r) => r !== row && r.pin === request.pin);
      row.pin = request.pin && !taken ? request.pin : request.pin ? ([...PIN_LETTERS].find((c) => !rows.some((r) => r.pin === c)) ?? null) : null;
      return { pin: row.pin };
    }
    case "clear": {
      const going = rows.filter((r) => !r.pin);
      trash.push(...going);
      rows = rows.filter((r) => r.pin);
      return { ids: going.map((r) => r.id) };
    }
    case "close":
      say("would close the panel");
      return {};
    case "pinPanel":
      say(request.pinned ? "would keep the panel up while you work elsewhere" : "would let the panel close when you click away");
      return { pinned: request.pinned };
    case "pdfFit":
      pdfFit = { ...pdfFit, [request.zoomed ? "zoomed" : "pane"]: request.fit };
      say(`would start ${request.zoomed ? "zoomed" : "side"} PDFs at the ${request.fit}`);
      return {};
    case "previewWidth":
      previewWidth = request.width;
      say(`would keep the preview ${request.width}px wide`);
      return {};
    case "previewSplit":
      previewSplit = request.height;
      say(request.height == null ? "would put the line back" : `would keep ${request.height}px over the line`);
      return {};
    case "apps": {
      const seen = new Map<string, string>();
      for (const r of [...rows].sort((a, b) => b.last - a.last))
        if (r.appName) seen.set(`com.example.${r.appName.toLowerCase()}`, r.appName);
      return { apps: [...seen].map(([id, name]) => ({ id, name })) };
    }
    case "dress":
      say(`would put ${settings.appearance} glass, ${settings.theme} theme on the panel`);
      return {};
    case "tryPatterns": {
      // JavaScript's RegExp stands in for the extension's regex-lite.
      const errors: { line: number; error: string }[] = [];
      let matched: number | null = null;
      request.patterns.split("\n").forEach((raw, i) => {
        const line = raw.trim();
        if (!line) return;
        try {
          if (matched === null && request.sample && new RegExp(line).test(request.sample)) matched = i + 1;
        } catch (err) {
          errors.push({ line: i + 1, error: err instanceof Error ? err.message : String(err) });
        }
      });
      return { errors, matched };
    }
    case "stats": {
      // `?empty` shows the About page as a fresh install sees it.
      const shown = new URLSearchParams(location.search).has("empty") ? [] : rows;
      return {
        kept: shown.length,
        keep: settings.keep ?? "3mo",
        pinned: shown.filter((r) => r.pin).length,
        images: shown.filter((r) => r.kind === "image").length,
        since: shown.length ? Math.min(...shown.map((r) => r.first)) : null,
      };
    }
  }
}

// `?glass`: draw the page on a stand-in for the panel's glass.
if (new URLSearchParams(location.search).has("glass")) {
  document.documentElement.classList.add("glass-preview");
}

/** Who the mock says holds ⌘⇧C: `?holder=Screenshot` a Shortcuts row of
 *  that name in the Work profile, `?other` another extension's key. */
function holdersOf(key: string | null): ShortcutHolder[] {
  if (key !== "Shift+Super+KeyC") return [];
  const search = new URLSearchParams(location.search);
  if (search.has("other")) {
    return [{ kind: "extension", extensionId: "dev.example.snap", extensionName: "Window Snap", command: "left", commandLabel: "Snap left" }];
  }
  const name = search.get("holder");
  return name === null ? [] : [{ kind: "shortcut", profile: "p2", profileName: "Work", name }];
}

/** The extension's own `[[shortcut]]` as the install left it. `?scenario=`
 *  `taken` (⌘⇧C held by `?holder`, default Screenshot), `invalid`, `cleared`;
 *  anything else is a key that was armed. */
let ess: ExtensionShortcut = (() => {
  const search = new URLSearchParams(location.search);
  const scenario = search.get("scenario") ?? "registered";
  const base = { command: "open", label: "Show clipboard history", declared: "Shift+Super+KeyC" };
  if (scenario === "taken") {
    if (!search.has("holder") && !search.has("other")) search.set("holder", "Screenshot");
    history.replaceState(null, "", `?${search}`);
    const holder = holdersOf("Shift+Super+KeyC")[0] ?? null;
    const reason = holder?.kind === "extension"
      ? "⇧⌘C belongs to the extension Window Snap (Snap left)."
      : `⇧⌘C is already the shortcut \u201c${search.get("holder")}\u201d in the Work profile.`;
    return { ...base, key: null, state: "taken", reason, holder };
  }
  if (scenario === "invalid") {
    return { ...base, key: null, state: "invalid", reason: "macOS keeps ⇧⌘C for itself on this Mac.", holder: null };
  }
  if (scenario === "cleared") return { ...base, key: null, state: "cleared", reason: null, holder: null };
  return { ...base, key: "Shift+Super+KeyC", state: "registered", reason: null, holder: null };
})();

const real = window.fetch.bind(window);
window.fetch = async (input, init) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  if (url.endsWith("/__lumi__/drag")) {
    say("would hand the drag to macOS");
    return new Response(null, { status: 204 });
  }
  if (url.endsWith("/__lumi__/shortcuts")) {
    if (init?.method === "PUT") {
      const asked = JSON.parse(String(init.body)) as { command: string; key: string | null; replace?: boolean };
      // `?holder=<name>` is a Shortcuts row holding ⌘⇧C in the Work
      // profile: recording it is refused until `replace`, the way Lumi
      // refuses; any other key lands. Another extension's key (`?other`)
      // is refused outright.
      const holders = holdersOf(asked.key);
      if (holders.length && (!asked.replace || holders.some((h) => h.kind === "extension"))) {
        const said = holders[0]!.kind === "extension"
          ? "⇧⌘C belongs to the extension Window Snap (Snap left). Change it under Extensions, on that extension's Shortcuts tab, or pick another key."
          : `⇧⌘C is already the shortcut \u201c${(holders[0] as { name: string }).name}\u201d in the Work profile.`;
        return new Response(JSON.stringify({ said, holders }), { status: 409 });
      }
      if (asked.key && !/^(Ctrl\+|Alt\+|Super\+|Shift\+)*(Key[A-Z]|Digit[0-9]|Space|F([1-9]|1[0-2]))$/.test(asked.key)) {
        return new Response("that is not a key Lumi can register", { status: 400 });
      }
      ess = {
        ...ess,
        key: asked.key,
        state: asked.key ? "registered" : "cleared",
        reason: null,
        holder: null,
      };
      say(asked.key ? `armed ${asked.key}${asked.replace ? " (replacing)" : ""}` : "cleared the shortcut");
      return new Response(JSON.stringify(ess), { status: 200 });
    }
    const none = new URLSearchParams(location.search).has("nokey");
    const body = {
      on: true,
      commands: [
        {
          name: "open",
          label: "Show clipboard history",
          rows: none ? [] : [{ trigger: "Ctrl+Alt+KeyV", enabled: false }],
        },
      ],
      ess: [ess],
    };
    return new Response(JSON.stringify(body), { status: 200 });
  }
  if (url.endsWith("/__lumi__/show-shortcuts")) {
    say("would open Lumi's Shortcuts, searched for Show clipboard history");
    return new Response(null, { status: 204 });
  }
  if (url.endsWith("/__lumi__/authenticate")) {
    if (init?.method !== "POST") {
      return new Response(JSON.stringify({ available: authAnswer !== "unavailable" }), { status: 200 });
    }
    const { reason } = JSON.parse(String(init.body)) as { reason: string };
    if (authAnswer === "unavailable") return new Response("macOS could not ask (LAError -5)", { status: 503 });
    say(`Is it you? Lumi is trying to ${reason} (Clipboard Manager)`);
    // The keyboard as Lumi 1.36.0 tells it around the dialog — the worst a
    // panel meets: taken by it; handed back as it answers; taken by the app
    // in front a moment later, as macOS does; and taken back by Lumi
    // (`owner_auth`). Lumi 1.36.1 tells none of that, and `true` after.
    const tell = (held: boolean) => window.dispatchEvent(new CustomEvent("lumi:keyboard", { detail: { held } }));
    tell(false);
    await new Promise((resolve) => setTimeout(resolve, 500));
    setTimeout(() => tell(true));
    setTimeout(() => {
      tell(false);
      tell(true);
    }, 25);
    return new Response(JSON.stringify({ authenticated: authAnswer }), { status: 200 });
  }
  if (url.endsWith("/__lumi__/settings")) {
    if (init?.method === "PUT") {
      settings = { ...settings, ...JSON.parse(String(init.body)) };
      say("saved settings");
      // As Lumi tells every page of the extension's (`lumi:settings`).
      setTimeout(() => window.dispatchEvent(new CustomEvent("lumi:settings", { detail: { ...settings } })));
      return new Response(null, { status: 204 });
    }
    return new Response(JSON.stringify(settings), { status: 200 });
  }
  if (!url.endsWith("/__lumi__/call")) return real(input, init);
  const request = JSON.parse(String(init?.body)) as Request;
  // `?slow` (or `?slow=5000`, in ms): the opening list answers a second
  // late, as on a busy Mac — the panel as it is before it knows whether the
  // history is locked.
  const slow = new URLSearchParams(location.search).get("slow");
  if (request.kind === "list" && request.opening && slow !== null) {
    await new Promise((resolve) => setTimeout(resolve, Number(slow) || 1000));
  }
  try {
    const body = JSON.stringify(answer(request));
    return new Response(body, { status: 200 });
  } catch (err) {
    return new Response(err instanceof Error ? err.message : String(err), { status: 502 });
  }
};

/** Where the words of the drawn screenshot below are, roughly — as the
 *  extension's reading would say (`history::Layout`). */
const MOCK_LAYOUT = {
  width: 320,
  height: 200,
  lines: [
    {
      text: "Clipboard Manager",
      frame: [24, 54, 186, 26] as [number, number, number, number],
      words: [
        { text: "Clipboard", frame: [24, 54, 96, 26] as [number, number, number, number] },
        { text: "Manager", frame: [126, 54, 84, 26] as [number, number, number, number] },
      ],
    },
    {
      text: "Search history",
      frame: [24, 104, 146, 26] as [number, number, number, number],
      words: [
        { text: "Search", frame: [24, 104, 70, 26] as [number, number, number, number] },
        { text: "history", frame: [100, 104, 70, 26] as [number, number, number, number] },
      ],
    },
  ],
};

// A drawn stand-in for a screenshot, as a data: URL (which Lumi's CSP
// allows for images too).
setBlobUrl(
  () =>
    "data:image/svg+xml;utf8," +
    encodeURIComponent(
      '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="200"><rect width="320" height="200" fill="#378add" opacity=".25"/><text x="24" y="74" font-family="-apple-system" font-size="22" fill="#185fa5">Clipboard Manager</text><text x="24" y="124" font-family="-apple-system" font-size="22" fill="#185fa5">Search history</text></svg>',
    ),
);

// A coloured tile with the app's initial, for `/__lumi__/app-icon/<id>`;
// the one app named "Figma" has none, to show the name falling back.
setAppIconUrl((bundleId) => {
  const name = bundleId.replace(/^mock\./, "");
  if (name === "figma") return "data:,missing";
  const hue = [...name].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7);
  return (
    "data:image/svg+xml;utf8," +
    encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><rect width="32" height="32" rx="7" fill="hsl(${hue} 60% 50%)"/><text x="16" y="22" text-anchor="middle" font-family="-apple-system" font-size="17" font-weight="600" fill="white">${name[0]?.toUpperCase() ?? "?"}</text></svg>`,
    )
  );
});

// The mock's "token" is the file's name: a second of a tone for a sound, a
// twelve-page PDF (a broken one for `broken.pdf`), and nothing for a film — which shows the tile it falls back to.
setFileUrl((token) => {
  if (token.endsWith(".mp3")) {
    const rate = 8000;
    const samples = new Uint8Array(rate);
    samples.forEach((_, i) => (samples[i] = 128 + Math.round(60 * Math.sin((2 * Math.PI * 440 * i) / rate))));
    const wav = new Uint8Array(44 + samples.length);
    const view = new DataView(wav.buffer);
    const text = (at: number, word: string) => [...word].forEach((c, i) => (wav[at + i] = c.charCodeAt(0)));
    text(0, "RIFF");
    view.setUint32(4, 36 + samples.length, true);
    text(8, "WAVEfmt ");
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, rate, true);
    view.setUint32(28, rate, true);
    view.setUint16(32, 1, true);
    view.setUint16(34, 8, true);
    text(36, "data");
    view.setUint32(40, samples.length, true);
    wav.set(samples, 44);
    return URL.createObjectURL(new Blob([wav], { type: "audio/wav" }));
  }
  // Text: a page whose script must show as text, never run, and notes
  // longer than the 64 KB the preview reads.
  if (token.endsWith(".html")) {
    const page = '<!doctype html>\n<html>\n  <body>\n    <h1>Hello</h1>\n    <script>document.title = "ran!"; alert("ran")</script>\n  </body>\n</html>\n';
    return URL.createObjectURL(new Blob([page], { type: "text/plain" }));
  }
  if (token.endsWith(".go")) {
    const go = `package main

import (
\t"fmt"
\t"net/http"
)

// Server answers health checks.
type Server struct {
\tAddr  string
\tDebug bool
}

func (s *Server) health(w http.ResponseWriter, _ *http.Request) {
\tfmt.Fprintf(w, "ok %d\\n", 200) // always fine
}

func main() {
\ts := &Server{Addr: ":8080", Debug: true}
\thttp.HandleFunc("/health", s.health)
\t_ = http.ListenAndServe(s.Addr, nil)
}
`;
    return URL.createObjectURL(new Blob([go], { type: "text/plain" }));
  }
  if (token.endsWith(".tsx")) {
    const tsx = [
      'import { useState } from "react";',
      "",
      "/** A counter, with a <script> in a string that must stay text. */",
      "export function App({ start = 0 }: { start?: number }) {",
      "  const [count, setCount] = useState<number>(start);",
      "  const label = `clicked ${count} times`;",
      '  const trap = "<script>alert(1)</script>";',
      "  const re = /^[a-z]+\\d*$/i;",
      "  return (",
      '    <button className="primary" onClick={() => setCount(count + 1)} title={trap}>',
      "      {label} {re.test(label) ? null : true}",
      "    </button>",
      "  );",
      "}",
      // A head cut mid-token, as a 64 KB read may be.
      "const unfinished = `still open",
    ].join("\n");
    return URL.createObjectURL(new Blob([tsx], { type: "text/plain" }));
  }
  if (token.endsWith(".json")) {
    const data = {
      name: "lumi",
      version: "1.26.0",
      private: true,
      scripts: { dev: "tauri dev", build: "tauri build", "<script>alert(1)</script>": "must show as text" },
      engines: { node: ">=22" },
      tags: ["clipboard", "launcher", null, 42, 3.14, false],
      contributors: Array.from({ length: 250 }, (_, i) => ({ id: i + 1, name: `Person ${i + 1}`, admin: i % 50 === 0 })),
      empty: { list: [], map: {} },
    };
    return URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "text/plain" }));
  }
  if (token.endsWith("README.md")) {
    const readme = [
      "# Lumi",
      "",
      "A **launcher** for macOS with _extensions_, ~~plugins~~ and `inline code`.",
      "",
      "## Install",
      "",
      "```bash",
      "brew install --cask lumi",
      "```",
      "",
      "> Tip: press ⌘⇧C for the clipboard.",
      "",
      "- [x] PDF preview",
      "- [ ] Markdown preview",
      "  - nested item",
      "",
      "1. First",
      "2. Second",
      "",
      "| Key | Action |",
      "| --- | --- |",
      "| ↵ | paste |",
      "| ⌥↵ | plain |",
      "",
      "[docs](https://thiennguyen.dev) · [bad](javascript:alert(1)) · ![logo](https://example.com/x.png)",
      "",
      '<script>document.title = "ran!"</script><img src=x onerror="document.title=\'ran\'">',
      "",
      "---",
      "Done.",
    ].join("\n");
    return URL.createObjectURL(new Blob([readme], { type: "text/plain" }));
  }
  if (token.endsWith(".md")) {
    const notes = Array.from({ length: 3000 }, (_, i) => `- [${i % 3 ? " " : "x"}] Note ${i + 1}: chuyển tính năng sang extension\tgiảm rủi ro`).join("\n");
    return URL.createObjectURL(new Blob([`# Notes\n\n${notes}\n`], { type: "text/plain" }));
  }
  // A picture file: a drawn sunset; the HEIC one draws nothing, for the tile.
  if (token.endsWith(".png")) {
    return (
      "data:image/svg+xml;utf8," +
      encodeURIComponent(
        '<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900"><defs><linearGradient id="s" x2="0" y2="1"><stop offset="0" stop-color="#f6a04d"/><stop offset="1" stop-color="#b8386e"/></linearGradient></defs><rect width="1600" height="900" fill="url(#s)"/><circle cx="800" cy="620" r="180" fill="#ffd27a"/><rect y="640" width="1600" height="260" fill="#2a2350"/></svg>',
      )
    );
  }
  if (token.endsWith(".pdf")) {
    // Not a PDF at all: pdf.js refuses it and the tile stands in.
    if (token.includes("broken")) return URL.createObjectURL(new Blob(["%PDF-1.4 nothing here"], { type: "application/pdf" }));
    return URL.createObjectURL(new Blob([invoicePdf(12)], { type: "application/pdf" }));
  }
  return "data:,missing";
});

/** An A4 PDF of `pages` pages, each with a heading, a few lines and a box,
 *  written out with a real cross-reference table so pdf.js reads it the way
 *  it reads a file off disk rather than rebuilding it. */
function invoicePdf(pages: number): string {
  const objects: string[] = [];
  const add = (body: string) => objects.push(body) + 2; // 1 is the catalog, 2 the page tree
  const font = add("<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>");
  const kids: number[] = [];
  for (let n = 1; n <= pages; n++) {
    const lines = Array.from({ length: 24 }, (_, i) => `BT /F1 11 Tf 56 ${700 - i * 24} Td (Line ${i + 1} of page ${n} - item ${n * 100 + i}) Tj ET`);
    const content = [
      `0.22 0.54 0.87 rg 40 760 515 50 re f`,
      `1 1 1 rg BT /F1 24 Tf 56 775 Td (Invoice 2041 - page ${n} / ${pages}) Tj ET`,
      `0 0 0 rg`,
      ...lines,
      `0.9 0.3 0.2 RG 3 w 40 60 515 40 re S`,
    ].join("\n");
    const stream = add(`<</Length ${content.length}>>stream\n${content}\nendstream`);
    kids.push(add(`<</Type/Page/Parent 2 0 R/MediaBox[0 0 595 842]/Contents ${stream} 0 R/Resources<</Font<</F1 ${font} 0 R>>>>>>`));
  }
  const all = ["<</Type/Catalog/Pages 2 0 R>>", `<</Type/Pages/Kids[${kids.map((k) => `${k} 0 R`).join(" ")}]/Count ${pages}>>`, ...objects];
  let pdf = "%PDF-1.4\n";
  const offsets = all.map((body, i) => {
    const at = pdf.length;
    pdf += `${i + 1} 0 obj\n${body}\nendobj\n`;
    return at;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${all.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("")}`;
  pdf += `trailer<</Size ${all.length + 1}/Root 1 0 R>>\nstartxref\n${xref}\n%%EOF`;
  return pdf;
}
