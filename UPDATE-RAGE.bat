@echo off
title RAGE - Update & Build dari GitHub
cd /d "%~dp0"

echo ==========================================================
echo   RAGE // UPDATE DARI GITHUB ^& REBUILD
echo ==========================================================

where git >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Git belum terinstal di PC ini!
    echo Silakan instal Git dari https://git-scm.com/downloads
    pause
    exit /b 1
)

where node >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Node.js belum terinstal di PC ini!
    echo Silakan instal Node.js v22.13+ / v24 LTS dari https://nodejs.org/
    pause
    exit /b 1
)

echo [1/3] Mengambil update terbaru dari GitHub (git pull)...
call git pull --ff-only
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Gagal menjalankan git pull. Pastikan tidak ada konflik lokal.
    pause
    exit /b 1
)

echo [2/3] Memastikan dependensi npm lengkap...
call npm install
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Gagal menjalankan npm install.
    pause
    exit /b 1
)

echo [3/3] Membangun ulang client dan server...
call npm run build
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Gagal menjalankan npm run build.
    pause
    exit /b 1
)

echo.
echo [SELESAI] Update berhasil! Jalankan START-RAGE.bat untuk membuka RAGE.
pause
