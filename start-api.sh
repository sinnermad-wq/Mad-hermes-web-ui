#!/usr/bin/env bash
# hermes-api-server startup script (Unix/macOS/Linux)
# Requirements: pip install -r api_server/requirements.txt
# Then run: ./start-api.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "[hermes-api] Installing dependencies..."
pip install -r api_server/requirements.txt

echo
echo "[hermes-api] Starting on http://localhost:8080"
echo "[hermes-api] State db: ~/.hermes/state.db"
echo "[hermes-api] Press Ctrl+C to stop"
echo

python -m uvicorn api_server.main:app --port 8080 --host 0.0.0.0 --reload