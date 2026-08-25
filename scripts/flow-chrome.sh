#!/usr/bin/env bash
#
# flow-chrome.sh — manage a dedicated Chrome profile for Google Flow automation.
#
# Two-step pattern (see Decisions Log D020):
#   1. `login`  — open a PLAIN Chrome (no --remote-debugging-port) so Google
#                  allows sign-in. Sign in to your Google account, open Flow,
#                  confirm membership/credits, then close the window.
#   2. `attach` — reopen the SAME signed-in profile WITH --remote-debugging-port
#                  so the FlowAdapter / spike can attach over CDP. Keep this
#                  window open while the pipeline runs.
#
# Why two steps: Google blocks sign-in ("this browser or app may not be secure")
# when --remote-debugging-port is set. The signed-in profile is reused without
# ever loading the accounts sign-in page, so the block never triggers.
#
# Usage:
#   ./scripts/flow-chrome.sh login
#   ./scripts/flow-chrome.sh attach [--port 9222] [--profile-dir <path>]
#   ./scripts/flow-chrome.sh status [--port 9222]
#
# Env overrides:
#   FLOW_CHROME_BIN     — Chrome binary (default: google-chrome-stable)
#   FLOW_PROFILE_DIR    — profile directory (default: ./data/flow-chrome-profile)
#   FLOW_CDP_PORT       — debugging port (default: 9222)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

CHROME_BIN="${FLOW_CHROME_BIN:-google-chrome-stable}"
PROFILE_DIR="${FLOW_PROFILE_DIR:-$PROJECT_ROOT/data/flow-chrome-profile}"
PORT="${FLOW_CDP_PORT:-9222}"
FORWARD_PORT="${FLOW_CDP_FORWARD_PORT:-9223}"
FLOW_URL="https://labs.google/fx/tools/flow"

cmd="${1:-}"
shift || true

while [[ $# -gt 0 ]]; do
  case "$1" in
    --port) PORT="$2"; shift 2;;
    --profile-dir) PROFILE_DIR="$2"; shift 2;;
    *) echo "Unknown option: $1" >&2; exit 2;;
  esac
done

mkdir -p "$PROFILE_DIR"

case "$cmd" in
  login)
    echo ">> Opening PLAIN Chrome (no debugging flags) for Google sign-in."
    echo ">> Profile: $PROFILE_DIR"
    echo ">> 1. Sign in to your Google account."
    echo ">> 2. Go to $FLOW_URL and confirm you have access + credits."
    echo ">> 3. Close this Chrome window when done."
    echo ">> Then run: ./scripts/flow-chrome.sh attach"
    exec "$CHROME_BIN" \
      --user-data-dir="$PROFILE_DIR" \
      --no-first-run \
      --no-default-browser-check \
      "$FLOW_URL"
    ;;
  attach)
    echo ">> Reopening signed-in profile WITH CDP on port $PORT."
    echo ">> Profile: $PROFILE_DIR"
    echo ">> Keep this window open while the pipeline/spike runs."
    echo ">> CDP endpoint: http://127.0.0.1:$PORT (host)"
    echo ""
    echo ">> Starting socat forwarder for Docker containers..."
    echo ">>   0.0.0.0:$FORWARD_PORT → 127.0.0.1:$PORT"
    # Kill any existing socat on the forward port
    if command -v fuser >/dev/null 2>&1; then
      fuser -k "${FORWARD_PORT}/tcp" 2>/dev/null || true
    fi
    socat TCP-LISTEN:$FORWARD_PORT,fork,bind=0.0.0.0 TCP:127.0.0.1:$PORT &
    SOCAT_PID=$!
    echo ">>   socat PID: $SOCAT_PID"
    echo ">>   Docker containers can reach CDP at host.docker.internal:$FORWARD_PORT"
    echo ""
    # Start Chrome. When this exits, kill socat.
    "$CHROME_BIN" \
      --user-data-dir="$PROFILE_DIR" \
      --remote-debugging-port="$PORT" \
      --no-first-run \
      --no-default-browser-check \
      --restore-last-session=false \
      "$FLOW_URL"
    # Chrome closed — clean up socat
    kill $SOCAT_PID 2>/dev/null || true
    echo ">> Chrome closed. socat forwarder stopped."
    ;;
  status)
    echo ">> Checking CDP endpoint http://127.0.0.1:$PORT/json/version ..."
    if curl -sf "http://127.0.0.1:$PORT/json/version" >/dev/null 2>&1; then
      curl -s "http://127.0.0.1:$PORT/json/version" | head -c 400
      echo
      echo ">> CDP is reachable."
    else
      echo ">> CDP NOT reachable. Run: ./scripts/flow-chrome.sh attach"
      exit 1
    fi
    ;;
  *)
    echo "Usage: $0 {login|attach|status} [--port 9222] [--profile-dir <path>]" >&2
    exit 2
    ;;
esac
