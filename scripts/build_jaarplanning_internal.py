#!/usr/bin/env python3
"""Build jaarplanning-live.json from internal JSON source."""

from __future__ import annotations

import argparse
import datetime as dt
import json
from pathlib import Path

from calendar_sources import DEFAULT_TZ, load_holidays
from school_calendar_sources import load_school_calendar


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
    parser.add_argument(
        "--holidays-source",
        default="data/kalender/regio-midden.ics",
        help="Pad naar ICS/JSON bron met schoolvakanties",
    )
    parser.add_argument(
        "--tz",
        default=DEFAULT_TZ,
        help="Tijdzone voor vakantie-normalisatie",
    )
    parser.add_argument(
        "--school-calendar-source",
        default="data/kalender/jaaragenda2526.xlsx",
        help="Pad naar Excel-bron met schoolagenda",
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
    homework = str(row.get("homework", "")).strip()
    if homework:
        out["homework"] = homework
    for key in ("lessonKey", "presentationId", "presentationMarkerId"):
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


def merge_entry(base: dict, extra: dict) -> dict:
    merged = {
        "classId": base["classId"],
        "week": base["week"],
        "lessons": list(base.get("lessons", [])),
        "items": list(base.get("items", [])),
    }
    existing_lesson_keys = {json.dumps(item, sort_keys=True, ensure_ascii=False) for item in merged["lessons"]}
    for lesson in extra.get("lessons", []):
        fingerprint = json.dumps(lesson, sort_keys=True, ensure_ascii=False)
        if fingerprint in existing_lesson_keys:
            continue
        existing_lesson_keys.add(fingerprint)
        merged["lessons"].append(lesson)
    for item in extra.get("items", []):
        if item not in merged["items"]:
            merged["items"].append(item)

    notes: list[str] = []
    for note_value in (base.get("note", ""), extra.get("note", "")):
        note_text = str(note_value).strip()
        if not note_text:
            continue
        for chunk in [part.strip() for part in note_text.split(" | ") if part.strip()]:
            if chunk not in notes:
                notes.append(chunk)
    if notes:
        merged["note"] = " | ".join(notes)
    return merged


def consolidate_entries(entries: list[dict]) -> list[dict]:
    merged: dict[tuple[str, str], dict] = {}
    for entry in entries:
        key = (entry["classId"], entry["week"])
        if key not in merged:
            merged[key] = entry
            continue
        merged[key] = merge_entry(merged[key], entry)
    return list(merged.values())


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
    school_calendar = load_school_calendar(args.school_calendar_source)
    weekly_signals = school_calendar.get("weeklySignals", []) if isinstance(school_calendar, dict) else []
    if isinstance(weekly_signals, list):
        for signal in weekly_signals:
            normalized = normalize_entry(signal)
            if not normalized:
                continue
            entries.append(normalized)
    entries = consolidate_entries(entries)
    entries.sort(key=lambda item: (item["classId"], item["week"]))

    payload = {
        "updatedAt": dt.datetime.now().astimezone().isoformat(timespec="seconds"),
        "sourceType": "internal-json",
        "entries": entries,
    }
    holidays = load_holidays(args.holidays_source, tz_name=args.tz)
    if holidays:
        payload["holidays"] = holidays
    if isinstance(school_calendar, dict):
        school_events = school_calendar.get("events")
        if isinstance(school_events, list) and school_events:
            payload["schoolCalendar"] = school_events

    presentations = raw.get("presentations") if isinstance(raw, dict) else None
    if isinstance(presentations, dict):
        payload["presentations"] = presentations

    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Geschreven: {out_path} ({len(entries)} class-week entries)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
