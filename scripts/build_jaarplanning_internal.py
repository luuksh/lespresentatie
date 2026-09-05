#!/usr/bin/env python3
"""Build jaarplanning-live.json from internal JSON source."""

from __future__ import annotations

import argparse
import datetime as dt
import json
from pathlib import Path

try:
    from zoneinfo import ZoneInfo
except ImportError:  # pragma: no cover
    ZoneInfo = None

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
EXPECTED_LESSONS_BY_GRADE = {"1": 3, "3": 2, "4": 3}
DEFAULT_READING_DAY_BY_CLASS = {
    "1C": 4,
    "1D": 4,
    "3B": 2,
    "3C": 2,
    "3E": 2,
    "3F": 4,
    "4B": 4,
    "4C": 2,
    "4.2": 4,
    "4.3": 2,
}
BASE_SCHEDULE = {
    "1C": [
        {"slot": "A", "day": 1, "start": "10:50"},
        {"slot": "B", "day": 2, "start": "08:15"},
        {"slot": "C", "day": 4, "start": "12:50"},
    ],
    "1D": [
        {"slot": "A", "day": 2, "start": "14:40"},
        {"slot": "B", "day": 4, "start": "10:50"},
        {"slot": "C", "day": 5, "start": "08:15"},
    ],
    "3B": [
        {"slot": "A", "day": 2, "start": "09:00"},
        {"slot": "B", "day": 5, "start": "10:50"},
    ],
    "3C": [
        {"slot": "A", "day": 1, "start": "09:45"},
        {"slot": "B", "day": 2, "start": "10:50"},
    ],
    "3E": [
        {"slot": "A", "day": 2, "start": "09:45"},
        {"slot": "B", "day": 5, "start": "11:35"},
    ],
    "3F": [
        {"slot": "A", "day": 1, "start": "09:00"},
        {"slot": "B", "day": 4, "start": "11:35"},
    ],
    "4B": [
        {"slot": "A", "day": 4, "start": "08:15"},
        {"slot": "B", "day": 4, "start": "09:00"},
        {"slot": "C", "day": 5, "start": "09:00"},
    ],
    "4C": [
        {"slot": "A", "day": 1, "start": "12:50"},
        {"slot": "B", "day": 1, "start": "13:35"},
        {"slot": "C", "day": 2, "start": "12:50"},
    ],
}
ACTIVE_READING_LOCKS: dict[str, dict[str, int | str]] = {}
ACTIVE_AGENDA_SCHEDULE: dict[str, list[dict[str, int | str]]] = {}
REMOVED_PROJECT_TOKENS = ("leesclub",)
REMOVED_PROJECT_EXACT = {
    "escape room yde",
    "escape room yde / bkk",
    "uitloop / kerstquiz",
    "vosflix",
    "voxflix",
    "nutpot",
    "afscheid",
    "afscheid nemen",
    "startinfo",
}
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
    "Les 6b - Presentatie oefenen en generale repetitie": (
        "Oefen jullie volledige presentatie nog een keer: wie zegt wat, wat wijs je aan op de poster en welk voorbeeld laat je horen. "
        "netschrift en pen mee"
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
    parser.add_argument(
        "--agenda-source",
        default="js/zermelo-agenda-live.json",
        help="Pad naar Zermelo-agenda JSON voor vaste lesdagen",
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
    elif out["project"] in {"Heel veel lezen", "Leesmeters"}:
        homework = ensure_homework_contains(homework, "leesboek en schoolpasje mee")
    elif out["project"].startswith("Mentorles"):
        pass
    elif out["project"]:
        homework = ensure_homework_contains(homework, "netschrift en pen mee")
    if homework:
        out["homework"] = homework
    for key in ("lessonKey", "presentationId", "presentationMarkerId", "teacherNote"):
        value = str(row.get(key, "")).strip()
        if value:
            out[key] = value
    if row.get("preserveLessonKey"):
        out["preserveLessonKey"] = True
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
        "lessons": prioritize_lessons(class_id, regular_lessons),
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
    return text in REMOVED_PROJECT_EXACT or any(token in text for token in REMOVED_PROJECT_TOKENS)


def local_datetime(value: object, tz_name: str = DEFAULT_TZ) -> dt.datetime | None:
    text = str(value or "").strip()
    if not text:
        return None
    try:
        parsed = dt.datetime.fromisoformat(text.replace("Z", "+00:00"))
    except ValueError:
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=dt.timezone.utc)
    if ZoneInfo is not None:
        return parsed.astimezone(ZoneInfo(tz_name))
    return parsed.astimezone()


def agenda_subject_text(value: object) -> str:
    return " ".join(str(value or "").upper().replace(".", " ").split())


def is_dutch_agenda_entry(entry: dict) -> bool:
    text = f" {agenda_subject_text(entry.get('summary'))} {agenda_subject_text(entry.get('description'))} "
    return " NE " in text or " NETL " in text


def agenda_week_key(start: dt.datetime) -> str:
    iso = start.isocalendar()
    return f"{iso.year}-W{iso.week:02d}"


def load_agenda_schedule(path: str | Path, tz_name: str = DEFAULT_TZ) -> dict[str, list[dict[str, int | str]]]:
    source = Path(path)
    if not source.exists():
        return {}
    raw = json.loads(source.read_text(encoding="utf-8"))
    rows = raw.get("entries") if isinstance(raw, dict) else raw
    if not isinstance(rows, list):
        return {}

    weeks_by_class: dict[str, dict[str, list[dict]]] = {}
    for row in rows:
        if not isinstance(row, dict):
            continue
        start = local_datetime(row.get("start") or row.get("startTime") or row.get("startDateTime"), tz_name)
        end = local_datetime(row.get("end") or row.get("endTime") or row.get("endDateTime"), tz_name)
        class_id = canonical_planning_class_id(row.get("classId") or row.get("klas") or row.get("class") or "")
        normalized = {
            "classId": class_id,
            "start": start,
            "end": end,
            "summary": str(row.get("summary") or row.get("description") or "").strip(),
            "description": str(row.get("description") or "").strip(),
        }
        if not class_id or not start or not end or not is_dutch_agenda_entry(normalized):
            continue
        weeks_by_class.setdefault(class_id, {}).setdefault(agenda_week_key(start), []).append(normalized)

    schedules: dict[str, list[dict[str, int | str]]] = {}
    for class_id, weeks in weeks_by_class.items():
        if not weeks:
            continue
        max_count = max(len(entries) for entries in weeks.values())
        if max_count <= 0:
            continue
        complete_weeks = [
            sorted(entries, key=lambda item: item["start"])
            for entries in weeks.values()
            if len(entries) == max_count
        ]
        by_index: dict[int, dict[str, dict[str, int | str]]] = {}
        for entries in complete_weeks:
            for index, entry in enumerate(entries[:len(LESSON_SLOT_ORDER)]):
                start = entry["start"]
                end = entry["end"]
                signature = f"{start.isoweekday()}-{start.hour}:{start.minute}-{int((end - start).total_seconds())}"
                bucket = by_index.setdefault(index, {})
                current = bucket.get(signature, {})
                bucket[signature] = {
                    "slot": list(LESSON_SLOT_ORDER.keys())[index],
                    "day": start.isoweekday(),
                    "start": f"{start.hour:02d}:{start.minute:02d}",
                    "count": int(current.get("count", 0)) + 1,
                }
        schedule: list[dict[str, int | str]] = []
        for index, variants in sorted(by_index.items()):
            best = sorted(
                variants.values(),
                key=lambda item: (-int(item.get("count", 0)), int(item.get("day", 99)), minutes_from_time(item.get("start"))),
            )[0]
            schedule.append({key: value for key, value in best.items() if key != "count"})
        if schedule:
            schedules[class_id] = schedule
    return schedules


def class_grade(class_id: str) -> str:
    text = str(class_id or "").strip()
    if text[:1].upper() == "G" and text[1:2].isdigit():
        return text[1:2]
    return text[:1] if text[:1].isdigit() else ""


def canonical_planning_class_id(class_id: str) -> str:
    text = str(class_id or "").strip().upper()
    if text.startswith("G") and len(text) >= 3 and text[1].isdigit():
        return text[1:]
    return text


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


def minutes_from_time(value: object) -> int:
    text = str(value or "").strip()
    try:
        hour, minute = text.split(":", 1)
        return int(hour) * 60 + int(minute)
    except ValueError:
        return 99999


def normalize_time(value: object) -> str:
    minutes = minutes_from_time(value)
    if minutes >= 99999:
        return ""
    hour, minute = divmod(minutes, 60)
    return f"{hour:02d}:{minute:02d}"


def schedule_for_class(class_id: str) -> list[dict]:
    normalized_class = canonical_planning_class_id(class_id)
    return list(ACTIVE_AGENDA_SCHEDULE.get(normalized_class) or BASE_SCHEDULE.get(normalized_class, []))


def day_for_class_slot(class_id: str, lesson_key: str) -> int:
    clean_key = str(lesson_key or "").strip().upper()
    for slot in schedule_for_class(class_id):
        if slot.get("slot") == clean_key:
            return int(slot.get("day") or 0)
    return 0


def first_schedule_slot_for_day(class_id: str, day: object) -> dict | None:
    clean_day = normalize_weekday(day)
    slots = [
        slot
        for slot in schedule_for_class(class_id)
        if int(slot.get("day") or 0) == clean_day
    ]
    slots.sort(key=lambda slot: minutes_from_time(slot.get("start")))
    return slots[0] if slots else None


def schedule_slot_for_moment(class_id: str, day: object, start: object) -> dict | None:
    clean_day = normalize_weekday(day)
    clean_start = normalize_time(start)
    if not clean_day or not clean_start:
        return None
    for slot in schedule_for_class(class_id):
        if int(slot.get("day") or 0) == clean_day and normalize_time(slot.get("start")) == clean_start:
            return slot
    return None


def normalize_reading_locks(raw: object) -> dict[str, dict[str, int | str]]:
    if not isinstance(raw, dict):
        return {}

    out: dict[str, dict[str, int | str]] = {}
    for class_id, value in raw.items():
        normalized_class = canonical_planning_class_id(str(class_id))
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
        slot_day = day_for_class_slot(normalized_class, lesson_key)
        if normalized_class and slot_day:
            slot = next((item for item in schedule_for_class(normalized_class) if item.get("slot") == lesson_key), None)
            start = normalize_time(slot.get("start")) if slot else ""
            out[normalized_class] = {"day": slot_day, "start": start} if start else {"day": slot_day}
    return out


def reading_lesson_key_for_class(class_id: str) -> str:
    normalized_class = canonical_planning_class_id(class_id)
    lock = ACTIVE_READING_LOCKS.get(normalized_class, {})
    locked_slot = schedule_slot_for_moment(normalized_class, lock.get("day"), lock.get("start")) or first_schedule_slot_for_day(normalized_class, lock.get("day"))
    if locked_slot:
        return str(locked_slot.get("slot") or "A").strip().upper() or "A"
    default_slot = first_schedule_slot_for_day(
        normalized_class,
        DEFAULT_READING_DAY_BY_CLASS.get(normalized_class, 0),
    )
    return str(default_slot.get("slot") if default_slot else "A").strip().upper() or "A"


def expected_lessons_for_class(class_id: str) -> int | None:
    return EXPECTED_LESSONS_BY_GRADE.get(class_grade(class_id))


def lesson_slot_index(lesson: dict) -> int:
    key = str(lesson.get("lessonKey", "")).strip().upper()
    return LESSON_SLOT_ORDER.get(key, 99)


def is_reading_lesson(lesson: dict) -> bool:
    project = str(lesson.get("project", "")).strip().casefold()
    return (
        "leesclub" in project
        or "heel veel lezen" in project
        or "leesmeters" in project
    )


def make_heel_veel_lezen_lesson(source_lesson: dict, lesson_key: str) -> dict:
    out = dict(source_lesson)
    out["project"] = "Leesmeters"
    out["lesson"] = "Leesmeters"
    out["lessonKey"] = lesson_key
    out["presentationId"] = "project-heel-veel-lezen"
    out["homework"] = ensure_homework_contains(
        out.get("homework", "") if is_reading_lesson(source_lesson) else "",
        "leesboek en schoolpasje mee",
    )
    out.pop("presentationMarkerId", None)
    return out


def ensure_fixed_lesson_is_reading(class_id: str, lessons: list[dict]) -> list[dict]:
    if not lessons:
        return lessons

    ordered = [dict(lesson) for lesson in sorted(lessons, key=lesson_slot_index)]
    if not class_grade(class_id):
        return ordered
    project_lessons = [lesson for lesson in ordered if not is_reading_lesson(lesson)]
    reading_source = next((lesson for lesson in ordered if is_reading_lesson(lesson)), ordered[0])
    reading_lesson_key = reading_lesson_key_for_class(class_id)
    reading_lesson = make_heel_veel_lezen_lesson(reading_source, reading_lesson_key)
    lesson_count = min(expected_lessons_for_class(class_id) or len(ordered), len(LESSON_SLOT_ORDER))
    if class_grade(class_id) == "3" and any(
        str(lesson.get("project", "")).strip().casefold() == "grenzen van literatuur"
        for lesson in project_lessons
    ):
        lesson_count = min(len(project_lessons) + 1, len(LESSON_SLOT_ORDER))
    if any(lesson.get("preserveLessonKey") for lesson in ordered):
        output_by_key: dict[str, dict] = {}
        remaining_projects: list[dict] = []
        for lesson in project_lessons:
            current = dict(lesson)
            preserve_key = bool(current.pop("preserveLessonKey", False))
            key = str(current.get("lessonKey", "")).strip().upper()
            if preserve_key and key in LESSON_SLOT_ORDER and key != reading_lesson_key:
                current["lessonKey"] = key
                output_by_key[key] = current
            else:
                remaining_projects.append(current)

        output_by_key[reading_lesson_key] = reading_lesson
        remaining_iter = iter(remaining_projects)
        for key in LESSON_SLOT_ORDER:
            if key in output_by_key:
                continue
            lesson = next(remaining_iter, None)
            if lesson is None:
                continue
            lesson["lessonKey"] = key
            output_by_key[key] = lesson
            if len(output_by_key) >= lesson_count:
                break
        return sorted(output_by_key.values(), key=lesson_slot_index)

    output: list[dict] = []
    remaining_projects = iter(project_lessons[: max(0, lesson_count - 1)])
    for key in LESSON_SLOT_ORDER:
        if len(output) >= lesson_count:
            break
        if key == reading_lesson_key:
            output.append(reading_lesson)
            continue
        lesson = next(remaining_projects, None)
        if lesson is None:
            continue
        lesson["lessonKey"] = key
        output.append(lesson)
    if not any(is_reading_lesson(lesson) for lesson in output):
        output.append(reading_lesson)
    return sorted(output, key=lesson_slot_index)


def prioritize_lessons(class_id: str, lessons: list[dict]) -> list[dict]:
    if not lessons:
        return lessons

    ordered = [dict(lesson) for lesson in sorted(lessons, key=lesson_slot_index)]
    return ensure_fixed_lesson_is_reading(class_id, ordered)


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
            value = compile_marker_decks(value)
        kept[key] = value
    return kept


def normalize_slide(slide: object) -> dict | None:
    if not isinstance(slide, dict):
        return None
    return {
        "type": "bullets"
        if str(slide.get("type", "title")).strip().casefold() == "bullets"
        else "title",
        "title": str(slide.get("title", "")).strip(),
        "subtitle": str(slide.get("subtitle", "")).strip(),
        "showProjectLogo": bool(slide.get("showProjectLogo")),
        "items": [
            str(item).strip()
            for item in slide.get("items", [])
            if item and str(item).strip()
        ]
        if isinstance(slide.get("items"), list)
        else [],
    }


def ordered_marker_ids(presentation: dict, marker_decks: dict) -> list[str]:
    deleted_markers = {
        str(marker_id).strip()
        for marker_id in presentation.get("deletedMarkerIds", [])
        if marker_id and str(marker_id).strip()
    } if isinstance(presentation.get("deletedMarkerIds"), list) else set()
    current_markers = presentation.get("markers")
    if isinstance(current_markers, dict):
        known = [
            marker_id
            for marker_id, _index in sorted(
                current_markers.items(),
                key=lambda item: item[1] if isinstance(item[1], int) else 999999,
            )
            if marker_id in marker_decks and marker_id not in deleted_markers
        ]
        remaining = [marker_id for marker_id in marker_decks if marker_id not in known and marker_id not in deleted_markers]
        return [*known, *remaining]
    return [marker_id for marker_id in marker_decks.keys() if marker_id not in deleted_markers]


def compile_marker_decks(presentation: dict) -> dict:
    marker_decks = presentation.get("markerDecks")
    if not isinstance(marker_decks, dict):
        return presentation

    project_name = str(presentation.get("project", "")).strip()
    title = str(presentation.get("title", "") or project_name).strip() or project_name
    subtitle = str(presentation.get("subtitle", "") or project_name).strip() or project_name
    slides = [
        {
            "type": "title",
            "title": title,
            "subtitle": subtitle,
            "showProjectLogo": True,
        }
    ]
    markers: dict[str, int] = {}

    for marker_id in ordered_marker_ids(presentation, marker_decks):
        raw_deck = marker_decks.get(marker_id)
        if not isinstance(raw_deck, list):
            continue
        deck = [slide for slide in (normalize_slide(item) for item in raw_deck) if slide]
        if not deck:
            continue
        markers[marker_id] = len(slides)
        slides.extend(deck)

    out = dict(presentation)
    out["slides"] = slides
    out["markers"] = markers
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
    global ACTIVE_AGENDA_SCHEDULE, ACTIVE_READING_LOCKS

    args = parse_args()
    in_path = Path(args.input)
    out_path = Path(args.output)

    if not in_path.exists():
        raise FileNotFoundError(f"Inputbestand niet gevonden: {in_path}")

    raw = json.loads(in_path.read_text(encoding="utf-8"))
    ACTIVE_AGENDA_SCHEDULE = load_agenda_schedule(args.agenda_source, args.tz)
    normalized_reading_locks = normalize_reading_locks(raw.get("readingLocks") if isinstance(raw, dict) else None)
    ACTIVE_READING_LOCKS = {
        class_id: value
        for class_id, value in normalized_reading_locks.items()
    }
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
    if normalized_reading_locks:
        payload["readingLocks"] = normalized_reading_locks
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
