@echo off
echo ========================================
echo Supplier Backend Server Startup
echo ========================================
echo.
cd /d "%~dp0backend"
echo Starting server...
echo.
node server.js
pause
