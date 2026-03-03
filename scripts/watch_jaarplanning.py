#!/usr/bin/env python3
"""Watch jaarplanning Excel files and rebuild live JSON on changes."""

from __future__ import annotations

import argparse
import os
import signal
import subprocess
import sys
import time
from pathlib import Path


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Watch jaarplanning xlsx files and run update-jaarplanning.sh on change."
    )
    parser.add_argument(
        "--interval",
        type=float,
        default=2.0,
        help="Poll interval in seconds (default: 2.0).",
    )
    parser.add_argument(
        "--settle-seconds",
        type=float,
        default=4.0,
        help="Wait this long after last detected change before updating (default: 4.0).",
    )
    parser.add_argument(
        "--no-push",
        action="store_true",
        help="Run updater with --no-push.",
    )
    return parser.parse_args()


def resolve_grade_file(root: Path, grade: int) -> Path | None:
    env_key = f"JAARPLANNING_G{grade}_FILE"
    env_value = Path(str(os.environ.get(env_key, "")).strip()).expanduser()
    if str(env_value).strip() and env_value.exists():
        return env_value

    onedrive_base = root.home() / "Library/CloudStorage/OneDrive-WillibrordStichting/CGU-AFD-Nederlands - General"
    known = [
        onedrive_base / f"{grade} Nederlands" / f"Jaarplanning G{grade}.xlsx",
        root / "data" / "jaarplanning" / f"Jaarplanning G{grade}.xlsx",
    ]
    for candidate in known:
        if candidate.exists():
            return candidate

    if onedrive_base.exists():
        matches = list(onedrive_base.rglob(f"Jaarplanning G{grade}.xlsx"))
        if matches:
            return matches[0]
    return None


def tracked_files(root: Path) -> list[Path]:
    required = [resolve_grade_file(root, 1), resolve_grade_file(root, 3)]
    optional = [resolve_grade_file(root, 4)]
    files = [p for p in required + optional if p is not None]
    return files


def mtimes(paths: list[Path]) -> dict[Path, float]:
    values: dict[Path, float] = {}
    for p in paths:
        try:
            values[p] = p.stat().st_mtime
        except FileNotFoundError:
            values[p] = 0.0
    return values


def run_updater(root: Path, no_push: bool) -> int:
    cmd = [str(root / "update-jaarplanning.sh")]
    if no_push:
        cmd.append("--no-push")
    print(f"[watch] run: {' '.join(cmd)}")
    result = subprocess.run(cmd, cwd=str(root), check=False)
    return result.returncode


def main() -> int:
    args = parse_args()
    root = Path(__file__).resolve().parents[1]
    files = tracked_files(root)
    if len(files) < 2:
        print("[watch] Verplichte jaarplanning-bestanden G1/G3 niet gevonden.", file=sys.stderr)
        return 1

    print("[watch] Volgt bestanden:")
    for p in files:
        print(f"  - {p}")
    print(f"[watch] interval={args.interval}s settle={args.settle_seconds}s no_push={args.no_push}")

    stop = False

    def _handle_signal(signum, frame):  # noqa: ARG001
        nonlocal stop
        stop = True

    signal.signal(signal.SIGINT, _handle_signal)
    signal.signal(signal.SIGTERM, _handle_signal)

    last_seen = mtimes(files)
    last_change_at = 0.0
    pending = False

    while not stop:
        time.sleep(max(args.interval, 0.2))
        current = mtimes(files)
        changed = any(current.get(p, 0.0) != last_seen.get(p, 0.0) for p in files)
        if changed:
            last_seen = current
            last_change_at = time.time()
            pending = True
            print("[watch] Wijziging gedetecteerd, wacht op stabilisatie...")
            continue

        if pending and (time.time() - last_change_at) >= args.settle_seconds:
            pending = False
            rc = run_updater(root, args.no_push)
            if rc != 0:
                print(f"[watch] Updater faalde met exitcode {rc}", file=sys.stderr)

    print("[watch] Gestopt.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
