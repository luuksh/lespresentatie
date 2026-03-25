#!/bin/bash
set -euo pipefail

PID_FILE="/tmp/klassenplattegrond-local.pid"
SYNC_PID_FILE="/tmp/klassenplattegrond-zermelo-sync.pid"
PORT="${PORT:-4173}"
STOPPED=0

if [ -f "$SYNC_PID_FILE" ]; then
  SYNC_PID="$(cat "$SYNC_PID_FILE")"
  if kill "$SYNC_PID" >/dev/null 2>&1; then
    rm -f "$SYNC_PID_FILE"
    STOPPED=1
  fi
fi

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

if [ "$STOPPED" -eq 1 ]; then
  echo "Zermelo-sync gestopt."
  exit 0
fi

echo "Er draaide geen lokale docentomgeving."
