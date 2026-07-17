#!/bin/bash
# hermes-start.sh — Start hermes-web-ui services
# Usage:
#   ./hermes-start.sh          → dev mode
#   ./hermes-start.sh prod     → production mode (npm run build && serve)
#   ./hermes-start.sh stop     → stop all services

MODE="${1:-dev}"
WEB_UI_DIR="$(cd "$(dirname "$0")" && pwd)"
BOT_DIR="$(dirname "$WEB_UI_DIR")/daily-xauusd-bot"
LOG_DIR="$WEB_UI_DIR/logs"
mkdir -p "$LOG_DIR"

# ─── Colours ────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'

log()  { echo -e "${GREEN}[hermes]${NC} $*"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $*" >&2; }
die()  { echo -e "${RED}[ERROR]${NC} $*" >&2; exit 1; }

# ─── PID helpers ─────────────────────────────────────────────────────────────
PIDFILE="$LOG_DIR/.pids"
save_pids() {
    echo "API_PID=$API_PID" > "$PIDFILE"
    echo "DASH_PID=$DASH_PID" >> "$PIDFILE"
    echo "UI_PID=$UI_PID" >> "$PIDFILE"
}

stop_services() {
    log "Stopping services..."
    if [ -f "$PIDFILE" ]; then
        source "$PIDFILE"
        kill $API_PID $DASH_PID $UI_PID 2>/dev/null
        rm -f "$PIDFILE"
    fi
    # Also kill by process name as fallback
    pkill -f "uvicorn main:app --port 8080" 2>/dev/null
    pkill -f "streamlit run.*dashboard" 2>/dev/null
    pkill -f "serve dist -l 5173" 2>/dev/null
    pkill -f "vite" 2>/dev/null
    log "Stopped."
    exit 0
}

# ─── Pre-flight ──────────────────────────────────────────────────────────────
if [ "$MODE" == "stop" ]; then stop_services; fi
if [ "$MODE" != "dev" ] && [ "$MODE" != "prod" ]; then
    die "Usage: $0 [dev|prod|stop]"
fi

# ─── Dev mode ────────────────────────────────────────────────────────────────
dev() {
    log "[DEV MODE] Starting Hermes services..."

    log "[1/3] Hermes API server — :8080"
    cd "$WEB_UI_DIR/api_server"
    python -m uvicorn main:app --port 8080 --host 0.0.0.0 --reload \
        >> "$LOG_DIR/api.log" 2>&1 &
    API_PID=$!

    sleep 2

    log "[2/3] XAUUSD Dashboard — :8501 (LAN-only)"
    cd "$BOT_DIR"
    python -m streamlit run src/daily_xauusd_brief/dashboard.py \
        --server.port 8501 --server.address 0.0.0.0 --server.headless true \
        --server.enableCORS true --server.enableXsrfProtection false \
        >> "$LOG_DIR/dashboard.log" 2>&1 &
    DASH_PID=$!

    sleep 2

    log "[3/3] Web UI (dev) — :5173"
    cd "$WEB_UI_DIR"
    npm run dev -- --host >> "$LOG_DIR/ui-dev.log" 2>&1 &
    UI_PID=$!

    save_pids
    log "DEV services started. PIDs: API=$API_PID DASH=$DASH_PID UI=$UI_PID"
    log "  Web UI (dev):  http://localhost:5173"
    log "  API:            http://localhost:8080"
    log "  Dashboard:      http://localhost:8501 (LAN-only)"
}

# ─── Prod mode ────────────────────────────────────────────────────────────────
prod() {
    log "[PROD MODE] Building and serving hermes-web-ui..."
    JWT_SECRET="${JWT_SECRET:-}"
    if [ -z "$JWT_SECRET" ]; then
        die "JWT_SECRET env var is required in production mode. Set: export JWT_SECRET=<your-secret>"
    fi

    log "[BUILD] npm run build..."
    cd "$WEB_UI_DIR"
    npm run build || die "Build failed"

    log "[1/2] Hermes API server — :8080"
    cd "$WEB_UI_DIR/api_server"
    HERMES_ENV=production \
    JWT_SECRET="$JWT_SECRET" \
    ALLOWED_ORIGINS="http://localhost:5173,http://192.168.31.233:5173" \
    python -m uvicorn main:app --port 8080 --host 0.0.0.0 \
        >> "$LOG_DIR/api-prod.log" 2>&1 &
    API_PID=$!

    sleep 2

    log "[2/2] XAUUSD Dashboard — :8501 (LAN-only)"
    cd "$BOT_DIR"
    python -m streamlit run src/daily_xauusd_brief/dashboard.py \
        --server.port 8501 --server.address 0.0.0.0 --server.headless true \
        --server.enableCORS true --server.enableXsrfProtection false \
        >> "$LOG_DIR/dashboard.log" 2>&1 &
    DASH_PID=$!

    sleep 2

    log "[SERVE] Web UI (prod) — :5173"
    cd "$WEB_UI_DIR"
    npx serve dist -l 5173 --single >> "$LOG_DIR/ui-prod.log" 2>&1 &
    UI_PID=$!

    save_pids
    log "PROD services started. PIDs: API=$API_PID DASH=$DASH_PID UI=$UI_PID"
    log "  Web UI (prod):  http://localhost:5173"
    log "  API:            http://localhost:8080  (JWT_SECRET set, ALLOWED_ORIGINS set)"
    log "  Dashboard:      http://localhost:8501 (LAN-only, NOT port-forwarded)"
    log ""
    warn "IMPORTANT: Router must forward port 80 → this machine:5173"
    warn "Dashboard :8501 must NOT be forwarded to the internet."
}

# ─── Run ─────────────────────────────────────────────────────────────────────
if [ "$MODE" == "prod" ]; then prod; else dev; fi