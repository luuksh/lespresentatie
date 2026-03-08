#!/usr/bin/env python3
"""Helpers for loading school holiday sources from ICS or JSON."""

from __future__ import annotations

import json
import re
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Any

try:
    from zoneinfo import ZoneInfo
except ImportError:  # pragma: no cover
    ZoneInfo = None


DEFAULT_TZ = "Europe/Amsterdam"


@dataclass
class Holiday:
    title: str
    start_date: date
    end_date: date
    source_id: str = ""

    def to_dict(self) -> dict[str, str]:
        out = {
            "title": self.title,
            "startDate": self.start_date.isoformat(),
            "endDate": self.end_date.isoformat(),
        }
        if self.source_id:
            out["id"] = self.source_id
        return out


def load_holidays(path: str | Path, tz_name: str = DEFAULT_TZ) -> list[dict[str, str]]:
    source_path = Path(path)
    if not source_path.exists():
        return []

    raw = source_path.read_text(encoding="utf-8")
    holidays = parse_holidays(raw, tz_name=tz_name)
    return [item.to_dict() for item in holidays]


def parse_holidays(raw: str, tz_name: str = DEFAULT_TZ) -> list[Holiday]:
    text = raw.lstrip("\ufeff").strip()
    if not text:
        return []

    if text.startswith("{") or text.startswith("["):
        return parse_json_holidays(text, tz_name=tz_name)
    return parse_ics_holidays(text, tz_name=tz_name)


def parse_json_holidays(raw: str, tz_name: str = DEFAULT_TZ) -> list[Holiday]:
    payload = json.loads(raw)
    rows: list[Any]
    if isinstance(payload, dict):
        rows = payload.get("events") if isinstance(payload.get("events"), list) else []
    elif isinstance(payload, list):
        rows = payload
    else:
        rows = []

    holidays: list[Holiday] = []
    for row in rows:
        if not isinstance(row, dict):
            continue
        title = str(row.get("summary") or row.get("title") or "").strip()
        start = parse_json_datetime(row.get("start"), tz_name=tz_name)
        end = parse_json_datetime(row.get("end"), tz_name=tz_name)
        if not title or not start or not end:
            continue
        holidays.append(
            Holiday(
                title=title,
                start_date=start,
                end_date=normalize_end_date(start, end, bool(row.get("allDay"))),
                source_id=str(row.get("id") or "").strip(),
            )
        )
    return dedupe_holidays(holidays)


def parse_json_datetime(value: Any, tz_name: str = DEFAULT_TZ) -> date | None:
    if not value:
        return None
    text = str(value).strip()
    if not text:
        return None
    try:
        dt = datetime.fromisoformat(text.replace("Z", "+00:00"))
    except ValueError:
        return None
    if dt.tzinfo is None:
        return dt.date()
    tzinfo = ZoneInfo(tz_name) if ZoneInfo is not None else dt.tzinfo
    return dt.astimezone(tzinfo).date()


def decode_ics_text(value: str) -> str:
    return (
        value.replace("\\n", "\n")
        .replace("\\N", "\n")
        .replace("\\,", ",")
        .replace("\\;", ";")
        .replace("\\\\", "\\")
        .strip()
    )


def unfold_ics_lines(text: str) -> list[str]:
    lines = text.splitlines()
    unfolded: list[str] = []
    for line in lines:
        if (line.startswith(" ") or line.startswith("\t")) and unfolded:
            unfolded[-1] += line[1:]
        else:
            unfolded.append(line)
    return unfolded


def parse_ics_events(text: str) -> list[dict[str, Any]]:
    events: list[dict[str, Any]] = []
    current: dict[str, Any] | None = None

    for line in unfold_ics_lines(text):
        if line == "BEGIN:VEVENT":
            current = {}
            continue
        if line == "END:VEVENT":
            if current:
                events.append(current)
            current = None
            continue
        if current is None or ":" not in line:
            continue

        left, right = line.split(":", 1)
        key_with_params = left.split(";")
        key = key_with_params[0].upper()
        params = {}
        for item in key_with_params[1:]:
            if "=" not in item:
                continue
            pkey, pval = item.split("=", 1)
            params[pkey.upper()] = pval

        current[key] = {"value": decode_ics_text(right), "params": params}
    return events


def get_ics_prop(event: dict[str, Any], key: str) -> tuple[str, dict[str, str]]:
    raw = event.get(key)
    if not isinstance(raw, dict):
        return "", {}
    return str(raw.get("value", "")), {
        str(k).upper(): str(v) for k, v in dict(raw.get("params", {})).items()
    }


def parse_ics_date(value: str, params: dict[str, str], tz_name: str = DEFAULT_TZ) -> date | None:
    text = value.strip()
    if not text:
        return None

    m_date = re.match(r"^(\d{4})(\d{2})(\d{2})$", text)
    if m_date:
        y, mo, d = map(int, m_date.groups())
        return date(y, mo, d)

    m_dt = re.match(r"^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})?(Z)?$", text)
    if not m_dt:
        return None

    y, mo, d, hh, mm, ss, zulu = m_dt.groups()
    second = int(ss or "0")
    if zulu:
        dt = datetime(
            int(y), int(mo), int(d), int(hh), int(mm), second, tzinfo=ZoneInfo("UTC")
        )
    else:
        tzid = params.get("TZID", "").strip()
        tzinfo = None
        if tzid and ZoneInfo is not None:
            try:
                tzinfo = ZoneInfo(tzid)
            except Exception:
                tzinfo = None
        dt = datetime(int(y), int(mo), int(d), int(hh), int(mm), second, tzinfo=tzinfo)

    if dt.tzinfo is None or ZoneInfo is None:
        return dt.date()
    return dt.astimezone(ZoneInfo(tz_name)).date()


def parse_ics_holidays(raw: str, tz_name: str = DEFAULT_TZ) -> list[Holiday]:
    holidays: list[Holiday] = []
    for event in parse_ics_events(raw):
        title, _ = get_ics_prop(event, "SUMMARY")
        uid, _ = get_ics_prop(event, "UID")
        start_value, start_params = get_ics_prop(event, "DTSTART")
        end_value, end_params = get_ics_prop(event, "DTEND")
        start = parse_ics_date(start_value, start_params, tz_name=tz_name)
        end = parse_ics_date(end_value, end_params, tz_name=tz_name)
        if not title or not start or not end:
            continue
        all_day = start_params.get("VALUE", "").upper() == "DATE" or bool(re.match(r"^\d{8}$", start_value.strip()))
        holidays.append(
            Holiday(
                title=title,
                start_date=start,
                end_date=normalize_end_date(start, end, all_day),
                source_id=uid,
            )
        )
    return dedupe_holidays(holidays)


def normalize_end_date(start: date, end: date, all_day: bool) -> date:
    if end < start:
        return start
    if all_day and end > start:
        return end - timedelta(days=1)
    return end


def dedupe_holidays(items: list[Holiday]) -> list[Holiday]:
    seen: set[tuple[str, date, date]] = set()
    out: list[Holiday] = []
    for item in sorted(items, key=lambda row: (row.start_date, row.end_date, row.title.lower())):
        key = (item.title.strip().lower(), item.start_date, item.end_date)
        if key in seen:
            continue
        seen.add(key)
        out.append(item)
    return out
