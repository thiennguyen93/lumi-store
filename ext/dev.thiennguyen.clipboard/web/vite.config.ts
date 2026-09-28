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
// - two inputs: `panel.html`, the name the manifest's [[window]] points
//   at, and `about.html`, its `about` page.
export default defineConfig({
  base: "./",
  plugins: [react()],
  build: {
    outDir: "dist",
    emptyOutDir: true,
    // WKWebView on the oldest macOS Lumi supports.
    target: "safari16",
    modulePreload: { polyfill: false },
    rollupOptions: {
      input: { panel: "panel.html", about: "about.html" },
    },
  },
});
