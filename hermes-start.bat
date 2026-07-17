@echo off
REM hermes-start.bat — Start hermes-web-ui services
REM Usage:
REM   hermes-start.bat          → dev mode (npm run dev)
REM   hermes-start.bat prod     → production mode (npm run build && serve)
REM   hermes-start.bat stop     → stop all services

set MODE=%1
set WEB_UI_DIR=C:\Users\madwa\projects\hermes-web-ui
set BOT_DIR=C:\Users\madwa\projects\daily-xauusd-bot

if "%MODE%"=="stop" goto :stop
if "%MODE%"=="prod" goto :prod
goto :dev

:dev
echo [DEV MODE] Starting Hermes services (dev mode)...
echo.

echo [1/3] Hermes API server — http://localhost:8080
start "Hermes API" cmd /c "cd /d %WEB_UI_DIR%\api_server && python -m uvicorn main:app --port 8080 --host 0.0.0.0 --reload"

timeout /t 2 /nobreak >nul

echo [2/3] XAUUSD Dashboard — http://localhost:8501 (LAN-only)
start "XAUUSD Dashboard" cmd /c "cd /d %BOT_DIR% && python -m streamlit run src/daily_xauusd_brief/dashboard.py --server.port 8501 --server.address 0.0.0.0 --server.headless true --server.enableCORS true --server.enableXsrfProtection false"

timeout /t 2 /nobreak >nul

echo [3/3] Web UI (dev) — http://localhost:5173
start "Hermes Web UI [DEV]" cmd /c "cd /d %WEB_UI_DIR% && npm run dev -- --host"

echo.
echo DEV services started:
echo   - Web UI (dev):  http://localhost:5173
echo   - API:           http://localhost:8080
echo   - Dashboard:     http://localhost:8501 ^(LAN-only^)
echo.
echo Press any key to open Web UI...
pause >nul
start http://localhost:5173
goto :eof

:prod
echo [PROD MODE] Building and serving hermes-web-ui...
echo.

REM Build Web UI
echo [BUILD] npm run build...
cd /d %WEB_UI_DIR%
call npm run build
if errorlevel 1 (
    echo BUILD FAILED
    pause
    exit /b 1
)

REM Start API server
echo [1/2] Hermes API server — http://localhost:8080
start "Hermes API [PROD]" cmd /c "cd /d %WEB_UI_DIR%\api_server && set HERMES_ENV=production && set JWT_SECRET=!JWT_SECRET! && set ALLOWED_ORIGINS=http://localhost:5173,http://192.168.31.233:5173 && python -m uvicorn main:app --port 8080 --host 0.0.0.0"

timeout /t 2 /nobreak >nul

REM Start Dashboard (LAN-only, no port forward)
echo [2/2] XAUUSD Dashboard — localhost:8501 ^(LAN-only^)
start "XAUUSD Dashboard" cmd /c "cd /d %BOT_DIR% && python -m streamlit run src/daily_xauusd_brief/dashboard.py --server.port 8501 --server.address 0.0.0.0 --server.headless true --server.enableCORS true --server.enableXsrfProtection false"

timeout /t 2 /nobreak >nul

REM Serve Web UI (production static)
echo [SERVE] Web UI (prod) — http://localhost:5173
start "Hermes Web UI [PROD]" cmd /c "cd /d %WEB_UI_DIR% && npx serve dist -l 5173 --single"

echo.
echo PROD services started:
echo   - Web UI (prod):  http://localhost:5173  ^(static, authenticated^)
echo   - API:            http://localhost:8080    ^(JWT protected^)
echo   - Dashboard:      http://localhost:8501  ^(LAN-only, no internet^)
echo.
echo IMPORTANT: Router must forward port 80 to this machine:5173
echo Press any key to open Web UI...
pause >nul
start http://localhost:5173
goto :eof

:stop
echo Stopping all Hermes services...
taskkill //F //IM python.exe //FI "WINDOWTITLE eq Hermes*" 2>nul
taskkill //F //IM python.exe //FI "WINDOWTITLE eq XAUUSD*" 2>nul
taskkill //F //IM node.exe //FI "WINDOWTITLE eq Hermes*" 2>nul
taskkill //F //IM serve.exe 2>nul
echo Done.
goto :eof