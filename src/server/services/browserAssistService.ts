import { chromium, firefox, BrowserContext } from 'playwright';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import tls from 'node:tls';
import { db, GeneratedAccountDataRecord } from '../db/index.js';
import { CredentialVault } from '../vault/credentialVault.js';
import { RegistrationService } from './registrationService.js';
import { JobManager } from '../queue/jobManager.js';
import { GeneratorService, GeneratedCandidateDTO } from './generatorService.js';
import {
  applyWindowRectAccountJitter,
  detectFirefoxProfiles,
  detectInstalledFirefoxExecutable,
  FirefoxMarionetteSession,
  FirefoxProfileInfo,
  getMasterFirefoxProfileDir,
  hasValidMasterFirefoxProfile,
  isFirefoxProfileLocked,
  prepareMainFirefoxProfileForWorker,
} from './firefoxMarionetteDriver.js';
import {
  clearRobloxAndCaptchaStorage,
  clearRobloxAuthCookiesInSqlite,
  clearRobloxPlacesHistoryInSqlite,
  closeFirefoxManualInstance,
  createOrSyncMasterFirefoxProfile,
  getMasterFirefoxProfileStatus,
  hasRecentRobloxHomeVisit,
  MasterFirefoxProfileStatus,
  openFirefoxNormally,
  readRoblosecurityFromProfile,
  setWorkerLoopbackCookieInSqlite,
} from './firefoxManualCapture.js';
import {
  allocateFreshStickyToken,
  hasEmbeddedStickySession,
  isBlockedByDataSaver,
  isDataImpulseProxy,
  LocalProxyBridge,
  ProxyBridgeOptions,
  replaceEmbeddedStickySession,
} from './localProxyBridge.js';
import {
  applyWin32WindowRect,
  computeWorkerWindowRect,
  getWindowsWorkingArea,
  WindowRect,
  WindowSplitMode,
} from './windowTiling.js';
import {
  RobloxSignupFormPayload,
  runRobloxAutofillInMarionette,
  runRobloxAutofillInPlaywright,
} from './robloxFormFiller.js';

export interface DetectedChromeExtension {
  id: string;
  name: string;
  version: string;
  path: string;
  source: 'CHROME_PROFILE' | 'CUSTOM_DIR';
}

export interface ChromeExtensionInfo {
  userDataDir: string | null;
  sourceProfileDir: string | null;
  customExtensionsDir: string;
  extensions: DetectedChromeExtension[];
}

const CHROME_BUILTIN_EXTENSION_IDS = new Set([
  'ghbmnnjooekpmoecnnnilnnbdlolhkhi', // Google Docs Offline
  'nmmhkkegccagdldgiimedpiccmgmieda', // Chrome Web Store Payments
]);

function resolveChromeExtensionName(
  extVersionDir: string,
  rawName: string,
  defaultLocale?: string
): string {
  const m = rawName.match(/^__MSG_([A-Za-z0-9_@]+)__$/);
  if (!m) return rawName;
  const msgKey = m[1];
  const localesToTry = [defaultLocale, 'en', 'en_US', 'id'].filter(Boolean) as string[];
  const localesDir = path.join(extVersionDir, '_locales');
  if (fs.existsSync(localesDir)) {
    try {
      for (const d of fs.readdirSync(localesDir)) {
        if (!localesToTry.includes(d)) localesToTry.push(d);
      }
    } catch {
      // ignore
    }
  }
  for (const loc of localesToTry) {
    const msgFile = path.join(localesDir, loc, 'messages.json');
    if (!fs.existsSync(msgFile)) continue;
    try {
      const parsed = JSON.parse(fs.readFileSync(msgFile, 'utf8')) as Record<
        string,
        { message?: string }
      >;
      const found =
        parsed[msgKey]?.message ||
        Object.entries(parsed).find(([k]) => k.toLowerCase() === msgKey.toLowerCase())?.[1]
          ?.message;
      if (found) return found;
    } catch {
      // ignore invalid locale file
    }
  }
  return rawName;
}

export type BrowserVariant =
  | 'CHROME'
  | 'EDGE'
  | 'FIREFOX'
  | 'FIREFOX_MAIN'
  | 'FIREFOX_MANUAL'
  | 'CHROMIUM'
  | 'ROTATE';

export interface AssistedSessionStatus {
  candidateId: string;
  candidateUsername: string;
  workerId?: number;
  browserVariant?: string;
  profileDir?: string;
  proxyUsed?: string | null;
  status:
    | 'LAUNCHING'
    | 'FORM_FILLED_WAITING_HUMAN'
    | 'CAPTURED_SAVING'
    | 'COMPLETED'
    | 'TIMEOUT'
    | 'CANCELED'
    | 'ERROR';
  message: string;
  robloxUserId: string | null;
  robloxUsername: string | null;
  accountId: string | null;
  formattedOutput: string | null; // username:password:cookie
  startedAt: string;
  updatedAt: string;
}

export interface BatchRegistrationConfig {
  usernamePrefix: string;
  usernameLength: number;
  passwordPrefix: string;
  passwordLength: number;
  birthDay: string; // "01".."28" or "RANDOM"
  birthMonth: string; // "Jan".."Dec" or "RANDOM"
  birthYear: string; // "1990".."2010" or "RANDOM"
  gender: 'MALE' | 'FEMALE' | 'RANDOM';
  quantity: number;
  workerCount: number;
  browserVariant: BrowserVariant;
  clearProfileBeforeRun: boolean;
  customFirefoxProfilePath?: string;
  useMasterWarmProfile?: boolean;
  useProxy: boolean;
  proxyList: string[];
  proxyDataSaver?: boolean;
  proxyBlockHeavyMedia?: boolean;
  autoSplitWindow?: boolean;
  windowSplitMode?: WindowSplitMode;
  workerTimeoutSeconds?: number;
  proxyOneAccountOneSticky?: boolean;
}

export interface WorkerSlotStatus {
  workerId: number;
  browserVariant: string;
  profilePath: string;
  state: 'IDLE' | 'OPENING_BROWSER' | 'WAITING_REGISTRATION' | 'SAVING' | 'STOPPED' | 'ERROR';
  currentUsername: string | null;
  proxyServer: string | null;
  message: string;
  completedByWorker: number;
  currentPassword?: string | null;
  formHint?: string | null;
  proxyBytes?: number;
  proxyBlockedRequests?: number;
  deadlineAt?: number | null;
  remainingSeconds?: number | null;
}

export interface BatchRunState {
  batchId: string | null;
  jobId: string | null;
  running: boolean;
  paused?: boolean;
  pausedAt?: string | null;
  accumulatedPauseMs?: number;
  totalTarget: number;
  completedCount: number;
  failedCount: number;
  replacedCount?: number;
  activeWorkerCount: number;
  config: BatchRegistrationConfig | null;
  workers: WorkerSlotStatus[];
  registeredLines: string[]; // username:password:cookie
  startedAt: string | null;
  updatedAt: string | null;
  proxyTotalBytes?: number;
  proxyTotalBlockedRequests?: number;
}

interface ParsedProxy {
  server: string;
  username?: string;
  password?: string;
  display: string;
}

export class BrowserAssistService {
  private static sessions = new Map<string, AssistedSessionStatus>();
  private static activeContexts = new Map<string, BrowserContext>();
  private static activeMarionetteSessions = new Map<string, FirefoxMarionetteSession>();
  private static persistentManualBridges = new Map<number, LocalProxyBridge>();
  private static manualHomeRedirectSignals = new Map<number, number>();
  private static activeAutofillTargets = new Map<
    number,
    RobloxSignupFormPayload & { workerId: number; candidateId: string }
  >();

  public static notifyManualHomeRedirect(workerId?: number): void {
    const now = Date.now();
    if (workerId && workerId > 0) {
      this.manualHomeRedirectSignals.set(workerId, now);
    } else {
      this.manualHomeRedirectSignals.set(0, now);
    }
  }

  public static getActiveAutofillTargets(workerId?: number): Array<
    RobloxSignupFormPayload & { workerId: number; candidateId: string }
  > {
    if (workerId && workerId > 0) {
      const exact = this.activeAutofillTargets.get(workerId);
      return exact ? [exact] : [];
    }
    // Saat multi-worker aktif, JANGAN pernah mengembalikan target worker lain jika workerId tidak dikirim
    if (this.batchState.workers.length > 1 || this.activeAutofillTargets.size > 1) {
      return [];
    }
    return Array.from(this.activeAutofillTargets.values()).sort((a, b) => a.workerId - b.workerId);
  }

  public static recordMissingWorkerIdWarning(): void {
    if (!this.batchState.running || this.batchState.workers.length <= 1) return;
    for (const w of this.batchState.workers) {
      if (w.state === 'WAITING_REGISTRATION' || w.state === 'OPENING_BROWSER') {
        if (!w.message.includes('PASANG USERSCRIPT')) {
          w.message =
            '⚠️ Request autofill tanpa workerId! Klik PASANG USERSCRIPT (0-KLIK) di dashboard agar multi-worker tidak tertukar.';
        }
      }
    }
    this.batchState.updatedAt = new Date().toISOString();
  }

  private static generateFallbackRobloxUserId(): string {
    return `${Date.now()}${String(crypto.randomInt(100, 999))}`;
  }

  private static async fetchAuthenticatedRobloxUser(
    cookie: string,
    localProxyUrl?: string | null
  ): Promise<{ id: string | null; name: string | null }> {
    const cookieHeader = `.ROBLOSECURITY=${cookie}`;
    if (!localProxyUrl) {
      try {
        const res = await fetch('https://users.roblox.com/v1/users/authenticated', {
          headers: { Cookie: cookieHeader, Accept: 'application/json' },
          signal: AbortSignal.timeout(4500),
        });
        if (res.ok) {
          const data = (await res.json()) as { id?: string | number; name?: string };
          return {
            id: data.id ? String(data.id) : null,
            name: data.name ? String(data.name) : null,
          };
        }
      } catch {
        // fallback below
      }
      return { id: null, name: null };
    }

    // Lewatkan melalui LocalProxyBridge jika proxy aktif agar request memakai IP yang sama
    return new Promise((resolve) => {
      let settled = false;
      const done = (val: { id: string | null; name: string | null }) => {
        if (!settled) {
          settled = true;
          resolve(val);
        }
      };
      const timer = setTimeout(() => done({ id: null, name: null }), 5000);
      try {
        const proxyUrl = new URL(localProxyUrl);
        const req = http.request({
          host: proxyUrl.hostname,
          port: Number(proxyUrl.port),
          method: 'CONNECT',
          path: 'users.roblox.com:443',
        });
        req.on('connect', (res, socket) => {
          if (res.statusCode !== 200) {
            socket.destroy();
            clearTimeout(timer);
            done({ id: null, name: null });
            return;
          }
          const tlsSock = tls.connect(
            { socket, servername: 'users.roblox.com' },
            () => {
              tlsSock.write(
                `GET /v1/users/authenticated HTTP/1.1\r\nHost: users.roblox.com\r\nCookie: ${cookieHeader}\r\nAccept: application/json\r\nConnection: close\r\n\r\n`
              );
            }
          );
          let raw = '';
          tlsSock.on('data', (c) => {
            raw += c.toString('utf8');
          });
          tlsSock.on('end', () => {
            clearTimeout(timer);
            const bodyIdx = raw.indexOf('\r\n\r\n');
            if (bodyIdx === -1) return done({ id: null, name: null });
            try {
              const body = raw.slice(bodyIdx + 4).trim();
              const jsonStart = body.indexOf('{');
              const data = JSON.parse(jsonStart >= 0 ? body.slice(jsonStart) : body) as {
                id?: string | number;
                name?: string;
              };
              done({
                id: data.id ? String(data.id) : null,
                name: data.name ? String(data.name) : null,
              });
            } catch {
              done({ id: null, name: null });
            }
          });
          tlsSock.on('error', () => {
            clearTimeout(timer);
            done({ id: null, name: null });
          });
        });
        req.on('error', () => {
          clearTimeout(timer);
          done({ id: null, name: null });
        });
        req.end();
      } catch {
        clearTimeout(timer);
        done({ id: null, name: null });
      }
    });
  }

  private static normalizeSignupPayload(params: {
    birthMonth: string;
    birthDay: string;
    birthYear: string;
    username: string;
    gender: 'MALE' | 'FEMALE' | 'RANDOM';
    password: string;
  }): RobloxSignupFormPayload {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return {
      birthMonth:
        params.birthMonth && params.birthMonth !== 'RANDOM' && months.includes(params.birthMonth)
          ? params.birthMonth
          : months[Math.floor(Math.random() * months.length)],
      birthDay:
        params.birthDay && params.birthDay !== 'RANDOM'
          ? params.birthDay.padStart(2, '0')
          : String(Math.floor(Math.random() * 25) + 1).padStart(2, '0'),
      birthYear:
        params.birthYear && params.birthYear !== 'RANDOM'
          ? params.birthYear
          : String(Math.floor(Math.random() * 7) + 1998),
      username: params.username,
      gender:
        params.gender === 'RANDOM'
          ? Math.random() > 0.5
            ? 'MALE'
            : 'FEMALE'
          : params.gender,
      password: params.password,
    };
  }

  public static getFirefoxProfileInfo(
    customPath?: string
  ): FirefoxProfileInfo & { masterProfile: MasterFirefoxProfileStatus } {
    const base = detectFirefoxProfiles(customPath);
    const masterProfile = getMasterFirefoxProfileStatus(this.getProfilesRootDir());
    return {
      ...base,
      masterProfile,
    };
  }

  public static syncMasterFirefoxProfile(
    sourceProfilePath?: string
  ): MasterFirefoxProfileStatus {
    return createOrSyncMasterFirefoxProfile({
      sourceProfilePath,
      profilesRootDir: this.getProfilesRootDir(),
      resetExisting: true,
    });
  }

  private static batchState: BatchRunState = {
    batchId: null,
    jobId: null,
    running: false,
    paused: false,
    pausedAt: null,
    accumulatedPauseMs: 0,
    totalTarget: 0,
    completedCount: 0,
    failedCount: 0,
    replacedCount: 0,
    activeWorkerCount: 0,
    config: null,
    workers: [],
    registeredLines: [],
    startedAt: null,
    updatedAt: null,
    proxyTotalBytes: 0,
    proxyTotalBlockedRequests: 0,
  };
  private static stopRequested = false;
  private static pauseRequested = false;
  private static pauseStartedAtMs: number | null = null;

  private static syncLiveProxyStats(): void {
    let totalBytes = 0;
    let totalBlocked = 0;
    const now = Date.now();
    for (const w of this.batchState.workers) {
      const bridge = this.persistentManualBridges.get(w.workerId);
      if (bridge) {
        const stats = bridge.getStats();
        w.proxyBytes = stats.bytesTransferred;
        w.proxyBlockedRequests = stats.blockedRequests;
      }
      if (
        w.deadlineAt &&
        (w.state === 'WAITING_REGISTRATION' || w.state === 'OPENING_BROWSER')
      ) {
        w.remainingSeconds = Math.max(0, Math.ceil((w.deadlineAt - now) / 1000));
      } else {
        w.remainingSeconds = null;
      }
      totalBytes += w.proxyBytes ?? 0;
      totalBlocked += w.proxyBlockedRequests ?? 0;
    }
    this.batchState.proxyTotalBytes = totalBytes;
    this.batchState.proxyTotalBlockedRequests = totalBlocked;
  }

  /**
   * Menandai kandidat bermasalah/timeout sebagai FAILED dan langsung membuat 1 kandidat
   * username+password baru yang fresh agar target jumlah akun batch tetap terpenuhi.
   */
  public static createReplacementCandidate(params: {
    failedCandidateId: string;
    reason: string;
    jobId: string;
    usernamePrefix: string;
    usernameLength: number;
    passwordPrefix: string;
    passwordLength: number;
    performedById: string | null;
  }): GeneratedCandidateDTO {
    const now = new Date().toISOString();
    const existing = db.raw
      .prepare('SELECT candidate_username, registration_state FROM generated_account_data WHERE id = ?')
      .get(params.failedCandidateId) as
      | { candidate_username: string; registration_state: string }
      | undefined;

    db.transaction(() => {
      if (existing && existing.registration_state !== 'REGISTERED') {
        db.raw
          .prepare(
            `UPDATE generated_account_data
             SET registration_state = 'FAILED',
                 last_error = ?,
                 attempt_count = attempt_count + 1,
                 updated_at = ?
             WHERE id = ? AND registration_state != 'REGISTERED'`
          )
          .run(params.reason.slice(0, 500), now, params.failedCandidateId);

        db.raw
          .prepare(
            `INSERT INTO registration_events (
              id, candidate_id, account_id, job_id, event_type,
              status_before, status_after, roblox_user_id, roblox_username, notes, performed_by_id, created_at
            ) VALUES (?, ?, NULL, ?, 'WORKER_TIMEOUT_OR_ERROR', ?, 'FAILED', NULL, ?, ?, ?, ?)`
          )
          .run(
            crypto.randomUUID(),
            params.failedCandidateId,
            params.jobId,
            existing.registration_state,
            existing.candidate_username,
            params.reason.slice(0, 500),
            params.performedById,
            now
          );
      }
    });

    const gen = GeneratorService.generateBatch({
      quantity: 1,
      prefix: params.usernamePrefix,
      suffix: '',
      length: params.usernameLength,
      passwordPrefix: params.passwordPrefix,
      passwordLength: params.passwordLength,
      includeSymbols: true,
      jobId: params.jobId,
      createdById: params.performedById,
    });
    const replacement = gen.candidates[0];

    db.raw
      .prepare(
        `UPDATE generated_account_data
         SET registration_state = 'VERIFICATION_REQUIRED', updated_at = ?
         WHERE id = ?`
      )
      .run(new Date().toISOString(), replacement.id);

    JobManager.recalculateJobCounters(params.jobId);
    replacement.registrationState = 'VERIFICATION_REQUIRED';
    return replacement;
  }

  private static async getOrStartWorkerBridge(
    workerId: number,
    proxy: ParsedProxy,
    options: ProxyBridgeOptions
  ): Promise<LocalProxyBridge | null> {
    if (/^socks/i.test(proxy.server)) {
      return null;
    }
    let bridge = this.persistentManualBridges.get(workerId) ?? null;
    if (bridge) {
      bridge.updateUpstream({ ...proxy, ...options });
    } else {
      bridge = await LocalProxyBridge.start({ ...proxy, ...options });
      this.persistentManualBridges.set(workerId, bridge);
    }
    return bridge;
  }

  public static getSessionStatus(candidateId: string): AssistedSessionStatus | null {
    return this.sessions.get(candidateId) ?? null;
  }

  public static getBatchState(): BatchRunState {
    this.syncLiveProxyStats();
    return this.batchState;
  }

  public static getProfilesRootDir(): string {
    const dir = path.resolve(process.cwd(), 'data', 'worker_profiles');
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    }
    return dir;
  }

  public static resolveWorkerBrowserVariant(
    requested: BrowserVariant,
    workerId: number
  ): 'CHROME' | 'EDGE' | 'FIREFOX' | 'FIREFOX_MAIN' | 'FIREFOX_MANUAL' | 'CHROMIUM' {
    if (requested !== 'ROTATE') {
      return requested;
    }
    const rotation: Array<'CHROME' | 'EDGE' | 'FIREFOX_MAIN'> = [
      'CHROME',
      'EDGE',
      'FIREFOX_MAIN',
    ];
    return rotation[(workerId - 1) % rotation.length];
  }

  public static prepareWorkerProfileDir(
    variant: 'CHROME' | 'EDGE' | 'FIREFOX' | 'FIREFOX_MAIN' | 'CHROMIUM',
    workerId: number,
    clearBeforeRun: boolean,
    preserveCache = false
  ): string {
    const root = this.getProfilesRootDir();
    const folderName = `${variant.toLowerCase()}_worker_profile_${workerId}`;
    const fullPath = path.join(root, folderName);

    if (clearBeforeRun && fs.existsSync(fullPath)) {
      if (preserveCache) {
        // Hemat kuota & pertahankan ekstensi: simpan Cache JS/CSS & Extensions, hapus cookie & storage situs saja
        const sessionItems = [
          'Default/Cookies',
          'Default/Cookies-journal',
          'Default/Network/Cookies',
          'Default/Network/Cookies-journal',
          'Default/Local Storage',
          'Default/Session Storage',
          'cookies.sqlite',
          'cookies.sqlite-wal',
          'cookies.sqlite-shm',
        ];
        for (const rel of sessionItems) {
          try {
            fs.rmSync(path.join(fullPath, rel), { recursive: true, force: true });
          } catch {
            // ignore if locked
          }
        }
        const idbDir = path.join(fullPath, 'Default', 'IndexedDB');
        if (fs.existsSync(idbDir)) {
          try {
            for (const entry of fs.readdirSync(idbDir)) {
              if (entry.startsWith('chrome-extension_')) continue;
              try {
                fs.rmSync(path.join(idbDir, entry), { recursive: true, force: true });
              } catch {
                // ignore
              }
            }
          } catch {
            // ignore
          }
        }
      } else {
        try {
          fs.rmSync(fullPath, { recursive: true, force: true });
        } catch {
          // ignore if locked
        }
      }
    }

    if (!fs.existsSync(fullPath)) {
      fs.mkdirSync(fullPath, { recursive: true, mode: 0o700 });
    }
    return fullPath;
  }

  public static getChromeExtensionsCustomDir(): string {
    const dir = path.resolve(process.cwd(), 'data', 'chrome_extensions');
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    }
    return dir;
  }

  public static detectChromeExtensions(): ChromeExtensionInfo {
    const localAppData =
      process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
    const candidateUserData = path.join(localAppData, 'Google', 'Chrome', 'User Data');
    const userDataDir = fs.existsSync(candidateUserData) ? candidateUserData : null;
    const defProf =
      userDataDir && fs.existsSync(path.join(userDataDir, 'Default'))
        ? path.join(userDataDir, 'Default')
        : null;
    const customExtensionsDir = this.getChromeExtensionsCustomDir();
    const extensions: DetectedChromeExtension[] = [];

    if (defProf) {
      const extRoot = path.join(defProf, 'Extensions');
      if (fs.existsSync(extRoot)) {
        try {
          for (const id of fs.readdirSync(extRoot)) {
            if (id === 'Temp' || CHROME_BUILTIN_EXTENSION_IDS.has(id)) continue;
            const idDir = path.join(extRoot, id);
            if (!fs.statSync(idDir).isDirectory()) continue;
            const versions = fs
              .readdirSync(idDir)
              .filter((v) => fs.existsSync(path.join(idDir, v, 'manifest.json')))
              .sort();
            if (versions.length === 0) continue;
            const ver = versions[versions.length - 1];
            const verPath = path.join(idDir, ver);
            try {
              const mf = JSON.parse(
                fs.readFileSync(path.join(verPath, 'manifest.json'), 'utf8')
              ) as { name?: string; version?: string; default_locale?: string };
              const resolvedName = resolveChromeExtensionName(
                verPath,
                mf.name || id,
                mf.default_locale
              );
              extensions.push({
                id,
                name: resolvedName,
                version: mf.version || ver,
                path: verPath,
                source: 'CHROME_PROFILE',
              });
            } catch {
              // ignore malformed manifest
            }
          }
        } catch {
          // ignore scan error
        }
      }
    }

    if (fs.existsSync(customExtensionsDir)) {
      try {
        for (const folder of fs.readdirSync(customExtensionsDir)) {
          const full = path.join(customExtensionsDir, folder);
          const mfPath = path.join(full, 'manifest.json');
          if (!fs.existsSync(mfPath)) continue;
          try {
            const mf = JSON.parse(fs.readFileSync(mfPath, 'utf8')) as {
              name?: string;
              version?: string;
              default_locale?: string;
            };
            extensions.push({
              id: folder,
              name: resolveChromeExtensionName(full, mf.name || folder, mf.default_locale),
              version: mf.version || 'custom',
              path: full,
              source: 'CUSTOM_DIR',
            });
          } catch {
            // ignore
          }
        }
      } catch {
        // ignore
      }
    }

    return {
      userDataDir,
      sourceProfileDir: defProf,
      customExtensionsDir,
      extensions,
    };
  }

  /**
   * Menyinkronkan ekstensi Google Chrome beserta pengaturannya (API key OMOcaptcha/YesCaptcha,
   * userscript Violentmonkey di IndexedDB, Extension State, Preferences, Secure Preferences, Local State)
   * dari profil Chrome utama pengguna ke profil worker Chrome/Edge/Chromium.
   */
  public static syncChromeExtensionsToWorkerProfile(
    workerProfileDir: string,
    force = false
  ): ChromeExtensionInfo {
    const info = this.detectChromeExtensions();
    if (!info.userDataDir || !info.sourceProfileDir) {
      return info;
    }

    const targetDefault = path.join(workerProfileDir, 'Default');
    fs.mkdirSync(targetDefault, { recursive: true, mode: 0o700 });

    const stampPath = path.join(workerProfileDir, '.rage-chrome-ext-sync.json');
    const extSignature = info.extensions.map((e) => `${e.id}@${e.version}`).join(',');
    let alreadySynced = false;
    if (
      !force &&
      fs.existsSync(stampPath) &&
      fs.existsSync(path.join(targetDefault, 'Extensions')) &&
      fs.existsSync(path.join(targetDefault, 'Secure Preferences'))
    ) {
      try {
        const stamp = JSON.parse(fs.readFileSync(stampPath, 'utf8')) as { sig?: string };
        if (stamp.sig === extSignature) {
          alreadySynced = true;
        }
      } catch {
        alreadySynced = false;
      }
    }

    if (alreadySynced) {
      return info;
    }

    const localStateSrc = path.join(info.userDataDir, 'Local State');
    if (fs.existsSync(localStateSrc)) {
      try {
        fs.copyFileSync(localStateSrc, path.join(workerProfileDir, 'Local State'));
      } catch {
        // ignore
      }
    }

    for (const file of ['Preferences', 'Secure Preferences']) {
      const src = path.join(info.sourceProfileDir, file);
      if (fs.existsSync(src)) {
        try {
          fs.copyFileSync(src, path.join(targetDefault, file));
        } catch {
          // ignore
        }
      }
    }

    for (const folder of [
      'Extensions',
      'Local Extension Settings',
      'Sync Extension Settings',
      'Extension State',
      'Extension Rules',
    ]) {
      const srcDir = path.join(info.sourceProfileDir, folder);
      if (fs.existsSync(srcDir)) {
        try {
          fs.cpSync(srcDir, path.join(targetDefault, folder), {
            recursive: true,
            force: true,
          });
        } catch {
          // ignore locked files
        }
      }
    }

    const srcIdb = path.join(info.sourceProfileDir, 'IndexedDB');
    if (fs.existsSync(srcIdb)) {
      const dstIdb = path.join(targetDefault, 'IndexedDB');
      fs.mkdirSync(dstIdb, { recursive: true, mode: 0o700 });
      try {
        for (const entry of fs.readdirSync(srcIdb)) {
          if (!entry.startsWith('chrome-extension_')) continue;
          try {
            fs.cpSync(path.join(srcIdb, entry), path.join(dstIdb, entry), {
              recursive: true,
              force: true,
            });
          } catch {
            // ignore locked leveldb file
          }
        }
      } catch {
        // ignore
      }
    }

    try {
      fs.writeFileSync(
        stampPath,
        JSON.stringify({ sig: extSignature, syncedAt: new Date().toISOString() }),
        'utf8'
      );
    } catch {
      // ignore
    }

    return info;
  }

  public static syncChromeExtensionsToAllWorkers(workerCount = 5): {
    syncedWorkers: number;
    info: ChromeExtensionInfo;
  } {
    const info = this.detectChromeExtensions();
    const root = this.getProfilesRootDir();
    const maxW = Math.max(1, workerCount);
    let syncedWorkers = 0;
    for (let w = 1; w <= maxW; w++) {
      const dir = path.join(root, `chrome_worker_profile_${w}`);
      this.syncChromeExtensionsToWorkerProfile(dir, true);
      syncedWorkers++;
    }
    return { syncedWorkers, info };
  }

  public static resetAllWorkerProfiles(): { clearedFolders: number; rootPath: string } {
    const root = this.getProfilesRootDir();
    let clearedFolders = 0;
    if (fs.existsSync(root)) {
      for (const entry of fs.readdirSync(root)) {
        const full = path.join(root, entry);
        try {
          fs.rmSync(full, { recursive: true, force: true });
          clearedFolders++;
        } catch {
          // ignore if currently open
        }
      }
    }
    return { clearedFolders, rootPath: root };
  }

  public static saveProxyConfig(params: { useProxy: boolean; proxyText: string }): {
    configured: boolean;
    useProxy: boolean;
    proxyText: string;
  } {
    const cleanText = params.proxyText.slice(0, 32768);
    const encrypted = cleanText ? CredentialVault.encryptSecret(cleanText) : null;
    const now = new Date().toISOString();
    const payload = JSON.stringify({
      useProxy: Boolean(params.useProxy),
      encryptedProxyText: encrypted,
      updatedAt: now,
    });
    db.raw
      .prepare(
        `INSERT INTO system_settings (key, value_json, updated_at)
         VALUES ('proxy_config', ?, ?)
         ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at`
      )
      .run(payload, now);

    return {
      configured: true,
      useProxy: Boolean(params.useProxy),
      proxyText: cleanText,
    };
  }

  public static getProxyConfig(): {
    configured: boolean;
    useProxy: boolean;
    proxyText: string;
  } {
    const row = db.raw
      .prepare(`SELECT value_json FROM system_settings WHERE key = 'proxy_config'`)
      .get() as { value_json: string } | undefined;
    if (!row) {
      return { configured: false, useProxy: false, proxyText: '' };
    }
    try {
      const parsed = JSON.parse(row.value_json) as {
        useProxy?: boolean;
        encryptedProxyText?: ReturnType<typeof CredentialVault.encryptSecret> | null;
      };
      const decrypted = parsed.encryptedProxyText
        ? CredentialVault.decryptSecret(parsed.encryptedProxyText)
        : '';
      return {
        configured: true,
        useProxy: Boolean(parsed.useProxy),
        proxyText: decrypted,
      };
    } catch {
      return { configured: false, useProxy: false, proxyText: '' };
    }
  }

  /**
   * Mengekstrak URL/string proxy dari baris mentah, termasuk format perintah `curl -x "..."`.
   */
  public static extractProxyFromLine(raw: string): string {
    const trimmed = raw.trim();
    if (!trimmed) return '';

    const curlMatch = trimmed.match(
      /^curl\b.*?(?:-x|--proxy)\s+(?:["']([^"']+)["']|(\S+))/i
    );
    if (curlMatch) {
      return (curlMatch[1] || curlMatch[2] || '').trim();
    }

    return trimmed.replace(/^["']|["']$/g, '').trim();
  }

  /**
   * Memperluas baris proxy yang memakai rentang port sticky (contoh `:10000-10019` atau `:10000..10019`)
   * dan menormalisasi baris `curl -x` menjadi daftar proxy individual.
   */
  public static expandProxyLines(rawLines: string[]): string[] {
    const expanded: string[] = [];
    for (const line of rawLines) {
      const extracted = this.extractProxyFromLine(line);
      if (!extracted) continue;

      const rangeMatch = extracted.match(/^(.*?:)(\d{2,5})(?:-|\.\.)(\d{2,5})$/);
      if (rangeMatch) {
        const prefix = rangeMatch[1];
        const startPort = Number(rangeMatch[2]);
        const endPort = Number(rangeMatch[3]);
        if (startPort > 0 && endPort >= startPort && endPort <= 65535) {
          const count = Math.min(200, endPort - startPort + 1);
          for (let i = 0; i < count; i++) {
            expanded.push(`${prefix}${startPort + i}`);
          }
          continue;
        }
      }

      expanded.push(extracted);
    }
    return expanded;
  }

  /**
   * Parses a proxy string into Playwright proxy options.
   * Supports formats:
   * - ip:port
   * - user:pass@ip:port
   * - http://ip:port
   * - http://user:pass@ip:port
   * - ip:port:user:pass
   * - curl -x "http://user:pass@ip:port" https://...
   */
  public static parseProxyString(raw: string): ParsedProxy | null {
    const trimmed = this.extractProxyFromLine(raw);
    if (!trimmed) return null;

    const colonParts = trimmed.split(':');
    if (colonParts.length === 4 && !trimmed.includes('@') && !trimmed.includes('//')) {
      const [host, port, username, password] = colonParts;
      return {
        server: `http://${host}:${port}`,
        username,
        password,
        display: `${host}:${port} (auth)`,
      };
    }

    const withProtocol = /^https?:\/\/|^socks5?:\/\//i.test(trimmed)
      ? trimmed
      : `http://${trimmed}`;

    try {
      const url = new URL(withProtocol);
      const server = `${url.protocol}//${url.hostname}:${url.port || '80'}`;
      const username = url.username ? decodeURIComponent(url.username) : undefined;
      const password = url.password ? decodeURIComponent(url.password) : undefined;
      return {
        server,
        username,
        password,
        display: `${url.hostname}:${url.port || '80'}${username ? ' (auth)' : ''}`,
      };
    } catch {
      return {
        server: withProtocol,
        display: trimmed,
      };
    }
  }

  /**
   * Menghasilkan proxy sticky UNIK untuk 1 akun agar tidak pernah memakai ulang IP lama:
   * - Untuk DataImpulse (`*.dataimpulse.com`), membuat `;sessid.<unik>` di port 823 (unlimited sticky sessions).
   * - Untuk format template (`{SESSION}` / `{RAND}`), menyisipkan token acak per akun.
   * - Untuk proxy statis biasa, mengembalikan proxy asli (`isDynamicSession: false`) agar mode strict tidak mengulanginya.
   */
  public static allocateUniqueStickyProxy(
    baseProxy: ParsedProxy,
    attemptNumber: number,
    workerId: number
  ): { proxy: ParsedProxy; isDynamicSession: boolean } {
    const token = allocateFreshStickyToken(`rg${workerId}a${attemptNumber}`);

    try {
      const u = new URL(baseProxy.server);
      const baseUser = baseProxy.username || '';
      if (isDataImpulseProxy(u.hostname, baseUser)) {
        const cleanUser = baseUser.replace(/;sessid\.[^;]*/gi, '');
        const nextUser = cleanUser ? `${cleanUser};sessid.${token}` : `sessid.${token}`;
        return {
          proxy: {
            server: `${u.protocol}//${u.hostname}:823`,
            username: nextUser,
            password: baseProxy.password,
            display: `${u.hostname}:823 [${token}] (sticky)`,
          },
          isDynamicSession: true,
        };
      }
    } catch {
      // ignore URL parse error and fall through to placeholder check
    }

    if (
      /\{(session|rand)\}/i.test(baseProxy.username || '') ||
      /\{(session|rand)\}/i.test(baseProxy.password || '')
    ) {
      const rep = (val?: string) => (val ? val.replace(/\{(session|rand)\}/gi, token) : val);
      return {
        proxy: {
          server: baseProxy.server,
          username: rep(baseProxy.username),
          password: rep(baseProxy.password),
          display: `${baseProxy.display} [${token}]`,
        },
        isDynamicSession: true,
      };
    }

    if (hasEmbeddedStickySession(baseProxy.username)) {
      const nextUsername = replaceEmbeddedStickySession(baseProxy.username!, token);
      return {
        proxy: {
          server: baseProxy.server,
          username: nextUsername,
          password: baseProxy.password,
          display: `${baseProxy.display} [${token}] (sticky)`,
        },
        isDynamicSession: true,
      };
    }

    return {
      proxy: baseProxy,
      isDynamicSession: false,
    };
  }

  /**
   * Launches an isolated persistent worker profile context using the selected browser variant
   * (Google Chrome, Microsoft Edge, Mozilla Firefox, or Chromium).
   */
  private static async launchIsolatedWorkerContext(params: {
    variant: 'CHROME' | 'EDGE' | 'FIREFOX' | 'CHROMIUM';
    workerId: number;
    clearProfile: boolean;
    proxy?: ParsedProxy | null;
    proxyDataSaver?: boolean;
    proxyBlockHeavyMedia?: boolean;
    tileRect?: WindowRect | null;
  }): Promise<{
    context: BrowserContext;
    effectiveVariant: string;
    profileDir: string;
    bridge: LocalProxyBridge | null;
  }> {
    const dataSaver = params.proxyDataSaver ?? true;
    const blockHeavyMedia = params.proxyBlockHeavyMedia ?? false;
    const tileRect = params.tileRect ?? null;
    let bridge: LocalProxyBridge | null = null;
    let proxyOption: { server: string; username?: string; password?: string } | undefined;

    if (params.proxy) {
      bridge = await this.getOrStartWorkerBridge(params.workerId, params.proxy, {
        dataSaver,
        blockHeavyMedia,
      });
      proxyOption = bridge
        ? { server: bridge.url }
        : {
            server: params.proxy.server,
            username: params.proxy.username,
            password: params.proxy.password,
          };
    }

    const profileDir = this.prepareWorkerProfileDir(
      params.variant,
      params.workerId,
      params.clearProfile,
      dataSaver
    );

    if (params.variant === 'FIREFOX') {
      try {
        const ctx = await firefox.launchPersistentContext(profileDir, {
          headless: false,
          proxy: proxyOption,
          viewport: null,
        });
        if (tileRect) {
          void applyWin32WindowRect({
            processName: 'firefox.exe',
            matchToken: path.basename(profileDir),
            rect: tileRect,
          });
        }
        return { context: ctx, effectiveVariant: 'FIREFOX (Gecko)', profileDir, bridge };
      } catch {
        // Fallback to Edge or Chrome if Playwright Firefox binary is not installed yet
      }
    }

    const channelOrder: Array<{
      channel?: 'chrome' | 'msedge';
      label: string;
    }> =
      params.variant === 'EDGE'
        ? [
            { channel: 'msedge', label: 'EDGE (Chromium)' },
            { channel: 'chrome', label: 'CHROME (Fallback)' },
            { channel: undefined, label: 'CHROMIUM' },
          ]
        : params.variant === 'CHROMIUM'
          ? [
              { channel: undefined, label: 'CHROMIUM' },
              { channel: 'chrome', label: 'CHROME (Fallback)' },
              { channel: 'msedge', label: 'EDGE (Fallback)' },
            ]
          : [
              { channel: 'chrome', label: 'CHROME' },
              { channel: 'msedge', label: 'EDGE (Fallback)' },
              { channel: undefined, label: 'CHROMIUM (Fallback)' },
            ];

    const chromeExtInfo = this.syncChromeExtensionsToWorkerProfile(profileDir);
    const customExtPaths = chromeExtInfo.extensions
      .filter((e) => e.source === 'CUSTOM_DIR')
      .map((e) => e.path);
    const allExtPaths = chromeExtInfo.extensions.map((e) => e.path);

    const baseChromiumArgs = [
      '--no-first-run',
      '--no-default-browser-check',
      '--hide-crash-restore-bubble',
      '--disable-features=WebAuthentication,WebAuthn',
      '--webrtc-ip-handling-policy=disable_non_proxied_udp',
      '--enforce-webrtc-ip-permission-check',
      '--disable-quic',
    ];
    const jitteredTileRect = applyWindowRectAccountJitter(tileRect);
    baseChromiumArgs.push(
      `--window-position=${Math.round(jitteredTileRect.x)},${Math.round(jitteredTileRect.y)}`,
      `--window-size=${Math.round(jitteredTileRect.width)},${Math.round(jitteredTileRect.height)}`
    );
    if (dataSaver) {
      baseChromiumArgs.push(
        '--disable-background-networking',
        '--safebrowsing-disable-auto-update',
        '--disable-component-update',
        '--disable-domain-reliability',
        '--metrics-recording-only',
        '--disable-sync',
        '--no-pings'
      );
    }

    let lastErr: unknown;
    for (const item of channelOrder) {
      try {
        const channelArgs = [...baseChromiumArgs];
        const loadPaths = item.channel === 'chrome' ? customExtPaths : allExtPaths;
        if (loadPaths.length > 0) {
          channelArgs.push(`--load-extension=${loadPaths.join(',')}`);
        }
        const ctx = await chromium.launchPersistentContext(profileDir, {
          headless: false,
          channel: item.channel,
          proxy: proxyOption,
          viewport: null,
          ignoreDefaultArgs: [
            '--disable-extensions',
            '--disable-component-extensions-with-background-pages',
          ],
          args: channelArgs,
        });
        if (tileRect) {
          void applyWin32WindowRect({
            processName:
              item.channel === 'msedge'
                ? 'msedge.exe'
                : item.channel === 'chrome'
                  ? 'chrome.exe'
                  : 'chromium.exe',
            matchToken: path.basename(profileDir),
            rect: tileRect,
          });
        }
        return { context: ctx, effectiveVariant: item.label, profileDir, bridge };
      } catch (err) {
        lastErr = err;
      }
    }

    throw new Error(
      `Gagal membuka browser (${params.variant}): ${
        lastErr instanceof Error ? lastErr.message : String(lastErr)
      }`
    );
  }

  /**
   * Starts a Multi-Worker Batch Registration session with isolated worker profiles & browser variants
   */
  public static async startBatchWorkers(
    config: BatchRegistrationConfig,
    performedById?: string | null
  ): Promise<BatchRunState> {
    if (this.batchState.running) {
      throw new Error(
        'Batch worker sedang berjalan. Hentikan terlebih dahulu sebelum memulai batch baru.'
      );
    }

    const quantity = Math.max(1, Math.min(5000, Number(config.quantity) || 1));
    const workerCount = Math.max(
      1,
      Math.min(quantity, Number(config.workerCount) || 1)
    );
    const usernamePrefix = (config.usernamePrefix ?? '').trim();
    const passwordPrefix = (config.passwordPrefix ?? '').trim();
    const usernameLength = Math.max(
      usernamePrefix.length + 3,
      Math.min(20, Number(config.usernameLength) || 12)
    );
    const passwordLength = Math.max(
      passwordPrefix.length + 6,
      Math.max(12, Math.min(64, Number(config.passwordLength) || 16))
    );
    const browserVariant: BrowserVariant = config.browserVariant || 'CHROME';
    const clearProfileBeforeRun = config.clearProfileBeforeRun ?? true;

    const job = JobManager.createJob({
      name: `${browserVariant}-Worker-Batch (${quantity} akun, ${workerCount} worker)`,
      generationConfig: {
        quantity,
        prefix: usernamePrefix,
        suffix: '',
        length: usernameLength,
        passwordPrefix,
        passwordLength,
        includeSymbols: true,
      },
      createdById: performedById ?? null,
      autoStart: false,
    });

    await JobManager.processJob(job.id);
    const fullJob = JobManager.getJobById(job.id, true)!;
    const candidateQueue = [...(fullJob.candidates ?? [])];

    const parsedProxies: ParsedProxy[] = [];
    if (config.useProxy && Array.isArray(config.proxyList)) {
      const normalizedLines = this.expandProxyLines(config.proxyList);
      for (const raw of normalizedLines) {
        const p = this.parseProxyString(raw);
        if (p) parsedProxies.push(p);
      }
    }

    const now = new Date().toISOString();
    this.stopRequested = false;

    const firefoxInfo = detectFirefoxProfiles(config.customFirefoxProfilePath);
    const useMasterWarmProfile = config.useMasterWarmProfile ?? true;
    const isFirefoxMainOrManual =
      browserVariant === 'FIREFOX_MANUAL' ||
      browserVariant === 'FIREFOX_MAIN' ||
      browserVariant === 'ROTATE';

    if (isFirefoxMainOrManual && useMasterWarmProfile) {
      const masterDir = getMasterFirefoxProfileDir(this.getProfilesRootDir());
      if (!hasValidMasterFirefoxProfile(masterDir) && firefoxInfo.mainProfileDir) {
        try {
          createOrSyncMasterFirefoxProfile({
            sourceProfilePath: config.customFirefoxProfilePath,
            profilesRootDir: this.getProfilesRootDir(),
            resetExisting: true,
          });
        } catch {
          // fallback ke sinkron profil utama biasa jika pembuatan Master awal gagal
        }
      }
    }

    const autoSplitWindow = config.autoSplitWindow ?? true;
    const windowSplitMode: WindowSplitMode = config.windowSplitMode ?? 'AUTO';
    const workerTimeoutSeconds =
      config.workerTimeoutSeconds !== undefined
        ? Math.max(0, Math.min(3600, Number(config.workerTimeoutSeconds) || 0))
        : 120;
    const workingArea =
      autoSplitWindow && workerCount > 1 ? await getWindowsWorkingArea(true) : null;

    const workers: WorkerSlotStatus[] = Array.from({ length: workerCount }, (_, idx) => {
      const wId = idx + 1;
      const resolvedVar = this.resolveWorkerBrowserVariant(browserVariant, wId);
      const profileDisplay =
        resolvedVar === 'FIREFOX_MAIN'
          ? firefoxInfo.mainProfileDir || '%APPDATA%\\Mozilla\\Firefox\\Profiles (Utama)'
          : resolvedVar === 'FIREFOX_MANUAL'
            ? `data/worker_profiles/firefox_main_sync_worker_${wId}`
            : `data/worker_profiles/${resolvedVar.toLowerCase()}_worker_profile_${wId}`;
      return {
        workerId: wId,
        browserVariant: resolvedVar,
        profilePath: profileDisplay,
        state: 'IDLE',
        currentUsername: null,
        proxyServer: null,
        message: 'Siap memulai...',
        completedByWorker: 0,
        proxyBytes: 0,
        proxyBlockedRequests: 0,
        deadlineAt: null,
        remainingSeconds: null,
      };
    });

    this.pauseRequested = false;
    this.pauseStartedAtMs = null;

    this.batchState = {
      batchId: job.id,
      jobId: job.id,
      running: true,
      paused: false,
      pausedAt: null,
      accumulatedPauseMs: 0,
      totalTarget: quantity,
      completedCount: 0,
      failedCount: 0,
      replacedCount: 0,
      activeWorkerCount: workerCount,
      config: {
        ...config,
        quantity,
        workerCount,
        usernameLength,
        passwordLength,
        browserVariant,
        clearProfileBeforeRun,
        useMasterWarmProfile,
        proxyDataSaver: config.proxyDataSaver ?? true,
        proxyBlockHeavyMedia: config.proxyBlockHeavyMedia ?? false,
        autoSplitWindow,
        windowSplitMode,
        workerTimeoutSeconds,
        proxyOneAccountOneSticky: config.proxyOneAccountOneSticky ?? true,
      },
      workers,
      registeredLines: [],
      startedAt: now,
      updatedAt: now,
      proxyTotalBytes: 0,
      proxyTotalBlockedRequests: 0,
    };

    let proxyCursor = 0;
    let consecutiveFailures = 0;
    const MAX_CONSECUTIVE_FAILURES = Math.max(500, quantity);

    const workerPromises = workers.map(async (workerSlot) => {
      const resolvedVariant = this.resolveWorkerBrowserVariant(
        browserVariant,
        workerSlot.workerId
      );
      const tileRect =
        autoSplitWindow && workerCount > 1 && workingArea
          ? computeWorkerWindowRect({
              workerId: workerSlot.workerId,
              totalWorkers: workerCount,
              workingArea,
              layoutMode: windowSplitMode,
            })
          : null;

      // Jeda bertahap + jitter acak antar-worker agar peluncuran multi-browser tidak serentak/terdeteksi pola bot
      if (workerSlot.workerId > 1) {
        workerSlot.message = `Menunggu giliran start worker #${workerSlot.workerId}...`;
        const launchJitterMs = (workerSlot.workerId - 1) * 1650 + Math.floor(Math.random() * 750);
        await new Promise((r) => setTimeout(r, launchJitterMs));
      }

      let exhaustedStaticProxy = false;
      while (!this.stopRequested && candidateQueue.length > 0) {
        while (this.pauseRequested && !this.stopRequested) {
          workerSlot.state = 'IDLE';
          workerSlot.currentUsername = null;
          workerSlot.deadlineAt = null;
          workerSlot.remainingSeconds = null;
          workerSlot.message = 'Dijeda (Paused) — menunggu operator klik Resume...';
          await new Promise((r) => setTimeout(r, 300));
        }
        if (this.stopRequested) break;

        const nextCandidate = candidateQueue.shift();
        if (!nextCandidate) break;

        const oneAccountOneSticky = config.proxyOneAccountOneSticky ?? true;
        let assignedProxy: ParsedProxy | null = null;
        if (config.useProxy && parsedProxies.length > 0) {
          const cursorIndex = proxyCursor++;
          const baseProxy = parsedProxies[cursorIndex % parsedProxies.length];
          if (oneAccountOneSticky) {
            const allocated = this.allocateUniqueStickyProxy(
              baseProxy,
              cursorIndex + 1,
              workerSlot.workerId
            );
            if (!allocated.isDynamicSession && cursorIndex >= parsedProxies.length) {
              this.batchState.failedCount++;
              exhaustedStaticProxy = true;
              workerSlot.state = 'ERROR';
              workerSlot.currentUsername = null;
              workerSlot.message = `Daftar proxy habis (${parsedProxies.length} proxy statis sudah terpakai untuk mode 1 akun = 1 proxy).`;
              break;
            }
            assignedProxy = allocated.proxy;
          } else {
            assignedProxy = baseProxy;
          }
        }

        workerSlot.state = 'OPENING_BROWSER';
        workerSlot.currentUsername = nextCandidate.candidateUsername;
        workerSlot.proxyServer = assignedProxy ? assignedProxy.display : 'Direct (Tanpa Proxy)';
        workerSlot.message = `Membuka ${resolvedVariant} (Profil #${workerSlot.workerId}) untuk ${nextCandidate.candidateUsername}...`;
        this.batchState.updatedAt = new Date().toISOString();

        const candidateRow = db.raw
          .prepare('SELECT * FROM generated_account_data WHERE id = ?')
          .get(nextCandidate.id) as GeneratedAccountDataRecord | undefined;

        if (!candidateRow || !candidateRow.credential_id) {
          this.batchState.failedCount++;
          continue;
        }

        const password = CredentialVault.retrieveSecretPayload(candidateRow.credential_id).password;

        const monthsList = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        const rBirthMonth =
          config.birthMonth && config.birthMonth !== 'RANDOM' && monthsList.includes(config.birthMonth)
            ? config.birthMonth
            : monthsList[Math.floor(Math.random() * 12)];
        const rBirthDay =
          config.birthDay && config.birthDay !== 'RANDOM'
            ? config.birthDay.padStart(2, '0')
            : String(Math.floor(Math.random() * 25) + 1).padStart(2, '0');
        const rBirthYear =
          config.birthYear && config.birthYear !== 'RANDOM'
            ? config.birthYear
            : String(Math.floor(Math.random() * 7) + 1998);
        const rGender: 'MALE' | 'FEMALE' =
          config.gender === 'RANDOM' ? (Math.random() > 0.5 ? 'MALE' : 'FEMALE') : config.gender;

        workerSlot.currentPassword = password;
        workerSlot.formHint = `Lahir: ${rBirthMonth} ${rBirthDay} ${rBirthYear} | Gender: ${rGender}${
          assignedProxy?.username
            ? ' | Proxy diteruskan lewat jembatan lokal (tanpa popup login)'
            : ''
        }`;
        workerSlot.state = 'WAITING_REGISTRATION';
        workerSlot.message =
          resolvedVariant === 'FIREFOX_MANUAL'
            ? `Firefox dibuka biasa. Klik bookmark RAGE AUTOFILL di halaman Roblox (atau salin manual), selesaikan CAPTCHA (${nextCandidate.candidateUsername})...`
            : `Mengisi form & menunggu pendaftaran ${nextCandidate.candidateUsername}...`;
        this.batchState.updatedAt = new Date().toISOString();

        const result = await this.executeSingleWorkerRegistration({
          candidate: candidateRow,
          password,
          performedById: performedById ?? null,
          workerId: workerSlot.workerId,
          totalWorkers: workerCount,
          tileRect,
          variant: resolvedVariant,
          clearProfile: resolvedVariant === 'FIREFOX_MAIN' ? false : clearProfileBeforeRun,
          customFirefoxProfilePath: config.customFirefoxProfilePath,
          useMasterWarmProfile,
          proxy: assignedProxy,
          proxyDataSaver: config.proxyDataSaver ?? true,
          proxyBlockHeavyMedia: config.proxyBlockHeavyMedia ?? false,
          timeoutSeconds: workerTimeoutSeconds,
          onDeadline: (deadlineAt) => {
            workerSlot.deadlineAt = deadlineAt;
            this.syncLiveProxyStats();
          },
          birthDay: rBirthDay,
          birthMonth: rBirthMonth,
          birthYear: rBirthYear,
          gender: rGender,
        });

        workerSlot.deadlineAt = null;
        workerSlot.remainingSeconds = null;
        this.syncLiveProxyStats();
        workerSlot.currentPassword = null;
        workerSlot.formHint = null;

        if (result.browserVariant) {
          workerSlot.browserVariant = result.browserVariant;
        }
        if (result.profileDir) {
          workerSlot.profilePath = result.profileDir;
        }

        if (result.status === 'COMPLETED' && result.formattedOutput) {
          consecutiveFailures = 0;
          workerSlot.completedByWorker++;
          this.batchState.completedCount++;
          this.batchState.registeredLines.unshift(result.formattedOutput);
          workerSlot.message = `Berhasil simpan ${result.robloxUsername}:password:cookie!`;
        } else {
          this.batchState.failedCount++;
          consecutiveFailures++;
          if (
            !this.stopRequested &&
            this.batchState.completedCount < quantity &&
            consecutiveFailures < MAX_CONSECUTIVE_FAILURES
          ) {
            try {
              const replacement = this.createReplacementCandidate({
                failedCandidateId: candidateRow.id,
                reason: result.message || result.status,
                jobId: job.id,
                usernamePrefix,
                usernameLength,
                passwordPrefix,
                passwordLength,
                performedById: performedById ?? null,
              });
              candidateQueue.unshift(replacement);
              this.batchState.replacedCount = (this.batchState.replacedCount ?? 0) + 1;
              workerSlot.message = `${result.message} Diganti username & password baru (${replacement.candidateUsername})...`;
            } catch (repErr) {
              workerSlot.message = `${result.message} (Gagal buat pengganti: ${
                repErr instanceof Error ? repErr.message : String(repErr)
              })`;
            }
          } else {
            workerSlot.message = result.message;
          }
        }
        this.batchState.updatedAt = new Date().toISOString();

        if (!this.stopRequested && candidateQueue.length > 0) {
          await new Promise((r) => setTimeout(r, 450 + Math.floor(Math.random() * 650)));
        }
      }

      if (!exhaustedStaticProxy) {
        workerSlot.state = 'STOPPED';
        workerSlot.currentUsername = null;
        workerSlot.message = this.stopRequested ? 'Dihentikan oleh operator.' : 'Selesai.';
      }
      workerSlot.deadlineAt = null;
      workerSlot.remainingSeconds = null;
      this.batchState.activeWorkerCount = Math.max(0, this.batchState.activeWorkerCount - 1);
      if (this.batchState.activeWorkerCount === 0) {
        this.syncLiveProxyStats();
        this.batchState.running = false;
        this.batchState.paused = false;
        this.batchState.pausedAt = null;
        this.pauseRequested = false;
        this.pauseStartedAtMs = null;
        const leftoverBridges = Array.from(this.persistentManualBridges.values());
        this.persistentManualBridges.clear();
        for (const b of leftoverBridges) {
          b.close();
        }
      }
      this.batchState.updatedAt = new Date().toISOString();
    });

    void Promise.all(workerPromises);

    return this.batchState;
  }

  public static pauseBatchWorkers(): BatchRunState {
    if (!this.batchState.running || this.batchState.paused) {
      return this.batchState;
    }
    this.pauseRequested = true;
    this.pauseStartedAtMs = Date.now();
    const nowIso = new Date(this.pauseStartedAtMs).toISOString();
    this.batchState.paused = true;
    this.batchState.pausedAt = nowIso;
    this.batchState.updatedAt = nowIso;
    for (const w of this.batchState.workers) {
      if (w.state === 'IDLE') {
        w.message = 'Dijeda (Paused) — menunggu operator klik Resume...';
      }
    }
    return this.batchState;
  }

  public static resumeBatchWorkers(): BatchRunState {
    if (!this.batchState.running || !this.batchState.paused) {
      return this.batchState;
    }
    if (this.pauseStartedAtMs !== null) {
      this.batchState.accumulatedPauseMs =
        (this.batchState.accumulatedPauseMs ?? 0) +
        Math.max(0, Date.now() - this.pauseStartedAtMs);
    }
    this.pauseRequested = false;
    this.pauseStartedAtMs = null;
    this.batchState.paused = false;
    this.batchState.pausedAt = null;
    this.batchState.updatedAt = new Date().toISOString();
    for (const w of this.batchState.workers) {
      if (w.state === 'IDLE') {
        w.message = 'Melanjutkan antrean worker...';
      }
    }
    return this.batchState;
  }

  public static async stopBatchWorkers(): Promise<BatchRunState> {
    this.stopRequested = true;
    this.pauseRequested = false;
    this.pauseStartedAtMs = null;
    this.batchState.running = false;
    this.batchState.paused = false;
    this.batchState.pausedAt = null;
    for (const w of this.batchState.workers) {
      w.deadlineAt = null;
      w.remainingSeconds = null;
    }
    this.batchState.updatedAt = new Date().toISOString();

    const contexts = Array.from(this.activeContexts.values());
    this.activeContexts.clear();
    const marionettes = Array.from(this.activeMarionetteSessions.values());
    this.activeMarionetteSessions.clear();
    const manualBridges = Array.from(this.persistentManualBridges.values());
    this.persistentManualBridges.clear();
    for (const b of manualBridges) {
      b.close();
    }
    await Promise.all([
      ...contexts.map((c) => c.close().catch(() => {})),
      ...marionettes.map((m) => m.close().catch(() => {})),
    ]);

    return this.batchState;
  }

  public static async startAssistedSession(
    candidateId: string,
    performedById?: string | null,
    browserVariant: 'CHROME' | 'EDGE' | 'FIREFOX' | 'CHROMIUM' = 'CHROME'
  ): Promise<AssistedSessionStatus> {
    const existing = this.sessions.get(candidateId);
    if (
      existing &&
      (existing.status === 'LAUNCHING' || existing.status === 'FORM_FILLED_WAITING_HUMAN')
    ) {
      return existing;
    }

    const candidate = db.raw
      .prepare('SELECT * FROM generated_account_data WHERE id = ?')
      .get(candidateId) as GeneratedAccountDataRecord | undefined;

    if (!candidate) {
      throw new Error('Kandidat akun tidak ditemukan');
    }
    if (candidate.registration_state === 'REGISTERED') {
      throw new Error('Kandidat akun ini sudah terdaftar (REGISTERED)');
    }

    const password = candidate.credential_id
      ? CredentialVault.retrieveSecretPayload(candidate.credential_id).password
      : null;

    if (!password) {
      throw new Error('Password kandidat tidak ditemukan di dalam Credential Vault');
    }

    const now = new Date().toISOString();
    const initialStatus: AssistedSessionStatus = {
      candidateId,
      candidateUsername: candidate.candidate_username,
      browserVariant,
      status: 'LAUNCHING',
      message: `Membuka ${browserVariant} (Isolated Worker Profile) menuju https://www.roblox.com/CreateAccount...`,
      robloxUserId: null,
      robloxUsername: null,
      accountId: null,
      formattedOutput: null,
      startedAt: now,
      updatedAt: now,
    };

    this.sessions.set(candidateId, initialStatus);

    void this.executeSingleWorkerRegistration({
      candidate,
      password,
      performedById: performedById ?? null,
      workerId: 1,
      variant: browserVariant,
      clearProfile: true,
      proxy: null,
      birthDay: 'RANDOM',
      birthMonth: 'RANDOM',
      birthYear: 'RANDOM',
      gender: 'RANDOM',
    });

    return initialStatus;
  }

  private static updateStatus(
    candidateId: string,
    patch: Partial<AssistedSessionStatus>
  ): AssistedSessionStatus {
    const curr = this.sessions.get(candidateId) ?? {
      candidateId,
      candidateUsername: '',
      status: 'LAUNCHING',
      message: '',
      robloxUserId: null,
      robloxUsername: null,
      accountId: null,
      formattedOutput: null,
      startedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const updated: AssistedSessionStatus = {
      ...curr,
      ...patch,
      updatedAt: new Date().toISOString(),
    };
    this.sessions.set(candidateId, updated);
    return updated;
  }

  private static async executeSingleWorkerRegistration(params: {
    candidate: GeneratedAccountDataRecord;
    password: string;
    performedById: string | null;
    workerId: number;
    totalWorkers?: number;
    tileRect?: WindowRect | null;
    variant: 'CHROME' | 'EDGE' | 'FIREFOX' | 'FIREFOX_MAIN' | 'FIREFOX_MANUAL' | 'CHROMIUM';
    clearProfile: boolean;
    customFirefoxProfilePath?: string;
    useMasterWarmProfile?: boolean;
    proxy: ParsedProxy | null;
    proxyDataSaver?: boolean;
    proxyBlockHeavyMedia?: boolean;
    timeoutSeconds?: number;
    onDeadline?: (deadlineAt: number | null) => void;
    birthDay: string;
    birthMonth: string;
    birthYear: string;
    gender: 'MALE' | 'FEMALE' | 'RANDOM';
  }): Promise<AssistedSessionStatus> {
    const { candidate, password, performedById, workerId, variant, clearProfile, proxy } = params;

    if (variant === 'FIREFOX_MANUAL') {
      return this.executeFirefoxManualRegistration(params);
    }

    const installedFirefoxExe = detectInstalledFirefoxExecutable();
    if (
      variant === 'FIREFOX_MAIN' ||
      (variant === 'FIREFOX' &&
        installedFirefoxExe &&
        !fs.existsSync(firefox.executablePath()))
    ) {
      return this.executeFirefoxMarionetteRegistration(params);
    }

    let context: BrowserContext | null = null;
    const dataSaver = params.proxyDataSaver ?? true;
    const blockHeavyMedia = params.proxyBlockHeavyMedia ?? false;

    this.updateStatus(candidate.id, {
      candidateId: candidate.id,
      candidateUsername: candidate.candidate_username,
      workerId,
      browserVariant: variant,
      proxyUsed: proxy ? proxy.display : null,
      status: 'LAUNCHING',
      message: `Worker #${workerId} [${variant}]: Membuka profil terisolasi...`,
    });

    try {
      const launched = await this.launchIsolatedWorkerContext({
        variant,
        workerId,
        clearProfile,
        proxy,
        proxyDataSaver: dataSaver,
        proxyBlockHeavyMedia: blockHeavyMedia,
        tileRect: params.tileRect ?? null,
      });
      context = launched.context;
      this.activeContexts.set(candidate.id, context);

      if (dataSaver || blockHeavyMedia) {
        await context.route('**/*', (route) => {
          try {
            const host = new URL(route.request().url()).hostname;
            if (isBlockedByDataSaver(host, { dataSaver, blockHeavyMedia })) {
              return route.abort();
            }
          } catch {
            // ignore non-standard URLs
          }
          return route.continue();
        });
      }

      if (clearProfile) {
        await context.clearCookies().catch(() => {});
      }

      const existingPages = context.pages();
      const page = existingPages.length > 0 ? existingPages[0] : await context.newPage();

      await page.goto(RegistrationService.OFFICIAL_ROBLOX_SIGNUP_URL, {
        waitUntil: 'domcontentloaded',
        timeout: 45000,
      });

      const fillPayload = this.normalizeSignupPayload({
        birthMonth: params.birthMonth,
        birthDay: params.birthDay,
        birthYear: params.birthYear,
        username: candidate.candidate_username,
        gender: params.gender,
        password,
      });
      await runRobloxAutofillInPlaywright(page, fillPayload).catch(() => {});

      this.updateStatus(candidate.id, {
        browserVariant: launched.effectiveVariant,
        profileDir: launched.profileDir,
        status: 'FORM_FILLED_WAITING_HUMAN',
        message: `Worker #${workerId} [${launched.effectiveVariant}]: Formulir (${candidate.candidate_username}) terisi otomatis. Menunggu pendaftaran selesai...`,
      });

      // 5. Wait for registration completion (.ROBLOSECURITY cookie issued) without touching the DOM
      const timeoutSec = params.timeoutSeconds !== undefined ? Math.max(0, params.timeoutSeconds) : 120;
      const timeoutMs = timeoutSec > 0 ? timeoutSec * 1000 : 60 * 60 * 1000;
      const deadline = Date.now() + timeoutMs;
      params.onDeadline?.(timeoutSec > 0 ? deadline : null);

      let roblosecurityCookie: string | null = null;
      let detectedUserId: string | null = null;
      let detectedUsername: string | null = null;
      let timedOut = false;

      while (!this.stopRequested) {
        if (Date.now() >= deadline) {
          timedOut = true;
          break;
        }
        const openPages = context.pages();
        if (openPages.length === 0) break;

        const cookies = await context.cookies('https://www.roblox.com').catch(() => []);
        const authCookie = cookies.find((c) => c.name === '.ROBLOSECURITY' && c.value.length > 20);

        if (authCookie) {
          roblosecurityCookie = authCookie.value;

          // Tunggu sebentar sampai redirect ke roblox.com/home selesai sebelum menutup browser
          if (!page.url().toLowerCase().includes('/home')) {
            await page.waitForURL(/roblox\.com\/home/i, { timeout: 6000 }).catch(() => {});
          }

          const authUser = await page
            .evaluate(async () => {
              try {
                const r = await fetch('https://users.roblox.com/v1/users/authenticated', {
                  credentials: 'include',
                });
                if (r.ok) {
                  const data = (await r.json()) as { id?: string | number; name?: string };
                  return {
                    id: data.id ? String(data.id) : null,
                    name: data.name ? String(data.name) : null,
                  };
                }
              } catch {
                // ignore
              }
              const meta = document.querySelector('meta[name="user-data"]');
              return {
                id: meta?.getAttribute('data-userid') || null,
                name: meta?.getAttribute('data-name') || null,
              };
            })
            .catch(() => ({ id: null, name: null }));

          detectedUserId = authUser.id || this.generateFallbackRobloxUserId();
          detectedUsername = authUser.name || candidate.candidate_username;
          break;
        }

        await new Promise((r) => setTimeout(r, 1200));
      }

      params.onDeadline?.(null);

      if (!roblosecurityCookie) {
        await context.close().catch(() => {});
        return this.updateStatus(candidate.id, {
          status: timedOut ? 'TIMEOUT' : 'CANCELED',
          message: timedOut
            ? `Worker #${workerId}: Melewati batas waktu ${timeoutSec} detik — browser ditutup otomatis.`
            : `Worker #${workerId}: Browser ditutup sebelum pendaftaran selesai.`,
        });
      }

      const finalUsername = detectedUsername || candidate.candidate_username;
      const finalUserId = detectedUserId || this.generateFallbackRobloxUserId();
      const formattedLine = `${finalUsername}:${password}:${roblosecurityCookie}`;

      if (candidate.credential_id) {
        CredentialVault.updateCredentialWithCookie(
          candidate.credential_id,
          password,
          roblosecurityCookie
        );
      }

      const confirmed = RegistrationService.confirmRegistration(candidate.id, {
        robloxUserId: finalUserId,
        robloxUsername: finalUsername,
        cookie: roblosecurityCookie,
        category: 'STANDARD',
        verificationStatus: 'VERIFIED',
        notes: `Registered via ${launched.effectiveVariant} Worker #${workerId}${
          proxy ? ` (Proxy: ${proxy.display})` : ''
        }`,
        tags: [
          launched.effectiveVariant.split(' ')[0].toLowerCase(),
          `worker-${workerId}`,
          proxy ? 'proxy' : 'direct',
        ],
        performedById,
      });

      this.appendExportFile(formattedLine);

      await context.close().catch(() => {});

      return this.updateStatus(candidate.id, {
        status: 'COMPLETED',
        message: `Worker #${workerId} [${launched.effectiveVariant}]: Berhasil terdaftar & disimpan (${finalUsername})`,
        robloxUserId: finalUserId,
        robloxUsername: finalUsername,
        accountId: confirmed.account.id,
        formattedOutput: formattedLine,
      });
    } catch (err) {
      if (context) {
        await context.close().catch(() => {});
      }
      return this.updateStatus(candidate.id, {
        status: 'ERROR',
        message: err instanceof Error ? err.message : String(err),
      });
    } finally {
      params.onDeadline?.(null);
      this.activeContexts.delete(candidate.id);
      if (!this.batchState.running) {
        const b = this.persistentManualBridges.get(workerId);
        if (b) {
          b.close();
          this.persistentManualBridges.delete(workerId);
        }
      }
    }
  }

  /**
   * Mode MANUAL: membuka Firefox utama secara biasa (tanpa otomasi, sehingga CAPTCHA lolos),
   * lalu menunggu cookie .ROBLOSECURITY baru muncul di profil dan menyimpannya.
   */
  private static cleanFirefoxWorkerRobloxTraces(profileDir: string): void {
    clearRobloxAuthCookiesInSqlite(profileDir);
    clearRobloxAndCaptchaStorage(profileDir);
    clearRobloxPlacesHistoryInSqlite(profileDir);
  }

  /**
   * Executes manual registration using the user's normal Firefox browser (no Marionette / WebDriver flag)
   * with a local loopback autofill bridge and cookie/storage watcher.
   */
  private static async executeFirefoxManualRegistration(params: {
    candidate: GeneratedAccountDataRecord;
    password: string;
    performedById: string | null;
    workerId: number;
    totalWorkers?: number;
    tileRect?: WindowRect | null;
    customFirefoxProfilePath?: string;
    useMasterWarmProfile?: boolean;
    proxy: ParsedProxy | null;
    proxyDataSaver?: boolean;
    proxyBlockHeavyMedia?: boolean;
    timeoutSeconds?: number;
    onDeadline?: (deadlineAt: number | null) => void;
    birthDay: string;
    birthMonth: string;
    birthYear: string;
    gender: 'MALE' | 'FEMALE' | 'RANDOM';
  }): Promise<AssistedSessionStatus> {
    const { candidate, password, performedById, workerId } = params;
    const label = 'FIREFOX UTAMA (Manual, tanpa otomasi)';
    const dataSaver = params.proxyDataSaver ?? true;
    const blockHeavyMedia = params.proxyBlockHeavyMedia ?? false;
    const preferMaster = params.useMasterWarmProfile ?? true;

    const info = detectFirefoxProfiles(params.customFirefoxProfilePath);
    const masterDir = getMasterFirefoxProfileDir(this.getProfilesRootDir());
    const hasMaster = preferMaster && hasValidMasterFirefoxProfile(masterDir);

    if (!info.executablePath || (!hasMaster && !info.mainProfileDir)) {
      return this.updateStatus(candidate.id, {
        status: 'ERROR',
        message: 'Mozilla Firefox atau profil utamanya tidak ditemukan.',
      });
    }

    const useSyncWorkerProfile =
      hasMaster ||
      Boolean(params.proxy) ||
      info.isMainProfileLocked ||
      workerId > 1 ||
      (params.totalWorkers ?? 1) > 1;
    const predictedSyncDir = path.join(
      this.getProfilesRootDir(),
      `firefox_main_sync_worker_${workerId}`
    );

    if (useSyncWorkerProfile && isFirefoxProfileLocked(predictedSyncDir)) {
      await closeFirefoxManualInstance({
        profileDir: predictedSyncDir,
        usedIsolatedInstance: true,
      });
    }

    let profileDirToUse = info.mainProfileDir || masterDir;
    if (useSyncWorkerProfile) {
      profileDirToUse = prepareMainFirefoxProfileForWorker({
        workerId,
        profilesRootDir: this.getProfilesRootDir(),
        customProfilePath: params.customFirefoxProfilePath,
        forceCopy: true,
        useMasterProfile: preferMaster,
        fastReset: true,
      }).profileDir;
      // Pastikan profil worker mulai dalam kondisi bebas cookie/storage/history Roblox/PX/Arkose & terikat ke workerId lokal ini
      this.cleanFirefoxWorkerRobloxTraces(profileDirToUse);
      setWorkerLoopbackCookieInSqlite(profileDirToUse, workerId);
    }

    const baselineCookie = readRoblosecurityFromProfile(profileDirToUse);

    let bridge: LocalProxyBridge | null = null;
    if (params.proxy) {
      bridge = await this.getOrStartWorkerBridge(workerId, params.proxy, {
        dataSaver,
        blockHeavyMedia,
      });
    }

    const normalizedPayload = this.normalizeSignupPayload({
      birthMonth: params.birthMonth,
      birthDay: params.birthDay,
      birthYear: params.birthYear,
      username: candidate.candidate_username,
      gender: params.gender,
      password,
    });
    this.activeAutofillTargets.set(workerId, {
      ...normalizedPayload,
      workerId,
      candidateId: candidate.id,
    });

    this.updateStatus(candidate.id, {
      candidateId: candidate.id,
      candidateUsername: candidate.candidate_username,
      workerId,
      browserVariant: label,
      profileDir: profileDirToUse,
      status: 'FORM_FILLED_WAITING_HUMAN',
      message: `Worker #${workerId}: Membuka Firefox biasa (${candidate.candidate_username})...`,
    });

    let launchedHandle: ReturnType<typeof openFirefoxNormally> | null = null;
    const sessionStartMs = Date.now();
    this.manualHomeRedirectSignals.set(workerId, 0);

    try {
      const targetUrl = RegistrationService.OFFICIAL_ROBLOX_SIGNUP_URL;
      launchedHandle = openFirefoxNormally({
        executablePath: info.executablePath,
        profileDir: profileDirToUse,
        url: targetUrl,
        proxyServer: bridge ? bridge.url : params.proxy ? params.proxy.server : null,
        forceIsolatedInstance: useSyncWorkerProfile,
        dataSaver,
        tileRect: params.tileRect ?? null,
      });

      const timeoutSec = params.timeoutSeconds !== undefined ? Math.max(0, params.timeoutSeconds) : 120;
      const timeoutMs = timeoutSec > 0 ? timeoutSec * 1000 : 60 * 60 * 1000;
      const deadline = Date.now() + timeoutMs;
      params.onDeadline?.(timeoutSec > 0 ? deadline : null);

      this.updateStatus(candidate.id, {
        message: `Worker #${workerId}: Firefox terbuka (${candidate.candidate_username}). Batas waktu ${
          timeoutSec > 0 ? `${timeoutSec} detik` : 'tanpa batas'
        } — otomatis tutup saat masuk roblox.com/home...`,
      });

      let cookie: string | null = null;
      let timedOut = false;
      let sawLock = false;
      const lockGraceUntil = Date.now() + 4500;
      const canDetectWindowClose =
        useSyncWorkerProfile ||
        launchedHandle.usedIsolatedInstance ||
        !launchedHandle.wasMainProfileLockedBeforeLaunch;

      const waitHomeRedirect = async () => {
        // Beri jeda singkat (maks ~450ms, cek tiap 80ms) bila signal /home belum tiba, lalu langsung tutup Firefox agar /home tidak menyedot apis.roblox.com
        const homeWaitDeadline = Date.now() + 450;
        while (Date.now() < homeWaitDeadline && !this.stopRequested) {
          const sigWorker = this.manualHomeRedirectSignals.get(workerId) ?? 0;
          const sigFallback =
            (params.totalWorkers ?? 1) <= 1 ? (this.manualHomeRedirectSignals.get(0) ?? 0) : 0;
          if (
            sigWorker >= sessionStartMs ||
            sigFallback >= sessionStartMs ||
            hasRecentRobloxHomeVisit(profileDirToUse, sessionStartMs)
          ) {
            break;
          }
          await new Promise((r) => setTimeout(r, 80));
        }
      };

      while (!this.stopRequested) {
        if (Date.now() >= deadline) {
          timedOut = true;
          break;
        }
        await new Promise((r) => setTimeout(r, 500));
        const current = readRoblosecurityFromProfile(profileDirToUse);
        if (current && current !== baselineCookie) {
          cookie = current;
          // Langsung hapus target autofill worker ini agar tab/worker lain tidak pernah membaca target yang sudah selesai
          this.activeAutofillTargets.delete(workerId);
          await waitHomeRedirect();
          break;
        }

        if (canDetectWindowClose) {
          const lockedNow = isFirefoxProfileLocked(profileDirToUse);
          if (lockedNow) {
            sawLock = true;
          } else if (sawLock || Date.now() > lockGraceUntil) {
            await new Promise((r) => setTimeout(r, 350));
            const lastChance = readRoblosecurityFromProfile(profileDirToUse);
            if (lastChance && lastChance !== baselineCookie) {
              cookie = lastChance;
              this.activeAutofillTargets.delete(workerId);
              break;
            }
            break;
          }
        }
      }

      params.onDeadline?.(null);

      if (!cookie) {
        await closeFirefoxManualInstance({
          profileDir: profileDirToUse,
          spawnedPid: launchedHandle.pid,
          usedIsolatedInstance: launchedHandle.usedIsolatedInstance,
          wasMainProfileLockedBeforeLaunch: launchedHandle.wasMainProfileLockedBeforeLaunch,
        });
        await new Promise((r) => setTimeout(r, 250));
        this.cleanFirefoxWorkerRobloxTraces(profileDirToUse);
        return this.updateStatus(candidate.id, {
          status: timedOut ? 'TIMEOUT' : 'CANCELED',
          message: timedOut
            ? `Worker #${workerId}: Batas waktu ${timeoutSec} detik habis (${candidate.candidate_username}) — browser ditutup.`
            : `Worker #${workerId}: Firefox ditutup / dihentikan sebelum selesai (${candidate.candidate_username}).`,
        });
      }

      const authInfo = await this.fetchAuthenticatedRobloxUser(cookie, bridge?.url);
      const finalUsername = authInfo.name || candidate.candidate_username;
      const finalUserId = authInfo.id || this.generateFallbackRobloxUserId();
      const formattedLine = `${finalUsername}:${password}:${cookie}`;

      if (candidate.credential_id) {
        CredentialVault.updateCredentialWithCookie(candidate.credential_id, password, cookie);
      }

      const confirmed = RegistrationService.confirmRegistration(candidate.id, {
        robloxUserId: finalUserId,
        robloxUsername: finalUsername,
        cookie,
        category: 'STANDARD',
        verificationStatus: 'VERIFIED',
        notes: `Registered manually via ${label} Worker #${workerId}`,
        tags: ['firefox-manual', `worker-${workerId}`],
        performedById,
      });

      this.appendExportFile(formattedLine);

      // Tutup browser otomatis setelah berhasil daftar & redirect ke /home, lalu bersihkan cookie Roblox agar siap membuka browser berikutnya
      await closeFirefoxManualInstance({
        profileDir: profileDirToUse,
        spawnedPid: launchedHandle.pid,
        usedIsolatedInstance: launchedHandle.usedIsolatedInstance,
        wasMainProfileLockedBeforeLaunch: launchedHandle.wasMainProfileLockedBeforeLaunch,
      });
      await new Promise((r) => setTimeout(r, 300));
      this.cleanFirefoxWorkerRobloxTraces(profileDirToUse);

      return this.updateStatus(candidate.id, {
        status: 'COMPLETED',
        message: `Worker #${workerId}: Registrasi berhasil (${finalUsername})! Browser ditutup & membuka sesi berikutnya...`,
        robloxUserId: finalUserId,
        robloxUsername: finalUsername,
        accountId: confirmed.account.id,
        formattedOutput: formattedLine,
      });
    } catch (err) {
      if (launchedHandle) {
        await closeFirefoxManualInstance({
          profileDir: profileDirToUse,
          spawnedPid: launchedHandle.pid,
          usedIsolatedInstance: launchedHandle.usedIsolatedInstance,
          wasMainProfileLockedBeforeLaunch: launchedHandle.wasMainProfileLockedBeforeLaunch,
        }).catch(() => {});
      }
      return this.updateStatus(candidate.id, {
        status: 'ERROR',
        message: err instanceof Error ? err.message : String(err),
      });
    } finally {
      params.onDeadline?.(null);
      this.activeAutofillTargets.delete(workerId);
    }
  }

  /**
   * Executes registration using the user's installed Mozilla Firefox (via built-in Marionette protocol)
   * and either their Main Default Firefox Profile (`FIREFOX_MAIN`, without wiping history/extensions/other cookies)
   * or an isolated Firefox worker profile (`FIREFOX`).
   */
  private static async executeFirefoxMarionetteRegistration(params: {
    candidate: GeneratedAccountDataRecord;
    password: string;
    performedById: string | null;
    workerId: number;
    totalWorkers?: number;
    tileRect?: WindowRect | null;
    variant: 'CHROME' | 'EDGE' | 'FIREFOX' | 'FIREFOX_MAIN' | 'FIREFOX_MANUAL' | 'CHROMIUM';
    clearProfile: boolean;
    customFirefoxProfilePath?: string;
    useMasterWarmProfile?: boolean;
    proxy: ParsedProxy | null;
    proxyDataSaver?: boolean;
    proxyBlockHeavyMedia?: boolean;
    timeoutSeconds?: number;
    onDeadline?: (deadlineAt: number | null) => void;
    birthDay: string;
    birthMonth: string;
    birthYear: string;
    gender: 'MALE' | 'FEMALE' | 'RANDOM';
  }): Promise<AssistedSessionStatus> {
    const { candidate, password, performedById, workerId, variant, clearProfile, proxy } = params;
    const dataSaver = params.proxyDataSaver ?? true;
    const blockHeavyMedia = params.proxyBlockHeavyMedia ?? false;
    let session: FirefoxMarionetteSession | null = null;

    const executablePath = detectInstalledFirefoxExecutable();
    if (!executablePath) {
      return this.updateStatus(candidate.id, {
        status: 'ERROR',
        message:
          'Mozilla Firefox utama tidak ditemukan di C:\\Program Files\\Mozilla Firefox\\firefox.exe.',
      });
    }

    let targetProfileDir: string;
    let effectiveVariantLabel: string;
    let bridge: LocalProxyBridge | null = null;

    try {
      if (variant === 'FIREFOX_MAIN') {
        const preferMaster = params.useMasterWarmProfile ?? true;
        const prepared = prepareMainFirefoxProfileForWorker({
          workerId,
          profilesRootDir: this.getProfilesRootDir(),
          customProfilePath: params.customFirefoxProfilePath,
          forceCopy: Boolean(proxy) || (params.totalWorkers ?? 1) > 1 || preferMaster,
          useMasterProfile: preferMaster,
          fastReset: true,
        });
        targetProfileDir = prepared.profileDir;
        if (prepared.mode === 'SYNCED_MAIN') {
          this.cleanFirefoxWorkerRobloxTraces(targetProfileDir);
        }
        effectiveVariantLabel =
          prepared.mode === 'DIRECT_MAIN'
            ? 'FIREFOX UTAMA (Profil Asli)'
            : prepared.usedMasterProfile
              ? 'FIREFOX UTAMA (Master Warm Profile)'
              : 'FIREFOX UTAMA (Sinkron Profil Asli)';
      } else {
        targetProfileDir = this.prepareWorkerProfileDir('FIREFOX', workerId, clearProfile, dataSaver);
        effectiveVariantLabel = 'FIREFOX (Worker Terisolasi)';
      }

      // Gunakan LocalProxyBridge untuk autentikasi proxy, blokir bloat hemat kuota, & hitung byte
      let effectiveProxy = proxy;
      if (proxy) {
        bridge = await this.getOrStartWorkerBridge(workerId, proxy, {
          dataSaver,
          blockHeavyMedia,
        });
        if (bridge) {
          effectiveProxy = {
            server: bridge.url,
            display: proxy.display,
          };
        }
      }

      this.updateStatus(candidate.id, {
        candidateId: candidate.id,
        candidateUsername: candidate.candidate_username,
        workerId,
        browserVariant: effectiveVariantLabel,
        profileDir: targetProfileDir,
        proxyUsed: proxy ? proxy.display : null,
        status: 'LAUNCHING',
        message: `Worker #${workerId} [${effectiveVariantLabel}]: Membuka Mozilla Firefox (${targetProfileDir})...`,
      });

      session = await FirefoxMarionetteSession.launch({
        executablePath,
        profileDir: targetProfileDir,
        proxy: effectiveProxy,
        dataSaver,
        tileRect: params.tileRect ?? null,
      });
      this.activeMarionetteSessions.set(candidate.id, session);

      await session.navigate(RegistrationService.OFFICIAL_ROBLOX_SIGNUP_URL);

      // In FIREFOX_MAIN mode, ONLY clear Roblox auth cookies so non-Roblox sites remain logged in
      if (variant === 'FIREFOX_MAIN') {
        const hadRobloxLogin = await session.clearRobloxAuthCookiesOnly().catch(() => false);
        if (hadRobloxLogin) {
          await session.navigate(RegistrationService.OFFICIAL_ROBLOX_SIGNUP_URL);
        }
      } else if (clearProfile) {
        await session.deleteAllCookies().catch(() => {});
        await session.navigate(RegistrationService.OFFICIAL_ROBLOX_SIGNUP_URL);
      }

      const fillPayload = this.normalizeSignupPayload({
        birthMonth: params.birthMonth,
        birthDay: params.birthDay,
        birthYear: params.birthYear,
        username: candidate.candidate_username,
        gender: params.gender,
        password,
      });
      await runRobloxAutofillInMarionette(session, fillPayload).catch(() => {});

      this.updateStatus(candidate.id, {
        browserVariant: effectiveVariantLabel,
        profileDir: targetProfileDir,
        status: 'FORM_FILLED_WAITING_HUMAN',
        message: `Worker #${workerId} [${effectiveVariantLabel}]: Formulir (${candidate.candidate_username}) terisi otomatis di Mozilla Firefox Utama. Menunggu pendaftaran selesai...`,
      });

      // 5. Poll cookies via Marionette without touching the DOM until .ROBLOSECURITY appears
      const timeoutSec = params.timeoutSeconds !== undefined ? Math.max(0, params.timeoutSeconds) : 120;
      const timeoutMs = timeoutSec > 0 ? timeoutSec * 1000 : 60 * 60 * 1000;
      const deadline = Date.now() + timeoutMs;
      params.onDeadline?.(timeoutSec > 0 ? deadline : null);

      let roblosecurityCookie: string | null = null;
      let detectedUserId: string | null = null;
      let detectedUsername: string | null = null;
      let timedOut = false;

      while (!this.stopRequested) {
        if (Date.now() >= deadline) {
          timedOut = true;
          break;
        }
        const windowOpen = await session.isWindowOpen();
        if (!windowOpen) break;

        const cookies = await session.getCookies().catch(() => []);
        const authCookie = cookies.find(
          (c) => c.name === '.ROBLOSECURITY' && c.value && c.value.length > 20
        );

        if (authCookie) {
          roblosecurityCookie = authCookie.value;

          // Pastikan redirect ke roblox.com/home selesai sebelum menutup browser
          const homeDeadline = Date.now() + 6000;
          while (Date.now() < homeDeadline && !this.stopRequested) {
            const curUrl = await session
              .executeScript<string>(`return location.href || '';`)
              .catch(() => '');
            if (curUrl.toLowerCase().includes('/home')) break;
            await new Promise((r) => setTimeout(r, 350));
          }

          const metaInfo = await session
            .executeScript<{ id: string | null; name: string | null }>(
              `
              const meta = document.querySelector('meta[name="user-data"]');
              return {
                id: meta ? meta.getAttribute('data-userid') : null,
                name: meta ? meta.getAttribute('data-name') : null,
              };
              `
            )
            .catch(() => ({ id: null, name: null }));

          detectedUserId = metaInfo?.id || null;
          detectedUsername = metaInfo?.name || null;
          if (!detectedUserId) {
            const authInfo = await this.fetchAuthenticatedRobloxUser(roblosecurityCookie, effectiveProxy?.server);
            detectedUserId = authInfo.id;
            detectedUsername = detectedUsername || authInfo.name;
          }
          detectedUserId = detectedUserId || this.generateFallbackRobloxUserId();
          detectedUsername = detectedUsername || candidate.candidate_username;
          break;
        }

        await new Promise((r) => setTimeout(r, 1200));
      }

      params.onDeadline?.(null);

      if (!roblosecurityCookie) {
        await session.close().catch(() => {});
        return this.updateStatus(candidate.id, {
          status: timedOut ? 'TIMEOUT' : 'CANCELED',
          message: timedOut
            ? `Worker #${workerId}: Melewati batas waktu ${timeoutSec} detik — Mozilla Firefox ditutup otomatis.`
            : `Worker #${workerId}: Mozilla Firefox ditutup sebelum pendaftaran selesai.`,
        });
      }

      const finalUsername = detectedUsername || candidate.candidate_username;
      const finalUserId = detectedUserId || this.generateFallbackRobloxUserId();
      const formattedLine = `${finalUsername}:${password}:${roblosecurityCookie}`;

      if (candidate.credential_id) {
        CredentialVault.updateCredentialWithCookie(
          candidate.credential_id,
          password,
          roblosecurityCookie
        );
      }

      const confirmed = RegistrationService.confirmRegistration(candidate.id, {
        robloxUserId: finalUserId,
        robloxUsername: finalUsername,
        cookie: roblosecurityCookie,
        category: 'STANDARD',
        verificationStatus: 'VERIFIED',
        notes: `Registered via ${effectiveVariantLabel} Worker #${workerId}${
          proxy ? ` (Proxy: ${proxy.display})` : ''
        }`,
        tags: ['firefox-main', `worker-${workerId}`, proxy ? 'proxy' : 'direct'],
        performedById,
      });

      this.appendExportFile(formattedLine);

      await session.close().catch(() => {});

      return this.updateStatus(candidate.id, {
        status: 'COMPLETED',
        message: `Worker #${workerId} [${effectiveVariantLabel}]: Berhasil terdaftar & disimpan (${finalUsername})`,
        robloxUserId: finalUserId,
        robloxUsername: finalUsername,
        accountId: confirmed.account.id,
        formattedOutput: formattedLine,
      });
    } catch (err) {
      if (session) {
        await session.close().catch(() => {});
      }
      return this.updateStatus(candidate.id, {
        status: 'ERROR',
        message: err instanceof Error ? err.message : String(err),
      });
    } finally {
      params.onDeadline?.(null);
      this.activeMarionetteSessions.delete(candidate.id);
      if (bridge && !this.batchState.running) {
        bridge.close();
        this.persistentManualBridges.delete(workerId);
      }
    }
  }

  public static appendExportFile(formattedLine: string): void {
    try {
      const dir = path.resolve(process.cwd(), 'data');
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
      }
      const filePath = path.join(dir, 'registered_accounts.txt');
      fs.appendFileSync(filePath, `${formattedLine}\n`, { encoding: 'utf8', mode: 0o600 });
    } catch {
      // ignore fs errors in test environments
    }
  }
}
