import React, { useState } from 'react';
import {
  Play,
  Square,
  Sparkles,
  Globe,
  ShieldAlert,
  Copy,
  RefreshCw,
  Chrome,
  Flame,
  Clock,
  ChevronDown,
  ChevronUp,
  Database,
  Trash2,
  Bookmark,
  Zap,
  CheckCircle2,
  Activity,
  ExternalLink,
  Search,
  Filter,
  Pause,
  Download,
} from 'lucide-react';
import {
  BatchRunState,
  BrowserVariant,
  ChromeExtensionInfo,
  FirefoxProfileInfo,
  GeneratedCandidate,
  PaginatedMeta,
} from '../api.js';
import {
  BirthGender,
  COMPACT_INPUT_CLS,
  INPUT_CLS,
  SELECT_CLS,
  WindowSplitMode,
  describeWindowSplitPreview,
  downloadExportFile,
  formatProxyBytes,
  getStatusBadgeClasses,
  useBatchStopwatch,
} from './types.js';

interface GeneratorWorkspaceProps {
  genPrefix: string;
  setGenPrefix: (v: string) => void;
  genLength: number;
  setGenLength: (v: number) => void;
  genPasswordPrefix: string;
  setGenPasswordPrefix: (v: string) => void;
  genPasswordLength: number;
  setGenPasswordLength: (v: number) => void;
  birthDay: string;
  setBirthDay: (v: string) => void;
  birthMonth: string;
  setBirthMonth: (v: string) => void;
  birthYear: string;
  setBirthYear: (v: string) => void;
  gender: BirthGender;
  setGender: (v: BirthGender) => void;
  genQuantity: number;
  setGenQuantity: (v: number) => void;
  workerCount: number;
  setWorkerCount: (v: number) => void;
  browserVariant: BrowserVariant;
  setBrowserVariant: (v: BrowserVariant) => void;
  clearProfileBeforeRun: boolean;
  setClearProfileBeforeRun: (v: boolean) => void;
  autoSplitWindow: boolean;
  setAutoSplitWindow: (v: boolean) => void;
  windowSplitMode: WindowSplitMode;
  setWindowSplitMode: (v: WindowSplitMode) => void;
  workerTimeoutSeconds: number;
  setWorkerTimeoutSeconds: (v: number) => void;
  firefoxProfileInfo: FirefoxProfileInfo | null;
  customFirefoxProfilePath: string;
  setCustomFirefoxProfilePath: (v: string) => void;
  useMasterWarmProfile: boolean;
  setUseMasterWarmProfile: (v: boolean) => void;
  syncingMasterProfile: boolean;
  onSyncMasterProfile: () => void;
  chromeExtInfo: ChromeExtensionInfo | null;
  syncingChromeExt: boolean;
  onSyncChromeExtensions: () => void;
  onResetWorkerProfiles: () => void;
  manualBookmarkletHref: string;
  manualUserscriptUrl: string;
  useProxy: boolean;
  setUseProxy: (v: boolean) => void;
  proxyText: string;
  setProxyText: (v: string) => void;
  proxyDataSaver: boolean;
  setProxyDataSaver: (v: boolean) => void;
  proxyBlockHeavyMedia: boolean;
  setProxyBlockHeavyMedia: (v: boolean) => void;
  proxyOneAccountOneSticky: boolean;
  setProxyOneAccountOneSticky: (v: boolean) => void;
  onExpandStickyPorts: () => void;
  onSaveProxyConfig: () => void;
  genLoading: boolean;
  batchState: BatchRunState | null;
  onStartBatchWorkers: (e: React.FormEvent) => void;
  onPauseBatchWorkers: () => void;
  onResumeBatchWorkers: () => void;
  onStopBatchWorkers: () => void;
  onGenerateCandidatesOnly: () => void;
  onExportAllFormatted: () => void;
  candidates: GeneratedCandidate[];
  candidatesMeta: PaginatedMeta;
  candidateSearch: string;
  setCandidateSearch: (v: string) => void;
  candidateStateFilter: string;
  setCandidateStateFilter: (v: string) => void;
  onLoadCandidates: (page: number) => void;
  onPruneFailedCandidates: () => void;
  onRegenerateCandidate: (id: string) => void;
  onStartAssistedBrowser: (id: string) => void;
  onOpenSupervisedWorkflow: (id: string) => void;
  onNotify: (type: 'success' | 'error', text: string) => void;
}

/**
 * 2-column Generator Command Center:
 * Left = Compact grouped setup (Identity, Browser/Profile/Autofill, Proxy & Data Saver)
 * Right = Live Batch KPIs, Interactive Worker Cards, & Real-Time user:pass:cookie Stream
 * Bottom = Generated Candidates Validation & Supervision Table
 */
export function GeneratorWorkspace(props: GeneratorWorkspaceProps) {
  const {
    genPrefix,
    setGenPrefix,
    genLength,
    setGenLength,
    genPasswordPrefix,
    setGenPasswordPrefix,
    genPasswordLength,
    setGenPasswordLength,
    birthDay,
    setBirthDay,
    birthMonth,
    setBirthMonth,
    birthYear,
    setBirthYear,
    gender,
    setGender,
    genQuantity,
    setGenQuantity,
    workerCount,
    setWorkerCount,
    browserVariant,
    setBrowserVariant,
    clearProfileBeforeRun,
    setClearProfileBeforeRun,
    autoSplitWindow,
    setAutoSplitWindow,
    windowSplitMode,
    setWindowSplitMode,
    workerTimeoutSeconds,
    setWorkerTimeoutSeconds,
    firefoxProfileInfo,
    customFirefoxProfilePath,
    setCustomFirefoxProfilePath,
    useMasterWarmProfile,
    setUseMasterWarmProfile,
    syncingMasterProfile,
    onSyncMasterProfile,
    chromeExtInfo,
    syncingChromeExt,
    onSyncChromeExtensions,
    onResetWorkerProfiles,
    manualBookmarkletHref,
    manualUserscriptUrl,
    useProxy,
    setUseProxy,
    proxyText,
    setProxyText,
    proxyDataSaver,
    setProxyDataSaver,
    proxyBlockHeavyMedia,
    setProxyBlockHeavyMedia,
    proxyOneAccountOneSticky,
    setProxyOneAccountOneSticky,
    onExpandStickyPorts,
    onSaveProxyConfig,
    genLoading,
    batchState,
    onStartBatchWorkers,
    onPauseBatchWorkers,
    onResumeBatchWorkers,
    onStopBatchWorkers,
    onGenerateCandidatesOnly,
    onExportAllFormatted,
    candidates,
    candidatesMeta,
    candidateSearch,
    setCandidateSearch,
    candidateStateFilter,
    setCandidateStateFilter,
    onLoadCandidates,
    onPruneFailedCandidates,
    onRegenerateCandidate,
    onStartAssistedBrowser,
    onOpenSupervisedWorkflow,
    onNotify,
  } = props;

  const [browserSectionOpen, setBrowserSectionOpen] = useState(true);
  const [proxySectionOpen, setProxySectionOpen] = useState(true);
  const stopwatch = useBatchStopwatch(batchState);

  const proxyLineCount = proxyText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean).length;

  const batchPercent =
    batchState && batchState.totalTarget > 0
      ? Math.min(100, Math.round((batchState.completedCount / batchState.totalTarget) * 100))
      : 0;

  return (
    <div className="space-y-6">
      {/* 2-Column Workspace */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-5 items-start">
        {/* LEFT COLUMN: Compact Grouped Generator & Proxy Setup */}
        <form onSubmit={onStartBatchWorkers} className="xl:col-span-5 space-y-4">
          {/* Card 1: Identitas & Target Batch */}
          <section className="rounded-2xl border border-zinc-800/90 bg-zinc-900/55 p-4 sm:p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-zinc-800/80 pb-3">
              <div>
                <h2 className="text-sm font-semibold text-zinc-100">
                  1. Identitas Akun &amp; Target Batch
                </h2>
                <p className="text-[11px] text-zinc-400">
                  Username humanis unik, password vault, biodata lahir, &amp; jumlah worker.
                </p>
              </div>
              <span className="rounded-md border border-emerald-500/25 bg-emerald-500/10 px-2 py-0.5 font-mono text-[10px] text-emerald-300">
                USER:PASS:COOKIE
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label
                  htmlFor="gen-prefix"
                  className="mb-1 block font-mono text-[11px] text-zinc-400"
                >
                  Prefix Username
                </label>
                <input
                  id="gen-prefix"
                  type="text"
                  maxLength={15}
                  value={genPrefix}
                  onChange={(e) => setGenPrefix(e.target.value)}
                  placeholder="Contoh: rbx"
                  className={INPUT_CLS}
                />
              </div>
              <div>
                <label
                  htmlFor="gen-length"
                  className="mb-1 block font-mono text-[11px] text-zinc-400"
                >
                  Panjang Username (3-20)
                </label>
                <input
                  id="gen-length"
                  type="number"
                  min={3}
                  max={20}
                  value={genLength}
                  onChange={(e) => setGenLength(Number(e.target.value))}
                  className={`${INPUT_CLS} font-mono tabular-nums`}
                  required
                />
              </div>
              <div>
                <label
                  htmlFor="gen-pass-prefix"
                  className="mb-1 block font-mono text-[11px] text-zinc-400"
                >
                  Prefix Password
                </label>
                <input
                  id="gen-pass-prefix"
                  type="text"
                  maxLength={32}
                  value={genPasswordPrefix}
                  onChange={(e) => setGenPasswordPrefix(e.target.value)}
                  placeholder="Contoh: PassKu"
                  className={INPUT_CLS}
                />
              </div>
              <div>
                <label
                  htmlFor="gen-pass-length"
                  className="mb-1 block font-mono text-[11px] text-zinc-400"
                >
                  Panjang Password (12-64)
                </label>
                <input
                  id="gen-pass-length"
                  type="number"
                  min={12}
                  max={64}
                  value={genPasswordLength}
                  onChange={(e) => setGenPasswordLength(Number(e.target.value))}
                  className={`${INPUT_CLS} font-mono tabular-nums`}
                  required
                />
              </div>
            </div>

            {/* Biodata + Quantity/Workers Compact Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              <div>
                <label
                  htmlFor="birth-day"
                  className="mb-1 block font-mono text-[10px] uppercase text-zinc-400"
                >
                  Hari Lahir
                </label>
                <select
                  id="birth-day"
                  value={birthDay}
                  onChange={(e) => setBirthDay(e.target.value)}
                  className={SELECT_CLS}
                >
                  <option value="RANDOM">Random (01-28)</option>
                  {Array.from({ length: 28 }, (_, i) => String(i + 1).padStart(2, '0')).map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label
                  htmlFor="birth-month"
                  className="mb-1 block font-mono text-[10px] uppercase text-zinc-400"
                >
                  Bulan
                </label>
                <select
                  id="birth-month"
                  value={birthMonth}
                  onChange={(e) => setBirthMonth(e.target.value)}
                  className={SELECT_CLS}
                >
                  <option value="RANDOM">Random</option>
                  {['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'].map(
                    (m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    )
                  )}
                </select>
              </div>
              <div>
                <label
                  htmlFor="birth-year"
                  className="mb-1 block font-mono text-[10px] uppercase text-zinc-400"
                >
                  Tahun
                </label>
                <select
                  id="birth-year"
                  value={birthYear}
                  onChange={(e) => setBirthYear(e.target.value)}
                  className={SELECT_CLS}
                >
                  <option value="RANDOM">Random (98-04)</option>
                  {Array.from({ length: 21 }, (_, i) => String(1990 + i)).map((y) => (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label
                  htmlFor="birth-gender"
                  className="mb-1 block font-mono text-[10px] uppercase text-zinc-400"
                >
                  Gender
                </label>
                <select
                  id="birth-gender"
                  value={gender}
                  onChange={(e) => setGender(e.target.value as BirthGender)}
                  className={SELECT_CLS}
                >
                  <option value="RANDOM">Random</option>
                  <option value="MALE">Male</option>
                  <option value="FEMALE">Female</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 rounded-xl border border-zinc-800/80 bg-zinc-950/60 p-3">
              <div>
                <label
                  htmlFor="gen-quantity"
                  className="mb-1 block font-mono text-[11px] text-emerald-300"
                >
                  Target Buat Akun
                </label>
                <input
                  id="gen-quantity"
                  type="number"
                  min={1}
                  max={5000}
                  value={genQuantity}
                  onChange={(e) => setGenQuantity(Number(e.target.value))}
                  className={`${INPUT_CLS} font-mono font-semibold tabular-nums`}
                  required
                />
              </div>
              <div>
                <label
                  htmlFor="worker-count"
                  className="mb-1 block font-mono text-[11px] text-cyan-300"
                >
                  Jumlah Worker
                </label>
                <input
                  id="worker-count"
                  type="number"
                  min={1}
                  value={workerCount}
                  onChange={(e) => setWorkerCount(Math.max(1, Number(e.target.value) || 1))}
                  className={`${INPUT_CLS} font-mono font-semibold tabular-nums`}
                  required
                />
              </div>
            </div>
          </section>

          {/* Card 2: Browser, Master Profile & Autofill */}
          <section className="rounded-2xl border border-zinc-800/90 bg-zinc-900/55 overflow-hidden">
            <button
              type="button"
              onClick={() => setBrowserSectionOpen((o) => !o)}
              className="flex w-full items-center justify-between px-4 sm:px-5 py-3.5 text-left hover:bg-zinc-800/30 cursor-pointer"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <Chrome className="h-4 w-4 text-cyan-400 shrink-0" />
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-zinc-100">
                    2. Browser Worker &amp; Master Profile
                  </div>
                  <div className="truncate font-mono text-[11px] text-zinc-400">
                    {browserVariant} &bull;{' '}
                    {autoSplitWindow ? describeWindowSplitPreview(workerCount, windowSplitMode) : 'Split Off'}{' '}
                    &bull; Timeout {workerTimeoutSeconds === 0 ? '∞' : `${workerTimeoutSeconds}s`}
                  </div>
                </div>
              </div>
              {browserSectionOpen ? (
                <ChevronUp className="h-4 w-4 text-zinc-400 shrink-0" />
              ) : (
                <ChevronDown className="h-4 w-4 text-zinc-400 shrink-0" />
              )}
            </button>

            {browserSectionOpen && (
              <div className="border-t border-zinc-800/80 p-4 sm:p-5 space-y-4">
                <div>
                  <label
                    htmlFor="browser-variant"
                    className="mb-1.5 block font-mono text-[11px] text-zinc-300"
                  >
                    Varian Browser Worker
                  </label>
                  <select
                    id="browser-variant"
                    value={browserVariant}
                    onChange={(e) => {
                      const v = e.target.value as BrowserVariant;
                      setBrowserVariant(v);
                      if (v === 'FIREFOX_MAIN') {
                        setClearProfileBeforeRun(false);
                      }
                    }}
                    className={`${SELECT_CLS} font-mono text-xs`}
                  >
                    <option value="FIREFOX_MANUAL">
                      Mozilla Firefox Utama — MANUAL tanpa otomasi (CAPTCHA lolos, disarankan)
                    </option>
                    <option value="FIREFOX_MAIN">
                      Mozilla Firefox — Browser &amp; Profil Utama Saya (Tanpa Reset)
                    </option>
                    <option value="CHROME">Google Chrome (chrome_worker_profile_N)</option>
                    <option value="EDGE">Microsoft Edge (edge_worker_profile_N)</option>
                    <option value="FIREFOX">Mozilla Firefox — Profil Worker Terisolasi</option>
                    <option value="CHROMIUM">Chromium (chromium_worker_profile_N)</option>
                    <option value="ROTATE">Rotasi Multi-Browser (Chrome / Edge / Firefox Utama)</option>
                  </select>
                </div>

                {/* Window Split & Timeout Row */}
                <div className="rounded-xl border border-zinc-800/80 bg-zinc-950/60 p-3 space-y-2.5 text-xs">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <label className="flex items-center gap-2 font-mono text-emerald-300 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={autoSplitWindow}
                        onChange={(e) => setAutoSplitWindow(e.target.checked)}
                        className="accent-emerald-500 rounded"
                      />
                      <span>Auto-Split Layar Worker</span>
                    </label>
                    <label className="flex items-center gap-2 font-mono text-[11px] text-zinc-300">
                      <Clock className="h-3.5 w-3.5 text-amber-400" />
                      <span>Timeout (detik):</span>
                      <input
                        type="number"
                        min={0}
                        max={3600}
                        value={workerTimeoutSeconds}
                        onChange={(e) =>
                          setWorkerTimeoutSeconds(Math.max(0, Number(e.target.value) || 0))
                        }
                        title="Default 120 detik: bila lewat waktu/kendala, browser tutup otomatis dan ganti username+password baru (0 = tanpa batas)"
                        className="w-20 rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs font-mono text-amber-300 tabular-nums focus:border-emerald-500/70 focus:outline-none"
                      />
                    </label>
                  </div>

                  {autoSplitWindow && (
                    <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-zinc-800/60">
                      <select
                        value={windowSplitMode}
                        onChange={(e) => setWindowSplitMode(e.target.value as WindowSplitMode)}
                        className="flex-1 min-w-[200px] rounded-lg border border-zinc-800 bg-zinc-900 px-2.5 py-1.5 text-[11px] font-mono text-zinc-200 focus:border-emerald-500/70 focus:outline-none"
                      >
                        <option value="AUTO">Otomatis (2→2x1, 3→3x1, 4→2x2, 5+→Grid)</option>
                        <option value="COLUMNS">Semua Kolom Sejajar (N x 1)</option>
                        <option value="GRID">Grid Kotak Multi-Baris</option>
                      </select>
                      <span className="rounded-md bg-zinc-800/80 px-2 py-1 font-mono text-[10px] text-zinc-400">
                        {describeWindowSplitPreview(workerCount, windowSplitMode)}
                      </span>
                    </div>
                  )}
                </div>

                {/* Reset Profile Toggle & Cleanup */}
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-zinc-800/80 bg-zinc-950/60 p-3 text-xs">
                  {browserVariant === 'FIREFOX_MAIN' ? (
                    <div className="text-emerald-300">
                      <div className="font-mono font-medium">
                        ✓ Mode Profil Utama Aktif: Ekstensi &amp; History Non-Roblox Aman
                      </div>
                      <div className="text-[11px] text-zinc-400 mt-0.5">
                        Hanya cookie sesi roblox.com yang dibersihkan saat ganti akun.
                      </div>
                    </div>
                  ) : (
                    <label className="flex items-center gap-2 font-mono text-zinc-200 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={clearProfileBeforeRun}
                        onChange={(e) => setClearProfileBeforeRun(e.target.checked)}
                        className="accent-emerald-500"
                      />
                      <span>Reset Bersih Cookie/Cache Tiap Akun Baru</span>
                    </label>
                  )}

                  <button
                    type="button"
                    onClick={onResetWorkerProfiles}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-700 bg-zinc-900 px-2.5 py-1.5 font-mono text-[11px] text-zinc-300 hover:bg-zinc-800 cursor-pointer"
                  >
                    <Trash2 className="h-3.5 w-3.5 text-zinc-400" />
                    <span>Bersihkan Profil Worker</span>
                  </button>
                </div>

                {/* Chrome Extension Auto-Sync Panel */}
                {(browserVariant === 'CHROME' ||
                  browserVariant === 'EDGE' ||
                  browserVariant === 'CHROMIUM' ||
                  browserVariant === 'ROTATE') && (
                  <div className="rounded-xl border border-emerald-500/30 bg-emerald-950/20 p-3.5 space-y-2.5 text-xs">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-emerald-300 flex items-center gap-1.5">
                        <Zap className="h-3.5 w-3.5" />
                        Ekstensi Chrome Worker Otomatis
                      </span>
                      <button
                        type="button"
                        disabled={syncingChromeExt}
                        onClick={onSyncChromeExtensions}
                        className="rounded-lg border border-emerald-500/40 bg-emerald-500/15 px-2.5 py-1 font-mono text-[11px] font-semibold text-emerald-200 hover:bg-emerald-500/25 disabled:opacity-50 cursor-pointer"
                      >
                        {syncingChromeExt ? 'MENYINKRONKAN...' : 'SYNC EKSTENSI'}
                      </button>
                    </div>
                    <div className="text-[11px] text-zinc-300 font-mono">
                      {chromeExtInfo && chromeExtInfo.extensions.length > 0 ? (
                        <span>
                          Terdeteksi <strong>{chromeExtInfo.extensions.length} ekstensi</strong>:{' '}
                          {chromeExtInfo.extensions.map((e) => `${e.name} (${e.version})`).join(', ')}
                        </span>
                      ) : (
                        <span className="text-amber-300">
                          Belum ada ekstensi di Chrome utama atau{' '}
                          <code>{chromeExtInfo?.customExtensionsDir || 'data/chrome_extensions'}</code>.
                        </span>
                      )}
                    </div>
                  </div>
                )}

                {/* Firefox Main / Manual Profile + Master Warm Profile + Userscript/Bookmarklet */}
                {(browserVariant === 'FIREFOX_MAIN' || browserVariant === 'FIREFOX_MANUAL') && (
                  <div className="space-y-3">
                    <div className="rounded-xl border border-zinc-800/80 bg-zinc-950/60 p-3 space-y-2">
                      <label
                        htmlFor="firefox-profile-select"
                        className="block font-mono text-[11px] text-zinc-400"
                      >
                        Profil Mozilla Firefox Utama (%APPDATA%\Mozilla\Firefox\Profiles)
                      </label>
                      {firefoxProfileInfo && firefoxProfileInfo.profiles.length > 0 ? (
                        <select
                          id="firefox-profile-select"
                          value={customFirefoxProfilePath}
                          onChange={(e) => setCustomFirefoxProfilePath(e.target.value)}
                          className={COMPACT_INPUT_CLS + ' font-mono'}
                        >
                          {firefoxProfileInfo.profiles.map((p) => (
                            <option key={p.path} value={p.path}>
                              {p.name} ({p.path}){p.isDefault ? ' [DEFAULT UTAMA]' : ''}
                              {p.hasData === false ? ' [KOSONG]' : ''}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <input
                          id="firefox-profile-select"
                          type="text"
                          value={customFirefoxProfilePath}
                          onChange={(e) => setCustomFirefoxProfilePath(e.target.value)}
                          placeholder="C:\Users\...\AppData\Roaming\Mozilla\Firefox\Profiles\xxxx.default-release"
                          className={COMPACT_INPUT_CLS + ' font-mono'}
                        />
                      )}

                      <div className="flex flex-wrap items-center justify-between gap-2 pt-1 font-mono text-[10px] text-zinc-400">
                        <span className="truncate">
                          Bin: {firefoxProfileInfo?.executablePath || 'Tidak terdeteksi'}
                        </span>
                        <span
                          className={
                            firefoxProfileInfo?.isMainProfileLocked
                              ? 'text-amber-300'
                              : 'text-emerald-400'
                          }
                        >
                          {firefoxProfileInfo?.isMainProfileLocked
                            ? 'Sedang Terbuka (Auto-Sync Anti-Lock)'
                            : 'Siap / Tidak Terkunci'}
                        </span>
                      </div>
                    </div>

                    {/* Master Warm Profile Card */}
                    <div className="rounded-xl border border-cyan-500/25 bg-cyan-950/15 p-3 space-y-2">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <label className="flex items-start gap-2 text-xs text-cyan-200 cursor-pointer flex-1 min-w-[200px]">
                          <input
                            type="checkbox"
                            checked={useMasterWarmProfile}
                            onChange={(e) => setUseMasterWarmProfile(e.target.checked)}
                            className="mt-0.5 accent-cyan-400"
                          />
                          <span>
                            <strong>1 Master Warm Profile RAGE</strong>
                            <span className="block text-[11px] text-zinc-400 mt-0.5">
                              History non-Roblox &amp; ekstensi tetap hangat; data Roblox selalu disterilkan setiap ganti akun.
                            </span>
                          </span>
                        </label>
                        <button
                          type="button"
                          disabled={syncingMasterProfile}
                          onClick={onSyncMasterProfile}
                          className="shrink-0 rounded-lg border border-cyan-500/40 bg-cyan-500/15 px-2.5 py-1.5 font-mono text-[11px] font-semibold text-cyan-200 hover:bg-cyan-500/25 disabled:opacity-50 cursor-pointer"
                        >
                          {syncingMasterProfile
                            ? 'SYNCING...'
                            : firefoxProfileInfo?.masterProfile?.exists
                              ? 'SYNC ULANG MASTER'
                              : 'BUAT MASTER PROFILE'}
                        </button>
                      </div>
                      <div className="pl-5 font-mono text-[10px]">
                        {firefoxProfileInfo?.masterProfile?.exists ? (
                          <span className="text-emerald-300">
                            Aktif: {firefoxProfileInfo.masterProfile.nonRobloxPlacesCount} history web lain,{' '}
                            {firefoxProfileInfo.masterProfile.nonRobloxCookiesCount} cookie non-Roblox,{' '}
                            {firefoxProfileInfo.masterProfile.robloxCookiesCount} cookie Roblox,{' '}
                            {firefoxProfileInfo.masterProfile.extensionCount} ekstensi
                          </span>
                        ) : (
                          <span className="text-amber-300">
                            Otomatis dibuat saat Mulai Batch atau klik tombol di atas.
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Firefox Manual Autofill Tools (Userscript + Draggable Bookmarklet) */}
                    {browserVariant === 'FIREFOX_MANUAL' && manualBookmarkletHref && (
                      <div className="rounded-xl border border-emerald-500/30 bg-emerald-950/20 p-3 space-y-2.5">
                        <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-300">
                          <Flame className="h-3.5 w-3.5" />
                          <span>Autofill &amp; Submit Otomatis (Firefox Manual — Tinggal CAPTCHA)</span>
                        </div>
                        <p className="text-[11px] text-zinc-400 leading-relaxed">
                          Pasang <strong>Userscript (0-Klik)</strong> di Violentmonkey/Tampermonkey, atau tarik tombol <strong>RAGE AUTOFILL</strong> ke Bookmark Toolbar Firefox.
                        </p>
                        <div className="flex flex-wrap items-center gap-2">
                          {manualUserscriptUrl && (
                            <a
                              href={manualUserscriptUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1.5 rounded-lg bg-zinc-100 px-3 py-1.5 font-mono text-[11px] font-bold text-zinc-950 hover:bg-zinc-200"
                              title="Pasang di Violentmonkey / Tampermonkey Firefox"
                            >
                              <ExternalLink className="h-3 w-3" />
                              PASANG USERSCRIPT (0-KLIK)
                            </a>
                          )}
                          <a
                            ref={(el) => {
                              if (el && manualBookmarkletHref) {
                                el.setAttribute('href', manualBookmarkletHref);
                              }
                            }}
                            onClick={(e) => {
                              e.preventDefault();
                              onNotify(
                                'success',
                                'Tarik tombol ini ke Bookmark Toolbar Firefox (jangan diklik di sini), lalu klik dari halaman Roblox!'
                              );
                            }}
                            className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500 px-3 py-1.5 font-mono text-[11px] font-bold text-zinc-950 hover:bg-emerald-400 cursor-grab select-none"
                            title="Tarik ke Bookmark Toolbar Firefox"
                          >
                            <Bookmark className="h-3 w-3" />
                            ★ RAGE AUTOFILL
                          </a>
                          <button
                            type="button"
                            onClick={() => {
                              void navigator.clipboard.writeText(manualBookmarkletHref);
                              onNotify(
                                'success',
                                'Kode Bookmarklet disalin! Di Firefox tekan Ctrl+Shift+O -> Tambah Bookmark -> tempel URL.'
                              );
                            }}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/40 px-2.5 py-1.5 font-mono text-[11px] text-emerald-200 hover:bg-emerald-900/40 cursor-pointer"
                          >
                            <Copy className="h-3 w-3" />
                            SALIN KODE
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </section>

          {/* Card 3: Proxy & Mode Hemat Kuota */}
          <section className="rounded-2xl border border-zinc-800/90 bg-zinc-900/55 overflow-hidden">
            <div className="flex items-center justify-between px-4 sm:px-5 py-3.5">
              <label className="flex items-center gap-2.5 text-sm font-semibold text-zinc-100 cursor-pointer">
                <input
                  type="checkbox"
                  checked={useProxy}
                  onChange={(e) => {
                    setUseProxy(e.target.checked);
                    if (e.target.checked) setProxySectionOpen(true);
                  }}
                  className="accent-emerald-500 h-4 w-4 rounded"
                />
                <Globe className="h-4 w-4 text-emerald-400" />
                <span>3. Proxy &amp; Hemat Kuota Engine</span>
              </label>

              <div className="flex items-center gap-2">
                <span
                  className={`rounded-full border px-2 py-0.5 font-mono text-[10px] ${
                    useProxy
                      ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                      : 'border-zinc-700 bg-zinc-800 text-zinc-400'
                  }`}
                >
                  {useProxy ? `${proxyLineCount} PROXY AKTIF` : 'DIRECT'}
                </span>
                <button
                  type="button"
                  aria-label="Toggle proxy section"
                  onClick={() => setProxySectionOpen((o) => !o)}
                  className="rounded-lg p-1 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100 cursor-pointer"
                >
                  {proxySectionOpen ? (
                    <ChevronUp className="h-4 w-4" />
                  ) : (
                    <ChevronDown className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>

            {firefoxProfileInfo?.configuredProxyHint && !useProxy && (
              <div className="mx-4 mb-3 flex items-start gap-2 rounded-xl border border-amber-500/35 bg-amber-950/30 px-3 py-2 text-[11px] font-mono text-amber-200">
                <ShieldAlert className="h-4 w-4 shrink-0 text-amber-400 mt-0.5" />
                <span>
                  Profil Firefox Anda sedang mengatur proxy manual ({firefoxProfileInfo.configuredProxyHint}). Centang proxy di atas &amp; isi <code>user:pass@host:port</code> agar login proxy otomatis tanpa popup!
                </span>
              </div>
            )}

            {proxySectionOpen && useProxy && (
              <div className="border-t border-zinc-800/80 p-4 sm:p-5 space-y-3">
                <textarea
                  rows={4}
                  value={proxyText}
                  onChange={(e) => setProxyText(e.target.value)}
                  placeholder={
                    'http://user:pass@gw.dataimpulse.com:10000\nuser:pass@gw.dataimpulse.com:10000-10019\ncurl -x "http://user:pass@host:port" https://api.ipify.org/'
                  }
                  className="w-full rounded-xl border border-zinc-800 bg-zinc-950/90 p-3 font-mono text-xs text-zinc-100 placeholder:text-zinc-600 focus:border-emerald-500/70 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                />

                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-[11px] text-zinc-400">
                    Dukung <code>user:pass@host:port</code>, <code>curl -x</code>, rentang port sticky.
                  </span>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={onExpandStickyPorts}
                      className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-2.5 py-1.5 font-mono text-[11px] text-emerald-300 hover:bg-emerald-500/20 cursor-pointer"
                    >
                      EKSPANSI 20 PORT STICKY
                    </button>
                    <button
                      type="button"
                      onClick={onSaveProxyConfig}
                      className="rounded-lg border border-zinc-700 bg-zinc-800/80 px-2.5 py-1.5 font-mono text-[11px] text-zinc-200 hover:bg-zinc-700 cursor-pointer"
                    >
                      SIMPAN PROXY
                    </button>
                  </div>
                </div>

                {/* Mode Hemat Kuota Subcard */}
                <div className="rounded-xl border border-emerald-500/25 bg-emerald-950/15 p-3.5 space-y-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <label className="flex items-center gap-2 text-xs font-semibold text-emerald-300 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={proxyDataSaver}
                        onChange={(e) => setProxyDataSaver(e.target.checked)}
                        className="accent-emerald-500"
                      />
                      <span>Mode Hemat Kuota Proxy (Disarankan)</span>
                    </label>
                    <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 font-mono text-[10px] text-emerald-300">
                      POTONG ~80-90% DATA
                    </span>
                  </div>
                  <p className="pl-5 text-[11px] text-zinc-400 leading-relaxed">
                    Blokir Google SafeBrowsing, Telemetry Mozilla, domain `/home` (catalog/groups/assetdelivery), bypass API solver (OMOcaptcha/YesCaptcha), &amp; cache JS/CSS/font (CAPTCHA tetap aman).
                  </p>

                  <label className="flex items-center gap-2 pl-5 text-xs text-zinc-200 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={proxyBlockHeavyMedia}
                      onChange={(e) => setProxyBlockHeavyMedia(e.target.checked)}
                      className="accent-emerald-500"
                    />
                    <span>Hemat Ekstra (Aman CAPTCHA): Blokir Thumbnail Game &amp; Avatar (`/home`)</span>
                  </label>

                  <label className="flex items-center gap-2 pl-5 text-xs text-emerald-200 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={proxyOneAccountOneSticky}
                      onChange={(e) => setProxyOneAccountOneSticky(e.target.checked)}
                      className="accent-emerald-500"
                    />
                    <span>
                      <strong>1 Akun = 1 Proxy Sticky Unik</strong> (Session ID baru tiap akun DataImpulse)
                    </span>
                  </label>
                </div>
              </div>
            )}
          </section>

          {/* Action CTA Panel */}
          <div className="aax-card p-4 space-y-2.5">
            <button
              type="submit"
              disabled={genLoading || batchState?.running}
              className="aax-btn-gold flex w-full items-center justify-center gap-2 px-5 py-3.5 text-xs font-mono font-black disabled:opacity-50 cursor-pointer"
            >
              <Play className="h-4 w-4 fill-current" />
              <span>
                {batchState?.running
                  ? `WORKER BERJALAN (${batchState.completedCount}/${batchState.totalTarget} • ${stopwatch.formattedElapsed})...`
                  : browserVariant === 'FIREFOX_MAIN'
                    ? `MULAI FIREFOX UTAMA & AUTOFILL (${workerCount} WORKER)`
                    : `MULAI ${browserVariant} & AUTOFILL (${workerCount} WORKER)`}
              </span>
            </button>

            <div className="flex flex-wrap items-center gap-2">
              {batchState?.running && (
                <>
                  {batchState.paused ? (
                    <button
                      type="button"
                      onClick={onResumeBatchWorkers}
                      className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-emerald-500/40 bg-emerald-500/15 px-4 py-2.5 font-mono text-xs font-semibold text-emerald-200 hover:bg-emerald-500/25 cursor-pointer"
                    >
                      <Play className="h-3.5 w-3.5 fill-current" />
                      <span>RESUME BATCH</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={onPauseBatchWorkers}
                      className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-amber-500/40 bg-amber-950/50 px-4 py-2.5 font-mono text-xs font-semibold text-amber-200 hover:bg-amber-900/50 cursor-pointer"
                    >
                      <Pause className="h-3.5 w-3.5" />
                      <span>PAUSE BATCH</span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={onStopBatchWorkers}
                    className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-rose-500/40 bg-rose-950/60 px-4 py-2.5 font-mono text-xs font-semibold text-rose-200 hover:bg-rose-900/60 cursor-pointer"
                  >
                    <Square className="h-3.5 w-3.5 fill-current" />
                    <span>STOP WORKER ({batchState.activeWorkerCount})</span>
                  </button>
                </>
              )}
            </div>
          </div>
        </form>

        {/* RIGHT COLUMN: Live Worker Monitor & Real-Time Output */}
        <div className="xl:col-span-7 space-y-4 xl:sticky xl:top-20">
          {/* Batch Telemetry & KPIs Card */}
          <section className="rounded-2xl border border-zinc-800/90 bg-zinc-900/55 p-4 sm:p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-800/80 pb-3.5">
              <div className="flex items-center gap-2.5">
                <div
                  className={`flex h-9 w-9 items-center justify-center rounded-xl border ${
                    batchState?.running
                      ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-300'
                      : 'border-zinc-700 bg-zinc-800/80 text-zinc-400'
                  }`}
                >
                  <Activity className={`h-4.5 w-4.5 ${batchState?.running ? 'animate-pulse' : ''}`} />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-zinc-100">
                    Live Worker Monitor &amp; Output Stream
                  </h3>
                  <p className="font-mono text-[11px] text-zinc-400">
                    {batchState?.batchId
                      ? batchState.running
                        ? batchState.paused
                          ? 'Batch Dijeda (Paused) • Menunggu klik Resume'
                          : 'Batch Aktif • Refresh real-time setiap 1.5 detik'
                        : 'Batch Selesai / Standby'
                      : 'Siap menjalankan batch multi-worker dengan proxy hemat kuota'}
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {batchState?.running &&
                  (batchState.paused ? (
                    <button
                      type="button"
                      onClick={onResumeBatchWorkers}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-500/40 bg-emerald-500/15 px-3 py-1.5 font-mono text-xs font-semibold text-emerald-300 hover:bg-emerald-500/25 cursor-pointer"
                    >
                      <Play className="h-3.5 w-3.5 fill-current" />
                      <span>RESUME</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={onPauseBatchWorkers}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-amber-500/40 bg-amber-500/15 px-3 py-1.5 font-mono text-xs font-semibold text-amber-300 hover:bg-amber-500/25 cursor-pointer"
                    >
                      <Pause className="h-3.5 w-3.5" />
                      <span>PAUSE</span>
                    </button>
                  ))}
                {stopwatch.accountsPerMinute !== null && (
                  <div
                    title="Kecepatan rata-rata akun terdaftar per menit dan per jam"
                    className="inline-flex items-center gap-1.5 rounded-xl border border-cyan-500/35 bg-cyan-500/10 px-3 py-1.5 font-mono text-xs font-semibold tabular-nums text-cyan-300"
                  >
                    <Zap className="h-3.5 w-3.5 text-cyan-400" />
                    <span>
                      {stopwatch.accountsPerMinute}/mnt &bull; {stopwatch.accountsPerHour}/jam
                    </span>
                  </div>
                )}

                <div
                  title="Stopwatch durasi generate account"
                  className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 font-mono text-xs font-semibold tabular-nums ${
                    batchState?.running
                      ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-300'
                      : batchState?.batchId
                        ? 'border-cyan-500/30 bg-cyan-500/10 text-cyan-300'
                        : 'border-zinc-800 bg-zinc-950/80 text-zinc-400'
                  }`}
                >
                  <Clock className={`h-3.5 w-3.5 ${batchState?.running ? 'animate-spin' : ''}`} />
                  <span>{stopwatch.formattedElapsed}</span>
                </div>

                <button
                  type="button"
                  onClick={onExportAllFormatted}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-zinc-100 px-3 py-1.5 font-mono text-[11px] font-semibold text-zinc-950 hover:bg-zinc-200 cursor-pointer"
                >
                  <Database className="h-3.5 w-3.5" />
                  <span>LIHAT SEMUA DATABASE</span>
                </button>
              </div>
            </div>

            {/* 6 KPI Summary Cards (termasuk Stopwatch & Laju Per Menit / Per Jam) */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <div className="rounded-xl border border-zinc-800/80 bg-zinc-950/70 p-3">
                <div className="font-mono text-[10px] uppercase text-zinc-500">Terdaftar</div>
                <div className="mt-1 font-mono text-lg font-bold tabular-nums text-emerald-400">
                  {batchState?.completedCount ?? 0}
                  <span className="text-xs font-normal text-zinc-500">
                    /{batchState?.totalTarget ?? genQuantity}
                  </span>
                </div>
                <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-zinc-800">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-cyan-400 transition-all duration-300"
                    style={{ width: `${batchPercent}%` }}
                  />
                </div>
              </div>

              <div className="rounded-xl border border-zinc-800/80 bg-zinc-950/70 p-3">
                <div className="flex items-center justify-between font-mono text-[10px] uppercase text-zinc-500">
                  <span>Stopwatch</span>
                  {batchState?.running && (
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-ping" />
                  )}
                </div>
                <div className="mt-1 font-mono text-lg font-bold tabular-nums text-zinc-100">
                  {stopwatch.formattedElapsed}
                </div>
                <div className="mt-1 truncate font-mono text-[10px] tabular-nums text-zinc-400">
                  {stopwatch.etaFormatted
                    ? `ETA ${stopwatch.etaFormatted}`
                    : stopwatch.avgSecondsPerAccount !== null
                      ? `Rata-rata ${stopwatch.avgSecondsPerAccount}d/akun`
                      : batchState?.running
                        ? 'Menghitung waktu...'
                        : 'Siap mulai'}
                </div>
              </div>

              <div className="rounded-xl border border-zinc-800/80 bg-zinc-950/70 p-3">
                <div className="font-mono text-[10px] uppercase text-zinc-500">
                  Kecepatan (Mnt / Jam)
                </div>
                <div className="mt-1 font-mono text-lg font-bold tabular-nums text-emerald-300">
                  {stopwatch.accountsPerMinute ?? 0}
                  <span className="text-xs font-normal text-zinc-400">/mnt</span>
                </div>
                <div className="mt-1 truncate font-mono text-[10px] tabular-nums text-cyan-300">
                  ~{stopwatch.accountsPerHour ?? 0} akun/jam
                  {stopwatch.avgSecondsPerAccount !== null
                    ? ` (${stopwatch.avgSecondsPerAccount}d)`
                    : ''}
                </div>
              </div>

              <div className="rounded-xl border border-zinc-800/80 bg-zinc-950/70 p-3">
                <div className="font-mono text-[10px] uppercase text-zinc-500">Worker Aktif</div>
                <div className="mt-1 font-mono text-lg font-bold tabular-nums text-cyan-300">
                  {batchState?.activeWorkerCount ?? 0}
                </div>
                <div className="mt-1 text-[10px] font-mono text-zinc-500">
                  Target: {workerCount} slot
                </div>
              </div>

              <div className="rounded-xl border border-zinc-800/80 bg-zinc-950/70 p-3">
                <div className="flex items-center justify-between gap-1 font-mono text-[10px] uppercase text-zinc-500">
                  <span>Gagal / Diganti</span>
                  <button
                    type="button"
                    onClick={onPruneFailedCandidates}
                    title="Bersihkan kandidat gagal (FAILED) dari database"
                    className="rounded border border-rose-500/30 bg-rose-950/30 px-1.5 py-0.5 font-mono text-[9px] text-rose-300 hover:bg-rose-900/40 cursor-pointer"
                  >
                    BERSIHKAN
                  </button>
                </div>
                <div className="mt-1 font-mono text-lg font-bold tabular-nums text-amber-300">
                  {batchState?.failedCount ?? 0}
                  <span className="text-xs font-normal text-zinc-500">
                    {' '}
                    / {batchState?.replacedCount ?? 0}
                  </span>
                </div>
                <div className="mt-1 text-[10px] font-mono text-zinc-500">Auto-rotate username</div>
              </div>

              <div className="rounded-xl border border-zinc-800/80 bg-zinc-950/70 p-3">
                <div className="font-mono text-[10px] uppercase text-zinc-500">Kuota Proxy</div>
                <div className="mt-1 font-mono text-lg font-bold tabular-nums text-zinc-100">
                  {formatProxyBytes(batchState?.proxyTotalBytes)}
                </div>
                <div className="mt-1 text-[10px] font-mono text-emerald-400">
                  {batchState?.proxyTotalBlockedRequests ?? 0} req diblokir
                </div>
              </div>
            </div>

            {/* Worker Grid or Idle Placeholder */}
            {batchState && batchState.workers.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-[420px] overflow-y-auto pr-1">
                {batchState.workers.map((w) => {
                  const countdownStyle =
                    w.remainingSeconds == null
                      ? ''
                      : w.remainingSeconds <= 15
                        ? 'border-rose-500/40 bg-rose-500/15 text-rose-300'
                        : w.remainingSeconds <= 35
                          ? 'border-amber-500/40 bg-amber-500/15 text-amber-300'
                          : 'border-zinc-700 bg-zinc-800/80 text-zinc-300';

                  return (
                    <div
                      key={w.workerId}
                      className="rounded-xl border border-zinc-800 bg-zinc-950/85 p-3.5 text-xs space-y-2.5"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="font-mono font-bold text-zinc-100">
                            WORKER #{w.workerId}
                          </span>
                          <span className="truncate rounded-md border border-zinc-800 bg-zinc-900 px-1.5 py-0.5 font-mono text-[10px] text-zinc-400">
                            {w.browserVariant}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          {w.remainingSeconds != null && (
                            <span
                              className={`rounded-md border px-1.5 py-0.5 font-mono text-[10px] tabular-nums ${countdownStyle}`}
                            >
                              {w.remainingSeconds}d
                            </span>
                          )}
                          <span
                            className={`rounded-md border px-2 py-0.5 font-mono text-[10px] ${getStatusBadgeClasses(
                              w.state
                            )}`}
                          >
                            {w.state}
                          </span>
                        </div>
                      </div>

                      {/* Target Credentials + Quick Copy */}
                      <div className="rounded-lg border border-zinc-800/80 bg-zinc-900/60 p-2.5 space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-mono text-[11px] text-zinc-400">
                            Target:{' '}
                            <strong className="text-zinc-100">{w.currentUsername || '—'}</strong>
                          </span>
                          {w.currentUsername && w.currentPassword && (
                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => {
                                  void navigator.clipboard.writeText(w.currentUsername || '');
                                  onNotify('success', 'Username disalin');
                                }}
                                className="rounded border border-zinc-700 bg-zinc-950 px-1.5 py-0.5 font-mono text-[10px] text-zinc-200 hover:border-emerald-500/40 cursor-pointer"
                              >
                                USER
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  void navigator.clipboard.writeText(w.currentPassword || '');
                                  onNotify('success', 'Password disalin');
                                }}
                                className="rounded border border-zinc-700 bg-zinc-950 px-1.5 py-0.5 font-mono text-[10px] text-zinc-200 hover:border-emerald-500/40 cursor-pointer"
                              >
                                PASS
                              </button>
                            </div>
                          )}
                        </div>
                        {w.formHint && (
                          <div className="font-mono text-[10px] text-emerald-300/90 leading-snug">
                            {w.formHint}
                          </div>
                        )}
                      </div>

                      {/* Proxy & Profile telemetry */}
                      <div className="space-y-1 font-mono text-[11px]">
                        <div className="flex flex-wrap items-center justify-between gap-1 text-zinc-400">
                          <span className="truncate">Proxy: {w.proxyServer || 'Direct'}</span>
                          {w.proxyServer && !w.proxyServer.startsWith('Direct') && (
                            <span className="text-emerald-400 tabular-nums">
                              {formatProxyBytes(w.proxyBytes)} &bull; {w.proxyBlockedRequests ?? 0}{' '}
                              blk
                            </span>
                          )}
                        </div>
                        <div className="truncate text-[10px] text-zinc-500" title={w.profilePath}>
                          Profil: {w.profilePath}
                        </div>
                      </div>

                      <div className="flex items-center justify-between gap-2 border-t border-zinc-800/80 pt-2 text-[11px]">
                        <span className="truncate text-zinc-300" title={w.message}>
                          {w.message}
                        </span>
                        <span className="shrink-0 font-mono text-[10px] font-semibold text-emerald-400 tabular-nums">
                          {w.completedByWorker} selesai
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-zinc-800 bg-zinc-950/50 p-6 text-center space-y-2">
                <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full border border-zinc-800 bg-zinc-900 text-emerald-400">
                  <Play className="h-4 w-4" />
                </div>
                <div className="text-xs font-medium text-zinc-200">
                  Belum ada worker batch yang berjalan
                </div>
                <p className="mx-auto max-w-md text-[11px] text-zinc-500 leading-relaxed">
                  Atur prefix, jumlah akun, &amp; proxy di panel kiri lalu klik{' '}
                  <strong className="text-emerald-300">MULAI AUTOFILL</strong>. Progress per worker, sisa waktu, &amp; output{' '}
                  <code>username:password:cookie</code> akan tampil real-time di sini.
                </p>
              </div>
            )}

            {/* Live Registered Output Stream */}
            {batchState && batchState.registeredLines.length > 0 && (
              <div className="rounded-xl border border-emerald-500/25 bg-zinc-950/90 p-3.5 space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                    <span className="font-mono text-xs font-semibold text-emerald-300">
                      LIVE OUTPUT ({batchState.registeredLines.length} AKUN TERSIMPAN)
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        const count = downloadExportFile(
                          batchState.registeredLines.join('\n'),
                          'txt'
                        );
                        onNotify('success', `Berhasil mengunduh ${count} akun ke file .TXT!`);
                      }}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-cyan-500/40 bg-cyan-500/10 px-3 py-1 font-mono text-[11px] text-cyan-200 hover:bg-cyan-500/20 cursor-pointer"
                    >
                      <Download className="h-3 w-3 text-cyan-400" />
                      DOWNLOAD .TXT
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        void navigator.clipboard.writeText(batchState.registeredLines.join('\n'));
                        onNotify(
                          'success',
                          'Seluruh hasil username:password:cookie disalin ke clipboard!'
                        );
                      }}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-1 font-mono text-[11px] text-zinc-200 hover:bg-zinc-800 cursor-pointer"
                    >
                      <Copy className="h-3 w-3" />
                      COPY SEMUA ({batchState.registeredLines.length})
                    </button>
                  </div>
                </div>
                <textarea
                  readOnly
                  rows={5}
                  value={batchState.registeredLines.join('\n')}
                  className="w-full rounded-lg border border-zinc-800 bg-zinc-950 p-3 font-mono text-xs text-emerald-300 focus:outline-none"
                />
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
