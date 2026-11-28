import React from 'react';
import {
  Cpu,
  Users,
  ScrollText,
  Settings,
  LogOut,
  X,
  Download,
  CheckCircle2,
  AlertTriangle,
  Activity,
  Zap,
  Clock,
  Moon,
  Sun,
} from 'lucide-react';
import { UserInfo, BatchRunState } from '../api.js';
import {
  ActiveTab,
  ToastMessage,
  formatProxyBytes,
  useAaxTheme,
  useBatchStopwatch,
} from './types.js';

interface SidebarLayoutProps {
  user: UserInfo;
  activeTab: ActiveTab;
  setActiveTab: (tab: ActiveTab) => void;
  batchState: BatchRunState | null;
  jobsTotal: number;
  accountsTotal: number;
  toast: ToastMessage | null;
  onDismissToast: () => void;
  onExportAll: () => void;
  onLogout: () => void;
  children: React.ReactNode;
}

const NAV_ITEMS: Array<{
  id: ActiveTab;
  label: string;
  subtitle: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  {
    id: 'generator',
    label: 'Generator & Worker',
    subtitle: 'Setup batch, proxy hemat kuota, & live monitor multi-worker',
    icon: Cpu,
  },
  {
    id: 'accounts',
    label: 'Accounts Vault',
    subtitle: 'Repositori akun terdaftar & terenkripsi AES-256-GCM Vault',
    icon: Users,
  },
  {
    id: 'logs',
    label: 'Activity & Audit',
    subtitle: 'Audit aktivitas sistem & riwayat konfirmasi registrasi',
    icon: ScrollText,
  },
  {
    id: 'settings',
    label: 'System Settings',
    subtitle: 'Default generator, security compliance, & storage health',
    icon: Settings,
  },
];

/**
 * Playful Neo-Brutalist Arcade Layout (inspired by aaxyou.store) with Dark & Light Arcade modes:
 * - Sky gradient stage with CSS pixel clouds & checkerboard ground strip
 * - Floating capsule pills (.aax-pill) for Brand, Navigation, Live Stats, Theme Switcher, & Actions
 * - Hero banner with 3D typography, tilted pixel sticker, & quick-status card
 * - Dark navy LIVE ticker bar underneath
 */
export function SidebarLayout({
  user,
  activeTab,
  setActiveTab,
  batchState,
  accountsTotal,
  toast,
  onDismissToast,
  onExportAll,
  onLogout,
  children,
}: SidebarLayoutProps) {
  const stopwatch = useBatchStopwatch(batchState);
  const { themeMode, toggleThemeMode } = useAaxTheme();
  const activeMeta = NAV_ITEMS.find((n) => n.id === activeTab) ?? NAV_ITEMS[0];

  const getNavBadge = (id: ActiveTab): string | null => {
    if (id === 'generator' && batchState?.running) {
      return `${batchState.activeWorkerCount} ON`;
    }
    if (id === 'accounts' && accountsTotal > 0) return String(accountsTotal);
    return null;
  };

  const batchPercent =
    batchState && batchState.totalTarget > 0
      ? Math.min(100, Math.round((batchState.completedCount / batchState.totalTarget) * 100))
      : 0;

  const latestRegisteredSample =
    batchState && batchState.registeredLines.length > 0
      ? batchState.registeredLines[batchState.registeredLines.length - 1]?.split(':')[0] ?? null
      : null;

  return (
    <div className="aax-theme min-h-screen flex flex-col">
      {/* SKY STAGE: Floating Pills Topbar + Compact Hero Banner */}
      <div className="aax-sky px-4 sm:px-6 pt-4 pb-8">
        {/* Decorative CSS Pixel Clouds */}
        <div className="aax-pixel-cloud top-6 left-[8%] hidden md:block" aria-hidden="true" />
        <div className="aax-pixel-cloud top-14 right-[14%] hidden lg:block" aria-hidden="true" />
        <div className="aax-pixel-cloud bottom-10 left-[44%] hidden xl:block" aria-hidden="true" />

        <div className="relative z-10 mx-auto max-w-[1600px] space-y-5">
          {/* FLOATING PILL TOPBAR */}
          <header className="flex flex-wrap items-center justify-between gap-2.5">
            {/* 1. Brand Pill */}
            <button
              type="button"
              onClick={() => setActiveTab('generator')}
              className="aax-pill inline-flex items-center gap-2.5 px-3.5 py-2 text-left transition hover:-translate-y-0.5 cursor-pointer"
            >
              <span className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-[#040a14] bg-[#ffc533] font-black text-sm text-[#0a1f3d] shadow-[2px_2px_0_#040a14]">
                R
              </span>
              <span className="font-black tracking-tight text-base text-[var(--ink)]">
                RAGE<span className="text-[#38bdf8]">ENGINE</span>
              </span>
            </button>

            {/* 2. Navigation Links Pill */}
            <nav
              aria-label="Primary Navigation"
              className="aax-pill flex flex-wrap items-center gap-1 p-1.5"
            >
              {NAV_ITEMS.map((item) => {
                const Icon = item.icon;
                const isActive = activeTab === item.id;
                const badge = getNavBadge(item.id);
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setActiveTab(item.id)}
                    className={`inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-xs font-extrabold transition cursor-pointer ${
                      isActive
                        ? 'border-2 border-[#040a14] bg-[#ffc533] text-[#0a1f3d] shadow-[0_2px_0_#040a14]'
                        : 'border-2 border-transparent text-[var(--ink-2)] hover:bg-[var(--sky-tint)] hover:text-[var(--ink)]'
                    }`}
                  >
                    <Icon className="h-3.5 w-3.5 shrink-0" />
                    <span>{item.label}</span>
                    {badge && (
                      <span
                        className={`rounded-full border-[1.5px] border-[#040a14] px-1.5 py-0.2 font-mono text-[10px] font-black tabular-nums ${
                          isActive
                            ? 'bg-[#0a1f3d] text-[#ffc533]'
                            : 'bg-[var(--sky-tint)] text-[var(--sky-2)]'
                        }`}
                      >
                        {badge}
                      </span>
                    )}
                  </button>
                );
              })}
            </nav>

            {/* 3. Right Live Stat Pills, Theme Switcher, & Quick Actions */}
            <div className="flex flex-wrap items-center gap-2">
              <div
                title="Total akun terdaftar di Account Vault"
                className="aax-pill inline-flex items-center gap-2 px-3 py-1.5 text-xs font-extrabold"
              >
                <span className="h-2.5 w-2.5 rounded-[3px] border-[1.5px] border-[#040a14] bg-[#22c55e]" />
                <span className="font-mono font-bold tabular-nums">{accountsTotal}</span>
                <span className="text-[var(--ink-2)]">in vault</span>
              </div>

              <div
                title="Progress batch & stopwatch"
                className="aax-pill inline-flex items-center gap-2 px-3 py-1.5 text-xs font-extrabold"
              >
                <span
                  className={`h-2.5 w-2.5 rounded-[3px] border-[1.5px] border-[#040a14] ${
                    batchState?.running ? 'bg-[#ffc533] animate-pulse' : 'bg-[#38bdf8]'
                  }`}
                />
                <span className="font-mono font-bold tabular-nums">
                  {batchState?.completedCount ?? 0}/{batchState?.totalTarget ?? 0}
                </span>
                <span className="text-[var(--ink-2)]">&bull;</span>
                <span className="font-mono font-bold tabular-nums text-[#38bdf8]">
                  {stopwatch.formattedElapsed}
                </span>
              </div>

              {/* DARK / LIGHT ARCADE THEME TOGGLE PILL */}
              <button
                type="button"
                onClick={toggleThemeMode}
                title={
                  themeMode === 'dark'
                    ? 'Ganti ke Tema Light Arcade (Daytime Sky)'
                    : 'Ganti ke Tema Dark Arcade (Midnight Sky)'
                }
                className="aax-pill inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-black transition hover:-translate-y-0.5 cursor-pointer"
              >
                {themeMode === 'dark' ? (
                  <>
                    <Moon className="h-3.5 w-3.5 text-[#ffc533]" />
                    <span>DARK</span>
                  </>
                ) : (
                  <>
                    <Sun className="h-3.5 w-3.5 text-[#d9960a]" />
                    <span>LIGHT</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={onExportAll}
                className="aax-btn-gold inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-black cursor-pointer"
              >
                <Download className="h-3.5 w-3.5" />
                <span>EXPORT DATABASE</span>
              </button>

              <div className="aax-pill inline-flex items-center gap-2 pl-3 pr-1.5 py-1">
                <span className="text-xs font-black text-[var(--ink)]">{user.username}</span>
                <span className="rounded-md border-[1.5px] border-[#040a14] bg-[#ffc533] px-1.5 py-0.5 font-mono text-[10px] font-black text-[#0a1f3d]">
                  {user.role}
                </span>
                <button
                  type="button"
                  title="Logout"
                  aria-label="Logout"
                  onClick={onLogout}
                  className="inline-flex items-center gap-1 rounded-full border-2 border-[#040a14] bg-[#f43f5e] px-2.5 py-1 font-mono text-[10px] font-black text-white hover:bg-[#e11d48] cursor-pointer"
                >
                  <LogOut className="h-3 w-3" />
                  <span>LOGOUT</span>
                </button>
              </div>
            </div>
          </header>

          {/* HERO BANNER ROW */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-center pt-1">
            <div className="lg:col-span-7 space-y-2.5">
              <div className="flex flex-wrap items-center gap-2.5">
                <span className="aax-pixel-tag">RAGE ENGINE // AUTOFILL</span>
                <span className="aax-sticker">80-90% PROXY SAVER</span>
              </div>
              <h1 className="text-2xl sm:text-4xl leading-[1.08] tracking-tight">
                <span className="aax-hero-title block">ROBLOX ACCOUNT GENERATOR</span>
                <span className="aax-gold-title block">
                  24/7 MULTI-WORKER &bull; {activeMeta.label.toUpperCase()}
                </span>
              </h1>
              <p className="max-w-2xl text-xs sm:text-sm font-bold text-[#dbeafe]">
                {activeMeta.subtitle} — dilengkapi{' '}
                <span className="rounded-md bg-[#040a14]/50 px-1.5 py-0.5 text-white">
                  AES-256-GCM Vault
                </span>
                ,{' '}
                <span className="rounded-md bg-[#040a14]/50 px-1.5 py-0.5 text-[#ffc533]">
                  1 Akun = 1 Sticky Proxy
                </span>
                , &amp; format siap pakai{' '}
                <span className="rounded-md bg-[#040a14]/50 px-1.5 py-0.5 text-white font-mono">
                  user:pass:cookie
                </span>
                .
              </p>
            </div>

            {/* Right Hero Card: Quick Live Status */}
            <div className="lg:col-span-5">
              <div className="aax-card p-4 space-y-3">
                <div className="flex items-center justify-between gap-2 border-b-2 dashed border-[var(--line-2)] pb-2.5">
                  <div className="flex items-center gap-2">
                    <span className="flex h-6 w-6 items-center justify-center rounded-md border-2 border-[#040a14] bg-[#ffc533] font-mono text-xs font-black text-[#0a1f3d]">
                      ⚡
                    </span>
                    <span className="text-xs font-black uppercase tracking-wider text-[var(--ink)]">
                      {batchState?.running
                        ? batchState.paused
                          ? 'BATCH PAUSED (DIJEDA)'
                          : 'LIVE BATCH RUNNING'
                        : 'ENGINE TELEMETRY'}
                    </span>
                  </div>
                  <span className="rounded-full border-2 border-[var(--border-ink)] bg-[var(--green-tint)] px-2.5 py-0.5 font-mono text-[11px] font-black text-[var(--green-ink)]">
                    {stopwatch.accountsPerMinute !== null
                      ? `${stopwatch.accountsPerMinute}/mnt • ${stopwatch.accountsPerHour}/jam`
                      : 'READY 24/7'}
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="aax-well p-2">
                    <div className="font-mono text-[10px] font-bold uppercase text-[var(--muted)]">
                      Registered
                    </div>
                    <div className="font-mono text-base font-black tabular-nums text-[var(--green-ink)]">
                      {batchState?.completedCount ?? 0}/{batchState?.totalTarget ?? 0}
                    </div>
                  </div>
                  <div className="aax-well p-2">
                    <div className="font-mono text-[10px] font-bold uppercase text-[var(--muted)]">
                      Stopwatch
                    </div>
                    <div className="font-mono text-base font-black tabular-nums text-[var(--ink)]">
                      {stopwatch.formattedElapsed}
                    </div>
                  </div>
                  <div className="aax-well p-2">
                    <div className="font-mono text-[10px] font-bold uppercase text-[var(--muted)]">
                      Proxy Data
                    </div>
                    <div className="font-mono text-base font-black tabular-nums text-[var(--sky-2)]">
                      {formatProxyBytes(batchState?.proxyTotalBytes)}
                    </div>
                  </div>
                </div>

                <div className="h-3 w-full overflow-hidden rounded-full border-2 border-[var(--border-ink)] bg-[var(--well)]">
                  <div
                    className="h-full bg-[#22c55e] transition-all duration-300"
                    style={{ width: `${batchPercent}%` }}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* LIVE NAVY TICKER STRIP (aaxyou.store signature ticker) */}
      <div className="aax-ticker px-4 sm:px-6 py-2">
        <div className="mx-auto max-w-[1600px] flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex flex-wrap items-center gap-2.5 min-w-0">
            <span className="aax-live-badge">LIVE</span>
            <span className="font-mono text-xs text-white/95 truncate">
              {batchState?.running ? (
                <>
                  <Activity className="inline h-3.5 w-3.5 text-[#ffc533] mr-1" />
                  <strong>{batchState.activeWorkerCount} Worker aktif</strong> &bull; Terdaftar{' '}
                  <strong>
                    {batchState.completedCount}/{batchState.totalTarget}
                  </strong>{' '}
                  &bull; Durasi <strong>{stopwatch.formattedElapsed}</strong>
                  {latestRegisteredSample ? (
                    <>
                      {' '}
                      &bull; ✅ Akun terbaru:{' '}
                      <strong className="text-[#7fd0ff]">{latestRegisteredSample}</strong>
                    </>
                  ) : null}
                </>
              ) : (
                <>
                  ✅{' '}
                  <strong>
                    RAGE Neo-Brutalist Arcade ({themeMode === 'dark' ? 'Dark Mode' : 'Light Mode'})
                  </strong>{' '}
                  &bull; Total Vault:{' '}
                  <strong className="text-[#ffc533]">{accountsTotal} akun</strong> &bull; Hemat
                  kuota proxy ~80-90% siap dijalankan
                </>
              )}
            </span>
          </div>

          <div className="hidden md:flex items-center gap-3 font-mono text-[11px] text-[#7fd0ff]">
            <span className="inline-flex items-center gap-1">
              <Zap className="h-3.5 w-3.5 text-[#ffc533]" />
              {batchState?.proxyTotalBlockedRequests ?? 0} req iklan/media diblokir
            </span>
            <span>&bull;</span>
            <span className="inline-flex items-center gap-1">
              <Clock className="h-3.5 w-3.5 text-[#7fd0ff]" />
              {stopwatch.etaFormatted ? `ETA ${stopwatch.etaFormatted}` : 'AES-256-GCM SEALED'}
            </span>
          </div>
        </div>
      </div>

      {/* MAIN CONTENT AREA */}
      <main className="flex-1 p-4 sm:p-6 max-w-[1600px] w-full mx-auto space-y-6">
        {children}
      </main>

      {/* FLOATING TOAST NOTIFICATION */}
      {toast && (
        <div
          role="status"
          className={`fixed bottom-5 right-5 z-50 flex max-w-md items-start gap-2.5 rounded-2xl border-[3px] border-[var(--border-ink)] px-4 py-3 text-xs font-bold shadow-[0_6px_0_var(--outline)] ${
            toast.type === 'success'
              ? 'bg-[var(--green-tint)] text-[var(--green-ink)]'
              : 'bg-[var(--red-tint)] text-[var(--red-ink)]'
          }`}
        >
          {toast.type === 'success' ? (
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[#22c55e]" />
          ) : (
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[#f43f5e]" />
          )}
          <span className="font-mono leading-relaxed">{toast.text}</span>
          <button
            type="button"
            aria-label="Dismiss notification"
            onClick={onDismissToast}
            className="ml-1 rounded-lg border-2 border-[var(--border-ink)] bg-[var(--paper)] p-0.5 text-[var(--ink)] hover:bg-[#ffc533] hover:text-[#0a1f3d] cursor-pointer"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}
