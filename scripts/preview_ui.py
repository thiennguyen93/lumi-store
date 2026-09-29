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
  GET  /__promo__/?shot=1   a store picture: shot 1 of scripts/preview/promo/
                            <id>.json — a headline over the extension's
                            colour, the page in a Lumi window, a callout —
                            for scripts/screenshot.mjs to take at 1280×800

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


# A store picture, the way stores draw them: the extension's own colour
# (`color`, the icon's), a headline and one line under it, the page in a
# Lumi window running off the bottom edge, and a callout card over the
# window's corner pointing at the one thing the picture is about. The page
# is the iframe — the one scene scripts reach into.
PROMO = """<!doctype html>
<html><head><meta charset="utf-8"><title>{headline}</title>
<style>
  * {{ box-sizing: border-box; }}
  html, body {{ margin: 0; width: 1280px; height: 800px; overflow: hidden; }}
  body {{
    font-family: -apple-system, BlinkMacSystemFont, "SF Pro Display", system-ui, sans-serif;
    color: #fff;
    background:
      radial-gradient(900px 520px at 50% -10%, color-mix(in srgb, {color} 55%, transparent), transparent 70%),
      radial-gradient(700px 500px at 100% 100%, color-mix(in srgb, {color} 35%, transparent), transparent 70%),
      linear-gradient(160deg, color-mix(in srgb, {color} 30%, #0b1026), #070b1a);
    position: relative;
  }}
  h1 {{
    margin: 0; padding-top: 72px; text-align: center;
    font-size: 52px; font-weight: 700; letter-spacing: -0.01em;
    color: color-mix(in srgb, {color} 45%, #fff);
  }}
  p.sub {{
    margin: 18px auto 0; max-width: 980px; text-align: center;
    font-size: 26px; line-height: 1.45; color: rgba(255, 255, 255, 0.88);
  }}
  .window {{
    position: absolute; left: 140px; top: 300px; width: 1000px; height: 560px;
    border-radius: 12px; overflow: hidden;
    background: {canvas};
    box-shadow: 0 30px 80px rgba(0, 0, 0, 0.45), 0 0 0 1px rgba(255, 255, 255, 0.08);
  }}
  .bar {{
    height: 38px; display: flex; align-items: center; gap: 8px; padding: 0 14px;
    background: {bar}; border-bottom: 1px solid rgba(128, 128, 128, 0.22);
    color: {ink}; font-size: 13px; font-weight: 600;
  }}
  .dot {{ width: 12px; height: 12px; border-radius: 50%; }}
  .bar .title {{ margin-left: 10px; }}
  .bar .tab {{ margin-left: auto; font-weight: 400; opacity: 0.6; }}
  iframe {{ border: 0; width: 100%; height: calc(100% - 38px); display: block; padding: {inset}; }}
  .callout {{
    position: absolute; right: 60px; bottom: 44px; width: 440px;
    border-radius: 16px; padding: 18px 20px;
    background: #fff; color: #1d1d1f;
    box-shadow: 0 24px 60px rgba(0, 0, 0, 0.4), 0 0 0 1px rgba(0, 0, 0, 0.06);
  }}
  .callout .head {{ display: flex; align-items: center; gap: 10px; font-size: 20px; font-weight: 600; }}
  .callout .head img {{ width: 32px; height: 32px; }}
  .callout .label {{ margin-top: 12px; font-size: 16px; font-weight: 600; color: #8a8a8e; }}
  .callout .body {{ margin-top: 6px; font-size: 21px; line-height: 1.4; }}
  .callout .body b {{ color: {color}; }}
  .mark {{ position: absolute; left: 28px; bottom: 26px; width: 52px; height: 52px; }}
</style></head>
<body>
  <h1>{headline}</h1>
  <p class="sub">{sub}</p>
  <div class="window">
    <div class="bar">
      <span class="dot" style="background:#ff5f57"></span>
      <span class="dot" style="background:#febc2e"></span>
      <span class="dot" style="background:#28c840"></span>
      <span class="title">{name}</span>
      <span class="tab">{window_title}</span>
    </div>
    <iframe src="/{page}?theme={theme}"></iframe>
  </div>
  {callout}
  <img class="mark" src="/__icon__" alt="">
</body></html>
"""

CALLOUT = """<div class="callout">
    <div class="head"><img src="/__icon__" alt="">{title}</div>
    <div class="label">{label}</div>
    <div class="body">{body}</div>
  </div>"""


def promo_page(spec: dict, n: int, name: str) -> str:
    """Shot `n` (from 1) of a promo spec, as the page to photograph. The
    spec is the store maintainer's own file; its strings are written in as
    they are, markup included, so a callout can bold the word it is about."""
    shot = spec["shots"][n - 1]
    dark = shot.get("theme") == "dark"
    callout = shot.get("callout")
    return PROMO.format(
        headline=shot["headline"],
        sub=shot.get("sub", ""),
        color=spec.get("color", "#378add"),
        canvas="#1e1e1e" if dark else "#ffffff",
        bar="#2a2a2c" if dark else "#f4f4f5",
        ink="#e8e8e8" if dark else "#1d1d1f",
        name=shot.get("window", name),
        window_title=shot.get("tab", ""),
        page=shot["page"],
        theme="dark" if dark else "light",
        inset=shot.get("inset", "20px 24px"),
        callout=CALLOUT.format(
            title=callout.get("title", name),
            label=callout.get("label", ""),
            body=callout.get("body", ""),
        )
        if callout
        else "",
    )


def handler_for(ui_dir: Path, lumi_css: bytes, settings: dict, calls: dict, promo: dict, name: str, icon: bytes):
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
            elif path == "/__icon__":
                self.send_response(200)
                self.send_header("Content-Type", "image/svg+xml")
                self.send_header("Content-Length", str(len(icon)))
                self.end_headers()
                self.wfile.write(icon)
            elif path == "/__promo__/":
                query = dict(
                    pair.split("=", 1)
                    for pair in (self.path.split("?", 1) + [""])[1].split("&")
                    if "=" in pair
                )
                shots = promo.get("shots", [])
                n = int(query.get("shot", "1")) if query.get("shot", "1").isdigit() else 0
                if not 1 <= n <= len(shots):
                    self.send_error(404)
                    return
                data = promo_page(promo, n, name).encode()
                self.send_response(200)
                self.send_header("Content-Type", "text/html; charset=utf-8")
                self.send_header("Content-Length", str(len(data)))
                self.end_headers()
                self.wfile.write(data)
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
    promo_path = ROOT / "scripts" / "preview" / "promo" / f"{extension_id}.json"
    promo = json.loads(promo_path.read_text()) if promo_path.is_file() else {}
    icon_path = crate / "icon.svg"
    icon = icon_path.read_bytes() if icon_path.is_file() else b""
    name = manifest.get("extension", {}).get("name", extension_id)
    lumi_css = args.lumi_css.read_bytes() if args.lumi_css.is_file() else b""
    if not lumi_css:
        print(f"note: no lumi.css at {args.lumi_css}; pages draw without Lumi's look")

    server = http.server.ThreadingHTTPServer(
        ("127.0.0.1", args.port), handler_for(crate / "ui", lumi_css, settings, calls, promo, name, icon)
    )
    print(f"serving {crate / 'ui'} at http://127.0.0.1:{args.port}/")
    server.serve_forever()


if __name__ == "__main__":
    main()
