#!/usr/bin/env python3
"""Fetch optional Zermelo roster JSON and normalize it for the app."""

from __future__ import annotations

import json
import os
import re
import ssl
import sys
from datetime import datetime, timezone
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


OUT_PATH = Path("js/zermelo-leerlingen-live.json")


def normalize_name(value: object) -> str:
    return re.sub(r"\s+", " ", str(value or "")).strip()


def number_to_letter(value: str) -> str:
    number = int(value)
    if number < 1 or number > 26:
        return ""
    return chr(64 + number)


def normalize_class_id(value: object) -> str:
    raw = re.sub(r"\s+", "", str(value or "")).upper()
    if not raw:
        return ""

    m_netl = re.match(r"^NETL(\d+)$", raw)
    if m_netl:
        letter = number_to_letter(m_netl.group(1))
        return f"G4{letter}" if letter else raw

    m_dot_netl = re.match(r"^G(\d)\.NETL(\d+)$", raw)
    if m_dot_netl:
        letter = number_to_letter(m_dot_netl.group(2))
        return f"G{m_dot_netl.group(1)}{letter}" if letter else raw

    if re.match(r"^G[1-6][A-Z]$", raw):
        return raw

    m_legacy = re.match(r"^([1-6])G(\d+)$", raw)
    if m_legacy:
        letter = number_to_letter(m_legacy.group(2))
        return f"G{m_legacy.group(1)}{letter}" if letter else raw

    return raw


def unique_names(values: list[str]) -> list[str]:
    seen: set[str] = set()
    out: list[str] = []
    for value in values:
        name = normalize_name(value)
        if not name:
            continue
        key = name.casefold()
        if key in seen:
            continue
        seen.add(key)
        out.append(name)
    return out


def students_from_value(value: object) -> list[str]:
    if isinstance(value, list):
        raw_names: list[str] = []
        for item in value:
            if isinstance(item, str):
                raw_names.append(item)
            elif isinstance(item, dict):
                raw_names.append(
                    str(
                        item.get("name")
                        or item.get("fullName")
                        or item.get("displayName")
                        or item.get("studentName")
                        or item.get("student")
                        or ""
                    )
                )
        return unique_names(raw_names)

    if isinstance(value, dict):
        for key in ("students", "names", "roster", "items", "users"):
            nested = value.get(key)
            if isinstance(nested, list):
                return students_from_value(nested)

    return []


def class_map_from_rows(rows: object) -> dict[str, list[str]]:
    out: dict[str, list[str]] = {}
    for row in rows if isinstance(rows, list) else []:
        if not isinstance(row, dict):
            continue
        class_id = normalize_class_id(
            row.get("classId")
            or row.get("class")
            or row.get("group")
            or row.get("groupName")
            or row.get("roster")
            or row.get("code")
        )
        if not class_id:
            continue

        students = students_from_value(
            row.get("students")
            or row.get("names")
            or row.get("roster")
            or row.get("items")
            or row.get("users")
        )
        if students:
            out[class_id] = students
            continue

        name = normalize_name(
            row.get("studentName")
            or row.get("name")
            or row.get("fullName")
            or row.get("displayName")
            or row.get("student")
        )
        if not name:
            continue
        out.setdefault(class_id, []).append(name)

    return {class_id: unique_names(names) for class_id, names in out.items() if unique_names(names)}


def merge_class_lists(out: dict[str, list[str]], source: object) -> dict[str, list[str]]:
    if not isinstance(source, dict):
        return out
    for raw_class_id, value in source.items():
        class_id = normalize_class_id(raw_class_id)
        students = students_from_value(value)
        if class_id and students:
            out[class_id] = students
    return out


def payload_to_class_map(payload: object) -> dict[str, list[str]]:
    if isinstance(payload, list):
        return class_map_from_rows(payload)
    if not isinstance(payload, dict):
        return {}

    classes = payload.get("classes")
    if isinstance(classes, dict):
        return merge_class_lists({}, classes)

    entries = payload.get("entries")
    if isinstance(entries, list):
        return class_map_from_rows(entries)

    data = payload.get("data")
    if isinstance(data, list):
        return class_map_from_rows(data)

    response = payload.get("response")
    if isinstance(response, dict) and isinstance(response.get("data"), list):
        return class_map_from_rows(response.get("data"))

    return merge_class_lists({}, payload)


def fetch_json(url: str) -> object:
    try:
        import certifi  # type: ignore

        context = ssl.create_default_context(cafile=certifi.where())
    except Exception:
        context = ssl.create_default_context()

    req = Request(url, headers={"User-Agent": "lespresentatie-zermelo-roster-sync/1.0"})
    with urlopen(req, timeout=30, context=context) as res:
        return json.loads(res.read().decode("utf-8", errors="replace"))


def main() -> int:
    source_url = os.getenv("ZERMELO_LEERLINGEN_URL", "").strip()
    if not source_url:
        print("ZERMELO_LEERLINGEN_URL not set; skipping roster sync.", file=sys.stderr)
        return 0

    try:
        payload = fetch_json(source_url)
    except HTTPError as exc:
        print(f"HTTP error while fetching Zermelo roster JSON: {exc.code}", file=sys.stderr)
        return 3
    except URLError as exc:
        print(f"URL error while fetching Zermelo roster JSON: {exc}", file=sys.stderr)
        return 4
    except json.JSONDecodeError as exc:
        print(f"Roster source is not valid JSON: {exc}", file=sys.stderr)
        return 5

    classes = payload_to_class_map(payload)
    if not classes:
        print("Roster source returned no recognizable class/student data.", file=sys.stderr)
        return 6

    out = {
        "updatedAt": datetime.now(timezone.utc).isoformat(),
        "sourceType": "zermelo-roster-json",
        "classes": dict(sorted(classes.items())),
    }
    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUT_PATH.write_text(json.dumps(out, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {len(classes)} classes to {OUT_PATH}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
