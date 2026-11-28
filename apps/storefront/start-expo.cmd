@echo off
title AGCTEK Storefront — Expo (web + Expo Go)
cd /d "%~dp0"
echo.
echo  Web:      http://127.0.0.1:8081/
echo  Expo Go:  scan the QR in this window (same Wi-Fi as this PC)
echo.
echo  Leave this window open while you develop.
echo.
call npm start
pause