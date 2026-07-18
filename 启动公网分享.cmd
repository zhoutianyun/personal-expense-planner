@echo off
setlocal enabledelayedexpansion

set "ROOT=C:\Users\Z1788\Desktop\bi ji"
set "SERVER_DIR=%ROOT%\server"
set "NODE_EXE=C:\Program Files\nodejs\node.exe"
set "NPM_CMD=C:\Program Files\nodejs\npm.cmd"
set "CLOUDFLARED_EXE=C:\Program Files (x86)\cloudflared\cloudflared.exe"

if not exist "%NODE_EXE%" (
  echo Node.js was not found.
  pause
  exit /b 1
)

if not exist "%NPM_CMD%" (
  echo npm was not found.
  pause
  exit /b 1
)

if not exist "%CLOUDFLARED_EXE%" (
  echo cloudflared was not found.
  pause
  exit /b 1
)

if not exist "%SERVER_DIR%\index.js" (
  echo Backend file was not found: %SERVER_DIR%\index.js
  pause
  exit /b 1
)

for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":3000" ^| findstr "LISTENING"') do (
  cmd /c taskkill /PID %%a /F >nul 2>nul
)

start "expense-planner-backend" cmd /k cd /d "%SERVER_DIR%" ^&^& "%NPM_CMD%" start
timeout /t 4 /nobreak >nul
start "expense-planner-public" cmd /k ""%CLOUDFLARED_EXE%" tunnel --url http://localhost:3000"

echo.
echo The backend and public tunnel are starting.
echo Keep both windows open while other people are visiting the site.
echo.
pause
