import { spawn, ChildProcess } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { patchFirefoxXulstoreRect, WindowRect } from './windowTiling.js';

export interface DetectedFirefoxProfile {
  name: string;
  path: string;
  isDefault: boolean;
  hasData?: boolean;
}

export interface FirefoxProfileInfo {
  executablePath: string | null;
  mainProfileDir: string | null;
  isMainProfileLocked: boolean;
  configuredProxyHint?: string | null;
  profiles: DetectedFirefoxProfile[];
}

export interface MarionetteCookie {
  name: string;
  value: string;
  domain?: string;
  path?: string;
  secure?: boolean;
  httpOnly?: boolean;
  expiry?: number;
}

export interface MarionetteProxyConfig {
  server: string;
  username?: string;
  password?: string;
  display: string;
}

/**
 * Detects the user's installed Mozilla Firefox executable on Windows/Linux/macOS.
 */
export function detectInstalledFirefoxExecutable(): string | null {
  const candidates: string[] = [
    'C:\\Program Files\\Mozilla Firefox\\firefox.exe',
    'C:\\Program Files (x86)\\Mozilla Firefox\\firefox.exe',
    path.join(process.env.LOCALAPPDATA || '', 'Mozilla Firefox', 'firefox.exe'),
    path.join(process.env.PROGRAMFILES || '', 'Mozilla Firefox', 'firefox.exe'),
    '/usr/bin/firefox',
    '/Applications/Firefox.app/Contents/MacOS/firefox',
  ];

  for (const candidate of candidates) {
    if (candidate && fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return null;
}

/**
 * Checks whether a Firefox profile directory is currently locked by a running Firefox instance.
 * On Windows, `parent.lock` remains on disk even when Firefox is closed, but holds an exclusive
 * OS file lock (`EBUSY` / `EPERM`) only while Firefox is actively running with that profile.
 */
export function isFirefoxProfileLocked(profileDir: string): boolean {
  if (!fs.existsSync(profileDir)) return false;

  const lockFile = path.join(profileDir, 'parent.lock');
  if (fs.existsSync(lockFile)) {
    try {
      const fd = fs.openSync(lockFile, 'r+');
      fs.closeSync(fd);
    } catch {
      return true;
    }
  }

  const unixLock = path.join(profileDir, '.parentlock');
  if (fs.existsSync(unixLock)) {
    try {
      const fd = fs.openSync(unixLock, 'r+');
      fs.closeSync(fd);
    } catch {
      return true;
    }
  }

  return false;
}

/**
 * Detects the user's main Firefox profile from `%APPDATA%\Mozilla\Firefox\profiles.ini`
 */
export function detectFirefoxProfiles(customPath?: string): FirefoxProfileInfo {
  const executablePath = detectInstalledFirefoxExecutable();
  const appData = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
  const firefoxAppDataDir = path.join(appData, 'Mozilla', 'Firefox');
  const profilesIniPath = path.join(firefoxAppDataDir, 'profiles.ini');

  const profiles: DetectedFirefoxProfile[] = [];
  let installDefaultRelPath: string | null = null;

  if (fs.existsSync(profilesIniPath)) {
    const rawIni = fs.readFileSync(profilesIniPath, 'utf8');
    const sections = rawIni.split(/\r?\n(?=\[)/);

    for (const section of sections) {
      const lines = section.split(/\r?\n/).map((l) => l.trim());
      const header = lines[0] || '';

      if (/^\[Install/i.test(header)) {
        for (const line of lines.slice(1)) {
          const [k, v] = line.split('=');
          if (k?.trim().toLowerCase() === 'default' && v?.trim()) {
            installDefaultRelPath = v.trim();
          }
        }
      } else if (/^\[Profile/i.test(header)) {
        let name = 'default';
        let isRelative = true;
        let profPath = '';
        let isDefault = false;

        for (const line of lines.slice(1)) {
          const idx = line.indexOf('=');
          if (idx === -1) continue;
          const k = line.slice(0, idx).trim().toLowerCase();
          const v = line.slice(idx + 1).trim();
          if (k === 'name') name = v;
          if (k === 'isrelative') isRelative = v === '1';
          if (k === 'path') profPath = v;
          if (k === 'default' && v === '1') isDefault = true;
        }

        if (profPath) {
          const resolvedPath = isRelative
            ? path.resolve(firefoxAppDataDir, profPath)
            : path.resolve(profPath);
          if (fs.existsSync(resolvedPath)) {
            profiles.push({
              name,
              path: resolvedPath,
              isDefault,
              hasData: fs.existsSync(path.join(resolvedPath, 'prefs.js')),
            });
          }
        }
      }
    }
  }

  // If [Install*] specifies a Default=Profiles/xxx.default-release, mark that one as primary default
  if (installDefaultRelPath) {
    const resolvedInstallDefault = path.resolve(firefoxAppDataDir, installDefaultRelPath);
    for (const p of profiles) {
      p.isDefault =
        path.normalize(p.path).toLowerCase() ===
        path.normalize(resolvedInstallDefault).toLowerCase();
    }
  }

  // Fallback scan of Profiles directory if profiles.ini had no entries
  const profilesDir = path.join(firefoxAppDataDir, 'Profiles');
  if (profiles.length === 0 && fs.existsSync(profilesDir)) {
    for (const entry of fs.readdirSync(profilesDir)) {
      const full = path.join(profilesDir, entry);
      if (fs.statSync(full).isDirectory()) {
        profiles.push({
          name: entry,
          path: full,
          isDefault: entry.endsWith('.default-release'),
          hasData: fs.existsSync(path.join(full, 'prefs.js')),
        });
      }
    }
  }

  let mainProfileDir: string | null = null;
  if (customPath && customPath.trim() && fs.existsSync(customPath.trim())) {
    mainProfileDir = path.resolve(customPath.trim());
  } else {
    const defaultRelease =
      profiles.find((p) => p.isDefault && p.hasData) ||
      profiles.find((p) => p.isDefault) ||
      profiles.find((p) => p.path.toLowerCase().endsWith('.default-release') && p.hasData) ||
      profiles.find((p) => p.hasData) ||
      profiles[0];
    mainProfileDir = defaultRelease ? defaultRelease.path : null;
  }

  const isMainProfileLocked = mainProfileDir ? isFirefoxProfileLocked(mainProfileDir) : false;

  // Cek apakah prefs.js profil utama memiliki setting proxy manual (seperti gw.dataimpulse.com:823)
  let configuredProxyHint: string | null = null;
  if (mainProfileDir) {
    const prefsPath = path.join(mainProfileDir, 'prefs.js');
    if (fs.existsSync(prefsPath)) {
      try {
        const rawPrefs = fs.readFileSync(prefsPath, 'utf8');
        const pType = rawPrefs.match(/user_pref\("network\.proxy\.type",\s*(\d+)\)/);
        const pHttp = rawPrefs.match(/user_pref\("network\.proxy\.http",\s*"([^"]+)"\)/);
        const pPort = rawPrefs.match(/user_pref\("network\.proxy\.http_port",\s*(\d+)\)/);
        if (pType?.[1] === '1' && pHttp?.[1] && pHttp[1] !== '127.0.0.1' && pHttp[1] !== 'localhost') {
          configuredProxyHint = `${pHttp[1]}:${pPort?.[1] || '80'}`;
        }
      } catch {
        // ignore read error
      }
    }
  }

  return {
    executablePath,
    mainProfileDir,
    isMainProfileLocked,
    configuredProxyHint,
    profiles,
  };
}

export const MASTER_PROFILE_META_FILE = '.rage-master-meta.json';
export const WORKER_SYNC_STAMP_FILE = '.rage-worker-sync.json';

export const FIREFOX_MUTABLE_STATE_FILES = [
  'prefs.js',
  'cookies.sqlite',
  'cookies.sqlite-wal',
  'places.sqlite',
  'places.sqlite-wal',
  'favicons.sqlite',
  'favicons.sqlite-wal',
  'permissions.sqlite',
  'formhistory.sqlite',
  'content-prefs.sqlite',
  'content-prefs.sqlite-wal',
  'protections.sqlite',
  'bounce-tracking-protection.sqlite',
  'webappsstore.sqlite',
  'webappsstore.sqlite-wal',
  'serviceworker.txt',
] as const;

export const FIREFOX_STATIC_CORE_FILES = [
  'cert9.db',
  'key4.db',
  'pkcs11.txt',
  'xulstore.json',
  'containers.json',
  'handlers.json',
  'search.json.mozlz4',
  'times.json',
] as const;

export const FIREFOX_EXTENSION_CORE_FILES = [
  'addons.json',
  'extensions.json',
  'extension-preferences.json',
  'addonStartup.json.lz4',
  'storage.sqlite',
  'storage-sync-v2.sqlite',
  'storage-sync-v2.sqlite-wal',
  'storage-sync-v2.sqlite-shm',
] as const;

export const FIREFOX_EXTENSION_FOLDERS = [
  'extensions',
  'browser-extension-data',
  'extension-store',
  'extension-store-menus',
  'extension-store-userscripts',
] as const;

/**
 * Mengembalikan lokasi direktori 1 Master Warm Profile khusus RAGE (`data/master_firefox_profile`).
 * Jika `profilesRootDir` diteruskan (mis. pada pengujian terisolasi), ditempatkan berdampingan dengannya.
 */
export function getMasterFirefoxProfileDir(profilesRootDir?: string): string {
  if (profilesRootDir) {
    return path.resolve(profilesRootDir, '..', 'master_firefox_profile');
  }
  return path.resolve(process.cwd(), 'data', 'master_firefox_profile');
}

export function hasValidMasterFirefoxProfile(masterProfileDir: string): boolean {
  return (
    fs.existsSync(masterProfileDir) && fs.existsSync(path.join(masterProfileDir, 'prefs.js'))
  );
}

/**
 * Menghapus file kunci/sesi sementara Firefox (tab lama, HSTS/alt-svc state, lock) di direktori target.
 */
export function removeStaleFirefoxSessionFiles(targetDir: string): void {
  for (const staleSession of [
    'sessionstore.jsonlz4',
    'sessionstore.baklz4',
    'sessionCheckpoints.json',
    'sessionstore-backups',
    'SiteSecurityServiceState.bin',
    'AlternateServices.bin',
    'parent.lock',
    '.parentlock',
  ]) {
    const p = path.join(targetDir, staleSession);
    if (fs.existsSync(p)) {
      try {
        fs.rmSync(p, { recursive: true, force: true });
      } catch {
        // ignore if locked
      }
    }
  }
}

function removeTargetSqliteSidecars(targetDir: string, files: readonly string[]): void {
  for (const fileName of files) {
    if (!fileName.endsWith('.sqlite')) continue;
    for (const suffix of ['-wal', '-shm']) {
      const sidecar = path.join(targetDir, `${fileName}${suffix}`);
      if (fs.existsSync(sidecar)) {
        try {
          fs.rmSync(sidecar, { force: true });
        } catch {
          // ignore
        }
      }
    }
  }
}

/**
 * Menyesuaikan path & `rootURI` pada `extensions.json` di profil tujuan agar menunjuk ke folder `extensions/`
 * lokal milik profil tersebut (bukan path PC/profil asal seperti `C:\Users\<user>\...`), serta menghapus
 * `addonStartup.json.lz4` bila ada perubahan agar Firefox di PC baru langsung memuat Violentmonkey & ekstensi lain.
 */
export function relocateProfileExtensionPaths(targetDir: string): boolean {
  const extJsonPath = path.join(targetDir, 'extensions.json');
  const extDir = path.join(targetDir, 'extensions');
  if (!fs.existsSync(extJsonPath) || !fs.existsSync(extDir)) return false;

  try {
    const raw = fs.readFileSync(extJsonPath, 'utf8');
    const parsed = JSON.parse(raw) as {
      addons?: Array<{
        location?: string;
        path?: string;
        rootURI?: string;
        seen?: boolean;
        appDisabled?: boolean;
        softDisabled?: boolean;
        active?: boolean;
        userDisabled?: boolean;
        [key: string]: unknown;
      }>;
    };
    if (!Array.isArray(parsed.addons)) return false;

    let changed = false;
    for (const addon of parsed.addons) {
      if (addon.location !== 'app-profile' || typeof addon.path !== 'string' || !addon.path) {
        continue;
      }
      const fileName = path.win32.basename(addon.path);
      if (!fileName) continue;
      const localExtPath = path.join(extDir, fileName);
      if (!fs.existsSync(localExtPath)) continue;

      const isArchive = fileName.toLowerCase().endsWith('.xpi');
      const fileHref = pathToFileURL(localExtPath).href;
      const expectedRootUri = isArchive ? `jar:${fileHref}!/` : `${fileHref.replace(/\/+$/, '')}/`;

      if (
        path.normalize(addon.path) !== path.normalize(localExtPath) ||
        addon.rootURI !== expectedRootUri
      ) {
        addon.path = localExtPath;
        addon.rootURI = expectedRootUri;
        addon.seen = true;
        if (!addon.userDisabled) {
          addon.appDisabled = false;
          addon.softDisabled = false;
          addon.active = true;
        }
        changed = true;
      }
    }

    if (changed) {
      fs.writeFileSync(extJsonPath, JSON.stringify(parsed), 'utf8');
      const startupLz4 = path.join(targetDir, 'addonStartup.json.lz4');
      if (fs.existsSync(startupLz4)) {
        try {
          fs.rmSync(startupLz4, { force: true });
        } catch {
          // ignore
        }
      }
    }
    return changed;
  } catch {
    return false;
  }
}

/**
 * Menyalin snapshot file profil Firefox secara terstruktur dari `sourceDir` ke `targetDir`.
 * Mendukung mode `onlyMutableState` untuk reset cepat antar-akun tanpa menyalin ulang folder ekstensi besar.
 */
export function copyFirefoxProfileSnapshot(params: {
  sourceDir: string;
  targetDir: string;
  skipExtensions?: boolean;
  onlyMutableState?: boolean;
  preserveExistingKeys?: boolean;
}): void {
  const { sourceDir, targetDir } = params;
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true, mode: 0o700 });
  }

  removeTargetSqliteSidecars(targetDir, FIREFOX_MUTABLE_STATE_FILES);

  const filesToCopy: string[] = [...FIREFOX_MUTABLE_STATE_FILES];
  if (!params.onlyMutableState) {
    filesToCopy.push(...FIREFOX_STATIC_CORE_FILES);
    if (!params.skipExtensions) {
      filesToCopy.push(...FIREFOX_EXTENSION_CORE_FILES);
    }
  }

  for (const fileName of filesToCopy) {
    const srcFile = path.join(sourceDir, fileName);
    const dstFile = path.join(targetDir, fileName);
    if (
      params.preserveExistingKeys &&
      (fileName === 'key4.db' || fileName === 'cert9.db') &&
      fs.existsSync(dstFile)
    ) {
      continue;
    }
    if (fs.existsSync(srcFile)) {
      try {
        fs.copyFileSync(srcFile, dstFile);
      } catch {
        // ignore if transient WAL file disappears
      }
    }
  }

  if (params.skipExtensions) {
    for (const staleItem of [
      'extensions',
      'extensions.json',
      'extension-preferences.json',
      'addonStartup.json.lz4',
    ]) {
      const stalePath = path.join(targetDir, staleItem);
      if (fs.existsSync(stalePath)) {
        try {
          fs.rmSync(stalePath, { recursive: true, force: true });
        } catch {
          // ignore if locked
        }
      }
    }
  } else if (!params.onlyMutableState) {
    for (const extFolder of FIREFOX_EXTENSION_FOLDERS) {
      const srcDir = path.join(sourceDir, extFolder);
      const dstDir = path.join(targetDir, extFolder);
      if (fs.existsSync(srcDir)) {
        try {
          fs.cpSync(srcDir, dstDir, { recursive: true, force: true });
        } catch {
          // ignore copy errors
        }
      }
    }

    // Salin storage IndexedDB khusus ekstensi (storage/default/moz-extension+++*) agar setting add-on tidak ter-reset
    const srcStorageDefault = path.join(sourceDir, 'storage', 'default');
    const dstStorageDefault = path.join(targetDir, 'storage', 'default');
    if (fs.existsSync(srcStorageDefault)) {
      try {
        fs.mkdirSync(dstStorageDefault, { recursive: true, mode: 0o700 });
        for (const entry of fs.readdirSync(srcStorageDefault)) {
          if (entry.startsWith('moz-extension+++')) {
            try {
              fs.cpSync(
                path.join(srcStorageDefault, entry),
                path.join(dstStorageDefault, entry),
                { recursive: true, force: true }
              );
            } catch {
              // ignore locked entry
            }
          }
        }
      } catch {
        // ignore storage dir error
      }
    }

    relocateProfileExtensionPaths(targetDir);
  }

  // Pada reset antar-akun, hapus sisa storage/default origin web non-ekstensi (roblox, arkose, dll.)
  if (params.onlyMutableState) {
    const dstStorageDefault = path.join(targetDir, 'storage', 'default');
    if (fs.existsSync(dstStorageDefault)) {
      try {
        for (const entry of fs.readdirSync(dstStorageDefault)) {
          if (entry.startsWith('moz-extension+++') || entry === 'chrome') continue;
          try {
            fs.rmSync(path.join(dstStorageDefault, entry), { recursive: true, force: true });
          } catch {
            // ignore
          }
        }
      } catch {
        // ignore
      }
    }
  }

  removeStaleFirefoxSessionFiles(targetDir);
}

/**
 * Prepares the user's Main Firefox Profile (or RAGE Master Warm Profile) for a worker:
 * - Never wipes/deletes the user's profile or Master profile!
 * - When `useMasterProfile` is true and a valid Master Warm Profile exists, every worker always
 *   clones/resets from that isolated Roblox-clean Master Profile (with fast state reset on subsequent runs).
 * - Otherwise preserves legacy behavior: `DIRECT_MAIN` when unlocked single worker #1, or `SYNCED_MAIN`.
 */
export function prepareMainFirefoxProfileForWorker(params: {
  workerId: number;
  profilesRootDir: string;
  customProfilePath?: string;
  forceCopy?: boolean;
  skipExtensions?: boolean;
  useMasterProfile?: boolean;
  fastReset?: boolean;
}): {
  profileDir: string;
  sourceMainProfileDir: string;
  mode: 'DIRECT_MAIN' | 'SYNCED_MAIN';
  usedMasterProfile?: boolean;
  fastResetApplied?: boolean;
} {
  const masterDir = getMasterFirefoxProfileDir(params.profilesRootDir);
  const usingMaster = Boolean(params.useMasterProfile && hasValidMasterFirefoxProfile(masterDir));

  let sourceMainProfileDir: string;
  if (usingMaster) {
    sourceMainProfileDir = masterDir;
  } else {
    const info = detectFirefoxProfiles(params.customProfilePath);
    if (!info.mainProfileDir || !fs.existsSync(info.mainProfileDir)) {
      throw new Error(
        'Profil utama Mozilla Firefox tidak ditemukan di %APPDATA%\\Mozilla\\Firefox\\Profiles.'
      );
    }
    sourceMainProfileDir = info.mainProfileDir;
  }

  const locked = isFirefoxProfileLocked(sourceMainProfileDir);

  if (!usingMaster && params.workerId === 1 && !locked && !params.forceCopy) {
    return {
      profileDir: sourceMainProfileDir,
      sourceMainProfileDir,
      mode: 'DIRECT_MAIN',
      usedMasterProfile: false,
      fastResetApplied: false,
    };
  }

  const targetDir = path.join(
    params.profilesRootDir,
    `firefox_main_sync_worker_${params.workerId}`
  );

  let masterUpdatedAt = '';
  const masterMetaPath = path.join(sourceMainProfileDir, MASTER_PROFILE_META_FILE);
  if (fs.existsSync(masterMetaPath)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(masterMetaPath, 'utf8')) as { updatedAt?: string };
      masterUpdatedAt = parsed.updatedAt || '';
    } catch {
      // ignore invalid meta
    }
  }

  let canFastReset = false;
  const stampPath = path.join(targetDir, WORKER_SYNC_STAMP_FILE);
  if (
    usingMaster &&
    params.fastReset !== false &&
    !params.skipExtensions &&
    fs.existsSync(stampPath) &&
    fs.existsSync(path.join(targetDir, 'extensions'))
  ) {
    try {
      const stamp = JSON.parse(fs.readFileSync(stampPath, 'utf8')) as {
        sourceDir?: string;
        masterUpdatedAt?: string;
      };
      if (
        stamp.sourceDir === sourceMainProfileDir &&
        (!masterUpdatedAt || stamp.masterUpdatedAt === masterUpdatedAt)
      ) {
        canFastReset = true;
      }
    } catch {
      // fallback to full copy
    }
  }

  copyFirefoxProfileSnapshot({
    sourceDir: sourceMainProfileDir,
    targetDir,
    skipExtensions: params.skipExtensions,
    onlyMutableState: canFastReset,
    preserveExistingKeys: true,
  });

  if (!params.skipExtensions) {
    relocateProfileExtensionPaths(targetDir);
  }

  if (!canFastReset) {
    try {
      fs.writeFileSync(
        stampPath,
        JSON.stringify({
          sourceDir: sourceMainProfileDir,
          masterUpdatedAt,
          syncedAt: new Date().toISOString(),
        }),
        'utf8'
      );
    } catch {
      // ignore stamp write failure
    }
  }

  return {
    profileDir: targetDir,
    sourceMainProfileDir,
    mode: 'SYNCED_MAIN',
    usedMasterProfile: usingMaster,
    fastResetApplied: canFastReset,
  };
}

/**
 * Mematikan API WebAuthn / Passkey pada profil worker Firefox agar dialog
 * "Windows Security - Security key setup" (Windows Hello / FIDO2) tidak muncul
 * saat halaman Roblox menawarkan pembuatan Passkey.
 *
 * Daftar pref lengkap:
 *  - security.webauth.webauthn              : matikan WebAuthn API sepenuhnya
 *  - security.webauth.webauthn_enable_usbtoken : matikan USB token (FIDO2 key)
 *  - security.webauth.webauthn_enable_softtoken: matikan software authenticator bawaan Firefox
 *  - security.webauth.ctap2                 : matikan CTAP2 (komunikasi authenticator)
 *  - dom.security.credentialmanagement.identity.enabled: matikan FedCM / Passkey identity
 *  - security.webauth.cbor-encoded-attestation-request.enabled: matikan attestation CBOR
 *  - dom.webauthn.enabled                   : fallback flag lama (Nightly/ESR)
 */
export function buildFirefoxDisableWebAuthnPrefs(): string[] {
  return [
    'user_pref("security.webauth.webauthn", false);',
    'user_pref("security.webauth.webauthn_enable_usbtoken", false);',
    'user_pref("security.webauth.webauthn_enable_softtoken", false);',
    'user_pref("security.webauth.ctap2", false);',
    'user_pref("dom.security.credentialmanagement.identity.enabled", false);',
    'user_pref("security.webauth.cbor-encoded-attestation-request.enabled", false);',
    'user_pref("dom.webauthn.enabled", false);',
    // Cegah kebocoran IP ISP asli lewat UDP WebRTC STUN & QUIC HTTP/3 saat memakai proxy HTTP
    'user_pref("media.peerconnection.enabled", false);',
    'user_pref("media.peerconnection.ice.proxy_only_if_behind_proxy", true);',
    'user_pref("media.peerconnection.ice.default_address_only", true);',
    'user_pref("media.peerconnection.ice.no_host", true);',
    'user_pref("network.http.http3.enable", false);',
    'user_pref("network.dns.disableIPv6", true);',
    'user_pref("extensions.autoDisableScopes", 0);',
    'user_pref("extensions.enabledScopes", 15);',
  ];
}

const FINGERPRINT_CPU_CORES = [4, 6, 8, 12, 16] as const;
const FINGERPRINT_ACCEPT_LANGUAGES = [
  'en-US, en',
  'en-US, en;q=0.9',
  'en-US, en, id',
  'en-GB, en-US, en',
] as const;

/**
 * Menghasilkan daftar `user_pref` isolasi & variasi aman per akun pada Firefox (Gecko)
 * tanpa menyalakan `fingerprintingProtection` / Canvas noise yang justru terdeteksi Arkose sebagai browser spoofing:
 * - Memastikan FPP & Canvas randomization dalam kondisi OFF agar tanda tangan Canvas/Audio/WebGL Firefox normal.
 * - Mempertahankan variasi natural core CPU (`dom.maxHardwareConcurrency`) dan `intl.accept_languages` yang wajar.
 * - Mengisolasi network state & storage antar situs (dFPI) serta mematikan sensor/baterai/geo.
 */
export function buildFirefoxUniqueAccountFingerprintPrefs(): string[] {
  const cores = FINGERPRINT_CPU_CORES[crypto.randomInt(0, FINGERPRINT_CPU_CORES.length)];
  const acceptLang =
    FINGERPRINT_ACCEPT_LANGUAGES[crypto.randomInt(0, FINGERPRINT_ACCEPT_LANGUAGES.length)];

  return [
    'user_pref("privacy.fingerprintingProtection", false);',
    'user_pref("privacy.resistFingerprinting", false);',
    'user_pref("privacy.resistFingerprinting.randomDataOnCanvasExtract", false);',
    'user_pref("security.ssl.disable_session_identifiers", false);',
    `user_pref("dom.maxHardwareConcurrency", ${cores});`,
    `user_pref("intl.accept_languages", ${JSON.stringify(acceptLang)});`,
    'user_pref("privacy.partition.network_state", true);',
    'user_pref("privacy.partition.always_partition_third_party_non_cookie_storage", true);',
    'user_pref("dom.battery.enabled", false);',
    'user_pref("device.sensors.enabled", false);',
    'user_pref("geo.enabled", false);',
  ];
}

/**
 * Memberikan variasi piksel mikro (`±4 s/d ±16 px`) pada ukuran & posisi jendela per akun
 * agar `window.innerWidth`, `window.innerHeight`, `screenX`, dan `screenY` berbeda di tiap akun.
 */
export function applyWindowRectAccountJitter(rect: WindowRect | null): WindowRect {
  if (!rect) {
    return {
      x: 36 + crypto.randomInt(0, 72),
      y: 22 + crypto.randomInt(0, 48),
      width: 1160 + crypto.randomInt(-36, 64),
      height: 810 + crypto.randomInt(-28, 48),
    };
  }
  const dx = crypto.randomInt(-5, 6);
  const dy = crypto.randomInt(-4, 5);
  const dw = crypto.randomInt(-14, 15);
  const dh = crypto.randomInt(-12, 13);
  return {
    x: Math.max(0, rect.x + dx),
    y: Math.max(0, rect.y + dy),
    width: Math.max(380, rect.width + dw),
    height: Math.max(420, rect.height + dh),
  };
}

/**
 * Daftar pengecualian proxy untuk loopback RAGE serta domain API solver CAPTCHA pihak ketiga,
 * sehingga trafik API solver memakai internet langsung (hemat kuota DataImpulse) tanpa menyentuh domain Roblox/Arkose.
 */
export const FIREFOX_PROXY_BYPASS_LIST =
  'localhost, 127.0.0.1, .omocaptcha.com, .yescaptcha.com, .2captcha.com, .capsolver.com, .capmonster.cloud, .anti-captcha.com, .ez-captcha.com';

/**
 * Menghasilkan daftar `user_pref` Firefox untuk mode hemat kuota proxy:
 * mematikan SafeBrowsing (~18 MB/sesi), Telemetry, Merino/NewTab sponsored,
 * Remote Settings, Captive Portal, Push, prefetching, download ulang GMP/OpenH264/Widevine,
 * DNS-over-HTTPS (TRR), ML/AI background, dan pemulihan tab lama (Discord, dll),
 * sambil mengoptimalkan cache disk 512 MB agar JS/CSS/font Roblox dipakai ulang antar-akun.
 */
export function buildFirefoxDataSaverPrefs(enabled = true): string[] {
  if (!enabled) return [];
  return [
    'user_pref("browser.startup.page", 0);',
    'user_pref("browser.startup.homepage", "about:blank");',
    'user_pref("browser.sessionstore.resume_from_crash", false);',
    'user_pref("browser.sessionstore.resume_session_once", false);',
    'user_pref("browser.sessionstore.max_resumed_crashes", 0);',
    'user_pref("browser.newtabpage.enabled", false);',
    'user_pref("browser.newtab.preload", false);',
    'user_pref("browser.newtabpage.activity-stream.feeds.topsites", false);',
    'user_pref("browser.newtabpage.activity-stream.feeds.section.topstories", false);',
    'user_pref("browser.newtabpage.activity-stream.feeds.system.topstories", false);',
    'user_pref("browser.newtabpage.activity-stream.feeds.system.topsites", false);',
    'user_pref("browser.newtabpage.activity-stream.showSponsored", false);',
    'user_pref("browser.newtabpage.activity-stream.showSponsoredTopSites", false);',
    'user_pref("browser.newtabpage.activity-stream.discoverystream.enabled", false);',
    'user_pref("browser.urlbar.merino.enabled", false);',
    'user_pref("browser.urlbar.suggest.quicksuggest.sponsored", false);',
    'user_pref("browser.urlbar.suggest.quicksuggest.nonsponsored", false);',
    'user_pref("browser.safebrowsing.malware.enabled", false);',
    'user_pref("browser.safebrowsing.phishing.enabled", false);',
    'user_pref("browser.safebrowsing.downloads.enabled", false);',
    'user_pref("browser.safebrowsing.downloads.remote.enabled", false);',
    'user_pref("browser.safebrowsing.downloads.remote.block_dangerous", false);',
    'user_pref("browser.safebrowsing.downloads.remote.block_dangerous_host", false);',
    'user_pref("browser.safebrowsing.provider.google.updateURL", "");',
    'user_pref("browser.safebrowsing.provider.google.gethashURL", "");',
    'user_pref("browser.safebrowsing.provider.google4.updateURL", "");',
    'user_pref("browser.safebrowsing.provider.google4.gethashURL", "");',
    'user_pref("browser.safebrowsing.provider.google5.updateURL", "");',
    'user_pref("browser.safebrowsing.provider.google5.gethashURL", "");',
    'user_pref("browser.safebrowsing.provider.mozilla.updateURL", "");',
    'user_pref("browser.safebrowsing.provider.mozilla.gethashURL", "");',
    'user_pref("toolkit.telemetry.enabled", false);',
    'user_pref("toolkit.telemetry.unified", false);',
    'user_pref("toolkit.telemetry.server", "");',
    'user_pref("datareporting.healthreport.uploadEnabled", false);',
    'user_pref("datareporting.policy.dataSubmissionEnabled", false);',
    'user_pref("browser.ping-centre.telemetry", false);',
    'user_pref("app.shield.optoutstudies.enabled", false);',
    'user_pref("app.normandy.enabled", false);',
    'user_pref("network.captive-portal-service.enabled", false);',
    'user_pref("network.connectivity-service.enabled", false);',
    'user_pref("dom.push.enabled", false);',
    'user_pref("dom.push.connection.enabled", false);',
    'user_pref("network.trr.mode", 5);',
    'user_pref("network.dns.disablePrefetch", true);',
    'user_pref("network.prefetch-next", false);',
    'user_pref("network.predictor.enabled", false);',
    'user_pref("network.http.speculative-parallel-limit", 0);',
    'user_pref("browser.places.speculativeConnect.enabled", false);',
    'user_pref("media.gmp-provider.enabled", false);',
    'user_pref("media.gmp-gmpopenh264.enabled", false);',
    'user_pref("media.gmp-widevinecdm.enabled", false);',
    'user_pref("media.gmp-manager.url", "");',
    'user_pref("browser.ml.enable", false);',
    'user_pref("browser.ml.chat.enabled", false);',
    'user_pref("extensions.ml.enabled", false);',
    'user_pref("dom.private-attribution.submission.enabled", false);',
    'user_pref("browser.region.network.url", "");',
    'user_pref("app.update.auto", false);',
    'user_pref("extensions.update.enabled", false);',
    'user_pref("extensions.blocklist.enabled", false);',
    'user_pref("extensions.getAddons.cache.enabled", false);',
    'user_pref("services.settings.poll_interval", 31536000);',
    'user_pref("browser.cache.disk.enable", true);',
    'user_pref("browser.cache.disk.capacity", 524288);',
    'user_pref("browser.cache.disk.smart_size.enabled", false);',
    'user_pref("browser.cache.check_doc_frequency", 2);',
    'user_pref("browser.cache.memory.enable", true);',
  ];
}

/**
 * Finds an available local TCP port for Marionette.
 */
async function getFreeTcpPort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, '127.0.0.1', () => {
      const addr = srv.address();
      const port = typeof addr === 'object' && addr ? addr.port : 2828;
      srv.close(() => resolve(port));
    });
    srv.on('error', reject);
  });
}

/**
 * Native Mozilla Firefox Marionette Protocol v3 Client.
 * Drives the user's actual installed `C:\Program Files\Mozilla Firefox\firefox.exe` directly
 * without requiring geckodriver or Playwright's patched Juggler binary.
 */
export class FirefoxMarionetteSession {
  private proc: ChildProcess | null = null;
  private socket: net.Socket | null = null;
  private msgId = 1;
  private buffer = Buffer.alloc(0);
  private pending = new Map<
    number,
    { resolve: (val: any) => void; reject: (err: Error) => void }
  >();
  private greetingResolved = false;
  private greetingCallback: (() => void) | null = null;
  private originalUserJs: string | null = null;
  private hadOriginalUserJs = false;
  private profileDir: string;
  private closed = false;

  private constructor(profileDir: string) {
    this.profileDir = profileDir;
  }

  public static async launch(params: {
    executablePath: string;
    profileDir: string;
    proxy?: MarionetteProxyConfig | null;
    dataSaver?: boolean;
    tileRect?: WindowRect | null;
  }): Promise<FirefoxMarionetteSession> {
    const session = new FirefoxMarionetteSession(params.profileDir);
    await session.start(
      params.executablePath,
      params.proxy ?? null,
      params.dataSaver ?? true,
      params.tileRect ?? null
    );
    return session;
  }

  private async start(
    executablePath: string,
    proxy: MarionetteProxyConfig | null,
    dataSaver = true,
    tileRect: WindowRect | null = null
  ): Promise<void> {
    const jitteredRect = applyWindowRectAccountJitter(tileRect);
    patchFirefoxXulstoreRect(this.profileDir, jitteredRect);
    const marionettePort = await getFreeTcpPort();
    const userJsPath = path.join(this.profileDir, 'user.js');

    if (fs.existsSync(userJsPath)) {
      this.hadOriginalUserJs = true;
      this.originalUserJs = fs.readFileSync(userJsPath, 'utf8');
    }

    const injectedPrefs: string[] = [
      `user_pref("marionette.port", ${marionettePort});`,
      `user_pref("marionette.enabled", true);`,
      `user_pref("browser.shell.checkDefaultBrowser", false);`,
      `user_pref("browser.startup.homepage_override.mstone", "ignore");`,
      `user_pref("datareporting.policy.dataSubmissionPolicyBypassNotification", true);`,
      `user_pref("toolkit.startup.max_resumed_crashes", -1);`,
      `user_pref("browser.sessionstore.resume_from_crash", false);`,
      ...buildFirefoxDisableWebAuthnPrefs(),
      ...buildFirefoxUniqueAccountFingerprintPrefs(),
      ...buildFirefoxDataSaverPrefs(dataSaver),
    ];

    if (proxy) {
      try {
        const parsedUrl = new URL(
          /^https?:\/\/|^socks/i.test(proxy.server) ? proxy.server : `http://${proxy.server}`
        );
        const host = parsedUrl.hostname;
        const port = Number(parsedUrl.port || 80);
        injectedPrefs.push(`user_pref("network.proxy.type", 1);`);
        injectedPrefs.push(
          `user_pref("network.proxy.no_proxies_on", ${JSON.stringify(FIREFOX_PROXY_BYPASS_LIST)});`
        );
        injectedPrefs.push(`user_pref("network.proxy.allow_hijacking_localhost", false);`);
        if (parsedUrl.protocol.startsWith('socks')) {
          injectedPrefs.push(`user_pref("network.proxy.socks", ${JSON.stringify(host)});`);
          injectedPrefs.push(`user_pref("network.proxy.socks_port", ${port});`);
        } else {
          injectedPrefs.push(`user_pref("network.proxy.http", ${JSON.stringify(host)});`);
          injectedPrefs.push(`user_pref("network.proxy.http_port", ${port});`);
          injectedPrefs.push(`user_pref("network.proxy.ssl", ${JSON.stringify(host)});`);
          injectedPrefs.push(`user_pref("network.proxy.ssl_port", ${port});`);
        }
      } catch {
        // ignore invalid proxy URL
      }
    }

    const combinedUserJs = [
      this.originalUserJs ? this.originalUserJs.trimEnd() : '',
      '// --- RAGE MARIONETTE SESSION PREFS ---',
      ...injectedPrefs,
      '',
    ]
      .filter(Boolean)
      .join('\n');

    fs.writeFileSync(userJsPath, combinedUserJs, 'utf8');

    this.proc = spawn(
      executablePath,
      ['-marionette', '-no-remote', '-new-instance', '-profile', this.profileDir, 'about:blank'],
      {
        stdio: 'ignore',
        detached: false,
      }
    );

    this.proc.on('exit', () => {
      this.closed = true;
    });

    await this.connectSocketWithRetry(marionettePort, 25000);
    await this.sendCommand('WebDriver:NewSession', {});
    if (tileRect) {
      await this.sendCommand('WebDriver:SetWindowRect', {
        x: tileRect.x,
        y: tileRect.y,
        width: tileRect.width,
        height: tileRect.height,
      }).catch(() => {});
    }
  }

  private async connectSocketWithRetry(port: number, timeoutMs: number): Promise<void> {
    const start = Date.now();
    let lastError: Error | null = null;

    while (Date.now() - start < timeoutMs) {
      if (this.closed) {
        throw new Error(
          'Mozilla Firefox tertutup sebelum koneksi Marionette terbentuk. Pastikan profil tidak sedang terkunci.'
        );
      }

      try {
        await new Promise<void>((resolve, reject) => {
          const sock = net.createConnection(port, '127.0.0.1');
          let connected = false;

          const timer = setTimeout(() => {
            if (!connected) {
              sock.destroy();
              reject(new Error('Timeout connecting to Marionette port'));
            }
          }, 1500);

          sock.once('connect', () => {
            connected = true;
            clearTimeout(timer);
            this.socket = sock;
            this.greetingCallback = () => resolve();
            this.setupSocketListeners(sock);
          });

          sock.once('error', (err) => {
            clearTimeout(timer);
            sock.destroy();
            reject(err);
          });
        });
        return;
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        await new Promise((r) => setTimeout(r, 400));
      }
    }

    throw new Error(
      `Gagal terhubung ke Mozilla Firefox Marionette (port ${port}): ${
        lastError?.message || 'timeout'
      }`
    );
  }

  private setupSocketListeners(sock: net.Socket): void {
    sock.on('data', (chunk: Buffer) => {
      this.buffer = Buffer.concat([this.buffer, chunk]);
      this.processIncomingBuffer();
    });

    sock.on('close', () => {
      this.closed = true;
      for (const [, p] of this.pending) {
        p.reject(new Error('Mozilla Firefox ditutup.'));
      }
      this.pending.clear();
    });

    sock.on('error', () => {
      // handled on close
    });
  }

  private processIncomingBuffer(): void {
    while (this.buffer.length > 0) {
      const colonIdx = this.buffer.indexOf(0x3a); // ':'
      if (colonIdx === -1) return;

      const lenStr = this.buffer.subarray(0, colonIdx).toString('ascii');
      const byteLen = Number.parseInt(lenStr, 10);
      if (Number.isNaN(byteLen)) {
        this.buffer = Buffer.alloc(0);
        return;
      }

      const totalFrameLen = colonIdx + 1 + byteLen;
      if (this.buffer.length < totalFrameLen) return;

      const jsonBytes = this.buffer.subarray(colonIdx + 1, totalFrameLen);
      this.buffer = this.buffer.subarray(totalFrameLen);

      try {
        const parsed = JSON.parse(jsonBytes.toString('utf8'));
        if (!Array.isArray(parsed) && parsed && parsed.applicationType === 'gecko') {
          this.greetingResolved = true;
          if (this.greetingCallback) {
            const cb = this.greetingCallback;
            this.greetingCallback = null;
            cb();
          }
          continue;
        }

        if (Array.isArray(parsed) && parsed[0] === 1) {
          const [, id, error, result] = parsed;
          const waiter = this.pending.get(id);
          if (waiter) {
            this.pending.delete(id);
            if (error) {
              waiter.reject(
                new Error(
                  typeof error === 'object' && error.message
                    ? String(error.message)
                    : JSON.stringify(error)
                )
              );
            } else {
              waiter.resolve(result);
            }
          }
        }
      } catch {
        // ignore malformed packet
      }
    }
  }

  public async sendCommand<T = any>(
    command: string,
    params: Record<string, unknown> = {}
  ): Promise<T> {
    if (this.closed || !this.socket) {
      throw new Error('Koneksi Mozilla Firefox sudah ditutup.');
    }
    const id = this.msgId++;
    const payload = JSON.stringify([0, id, command, params]);
    const frame = `${Buffer.byteLength(payload, 'utf8')}:${payload}`;

    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.socket!.write(frame, (err) => {
        if (err) {
          this.pending.delete(id);
          reject(err);
        }
      });
    });
  }

  public async navigate(url: string): Promise<void> {
    await this.sendCommand('WebDriver:Navigate', { url });
  }

  public async getCookies(): Promise<MarionetteCookie[]> {
    const res = await this.sendCommand<MarionetteCookie[] | { value?: MarionetteCookie[] }>(
      'WebDriver:GetCookies',
      {}
    );
    if (Array.isArray(res)) return res;
    if (res && Array.isArray(res.value)) return res.value;
    return [];
  }

  public async deleteCookie(name: string): Promise<void> {
    await this.sendCommand('WebDriver:DeleteCookie', { name }).catch(() => {});
  }

  public async deleteAllCookies(): Promise<void> {
    await this.sendCommand('WebDriver:DeleteAllCookies', {}).catch(() => {});
  }

  /**
   * Clears all Roblox, PerimeterX (`_px*`), and Arkose/FunCaptcha cookies on the current browsing
   * context so the user's other website logins (Google, YouTube, Discord, etc.) remain untouched!
   */
  public async clearRobloxAuthCookiesOnly(): Promise<boolean> {
    const cookies = await this.getCookies().catch(() => []);
    let hadRoblosecurity = false;

    for (const c of cookies) {
      const domain = (c.domain || '').toLowerCase();
      if (c.name === '.ROBLOSECURITY') {
        hadRoblosecurity = true;
      }
      const isRobloxOrChallengeDomain =
        !domain ||
        domain.includes('roblox.com') ||
        domain.includes('rbxcdn.com') ||
        domain.includes('arkoselabs.com') ||
        domain.includes('funcaptcha.com') ||
        domain.includes('px-cloud.net') ||
        domain.includes('px-cdn.net') ||
        domain.includes('perimeterx.net');
      if (isRobloxOrChallengeDomain || c.name.startsWith('_px')) {
        await this.deleteCookie(c.name);
      }
    }
    return hadRoblosecurity;
  }

  public async executeScript<T = any>(script: string, args: unknown[] = []): Promise<T> {
    const res = await this.sendCommand<{ value?: T } | T>('WebDriver:ExecuteScript', {
      script,
      args,
    });
    if (res && typeof res === 'object' && 'value' in (res as Record<string, unknown>)) {
      return (res as { value: T }).value;
    }
    return res as T;
  }

  public async findElement(cssSelector: string): Promise<string | null> {
    try {
      const res = await this.sendCommand<Record<string, any>>('WebDriver:FindElement', {
        using: 'css selector',
        value: cssSelector,
      });
      const val = res?.value ?? res;
      if (val && typeof val === 'object') {
        for (const k of Object.keys(val)) {
          if (k.startsWith('element-') || k === 'ELEMENT') {
            return String(val[k]);
          }
        }
      }
      return null;
    } catch {
      return null;
    }
  }

  public async clickElement(elementId: string): Promise<void> {
    await this.sendCommand('WebDriver:ElementClick', { id: elementId });
  }

  public async clearElement(elementId: string): Promise<void> {
    await this.sendCommand('WebDriver:ElementClear', { id: elementId });
  }

  public async sendKeysToElement(elementId: string, text: string): Promise<void> {
    await this.sendCommand('WebDriver:ElementSendKeys', { id: elementId, text });
  }

  public async isWindowOpen(): Promise<boolean> {
    if (this.closed) return false;
    try {
      const handles = await this.sendCommand<string[] | { value?: string[] }>(
        'WebDriver:GetWindowHandles',
        {}
      );
      const list = Array.isArray(handles) ? handles : handles?.value ?? [];
      return list.length > 0;
    } catch {
      return false;
    }
  }

  private restoreUserJs(): void {
    try {
      const userJsPath = path.join(this.profileDir, 'user.js');
      if (this.hadOriginalUserJs && this.originalUserJs !== null) {
        fs.writeFileSync(userJsPath, this.originalUserJs, 'utf8');
      } else if (fs.existsSync(userJsPath)) {
        fs.rmSync(userJsPath, { force: true });
      }
    } catch {
      // ignore fs cleanup error
    }
  }

  public async close(): Promise<void> {
    if (!this.closed && this.socket) {
      try {
        await Promise.race([
          this.sendCommand('Marionette:Quit', {}),
          new Promise((r) => setTimeout(r, 1500)),
        ]);
      } catch {
        // ignore
      }
    }
    this.closed = true;

    if (this.socket) {
      this.socket.destroy();
      this.socket = null;
    }

    if (this.proc && !this.proc.killed) {
      try {
        this.proc.kill();
      } catch {
        // ignore
      }
    }

    this.restoreUserJs();
  }
}
