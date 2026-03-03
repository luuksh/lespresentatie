#!/usr/bin/env python3
"""Local bridge to open local files from browser-safe localhost requests."""

from __future__ import annotations

import argparse
import json
import os
import subprocess
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse


class Handler(BaseHTTPRequestHandler):
    def _send(self, status: int, payload: dict):
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):  # noqa: N802
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def do_GET(self):  # noqa: N802
        parsed = urlparse(self.path)
        if parsed.path != "/open":
            self._send(404, {"ok": False, "error": "not_found"})
            return

        params = parse_qs(parsed.query or "")
        raw_path = (params.get("path") or [""])[0].strip()
        if not raw_path:
            self._send(400, {"ok": False, "error": "missing_path"})
            return

        file_path = Path(raw_path).expanduser()
        if not file_path.exists():
            self._send(404, {"ok": False, "error": "file_not_found", "path": str(file_path)})
            return

        try:
            if os.uname().sysname == "Darwin":
                subprocess.run(["open", str(file_path)], check=True)
            else:
                subprocess.run(["xdg-open", str(file_path)], check=True)
        except Exception as exc:  # pragma: no cover
            self._send(500, {"ok": False, "error": "open_failed", "detail": str(exc)})
            return

        self._send(200, {"ok": True, "path": str(file_path)})

    def log_message(self, format, *args):  # noqa: A003
        return


def main():
    parser = argparse.ArgumentParser(description="Open local files via localhost bridge.")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=17373)
    args = parser.parse_args()

    server = ThreadingHTTPServer((args.host, args.port), Handler)
    print(f"[local-file-bridge] Listening on http://{args.host}:{args.port}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()

