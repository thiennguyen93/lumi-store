// `pnpm dev` only (see main.tsx): a stand-in for Lumi's bridge, answering
// the requests src/lib.rs answers, over a history held in memory. Paste and
// close have nowhere to go in a browser, so they say what Lumi would do.

import { setBlobUrl } from "../bridge";
import type { Entry, Request } from "../types";

const now = Date.now();
const min = 60_000;

function entry(partial: Partial<Entry> & Pick<Entry, "id" | "kind" | "title">): Entry {
  return {
    hash: partial.id,
    pin: null,
    first: partial.last ?? now - 3 * min,
    last: now - 3 * min,
    count: 1,
    app: null,
    appName: null,
    search: partial.title.toLowerCase(),
    thumb: null,
    blobs: [],
    ...partial,
  };
}

let rows: Entry[] = [
  entry({ id: "a", kind: "text", title: "hi@thiennguyen.dev", pin: "b", appName: "Mail", count: 3, last: now - 2 * 86_400_000 }),
  entry({ id: "b", kind: "text", title: "ssh deploy@10.0.4.12 -p 2222", pin: "d", appName: "Terminal", count: 12, last: now - 7 * 86_400_000 }),
  entry({ id: "c", kind: "link", title: "https://github.com/p0deje/Maccy", appName: "Safari", last: now - 10_000 }),
  entry({ id: "d", kind: "text", title: "Chuyển tính năng sang extension giảm rủi ro", appName: "Notes", last: now - min }),
  entry({ id: "e", kind: "image", title: "Image", thumb: "shot", appName: "Screenshot", last: now - 4 * min, search: "lumi · clipboard · search history", ocr: true }),
  entry({ id: "f", kind: "color", title: "#378ADD", appName: "Figma", count: 2, last: now - 9 * min }),
  entry({ id: "g", kind: "file", title: "/Users/me/Downloads/lumi-1.23.0.dmg", appName: "Finder", last: now - 12 * min }),
  entry({ id: "h", kind: "rich", title: "Every guest call instantiates a fresh store", appName: "Chrome", last: now - 20 * min }),
  entry({ id: "i", kind: "text", title: "cargo clippy --all-targets -- -D warnings", appName: "Terminal", count: 5, last: now - 60 * min }),
  entry({ id: "j", kind: "text", title: "pnpm tauri dev", appName: "Terminal", count: 9, last: now - 120 * min }),
  entry({ id: "k", kind: "text", title: "thiennguyen.dev/lumi-store/extensions/index.json", appName: "Chrome", last: now - 180 * min }),
  entry({ id: "l", kind: "link", title: "https://developer.apple.com/design/human-interface-guidelines", appName: "Safari", last: now - 240 * min }),
  entry({ id: "m", kind: "file", title: "/Users/me/Desktop/invoice-2041.pdf", appName: "Finder", last: now - 26 * 60 * min }),
];

let previewWidth: number | null = null;
// What Lumi keeps for `GET /__lumi__/settings`, as text the way it stores it.
let settings: Record<string, string> = {
  keep: "3mo",
  pinKey: "alt+p",
  theme: "system",
  search: new URLSearchParams(location.search).get("search") ?? "mixed",
  pasteOnSelect: "true",
  ocr: "true",
  sort: "last",
  appearance: "popover",
  ignoreApps: "com.example.terminal",
  ignorePatterns: "^sk-[A-Za-z0-9]{20,}$\n\\b\\d{6}\\b",
};
let trash: Entry[] = [];

const PIN_LETTERS = "bdefghijklmnorstuy";

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
    case "list":
      if (request.opening) trash = [];
      return {
        items: sorted(),
        pasteOnSelect: true,
        previewWidth,
        pinKey: settings.pinKey ?? "alt+p",
        searchMode: (settings.search ?? "mixed") as "exact" | "fuzzy" | "regexp" | "mixed",
        appearance: (new URLSearchParams(location.search).get("appearance") ?? "popover") as "popover" | "hud" | "sidebar",
      };
    case "preview": {
      const row = rows.find((r) => r.id === request.id);
      const text = row ? `${row.title}\n\n(the full text of the copy would be here)` : "";
      const html =
        row?.kind === "rich"
          ? `<meta charset="utf-8"><div style="color: rgb(0, 0, 0); font-family: Georgia;">${row.title.replace(/</g, "&lt;")} 🎉</div><p style="color: rgb(34, 34, 34)">Some <b>bold</b>, <i>italic</i>, <s>struck</s>, <u>under</u> and <span style="color: rgb(220, 38, 38)">red</span> <span style="font-family: Menlo">mono</span> <a href="https://x.test">link</a>.</p><ul><li>one ✅</li><li>two</li></ul><img src="https://x.test/a.png"><script>parent.document.body.remove()</script>`
          : null;
      const ocr = row?.ocr && settings.ocr !== "false" ? ["Lumi", "Clipboard History", "Search history", ...Array.from({ length: 60 }, (_, i) => `Line ${i + 1} of a long read`)].join("\n") : null;
      return { text, html, ocr };
    }
    case "paste":
      say(`would close the panel and paste ${request.plain ? "plain text of " : ""}${request.id}`);
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
      say(`would copy ${request.plain ? "plain text of " : ""}${request.id} and close`);
      return {};
    case "settings":
      say("would close the panel and open Settings on this extension's tab");
      return {};
    case "copyText":
      say(`would copy the text read in ${request.id} and close`);
      return {};
    case "open":
      say(`would open ${rows.find((r) => r.id === request.id)?.title} in the browser`);
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
    case "previewWidth":
      previewWidth = request.width;
      say(`would keep the preview ${request.width}px wide`);
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

const real = window.fetch.bind(window);
window.fetch = async (input, init) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  if (url.endsWith("/__lumi__/drag")) {
    say("would hand the drag to macOS");
    return new Response(null, { status: 204 });
  }
  if (url.endsWith("/__lumi__/shortcuts")) {
    const none = new URLSearchParams(location.search).has("nokey");
    const body = {
      on: true,
      commands: [
        {
          name: "open",
          label: "Show clipboard history",
          rows: none ? [] : [{ trigger: "Shift+Super+KeyC", enabled: true }, { trigger: "Ctrl+Alt+KeyV", enabled: false }],
        },
      ],
    };
    return new Response(JSON.stringify(body), { status: 200 });
  }
  if (url.endsWith("/__lumi__/show-shortcuts")) {
    say("would open Lumi's Shortcuts, searched for Show clipboard history");
    return new Response(null, { status: 204 });
  }
  if (url.endsWith("/__lumi__/settings")) {
    if (init?.method === "PUT") {
      settings = JSON.parse(String(init.body));
      say("saved settings");
      return new Response(null, { status: 204 });
    }
    return new Response(JSON.stringify(settings), { status: 200 });
  }
  if (!url.endsWith("/__lumi__/call")) return real(input, init);
  try {
    const body = JSON.stringify(answer(JSON.parse(String(init?.body)) as Request));
    return new Response(body, { status: 200 });
  } catch (err) {
    return new Response(err instanceof Error ? err.message : String(err), { status: 502 });
  }
};

// A drawn stand-in for a screenshot, as a data: URL (which Lumi's CSP
// allows for images too).
setBlobUrl(
  () =>
    "data:image/svg+xml;utf8," +
    encodeURIComponent(
      '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="200"><rect width="320" height="200" fill="#378add" opacity=".25"/><text x="24" y="104" font-family="-apple-system" font-size="22" fill="#185fa5">Search history</text></svg>',
    ),
);
