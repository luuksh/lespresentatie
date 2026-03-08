#!/usr/bin/env python3
"""Load school-year agenda data from the Excel export."""

from __future__ import annotations

import re
import zipfile
from collections import defaultdict
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Any
from xml.etree import ElementTree as ET


NS = {
    "a": "http://schemas.openxmlformats.org/spreadsheetml/2006/main",
    "r": "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
}
GRADE_SHEETS = {"G1", "G2", "G3", "G4", "G5", "G6", "AL", "PE"}
EXCEL_EPOCH = datetime(1899, 12, 30)

NO_LESSON_PATTERNS = [
    r"\bgeen les\b",
    r"\blesvrij\b",
    r"\broostervrije dag\b",
    r"\bpersoneelsdag\b",
    r"\bgoede vrijdag\b",
    r"\beerste paasdag\b",
    r"\btweede paasdag\b",
    r"\bnieuwjaarsdag\b",
    r"\bhemelvaart\b",
    r"\bpinksteren\b",
    r"\bsuikerfeest\b",
    r"\bvakantie\b",
]
SHORT_SCHEDULE_PATTERNS = [
    r"30['\"]\s*-?\s*rooster",
    r"30['\"]rooster",
    r"30 minuten",
    r"verkort lesrooster",
]
ASSESSMENT_PATTERNS = [
    r"\brep\b",
    r"\binh rep\b",
    r"\btoetsdag\b",
    r"\btoetsweek\b",
    r"\bse\b",
    r"\binhalen se\b",
    r"\bmondelingen\b",
]
EVENT_PATTERNS = [
    r"\bexcursie\b",
    r"\bbezoek\b",
    r"\bweek van de vakkenvoorlichting\b",
    r"\bcguweek\b",
    r"\bcgu-week\b",
    r"\bopen lesmiddag\b",
]


def load_school_calendar(path: str | Path) -> dict[str, list[dict[str, Any]]]:
    source = Path(path)
    if not source.exists():
        return {"events": [], "weeklySignals": []}

    payload = parse_school_calendar_xlsx(source)
    return payload


def parse_school_calendar_xlsx(path: Path) -> dict[str, list[dict[str, Any]]]:
    with zipfile.ZipFile(path) as archive:
        shared = load_shared_strings(archive)
        rels = load_relationship_map(archive)
        workbook = ET.fromstring(archive.read("xl/workbook.xml"))

        raw_events: list[dict[str, Any]] = []
        for sheet in workbook.find("a:sheets", NS) or []:
            sheet_name = sheet.attrib.get("name", "")
            if sheet_name not in GRADE_SHEETS:
                continue
            rel_id = sheet.attrib.get(f"{{{NS['r']}}}id", "")
            target = rels.get(rel_id, "")
            if not target:
                continue
            raw_events.extend(load_sheet_events(archive, target, shared, sheet_name))

    events = [event for event in (classify_event(row) for row in raw_events) if event]
    weekly = build_weekly_signals(events)
    return {"events": events, "weeklySignals": weekly}


def load_relationship_map(archive: zipfile.ZipFile) -> dict[str, str]:
    root = ET.fromstring(archive.read("xl/_rels/workbook.xml.rels"))
    return {
        rel.attrib["Id"]: rel.attrib["Target"]
        for rel in root
        if rel.attrib.get("Target", "").startswith("worksheets/")
    }


def load_shared_strings(archive: zipfile.ZipFile) -> list[str]:
    if "xl/sharedStrings.xml" not in archive.namelist():
        return []
    root = ET.fromstring(archive.read("xl/sharedStrings.xml"))
    out: list[str] = []
    for item in root:
        texts = [node.text or "" for node in item.iter(f"{{{NS['a']}}}t")]
        out.append("".join(texts))
    return out


def load_sheet_events(
    archive: zipfile.ZipFile,
    target: str,
    shared_strings: list[str],
    scope: str,
) -> list[dict[str, Any]]:
    root = ET.fromstring(archive.read(f"xl/{target}"))
    rows = root.find("a:sheetData", NS)
    if rows is None:
        return []

    headers: list[str] | None = None
    events: list[dict[str, Any]] = []
    for row in rows:
        values = [cell_value(cell, shared_strings) for cell in row]
        if headers is None:
            headers = [str(v or "").strip() for v in values]
            continue
        if not any(str(v or "").strip() for v in values):
            continue
        item = {headers[idx]: values[idx] if idx < len(values) else "" for idx in range(len(headers))}
        item["scope"] = scope
        events.append(item)
    return events


def cell_value(cell: ET.Element, shared_strings: list[str]) -> str:
    value_node = cell.find("a:v", NS)
    if value_node is None:
        return ""
    raw = value_node.text or ""
    if cell.attrib.get("t") == "s":
        index = int(raw)
        return shared_strings[index] if 0 <= index < len(shared_strings) else ""
    return raw


def classify_event(row: dict[str, Any]) -> dict[str, Any] | None:
    title = normalize_text(row.get("Title_Event", ""))
    start = parse_iso_day(row.get("Start_Event", ""))
    end = parse_iso_day(row.get("End_Event", ""))
    scope = normalize_text(row.get("scope", ""))
    if not title or not start or not end or not scope:
        return None

    grade = scope if re.fullmatch(r"G[1-6]", scope) else "ALL"
    lower = title.lower()
    signals: list[str] = []
    impact = "info"

    if matches_any(lower, NO_LESSON_PATTERNS):
        impact = "no_lessons"
        signals.append("no_lessons")
    elif matches_any(lower, SHORT_SCHEDULE_PATTERNS):
        impact = "short_schedule"
        signals.append("short_schedule")
    elif any(token in lower for token in ["llbespr", "leerlingbespreking"]):
        impact = "short_schedule"
        signals.extend(["short_schedule", "student_review"])
    elif "klasbespreking" in lower:
        impact = "staff_day"
        signals.append("staff_day")
    elif matches_any(lower, ASSESSMENT_PATTERNS):
        impact = "assessment"
        signals.append("assessment")
    elif matches_any(lower, EVENT_PATTERNS):
        impact = "event"
        signals.append("event")
    else:
        signals.append("info")

    if "llbespr" in lower or "leerlingbespreking" in lower:
        signals.append("student_review")
    if matches_any(lower, ASSESSMENT_PATTERNS):
        signals.append("assessment")

    return {
        "title": title,
        "scope": scope,
        "grade": grade,
        "startDate": start.isoformat(),
        "endDate": normalize_end_date(start, end).isoformat(),
        "impact": impact,
        "signals": sorted(set(signals)),
    }


def normalize_text(value: Any) -> str:
    return re.sub(r"\s+", " ", str(value or "")).strip()


def matches_any(text: str, patterns: list[str]) -> bool:
    return any(re.search(pattern, text, flags=re.IGNORECASE) for pattern in patterns)


def parse_iso_day(value: Any) -> date | None:
    text = normalize_text(value)
    if not text:
        return None
    if "T" in text:
        text = text.split("T", 1)[0]
    try:
        return date.fromisoformat(text)
    except ValueError:
        try:
            return (EXCEL_EPOCH + timedelta(days=float(text))).date()
        except Exception:
            return None


def normalize_end_date(start: date, end: date) -> date:
    if end <= start:
        return start
    return end - timedelta(days=1)


def build_weekly_signals(events: list[dict[str, Any]]) -> list[dict[str, Any]]:
    grouped: dict[tuple[str, int, int], list[dict[str, Any]]] = defaultdict(list)
    for event in events:
        start = date.fromisoformat(event["startDate"])
        end = date.fromisoformat(event["endDate"])
        current = start
        while current <= end:
            iso = current.isocalendar()
            grouped[(event["grade"], iso.year, iso.week)].append({**event, "date": current.isoformat()})
            current += timedelta(days=1)

    out: list[dict[str, Any]] = []
    for (grade, iso_year, iso_week), rows in sorted(grouped.items()):
        notes: list[str] = []
        short_days = sorted({row["date"] for row in rows if "short_schedule" in row.get("signals", [])})
        no_lessons = sorted({row["date"] for row in rows if "no_lessons" in row.get("signals", [])})
        assessments = [row for row in rows if "assessment" in row.get("signals", [])]
        events_only = [row for row in rows if row.get("impact") == "event"]

        if no_lessons:
            notes.append(f"Geen les volgens schoolagenda: {format_days(no_lessons)}.")
        if short_days:
            notes.append(f"30-minutenrooster volgens schoolagenda: {format_days(short_days)}.")
        if len(assessments) >= 2:
            assessment_bits = [f"{format_short_date(row['date'])} {row['title']}" for row in assessments[:4]]
            notes.append(
                "Hoge toetsdruk deze week; plan geen afrondende projecten. "
                + "; ".join(assessment_bits)
                + ("" if len(assessments) <= 4 else " ...")
            )
        elif len(assessments) == 1:
            row = assessments[0]
            notes.append(f"Toetsdruk: {format_short_date(row['date'])} {row['title']}.")
        for row in events_only[:3]:
            notes.append(f"Schoolagenda: {format_short_date(row['date'])} {row['title']}.")

        if not notes:
            continue
        out.append(
            {
                "classId": grade,
                "week": str(iso_week),
                "isoWeek": f"{iso_year}-W{iso_week:02d}",
                "items": notes,
                "events": rows,
            }
        )
    return out


def format_days(days: list[str]) -> str:
    return ", ".join(format_short_date(day) for day in days)


def format_short_date(value: str) -> str:
    dt = date.fromisoformat(value)
    return dt.strftime("%d-%m")
