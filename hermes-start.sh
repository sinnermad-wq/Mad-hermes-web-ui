#!/usr/bin/env bash
# hermes-start.sh — Start hermes-web-ui services (v1.1 hardening)
# LAN-only Dashboard. Web UI served as static dist/. Backend env-driven.

set -e

WEB_UI_DIR="$(cd "$(dirname "$0")" && pwd)"
BOT_DIR="$(dirname "$0")/../daily-xauusd-bot"
API_DIR="$WEB_UI_DIR/api_server"

# ─── env (LAN prod) ──────────────────────────────────────────────────────
export JWT_SECRET="${JWT_SECRET:-change-me-to-a-strong-random-32byte-secret}"
export ALLOWED_ORIGINS="${ALLOWED_ORIGINS:-http://localhost,http://127.0.0.1}"

echo "============================================================"
echo " Hermes Web UI v1.1 Hardening - LAN-only startup"
echo " ENV JWT_SECRET=${JWT_SECRET:0:4}..."
echo " ENV ALLOWED_ORIGINS=$ALLOWED_ORIGINS"
echo "============================================================"

# ─── 1. Backend (FastAPI, LAN only, :8080) ───────────────────────────────
echo "[1/3] Starting Hermes API on :8080 ..."
( cd "$API_DIR" && exec python -m uvicorn main:app --host 127.0.0.1 --port 8080 ) &

# ─── 2. Streamlit Dashboard (:8501, LAN-only — NOT external-forwarded) ─────
echo "[2/3] Starting XAUUSD Dashboard on :8501 (LAN-only) ..."
( cd "$BOT_DIR" && exec python -m streamlit run src/daily_xauusd_brief/dashboard.py \
    --server.port 8501 \
    --server.address 127.0.0.1 \
    --server.headless true \
    --server.enableCORS true \
    --server.enableXsrfProtection false \
    --server.folderWatchBlacklist src/daily_xauusd_brief/__pycache__ ) &

# ─── 3. Web UI (Vite prod build → static serve) ───────────────────────────
if [ ! -f "$WEB_UI_DIR/dist/index.html" ]; then
    echo "[3/3] First-time build: npm run build ..."
    ( cd "$WEB_UI_DIR" && npm run build )
fi

echo "[3/3] Serving static dist/ on :5173 ..."
( cd "$WEB_UI_DIR" && exec npx --yes serve dist -l 5173 -n ) &

echo "============================================================"
echo " All services launched."
echo "   - Web UI:    http://localhost:5173"
echo "   - API:       http://localhost:8080"
echo "   - Dashboard: http://localhost:8501  (LAN-only)"
echo "Press Ctrl+C to stop all."
echo "============================================================"

wait
