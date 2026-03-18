@echo off
echo Stopping Fund Tracker...
taskkill /F /IM "uvicorn.exe" /T >nul 2>&1
taskkill /F /IM "python.exe" /T >nul 2>&1
taskkill /F /IM "electron.exe" /T >nul 2>&1
taskkill /F /IM "node.exe" /T >nul 2>&1
echo All processes stopped.
