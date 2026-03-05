#!/usr/bin/env python3
"""Export agenda rows for itslearning from rooster + jaarplanning."""

from __future__ import annotations

import argparse
import csv
import json
import re
from collections import defaultdict
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo


LESSON_ORDER = ("A", "B", "C")


@dataclass
class PlannedLesson:
    slot: str
    project: str
    lesson: str
    homework: str


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Maak itslearning-agenda CSV uit jaarplanning + zermelo rooster"
    )
    parser.add_argument(
        "-p",
        "--planning",
        default="js/jaarplanning-live.json",
        help="Pad naar jaarplanning-live JSON",
    )
    parser.add_argument(
        "-a",
        "--agenda",
        default="js/zermelo-agenda-live.json",
        help="Pad naar zermelo-agenda-live JSON",
    )
    parser.add_argument(
        "-o",
        "--output",
        default="exports/itslearning-agenda-export.csv",
        help="Output CSV pad",
    )
    parser.add_argument(
        "--tz",
        default="Europe/Amsterdam",
        help="Tijdzone voor datum/tijd kolommen",
    )
    parser.add_argument(
        "--vak",
        default="Nederlands",
        help="Vaknaam in export",
    )
    return parser.parse_args()


def normalize_class_id(raw: str) -> str:
    text = re.sub(r"\s+", "", str(raw or "")).upper()
    if text.startswith("G") and len(text) > 1:
        return text[1:]
    return text


def week_keys(dt_local: datetime) -> list[str]:
    iso_year, iso_week, _ = dt_local.isocalendar()
    wk = str(iso_week)
    wk2 = f"{iso_week:02d}"
    return [wk, wk2, f"W{wk2}", f"{iso_year}-W{wk2}"]


def normalize_lesson_row(row: object) -> PlannedLesson | None:
    if not isinstance(row, dict):
        if isinstance(row, str):
            text = row.strip()
            if text:
                return PlannedLesson(slot="", project=text, lesson="", homework="")
        return None

    slot = str(row.get("lessonKey", "")).strip().upper()
    project = str(row.get("project", "")).strip()
    lesson = str(row.get("lesson", "")).strip()
    homework = str(row.get("homework", "")).strip()
    if not project and not lesson and not homework:
        return None
    return PlannedLesson(slot=slot, project=project, lesson=lesson, homework=homework)


def ordered_lessons(lessons_raw: object) -> list[PlannedLesson]:
    if not isinstance(lessons_raw, list):
        return []

    keyed: dict[str, PlannedLesson] = {}
    fallback: list[PlannedLesson] = []
    for row in lessons_raw:
        lesson = normalize_lesson_row(row)
        if not lesson:
            continue
        if lesson.slot in LESSON_ORDER and lesson.slot not in keyed:
            keyed[lesson.slot] = lesson
        else:
            fallback.append(lesson)

    out = [keyed[slot] for slot in LESSON_ORDER if slot in keyed]
    out.extend(fallback)
    return out


def load_json(path: Path) -> dict:
    if not path.exists():
        raise FileNotFoundError(f"Bestand niet gevonden: {path}")
    raw = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(raw, dict):
        raise ValueError(f"Bestand is geen JSON object: {path}")
    return raw


def pick_week_entry(entries: list[dict], class_id: str, dt_local: datetime) -> dict | None:
    wkeys = [w.upper() for w in week_keys(dt_local)]
    for row in entries:
        if not isinstance(row, dict):
            continue
        if normalize_class_id(str(row.get("classId", ""))) != class_id:
            continue
        week = str(row.get("week", "")).strip().upper()
        if week in wkeys:
            return row

    # Fallback: jaargroepentry (1, 2, 3, 4)
    grade = class_id[:1]
    for row in entries:
        if not isinstance(row, dict):
            continue
        if normalize_class_id(str(row.get("classId", ""))) != grade:
            continue
        week = str(row.get("week", "")).strip().upper()
        if week in wkeys:
            return row
    return None


def lesson_for_event(week_lesson_counter: int, lessons: list[PlannedLesson]) -> PlannedLesson | None:
    if not lessons:
        return None
    if week_lesson_counter < len(lessons):
        return lessons[week_lesson_counter]
    return lessons[-1]


def build_title(vak: str, class_id: str, lesson: PlannedLesson | None, summary: str) -> str:
    base = f"{vak} {class_id}".strip()
    if lesson and lesson.project:
        base = f"{base} - {lesson.project}"
    if lesson and lesson.lesson:
        return f"{base}: {lesson.lesson}"[:180]
    if summary:
        return f"{base}: {summary}"[:180]
    return base[:180]


def build_description(
    lesson: PlannedLesson | None,
    items: list[str],
    note: str,
    summary: str,
    source_description: str,
) -> str:
    lines: list[str] = []
    if lesson:
        if lesson.project or lesson.lesson:
            left = lesson.project or "(geen project)"
            right = lesson.lesson or "(geen lesnaam)"
            lines.append(f"Programma: {left} | {right}")
        if lesson.homework:
            lines.append(f"Huiswerk: {lesson.homework}")

    for item in items:
        lines.append(f"- {item}")

    if note:
        lines.append(f"Notitie: {note}")

    if summary:
        lines.append(f"Rooster: {summary}")
    if source_description and source_description != summary:
        lines.append(source_description)

    return "\n".join(lines).strip()


def main() -> int:
    args = parse_args()
    tz = ZoneInfo(args.tz)

    planning_doc = load_json(Path(args.planning))
    agenda_doc = load_json(Path(args.agenda))

    planning_entries = planning_doc.get("entries") if isinstance(planning_doc.get("entries"), list) else []
    agenda_entries = agenda_doc.get("entries") if isinstance(agenda_doc.get("entries"), list) else []

    def sort_key(item: object) -> tuple:
        if not isinstance(item, dict):
            return ("", "")
        return (str(item.get("start", "")), str(item.get("classId", "")))

    sorted_agenda = sorted((e for e in agenda_entries if isinstance(e, dict)), key=sort_key)
    seen_per_week: dict[tuple[str, int, int], int] = defaultdict(int)

    rows: list[dict[str, str]] = []
    for event in sorted_agenda:
        class_id = normalize_class_id(str(event.get("classId", "")))
        if not class_id:
            continue

        start_raw = str(event.get("start", "")).strip()
        end_raw = str(event.get("end", "")).strip()
        if not start_raw or not end_raw:
            continue

        start_dt = datetime.fromisoformat(start_raw).astimezone(tz)
        end_dt = datetime.fromisoformat(end_raw).astimezone(tz)

        week_entry = pick_week_entry(planning_entries, class_id, start_dt)
        lessons = ordered_lessons(week_entry.get("lessons", []) if week_entry else [])

        yw = start_dt.isocalendar()
        week_key = (class_id, yw[0], yw[1])
        lesson_counter = seen_per_week[week_key]
        seen_per_week[week_key] += 1

        lesson = lesson_for_event(lesson_counter, lessons)
        items = []
        note = ""
        if week_entry:
            items = [str(x).strip() for x in week_entry.get("items", []) if str(x).strip()]
            note = str(week_entry.get("note", "")).strip()

        summary = str(event.get("summary", "")).strip()
        source_description = str(event.get("description", "")).strip()
        title = build_title(args.vak, class_id, lesson, summary)
        description = build_description(lesson, items, note, summary, source_description)

        rows.append(
            {
                "Datum": start_dt.strftime("%Y-%m-%d"),
                "Start": start_dt.strftime("%H:%M"),
                "Einde": end_dt.strftime("%H:%M"),
                "Klas": class_id,
                "Vak": args.vak,
                "Titel": title,
                "Beschrijving": description,
                "Huiswerk": lesson.homework if lesson else "",
                "Week": str(yw[1]),
                "Lesblok": lesson.slot if lesson else "",
                "RoosterUID": str(event.get("uid", "")).strip(),
            }
        )

    out_path = Path(args.output)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    with out_path.open("w", encoding="utf-8", newline="") as fh:
        writer = csv.DictWriter(
            fh,
            fieldnames=[
                "Datum",
                "Start",
                "Einde",
                "Klas",
                "Vak",
                "Titel",
                "Beschrijving",
                "Huiswerk",
                "Week",
                "Lesblok",
                "RoosterUID",
            ],
            delimiter=";",
        )
        writer.writeheader()
        writer.writerows(rows)

    print(f"Geschreven: {out_path} ({len(rows)} regels)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
