#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
LOCAL_ENV_FILE="$ROOT_DIR/.zermelo.local.env"
PORT="${PORT:-4173}"
PID_FILE="/tmp/klassenplattegrond-local.pid"
LOG_FILE="/tmp/klassenplattegrond-local.log"
SYNC_PID_FILE="/tmp/klassenplattegrond-zermelo-sync.pid"
SYNC_LOG_FILE="/tmp/klassenplattegrond-zermelo-sync.log"
SYNC_INTERVAL_SECONDS="${ZERMELO_SYNC_INTERVAL_SECONDS:-300}"
URL="http://127.0.0.1:${PORT}/index.html"

if [[ -f "$LOCAL_ENV_FILE" ]]; then
  set -a
  # Load local-only secrets like the Zermelo iCal URL for the background sync.
  . "$LOCAL_ENV_FILE"
  set +a
fi

start_zermelo_sync_loop() {
  if [[ -z "${ZERMELO_ICAL_URL:-}" && -z "${ZERMELO_LEERLINGEN_URL:-}" ]]; then
    return 0
  fi

  if [[ -f "$SYNC_PID_FILE" ]]; then
    SYNC_PID="$(cat "$SYNC_PID_FILE" 2>/dev/null || true)"
    if [[ -n "${SYNC_PID:-}" ]] && kill -0 "$SYNC_PID" >/dev/null 2>&1; then
      return 0
    fi
    rm -f "$SYNC_PID_FILE"
  fi

  (
    cd "$ROOT_DIR"
    while true; do
      echo "[$(date '+%Y-%m-%d %H:%M:%S')] Zermelo-agenda verversen..." >>"$SYNC_LOG_FILE"
      if [[ -n "${ZERMELO_ICAL_URL:-}" ]] && ! python3 scripts/sync_zermelo_agenda.py >>"$SYNC_LOG_FILE" 2>&1; then
        echo "[$(date '+%Y-%m-%d %H:%M:%S')] Waarschuwing: Zermelo-sync mislukt; bestaande lokale agenda-feed blijft staan." >>"$SYNC_LOG_FILE"
      fi
      if [[ -n "${ZERMELO_LEERLINGEN_URL:-}" ]]; then
        echo "[$(date '+%Y-%m-%d %H:%M:%S')] Zermelo-leerlingen verversen..." >>"$SYNC_LOG_FILE"
        if ! python3 scripts/sync_zermelo_leerlingen.py >>"$SYNC_LOG_FILE" 2>&1; then
          echo "[$(date '+%Y-%m-%d %H:%M:%S')] Waarschuwing: leerlingen-sync mislukt; bestaande lokale leerlingenfeed blijft staan." >>"$SYNC_LOG_FILE"
        fi
      fi
      sleep "$SYNC_INTERVAL_SECONDS"
    done
  ) &
  echo "$!" > "$SYNC_PID_FILE"
}

start_zermelo_sync_loop

if command -v lsof >/dev/null 2>&1 && lsof -iTCP:"${PORT}" -sTCP:LISTEN >/dev/null 2>&1; then
  open "$URL"
  echo "Lokale docentomgeving draait al op $URL"
  if [[ -f "$SYNC_PID_FILE" ]]; then
    echo "Zermelo-sync draait op de achtergrond (interval ${SYNC_INTERVAL_SECONDS}s)"
  fi
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
if [[ -f "$SYNC_PID_FILE" ]]; then
  echo "Zermelo-synclog: $SYNC_LOG_FILE"
fi
