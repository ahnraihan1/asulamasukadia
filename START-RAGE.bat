@echo off
title RAGE - Roblox Account Generator Engine
cd /d "%~dp0"

echo ==========================================================
echo   RAGE // ROBLOX ACCOUNT GENERATOR ENGINE (PORTABLE)
echo ==========================================================

where node >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Node.js belum terinstal di PC ini!
    echo Silakan instal Node.js v22 LTS atau lebih baru dari https://nodejs.org/
    pause
    exit /b 1
)

if not exist "node_modules" (
    echo [1/3] Menginstal dependensi npm untuk pertama kali...
    call npm install
    if %ERRORLEVEL% NEQ 0 (
        echo [ERROR] Gagal menjalankan npm install.
        pause
        exit /b 1
    )
)

if not exist "dist\server\index.js" (
    echo [2/3] Membangun bundle client dan server...
    call npm run build
)

echo [3/3] Menjalankan server RAGE di http://127.0.0.1:4000 ...
start "" "http://127.0.0.1:4000"
call npm start
pause
