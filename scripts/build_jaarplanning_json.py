#!/usr/bin/env python3
import argparse
import datetime as dt
import json
import posixpath
import re
from urllib.parse import parse_qs, urlparse
import zipfile
import xml.etree.ElementTree as ET
from pathlib import Path

NS = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"
REL_NS = "{http://schemas.openxmlformats.org/package/2006/relationships}"
DOC_REL_NS = "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}"


def read_shared_strings(zf):
    if "xl/sharedStrings.xml" not in zf.namelist():
        return []
    root = ET.fromstring(zf.read("xl/sharedStrings.xml"))
    out = []
    for si in root.findall(f".//{NS}si"):
        text = "".join((n.text or "") for n in si.findall(f".//{NS}t")).strip()
        out.append(text)
    return out


def read_sheet_hyperlinks(zf, sheet_path):
    links = {}
    if sheet_path not in zf.namelist():
        return links

    sheet_root = ET.fromstring(zf.read(sheet_path))
    rel_map = {}
    rel_path = posixpath.join(
        posixpath.dirname(sheet_path),
        "_rels",
        f"{posixpath.basename(sheet_path)}.rels",
    )
    if rel_path in zf.namelist():
        rel_root = ET.fromstring(zf.read(rel_path))
        for rel in rel_root.findall(f".//{REL_NS}Relationship"):
            rel_id = rel.attrib.get("Id", "")
            target = rel.attrib.get("Target", "")
            if rel_id and target:
                rel_map[rel_id] = target

    for hl in sheet_root.findall(f".//{NS}hyperlinks/{NS}hyperlink"):
        ref = hl.attrib.get("ref", "").strip()
        if not ref:
            continue
        rid = hl.attrib.get(f"{DOC_REL_NS}id", "").strip()
        location = hl.attrib.get("location", "").strip()
        target = rel_map.get(rid, "") if rid else ""
        url = target or location
        if url:
            links[ref] = url.strip()
    return links


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
    hyperlinks = read_sheet_hyperlinks(zf, sheet_path)
    return rows, hyperlinks


def workbook_sheets(zf):
    wb_path = "xl/workbook.xml"
    rels_path = "xl/_rels/workbook.xml.rels"
    if wb_path not in zf.namelist() or rels_path not in zf.namelist():
        return []

    wb_root = ET.fromstring(zf.read(wb_path))
    rel_root = ET.fromstring(zf.read(rels_path))
    rel_map = {}
    for rel in rel_root.findall(f".//{REL_NS}Relationship"):
        rel_id = rel.attrib.get("Id", "")
        target = rel.attrib.get("Target", "")
        if rel_id and target:
            rel_map[rel_id] = target

    out = []
    for sheet in wb_root.findall(f".//{NS}sheets/{NS}sheet"):
        name = sheet.attrib.get("name", "").strip()
        rid = sheet.attrib.get(f"{DOC_REL_NS}id", "").strip()
        target = rel_map.get(rid, "").strip()
        if not target:
            continue
        if target.startswith("/"):
            path = target.lstrip("/")
        elif target.startswith("xl/"):
            path = target
        else:
            path = posixpath.normpath(posixpath.join("xl", target))
        out.append((name, path))
    return out


def preferred_sheet_path(zf):
    sheets = workbook_sheets(zf)
    if not sheets:
        candidates = sorted(
            p for p in zf.namelist() if p.startswith("xl/worksheets/sheet") and p.endswith(".xml")
        )
        if not candidates:
            raise RuntimeError("Geen worksheet gevonden in XLSX")
        return candidates[0]

    priorities = [
        lambda n: n.strip().lower() == "jaaroverzicht (2)",
        lambda n: "(2)" in n.lower() and "jaaroverzicht" in n.lower(),
        lambda n: n.strip().lower() == "jaaroverzicht",
    ]
    for rule in priorities:
        for name, path in sheets:
            if rule(name) and path in zf.namelist():
                return path

    for _, path in sheets:
        if path in zf.namelist():
            return path
    raise RuntimeError("Worksheet pad uit workbook.xml niet gevonden in XLSX")


def extract_entries(path):
    with zipfile.ZipFile(path) as zf:
        sst = read_shared_strings(zf)
        rows, hyperlinks = parse_sheet(zf, preferred_sheet_path(zf), sst)

    header = rows.get(1, {})
    note_col = None
    local_url_col = None
    for col, value in header.items():
        name = value.strip().lower()
        if name in {"note", "notes", "opmerking", "opmerkingen", "notitie", "notities"}:
            note_col = col
            continue
        if name in {
            "localurl",
            "local_url",
            "local link",
            "local-link",
            "lokale link",
            "lokaal link",
            "lokaal bestand",
            "lokaalbestand",
        }:
            local_url_col = col

    def col_to_index(col):
        idx = 0
        for ch in col:
            idx = idx * 26 + (ord(ch) - ord("A") + 1)
        return idx

    class_cols = []
    last_year = ""
    for col, value in sorted(header.items(), key=lambda kv: col_to_index(kv[0])):
        raw = value.strip().upper()
        cid = ""
        if re.fullmatch(r"[1-4][A-Z]", raw):
            cid = raw
            last_year = raw[0]
        elif re.fullmatch(r"[1-4]\.\d+", raw):
            cid = raw
            last_year = raw[0]
        elif re.fullmatch(r"[A-Z]", raw) and last_year:
            cid = f"{last_year}{raw}"
        if cid:
            class_cols.append((col, cid))

    # Sommige jaarplanning-bestanden bevatten geen expliciete klasvlag-kolommen.
    # Dan leiden we de jaarlaag af uit de bestandsnaam en laten de rij gelden
    # voor alle parallelklassen binnen die laag.
    if not class_cols:
        name_upper = path.name.upper()
        m_grade = re.search(r"G([1-4])", name_upper)
        if m_grade:
            grade = m_grade.group(1)
            class_cols = [(f"_AUTO_{letter}", f"{grade}{letter}") for letter in "ABCDEFG"]

    def clean_cell(value):
        text = str(value or "").strip()
        if text.startswith("'"):
            text = text[1:].strip()
        if text.upper() in {"0", "FALSE"}:
            return ""
        return text

    def looks_like_local_path(text):
        t = clean_cell(text)
        if not t:
            return False
        u = t.upper()
        return (
            u.startswith("FILE:///")
            or u.startswith("/USERS/")
            or u.startswith("\\\\")
            or re.match(r"^[A-Z]:[\\/]", t) is not None
            or "ONEDRIVE" in u
        )

    def infer_local_url(row, row_index):
        # 1) Explicit local-url column takes precedence.
        if local_url_col:
            direct = clean_cell(row.get(local_url_col, "")) or hyperlinks.get(f"{local_url_col}{row_index}", "").strip()
            if looks_like_local_path(direct):
                return direct

        # 2) Scan all non-core columns for local path-like values.
        core_cols = {"A", "B", "C", "D", "E", note_col or ""}
        for col, value in row.items():
            if col in core_cols:
                continue
            if looks_like_local_path(value):
                return clean_cell(value)

        # 3) Fallback: hyperlinks on the row that look local.
        for ref, url in hyperlinks.items():
            if not ref.endswith(str(row_index)):
                continue
            if looks_like_local_path(url):
                return clean_cell(url)
        return ""

    out = []
    current_week = ""
    for r in sorted(k for k in rows.keys() if k > 1):
        row = rows[r]
        if clean_cell(row.get("A", "")):
            current_week = clean_cell(row.get("A", ""))
        if not current_week:
            continue

        project = clean_cell(row.get("C", ""))
        lesson_key = clean_cell(row.get("B", "")).upper()
        lesson = clean_cell(row.get("D", ""))
        lesson_url = hyperlinks.get(f"D{r}", "").strip()
        lesson_local_url = infer_local_url(row, r)
        extra = clean_cell(row.get("E", ""))
        note = clean_cell(row.get(note_col, "")) if note_col else ""
        if not any([project, lesson, extra]):
            continue

        lesson_obj = {
            "project": project,
            "lesson": lesson,
            "url": lesson_url,
            "lessonKey": lesson_key if lesson_key in {"A", "B", "C"} else "",
        }
        if lesson_local_url:
            lesson_obj["localUrl"] = lesson_local_url
        items = []
        if extra:
            items.append(extra)

        selected_classes = []
        for col, class_id in class_cols:
            flag = row.get(col, "").strip().upper()
            if flag in {"1", "1.0", "TRUE", "JA"}:
                selected_classes.append(class_id)

        # Fallback: als er geen klasvlag actief is, geldt de rij voor alle
        # klassen die in dit bestand voorkomen (bijv. alle G1-klassen).
        target_classes = selected_classes if selected_classes else [cid for _, cid in class_cols]

        for class_id in target_classes:
            out.append(
                {
                    "classId": class_id,
                    "week": current_week,
                    "lesson": lesson_obj,
                    "items": items,
                    "note": note,
                }
            )
    return out


def merge_entries(entries):
    def learning_tool_id(raw_url):
        text = str(raw_url or "").strip()
        if not text:
            return ""
        try:
            parsed = urlparse(text)
            params = parse_qs(parsed.query or "")
            lid = (params.get("LearningToolElementId") or [""])[0].strip()
            return lid
        except Exception:
            return ""

    # Learn local-path mappings from provided examples:
    # - exact remote URL -> local path
    # - itslearning LearningToolElementId -> local path
    url_to_local = {}
    id_to_local = {}
    for item in entries:
        lesson = item.get("lesson") or {}
        remote_url = str(lesson.get("url", "")).strip()
        local_url = str(lesson.get("localUrl", "")).strip()
        if not (remote_url and local_url):
            continue
        url_to_local.setdefault(remote_url, local_url)
        lid = learning_tool_id(remote_url)
        if lid:
            id_to_local.setdefault(lid, local_url)

    # Fill missing localUrl by learned mappings.
    for item in entries:
        lesson = item.get("lesson") or {}
        remote_url = str(lesson.get("url", "")).strip()
        local_url = str(lesson.get("localUrl", "")).strip()
        if local_url or not remote_url:
            continue
        learned = url_to_local.get(remote_url, "")
        if not learned:
            lid = learning_tool_id(remote_url)
            learned = id_to_local.get(lid, "") if lid else ""
        if learned:
            lesson["localUrl"] = learned

    merged = {}
    for e in entries:
        key = (e["classId"], str(e["week"]).strip())
        bucket = merged.setdefault(key, {"items": [], "notes": [], "lessons": []})
        lesson = e.get("lesson") or {}
        proj = str(lesson.get("project", "")).strip()
        les = str(lesson.get("lesson", "")).strip()
        url = str(lesson.get("url", "")).strip()
        local_url = str(lesson.get("localUrl", "")).strip()
        lkey = str(lesson.get("lessonKey", "")).strip().upper()
        if proj or les:
            candidate = {"project": proj, "lesson": les}
            if url:
                candidate["url"] = url
            if local_url:
                candidate["localUrl"] = local_url
            if lkey in {"A", "B", "C"}:
                candidate["lessonKey"] = lkey
            if candidate not in bucket["lessons"]:
                bucket["lessons"].append(candidate)
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
        obj = {
            "classId": class_id,
            "week": week,
            "lessons": data["lessons"],
            "items": data["items"],
        }
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
