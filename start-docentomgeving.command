#!/bin/bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
"$ROOT_DIR/scripts/start_local_docentomgeving.sh"

echo
echo "Je kunt dit Terminal-venster sluiten. De lokale omgeving blijft draaien."
