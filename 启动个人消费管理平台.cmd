@echo off
setlocal enabledelayedexpansion

set "ROOT=C:\Users\Z1788\Desktop\bi ji"
set "SERVER_DIR=%ROOT%\server"
set "NODE_EXE=C:\Program Files\nodejs\node.exe"
set "NPM_CMD=C:\Program Files\nodejs\npm.cmd"
set "HTML_FILE="

for %%F in ("%ROOT%\wangye\*.html") do (
  set "HTML_FILE=%%~fF"
  goto :found_html
)

:found_html
if not exist "%NODE_EXE%" (
  echo Node.js was not found. Please make sure Node.js is installed.
  pause
  exit /b 1
)

if not exist "%SERVER_DIR%\index.js" (
  echo Backend file was not found: %SERVER_DIR%\index.js
  pause
  exit /b 1
)

if not defined HTML_FILE (
  echo No HTML file was found in %ROOT%\wangye
  pause
  exit /b 1
)

netstat -ano | findstr ":3000" >nul
if errorlevel 1 (
  start "expense-planner-backend" cmd /k cd /d "%SERVER_DIR%" ^&^& "%NPM_CMD%" start
  timeout /t 3 /nobreak >nul
)

start "" "%HTML_FILE%"
exit /b 0
