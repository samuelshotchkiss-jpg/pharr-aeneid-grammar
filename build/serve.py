#!/usr/bin/env python3
"""Dev static server for the edition, with browser caching disabled.

Why this exists
---------------
The stock `python -m http.server` sends `Last-Modified` but no `Cache-Control`,
so Chromium heuristically caches JS/CSS and serves them **stale** on the next
navigation. In practice that means: you edit `js/tooltips.js` (or a stylesheet),
reload the preview, and the OLD file still runs -- verification silently tests
the previous code. Worse, `index.html?v=<ts>` busts only the HTML, and
`location.reload()` does not revalidate the `<script src="js/...">` subresource,
so the usual tricks don't help for JS.

This server sends `Cache-Control: no-store` on every response, so a plain reload
always fetches fresh. Wire it into `.claude/launch.json` (already done) and the
whole team of parallel sessions gets reliable previews with zero per-session
fiddling. See CLAUDE.md -> "Local preview & verification".

Usage
-----
    python build/serve.py [port]        # default 8765

Serves the repository root (this file's grandparent dir) regardless of the
current working directory, so it behaves the same however the harness launches
it. Dependency-free (stdlib only), matching the project's tooling conventions.
"""
import os
import sys
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DEFAULT_PORT = 8765


class NoCacheHandler(SimpleHTTPRequestHandler):
    """SimpleHTTPRequestHandler that forbids caching of every response."""

    def end_headers(self):
        self.send_header("Cache-Control", "no-store, must-revalidate")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()

    # keep the console quiet-ish; still surface each request for preview logs
    def log_message(self, fmt, *args):
        sys.stderr.write("%s - %s\n" % (self.address_string(), fmt % args))


def main():
    port = DEFAULT_PORT
    if len(sys.argv) > 1:
        try:
            port = int(sys.argv[1])
        except ValueError:
            sys.stderr.write("usage: python build/serve.py [port]\n")
            return 2
    os.chdir(ROOT)
    httpd = ThreadingHTTPServer(("", port), NoCacheHandler)
    sys.stdout.write(
        "Serving %s at http://127.0.0.1:%d/ (Cache-Control: no-store)\n" % (ROOT, port)
    )
    sys.stdout.flush()
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        httpd.server_close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
