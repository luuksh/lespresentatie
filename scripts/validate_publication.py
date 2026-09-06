#!/usr/bin/env python3
"""Validate the local/public publication state before pushing."""

from __future__ import annotations

import json
import re
import subprocess
import sys
import argparse
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SKIP_DIRS = {".git", "data/backups", "dist", "updated_presentaties"}
TEXT_SUFFIXES = {".html", ".css", ".js", ".json", ".md", ".py", ".sh", ".command", ".yml", ".yaml"}
JSON_ROOTS = [
    ROOT / "js",
    ROOT / "docs/js",
    ROOT / "data/jaarplanning",
    ROOT / "data/kerndoelen",
    ROOT / "data/planning-rules.json",
]
CONFLICT_RE = re.compile(r"^(<<<<<<<|=======|>>>>>>>)", re.MULTILINE)
FORBIDDEN_PUBLIC_PATHS = {
    "docent.html",
    "jaarplanning-studio.html",
    "presentatie-studio.html",
    "absenties.html",
    "opdracht.html",
    "leeglokaal.html",
    "timer.html",
    "css/style.css",
    "css/rich-presentations.css",
    "css/lesstudio.css",
    "css/jaarplanning-studio.css",
    "css/presentatie-studio.css",
    "js/init.js",
    "js/indeling.js",
    "js/lesstudio.js",
    "js/jaarplanning-studio.js",
    "js/presentatie-studio.js",
}
PUBLIC_ROSTER_FILES = [
    ROOT / "docs/js/leerlingen_per_klas.json",
    ROOT / "docs/js/zermelo-leerlingen-live.json",
    ROOT / "dist/public/js/leerlingen_per_klas.json",
    ROOT / "dist/public/js/zermelo-leerlingen-live.json",
]


def rel(path: Path) -> str:
    return path.relative_to(ROOT).as_posix()


def should_skip(path: Path) -> bool:
    parts = path.relative_to(ROOT).parts
    for index in range(1, len(parts) + 1):
        if "/".join(parts[:index]) in SKIP_DIRS:
            return True
    return False


def iter_text_files() -> list[Path]:
    return [
        path
        for path in ROOT.rglob("*")
        if path.is_file()
        and not should_skip(path)
        and path.suffix.lower() in TEXT_SUFFIXES
    ]


def check_no_conflict_markers(errors: list[str]) -> None:
    for path in iter_text_files():
        text = path.read_text(encoding="utf-8", errors="ignore")
        if CONFLICT_RE.search(text):
            errors.append(f"Conflictmarkers gevonden in {rel(path)}")


def check_unmerged_git_files(errors: list[str]) -> None:
    result = subprocess.run(
        ["git", "-C", str(ROOT), "diff", "--name-only", "--diff-filter=U"],
        text=True,
        capture_output=True,
        check=False,
    )
    if result.returncode != 0:
        errors.append(f"Git unmerged-check mislukt: {(result.stderr or result.stdout).strip()}")
        return
    files = [line.strip() for line in result.stdout.splitlines() if line.strip()]
    if files:
        errors.append(f"Git heeft nog unresolved files: {', '.join(files)}")


def check_json_files(errors: list[str]) -> None:
    for root in JSON_ROOTS:
        if not root.exists():
            continue
        if root.is_file():
            paths = [root]
        else:
            paths = list(root.rglob("*.json"))
        for path in paths:
            if should_skip(path):
                continue
            try:
                json.loads(path.read_text(encoding="utf-8"))
            except Exception as exc:
                errors.append(f"Ongeldige JSON in {rel(path)}: {exc}")


def check_public_bundle(errors: list[str]) -> None:
    public = ROOT / "dist/public"
    if not public.exists():
        errors.append("dist/public ontbreekt; draai eerst scripts/build_deploy_bundle.sh")
        return

    for rel_path in sorted(FORBIDDEN_PUBLIC_PATHS):
        if (public / rel_path).exists():
            errors.append(f"Docentbestand staat in public bundle: dist/public/{rel_path}")

    index = public / "index.html"
    if not index.exists():
        errors.append("dist/public/index.html ontbreekt")
    else:
        text = index.read_text(encoding="utf-8", errors="ignore")
        if "Lesstudio" in text or "docent.html" in text:
            errors.append("dist/public/index.html lijkt naar de docentomgeving te verwijzen")


def class_payloads(payload: object) -> dict[str, object]:
    if isinstance(payload, dict) and isinstance(payload.get("classes"), dict):
        return payload["classes"]
    if isinstance(payload, dict):
        return payload
    return {}


def check_public_rosters(errors: list[str]) -> None:
    for path in PUBLIC_ROSTER_FILES:
        if not path.exists():
            continue
        try:
            payload = json.loads(path.read_text(encoding="utf-8"))
        except Exception as exc:
            errors.append(f"Publieke klaslijst is geen geldige JSON in {rel(path)}: {exc}")
            continue
        classes = class_payloads(payload)
        filled = [
            class_id
            for class_id, value in classes.items()
            if isinstance(value, list) and len(value) > 0
        ]
        if filled:
            errors.append(f"Publieke klaslijst bevat leerlingnamen in {rel(path)}: {', '.join(sorted(filled))}")


def check_tracked_backups(errors: list[str]) -> None:
    result = subprocess.run(
        ["git", "-C", str(ROOT), "ls-files", "data/backups"],
        text=True,
        capture_output=True,
        check=False,
    )
    if result.returncode != 0:
        return
    files = [line.strip() for line in result.stdout.splitlines() if line.strip()]
    if files:
        errors.append(f"Backups staan onder versiebeheer: {len(files)} bestanden in data/backups")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Controleer of de publicatie veilig is.")
    parser.add_argument(
        "--skip-git-state",
        action="store_true",
        help="Sla Git-indexchecks over; handig in sandboxes waar .git niet schrijfbaar is.",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    errors: list[str] = []
    check_no_conflict_markers(errors)
    if not args.skip_git_state:
        check_unmerged_git_files(errors)
    check_json_files(errors)
    check_public_bundle(errors)
    check_public_rosters(errors)
    if not args.skip_git_state:
        check_tracked_backups(errors)

    if errors:
        print("Validatie mislukt:")
        for error in errors:
            print(f"- {error}")
        return 1

    print("Validatie ok.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
