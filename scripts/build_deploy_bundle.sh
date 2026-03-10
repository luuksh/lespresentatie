#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
DIST_DIR="$ROOT_DIR/dist"
PUBLIC_DIR="$DIST_DIR/public"
INTERNAL_DIR="$DIST_DIR/internal"

rm -rf "$PUBLIC_DIR" "$INTERNAL_DIR"
mkdir -p "$PUBLIC_DIR" "$INTERNAL_DIR"

public_items=(
  "index.html"
  "favicon.svg"
  "DEPLOY_SECURITY.md"
  "l"
  "intern"
  "css/student-portal.css"
  "css/internal-shell.css"
  "js/student-portal.js"
  "js/jaarplanning-live.json"
  "js/jaarplanning-live-20260308.json"
  "js/leerlingen_per_klas.json"
  "lesdocs"
)

for item in "${public_items[@]}"; do
  if [ -e "$ROOT_DIR/docs/$item" ]; then
    mkdir -p "$PUBLIC_DIR/$(dirname "$item")"
    cp -R "$ROOT_DIR/docs/$item" "$PUBLIC_DIR/$item"
  fi
done

cat > "$PUBLIC_DIR/.nojekyll" <<'EOF'
EOF

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
