#!/usr/bin/env python3
"""Serve one extension's ui/ with a stand-in for Lumi's bridge, for a browser.

An extension page is written against `/__lumi__/` — Lumi's stylesheet, the
settings, `call` — which only exists inside Lumi. This answers those routes
well enough for a page to draw as it does there, so it can be looked at and
photographed for the store's `screenshots` without a Lumi build:

  GET  /__lumi__/lumi.css   Lumi's own page stylesheet (--lumi-css)
  GET  /__lumi__/settings   every [[settings]] field at its manifest default
  PUT  /__lumi__/settings   accepted and kept for this run
  POST /__lumi__/call       what scripts/preview/<id>.json answers for the
                            request's `kind`, else {} — there is no wasm
  GET  /__lumi__/shortcuts  no rows, shortcuts on
  GET  /__preview__/?page=about.html&theme=light
                            a page Lumi draws inside a pane (About, Settings,
                            a [[page]] tab), framed with the pane's inset and
                            window colour — those pages leave both to Lumi

Everything else is a file under the crate's ui/. Bound to 127.0.0.1: it is a
preview, never something to reach from another machine.

  python3 scripts/preview_ui.py ext/dev.thiennguyen.sample/sample --port 5190

A page Lumi draws in a pane is told its theme as `?theme=light|dark`; add
that to the URL to see either.
"""

import argparse
import http.server
import json
import tomllib
from functools import partial
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DEFAULT_LUMI_CSS = ROOT.parent / "lumi" / "src-tauri" / "src" / "ext" / "lumi.css"


# A pane page in Lumi sits inside the Settings window's content inset, on
# the window's own colour (`Canvas`), with lumi.css injected — the frame
# gives it the same three so a screenshot shows what Lumi shows.
FRAME = """<!doctype html>
<html data-theme="{theme}"><head><meta charset="utf-8"><title>{page}</title>
<style>
  :root {{ color-scheme: {theme}; }}
  html, body {{ margin: 0; height: 100%; background: Canvas; }}
  iframe {{ border: 0; width: 100%; height: 100%; box-sizing: border-box; padding: 20px 24px; }}
</style></head>
<body><iframe src="/{page}?theme={theme}"></iframe></body></html>
"""


def handler_for(ui_dir: Path, lumi_css: bytes, settings: dict, calls: dict):
    class Bridge(http.server.SimpleHTTPRequestHandler):
        def _json(self, body, status=200):
            data = json.dumps(body).encode()
            self.send_response(status)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)

        def _body(self) -> dict:
            length = int(self.headers.get("Content-Length") or 0)
            try:
                return json.loads(self.rfile.read(length) or b"{}")
            except json.JSONDecodeError:
                return {}

        def do_GET(self):
            path = self.path.split("?", 1)[0]
            if path == "/__lumi__/lumi.css":
                self.send_response(200)
                self.send_header("Content-Type", "text/css")
                self.send_header("Content-Length", str(len(lumi_css)))
                self.end_headers()
                self.wfile.write(lumi_css)
            elif path == "/__lumi__/settings":
                self._json(settings)
            elif path == "/__lumi__/shortcuts":
                self._json({"on": True, "commands": [], "ess": []})
            elif path == "/__preview__/":
                query = dict(
                    pair.split("=", 1)
                    for pair in (self.path.split("?", 1) + [""])[1].split("&")
                    if "=" in pair
                )
                theme = "dark" if query.get("theme") == "dark" else "light"
                page = query.get("page", "index.html")
                if not (ui_dir / page).is_file() or ".." in page:
                    self.send_error(404)
                    return
                data = FRAME.format(theme=theme, page=page).encode()
                self.send_response(200)
                self.send_header("Content-Type", "text/html; charset=utf-8")
                self.send_header("Content-Length", str(len(data)))
                self.end_headers()
                self.wfile.write(data)
            elif path.endswith(".html") and "theme=" in self.path:
                # A pane page, as Lumi serves one: lumi.css first (so every
                # rule of the page's own wins) and the theme on the root.
                file = (ui_dir / path.lstrip("/")).resolve()
                if not file.is_file() or not str(file).startswith(str(ui_dir.resolve())):
                    self.send_error(404)
                    return
                theme = "dark" if "theme=dark" in self.path else "light"
                head = (
                    '<link rel="stylesheet" href="/__lumi__/lumi.css">'
                    f'<script>document.documentElement.dataset.theme = "{theme}";</script>'
                )
                html = file.read_text()
                at = html.find("<head>")
                html = html[: at + 6] + head + html[at + 6 :] if at >= 0 else head + html
                data = html.encode()
                self.send_response(200)
                self.send_header("Content-Type", "text/html; charset=utf-8")
                self.send_header("Content-Length", str(len(data)))
                self.end_headers()
                self.wfile.write(data)
            else:
                super().do_GET()

        def do_PUT(self):
            if self.path.split("?", 1)[0] == "/__lumi__/settings":
                settings.update(self._body())
                self._json(settings)
            else:
                self.send_error(404)

        def do_POST(self):
            if self.path.split("?", 1)[0] == "/__lumi__/call":
                self._json(calls.get(str(self._body().get("kind", "")), {}))
            else:
                self.send_error(404)

    return partial(Bridge, directory=str(ui_dir))


def main():
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("crate", help="the directory holding manifest.toml and ui/")
    parser.add_argument("--port", type=int, default=5190)
    parser.add_argument("--lumi-css", type=Path, default=DEFAULT_LUMI_CSS)
    args = parser.parse_args()

    crate = (ROOT / args.crate).resolve()
    with open(crate / "manifest.toml", "rb") as f:
        manifest = tomllib.load(f)
    settings = {
        field["name"]: field["default"]
        for field in manifest.get("settings", [])
        if "name" in field and "default" in field
    }
    extension_id = manifest.get("extension", {}).get("id", "")
    calls_path = ROOT / "scripts" / "preview" / f"{extension_id}.json"
    calls = json.loads(calls_path.read_text()) if calls_path.is_file() else {}
    lumi_css = args.lumi_css.read_bytes() if args.lumi_css.is_file() else b""
    if not lumi_css:
        print(f"note: no lumi.css at {args.lumi_css}; pages draw without Lumi's look")

    server = http.server.ThreadingHTTPServer(
        ("127.0.0.1", args.port), handler_for(crate / "ui", lumi_css, settings, calls)
    )
    print(f"serving {crate / 'ui'} at http://127.0.0.1:{args.port}/")
    server.serve_forever()


if __name__ == "__main__":
    main()
