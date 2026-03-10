#!/bin/sh
set -eu

if [ -z "${INTERNAL_HOST:-}" ]; then
  echo "Fout: INTERNAL_HOST ontbreekt." >&2
  exit 1
fi

if [ -z "${BASIC_AUTH_USER:-}" ]; then
  echo "Fout: BASIC_AUTH_USER ontbreekt." >&2
  exit 1
fi

if [ -z "${BASIC_AUTH_PASSWORD:-}" ]; then
  echo "Fout: BASIC_AUTH_PASSWORD ontbreekt." >&2
  exit 1
fi

export BASIC_AUTH_HASH="$(caddy hash-password --plaintext "${BASIC_AUTH_PASSWORD}")"

sed \
  -e "s|\{\$INTERNAL_HOST\}|${INTERNAL_HOST}|g" \
  -e "s|\{\$BASIC_AUTH_USER\}|${BASIC_AUTH_USER}|g" \
  -e "s|\{\$BASIC_AUTH_HASH\}|${BASIC_AUTH_HASH}|g" \
  /etc/caddy/Caddyfile.template > /etc/caddy/Caddyfile

exec caddy run --config /etc/caddy/Caddyfile --adapter caddyfile
