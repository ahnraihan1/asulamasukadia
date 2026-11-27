import { execFile, spawn } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  applyWindowRectAccountJitter,
  buildFirefoxDataSaverPrefs,
  buildFirefoxDisableWebAuthnPrefs,
  buildFirefoxUniqueAccountFingerprintPrefs,
  copyFirefoxProfileSnapshot,
  detectFirefoxProfiles,
  getMasterFirefoxProfileDir,
  hasValidMasterFirefoxProfile,
  isFirefoxProfileLocked,
  MASTER_PROFILE_META_FILE,
  removeStaleFirefoxSessionFiles,
} from './firefoxMarionetteDriver.js';
import {
  applyWin32WindowRect,
  patchFirefoxXulstoreRect,
  WindowRect,
} from './windowTiling.js';

export interface OpenedFirefoxHandle {
  pid: number | null;
  usedIsolatedInstance: boolean;
  wasMainProfileLockedBeforeLaunch: boolean;
}

/**
 * Membuka Firefox secara BIASA (tanpa protokol otomasi / Marionette / WebDriver),
 * sehingga tidak ada penanda "browser dikendalikan otomatis" dan CAPTCHA diselesaikan
 * murni oleh manusia.
 */
export function openFirefoxNormally(params: {
  executablePath: string;
  profileDir: string;
  url: string;
  proxyServer?: string | null;
  forceIsolatedInstance?: boolean;
  dataSaver?: boolean;
  tileRect?: WindowRect | null;
}): OpenedFirefoxHandle {
  const userJsPath = path.join(params.profileDir, 'user.js');
  const isWorkerCopy = params.profileDir.toLowerCase().includes('firefox_main_sync_worker_');
  const isolated = Boolean(params.proxyServer || params.forceIsolatedInstance || isWorkerCopy);
  const dataSaver = params.dataSaver ?? true;
  const prefsLines: string[] = [];

  if (params.proxyServer) {
    try {
      const u = new URL(params.proxyServer);
      const host = JSON.stringify(u.hostname);
      const port = Number(u.port || 80);
      prefsLines.push('user_pref("network.proxy.type", 1);');
      if (u.protocol.startsWith('socks')) {
        prefsLines.push(
          `user_pref("network.proxy.socks", ${host});`,
          `user_pref("network.proxy.socks_port", ${port});`,
          'user_pref("network.proxy.socks_remote_dns", true);'
        );
      } else {
        prefsLines.push(
          `user_pref("network.proxy.http", ${host});`,
          `user_pref("network.proxy.http_port", ${port});`,
          `user_pref("network.proxy.ssl", ${host});`,
          `user_pref("network.proxy.ssl_port", ${port});`,
          'user_pref("network.proxy.share_proxy_settings", true);'
        );
      }
      prefsLines.push(
        'user_pref("network.proxy.no_proxies_on", "localhost, 127.0.0.1");',
        'user_pref("network.proxy.allow_hijacking_localhost", false);',
        'user_pref("signon.autologin.proxy", true);'
      );
    } catch {
      // proxy tidak valid, lanjut tanpa proxy
    }
  }

  if (isolated) {
    prefsLines.push(...buildFirefoxDisableWebAuthnPrefs());
    prefsLines.push(...buildFirefoxUniqueAccountFingerprintPrefs());
    prefsLines.push(...buildFirefoxDataSaverPrefs(dataSaver));
  }

  if (prefsLines.length > 0) {
    fs.writeFileSync(userJsPath, `${prefsLines.join('\n')}\n`, 'utf8');
  } else if (isWorkerCopy && fs.existsSync(userJsPath)) {
    // Hapus sisa user.js proxy lama jika dijalankan tanpa proxy/dataSaver pada profil salinan worker
    try {
      fs.rmSync(userJsPath, { force: true });
    } catch {
      // ignore
    }
  }

  if (isolated) {
    const jitteredRect = applyWindowRectAccountJitter(params.tileRect ?? null);
    patchFirefoxXulstoreRect(params.profileDir, jitteredRect);
    const child = spawn(
      params.executablePath,
      ['-no-remote', '-new-instance', '-profile', params.profileDir, params.url],
      { detached: true, stdio: 'ignore' }
    );
    child.unref();
    if (params.tileRect) {
      void applyWin32WindowRect({
        processName: 'firefox.exe',
        matchToken: isWorkerCopy ? path.basename(params.profileDir) : undefined,
        spawnedPid: child.pid ?? null,
        rect: jitteredRect,
      });
    }
    return {
      pid: child.pid ?? null,
      usedIsolatedInstance: true,
      wasMainProfileLockedBeforeLaunch: false,
    };
  }

  const locked = isFirefoxProfileLocked(params.profileDir);
  const args = locked
    ? ['-new-window', params.url]
    : ['-profile', params.profileDir, '-new-window', params.url];
  const child = spawn(params.executablePath, args, {
    detached: true,
    stdio: 'ignore',
  });
  child.unref();
  if (params.tileRect) {
    void applyWin32WindowRect({
      processName: 'firefox.exe',
      spawnedPid: child.pid ?? null,
      rect: params.tileRect,
    });
  }
  return {
    pid: child.pid ?? null,
    usedIsolatedInstance: false,
    wasMainProfileLockedBeforeLaunch: locked,
  };
}

/**
 * Menutup instance Firefox milik profil/worker tertentu secara aman (WM_CLOSE dulu baru /F jika perlu)
 * dan menunggu sampai OS melepas file lock `parent.lock` agar jendela berikutnya bisa dibuka bersih.
 */
export async function closeFirefoxManualInstance(params: {
  profileDir: string;
  spawnedPid?: number | null;
  usedIsolatedInstance?: boolean;
  wasMainProfileLockedBeforeLaunch?: boolean;
}): Promise<boolean> {
  const isWorkerCopy = params.profileDir.toLowerCase().includes('firefox_main_sync_worker_');
  const canSafelyCloseWholeProcess =
    isWorkerCopy || params.usedIsolatedInstance || !params.wasMainProfileLockedBeforeLaunch;

  if (!canSafelyCloseWholeProcess) {
    return false;
  }

  if (process.platform === 'win32') {
    const matchToken = isWorkerCopy ? path.basename(params.profileDir) : params.profileDir;
    const psGraceful = `
$target = $env:RAGE_CLOSE_PROF
$rootPid = 0
if ($env:RAGE_CLOSE_PID) { [int]::TryParse($env:RAGE_CLOSE_PID, [ref]$rootPid) | Out-Null }
$pids = @()
if ($target) {
  $procs = Get-CimInstance Win32_Process -Filter "Name='firefox.exe'" -EA SilentlyContinue | Where-Object {
    $_.CommandLine -and $_.CommandLine -notmatch '-contentproc' -and $_.CommandLine.ToLower().Contains($target.ToLower())
  }
  foreach ($p in $procs) { $pids += [int]$p.ProcessId }
}
if ($pids.Count -eq 0 -and $rootPid -gt 0) { $pids += $rootPid }
foreach ($id in ($pids | Select-Object -Unique)) {
  $proc = Get-Process -Id $id -EA SilentlyContinue
  if ($proc -and $proc.MainWindowHandle -ne 0) {
    $proc.CloseMainWindow() | Out-Null
  } else {
    Start-Process -FilePath taskkill.exe -ArgumentList @('/PID', "$id") -WindowStyle Hidden -EA SilentlyContinue | Out-Null
  }
}
`;
    await new Promise<void>((resolve) => {
      execFile(
        'powershell.exe',
        ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', psGraceful],
        {
          env: {
            ...process.env,
            RAGE_CLOSE_PROF: matchToken,
            RAGE_CLOSE_PID: params.spawnedPid ? String(params.spawnedPid) : '',
          },
          windowsHide: true,
        },
        () => resolve()
      );
    });

    // Tunggu sampai parent.lock dilepas oleh Firefox (maks 4 detik)
    const lockDeadline = Date.now() + 4000;
    while (Date.now() < lockDeadline) {
      if (!isFirefoxProfileLocked(params.profileDir)) {
        // Beri jeda singkat agar Windows melepaskan handle prefs.js & SQLite sepenuhnya sebelum disalin ulang
        await new Promise((r) => setTimeout(r, 250));
        return true;
      }
      await new Promise((r) => setTimeout(r, 250));
    }

    // Fallback paksa hanya untuk proses profil worker / pid yang kita luncurkan
    const psForce = `
$target = $env:RAGE_CLOSE_PROF
$rootPid = 0
if ($env:RAGE_CLOSE_PID) { [int]::TryParse($env:RAGE_CLOSE_PID, [ref]$rootPid) | Out-Null }
$pids = @()
if ($target) {
  $procs = Get-CimInstance Win32_Process -Filter "Name='firefox.exe'" -EA SilentlyContinue | Where-Object {
    $_.CommandLine -and $_.CommandLine.ToLower().Contains($target.ToLower())
  }
  foreach ($p in $procs) { $pids += [int]$p.ProcessId }
}
if ($pids.Count -eq 0 -and $rootPid -gt 0) { $pids += $rootPid }
foreach ($id in ($pids | Select-Object -Unique)) {
  Start-Process -FilePath taskkill.exe -ArgumentList @('/T', '/F', '/PID', "$id") -WindowStyle Hidden -EA SilentlyContinue | Out-Null
}
`;
    await new Promise<void>((resolve) => {
      execFile(
        'powershell.exe',
        ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', psForce],
        {
          env: {
            ...process.env,
            RAGE_CLOSE_PROF: matchToken,
            RAGE_CLOSE_PID: params.spawnedPid ? String(params.spawnedPid) : '',
          },
          windowsHide: true,
        },
        () => resolve()
      );
    });

    const forceDeadline = Date.now() + 2000;
    while (Date.now() < forceDeadline) {
      if (!isFirefoxProfileLocked(params.profileDir)) {
        return true;
      }
      await new Promise((r) => setTimeout(r, 200));
    }
    return !isFirefoxProfileLocked(params.profileDir);
  }

  if (params.spawnedPid) {
    try {
      process.kill(params.spawnedPid, 'SIGTERM');
      return true;
    } catch {
      return false;
    }
  }
  return false;
}

export const ROBLOX_TRACKING_DOMAINS = [
  'roblox.com',
  'rbxcdn.com',
  'rbx.com',
  'robloxlabs.com',
  'arkoselabs.com',
  'funcaptcha.com',
  'px-cloud.net',
  'px-cdn.net',
  'perimeterx.net',
] as const;

const TRACKING_URL_REGEX = new RegExp(
  ROBLOX_TRACKING_DOMAINS.map((d) => d.replace(/\./g, '\\.')).join('|'),
  'i'
);

const TRACKING_HOST_PREFILTER_PATTERNS = [
  '%roblox%',
  '%rbxcdn%',
  '%rbx.com%',
  '%arkose%',
  '%funcaptcha%',
  '%px-cloud%',
  '%px-cdn%',
  '%perimeterx%',
];

export function matchesTrackingDomain(hostOrOrigin: string): boolean {
  const cleaned = hostOrOrigin.trim().toLowerCase().replace(/^\.+/, '');
  if (!cleaned) return false;
  return ROBLOX_TRACKING_DOMAINS.some((d) => cleaned === d || cleaned.endsWith(`.${d}`));
}

export function matchesTrackingUrl(urlOrKey: string): boolean {
  if (!urlOrKey) return false;
  try {
    const parsed = new URL(urlOrKey);
    if (matchesTrackingDomain(parsed.hostname)) return true;
  } catch {
    // bukan URL penuh; cek pola string / partitionKey
  }
  return TRACKING_URL_REGEX.test(urlOrKey);
}

function getSqliteTableNames(db: DatabaseSync): Set<string> {
  const rows = db.prepare(`SELECT name FROM sqlite_master WHERE type = 'table'`).all() as Array<{
    name: string;
  }>;
  return new Set(rows.map((r) => r.name));
}

function checkpointSqliteWal(db: DatabaseSync): void {
  try {
    db.exec('PRAGMA wal_checkpoint(TRUNCATE);');
  } catch {
    // ignore if journal mode bukan WAL
  }
}

function buildHostLikeWhereClause(column: string): string {
  return ROBLOX_TRACKING_DOMAINS.map((d) => `${column} LIKE '%${d}'`).join(' OR ');
}

function filterIdsByMatchingValue(
  db: DatabaseSync,
  sql: string,
  matcher: (val: string) => boolean
): number[] {
  const rows = db.prepare(sql).all() as Array<{ id: number; val: string | null }>;
  const ids: number[] = [];
  for (const row of rows) {
    if (row.val && matcher(row.val)) {
      ids.push(row.id);
    }
  }
  return ids;
}

function deleteByIdChunks(
  db: DatabaseSync,
  table: string,
  column: string,
  ids: number[],
  chunkSize = 400
): number {
  let deleted = 0;
  for (let i = 0; i < ids.length; i += chunkSize) {
    const chunk = ids.slice(i, i + chunkSize);
    const placeholders = chunk.map(() => '?').join(', ');
    const info = db.prepare(`DELETE FROM ${table} WHERE ${column} IN (${placeholders})`).run(...chunk);
    deleted += Number(info.changes ?? 0);
  }
  return deleted;
}

/**
 * Membersihkan seluruh cookie Roblox, PerimeterX (`_px*`), Arkose/FunCaptcha, dan CDN pelacaknya
 * di `cookies.sqlite` milik profil salinan worker/master agar akun baru mendapat identitas sesi/anti-bot bersih.
 * Cookie situs lain (Google, Discord, dll.), `127.0.0.1` worker ID, & pengaturan ekstensi tetap aman.
 */
export function clearRobloxAuthCookiesInSqlite(profileDir: string): number {
  const cookiesPath = path.join(profileDir, 'cookies.sqlite');
  if (!fs.existsSync(cookiesPath) || isFirefoxProfileLocked(profileDir)) return 0;

  try {
    const db = new DatabaseSync(cookiesPath);
    try {
      const cols = db.prepare('PRAGMA table_info(moz_cookies)').all() as Array<{ name: string }>;
      const hasOriginAttrs = cols.some((c) => c.name === 'originAttributes');
      const partitionClause = hasOriginAttrs
        ? ` OR (originAttributes IS NOT NULL AND (${ROBLOX_TRACKING_DOMAINS.map(
            (d) => `originAttributes LIKE '%${d}%'`
          ).join(' OR ')}))`
        : '';

      const info = db
        .prepare(
          `DELETE FROM moz_cookies
           WHERE ${buildHostLikeWhereClause('host')}
              OR name LIKE '\\_px%' ESCAPE '\\'${partitionClause}`
        )
        .run();
      checkpointSqliteWal(db);
      return Number(info.changes ?? 0);
    } finally {
      db.close();
    }
  } catch {
    return 0;
  }
}

/**
 * Menghapus LocalStorage / IndexedDB (`storage/default`, `storage/permanent`, `webappsstore.sqlite`,
 * dan entri `serviceworker.txt`) KHUSUS domain Roblox, Arkose/FunCaptcha, dan PerimeterX pada salinan profil,
 * sambil mempertahankan `moz-extension+++*`, cache disk JS/CSS, & situs lain.
 */
export function clearRobloxAndCaptchaStorage(profileDir: string): number {
  if (!fs.existsSync(profileDir) || isFirefoxProfileLocked(profileDir)) return 0;
  let removed = 0;

  for (const bucket of ['default', 'permanent']) {
    const storageBucketDir = path.join(profileDir, 'storage', bucket);
    if (!fs.existsSync(storageBucketDir)) continue;
    try {
      for (const entry of fs.readdirSync(storageBucketDir)) {
        if (entry.startsWith('moz-extension+++')) continue;
        if (TRACKING_URL_REGEX.test(entry)) {
          try {
            fs.rmSync(path.join(storageBucketDir, entry), { recursive: true, force: true });
            removed++;
          } catch {
            // ignore locked folder
          }
        }
      }
    } catch {
      // ignore storage scan error
    }
  }

  const webappsPath = path.join(profileDir, 'webappsstore.sqlite');
  if (fs.existsSync(webappsPath)) {
    try {
      const wdb = new DatabaseSync(webappsPath);
      try {
        const reversedPatterns = ROBLOX_TRACKING_DOMAINS.map(
          (d) => `originKey LIKE '%${d.split('').reverse().join('')}%'`
        ).join(' OR ');
        const info = wdb.prepare(`DELETE FROM webappsstore2 WHERE ${reversedPatterns}`).run();
        checkpointSqliteWal(wdb);
        removed += Number(info.changes ?? 0);
      } finally {
        wdb.close();
      }
    } catch {
      // ignore if table absent
    }
  }

  const swPath = path.join(profileDir, 'serviceworker.txt');
  if (fs.existsSync(swPath)) {
    try {
      const raw = fs.readFileSync(swPath, 'utf8');
      const lines = raw.split(/\r?\n/);
      const kept = lines.filter((line) => !TRACKING_URL_REGEX.test(line));
      if (kept.length !== lines.length) {
        fs.writeFileSync(swPath, kept.join('\n'), 'utf8');
      }
    } catch {
      // ignore
    }
  }

  return removed;
}

/**
 * Membersihkan riwayat kunjungan, bookmark URL, favicon, izin situs, preferensi konten,
 * bounce-tracking, dan autofill form KHUSUS domain Roblox / Arkose / PerimeterX tanpa menghapus
 * riwayat website lain (Google, YouTube, GitHub, dll.) di `places.sqlite`.
 */
export function clearRobloxPlacesHistoryInSqlite(profileDir: string): number {
  if (!fs.existsSync(profileDir) || isFirefoxProfileLocked(profileDir)) return 0;
  let removed = 0;

  const placesPath = path.join(profileDir, 'places.sqlite');
  if (fs.existsSync(placesPath)) {
    try {
      const pdb = new DatabaseSync(placesPath);
      try {
        const tables = getSqliteTableNames(pdb);
        if (tables.has('moz_places')) {
          const prefilter = TRACKING_HOST_PREFILTER_PATTERNS.map((p) => `LOWER(url) LIKE '${p}'`).join(
            ' OR '
          );
          const placeIds = filterIdsByMatchingValue(
            pdb,
            `SELECT id, url AS val FROM moz_places WHERE ${prefilter}`,
            matchesTrackingUrl
          );
          const originIds = tables.has('moz_origins')
            ? filterIdsByMatchingValue(pdb, `SELECT id, host AS val FROM moz_origins`, matchesTrackingDomain)
            : [];

          if (placeIds.length > 0 || originIds.length > 0) {
            pdb.exec('BEGIN IMMEDIATE;');
            try {
              if (placeIds.length > 0) {
                if (tables.has('moz_historyvisits_extra') && tables.has('moz_historyvisits')) {
                  for (let i = 0; i < placeIds.length; i += 400) {
                    const chunk = placeIds.slice(i, i + 400);
                    const ph = chunk.map(() => '?').join(', ');
                    pdb
                      .prepare(
                        `DELETE FROM moz_historyvisits_extra WHERE visit_id IN (SELECT id FROM moz_historyvisits WHERE place_id IN (${ph}))`
                      )
                      .run(...chunk);
                  }
                }
                for (const tbl of [
                  'moz_historyvisits',
                  'moz_inputhistory',
                  'moz_annos',
                  'moz_places_extra',
                  'moz_newtab_shortcuts_interaction',
                ]) {
                  if (tables.has(tbl)) {
                    deleteByIdChunks(pdb, tbl, 'place_id', placeIds);
                  }
                }
                if (tables.has('moz_places_metadata')) {
                  deleteByIdChunks(pdb, 'moz_places_metadata', 'place_id', placeIds);
                  deleteByIdChunks(pdb, 'moz_places_metadata', 'referrer_place_id', placeIds);
                }
                if (tables.has('moz_bookmarks')) {
                  deleteByIdChunks(pdb, 'moz_bookmarks', 'fk', placeIds);
                }
                removed += deleteByIdChunks(pdb, 'moz_places', 'id', placeIds);
              }
              if (originIds.length > 0 && tables.has('moz_origins')) {
                deleteByIdChunks(pdb, 'moz_origins', 'id', originIds);
              }
              pdb.exec('COMMIT;');
            } catch (err) {
              pdb.exec('ROLLBACK;');
              throw err;
            }
            checkpointSqliteWal(pdb);
          }
        }
      } finally {
        pdb.close();
      }
    } catch {
      // ignore places cleanup error
    }
  }

  const faviconsPath = path.join(profileDir, 'favicons.sqlite');
  if (fs.existsSync(faviconsPath)) {
    try {
      const fdb = new DatabaseSync(faviconsPath);
      try {
        const tables = getSqliteTableNames(fdb);
        if (tables.has('moz_pages_w_icons') && tables.has('moz_icons')) {
          const prefilterPage = TRACKING_HOST_PREFILTER_PATTERNS.map(
            (p) => `LOWER(page_url) LIKE '${p}'`
          ).join(' OR ');
          const prefilterIcon = TRACKING_HOST_PREFILTER_PATTERNS.map(
            (p) => `LOWER(icon_url) LIKE '${p}'`
          ).join(' OR ');
          const pageIds = filterIdsByMatchingValue(
            fdb,
            `SELECT id, page_url AS val FROM moz_pages_w_icons WHERE ${prefilterPage}`,
            matchesTrackingUrl
          );
          const iconIds = filterIdsByMatchingValue(
            fdb,
            `SELECT id, icon_url AS val FROM moz_icons WHERE ${prefilterIcon}`,
            matchesTrackingUrl
          );
          if (pageIds.length > 0 || iconIds.length > 0) {
            fdb.exec('BEGIN IMMEDIATE;');
            try {
              if (tables.has('moz_icons_to_pages')) {
                if (pageIds.length > 0) deleteByIdChunks(fdb, 'moz_icons_to_pages', 'page_id', pageIds);
                if (iconIds.length > 0) deleteByIdChunks(fdb, 'moz_icons_to_pages', 'icon_id', iconIds);
              }
              if (pageIds.length > 0) removed += deleteByIdChunks(fdb, 'moz_pages_w_icons', 'id', pageIds);
              if (iconIds.length > 0) removed += deleteByIdChunks(fdb, 'moz_icons', 'id', iconIds);
              fdb.exec('COMMIT;');
            } catch (err) {
              fdb.exec('ROLLBACK;');
              throw err;
            }
            checkpointSqliteWal(fdb);
          }
        }
      } finally {
        fdb.close();
      }
    } catch {
      // ignore favicon cleanup error
    }
  }

  const auxRules: Array<{ file: string; targets: Array<{ table: string; column: string }> }> = [
    {
      file: 'permissions.sqlite',
      targets: [
        { table: 'moz_perms', column: 'origin' },
        { table: 'moz_hosts', column: 'host' },
        { table: 'moz_origin_interactions', column: 'origin' },
      ],
    },
    {
      file: 'bounce-tracking-protection.sqlite',
      targets: [
        { table: 'sites', column: 'siteHost' },
        { table: 'sites', column: 'originAttributeSuffix' },
      ],
    },
  ];

  for (const rule of auxRules) {
    const dbPath = path.join(profileDir, rule.file);
    if (!fs.existsSync(dbPath)) continue;
    try {
      const adb = new DatabaseSync(dbPath);
      try {
        const tables = getSqliteTableNames(adb);
        for (const t of rule.targets) {
          if (!tables.has(t.table)) continue;
          const clause = ROBLOX_TRACKING_DOMAINS.map((d) => `LOWER(${t.column}) LIKE '%${d}%'`).join(
            ' OR '
          );
          const info = adb.prepare(`DELETE FROM ${t.table} WHERE ${clause}`).run();
          removed += Number(info.changes ?? 0);
        }
        checkpointSqliteWal(adb);
      } finally {
        adb.close();
      }
    } catch {
      // ignore aux db errors
    }
  }

  const contentPrefsPath = path.join(profileDir, 'content-prefs.sqlite');
  if (fs.existsSync(contentPrefsPath)) {
    try {
      const cpdb = new DatabaseSync(contentPrefsPath);
      try {
        const tables = getSqliteTableNames(cpdb);
        if (tables.has('groups') && tables.has('prefs')) {
          const groupIds = filterIdsByMatchingValue(
            cpdb,
            `SELECT id, name AS val FROM groups`,
            matchesTrackingUrl
          );
          if (groupIds.length > 0) {
            deleteByIdChunks(cpdb, 'prefs', 'groupID', groupIds);
            removed += deleteByIdChunks(cpdb, 'groups', 'id', groupIds);
            checkpointSqliteWal(cpdb);
          }
        }
      } finally {
        cpdb.close();
      }
    } catch {
      // ignore content-prefs error
    }
  }

  const formHistoryPath = path.join(profileDir, 'formhistory.sqlite');
  if (fs.existsSync(formHistoryPath)) {
    try {
      const fhdb = new DatabaseSync(formHistoryPath);
      try {
        const tables = getSqliteTableNames(fhdb);
        if (tables.has('moz_formhistory')) {
          const info = fhdb
            .prepare(
              `DELETE FROM moz_formhistory
               WHERE LOWER(fieldname) IN ('username', 'signup-username', 'password', 'signup-password', 'birthday', 'birthmonth', 'birthyear')
                  OR ${ROBLOX_TRACKING_DOMAINS.map((d) => `LOWER(value) LIKE '%${d}%'`).join(' OR ')}`
            )
            .run();
          checkpointSqliteWal(fhdb);
          removed += Number(info.changes ?? 0);
        }
      } finally {
        fhdb.close();
      }
    } catch {
      // ignore formhistory error
    }
  }

  return removed;
}

/**
 * Menanamkan cookie `rage_worker_id` KHUSUS untuk `127.0.0.1` dan `localhost` ke `cookies.sqlite`
 * profil salinan worker agar browser worker selalu teridentifikasi unik ke server lokal RAGE
 * tanpa mengirim data apa pun ke domain eksternal (roblox.com / CAPTCHA).
 */
export function setWorkerLoopbackCookieInSqlite(profileDir: string, workerId: number): boolean {
  const cookiesPath = path.join(profileDir, 'cookies.sqlite');
  if (!fs.existsSync(cookiesPath) || isFirefoxProfileLocked(profileDir) || workerId <= 0) {
    return false;
  }

  try {
    const db = new DatabaseSync(cookiesPath);
    try {
      const colsInfo = db.prepare('PRAGMA table_info(moz_cookies)').all() as Array<{ name: string }>;
      const colNames = new Set(colsInfo.map((c) => c.name));
      if (!colNames.has('name') || !colNames.has('value') || !colNames.has('host')) {
        return false;
      }

      db.prepare(
        `DELETE FROM moz_cookies WHERE name = 'rage_worker_id' AND host IN ('127.0.0.1', 'localhost')`
      ).run();

      const userVerRow = db.prepare('PRAGMA user_version').get() as { user_version?: number } | undefined;
      const schemaVersion = Number(userVerRow?.user_version ?? 0);
      const nowMs = Date.now();
      const nowMicros = nowMs * 1000;
      // Firefox modern (cookies.sqlite user_version >= 15) menyimpan `expiry` dalam milidetik;
      // menulis dalam detik akan dianggap sudah kedaluwarsa sejak 1970 oleh Firefox & WebExtension.
      const expiryValue =
        schemaVersion > 0 && schemaVersion < 15
          ? Math.floor(nowMs / 1000) + 30 * 86400
          : nowMs + 30 * 86400 * 1000;

      for (const host of ['127.0.0.1', 'localhost']) {
        const record: Record<string, string | number> = {
          originAttributes: '',
          name: 'rage_worker_id',
          value: String(workerId),
          host,
          path: '/',
          expiry: expiryValue,
          lastAccessed: nowMicros,
          creationTime: nowMicros,
          isSecure: 0,
          isHttpOnly: 0,
          inBrowserElement: 0,
          sameSite: 0,
          rawSameSite: 0,
          schemeMap: 1,
          isPartitionedAttributeSet: 0,
          updateTime: nowMicros,
        };
        const activeCols = Object.keys(record).filter((k) => colNames.has(k));
        const placeholders = activeCols.map(() => '?').join(', ');
        db.prepare(
          `INSERT INTO moz_cookies (${activeCols.join(', ')}) VALUES (${placeholders})`
        ).run(...activeCols.map((k) => record[k]));
      }
      return true;
    } finally {
      db.close();
    }
  } catch {
    return false;
  }
}

function openSqliteCopyReadonly<T>(
  sqliteFilePath: string,
  fn: (db: DatabaseSync) => T,
  fallback: T
): T {
  if (!fs.existsSync(sqliteFilePath)) return fallback;

  const baseName = path.basename(sqliteFilePath);
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rage-ffro-'));
  try {
    for (const suffix of ['', '-wal', '-shm']) {
      const f = sqliteFilePath + suffix;
      if (fs.existsSync(f)) {
        try {
          fs.copyFileSync(f, path.join(tmpDir, baseName + suffix));
        } catch {
          // ignore transient WAL copy errors
        }
      }
    }
    const dbCopy = new DatabaseSync(path.join(tmpDir, baseName));
    try {
      return fn(dbCopy);
    } finally {
      dbCopy.close();
    }
  } catch {
    return fallback;
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

/**
 * Membaca (read-only, lewat salinan sementara) apakah profil Firefox telah mengunjungi
 * `roblox.com/home` sejak `sinceMs` (epoch ms).
 */
export function hasRecentRobloxHomeVisit(profileDir: string, sinceMs: number): boolean {
  return openSqliteCopyReadonly(
    path.join(profileDir, 'places.sqlite'),
    (dbCopy) => {
      const sinceMicros = Math.max(0, (sinceMs - 5000) * 1000);
      const row = dbCopy
        .prepare(
          `SELECT COUNT(*) as cnt
           FROM moz_historyvisits v
           JOIN moz_places p ON v.place_id = p.id
           WHERE (p.url LIKE 'https://www.roblox.com/home%' OR p.url LIKE 'https://web.roblox.com/home%')
             AND v.visit_date >= ?`
        )
        .get(sinceMicros) as { cnt?: number } | undefined;
      return Number(row?.cnt ?? 0) > 0;
    },
    false
  );
}

/**
 * Membaca (read-only, lewat salinan sementara) nilai cookie .ROBLOSECURITY dari
 * file cookies.sqlite milik profil Firefox pengguna sendiri.
 */
export function readRoblosecurityFromProfile(profileDir: string): string | null {
  return openSqliteCopyReadonly(
    path.join(profileDir, 'cookies.sqlite'),
    (dbCopy) => {
      const row = dbCopy
        .prepare(
          `SELECT value FROM moz_cookies
           WHERE name = '.ROBLOSECURITY' AND host LIKE '%roblox.com'
           ORDER BY lastAccessed DESC LIMIT 1`
        )
        .get() as { value?: string } | undefined;
      return row?.value && row.value.length > 20 ? row.value : null;
    },
    null
  );
}

export interface FirefoxProfileStats {
  exists: boolean;
  nonRobloxPlacesCount: number;
  robloxPlacesCount: number;
  nonRobloxCookiesCount: number;
  robloxCookiesCount: number;
  extensionCount: number;
}

export interface MasterFirefoxProfileStatus {
  exists: boolean;
  masterProfileDir: string;
  sourceProfileDir: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  nonRobloxPlacesCount: number;
  robloxPlacesCount: number;
  nonRobloxCookiesCount: number;
  robloxCookiesCount: number;
  extensionCount: number;
  lastSanitizedRemoved?: {
    cookies: number;
    storage: number;
    history: number;
  };
}

/**
 * Menginspeksi ringkasan statistik history non-Roblox vs Roblox, cookie, dan jumlah ekstensi
 * secara read-only pada profil Firefox (aman walau profil sumber sedang terbuka).
 */
export function inspectFirefoxProfileStats(profileDir: string): FirefoxProfileStats {
  if (!profileDir || !fs.existsSync(profileDir)) {
    return {
      exists: false,
      nonRobloxPlacesCount: 0,
      robloxPlacesCount: 0,
      nonRobloxCookiesCount: 0,
      robloxCookiesCount: 0,
      extensionCount: 0,
    };
  }

  const placeCounts = openSqliteCopyReadonly(
    path.join(profileDir, 'places.sqlite'),
    (pdb) => {
      const rows = pdb.prepare('SELECT url FROM moz_places').all() as Array<{ url: string | null }>;
      let rbx = 0;
      let nonRbx = 0;
      for (const r of rows) {
        if (!r.url) continue;
        if (matchesTrackingUrl(r.url)) rbx++;
        else nonRbx++;
      }
      return { rbx, nonRbx };
    },
    { rbx: 0, nonRbx: 0 }
  );

  const cookieCounts = openSqliteCopyReadonly(
    path.join(profileDir, 'cookies.sqlite'),
    (cdb) => {
      const rows = cdb.prepare('SELECT host, name FROM moz_cookies').all() as Array<{
        host: string | null;
        name: string | null;
      }>;
      let rbx = 0;
      let nonRbx = 0;
      for (const r of rows) {
        const host = r.host || '';
        const name = r.name || '';
        if (host === '127.0.0.1' || host === 'localhost') continue;
        if (matchesTrackingDomain(host) || /^_px/i.test(name)) rbx++;
        else nonRbx++;
      }
      return { rbx, nonRbx };
    },
    { rbx: 0, nonRbx: 0 }
  );

  let extensionCount = 0;
  const extDir = path.join(profileDir, 'extensions');
  if (fs.existsSync(extDir)) {
    try {
      extensionCount = fs.readdirSync(extDir).length;
    } catch {
      extensionCount = 0;
    }
  }

  return {
    exists: true,
    nonRobloxPlacesCount: placeCounts.nonRbx,
    robloxPlacesCount: placeCounts.rbx,
    nonRobloxCookiesCount: cookieCounts.nonRbx,
    robloxCookiesCount: cookieCounts.rbx,
    extensionCount,
  };
}

function stripNetworkProxyPrefsFromPrefsJs(profileDir: string): void {
  const prefsPath = path.join(profileDir, 'prefs.js');
  if (!fs.existsSync(prefsPath)) return;
  try {
    const lines = fs.readFileSync(prefsPath, 'utf8').split(/\r?\n/);
    const filtered = lines.filter((line) => !/user_pref\("network\.proxy\./.test(line));
    if (filtered.length !== lines.length) {
      fs.writeFileSync(prefsPath, filtered.join('\n'), 'utf8');
    }
  } catch {
    // ignore
  }
}

/**
 * Mensterilkan salinan Master Profile dari seluruh jejak Roblox / Arkose / PerimeterX
 * (cookie, storage, history, favicon, izin situs, formhistory, sessionstore, & proxy lama)
 * sambil mempertahankan history website lain, cookie situs lain, dan seluruh ekstensi.
 */
export function sanitizeFirefoxProfileForMaster(profileDir: string): {
  cookies: number;
  storage: number;
  history: number;
} {
  if (!fs.existsSync(profileDir) || isFirefoxProfileLocked(profileDir)) {
    return { cookies: 0, storage: 0, history: 0 };
  }

  const cookies = clearRobloxAuthCookiesInSqlite(profileDir);
  const storage = clearRobloxAndCaptchaStorage(profileDir);
  const history = clearRobloxPlacesHistoryInSqlite(profileDir);

  stripNetworkProxyPrefsFromPrefsJs(profileDir);
  removeStaleFirefoxSessionFiles(profileDir);

  try {
    fs.writeFileSync(
      path.join(profileDir, 'user.js'),
      `${buildFirefoxDisableWebAuthnPrefs().join('\n')}\n`,
      'utf8'
    );
  } catch {
    // ignore
  }

  return { cookies, storage, history };
}

/**
 * Membuat atau menyinkronkan ulang 1 Master Warm Profile khusus RAGE dari profil Firefox sumber,
 * lalu mensterilkan semua data Roblox/Arkose/PerimeterX agar siap di-clone & di-reset oleh semua worker.
 */
export function createOrSyncMasterFirefoxProfile(params: {
  sourceProfilePath?: string;
  profilesRootDir?: string;
  resetExisting?: boolean;
}): MasterFirefoxProfileStatus {
  const masterProfileDir = getMasterFirefoxProfileDir(params.profilesRootDir);
  const detected = detectFirefoxProfiles(params.sourceProfilePath);
  const sourceDir = detected.mainProfileDir;

  if (!sourceDir || !fs.existsSync(sourceDir)) {
    throw new Error(
      'Profil sumber Mozilla Firefox tidak ditemukan atau belum memiliki prefs.js.'
    );
  }
  if (path.resolve(sourceDir).toLowerCase() === path.resolve(masterProfileDir).toLowerCase()) {
    throw new Error('Profil sumber dan direktori Master Profile tidak boleh sama.');
  }
  if (!fs.existsSync(path.join(sourceDir, 'prefs.js'))) {
    throw new Error(
      `Profil sumber (${sourceDir}) kosong (tidak memiliki prefs.js). Pilih profil Firefox yang memiliki ekstensi & history.`
    );
  }
  if (isFirefoxProfileLocked(masterProfileDir)) {
    throw new Error('Direktori Master Profile sedang terkunci oleh proses Firefox aktif.');
  }

  let prevCreatedAt: string | null = null;
  const metaPath = path.join(masterProfileDir, MASTER_PROFILE_META_FILE);
  if (fs.existsSync(metaPath)) {
    try {
      const prev = JSON.parse(fs.readFileSync(metaPath, 'utf8')) as { createdAt?: string };
      prevCreatedAt = prev.createdAt || null;
    } catch {
      prevCreatedAt = null;
    }
  }

  if (params.resetExisting !== false && fs.existsSync(masterProfileDir)) {
    fs.rmSync(masterProfileDir, { recursive: true, force: true });
  }

  copyFirefoxProfileSnapshot({
    sourceDir,
    targetDir: masterProfileDir,
    skipExtensions: false,
    onlyMutableState: false,
    preserveExistingKeys: false,
  });

  const removed = sanitizeFirefoxProfileForMaster(masterProfileDir);
  const stats = inspectFirefoxProfileStats(masterProfileDir);
  const nowIso = new Date().toISOString();

  const status: MasterFirefoxProfileStatus = {
    exists: hasValidMasterFirefoxProfile(masterProfileDir),
    masterProfileDir,
    sourceProfileDir: sourceDir,
    createdAt: prevCreatedAt || nowIso,
    updatedAt: nowIso,
    nonRobloxPlacesCount: stats.nonRobloxPlacesCount,
    robloxPlacesCount: stats.robloxPlacesCount,
    nonRobloxCookiesCount: stats.nonRobloxCookiesCount,
    robloxCookiesCount: stats.robloxCookiesCount,
    extensionCount: stats.extensionCount,
    lastSanitizedRemoved: removed,
  };

  try {
    fs.writeFileSync(metaPath, JSON.stringify(status, null, 2), 'utf8');
  } catch {
    // ignore meta write error
  }

  return status;
}

/**
 * Mengembalikan status terkini dari 1 Master Warm Profile khusus RAGE (`data/master_firefox_profile`).
 */
export function getMasterFirefoxProfileStatus(
  profilesRootDir?: string
): MasterFirefoxProfileStatus {
  const masterProfileDir = getMasterFirefoxProfileDir(profilesRootDir);
  const exists = hasValidMasterFirefoxProfile(masterProfileDir);
  if (!exists) {
    return {
      exists: false,
      masterProfileDir,
      sourceProfileDir: null,
      createdAt: null,
      updatedAt: null,
      nonRobloxPlacesCount: 0,
      robloxPlacesCount: 0,
      nonRobloxCookiesCount: 0,
      robloxCookiesCount: 0,
      extensionCount: 0,
    };
  }

  let meta: Partial<MasterFirefoxProfileStatus> = {};
  const metaPath = path.join(masterProfileDir, MASTER_PROFILE_META_FILE);
  if (fs.existsSync(metaPath)) {
    try {
      meta = JSON.parse(fs.readFileSync(metaPath, 'utf8')) as Partial<MasterFirefoxProfileStatus>;
    } catch {
      meta = {};
    }
  }

  const stats = inspectFirefoxProfileStats(masterProfileDir);
  return {
    exists: true,
    masterProfileDir,
    sourceProfileDir: meta.sourceProfileDir ?? null,
    createdAt: meta.createdAt ?? null,
    updatedAt: meta.updatedAt ?? null,
    nonRobloxPlacesCount: stats.nonRobloxPlacesCount,
    robloxPlacesCount: stats.robloxPlacesCount,
    nonRobloxCookiesCount: stats.nonRobloxCookiesCount,
    robloxCookiesCount: stats.robloxCookiesCount,
    extensionCount: stats.extensionCount,
    lastSanitizedRemoved: meta.lastSanitizedRemoved,
  };
}
