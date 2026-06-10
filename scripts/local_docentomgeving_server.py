#!/usr/bin/env python3
"""Local development server with a small publish API for the studios."""

from __future__ import annotations

import json
import os
import subprocess
import sys
import tempfile
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
MAX_BODY_BYTES = 20 * 1024 * 1024
AUTO_GIT_PUSH_ENV = "KLASSENPLATTEGROND_AUTO_GIT_PUSH"
PUBLIC_PORTAL_FILES = [
    "index.html",
    "css/internal-shell.css",
    "leerlingen.html",
    "docs/leerlingen.html",
    "css/student-portal.css",
    "docs/css/student-portal.css",
    "js/student-portal.js",
    "docs/js/student-portal.js",
    "scripts/apply_presentatie_studio_export.py",
    "scripts/local_docentomgeving_server.py",
    "scripts/start_local_docentomgeving.sh",
    "Open Jaarplanning Studio.command",
]


def truthy_env(name: str, default: bool = True) -> bool:
    value = os.environ.get(name)
    if value is None:
        return default
    return value.strip().lower() not in {"0", "false", "nee", "no", "off"}


def run_git(args: list[str]) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        ["git", *args],
        cwd=ROOT,
        text=True,
        capture_output=True,
        check=True,
    )


def run_git_check(args: list[str]) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        ["git", *args],
        cwd=ROOT,
        text=True,
        capture_output=True,
        check=False,
    )


def push_with_remote_sync(branch: str) -> tuple[bool, str]:
    first_push = run_git_check(["push", "origin", branch])
    if first_push.returncode == 0:
        return True, f"Commit gemaakt en gepusht naar origin/{branch}."

    output = f"{first_push.stdout}\n{first_push.stderr}".strip()
    if "fetch first" not in output and "non-fast-forward" not in output:
        return False, output

    pull = run_git_check(["pull", "--rebase", "--autostash", "origin", branch])
    if pull.returncode != 0:
        return False, f"{output}\n\nPull/rebase mislukte:\n{pull.stdout}\n{pull.stderr}".strip()

    second_push = run_git_check(["push", "origin", branch])
    if second_push.returncode != 0:
        return False, f"{second_push.stdout}\n{second_push.stderr}".strip()

    return True, f"Remote bijgehaald met rebase en gepusht naar origin/{branch}."


def reset_publish_index() -> None:
    unmerged = run_git_check(["diff", "--name-only", "--diff-filter=U"]).stdout.splitlines()
    if unmerged:
        run_git(["add", "--", *unmerged])
    run_git_check(["restore", "--staged", "."])


def auto_commit_and_push(response: dict) -> dict:
    if not truthy_env(AUTO_GIT_PUSH_ENV, True):
        return {"enabled": False, "ok": True, "message": "Automatische git-push staat uit."}

    unmerged = run_git_check(["diff", "--name-only", "--diff-filter=U"]).stdout.splitlines()
    if unmerged:
        return {
            "enabled": True,
            "ok": False,
            "message": "Git heeft nog conflicten; publiceer eerst de opgeloste bestanden.",
            "unmerged": unmerged,
        }

    target_files = [
        str(response.get(key, "")).strip()
        for key in ("internal", "live", "docsLive")
        if str(response.get(key, "")).strip()
    ]
    target_files.extend(path for path in PUBLIC_PORTAL_FILES if (ROOT / path).exists())
    target_files = list(dict.fromkeys(target_files))
    if not target_files:
        return {"enabled": True, "ok": False, "message": "Geen publicatiebestanden gevonden voor git."}

    reset_publish_index()

    changed = run_git(["status", "--porcelain", "--", *target_files]).stdout.strip()
    if not changed:
        branch = run_git(["rev-parse", "--abbrev-ref", "HEAD"]).stdout.strip()
        pushed, push_message = push_with_remote_sync(branch)
        return {
            "enabled": True,
            "ok": pushed,
            "message": push_message if pushed else f"Geen nieuwe bestanden om te committen, maar pushen mislukte: {push_message}",
            "branch": branch,
        }

    run_git(["add", "--", *target_files])
    if run_git_check(["diff", "--cached", "--quiet", "--", *target_files]).returncode == 0:
        return {"enabled": True, "ok": True, "message": "Geen staged publicatiewijzigingen."}

    stamp = str(response.get("updatedAt", "")).strip()
    message = f"Publiceer jaarplanning{f' ({stamp})' if stamp else ''}"
    run_git(["commit", "-m", message])

    branch = run_git(["rev-parse", "--abbrev-ref", "HEAD"]).stdout.strip()
    pushed, push_message = push_with_remote_sync(branch)
    if not pushed:
        return {
            "enabled": True,
            "ok": False,
            "message": push_message,
            "branch": branch,
        }
    return {
        "enabled": True,
        "ok": True,
        "message": push_message,
        "branch": branch,
    }


class Server(ThreadingHTTPServer):
    allow_reuse_address = True


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def end_headers(self) -> None:
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def do_POST(self) -> None:
        if self.path.split("?", 1)[0] != "/api/presentatie-studio/publish":
            self.send_error(HTTPStatus.NOT_FOUND, "Onbekende API-route")
            return

        length_raw = self.headers.get("Content-Length", "0")
        try:
            length = int(length_raw)
        except ValueError:
            self.send_json(HTTPStatus.BAD_REQUEST, {"ok": False, "error": "Ongeldige Content-Length."})
            return

        if length <= 0 or length > MAX_BODY_BYTES:
            self.send_json(HTTPStatus.REQUEST_ENTITY_TOO_LARGE, {
                "ok": False,
                "error": "Export is leeg of te groot.",
            })
            return

        body = self.rfile.read(length)
        try:
            json.loads(body.decode("utf-8"))
        except Exception as exc:
            self.send_json(HTTPStatus.BAD_REQUEST, {"ok": False, "error": f"Ongeldige JSON: {exc}"})
            return

        with tempfile.NamedTemporaryFile("wb", suffix=".json", delete=False) as temp:
            temp.write(body)
            temp_path = Path(temp.name)

        try:
            result = subprocess.run(
                [sys.executable, str(ROOT / "scripts/apply_presentatie_studio_export.py"), str(temp_path)],
                cwd=ROOT,
                text=True,
                capture_output=True,
                check=True,
            )
            response = json.loads(result.stdout.strip().splitlines()[-1])
            try:
                response["autoGit"] = auto_commit_and_push(response)
            except subprocess.CalledProcessError as exc:
                message = (exc.stderr or exc.stdout or str(exc)).strip()
                response["autoGit"] = {
                    "enabled": truthy_env(AUTO_GIT_PUSH_ENV, True),
                    "ok": False,
                    "message": message,
                }
            self.send_json(HTTPStatus.OK, response)
        except subprocess.CalledProcessError as exc:
            message = (exc.stderr or exc.stdout or str(exc)).strip()
            self.send_json(HTTPStatus.INTERNAL_SERVER_ERROR, {"ok": False, "error": message})
        except Exception as exc:
            self.send_json(HTTPStatus.INTERNAL_SERVER_ERROR, {"ok": False, "error": str(exc)})
        finally:
            temp_path.unlink(missing_ok=True)

    def send_json(self, status: HTTPStatus, payload: dict) -> None:
        encoded = (json.dumps(payload, ensure_ascii=False) + "\n").encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(encoded)))
        self.end_headers()
        self.wfile.write(encoded)


def main() -> int:
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 4173
    server = Server(("127.0.0.1", port), Handler)
    print(f"Lokale docentomgeving luistert op http://127.0.0.1:{port}/index.html", flush=True)
    server.serve_forever()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
