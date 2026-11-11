#!/usr/bin/env python3
"""Local preview server with a real 404.html response.

Usage:
    python serve.py
    python serve.py 8080

The production hosts (GitHub Pages / Vercel / Cloudflare Pages) serve
404.html automatically. This tiny server exists only so the local preview
matches that behaviour while taking the network screenshots.
"""

from __future__ import annotations

import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parent
NOT_FOUND_PAGE = ROOT / "404.html"


class PreviewHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def end_headers(self) -> None:
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def send_error(self, code, message=None, explain=None) -> None:
        if code == 404 and NOT_FOUND_PAGE.exists():
            body = NOT_FOUND_PAGE.read_bytes()
            self.send_response(404)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            if self.command != "HEAD":
                self.wfile.write(body)
            return
        super().send_error(code, message, explain)


def main() -> None:
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 4173
    server = ThreadingHTTPServer(("127.0.0.1", port), PreviewHandler)
    print(f"Serving {ROOT} at http://127.0.0.1:{port}/")
    print("Custom 404 active. Press Ctrl+C to stop.")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopped.")
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
