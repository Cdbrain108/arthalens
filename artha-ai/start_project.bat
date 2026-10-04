@echo off
echo ===================================================
echo   Starting Bullseye Demo Servers
echo ===================================================

REM Start Backend on Port 8000
start "Bullseye Backend (Port 8000)" cmd /k "cd /d %~dp0\backend && python -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload"

REM Start Frontend on Port 5173
start "Bullseye Frontend (Port 5173)" cmd /k "cd /d %~dp0\frontend && npm run dev -- --port 5173"

echo.
echo Servers are launching in separate windows!
echo Frontend URL: http://localhost:5173/
echo Backend URL:  http://127.0.0.1:8000/
echo.
pause
