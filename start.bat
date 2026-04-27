@echo off
title ShadowSync — Local Arcade Console
echo.
echo  ╔══════════════════════════════════════════╗
echo  ║       SHADOWSYNC — STARTING UP...        ║
echo  ╚══════════════════════════════════════════╝
echo.

:: Install dependencies if node_modules is missing
if not exist "node_modules" (
    echo [1/2] Installing dependencies...
    call npm install
    echo.
) else (
    echo [1/2] Dependencies already installed.
)

:: Start the server in the background and open the browser
echo [2/2] Starting ShadowSync server on port 3000...
echo.

:: Open browser after a short delay
start "" "http://localhost:3000"

:: Start the Node server (foreground so the window stays open)
node server.js

pause
