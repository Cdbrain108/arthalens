@echo off
REM Bullseye backend — Windows one-click start (tool research works without an LLM key)
cd /d "%~dp0\backend"
if not exist .venv (
  echo Creating venv...
  py -3.11 -m venv .venv
)
call .venv\Scripts\activate
pip install -r requirements.txt
if not exist "..\.env" copy "..\.env.example" "..\.env"
set PYTHONPATH=%CD%
uvicorn app.main:app --reload --port 8000
