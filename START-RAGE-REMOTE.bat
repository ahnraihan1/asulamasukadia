@echo off
title RAGE - Remote HP Access (Cloudflare Tunnel)
cd /d "%~dp0"

echo ==========================================================
echo   RAGE // REMOTE ACCESS UNTUK HP (HTTPS VIA CLOUDFLARE)
echo ==========================================================

where node >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Node.js belum terinstal!
    pause
    exit /b 1
)

if not exist "dist\server\index.js" (
    echo [1/3] Membangun bundle client dan server...
    call npm run build
    if %ERRORLEVEL% NEQ 0 (
        echo [ERROR] Gagal build RAGE.
        pause
        exit /b 1
    )
)

set "CF_BIN="
where cloudflared >nul 2>nul
if %ERRORLEVEL% EQU 0 (
    for /f "delims=" %%I in ('where cloudflared') do if not defined CF_BIN set "CF_BIN=%%I"
)
if not defined CF_BIN if exist "C:\Program Files (x86)\cloudflared\cloudflared.exe" set "CF_BIN=C:\Program Files (x86)\cloudflared\cloudflared.exe"
if not defined CF_BIN if exist "C:\Program Files\cloudflared\cloudflared.exe" set "CF_BIN=C:\Program Files\cloudflared\cloudflared.exe"

if not defined CF_BIN (
    echo [ERROR] cloudflared tidak ditemukan!
    echo Instal sekali lewat terminal PowerShell:
    echo   winget install Cloudflare.cloudflared
    pause
    exit /b 1
)

powershell -NoProfile -Command "try { (Invoke-WebRequest -UseBasicParsing http://127.0.0.1:4000/api/v1/system/health -TimeoutSec 2) | Out-Null; exit 0 } catch { exit 1 }"
if %ERRORLEVEL% NEQ 0 (
    echo [2/3] Menyalakan server RAGE di port 4000...
    start "RAGE Core Server" /min cmd /c "node dist/server/index.js"
    timeout /t 3 /nobreak >nul
) else (
    echo [2/3] Server RAGE sudah aktif di port 4000.
)

echo [3/3] Membuka HTTPS Tunnel Cloudflare ke http://127.0.0.1:4000 ...
echo       Salin link https://xxxx.trycloudflare.com di bawah dan buka di browser HP!
echo       PENTING: Segera ubah password admin di menu Settings jika link aktif.
echo       Tekan Ctrl+C kapan saja untuk menutup akses dari luar jaringan.
echo.
"%CF_BIN%" tunnel --url http://127.0.0.1:4000 --no-autoupdate
pause
