#!/bin/bash
set -euo pipefail

PID_FILE="/tmp/klassenplattegrond-local.pid"
PORT="${PORT:-4173}"

if [ -f "$PID_FILE" ]; then
  PID="$(cat "$PID_FILE")"
  if kill "$PID" >/dev/null 2>&1; then
    rm -f "$PID_FILE"
    echo "Lokale docentomgeving gestopt."
    exit 0
  fi
fi

if command -v lsof >/dev/null 2>&1; then
  PIDS="$(lsof -tiTCP:"$PORT" -sTCP:LISTEN || true)"
  if [ -n "$PIDS" ]; then
    kill $PIDS
    rm -f "$PID_FILE"
    echo "Lokale docentomgeving gestopt."
    exit 0
  fi
fi

echo "Er draaide geen lokale docentomgeving."
