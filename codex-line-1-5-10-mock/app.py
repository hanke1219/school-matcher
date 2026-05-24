from __future__ import annotations

import base64
import hmac
import json
import os
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse

from matching_engine import rank_schools
from refresh_engine import build_refresh_report
from schools_data import SCHOOLS


ROOT = Path(__file__).resolve().parent
STATIC_DIR = ROOT / "static"
AUTH_USERNAME = os.environ.get("BASIC_AUTH_USERNAME", "")
AUTH_PASSWORD = os.environ.get("BASIC_AUTH_PASSWORD", "")


def auth_enabled() -> bool:
    return bool(AUTH_USERNAME and AUTH_PASSWORD)


class AppHandler(SimpleHTTPRequestHandler):
    def do_GET(self) -> None:
        parsed = urlparse(self.path)
        if parsed.path == "/api/health":
            self.send_json({"ok": True})
            return

        if not self.is_authorized():
            self.request_auth()
            return

        if parsed.path == "/api/schools":
            self.send_json({"schools": SCHOOLS})
            return

        if parsed.path in {"/", "/index.html"}:
            self.path = "/static/index.html"
        super().do_GET()

    def do_POST(self) -> None:
        parsed = urlparse(self.path)
        if not self.is_authorized():
            self.request_auth()
            return

        if parsed.path == "/api/refresh-report":
            try:
                self.send_json(build_refresh_report(SCHOOLS))
            except OSError as exc:
                self.send_json({"error": str(exc)}, status=500)
            return

        if parsed.path != "/api/match":
            self.send_error(404, "Not Found")
            return

        try:
            length = int(self.headers.get("Content-Length", "0"))
            payload = json.loads(self.rfile.read(length) or b"{}")
            results = rank_schools(payload, SCHOOLS)
            self.send_json({"results": results, "total_count": len(SCHOOLS)})
        except (json.JSONDecodeError, ValueError, TypeError) as exc:
            self.send_json({"error": str(exc)}, status=400)

    def translate_path(self, path: str) -> str:
        path = urlparse(path).path
        if path.startswith("/static/"):
            relative = path.removeprefix("/static/")
            return str(STATIC_DIR / relative)
        return str(ROOT / path.lstrip("/"))

    def send_json(self, payload: dict, status: int = 200) -> None:
        encoded = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(encoded)))
        self.end_headers()
        self.wfile.write(encoded)

    def is_authorized(self) -> bool:
        if not auth_enabled():
            return True
        header = self.headers.get("Authorization", "")
        if not header.startswith("Basic "):
            return False
        try:
            decoded = base64.b64decode(header.removeprefix("Basic ").strip()).decode("utf-8")
        except (ValueError, UnicodeDecodeError):
            return False
        username, separator, password = decoded.partition(":")
        return bool(separator) and hmac.compare_digest(username, AUTH_USERNAME) and hmac.compare_digest(password, AUTH_PASSWORD)

    def request_auth(self) -> None:
        self.send_response(401)
        self.send_header("WWW-Authenticate", 'Basic realm="School Matcher"')
        self.send_header("Content-Type", "text/plain; charset=utf-8")
        self.end_headers()
        self.wfile.write("Authentication required".encode("utf-8"))

    def log_message(self, format: str, *args: object) -> None:
        return


def run(port: int = 8000) -> None:
    server = ThreadingHTTPServer(("0.0.0.0", port), AppHandler)
    print(f"Smart school matcher running at http://localhost:{port}")
    server.serve_forever()


if __name__ == "__main__":
    run(int(os.environ.get("PORT", "8000")))
