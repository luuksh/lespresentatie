#!/bin/bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
OPEN_PATH="jaarplanning-studio.html" "$ROOT_DIR/scripts/start_local_docentomgeving.sh"

echo
echo "Jaarplanning Studio is geopend met de nieuwste lokale server."
