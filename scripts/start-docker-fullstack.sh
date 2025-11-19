#!/bin/sh
set -euo pipefail

GATEWAY_DIR="/app/gateway"
DASHBOARD_DIR="/app/ui/dashboard"

PORT="${PORT:-3001}"
UI_PORT="${UI_PORT:-3000}"
NEXT_PUBLIC_API_BASE_URL="${NEXT_PUBLIC_API_BASE_URL:-http://localhost:${PORT}}"

cleanup() {
  if [ -n "${GW_PID:-}" ] && kill -0 "$GW_PID" 2>/dev/null; then
    kill "$GW_PID" 2>/dev/null || true
  fi
  if [ -n "${UI_PID:-}" ] && kill -0 "$UI_PID" 2>/dev/null; then
    kill "$UI_PID" 2>/dev/null || true
  fi
}

trap cleanup INT TERM

cd "$GATEWAY_DIR"
node dist/gateway/src/index.js &
GW_PID=$!

cd "$DASHBOARD_DIR"
NEXT_PUBLIC_API_BASE_URL="$NEXT_PUBLIC_API_BASE_URL" npx next start -p "$UI_PORT" -H 0.0.0.0 &
UI_PID=$!

wait -n "$GW_PID" "$UI_PID"
