#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT_DIR"

BUILD_SCRIPT="scripts/build_jaarplanning_json.py"
OUT_JSON="js/jaarplanning-live.json"
PLAN_DIR_DEFAULT="data/jaarplanning"
ONEDRIVE_BASE="$HOME/Library/CloudStorage/OneDrive-WillibrordStichting/CGU-AFD-Nederlands - General"

NO_PUSH=0
if [[ "${1:-}" == "--no-push" ]]; then
  NO_PUSH=1
fi

find_grade_file() {
  local grade="$1"
  local env_var="JAARPLANNING_G${grade}_FILE"
  local env_path="${!env_var:-}"
  if [[ -n "$env_path" && -f "$env_path" ]] && is_valid_xlsx "$env_path"; then
    echo "$env_path"
    return 0
  fi

  local candidates=(
    "$ROOT_DIR/$PLAN_DIR_DEFAULT/Jaarplanning G${grade}.xlsx"
    "$ONEDRIVE_BASE/${grade} Nederlands/Jaarplanning G${grade}.xlsx"
  )
  local c
  for c in "${candidates[@]}"; do
    if [[ -f "$c" ]] && is_valid_xlsx "$c"; then
      echo "$c"
      return 0
    fi
  done

  if [[ -d "$ONEDRIVE_BASE" ]]; then
    local found
    found="$(find "$ONEDRIVE_BASE" -maxdepth 4 -type f -name "Jaarplanning G${grade}.xlsx" | head -n 1 || true)"
    if [[ -n "$found" && -f "$found" ]] && is_valid_xlsx "$found"; then
      echo "$found"
      return 0
    fi
  fi

  return 1
}

is_valid_xlsx() {
  local file_path="$1"
  python3 - "$file_path" <<'PY' >/dev/null 2>&1
import sys, zipfile
p = sys.argv[1]
try:
    with zipfile.ZipFile(p) as zf:
        zf.namelist()
except Exception:
    raise SystemExit(1)
raise SystemExit(0)
PY
}

if [[ ! -f "$BUILD_SCRIPT" ]]; then
  echo "Fout: build script ontbreekt: $BUILD_SCRIPT" >&2
  exit 1
fi

G1_FILE="$(find_grade_file 1 || true)"
G3_FILE="$(find_grade_file 3 || true)"
G4_FILE="$(find_grade_file 4 || true)"

for f in "$G1_FILE" "$G3_FILE"; do
  if [[ ! -f "$f" ]]; then
    echo "Fout: ontbrekend bestand voor verplichte jaarplanning (G1/G3)." >&2
    echo "Zoekpaden: OneDrive '$ONEDRIVE_BASE' en '$ROOT_DIR/$PLAN_DIR_DEFAULT'" >&2
    exit 1
  fi
done

INPUTS=("$G1_FILE" "$G3_FILE")
if [[ -f "$G4_FILE" ]]; then
  INPUTS+=("$G4_FILE")
fi

echo "Bronbestanden:"
printf ' - %s\n' "${INPUTS[@]}"
echo "Bouwen van $OUT_JSON ..."
python3 "$BUILD_SCRIPT" "${INPUTS[@]}" -o "$OUT_JSON"

if git diff --quiet -- "$OUT_JSON"; then
  echo "Geen wijzigingen in $OUT_JSON. Klaar."
  exit 0
fi

git add "$OUT_JSON"
COMMIT_MSG="Update jaarplanning live JSON ($(date '+%Y-%m-%d %H:%M'))"
git commit -m "$COMMIT_MSG"

if [[ "$NO_PUSH" -eq 1 ]]; then
  echo "Commit gemaakt, push overgeslagen (--no-push)."
  exit 0
fi

CURRENT_BRANCH="$(git rev-parse --abbrev-ref HEAD)"
git push origin "$CURRENT_BRANCH"
echo "Gepusht naar origin/$CURRENT_BRANCH"
