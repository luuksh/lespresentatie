#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT_DIR"

BUILD_INTERNAL_SCRIPT="scripts/build_jaarplanning_internal.py"
OUT_JSON="js/jaarplanning-live.json"
PLAN_DIR_DEFAULT="data/jaarplanning"
INTERNAL_SOURCE_DEFAULT="$PLAN_DIR_DEFAULT/jaarplanning-intern.json"

NO_PUSH=0
if [[ "${1:-}" == "--no-push" ]]; then
  NO_PUSH=1
fi

if [[ ! -f "$BUILD_INTERNAL_SCRIPT" ]]; then
  echo "Fout: build script ontbreekt: $BUILD_INTERNAL_SCRIPT" >&2
  exit 1
fi

INTERNAL_SOURCE="${JAARPLANNING_INTERNAL_FILE:-$ROOT_DIR/$INTERNAL_SOURCE_DEFAULT}"
if [[ ! -f "$INTERNAL_SOURCE" ]]; then
  echo "Fout: intern bronbestand niet gevonden: $INTERNAL_SOURCE" >&2
  exit 1
fi

echo "Bronmodus: internal"
echo "Bronbestand: $INTERNAL_SOURCE"
python3 "$BUILD_INTERNAL_SCRIPT" -i "$INTERNAL_SOURCE" -o "$OUT_JSON"

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
