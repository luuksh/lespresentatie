#!/usr/bin/env python3
import argparse
import datetime as dt
import json
import re
import zipfile
import xml.etree.ElementTree as ET
from pathlib import Path

NS = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"


def read_shared_strings(zf):
    if "xl/sharedStrings.xml" not in zf.namelist():
        return []
    root = ET.fromstring(zf.read("xl/sharedStrings.xml"))
    out = []
    for si in root.findall(f".//{NS}si"):
        text = "".join((n.text or "") for n in si.findall(f".//{NS}t")).strip()
        out.append(text)
    return out


def parse_sheet(zf, sheet_path, sst):
    root = ET.fromstring(zf.read(sheet_path))
    rows = {}
    for cell in root.findall(f".//{NS}sheetData/{NS}row/{NS}c"):
        ref = cell.attrib.get("r", "")
        m = re.match(r"([A-Z]+)(\d+)", ref)
        if not m:
            continue
        col, row = m.group(1), int(m.group(2))
        t = cell.attrib.get("t", "")
        v = cell.find(f"{NS}v")
        val = ""
        if v is not None and v.text is not None:
            val = v.text.strip()
            if t == "s" and val.isdigit():
                idx = int(val)
                val = sst[idx] if idx < len(sst) else ""
        rows.setdefault(row, {})[col] = str(val).strip()
    return rows


def first_sheet_path(zf):
    sheets = sorted(
        p for p in zf.namelist() if p.startswith("xl/worksheets/sheet") and p.endswith(".xml")
    )
    if not sheets:
        raise RuntimeError("Geen worksheet gevonden in XLSX")
    return sheets[0]


def extract_entries(path):
    with zipfile.ZipFile(path) as zf:
        sst = read_shared_strings(zf)
        rows = parse_sheet(zf, first_sheet_path(zf), sst)

    header = rows.get(1, {})
    class_cols = []
    for col, value in header.items():
        cid = value.strip().upper()
        if re.fullmatch(r"[1-4][A-Z]", cid):
            class_cols.append((col, cid))

    out = []
    current_week = ""
    for r in sorted(k for k in rows.keys() if k > 1):
        row = rows[r]
        if row.get("A", "").strip():
            current_week = row.get("A", "").strip()
        if not current_week:
            continue

        project = row.get("C", "").strip()
        lesson = row.get("D", "").strip()
        extra = row.get("E", "").strip()
        note = row.get("L", "").strip()
        if not any([project, lesson, extra]):
            continue

        items = []
        main = " - ".join(x for x in [project, lesson] if x)
        if main:
            items.append(main)
        if extra:
            items.append(extra)

        for col, class_id in class_cols:
            flag = row.get(col, "").strip().upper()
            if flag not in {"1", "1.0", "TRUE", "JA"}:
                continue
            out.append(
                {
                    "classId": class_id,
                    "week": current_week,
                    "items": items,
                    "note": note,
                }
            )
    return out


def merge_entries(entries):
    merged = {}
    for e in entries:
        key = (e["classId"], str(e["week"]).strip())
        bucket = merged.setdefault(key, {"items": [], "notes": []})
        for it in e.get("items", []):
            t = it.strip()
            if t and t not in bucket["items"]:
                bucket["items"].append(t)
        n = e.get("note", "").strip()
        if n and n not in bucket["notes"]:
            bucket["notes"].append(n)

    payload = {
        "updatedAt": dt.datetime.now().astimezone().isoformat(timespec="seconds"),
        "entries": [],
    }
    for (class_id, week), data in sorted(merged.items(), key=lambda x: (x[0][0], x[0][1])):
        obj = {"classId": class_id, "week": week, "items": data["items"]}
        if data["notes"]:
            obj["note"] = " | ".join(data["notes"])
        payload["entries"].append(obj)
    return payload


def main():
    parser = argparse.ArgumentParser(description="Bouw jaarplanning JSON uit Excel-bestanden.")
    parser.add_argument("xlsx", nargs="+", help="Pad naar .xlsx bestand(en)")
    parser.add_argument(
        "-o",
        "--output",
        default="js/jaarplanning-live.json",
        help="Output JSON pad (default: js/jaarplanning-live.json)",
    )
    args = parser.parse_args()

    all_entries = []
    for raw in args.xlsx:
        path = Path(raw)
        if not path.exists():
            raise FileNotFoundError(f"Bestand niet gevonden: {path}")
        all_entries.extend(extract_entries(path))

    payload = merge_entries(all_entries)
    out = Path(args.output)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Geschreven: {out} ({len(payload['entries'])} class-week entries)")


if __name__ == "__main__":
    main()
