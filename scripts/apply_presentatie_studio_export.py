#!/usr/bin/env python3
"""Publish studio changes into the shared planning JSON files."""

from __future__ import annotations

import argparse
import datetime as dt
import json
import re
import shutil
import subprocess
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
INTERNAL_PATH = ROOT / "data/jaarplanning/jaarplanning-intern.json"
LIVE_PATH = ROOT / "js/jaarplanning-live.json"
DOCS_LIVE_PATH = ROOT / "docs/js/jaarplanning-live.json"
BACKUP_DIR = ROOT / "data/backups/presentatie-studio"
STUDENT_HTML_PATHS = [
    ROOT / "leerlingen.html",
    ROOT / "docs/leerlingen.html",
]
PUBLIC_ASSET_MIRRORS = [
    ("leerlingen.html", "docs/leerlingen.html"),
    ("css/student-portal.css", "docs/css/student-portal.css"),
    ("js/student-portal.js", "docs/js/student-portal.js"),
    ("js/kerndoelen-data.js", "docs/js/kerndoelen-data.js"),
]
CLASS_SLOT_DAY = {
    "1C": {"A": 1, "B": 2, "C": 4},
    "1D": {"A": 2, "B": 4, "C": 5},
    "3B": {"A": 2, "B": 5},
    "3C": {"A": 1, "B": 2},
    "3E": {"A": 2, "B": 5},
    "3F": {"A": 1, "B": 4},
    "4B": {"A": 4, "B": 4, "C": 5},
    "4C": {"A": 1, "B": 1, "C": 2},
}
CLASS_SLOT_START = {
    "1C": {"A": "10:50", "B": "08:15", "C": "12:50"},
    "1D": {"A": "14:40", "B": "10:50", "C": "08:15"},
    "3B": {"A": "09:00", "B": "10:50"},
    "3C": {"A": "09:45", "B": "10:50"},
    "3E": {"A": "09:45", "B": "11:35"},
    "3F": {"A": "09:00", "B": "11:35"},
    "4B": {"A": "08:15", "B": "09:00", "C": "09:00"},
    "4C": {"A": "12:50", "B": "13:35", "C": "12:50"},
}


def cache_version(stamp: str) -> str:
    return re.sub(r"\D", "", stamp)[:12] or dt.datetime.now().strftime("%Y%m%d%H%M")


def bump_student_portal_cache(stamp: str) -> list[str]:
    version = cache_version(stamp)
    changed: list[str] = []
    patterns = [
        re.compile(r'(js/student-portal\.js\?v=)[^"]+'),
        re.compile(r'(css/student-portal\.css\?v=)[^"]+'),
    ]
    for path in STUDENT_HTML_PATHS:
        if not path.exists():
            continue
        text = path.read_text(encoding="utf-8")
        next_text = text
        for pattern in patterns:
            next_text = pattern.sub(rf"\g<1>{version}", next_text)
        if next_text != text:
            path.write_text(next_text, encoding="utf-8")
            changed.append(str(path.relative_to(ROOT)))
    return changed


def mirror_public_assets() -> list[str]:
    copied: list[str] = []
    for source_rel, target_rel in PUBLIC_ASSET_MIRRORS:
        source = ROOT / source_rel
        target = ROOT / target_rel
        if not source.exists():
            continue
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source, target)
        copied.append(target_rel)
    return copied


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Zet een Presentatiestudio export om naar gedeelde jaarplanningbestanden."
    )
    parser.add_argument(
        "input",
        nargs="?",
        help="Pad naar export JSON. Als dit ontbreekt, wordt stdin gelezen.",
    )
    return parser.parse_args()


def load_payload(path: str | None) -> dict:
    if path:
      return json.loads(Path(path).read_text(encoding="utf-8"))
    return json.loads(sys.stdin.read())


def extract_presentations(payload: dict) -> dict:
    presentations = payload.get("presentations")
    if isinstance(presentations, dict):
        return presentations

    items = payload.get("presentationsExport", {}).get("items")
    if isinstance(items, list):
        out = {}
        for item in items:
            if not isinstance(item, dict):
                continue
            presentation_id = str(item.get("id", "")).strip()
            if not presentation_id:
                continue
            out[presentation_id] = {
                key: value
                for key, value in item.items()
                if key not in {"slideCount", "markerCount", "markerDeckSlideCount"}
            }
        if out:
            return out

    raise ValueError("Geen presentaties gevonden in de Presentatiestudio-export.")


def extract_entries(payload: dict) -> list[dict] | None:
    if payload.get("studioSource") != "jaarplanning-studio":
        return None
    entries = payload.get("entries")
    if not isinstance(entries, list):
        return None
    cleaned = [entry for entry in entries if isinstance(entry, dict)]
    if not cleaned:
        raise ValueError("Export bevat geen geldige planningregels.")
    return cleaned


def normalize_weekday(value: object) -> int:
    text = str(value or "").strip().casefold()
    if text in {"1", "2", "3", "4", "5"}:
        return int(text)
    names = {
        "maandag": 1,
        "ma": 1,
        "dinsdag": 2,
        "di": 2,
        "woensdag": 3,
        "wo": 3,
        "donderdag": 4,
        "do": 4,
        "vrijdag": 5,
        "vr": 5,
    }
    return names.get(text, 0)


def normalize_time(value: object) -> str:
    text = str(value or "").strip()
    match = re.match(r"^(\d{1,2}):(\d{2})$", text)
    if not match:
        return ""
    return f"{int(match.group(1)):02d}:{int(match.group(2)):02d}"


def normalize_reading_locks(raw: object) -> dict[str, dict[str, int | str]]:
    if not isinstance(raw, dict):
        return {}

    out: dict[str, dict[str, int | str]] = {}
    for class_id, value in raw.items():
        normalized_class = str(class_id or "").strip().upper()
        if normalized_class.startswith("G") and len(normalized_class) >= 3 and normalized_class[1].isdigit():
            normalized_class = normalized_class[1:]
        day = normalize_weekday(
            value.get("day") or value.get("weekday") if isinstance(value, dict) else value
        )
        if normalized_class and day:
            start = normalize_time(value.get("start") or value.get("time") if isinstance(value, dict) else "")
            out[normalized_class] = {"day": day, "start": start} if start else {"day": day}
            continue
        if isinstance(value, dict):
            lesson_key = str(value.get("lessonKey") or value.get("slot") or "").strip().upper()
        else:
            lesson_key = str(value or "").strip().upper()
        slot_day = CLASS_SLOT_DAY.get(normalized_class, {}).get(lesson_key, 0)
        if normalized_class and slot_day:
            start = CLASS_SLOT_START.get(normalized_class, {}).get(lesson_key, "")
            out[normalized_class] = {"day": slot_day, "start": start} if start else {"day": slot_day}
    return out


def grade_from_class_id(class_id: str) -> str:
    text = str(class_id or "").strip().upper()
    if len(text) == 1 and text.isdigit():
        return text
    if text and text[0].isdigit():
        return text[0]
    if len(text) >= 2 and text[0] == "G" and text[1].isdigit():
        return text[1]
    return ""


def expand_year_layer_entries(entries: list[dict], current_entries: list[dict]) -> list[dict]:
    class_ids_by_grade: dict[str, list[str]] = {}
    weeks_by_class_id: dict[str, set[str]] = {}
    preserved_layer_entries: list[dict] = []
    incoming_weeks_by_grade: dict[str, set[str]] = {}
    for entry in entries:
        class_id = str(entry.get("classId", "")).strip()
        grade = grade_from_class_id(class_id)
        week = str(entry.get("week", "")).strip()
        if class_id == grade and week:
            incoming_weeks_by_grade.setdefault(grade, set()).add(week)

    for entry in current_entries:
        class_id = str(entry.get("classId", "")).strip()
        week = str(entry.get("week", "")).strip()
        grade = grade_from_class_id(class_id)
        if class_id == "ALL" or class_id == grade:
            preserved_layer_entries.append(entry)
            continue
        if not grade:
            continue
        if week and week not in incoming_weeks_by_grade.get(grade, set()):
            preserved_layer_entries.append(entry)
        class_ids_by_grade.setdefault(grade, [])
        if class_id not in class_ids_by_grade[grade]:
            class_ids_by_grade[grade].append(class_id)
        if week:
            weeks_by_class_id.setdefault(class_id, set()).add(week)

    expanded: list[dict] = [*preserved_layer_entries]
    for entry in entries:
        class_id = str(entry.get("classId", "")).strip()
        grade = grade_from_class_id(class_id)
        if class_id != grade:
            continue

        week = str(entry.get("week", "")).strip()
        for target_class_id in class_ids_by_grade.get(grade, []):
            current_weeks = weeks_by_class_id.get(target_class_id, set())
            if current_weeks and week not in current_weeks:
                continue
            clone = dict(entry)
            clone["classId"] = target_class_id
            expanded.append(clone)

    if not expanded:
        raise ValueError("Jaarplanning-export bevat geen publiceerbare jaarlaagregels.")
    return expanded


def backup_file(path: Path, stamp: str) -> str | None:
    if not path.exists():
        return None
    safe_stamp = stamp.replace(":", "-")
    BACKUP_DIR.mkdir(parents=True, exist_ok=True)
    target = BACKUP_DIR / f"{safe_stamp}-{path.name}"
    shutil.copy2(path, target)
    return str(target.relative_to(ROOT))


def main() -> int:
    args = parse_args()
    payload = load_payload(args.input)
    if not isinstance(payload, dict):
        raise ValueError("Export moet een JSON-object zijn.")

    presentations = extract_presentations(payload)
    entries = extract_entries(payload)
    internal = json.loads(INTERNAL_PATH.read_text(encoding="utf-8"))
    if not isinstance(internal, dict):
        raise ValueError(f"Ongeldig intern bronbestand: {INTERNAL_PATH}")

    stamp = dt.datetime.now().astimezone().isoformat(timespec="seconds")
    backups = [
        backup
        for backup in (
            backup_file(INTERNAL_PATH, stamp),
            backup_file(LIVE_PATH, stamp),
            backup_file(DOCS_LIVE_PATH, stamp),
        )
        if backup
    ]
    if entries is not None:
        internal["entries"] = expand_year_layer_entries(entries, internal.get("entries", []))
    if "readingLocks" in payload:
        reading_locks = normalize_reading_locks(payload.get("readingLocks"))
        internal["readingLocks"] = reading_locks
    internal["presentations"] = presentations
    internal["updatedAt"] = stamp
    internal["sourceRevision"] = f"{stamp}-studio"
    INTERNAL_PATH.write_text(
        json.dumps(internal, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )

    subprocess.run(
        [
            sys.executable,
            str(ROOT / "scripts/build_jaarplanning_internal.py"),
            "--input",
            str(INTERNAL_PATH),
            "--output",
            str(LIVE_PATH),
        ],
        cwd=ROOT,
        check=True,
    )

    DOCS_LIVE_PATH.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(LIVE_PATH, DOCS_LIVE_PATH)
    mirrored_assets = mirror_public_assets()
    cache_busted = bump_student_portal_cache(stamp)

    print(json.dumps({
        "ok": True,
        "entries": len(internal.get("entries", [])),
        "presentations": len(presentations),
        "updatedAt": stamp,
        "sourceRevision": internal["sourceRevision"],
        "internal": str(INTERNAL_PATH.relative_to(ROOT)),
        "live": str(LIVE_PATH.relative_to(ROOT)),
        "docsLive": str(DOCS_LIVE_PATH.relative_to(ROOT)),
        "mirroredAssets": mirrored_assets,
        "cacheBusted": cache_busted,
        "backups": backups,
    }, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
