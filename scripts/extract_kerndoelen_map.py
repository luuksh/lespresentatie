#!/usr/bin/env python3
"""Extract the kerndoelen project matrix from the source workbook.

This parser avoids third-party dependencies by reading the XLSX archive
directly. It produces a normalized JSON file that can be consumed by the
internal studio and the leerlingplatform.
"""

from __future__ import annotations

import json
import re
import sys
import unicodedata
import xml.etree.ElementTree as ET
import zipfile
from collections import Counter
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path

NS = {"a": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
STATUS_MAP = {"X": "focus", "~": "support"}
EXPECTED_HEADERS = [
    "Kerndoel nr",
    "Kerndoel",
    "Subkerndoel code",
    "Subkerndoel",
    "Specificatie / Label",
    "Vaardigheid (Magister)",
    "Fase / leerjaar",
    "Specificatie",
    "Heel veel lezen",
    "Taaltopia",
    "Klasfeed",
    "Verweggers",
    "Poëzie",
    "Faalfestival",
    "Renaissance",
    "Technologie",
    "Taalmakers",
    "Netschrift",
    "V-rede",
    "Invloed",
    "Opmerking",
]


@dataclass(frozen=True)
class ProjectColumn:
    name: str
    index: int

    @property
    def project_id(self) -> str:
        return slugify(self.name)


def slugify(value: str) -> str:
    ascii_text = (
        unicodedata.normalize("NFKD", str(value or ""))
        .encode("ascii", "ignore")
        .decode("ascii")
        .lower()
    )
    return re.sub(r"[^a-z0-9]+", "-", ascii_text).strip("-")


def column_number(cell_ref: str) -> int:
    total = 0
    for char in cell_ref:
        if not char.isalpha():
            break
        total = (total * 26) + (ord(char.upper()) - 64)
    return total


def load_shared_strings(archive: zipfile.ZipFile) -> list[str]:
    if "xl/sharedStrings.xml" not in archive.namelist():
        return []
    root = ET.fromstring(archive.read("xl/sharedStrings.xml"))
    return [
        "".join(node.text or "" for node in item.iterfind(".//a:t", NS))
        for item in root.findall("a:si", NS)
    ]


def cell_value(cell: ET.Element, shared_strings: list[str]) -> str:
    cell_type = cell.attrib.get("t", "")
    value_node = cell.find("a:v", NS)
    if cell_type == "inlineStr":
        inline = cell.find("a:is", NS)
        return "".join(node.text or "" for node in inline.iterfind(".//a:t", NS)) if inline is not None else ""
    if value_node is None:
        return ""
    if cell_type == "s":
        index = int(value_node.text or "0")
        return shared_strings[index] if 0 <= index < len(shared_strings) else ""
    return value_node.text or ""


def load_rows(path: Path) -> list[list[str]]:
    with zipfile.ZipFile(path) as archive:
        shared_strings = load_shared_strings(archive)
        sheet = ET.fromstring(archive.read("xl/worksheets/sheet1.xml"))
        rows: list[list[str]] = []
        for row in sheet.findall(".//a:sheetData/a:row", NS):
            values: dict[int, str] = {}
            for cell in row.findall("a:c", NS):
                values[column_number(cell.attrib.get("r", ""))] = cell_value(cell, shared_strings)
            if not values:
                continue
            width = max(max(values), len(EXPECTED_HEADERS))
            rows.append([values.get(index, "").strip() for index in range(1, width + 1)])
        return rows


def note_from_row(row: list[str], project_columns: list[ProjectColumn], note_index: int) -> str:
    note = row[note_index].strip() if len(row) > note_index else ""
    spill_notes: list[str] = []
    for project in project_columns:
        value = row[project.index].strip() if len(row) > project.index else ""
        if value and value not in STATUS_MAP:
            spill_notes.append(value)
    all_notes = [item for item in [note, *spill_notes] if item]
    deduped: list[str] = []
    for item in all_notes:
        if item not in deduped:
            deduped.append(item)
    return " | ".join(deduped)


def project_states(row: list[str], project_columns: list[ProjectColumn]) -> dict[str, str]:
    output: dict[str, str] = {}
    for project in project_columns:
        value = row[project.index].strip() if len(row) > project.index else ""
        status = STATUS_MAP.get(value)
        if status:
            output[project.project_id] = status
    return output


def derive_project_stats(records: list[dict], project: ProjectColumn) -> dict[str, int]:
    counter = Counter(record["projects"].get(project.project_id, "") for record in records)
    return {
        "focus": counter.get("focus", 0),
        "support": counter.get("support", 0),
    }


def build_output(rows: list[list[str]], source_path: Path) -> dict:
    header = rows[0][: len(EXPECTED_HEADERS)]
    if header != EXPECTED_HEADERS:
        raise ValueError(f"Unexpected worksheet headers: {header!r}")

    project_columns = [
        ProjectColumn(name=header[index], index=index)
        for index in range(8, 20)
    ]
    note_index = 20

    records: list[dict] = []
    for row in rows[1:]:
        if not any(row[:7]):
            continue
        record = {
            "id": slugify(" ".join([row[5], row[2], row[4]]) or "record"),
            "kerndoelNumber": row[0],
            "kerndoel": row[1],
            "subgoalCode": row[2],
            "subgoal": row[3],
            "label": row[4],
            "magisterSkill": row[5],
            "phase": row[6],
            "specification": row[7],
            "note": note_from_row(row, project_columns, note_index),
            "projects": project_states(row, project_columns),
        }
        if not record["label"]:
            continue
        records.append(record)

    project_entries = []
    for project in project_columns:
        project_entries.append(
            {
                "id": project.project_id,
                "name": project.name,
                "column": project.index + 1,
                "assessmentSummary": "",
                "studentFacingDescription": "",
                "magisterNote": "",
                "teacherNotes": "",
                "stats": derive_project_stats(records, project),
            }
        )

    skills = sorted({record["magisterSkill"] for record in records if record["magisterSkill"]})
    goals = []
    seen_goals = set()
    for record in records:
        key = (record["kerndoelNumber"], record["subgoalCode"])
        if key in seen_goals:
            continue
        seen_goals.add(key)
        goals.append(
            {
                "kerndoelNumber": record["kerndoelNumber"],
                "kerndoel": record["kerndoel"],
                "subgoalCode": record["subgoalCode"],
                "subgoal": record["subgoal"],
            }
        )

    return {
        "schemaVersion": 1,
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "sourceWorkbook": str(source_path),
        "projects": project_entries,
        "magisterSkills": skills,
        "goals": goals,
        "records": records,
    }


def main(argv: list[str]) -> int:
    if len(argv) != 3:
        print("Usage: extract_kerndoelen_map.py <input.xlsx> <output.json>", file=sys.stderr)
        return 1
    source = Path(argv[1]).expanduser().resolve()
    target = Path(argv[2]).expanduser().resolve()
    rows = load_rows(source)
    target.parent.mkdir(parents=True, exist_ok=True)
    payload = build_output(rows, source)
    target.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
