#!/usr/bin/env python3
"""Build jaarplanning-live.json from internal JSON source."""

from __future__ import annotations

import argparse
import datetime as dt
import json
from pathlib import Path

from calendar_sources import DEFAULT_TZ, load_holidays
from school_calendar_sources import load_school_calendar


NON_REGULAR_PREFIXES = (
    "cgu-week",
    "cgu week",
)

NON_REGULAR_EXACT = {
    "herfstvakantie",
    "kerstvakantie",
    "meivakantie",
    "voorjaarsvakantie",
    "zomervakantie",
}

LESSON_SLOT_ORDER = {"A": 0, "B": 1, "C": 2}
REMOVED_PROJECT_TOKENS = ("leesclub", "zinsbouwers")
TAALTOPIA_HOMEWORK_BY_LESSON = {
    "Les 1 - Naam, wereld en doelgroep": (
        "Bedenk 2 mogelijke namen voor jullie taal en noteer 3 woorden over de wereld of doelgroep. "
        "Als je online inspiratie wilt opzoeken, print dan maximaal 1 klein voorbeeld van een vlag, kaart of alfabet. "
        "netschrift en pen mee"
    ),
    "Les 2 - Klanken en schrift": (
        "Kies 5 klanken of lettercombinaties die bij jullie taal passen en schets 2 tekens. "
        "Als je voorbeelden online opzoekt, print dan maximaal 1 klein blad met letters of symbolen. "
        "netschrift en pen mee"
    ),
    "Les 3 - Woorden en betekenissen": (
        "Verzamel 6 woorden die jullie taal zeker nodig heeft en schrijf de Nederlandse betekenis erbij. "
        "Als je inspiratie online zoekt, print dan maximaal 1 klein lijstje of afbeelding. "
        "netschrift en pen mee"
    ),
    "Les 4 - Grammaticaregels": (
        "Bedenk 2 taalregels, bijvoorbeeld woordvolgorde, meervoud of vraagzin, en noteer bij elke regel 1 voorbeeldzin. "
        "Als je een online voorbeeld gebruikt, print dan maximaal 1 klein schema. "
        "netschrift en pen mee"
    ),
    "Les 5 - Voorbeeldgesprek": (
        "Schrijf 4 korte zinnen die in jullie gesprek kunnen voorkomen en bedenk wie welke zin kan zeggen. "
        "Als je iets digitaal uitwerkt, print het gespreksstrookje of schrijf het over. "
        "netschrift en pen mee"
    ),
    "Les 6 - Creatief extra en presenteren": (
        "Controleer of jullie poster compleet is en neem eventueel 1 geprinte afbeelding, titelstrook of pictogram mee. "
        "Bedenk ook wie wat zegt bij het presenteren. netschrift en pen mee"
    ),
}


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


def ensure_homework_contains(homework: str, required_text: str) -> str:
    homework = str(homework or "").strip()
    required_text = str(required_text or "").strip()
    if not required_text:
        return homework
    if not homework:
        return required_text
    if required_text.lower() in homework.lower():
        return homework
    return f"{homework} {required_text}"


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
    if out["project"] == "Taaltopia" and out["lesson"] in TAALTOPIA_HOMEWORK_BY_LESSON:
        homework = TAALTOPIA_HOMEWORK_BY_LESSON[out["lesson"]]
    elif out["project"] == "Heel veel lezen":
        homework = ensure_homework_contains(homework, "leesboek en schoolpasje mee")
    elif out["project"]:
        homework = ensure_homework_contains(homework, "netschrift en pen mee")
    if homework:
        out["homework"] = homework
    for key in ("lessonKey", "presentationId", "presentationMarkerId"):
        value = str(row.get(key, "")).strip()
        if value:
            out[key] = value
    if not out["project"] and not out["lesson"]:
        return {}
    if should_remove_project_text(out["project"]):
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

    note = str(row.get("note", "")).strip()
    converted_markers: list[str] = []
    regular_lessons: list[dict] = []
    for lesson in lessons:
        project = str(lesson.get("project", "")).strip()
        title = str(lesson.get("lesson", "")).strip()
        if is_non_regular_marker(project, title):
            converted_markers.append(project)
            continue
        regular_lessons.append(lesson)

    for marker in converted_markers:
        line = f"Geen reguliere lessen: {marker}."
        if line not in items:
            items.append(line)

    if converted_markers:
        prefix = "Geen reguliere lessen deze week"
        marker_text = ", ".join(converted_markers)
        marker_note = f"{prefix}: {marker_text}."
        if note:
            note_parts = [part.strip() for part in note.split(" | ") if part.strip()]
            if marker_note not in note_parts:
                note = f"{marker_note} | {note}"
        else:
            note = marker_note

    out = {
        "classId": class_id,
        "week": week,
        "lessons": reposition_grade_1_reading(class_id, regular_lessons),
        "items": items,
    }
    if note:
        out["note"] = note
    if not out["lessons"] and not out["items"] and not note:
        return {}
    return out


def is_non_regular_marker(project: str, lesson: str) -> bool:
    project_text = str(project or "").strip()
    if not project_text:
        return False
    normalized = project_text.casefold()
    if normalized in NON_REGULAR_EXACT:
        return True
    return normalized.startswith(NON_REGULAR_PREFIXES)


def should_remove_project_text(value: str) -> bool:
    text = str(value or "").strip().casefold()
    return any(token in text for token in REMOVED_PROJECT_TOKENS)


def is_grade_1_class(class_id: str) -> bool:
    return len(class_id) == 2 and class_id.startswith("1") and class_id[1].isalpha()


def lesson_slot_index(lesson: dict) -> int:
    key = str(lesson.get("lessonKey", "")).strip().upper()
    return LESSON_SLOT_ORDER.get(key, 99)


def is_reading_lesson(lesson: dict) -> bool:
    project = str(lesson.get("project", "")).strip().casefold()
    return (
        "leesclub" in project
        or "zinsbouwers" in project
        or "heel veel lezen" in project
    )


def make_heel_veel_lezen_lesson(source_lesson: dict, lesson_key: str) -> dict:
    out = dict(source_lesson)
    out["project"] = "Heel veel lezen"
    out["lesson"] = "Heel veel lezen"
    out["lessonKey"] = lesson_key
    out["presentationId"] = "project-heel-veel-lezen"
    out.pop("presentationMarkerId", None)
    return out


def reposition_grade_1_reading(class_id: str, lessons: list[dict]) -> list[dict]:
    if not is_grade_1_class(class_id) or len(lessons) != 3:
        return lessons

    ordered = [dict(lesson) for lesson in sorted(lessons, key=lesson_slot_index)]
    reading_lessons = [lesson for lesson in ordered if is_reading_lesson(lesson)]
    if len(reading_lessons) != 1:
        return lessons

    reading_lesson = make_heel_veel_lezen_lesson(reading_lessons[0], "A")
    project_lessons = [lesson for lesson in ordered if not is_reading_lesson(lesson)]
    shifted = [reading_lesson, *project_lessons]
    for key, lesson in zip(("A", "B", "C"), shifted):
        lesson["lessonKey"] = key
    return shifted


def filter_presentations(presentations: dict) -> dict:
    kept: dict = {}
    for key, value in presentations.items():
        if should_remove_project_text(key):
            continue
        if isinstance(value, dict):
            project = str(value.get("project", "")).strip()
            title = str(value.get("title", "")).strip()
            if should_remove_project_text(project) or should_remove_project_text(title):
                continue
        kept[key] = value
    return kept


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
    payload["sourceRevision"] = payload["updatedAt"]
    holidays = load_holidays(args.holidays_source, tz_name=args.tz)
    if holidays:
        payload["holidays"] = holidays
    if isinstance(school_calendar, dict):
        school_events = school_calendar.get("events")
        if isinstance(school_events, list) and school_events:
            payload["schoolCalendar"] = school_events

    presentations = raw.get("presentations") if isinstance(raw, dict) else None
    if isinstance(presentations, dict):
        payload["presentations"] = filter_presentations(presentations)

    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Geschreven: {out_path} ({len(entries)} class-week entries)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
