#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT_DIR"

BUILD_SCRIPT="scripts/build_jaarplanning_json.py"
OUT_JSON="js/jaarplanning-live.json"
PLAN_DIR="data/jaarplanning"

G1_FILE="$PLAN_DIR/Jaarplanning G1.xlsx"
G3_FILE="$PLAN_DIR/Jaarplanning G3.xlsx"
G4_FILE="$PLAN_DIR/Jaarplanning G4.xlsx"

NO_PUSH=0
if [[ "${1:-}" == "--no-push" ]]; then
  NO_PUSH=1
fi

if [[ ! -f "$BUILD_SCRIPT" ]]; then
  echo "Fout: build script ontbreekt: $BUILD_SCRIPT" >&2
  exit 1
fi

for f in "$G1_FILE" "$G3_FILE"; do
  if [[ ! -f "$f" ]]; then
    echo "Fout: ontbrekend bestand: $f" >&2
    exit 1
  fi
done

INPUTS=("$G1_FILE" "$G3_FILE")
if [[ -f "$G4_FILE" ]]; then
  INPUTS+=("$G4_FILE")
fi

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
