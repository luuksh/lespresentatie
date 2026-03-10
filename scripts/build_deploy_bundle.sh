#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
DIST_DIR="$ROOT_DIR/dist"
PUBLIC_DIR="$DIST_DIR/public"
INTERNAL_DIR="$DIST_DIR/internal"

rm -rf "$PUBLIC_DIR" "$INTERNAL_DIR"
mkdir -p "$PUBLIC_DIR" "$INTERNAL_DIR"

cp -R "$ROOT_DIR/docs/." "$PUBLIC_DIR/"
touch "$PUBLIC_DIR/.nojekyll"

internal_items=(
  "index.html"
  "leerlingen.html"
  "docent.html"
  "jaarplanning-studio.html"
  "presentatie-studio.html"
  "absenties.html"
  "opdracht.html"
  "leeglokaal.html"
  "timer.html"
  "favicon.svg"
  "DEPLOY_SECURITY.md"
  "css"
  "js"
  "lesdocs"
  "data"
  "intern"
  "l"
)

for item in "${internal_items[@]}"; do
  if [ -e "$ROOT_DIR/$item" ]; then
    cp -R "$ROOT_DIR/$item" "$INTERNAL_DIR/"
  fi
done

echo "Build klaar:"
echo "  Publiek:  $PUBLIC_DIR"
echo "  Intern:   $INTERNAL_DIR"
