import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { DEFAULT_LOOK } from "./src/looks.ts";

/** Lumi's own sheet in a Lumi checkout beside this repository — the file
 *  the bridge serves at `/__lumi__/lumi.css` and puts first in every page
 *  Lumi embeds in its Extensions pane. */
const LUMI_CSS = new URL("../../../../lumi/src-tauri/src/ext/lumi.css", import.meta.url).pathname;

/** The Settings window's own stylesheet, for the mock's hand-drawn frame
 *  around the page: the page itself never sees it, as in Lumi, where it is
 *  a child webview wearing lumi.css alone. */
const APP_CSS = new URL("../../../../lumi/src/App.css", import.meta.url).pathname;

/** The package's own icon, above this project's root, for the mock's
 *  header: the dev server serves only what it is allowed to. */
const ICON = new URL("../icon.svg", import.meta.url).pathname;

/** `pnpm dev` only: `/__lumi__/lumi.css` and `/__mock__/app.css` answered
 *  with those files through Vite's own `/@fs/`. Never part of a build. */
function lumiSheets(): Plugin {
  return {
    name: "lumi-sheets",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use((req, _res, next) => {
        const request = req as unknown as { url?: string };
        const path = request.url?.split("?")[0];
        if (path === "/__lumi__/lumi.css") request.url = `/@fs${LUMI_CSS}`;
        if (path === "/__mock__/app.css") request.url = `/@fs${APP_CSS}`;
        next();
      });
    },
  };
}

/** What the dev server's middleware is handed: just enough of Node's
 *  request and response, declared here rather than adding @types/node to a
 *  project whose own code runs only in a browser. */
interface Request {
  url?: string;
  method?: string;
  on(event: "data" | "end", listener: (chunk?: unknown) => void): void;
}
interface Response {
  statusCode: number;
  setHeader(name: string, value: string): void;
  end(body?: string): void;
}

function bodyOf(request: Request): Promise<string> {
  return new Promise((done) => {
    let body = "";
    request.on("data", (chunk) => (body += String(chunk)));
    request.on("end", () => done(body));
  });
}

/** `pnpm dev` only: the two ways the page keeps anything in Lumi, played by
 *  the dev server and kept in files under Vite's cache, so they outlive a
 *  reload, a restart of the server and a new browser alike.
 *
 *  - `GET` / `PUT /__lumi__/settings`: the extension's `[[settings]]` (the
 *    theme), which the mock's Settings tab saves and the page reads.
 *  - `POST /__lumi__/call`: in Lumi, a string handed to the component's
 *    `run_ui`, which keeps the practice state and the presets in the
 *    extension's own storage (`lumi::storage`) and answers. Here the same
 *    two calls — `{"op":"load"}`, `{"op":"save","saved":…}` — are answered
 *    from a file. A call naming a `store` (the page's `?store=`, for a test)
 *    is kept apart, so checking the mock never writes over what somebody
 *    set while using it.
 *
 *  Never part of a build. */
function lumiBridge(): Plugin {
  return {
    name: "lumi-bridge",
    apply: "serve",
    configureServer(server) {
      const dir = join(server.config.cacheDir, "mock-lumi");
      const fileOf = (name: string) => join(dir, `${name.replace(/[^a-z0-9-]/gi, "") || "main"}.json`);
      const read = (name: string): Record<string, unknown> => {
        try {
          return existsSync(fileOf(name)) ? (JSON.parse(readFileSync(fileOf(name), "utf8")) as Record<string, unknown>) : {};
        } catch {
          return {};
        }
      };
      const write = (name: string, value: Record<string, unknown>) => {
        mkdirSync(dir, { recursive: true });
        writeFileSync(fileOf(name), JSON.stringify(value, null, 2));
      };
      server.middlewares.use((req, res, next) => {
        const request = req as unknown as Request;
        const response = res as unknown as Response;
        const path = request.url?.split("?")[0];
        const json = (value: unknown) => {
          response.setHeader("Content-Type", "application/json");
          response.end(JSON.stringify(value));
        };
        const refuse = (why: string) => {
          response.statusCode = 400;
          response.end(why);
        };
        if (path === "/__lumi__/settings") {
          const settings = () => ({ look: DEFAULT_LOOK, ...read("settings") });
          if (request.method !== "PUT") return json(settings());
          void bodyOf(request).then((body) => {
            try {
              const sent = JSON.parse(body) as Record<string, unknown>;
              const held = settings() as Record<string, unknown>;
              // Undeclared fields are dropped, as Lumi drops them.
              for (const [name, value] of Object.entries(sent)) if (name in held) held[name] = String(value);
              write("settings", held);
              json(held);
            } catch {
              refuse("Not JSON.");
            }
          });
          return;
        }
        if (path === "/__lumi__/call" && request.method === "POST") {
          void bodyOf(request).then((body) => {
            try {
              const call = JSON.parse(body) as { op?: string; store?: string; saved?: unknown };
              const name = `practice-${call.store ?? "main"}`;
              if (call.op === "load") return json(read(name).saved ?? null);
              if (call.op === "save" && call.saved && typeof call.saved === "object") {
                write(name, { saved: call.saved });
                return json({ ok: true });
              }
              refuse("Unknown call.");
            } catch {
              refuse("Not JSON.");
            }
          });
          return;
        }
        next();
      });
    },
  };
}

// The store runs `pnpm run build` and ships `dist/` as the package's ui/.
// Only the two pages are inputs — the Metronome tab and the Settings tab:
// `mock.html`, the hand-drawn Settings window around them, is served by
// `pnpm dev` and never built, so it can never ship. `base: "./"` and no module-preload polyfill: relative paths,
// and no inline <script> under the page's CSP (`default-src 'self'`).
export default defineConfig({
  base: "./",
  plugins: [react(), lumiSheets(), lumiBridge()],
  server: { port: 5291, fs: { allow: [".", LUMI_CSS, APP_CSS, ICON] } },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    target: "safari16",
    modulePreload: { polyfill: false },
    assetsInlineLimit: 0,
    rollupOptions: { input: { metronome: "metronome.html", settings: "settings.html" } },
  },
});
