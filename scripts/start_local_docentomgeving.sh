#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
PORT="${PORT:-4173}"
PID_FILE="/tmp/klassenplattegrond-local.pid"
LOG_FILE="/tmp/klassenplattegrond-local.log"
URL="http://127.0.0.1:${PORT}/index.html"

if command -v lsof >/dev/null 2>&1 && lsof -iTCP:"${PORT}" -sTCP:LISTEN >/dev/null 2>&1; then
  open "$URL"
  echo "Lokale docentomgeving draait al op $URL"
  exit 0
fi

if ! command -v python3 >/dev/null 2>&1; then
  echo "python3 is niet gevonden op deze Mac." >&2
  exit 1
fi

cd "$ROOT_DIR"
python3 -m http.server "$PORT" --bind 127.0.0.1 >"$LOG_FILE" 2>&1 &
SERVER_PID=$!
echo "$SERVER_PID" > "$PID_FILE"

sleep 1
open "$URL"

echo "Lokale docentomgeving gestart op $URL"
echo "Serverlog: $LOG_FILE"
