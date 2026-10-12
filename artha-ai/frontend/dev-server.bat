@echo off
REM Detached dev-server launcher (used by the agent; keeps Vite running
REM after the calling shell exits). Logs to vite-dev.log in this folder.
cd /d "%~dp0"
npm run dev > vite-dev.log 2>&1
