#!/usr/bin/env python3
"""Local development server with a small publish API for the studios."""

from __future__ import annotations

import json
import os
import re
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
    "data/jaarplanning/jaarplanning-intern.json",
    "docs",
    "assets",
    "lesdocs",
    "data/kerndoelen",
    "index.html",
    "docent.html",
    "css/internal-shell.css",
    "css/style.css",
    "css/lesstudio.css",
    "css/jaarplanning-studio.css",
    "css/presentatie-studio.css",
    "leerlingen.html",
    "docs/leerlingen.html",
    "css/student-portal.css",
    "docs/css/student-portal.css",
    "jaarplanning-studio.html",
    "presentatie-studio.html",
    "js/jaarplanning-studio.js",
    "js/lesstudio.js",
    "js/presentatie-studio.js",
    "js/student-portal.js",
    "js/kerndoelen-data.js",
    "js/init.js",
    "docs/js/init.js",
    "docs/js/student-portal.js",
    "docs/js/kerndoelen-data.js",
    "js/docent-lesselectie-live.json",
    "docs/js/docent-lesselectie-live.json",
    "js/jaarplanning-live.json",
    "docs/js/jaarplanning-live.json",
    "js/zermelo-agenda-live.json",
    "docs/js/zermelo-agenda-live.json",
    "js/zermelo-leerlingen-live.json",
    "docs/js/zermelo-leerlingen-live.json",
    "scripts/apply_presentatie_studio_export.py",
    "scripts/build_jaarplanning_internal.py",
    "scripts/local_docentomgeving_server.py",
    "scripts/start_local_docentomgeving.sh",
    "Open Jaarplanning Studio.command",
]
PUBLISH_RESPONSE_PATH_KEYS = (
    "internal",
    "live",
    "docsLive",
    "mirroredAssets",
    "cacheBusted",
)


def truthy_env(name: str, default: bool = True) -> bool:
    value = os.environ.get(name)
    if value is None:
        return default
    return value.strip().lower() not in {"0", "false", "nee", "no", "off"}


def run_git(args: list[str]) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        ["git", "-C", str(ROOT), *args],
        text=True,
        capture_output=True,
        check=True,
    )


def run_git_check(args: list[str]) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        ["git", "-C", str(ROOT), *args],
        text=True,
        capture_output=True,
        check=False,
    )


def unmerged_files() -> list[str]:
    return run_git_check(["diff", "--name-only", "--diff-filter=U"]).stdout.splitlines()


def has_conflict_markers(rel_path: str) -> bool:
    try:
        text = (ROOT / rel_path).read_text(encoding="utf-8", errors="ignore")
    except OSError:
        return True
    return bool(re.search(r"^(<<<<<<<|=======|>>>>>>>)", text, re.MULTILINE))


def stage_marker_free_unmerged_files(paths: list[str]) -> list[str]:
    marker_free = [path for path in paths if not has_conflict_markers(path)]
    if not marker_free:
        return []
    run_git(["add", "--", *marker_free])
    return marker_free


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
    unmerged = unmerged_files()
    if unmerged:
        run_git(["add", "--", *unmerged])
    run_git_check(["restore", "--staged", "."])


def normalize_publish_path(value: object) -> str:
    if not isinstance(value, str):
        return ""
    rel_path = os.path.normpath(value.strip().replace("\\", "/"))
    if rel_path in {"", "."}:
        return ""
    if os.path.isabs(rel_path) or rel_path == ".." or rel_path.startswith("../"):
        return ""
    if rel_path == ".git" or rel_path.startswith(".git/"):
        return ""
    return rel_path


def append_publish_paths(targets: list[str], value: object) -> None:
    if isinstance(value, list):
        for item in value:
            append_publish_paths(targets, item)
        return
    rel_path = normalize_publish_path(value)
    if rel_path and (ROOT / rel_path).exists():
        targets.append(rel_path)


def publish_target_files(response: dict, resolved_unmerged: list[str]) -> list[str]:
    target_files: list[str] = []
    for key in PUBLISH_RESPONSE_PATH_KEYS:
        append_publish_paths(target_files, response.get(key))
    for path in PUBLIC_PORTAL_FILES:
        append_publish_paths(target_files, path)
    for path in resolved_unmerged:
        append_publish_paths(target_files, path)
    return list(dict.fromkeys(target_files))


def auto_commit_and_push(response: dict) -> dict:
    if not truthy_env(AUTO_GIT_PUSH_ENV, True):
        return {"enabled": False, "ok": True, "message": "Automatische git-push staat uit."}

    resolved_unmerged: list[str] = []
    unmerged = unmerged_files()
    if unmerged:
        blocked = [path for path in unmerged if has_conflict_markers(path)]
        if not blocked:
            resolved_unmerged = stage_marker_free_unmerged_files(unmerged)
            unmerged = unmerged_files()
            blocked = [path for path in unmerged if has_conflict_markers(path)]
        if unmerged:
            message_paths = blocked or unmerged
            return {
                "enabled": True,
                "ok": False,
                "message": "Git heeft nog conflicten; los deze bestanden eerst op.",
                "unmerged": message_paths,
            }

    target_files = publish_target_files(response, resolved_unmerged)
    if not target_files:
        return {"enabled": True, "ok": False, "message": "Geen publicatiebestanden gevonden voor git."}

    if not resolved_unmerged:
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


def push_pending_publication_state_on_startup() -> None:
    if not truthy_env(AUTO_GIT_PUSH_ENV, True):
        print("Automatische opstart-publicatie staat uit.", flush=True)
        return
    try:
        result = auto_commit_and_push({"updatedAt": current_utc_iso()})
    except subprocess.CalledProcessError as exc:
        message = (exc.stderr or exc.stdout or str(exc)).strip()
        print(f"Automatische opstart-publicatie mislukt: {message}", flush=True)
        return
    except Exception as exc:
        print(f"Automatische opstart-publicatie mislukt: {exc}", flush=True)
        return

    if result.get("ok"):
        print(f"Automatische opstart-publicatie: {result.get('message', 'klaar')}", flush=True)
    else:
        print(f"Automatische opstart-publicatie mislukt: {result.get('message', 'onbekende fout')}", flush=True)


class Server(ThreadingHTTPServer):
    allow_reuse_address = True


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def end_headers(self) -> None:
        self.send_header("Cache-Control", "no-store")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        super().end_headers()

    def do_OPTIONS(self) -> None:
        self.send_response(HTTPStatus.NO_CONTENT)
        self.end_headers()

    def do_POST(self) -> None:
        route = self.path.split("?", 1)[0]
        if route == "/api/docent-lesselectie/publish":
            self.publish_teacher_lesson_selection()
            return

        if route != "/api/presentatie-studio/publish":
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

    def publish_teacher_lesson_selection(self) -> None:
        length_raw = self.headers.get("Content-Length", "0")
        try:
            length = int(length_raw)
        except ValueError:
            self.send_json(HTTPStatus.BAD_REQUEST, {"ok": False, "error": "Ongeldige Content-Length."})
            return

        if length <= 0 or length > MAX_BODY_BYTES:
            self.send_json(HTTPStatus.REQUEST_ENTITY_TOO_LARGE, {
                "ok": False,
                "error": "Docentlesselectie is leeg of te groot.",
            })
            return

        body = self.rfile.read(length)
        try:
            payload = json.loads(body.decode("utf-8"))
        except Exception as exc:
            self.send_json(HTTPStatus.BAD_REQUEST, {"ok": False, "error": f"Ongeldige JSON: {exc}"})
            return

        if not isinstance(payload, dict) or not isinstance(payload.get("entries"), list):
            self.send_json(HTTPStatus.BAD_REQUEST, {
                "ok": False,
                "error": "Docentlesselectie moet een object met entries zijn.",
            })
            return

        payload["updatedAt"] = str(payload.get("updatedAt") or "").strip() or current_utc_iso()
        encoded = json.dumps(payload, ensure_ascii=False, indent=2).encode("utf-8") + b"\n"
        written = []
        for rel_path in ("js/docent-lesselectie-live.json", "docs/js/docent-lesselectie-live.json"):
            target = ROOT / rel_path
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(encoded)
            written.append(rel_path)

        response = {
            "ok": True,
            "updatedAt": payload["updatedAt"],
            "live": written[0],
            "docsLive": written[1],
            "entryCount": len(payload.get("entries", [])),
        }
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

    def send_json(self, status: HTTPStatus, payload: dict) -> None:
        encoded = (json.dumps(payload, ensure_ascii=False) + "\n").encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(encoded)))
        self.end_headers()
        self.wfile.write(encoded)


def current_utc_iso() -> str:
    from datetime import datetime, timezone

    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def main() -> int:
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 4173
    push_pending_publication_state_on_startup()
    server = Server(("127.0.0.1", port), Handler)
    print(f"Lokale docentomgeving luistert op http://127.0.0.1:{port}/index.html", flush=True)
    server.serve_forever()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
