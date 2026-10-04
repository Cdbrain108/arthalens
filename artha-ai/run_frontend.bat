@echo off
REM Bullseye frontend — Windows one-click start
cd /d "%~dp0\frontend"
if not exist node_modules (
  echo Installing frontend deps...
  npm install
)
npm run dev
