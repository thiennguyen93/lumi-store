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
  POST /__lumi__/download   {"url"}: one GET of a public http(s) URL, kept
                            for this run as a blob — {"blob", "type", "size",
                            "url"}, as Lumi answers it (the page has no
                            network of its own, and a download is not held
                            to the other site's CORS). "most" takes only the
                            first that many bytes (cut, not refused;
                            "partial" says so), and "keep": false answers the
                            bytes themselves, at most 8 MB, instead of a blob
                            — Lumi 1.44.0's rules, `download_ask`'s
  GET  /__lumi__/blob/<id>  a blob downloaded or kept here, as opaque bytes
  PUT  /__lumi__/blob       the body kept as a blob: {"blob"}
                            Blobs are files under the system's temp folder,
                            one folder per extension, so what a page keeps
                            outlives a restart, as Lumi's storage does
  GET  /__preview__/?page=about.html&theme=light
                            a page Lumi draws inside a pane (About, Settings,
                            a [[page]] tab), framed with the pane's inset and
                            window colour — those pages leave both to Lumi
  GET  /__promo__/?shot=1   a store picture: shot 1 of scripts/preview/promo/
                            <id>.json (or --promo) — a headline over the
                            extension's colour, the page in a Lumi window, a
                            callout — for scripts/screenshot.mjs to take at
                            1280×800

Everything else is a file under the crate's ui/ — or, with --proxy, whatever
a dev server answers for it: an extension with a built front end (a `web`
entry) runs its own dev server with its own stand-in for the bridge, and the
promo page has to share its origin for a scene script to reach into it.

Bound to 127.0.0.1: it is a preview, never something to reach from another
machine.

  python3 scripts/preview_ui.py ext/dev.thiennguyen.sample/sample --port 5190

A page Lumi draws in a pane is told its theme as `?theme=light|dark`; add
that to the URL to see either. In Lumi the page's `prefers-color-scheme`
always agrees with it — the Appearance setting is put on every window, and a
webview's media query follows its window — but a browser's follows the
system, and an iframe cannot be told otherwise. So set the browser's colour
scheme to match (DevTools → Rendering), or a page that keys on the media
query draws wrong here and only here; the frame says so when they differ.

A private entry keeps its promo spec in its own repo, beside the pictures,
so this public one holds nothing of it: `--promo <its file>`.
"""

import argparse
import http.server
import ipaddress
import json
import secrets
import re
import socket
import ssl
import tempfile
import tomllib
import urllib.error
import urllib.parse
import urllib.request
from functools import partial
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DEFAULT_LUMI_CSS = ROOT.parent / "lumi" / "src-tauri" / "src" / "ext" / "lumi.css"

# Python from python.org ships without CA certificates until its "Install
# Certificates" step is run; macOS keeps its own bundle, so a download
# verifies against that rather than failing every https site.
_paths = ssl.get_default_verify_paths()
TLS = ssl.create_default_context(
    cafile="/etc/ssl/cert.pem"
    if not (_paths.cafile or Path(_paths.openssl_cafile).is_file()) and Path("/etc/ssl/cert.pem").is_file()
    else None
)


# A pane page in Lumi sits inside the Settings window's content inset, on
# the window's own colour (`Canvas`), with lumi.css injected — the frame
# gives it the same three so a screenshot shows what Lumi shows. And a line
# along the bottom while the browser's colour scheme is not `theme`: a pair
# Lumi never draws a page in (see the module's note on `?theme=`).
FRAME = """<!doctype html>
<html data-theme="{theme}"><head><meta charset="utf-8"><title>{page}</title>
<style>
  :root {{ color-scheme: {theme}; }}
  html, body {{ margin: 0; height: 100%; background: Canvas; }}
  iframe {{ border: 0; width: 100%; height: 100%; box-sizing: border-box; padding: 20px 24px; }}
  .mismatch {{
    position: fixed; left: 0; right: 0; bottom: 0; margin: 0; padding: 6px 12px;
    font: 12px/1.4 -apple-system, system-ui, sans-serif;
    background: #fff4d6; color: #5c4300; border-top: 1px solid #e0b84d;
  }}
</style></head>
<body><iframe src="/{page}?theme={theme}"></iframe>
<p class="mismatch" hidden>theme={theme}, but this browser's prefers-color-scheme is not {theme}.
Lumi always pairs the two, so anything here that follows the media query is not what Lumi shows.
Emulate {theme} in DevTools → Rendering to match.</p>
<script>
  const dark = matchMedia("(prefers-color-scheme: dark)");
  const mismatch = document.querySelector(".mismatch");
  const check = () => (mismatch.hidden = dark.matches === ("{theme}" === "dark"));
  dark.addEventListener("change", check);
  check();
</script></body></html>
"""


# A store picture, the way stores draw them: the extension's own colour
# (`color`, the icon's), a headline and one line under it, the page in a
# Lumi window running off the bottom edge, and a callout card over the
# window's corner pointing at the one thing the picture is about. The page
# is the iframe — the one scene scripts reach into. `data-theme` is the
# shot's theme, for scripts/screenshot.mjs to take it in.
PROMO = """<!doctype html>
<html data-theme="{theme}"><head><meta charset="utf-8"><title>{headline}</title>
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
    position: absolute; left: {left}px; top: {top}px; width: {width}px; height: {height}px;
    border-radius: {radius}px; overflow: hidden;
    background: {canvas};
    box-shadow: {shadow};
  }}
  .bar {{
    height: 38px; display: flex; align-items: center; gap: 8px; padding: 0 14px;
    background: {bar}; border-bottom: 1px solid rgba(128, 128, 128, 0.22);
    color: {ink}; font-size: 13px; font-weight: 600;
  }}
  .dot {{ width: 12px; height: 12px; border-radius: 50%; }}
  .lights {{ position: absolute; left: 20px; display: flex; gap: 8px; }}
  .bar .title {{ margin-left: 10px; }}
  .bar .tab {{ margin-left: auto; font-weight: 400; opacity: 0.6; }}
  /* The page's own scheme on the frame too: a dark page in a frame whose
     scheme is not dark gets an opaque backdrop from the browser, which a
     see-through (`transparent`) shot draws as a black box. */
  iframe {{ border: 0; width: 100%; height: calc(100% - {bar_height}px); display: block; padding: {inset}; zoom: {zoom}; color-scheme: {theme}; }}
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
    <div class="bar" {bar_hidden}>
      <span class="dot" style="background:#ff5f57"></span>
      <span class="dot" style="background:#febc2e"></span>
      <span class="dot" style="background:#28c840"></span>
      <span class="title">{name}</span>
      <span class="tab">{window_title}</span>
    </div>
    {lights}
    <iframe src="/{page}"></iframe>
  </div>
  {callout}
  <img class="mark" src="/__icon__" alt="" style="{mark_side}">
</body></html>
"""

CALLOUT = """<div class="callout" style="{side}">
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
    # A panel (`kind = "panel"` in a manifest) has no title bar and floats:
    # narrower, rounder, and the page draws its own header.
    panel = shot.get("frame") == "panel"
    # A window whose page is its title bar (`titlebar = "unified"`): no bar
    # drawn over it, and macOS's traffic lights drawn where Lumi puts them —
    # 20 points in, centred in the page's band (`band`, 52 by default).
    unified = shot.get("frame") == "unified"
    band = int(shot.get("band", 52))
    # A page drawn larger than Lumi draws it — a small panel, enlarged so it
    # reads at the store's size: `width` and `height` stay the page's own,
    # the frame grows round it.
    zoom = float(shot.get("zoom", 1))
    # A panel whose window is see-through (`material = "clear"`): only what
    # the page draws, on the picture's background.
    clear = bool(shot.get("transparent"))
    width = round(int(shot.get("width", 820 if panel else 1000)) * zoom)
    page = shot["page"]
    page += ("&" if "?" in page else "?") + f"theme={'dark' if dark else 'light'}"
    return PROMO.format(
        # The window leans away from the callout, so the card covers less
        # of what the picture is showing.
        left=int(shot["left"])
        if "left" in shot
        else (1280 - width) // 2
        + (0 if not callout else 60 if callout.get("side") == "left" else -60 if panel else 0),
        width=width,
        zoom=zoom,
        shadow="none" if clear else "0 30px 80px rgba(0, 0, 0, 0.45), 0 0 0 1px rgba(255, 255, 255, 0.08)",
        theme="dark" if dark else "light",
        height=round(int(shot.get("height", 560)) * zoom),
        top=int(shot.get("top", 300)),
        radius=16 if panel else 12,
        bar_hidden='style="display: none"' if panel or unified else "",
        bar_height=0 if panel or unified else 38,
        lights=f'<div class="lights" style="top: {band // 2 - 6}px">'
        '<span class="dot" style="background:#ff5f57"></span>'
        '<span class="dot" style="background:#febc2e"></span>'
        '<span class="dot" style="background:#28c840"></span></div>'
        if unified
        else "",
        headline=shot["headline"],
        sub=shot.get("sub", ""),
        color=spec.get("color", "#378add"),
        # A dark page's own Canvas, so its inset and the window are one colour.
        canvas="transparent" if clear else "#121212" if dark else "#ffffff",
        mark_side="left: auto; right: 28px" if callout and callout.get("side") == "left" else "",
        bar="#1c1c1e" if dark else "#f4f4f5",
        ink="#e8e8e8" if dark else "#1d1d1f",
        name=shot.get("window", name),
        window_title=shot.get("tab", ""),
        page=page,
        inset=shot.get("inset", "20px 24px"),
        callout=CALLOUT.format(
            side="left: 60px; right: auto" if callout.get("side") == "left" else "",
            title=callout.get("title", name),
            label=callout.get("label", ""),
            body=callout.get("body", ""),
        )
        if callout
        else "",
    )


def handler_for(
    ui_dir: Path,
    lumi_css: bytes,
    settings: dict,
    calls: dict,
    promo: dict,
    name: str,
    icon: bytes,
    proxy: str,
    blob_dir: Path,
):
    # Blobs, by id: a file each in `blob_dir`. An id is this server's own
    # hex, so a path never comes from the page.
    blob_id = re.compile(r"^[0-9a-f]{32}$")

    def keep_blob(data: bytes) -> str:
        blob = secrets.token_hex(16)
        (blob_dir / blob).write_bytes(data)
        return blob

    class Bridge(http.server.SimpleHTTPRequestHandler):
        def end_headers(self):
            # A preview is for files being edited: always ask again, so an
            # edit shows on the next load rather than after the cache gives up.
            self.send_header("Cache-Control", "no-cache")
            super().end_headers()

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
            elif path.startswith("/__lumi__/blob/"):
                blob = path[len("/__lumi__/blob/"):]
                if not blob_id.match(blob) or not (blob_dir / blob).is_file():
                    self.send_error(404)
                    return
                data = (blob_dir / blob).read_bytes()
                self.send_response(200)
                self.send_header("Content-Type", "application/octet-stream")
                self.send_header("X-Content-Type-Options", "nosniff")
                self.send_header("Content-Length", str(len(data)))
                self.end_headers()
                self.wfile.write(data)
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
            elif path.endswith(".html") and "theme=" in self.path and not proxy:
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
            elif proxy:
                self._forward()
            else:
                super().do_GET()

        def _forward(self, method: str = "GET", body: bytes | None = None):
            """The dev server's answer for this path, passed through as is —
            a `PUT` or `POST` this does not answer itself too, body and all:
            a dev server's own stand-in for the bridge keeps what a page
            writes (a picture as a blob) where its next `GET` finds it."""
            request = urllib.request.Request(proxy + self.path, data=body, method=method)
            if body is not None:
                request.add_header("Content-Type", self.headers.get("Content-Type", "application/octet-stream"))
            try:
                with urllib.request.urlopen(request, timeout=30) as upstream:
                    data = upstream.read()
                    status = upstream.status
                    kind = upstream.headers.get("Content-Type", "application/octet-stream")
            except urllib.error.HTTPError as err:
                data, status, kind = err.read(), err.code, err.headers.get("Content-Type", "text/plain")
            except urllib.error.URLError as err:
                self.send_error(502, f"the dev server at {proxy} did not answer: {err.reason}")
                return
            self.send_response(status)
            self.send_header("Content-Type", kind)
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)

        def _download(self, url: str, most: int | None = None, keep: bool = True):
            """Lumi's `POST /__lumi__/download`, near enough: public http(s)
            only — never this Mac or its network, the way Lumi refuses them
            unless Settings allows — at most a blob's 160 MB, and given up
            after 15 seconds without a byte, as Lumi gives up on one."""
            parsed = urllib.parse.urlparse(url)
            if parsed.scheme not in ("http", "https") or not parsed.hostname:
                self.send_error(400, 'a download is {"url": "https://..."}')
                return
            try:
                addresses = {info[4][0] for info in socket.getaddrinfo(parsed.hostname, None)}
            except socket.gaierror:
                self.send_error(502, f"{parsed.hostname} was not found")
                return
            if any(not ipaddress.ip_address(a.split("%")[0]).is_global for a in addresses):
                self.send_error(403, "a download reaches the internet, not this Mac's own network")
                return
            limit = 160 * 1024 * 1024 if keep else 8 * 1024 * 1024
            try:
                with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": "Lumi"}), timeout=15, context=TLS) as upstream:
                    # One byte past what is wanted — `most`, or the ceiling —
                    # says whether there was more; read no further, and hang up.
                    data = upstream.read((most or limit) + 1)
                    final = upstream.geturl()
            except (urllib.error.URLError, TimeoutError) as err:
                self.send_error(502, f"{url} did not answer: {getattr(err, 'reason', err)}")
                return
            partial = bool(most) and len(data) > most
            if most:
                data = data[:most]  # a head is cut, not refused
            elif len(data) > limit:
                self.send_error(502, f"That response is more than {limit} bytes")
                return
            if not keep:
                self.send_response(200)
                self.send_header("Content-Type", "application/octet-stream")
                self.send_header("X-Content-Type-Options", "nosniff")
                self.send_header("Content-Length", str(len(data)))
                self.end_headers()
                self.wfile.write(data)
                return
            blob = keep_blob(data)
            self._json({"blob": blob, "type": "application/octet-stream", "size": len(data), "url": final, "partial": partial}, 201)

        def _raw(self) -> bytes:
            return self.rfile.read(int(self.headers.get("Content-Length") or 0))

        def do_PUT(self):
            if self.path.split("?", 1)[0] == "/__lumi__/settings":
                settings.update(self._body())
                self._json(settings)
            elif self.path.split("?", 1)[0] == "/__lumi__/blob":
                length = int(self.headers.get("Content-Length") or 0)
                if not 0 < length <= 160 * 1024 * 1024:
                    self.send_error(400, "a blob is some bytes, at most 160 MB")
                    return
                self._json({"blob": keep_blob(self.rfile.read(length))}, 201)
            elif proxy:
                self._forward("PUT", self._raw())
            else:
                self.send_error(404)

        def do_POST(self):
            if self.path.split("?", 1)[0] == "/__lumi__/call":
                self._json(calls.get(str(self._body().get("kind", "")), {}))
            elif self.path.split("?", 1)[0] == "/__lumi__/download":
                asked = self._body()
                keep = asked.get("keep", True)
                most = asked.get("most")
                ceiling = 160 * 1024 * 1024 if keep else 8 * 1024 * 1024
                if not isinstance(keep, bool):
                    self.send_error(400, '"keep" is true or false')
                elif most is not None and (isinstance(most, bool) or not isinstance(most, int) or not 0 < most <= ceiling):
                    self.send_error(400, f'"most" is a number of bytes, more than none and at most {ceiling}')
                else:
                    self._download(str(asked.get("url", "")), most, keep)
            elif proxy:
                self._forward("POST", self._raw())
            else:
                self.send_error(404)

    return partial(Bridge, directory=str(ui_dir))


def main():
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("crate", help="the directory holding manifest.toml and ui/")
    parser.add_argument("--port", type=int, default=5190)
    parser.add_argument("--lumi-css", type=Path, default=DEFAULT_LUMI_CSS)
    parser.add_argument(
        "--promo",
        type=Path,
        default=None,
        help="the promo spec to draw /__promo__/ from, instead of scripts/preview/promo/<id>.json",
    )
    parser.add_argument(
        "--proxy",
        default="",
        help="a local dev server (http://127.0.0.1:PORT) to answer every page and asset from",
    )
    args = parser.parse_args()

    # A local dev server and nothing else: this is a preview, not a proxy.
    if args.proxy and not args.proxy.startswith(("http://127.0.0.1:", "http://localhost:")):
        parser.error("--proxy is a dev server on this machine: http://127.0.0.1:PORT")
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
    promo_path = args.promo or ROOT / "scripts" / "preview" / "promo" / f"{extension_id}.json"
    promo = json.loads(promo_path.read_text()) if promo_path.is_file() else {}
    icon_path = crate / "icon.svg"
    icon = icon_path.read_bytes() if icon_path.is_file() else b""
    name = manifest.get("extension", {}).get("name", extension_id)
    lumi_css = args.lumi_css.read_bytes() if args.lumi_css.is_file() else b""
    if not lumi_css:
        print(f"note: no lumi.css at {args.lumi_css}; pages draw without Lumi's look")

    blob_dir = Path(tempfile.gettempdir()) / "lumi-preview-blobs" / (extension_id or "extension")
    blob_dir.mkdir(parents=True, exist_ok=True)
    server = http.server.ThreadingHTTPServer(
        ("127.0.0.1", args.port),
        handler_for(crate / "ui", lumi_css, settings, calls, promo, name, icon, args.proxy.rstrip("/"), blob_dir),
    )
    print(f"serving {crate / 'ui'} at http://127.0.0.1:{args.port}/")
    server.serve_forever()


if __name__ == "__main__":
    main()
