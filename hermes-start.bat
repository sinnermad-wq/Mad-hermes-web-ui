@echo off
REM hermes-start.bat v1.1 — Build + serve production dist (no dev server)
REM Usage: Double-click to start all services
REM
REM Services started:
REM   1. FastAPI backend (8080)
REM   2. Streamlit dashboard (8501, LAN-only)
REM   3. Web UI — production static serve (5173)

setlocal enabledelayedexpansion

REM ── Helpers ────────────────────────────────────────────────────────────────
set "UI_DIR=C:\Users\madwa\projects\hermes-web-ui"
set "API_DIR=%UI_DIR%\api_server"
set "BOT_DIR=C:\Users\madwa\projects\daily-xauusd-bot"

echo ========================================
echo  Hermes Web UI  —  v1.1
echo ========================================
echo.

REM ── 1. Build dist ──────────────────────────────────────────────────────────
echo [1/3] Building production dist...
pushd "%UI_DIR%"
call npm run build
if errorlevel 1 (
    popd
    echo BUILD FAILED — aborting.
    pause
    exit /b 1
)
echo Build OK.
popd
echo.

REM ── 2. API server (FastAPI, 8080) ─────────────────────────────────────────
echo [2/3] Starting Hermes API on :8080...
start "Hermes API" cmd /c "pushd \"%UI_DIR%\" && python -m uvicorn api_server.main:app --port 8080 --host 0.0.0.0 && popd"
echo   API:  http://localhost:8080
echo   Docs: http://localhost:8080/docs
echo.

REM ── 3. Streamlit dashboard (8501, internal) ────────────────────────────────
echo [3/3] Starting XAUUSD Dashboard on :8501 (LAN-only)...
start "XAUUSD Dashboard" cmd /c "pushd \"%BOT_DIR%\" && python -m streamlit run src/daily_xauusd_brief/dashboard.py --server.port 8501 --server.address 127.0.0.1 --server.headless true --server.enableCORS true --server.enableXsrfProtection false && popd"
echo   Dashboard: http://localhost:8501  ^(internal only^)
echo.

REM ── 4. Web UI — serve dist (5173) ──────────────────────────────────────────
echo [4/3] Starting Web UI on :5173...
start "Hermes Web UI" cmd /c "pushd \"%UI_DIR%\" && npx --yes serve dist -l 5173 -s && popd"
echo   Web UI: http://localhost:5173
echo.

REM ── Wait for services ──────────────────────────────────────────────────────
echo All services started.
echo   Web UI:   http://localhost:5173  ^(login page^)
echo   API:      http://localhost:8080/docs
echo   Dashboard: http://localhost:8501  ^(internal only^)
echo.
echo Press any key to open the Web UI...
pause >nul
start http://localhost:5173