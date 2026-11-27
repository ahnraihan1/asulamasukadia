import { execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

export type WindowSplitMode = 'AUTO' | 'COLUMNS' | 'GRID';

export interface WindowRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

const DEFAULT_WORKING_AREA: WindowRect = {
  x: 0,
  y: 0,
  width: 1920,
  height: 1040,
};

let cachedWorkingArea: { area: WindowRect; expiresAt: number } | null = null;

/**
 * Menghitung jumlah kolom dan baris split layar berdasarkan total worker & mode layout.
 * Mengembalikan null bila totalWorkers <= 1 (tidak perlu split).
 */
export function computeGridDimensions(
  totalWorkers: number,
  layoutMode: WindowSplitMode = 'AUTO'
): { cols: number; rows: number } | null {
  const n = Math.max(1, Math.floor(totalWorkers));
  if (n <= 1) return null;

  if (layoutMode === 'COLUMNS') {
    return { cols: n, rows: 1 };
  }

  if (layoutMode === 'GRID') {
    const cols = Math.ceil(Math.sqrt(n));
    const rows = Math.ceil(n / cols);
    return { cols, rows };
  }

  // AUTO: 2 -> 2x1, 3 -> 3x1 (tinggi penuh agar form Roblox & CAPTCHA nyaman),
  // 4 -> 2x2, 5..6 -> 3x2, 7..8 -> 4x2, 9..10 -> 5x2, >10 -> otomatis tambah baris proporsional
  if (n <= 3) {
    return { cols: n, rows: 1 };
  }
  const rows = n <= 10 ? 2 : n <= 18 ? 3 : Math.ceil(Math.sqrt(n));
  const cols = Math.ceil(n / rows);
  return { cols, rows };
}

/**
 * Menghitung koordinat (x, y, width, height) untuk workerId (1-based) agar seluruh
 * jendela terbagi rapi mengisi area kerja monitor tanpa bertumpuk.
 */
export function computeWorkerWindowRect(params: {
  workerId: number;
  totalWorkers: number;
  workingArea: WindowRect;
  layoutMode?: WindowSplitMode;
}): WindowRect | null {
  const dims = computeGridDimensions(params.totalWorkers, params.layoutMode ?? 'AUTO');
  if (!dims) return null;

  const idx = Math.max(0, Math.min(params.totalWorkers - 1, Math.floor(params.workerId) - 1));
  const row = Math.floor(idx / dims.cols);
  const col = idx % dims.cols;

  const areaX = Math.round(params.workingArea.x);
  const areaY = Math.round(params.workingArea.y);
  const areaW = Math.max(320, Math.round(params.workingArea.width));
  const areaH = Math.max(240, Math.round(params.workingArea.height));

  const x0 = areaX + Math.floor((col * areaW) / dims.cols);
  const x1 = areaX + Math.floor(((col + 1) * areaW) / dims.cols);
  const y0 = areaY + Math.floor((row * areaH) / dims.rows);
  const y1 = areaY + Math.floor(((row + 1) * areaH) / dims.rows);

  return {
    x: x0,
    y: y0,
    width: Math.max(320, x1 - x0),
    height: Math.max(240, y1 - y0),
  };
}

/**
 * Mengambil resolusi WorkingArea monitor utama Windows (dikurangi Taskbar),
 * sudah sadar DPI melalui `SetProcessDPIAware()`.
 */
export async function getWindowsWorkingArea(forceRefresh = false): Promise<WindowRect> {
  if (process.platform !== 'win32') {
    return { ...DEFAULT_WORKING_AREA };
  }
  if (!forceRefresh && cachedWorkingArea && cachedWorkingArea.expiresAt > Date.now()) {
    return { ...cachedWorkingArea.area };
  }

  const psScript = `
Add-Type -AssemblyName System.Windows.Forms
Add-Type @"
using System;
using System.Runtime.InteropServices;
public static class RageDpi {
  [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
}
"@
try { [RageDpi]::SetProcessDPIAware() | Out-Null } catch {}
$wa = [System.Windows.Forms.Screen]::PrimaryScreen.WorkingArea
Write-Output "$($wa.X),$($wa.Y),$($wa.Width),$($wa.Height)"
`;

  const resolved = await new Promise<WindowRect>((resolve) => {
    execFile(
      'powershell.exe',
      ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', psScript],
      { windowsHide: true, timeout: 4000 },
      (err, stdout) => {
        if (!err && stdout) {
          const parts = stdout
            .trim()
            .split(',')
            .map((v) => Number.parseInt(v, 10));
          if (parts.length === 4 && parts.every((n) => Number.isFinite(n)) && parts[2] >= 640 && parts[3] >= 400) {
            resolve({ x: parts[0], y: parts[1], width: parts[2], height: parts[3] });
            return;
          }
        }
        resolve({ ...DEFAULT_WORKING_AREA });
      }
    );
  });

  cachedWorkingArea = { area: resolved, expiresAt: Date.now() + 30_000 };
  return { ...resolved };
}

/**
 * Memperbarui ukuran & posisi awal window di `xulstore.json` profil salinan worker Firefox
 * supaya Firefox tidak langsung membuka jendela `maximized` menutupi worker lain.
 */
export function patchFirefoxXulstoreRect(profileDir: string, rect: WindowRect): void {
  const xulPath = path.join(profileDir, 'xulstore.json');
  let store: Record<string, any> = {};

  if (fs.existsSync(xulPath)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(xulPath, 'utf8'));
      if (parsed && typeof parsed === 'object') {
        store = parsed as Record<string, any>;
      }
    } catch {
      store = {};
    }
  }

  const browserUrl = 'chrome://browser/content/browser.xhtml';
  if (!store[browserUrl] || typeof store[browserUrl] !== 'object') {
    store[browserUrl] = {};
  }
  const existingMain =
    store[browserUrl]['main-window'] && typeof store[browserUrl]['main-window'] === 'object'
      ? store[browserUrl]['main-window']
      : {};

  store[browserUrl]['main-window'] = {
    ...existingMain,
    sizemode: 'normal',
    screenX: String(Math.round(rect.x)),
    screenY: String(Math.round(rect.y)),
    width: String(Math.round(rect.width)),
    height: String(Math.round(rect.height)),
  };

  try {
    fs.writeFileSync(xulPath, JSON.stringify(store), 'utf8');
  } catch {
    // ignore non-critical xulstore write failure
  }
}

/**
 * Menempatkan dan mengatur ulang ukuran jendela browser milik worker via Win32 API (`SetWindowPos`)
 * tanpa mengganggu fokus jendela worker lain (`SWP_NOACTIVATE`) dan me-restore jika maximized.
 */
export async function applyWin32WindowRect(params: {
  processName: 'firefox.exe' | 'chrome.exe' | 'msedge.exe' | 'chromium.exe';
  matchToken?: string;
  spawnedPid?: number | null;
  rect: WindowRect;
}): Promise<boolean> {
  if (process.platform !== 'win32') return false;

  const psScript = `
Add-Type @"
using System;
using System.Runtime.InteropServices;
public static class RageWinTile {
  [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr hWnd, IntPtr hWndInsertAfter, int X, int Y, int cx, int cy, uint uFlags);
}
"@
try { [RageWinTile]::SetProcessDPIAware() | Out-Null } catch {}
$procName = $env:RAGE_TILE_PROC
$token = $env:RAGE_TILE_TOKEN
$rootPid = 0
if ($env:RAGE_TILE_PID) { [int]::TryParse($env:RAGE_TILE_PID, [ref]$rootPid) | Out-Null }
$x = [int]$env:RAGE_TILE_X
$y = [int]$env:RAGE_TILE_Y
$w = [int]$env:RAGE_TILE_W
$h = [int]$env:RAGE_TILE_H

$moved = $false
$deadline = [DateTime]::UtcNow.AddMilliseconds(8000)
while ([DateTime]::UtcNow -lt $deadline) {
  $handles = @()
  $procs = Get-CimInstance Win32_Process -Filter "Name='$procName'" -EA SilentlyContinue
  if ($token) {
    $matched = $procs | Where-Object {
      $_.CommandLine -and $_.CommandLine -notmatch '-contentproc' -and $_.CommandLine -notmatch '--type=' -and $_.CommandLine.ToLower().Contains($token.ToLower())
    }
    foreach ($m in $matched) {
      $p = Get-Process -Id ([int]$m.ProcessId) -EA SilentlyContinue
      if ($p -and $p.MainWindowHandle -ne 0 -and [RageWinTile]::IsWindowVisible($p.MainWindowHandle)) {
        $handles += $p.MainWindowHandle
      }
    }
  }
  if ($handles.Count -eq 0 -and $rootPid -gt 0) {
    $p = Get-Process -Id $rootPid -EA SilentlyContinue
    if ($p -and $p.MainWindowHandle -ne 0 -and [RageWinTile]::IsWindowVisible($p.MainWindowHandle)) {
      $handles += $p.MainWindowHandle
    }
  }
  if ($handles.Count -gt 0) {
    foreach ($hwnd in ($handles | Select-Object -Unique)) {
      [RageWinTile]::ShowWindow($hwnd, 9) | Out-Null
      [RageWinTile]::SetWindowPos($hwnd, [IntPtr]::Zero, $x, $y, $w, $h, 0x0014) | Out-Null
    }
    Start-Sleep -Milliseconds 350
    foreach ($hwnd in ($handles | Select-Object -Unique)) {
      [RageWinTile]::ShowWindow($hwnd, 9) | Out-Null
      [RageWinTile]::SetWindowPos($hwnd, [IntPtr]::Zero, $x, $y, $w, $h, 0x0014) | Out-Null
    }
    $moved = $true
    break
  }
  Start-Sleep -Milliseconds 250
}
if ($moved) { Write-Output "MOVED" }
`;

  return new Promise<boolean>((resolve) => {
    execFile(
      'powershell.exe',
      ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', psScript],
      {
        env: {
          ...process.env,
          RAGE_TILE_PROC: params.processName,
          RAGE_TILE_TOKEN: params.matchToken || '',
          RAGE_TILE_PID: params.spawnedPid ? String(params.spawnedPid) : '',
          RAGE_TILE_X: String(Math.round(params.rect.x)),
          RAGE_TILE_Y: String(Math.round(params.rect.y)),
          RAGE_TILE_W: String(Math.round(params.rect.width)),
          RAGE_TILE_H: String(Math.round(params.rect.height)),
        },
        windowsHide: true,
        timeout: 11000,
      },
      (err, stdout) => {
        resolve(!err && Boolean(stdout && stdout.includes('MOVED')));
      }
    );
  });
}
