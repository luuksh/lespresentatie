#!/usr/bin/env python3
"""Build jaarplanning-live.json from internal JSON source."""

from __future__ import annotations

import argparse
import datetime as dt
import json
from pathlib import Path


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Bouw live jaarplanning JSON uit intern bronbestand."
    )
    parser.add_argument(
        "-i",
        "--input",
        default="data/jaarplanning/jaarplanning-intern.json",
        help="Interne bron JSON (default: data/jaarplanning/jaarplanning-intern.json)",
    )
    parser.add_argument(
        "-o",
        "--output",
        default="js/jaarplanning-live.json",
        help="Output JSON pad (default: js/jaarplanning-live.json)",
    )
    return parser.parse_args()


def normalize_lesson(row: object) -> dict:
    if isinstance(row, str):
        text = row.strip()
        if not text:
            return {}
        return {"project": text, "lesson": ""}
    if not isinstance(row, dict):
        return {}

    out = {
        "project": str(row.get("project", "")).strip(),
        "lesson": str(row.get("lesson", "")).strip(),
    }
    for key in ("lessonKey", "presentationId"):
        value = str(row.get(key, "")).strip()
        if value:
            out[key] = value
    if not out["project"] and not out["lesson"]:
        return {}
    return out


def normalize_entry(row: object) -> dict:
    if not isinstance(row, dict):
        return {}

    class_id = str(row.get("classId", "")).strip().upper()
    week = str(row.get("week", "")).strip()
    if not class_id or not week:
        return {}

    lessons_raw = row.get("lessons")
    lessons: list[dict] = []
    if isinstance(lessons_raw, list):
        for item in lessons_raw:
            lesson = normalize_lesson(item)
            if lesson:
                lessons.append(lesson)

    items_raw = row.get("items")
    items: list[str] = []
    if isinstance(items_raw, list):
        for item in items_raw:
            text = str(item).strip()
            if text:
                items.append(text)

    out = {
        "classId": class_id,
        "week": week,
        "lessons": lessons,
        "items": items,
    }
    note = str(row.get("note", "")).strip()
    if note:
        out["note"] = note
    return out


def main() -> int:
    args = parse_args()
    in_path = Path(args.input)
    out_path = Path(args.output)

    if not in_path.exists():
        raise FileNotFoundError(f"Inputbestand niet gevonden: {in_path}")

    raw = json.loads(in_path.read_text(encoding="utf-8"))
    raw_entries = raw.get("entries") if isinstance(raw, dict) else None
    if not isinstance(raw_entries, list):
        raise ValueError("Interne bron mist lijst 'entries'.")

    entries = [entry for entry in (normalize_entry(e) for e in raw_entries) if entry]
    entries.sort(key=lambda item: (item["classId"], item["week"]))

    payload = {
        "updatedAt": dt.datetime.now().astimezone().isoformat(timespec="seconds"),
        "sourceType": "internal-json",
        "entries": entries,
    }

    presentations = raw.get("presentations") if isinstance(raw, dict) else None
    if isinstance(presentations, dict):
        payload["presentations"] = presentations

    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Geschreven: {out_path} ({len(entries)} class-week entries)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
