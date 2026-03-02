#!/usr/bin/env python3
"""Fetch Zermelo iCal and convert to local JSON feed for the app."""

from __future__ import annotations

import json
import os
import re
import sys
from datetime import datetime, timezone
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

try:
    from zoneinfo import ZoneInfo
except ImportError:  # pragma: no cover
    ZoneInfo = None


OUT_PATH = Path("js/zermelo-agenda-live.json")
CLASS_PATTERNS = [
    re.compile(r"\bG\d[A-Z]\b"),
    re.compile(r"\b\d[A-Z]\b"),
    re.compile(r"\b\dG\d+\b"),
    re.compile(r"\b\d\.\d+\b"),
]


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


def parse_ics_events(text: str) -> list[dict]:
    events: list[dict] = []
    current: dict | None = None

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

        value = decode_ics_text(right)
        if key in current:
            if isinstance(current[key], list):
                current[key].append({"value": value, "params": params})
            else:
                current[key] = [current[key], {"value": value, "params": params}]
        else:
            current[key] = {"value": value, "params": params}

    return events


def get_prop(event: dict, key: str) -> tuple[str, dict]:
    raw = event.get(key)
    if not raw:
        return "", {}
    if isinstance(raw, list):
        raw = raw[0]
    return str(raw.get("value", "")), dict(raw.get("params", {}))


def parse_ics_datetime(value: str, params: dict) -> datetime | None:
    value = value.strip()
    if not value:
        return None

    m_date = re.match(r"^(\d{4})(\d{2})(\d{2})$", value)
    if m_date:
        y, mo, d = map(int, m_date.groups())
        return datetime(y, mo, d, 0, 0, 0)

    m_dt = re.match(r"^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})?(Z)?$", value)
    if not m_dt:
        return None

    y, mo, d, hh, mm, ss, z = m_dt.groups()
    second = int(ss or "0")
    if z:
        return datetime(
            int(y), int(mo), int(d), int(hh), int(mm), second, tzinfo=timezone.utc
        )

    tzid = params.get("TZID", "").strip()
    if tzid and ZoneInfo is not None:
        try:
            return datetime(
                int(y),
                int(mo),
                int(d),
                int(hh),
                int(mm),
                second,
                tzinfo=ZoneInfo(tzid),
            )
        except Exception:
            pass
    return datetime(int(y), int(mo), int(d), int(hh), int(mm), second)


def extract_class_id(*values: str) -> str:
    combined = "\n".join(values).upper()
    for pattern in CLASS_PATTERNS:
        match = pattern.search(combined)
        if match:
            return match.group(0)
    return ""


def to_entry(event: dict) -> dict | None:
    summary, _ = get_prop(event, "SUMMARY")
    description, _ = get_prop(event, "DESCRIPTION")
    location, _ = get_prop(event, "LOCATION")
    categories, _ = get_prop(event, "CATEGORIES")
    uid, _ = get_prop(event, "UID")
    x_class, _ = get_prop(event, "X-CLASS")
    start_val, start_params = get_prop(event, "DTSTART")
    end_val, end_params = get_prop(event, "DTEND")

    start = parse_ics_datetime(start_val, start_params)
    end = parse_ics_datetime(end_val, end_params)
    class_id = extract_class_id(x_class, summary, description, location, categories)
    if not class_id or not start or not end:
        return None

    def to_iso(dt: datetime) -> str:
        if dt.tzinfo is None:
            return dt.replace(tzinfo=timezone.utc).isoformat()
        return dt.astimezone(timezone.utc).isoformat()

    return {
        "classId": class_id,
        "start": to_iso(start),
        "end": to_iso(end),
        "summary": summary,
        "description": description,
        "location": location,
        "categories": categories,
        "uid": uid,
    }


def fetch_ics(url: str) -> str:
    req = Request(url, headers={"User-Agent": "lespresentatie-sync/1.0"})
    with urlopen(req, timeout=30) as res:
        return res.read().decode("utf-8", errors="replace")


def main() -> int:
    source_url = os.getenv("ZERMELO_ICAL_URL", "").strip()
    if not source_url:
        print("Missing env var ZERMELO_ICAL_URL", file=sys.stderr)
        return 2

    try:
        raw = fetch_ics(source_url)
    except HTTPError as exc:
        print(f"HTTP error while fetching iCal: {exc.code}", file=sys.stderr)
        return 3
    except URLError as exc:
        print(f"URL error while fetching iCal: {exc}", file=sys.stderr)
        return 4

    events = parse_ics_events(raw)
    entries = [entry for entry in (to_entry(ev) for ev in events) if entry]
    entries.sort(key=lambda item: (item["start"], item["classId"]))

    payload = {
        "updatedAt": datetime.now(timezone.utc).isoformat(),
        "sourceType": "zermelo-ical",
        "entries": entries,
    }
    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUT_PATH.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {len(entries)} entries to {OUT_PATH}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
