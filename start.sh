#!/usr/bin/env bash
# Start AI News: local newspaper of daily AI news with source links.
# Usage: ./start.sh [port]
# Env overrides: PORT, CC_ROUTER_API_KEY (or ai-news/.env), AI_NEWS_MODEL, AI_NEWS_STALE_HOURS, AI_NEWS_MAX_AGE_DAYS
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PORT="${1:-${PORT:-4890}}"

if ! command -v node >/dev/null 2>&1; then
	echo "Node.js is required but was not found in PATH." >&2
	exit 1
fi

echo "Starting AI News on http://127.0.0.1:${PORT}/ (Ctrl+C to stop)"
exec env PORT="$PORT" node "$HERE/server.mjs"
