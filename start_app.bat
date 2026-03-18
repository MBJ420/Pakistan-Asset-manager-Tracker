@echo off
setlocal
echo ===================================================
echo       Starting Fund Tracker Application
echo ===================================================

call stop_app.bat
echo.

cd /d "%~dp0"

echo [1/2] Starting Backend Server...
if not exist "backend\venv\Scripts\activate.bat" (
    echo Error: Backend virtual environment not found in backend\venv!
    echo Please ensure the setup was completed correctly.
    pause
    exit /b 1
)

start "Fund Tracker Backend" cmd /k "cd backend && call venv\Scripts\activate && uvicorn app.main:app --reload --port 8001"

echo Waiting for backend to initialize...
timeout /t 5 /nobreak >nul

echo [2/2] Starting Frontend Application...
cd frontend
if not exist "node_modules" (
    echo Error: Frontend node_modules not found! Installing dependencies...
    call npm install
)

call npm run electron:dev

echo Closing Launcher...
exit
