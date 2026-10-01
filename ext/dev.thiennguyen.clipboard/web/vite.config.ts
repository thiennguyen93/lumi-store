import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";

/** Lumi's own page stylesheet: from the Lumi checkout beside this repo, as
 *  scripts/preview_ui.py finds it, or wherever `LUMI_CSS` says. */
const LUMI_CSS =
  process.env.LUMI_CSS ?? fileURLToPath(new URL("../../../../lumi/src-tauri/src/ext/lumi.css", import.meta.url));

/** The pages Lumi draws inside a pane — the settings-page and the [[page]]
 *  tab — which Lumi puts lumi.css first in. The two windows link it
 *  themselves. */
const PANE_PAGES = new Set(["/settings.html", "/dashboard.html"]);

/**
 * `pnpm dev` with Lumi's sheet, as Lumi serves the pages. Without it every
 * page drew here without the rules Lumi puts under it — an input's
 * `width: 100%`, a button's border — so a page could look right here and
 * wrong in Lumi: the ⌘K menu's filter ran 6px past the menu's edge in Lumi
 * only. Read on every request, so an edit to lumi.css shows on a reload.
 */
function lumiSheet(): Plugin {
  return {
    name: "lumi-sheet",
    apply: "serve",
    configureServer(server) {
      if (!existsSync(LUMI_CSS)) {
        server.config.logger.warn(`lumi.css not found at ${LUMI_CSS}: pages draw without Lumi's sheet (set LUMI_CSS).`);
        return;
      }
      server.middlewares.use("/__lumi__/lumi.css", (_req, res) => {
        res.setHeader("Content-Type", "text/css; charset=utf-8");
        res.setHeader("Cache-Control", "no-store");
        res.end(readFileSync(LUMI_CSS));
      });
    },
    transformIndexHtml: (_html, { path }) =>
      PANE_PAGES.has(path)
        ? [{ tag: "link", attrs: { rel: "stylesheet", href: "/__lumi__/lumi.css" }, injectTo: "head-prepend" }]
        : undefined,
  };
}

// The store runs `pnpm run build` and ships `dist/` as the package's ui/.
//
// Three settings exist for Lumi rather than for Vite:
// - `base: "./"`: the page is served from `lumi-ext://<label>/`, and an
//   absolute `/assets/…` would still resolve, but relative paths keep the
//   bundle working when opened from anywhere else (the store's review of a
//   built tree, a file:// look while debugging).
// - no module-preload polyfill: it is the one piece of Vite's output that
//   can be emitted as an inline <script>, and the page's CSP
//   (`default-src 'self'`) refuses inline scripts outright.
// - four inputs: `panel.html` and `welcome.html`, the names the manifest's
//   two [[window]]s point at, `dashboard.html`, its [[page]] tab, and
//   `settings.html`, its settings-page. About is Lumi's own, composed from
//   the manifest.
export default defineConfig({
  base: "./",
  plugins: [react(), lumiSheet()],
  build: {
    outDir: "dist",
    emptyOutDir: true,
    // WKWebView on the oldest macOS Lumi supports.
    target: "safari16",
    modulePreload: { polyfill: false },
    // pdf.js' standard fonts are fetched, and a `data:` URL is not 'self':
    // they are always files. Their licences keep a `.txt` name beside them.
    assetsInlineLimit: (file) => (file.includes("/pdfjs-dist/standard_fonts/") ? false : undefined),
    rollupOptions: {
      input: { panel: "panel.html", welcome: "welcome.html", dashboard: "dashboard.html", settings: "settings.html" },
      output: {
        assetFileNames: ({ names }) =>
          names[0]?.startsWith("LICENSE_") ? "assets/[name]-[hash].txt" : "assets/[name]-[hash][extname]",
      },
    },
  },
});
