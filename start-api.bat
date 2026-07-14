@echo off
REM hermes-api-server startup script (Windows)
REM Requirements: pip install -r api_server/requirements.txt
REM Then run: start-api.bat

cd /d "%~dp0.."
echo [hermes-api] Installing dependencies...
pip install -r api_server/requirements.txt

echo.
echo [hermes-api] Starting on http://localhost:8080
echo [hermes-api] State db: %HERMES_HOME%\state.db (or ~/.hermes/state.db)
echo [hermes-api] Press Ctrl+C to stop
echo.

python -m uvicorn api_server.main:app --port 8080 --host 0.0.0.0 --reload