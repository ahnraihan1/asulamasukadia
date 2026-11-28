import React, { useState } from 'react';
import {
  Cpu,
  Layers,
  Users,
  ScrollText,
  Settings,
  LogOut,
  Menu,
  X,
  PanelLeftClose,
  PanelLeftOpen,
  Download,
  CheckCircle2,
  AlertTriangle,
  Activity,
  Shield,
} from 'lucide-react';
import { UserInfo, BatchRunState } from '../api.js';
import { ActiveTab, ToastMessage, useBatchStopwatch } from './types.js';

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
    id: 'jobs',
    label: 'Registration Jobs',
    subtitle: 'Antrean persiapan kandidat, pause/resume, & status completion',
    icon: Layers,
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
 * Collapsible left sidebar + sticky command topbar shell for RAGE dashboard.
 */
export function SidebarLayout({
  user,
  activeTab,
  setActiveTab,
  batchState,
  jobsTotal,
  accountsTotal,
  toast,
  onDismissToast,
  onExportAll,
  onLogout,
  children,
}: SidebarLayoutProps) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const stopwatch = useBatchStopwatch(batchState);

  const activeMeta = NAV_ITEMS.find((n) => n.id === activeTab) ?? NAV_ITEMS[0];

  const getNavBadge = (id: ActiveTab): string | null => {
    if (id === 'generator' && batchState?.running) {
      return `${batchState.activeWorkerCount} ON`;
    }
    if (id === 'jobs' && jobsTotal > 0) return String(jobsTotal);
    if (id === 'accounts' && accountsTotal > 0) return String(accountsTotal);
    return null;
  };

  const renderSidebarContent = (collapsed: boolean) => (
    <div className="flex h-full flex-col justify-between">
      <div>
        {/* Brand Section */}
        <div className="flex h-16 items-center justify-between border-b border-zinc-800/80 px-4">
          <div className="flex items-center gap-2.5 overflow-hidden">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-emerald-500/30 bg-gradient-to-br from-emerald-500/20 to-cyan-500/10 text-emerald-300 shadow-inner">
              <Shield className="h-4.5 w-4.5" />
            </div>
            {!collapsed && (
              <div className="min-w-0">
                <div className="truncate font-mono text-xs font-bold tracking-wider text-zinc-100">
                  RAGE ENGINE
                </div>
                <div className="truncate text-[10px] font-mono text-emerald-400">
                  SUPERVISED WORKFLOW
                </div>
              </div>
            )}
          </div>

          <button
            type="button"
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            onClick={() => setSidebarCollapsed((c) => !c)}
            className="hidden lg:flex rounded-lg p-1.5 text-zinc-500 hover:bg-zinc-800/80 hover:text-zinc-200 cursor-pointer"
          >
            {collapsed ? (
              <PanelLeftOpen className="h-4 w-4" />
            ) : (
              <PanelLeftClose className="h-4 w-4" />
            )}
          </button>

          <button
            type="button"
            aria-label="Close navigation menu"
            onClick={() => setMobileMenuOpen(false)}
            className="lg:hidden rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100 cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Navigation Links */}
        <nav className="space-y-1 p-3" aria-label="Primary Navigation">
          {!collapsed && (
            <div className="px-2.5 pb-1.5 text-[10px] font-mono uppercase tracking-widest text-zinc-500">
              Workspace
            </div>
          )}
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            const badge = getNavBadge(item.id);
            return (
              <button
                key={item.id}
                type="button"
                title={collapsed ? item.label : undefined}
                onClick={() => {
                  setActiveTab(item.id);
                  setMobileMenuOpen(false);
                }}
                className={`group flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left text-xs font-medium transition cursor-pointer ${
                  isActive
                    ? 'border border-emerald-500/25 bg-emerald-500/10 text-emerald-300 shadow-sm'
                    : 'border border-transparent text-zinc-400 hover:bg-zinc-900/90 hover:text-zinc-100'
                }`}
              >
                <span className="flex items-center gap-3 min-w-0">
                  <Icon
                    className={`h-4 w-4 shrink-0 ${
                      isActive ? 'text-emerald-400' : 'text-zinc-500 group-hover:text-zinc-300'
                    }`}
                  />
                  {!collapsed && <span className="truncate">{item.label}</span>}
                </span>
                {!collapsed && badge && (
                  <span
                    className={`ml-2 rounded-md px-1.5 py-0.5 font-mono text-[10px] tabular-nums ${
                      item.id === 'generator' && batchState?.running
                        ? 'bg-emerald-500/20 text-emerald-300'
                        : 'bg-zinc-800 text-zinc-300'
                    }`}
                  >
                    {badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Bottom Operator Profile Card */}
      <div className="border-t border-zinc-800/80 p-3 space-y-2.5">
        {!collapsed && batchState?.batchId && (
          <button
            type="button"
            onClick={() => {
              setActiveTab('generator');
              setMobileMenuOpen(false);
            }}
            className="w-full rounded-xl border border-zinc-800 bg-zinc-900/70 p-2.5 text-left transition hover:border-zinc-700 cursor-pointer"
          >
            <div className="flex items-center justify-between text-[10px] font-mono">
              <span className="flex items-center gap-1.5 text-zinc-300">
                <span
                  className={`h-2 w-2 rounded-full ${
                    batchState.running ? 'bg-emerald-400 animate-pulse' : 'bg-zinc-500'
                  }`}
                />
                {batchState.running ? 'BATCH RUNNING' : 'LAST BATCH'}
              </span>
              <span className="tabular-nums text-emerald-400">
                {batchState.completedCount}/{batchState.totalTarget} &bull;{' '}
                {stopwatch.formattedElapsed}
              </span>
            </div>
            <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-zinc-800">
              <div
                className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-cyan-400 transition-all duration-300"
                style={{
                  width: `${
                    batchState.totalTarget > 0
                      ? Math.min(100, Math.round((batchState.completedCount / batchState.totalTarget) * 100))
                      : 0
                  }%`,
                }}
              />
            </div>
          </button>
        )}

        <div
          className={`flex items-center ${
            collapsed ? 'justify-center' : 'justify-between'
          } rounded-xl border border-zinc-800/80 bg-zinc-900/60 p-2.5`}
        >
          {!collapsed && (
            <div className="min-w-0 pr-2">
              <div className="truncate text-xs font-semibold text-zinc-100">{user.username}</div>
              <div className="font-mono text-[10px] text-cyan-400">{user.role}</div>
            </div>
          )}
          <button
            type="button"
            title="Logout"
            aria-label="Logout"
            onClick={onLogout}
            className="flex items-center gap-1.5 rounded-lg border border-zinc-800 bg-zinc-950/70 px-2.5 py-1.5 text-[11px] font-mono text-zinc-300 transition hover:border-rose-500/40 hover:bg-rose-950/30 hover:text-rose-200 cursor-pointer"
          >
            <LogOut className="h-3.5 w-3.5" />
            {!collapsed && <span>LOGOUT</span>}
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="relative min-h-screen bg-zinc-950 text-zinc-100 flex">
      {/* Desktop Sidebar */}
      <aside
        className={`hidden lg:block shrink-0 border-r border-zinc-800/80 bg-zinc-950/95 transition-all duration-200 ${
          sidebarCollapsed ? 'w-[74px]' : 'w-64'
        }`}
      >
        <div className="sticky top-0 h-screen">{renderSidebarContent(sidebarCollapsed)}</div>
      </aside>

      {/* Mobile Drawer Overlay */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 flex lg:hidden">
          <div
            className="fixed inset-0 bg-black/75 backdrop-blur-sm"
            onClick={() => setMobileMenuOpen(false)}
          />
          <aside className="relative z-10 w-72 border-r border-zinc-800 bg-zinc-950 shadow-2xl">
            {renderSidebarContent(false)}
          </aside>
        </div>
      )}

      {/* Main Column */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Sticky Top Command Bar */}
        <header className="sticky top-0 z-30 border-b border-zinc-800/80 bg-zinc-950/85 backdrop-blur-xl px-4 sm:px-6">
          <div className="flex h-16 items-center justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0">
              <button
                type="button"
                aria-label="Open navigation menu"
                onClick={() => setMobileMenuOpen(true)}
                className="lg:hidden rounded-lg border border-zinc-800 bg-zinc-900 p-2 text-zinc-300 hover:bg-zinc-800 cursor-pointer"
              >
                <Menu className="h-4 w-4" />
              </button>

              <div className="min-w-0">
                <div className="flex items-center gap-2.5 flex-wrap">
                  <span className="font-mono text-xs font-semibold tracking-wider text-zinc-100">
                    RAGE // ACCOUNT GENERATOR ENGINE
                  </span>
                  <span className="hidden sm:inline-flex items-center rounded-full border border-zinc-800 bg-zinc-900/90 px-2 py-0.5 font-mono text-[10px] text-zinc-400">
                    HUMAN-SUPERVISED MODE
                  </span>
                </div>
                <p className="truncate text-xs text-zinc-500 mt-0.5">
                  <span className="text-zinc-300 font-medium">{activeMeta.label}</span> —{' '}
                  {activeMeta.subtitle}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2.5 shrink-0">
              {batchState?.running && (
                <button
                  type="button"
                  onClick={() => setActiveTab('generator')}
                  className="hidden md:inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-xs font-mono text-emerald-300 hover:bg-emerald-500/20 cursor-pointer"
                >
                  <Activity className="h-3.5 w-3.5 animate-pulse" />
                  <span className="tabular-nums">
                    {batchState.activeWorkerCount} Worker &bull; {batchState.completedCount}/
                    {batchState.totalTarget} &bull; {stopwatch.formattedElapsed}
                    {stopwatch.accountsPerMinute !== null
                      ? ` (${stopwatch.accountsPerMinute}/mnt • ${stopwatch.accountsPerHour}/jam)`
                      : ''}
                  </span>
                </button>
              )}

              <button
                type="button"
                onClick={onExportAll}
                className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-800 bg-zinc-900/80 px-3 py-1.5 text-xs font-mono text-zinc-200 transition hover:border-zinc-700 hover:bg-zinc-800 cursor-pointer"
              >
                <Download className="h-3.5 w-3.5 text-emerald-400" />
                <span className="hidden sm:inline">EXPORT DATABASE</span>
              </button>
            </div>
          </div>
        </header>

        {/* Main Scroll Area */}
        <main className="flex-1 p-4 sm:p-6 max-w-[1600px] w-full mx-auto space-y-6">
          {children}
        </main>
      </div>

      {/* Floating Toast Notification */}
      {toast && (
        <div
          role="status"
          className={`fixed bottom-5 right-5 z-50 flex max-w-md items-start gap-2.5 rounded-xl border px-4 py-3 text-xs shadow-2xl backdrop-blur-xl ${
            toast.type === 'success'
              ? 'border-emerald-500/30 bg-zinc-900/95 text-zinc-100'
              : 'border-rose-500/40 bg-rose-950/95 text-rose-100'
          }`}
        >
          {toast.type === 'success' ? (
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
          ) : (
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-rose-400" />
          )}
          <span className="font-mono leading-relaxed">{toast.text}</span>
          <button
            type="button"
            aria-label="Dismiss notification"
            onClick={onDismissToast}
            className="ml-1 rounded p-0.5 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100 cursor-pointer"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}
