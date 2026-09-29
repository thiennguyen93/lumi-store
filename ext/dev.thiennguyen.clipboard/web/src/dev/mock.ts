// `pnpm dev` only (see main.tsx): a stand-in for Lumi's bridge, answering
// the requests src/lib.rs answers, over a history held in memory. Paste and
// close have nowhere to go in a browser, so they say what Lumi would do.

import { setAppIconUrl, setBlobUrl, setFileUrl } from "../bridge";
import type { Entry, Request } from "../types";

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
    search: partial.title.toLowerCase(),
    thumb: null,
    blobs: [],
    // A stand-in bundle id, so the row asks for an icon.
    app: partial.appName ? `mock.${partial.appName.toLowerCase()}` : null,
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
  entry({ id: "g", kind: "file", title: "/Users/me/Downloads/lumi-1.23.0.dmg", fileExt: "dmg", appName: "Finder", last: now - 12 * min }),
  entry({ id: "h", kind: "rich", title: "Every guest call instantiates a fresh store", appName: "Chrome", last: now - 20 * min }),
  entry({ id: "i", kind: "text", title: "cargo clippy --all-targets -- -D warnings", appName: "Terminal", count: 5, last: now - 60 * min }),
  entry({ id: "j", kind: "text", title: "pnpm tauri dev", appName: "Terminal", count: 9, last: now - 120 * min }),
  entry({ id: "k", kind: "text", title: "thiennguyen.dev/lumi-store/extensions/index.json", appName: "Chrome", last: now - 180 * min }),
  entry({ id: "l", kind: "link", title: "https://developer.apple.com/design/human-interface-guidelines", appName: "Safari", last: now - 240 * min }),
  entry({ id: "m", kind: "file", title: "/Users/me/Desktop/invoice-2041.pdf", fileExt: "pdf", appName: "Finder", last: now - 26 * 60 * min }),
  entry({ id: "m2", kind: "file", title: "/Users/me/Desktop/broken.pdf", fileExt: "pdf", appName: "Finder", last: now - 26 * 60 * min - 1 }),
  entry({ id: "m3", kind: "file", title: "/Users/me/Pictures/sunset.png", fileExt: "png", appName: "Finder", last: now - 26 * 60 * min - 2 }),
  entry({ id: "m4", kind: "file", title: "/Users/me/Pictures/IMG_0042.heic", fileExt: "heic", appName: "Finder", last: now - 26 * 60 * min - 3 }),
  entry({ id: "n", kind: "file", title: "/Users/me/Movies/demo.mp4", fileExt: "mp4", appName: "Finder", last: now - 27 * 60 * min }),
  entry({ id: "o", kind: "file", title: "/Users/me/Music/song.mp3", fileExt: "mp3", appName: "Finder", last: now - 28 * 60 * min }),
  entry({ id: "p3", kind: "file", title: "/Users/me/Projects/lumi/package.json", fileExt: "json", appName: "Finder", last: now - 29 * 60 * min + 2 }),
  entry({ id: "p2", kind: "file", title: "/Users/me/Documents/notes.md", fileExt: "md", appName: "Finder", last: now - 29 * 60 * min + 1 }),
  entry({ id: "p", kind: "file", title: "/Users/me/Sites/index.html", fileExt: "html", appName: "Finder", last: now - 29 * 60 * min }),
  entry({ id: "q", kind: "file", title: "/Users/me/Projects/", fileExt: "/", appName: "Finder", last: now - 30 * 60 * min }),
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
      const text = !row
        ? ""
        : row.kind === "file"
          ? (filePaths.get(row.id) ?? row.title)
          : `${row.title}\n\n(the full text of the copy would be here)`;
      const html =
        row?.kind === "rich"
          ? `<meta charset="utf-8"><div style="color: rgb(0, 0, 0); font-family: Georgia;">${row.title.replace(/</g, "&lt;")} 🎉</div><p style="color: rgb(34, 34, 34)">Some <b>bold</b>, <i>italic</i>, <s>struck</s>, <u>under</u> and <span style="color: rgb(220, 38, 38)">red</span> <span style="font-family: Menlo">mono</span> <a href="https://x.test">link</a>.</p><ul><li>one ✅</li><li>two</li></ul><img src="https://x.test/a.png"><script>parent.document.body.remove()</script>`
          : null;
      const ocr = row?.ocr && settings.ocr !== "false" ? ["Lumi", "Clipboard History", "Search history", ...Array.from({ length: 60 }, (_, i) => `Line ${i + 1} of a long read`)].join("\n") : null;
      const fileSize = row?.kind === "file" ? (row.title.endsWith(".pdf") ? 1_234_567 : 48_213_904) : null;
      const fileToken = row?.kind === "file" && /\.(pdf|png|heic|mp3|mp4|html|md|json)$/.test(row.title) ? row.title : null;
      return { text, html, ocr, fileSize, fileToken };
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
