import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

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
  plugins: [react()],
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
