@echo off
REM Start both hermes-api-server and hermes-web-ui dev server
REM Run: start-all.bat

cd /d "%~dp0"

echo [hermes-api] Installing web-ui dependencies...
call npm install

echo.
echo [hermes-api] Installing API server dependencies...
pip install -r api_server/requirements.txt

echo.
echo [hermes-api] Starting API server on http://localhost:8080 ...
start "Hermes API" python -m uvicorn api_server.main:app --port 8080 --host 0.0.0.0 --reload

echo [hermes-api] Starting web-ui dev server on http://localhost:5173 ...
start "Hermes Web UI" npm run dev

echo.
echo Started:
echo   API  → http://localhost:8080
echo   Web  → http://localhost:5173
echo.
echo Set VITE_API_BASE_URL=http://localhost:8080 in .env.local to connect.