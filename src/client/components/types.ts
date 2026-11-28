import { useEffect, useState } from 'react';
import { BatchRunState } from '../api.js';

export type ActiveTab = 'generator' | 'jobs' | 'accounts' | 'logs' | 'settings';

export type WindowSplitMode = 'AUTO' | 'COLUMNS' | 'GRID';
export type BirthGender = 'MALE' | 'FEMALE' | 'RANDOM';

export interface ToastMessage {
  type: 'success' | 'error';
  text: string;
}

export const STORAGE_CFG_KEY = 'rage_ui_config_v1';

export function loadSavedUiCfg(): Record<string, any> {
  try {
    const raw = window.localStorage.getItem(STORAGE_CFG_KEY);
    return raw ? (JSON.parse(raw) as Record<string, any>) : {};
  } catch {
    return {};
  }
}

export function formatProxyBytes(bytes?: number): string {
  const b = Number(bytes || 0);
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / (1024 * 1024)).toFixed(2)} MB`;
}

export function formatStopwatchDuration(totalSeconds: number): string {
  const sec = Math.max(0, Math.floor(Number(totalSeconds) || 0));
  const hours = Math.floor(sec / 3600);
  const minutes = Math.floor((sec % 3600) / 60);
  const seconds = sec % 60;
  return [
    String(hours).padStart(2, '0'),
    String(minutes).padStart(2, '0'),
    String(seconds).padStart(2, '0'),
  ].join(':');
}

export interface BatchStopwatchMetrics {
  elapsedSeconds: number;
  formattedElapsed: string;
  avgSecondsPerAccount: number | null;
  accountsPerMinute: number | null;
  accountsPerHour: number | null;
  etaFormatted: string | null;
}

export function useBatchStopwatch(batchState: BatchRunState | null): BatchStopwatchMetrics {
  const [nowMs, setNowMs] = useState<number>(() => Date.now());

  useEffect(() => {
    if (!batchState?.running || !batchState?.startedAt) return;
    setNowMs(Date.now());
    const timer = setInterval(() => {
      setNowMs(Date.now());
    }, 1000);
    return () => clearInterval(timer);
  }, [batchState?.running, batchState?.startedAt, batchState?.batchId]);

  if (!batchState?.startedAt) {
    return {
      elapsedSeconds: 0,
      formattedElapsed: '00:00:00',
      avgSecondsPerAccount: null,
      accountsPerMinute: null,
      accountsPerHour: null,
      etaFormatted: null,
    };
  }

  const startMs = Date.parse(batchState.startedAt);
  const endMs = batchState.running
    ? Math.max(startMs, nowMs)
    : batchState.updatedAt
      ? Math.max(startMs, Date.parse(batchState.updatedAt))
      : startMs;

  const elapsedSeconds = Number.isFinite(startMs)
    ? Math.max(0, Math.floor((endMs - startMs) / 1000))
    : 0;
  const formattedElapsed = formatStopwatchDuration(elapsedSeconds);

  const completed = batchState.completedCount ?? 0;
  const avgSecondsPerAccount =
    completed > 0 && elapsedSeconds > 0
      ? Math.round((elapsedSeconds / completed) * 10) / 10
      : null;

  const accountsPerMinute =
    completed > 0 && elapsedSeconds > 0
      ? Math.round(((completed / elapsedSeconds) * 60) * 10) / 10
      : null;

  const accountsPerHour =
    completed > 0 && elapsedSeconds > 0
      ? Math.round((completed / elapsedSeconds) * 3600)
      : null;

  const remainingAccounts = Math.max(0, (batchState.totalTarget ?? 0) - completed);
  const etaFormatted =
    batchState.running && avgSecondsPerAccount !== null && remainingAccounts > 0
      ? formatStopwatchDuration(Math.ceil((elapsedSeconds / completed) * remainingAccounts))
      : null;

  return {
    elapsedSeconds,
    formattedElapsed,
    avgSecondsPerAccount,
    accountsPerMinute,
    accountsPerHour,
    etaFormatted,
  };
}

export function describeWindowSplitPreview(n: number, mode: WindowSplitMode): string {
  if (n <= 1) return '1 Worker = Normal (Split otomatis jika Worker >= 2)';
  if (mode === 'COLUMNS') return `${n} Kolom (${n} x 1)`;
  if (mode === 'GRID') {
    const cols = Math.ceil(Math.sqrt(n));
    const rows = Math.ceil(n / cols);
    return `Grid ${cols} x ${rows} (${n} Kotak)`;
  }
  if (n <= 3) return `${n} Kolom (${n} x 1)`;
  const rows = n <= 10 ? 2 : n <= 18 ? 3 : Math.ceil(Math.sqrt(n));
  const cols = Math.ceil(n / rows);
  return `Grid ${cols} x ${rows} (${n} Kotak)`;
}

export function getStatusBadgeClasses(status: string): string {
  switch (status) {
    case 'REGISTERED':
    case 'COMPLETED':
    case 'VERIFIED':
    case 'VALID':
    case 'WAITING_REGISTRATION':
    case 'ACTIVE':
      return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300';
    case 'PROCESSING':
    case 'OPENING_BROWSER':
    case 'CAPTURED_SAVING':
    case 'LAUNCHING':
      return 'border-cyan-500/30 bg-cyan-500/10 text-cyan-300';
    case 'VERIFICATION_REQUIRED':
    case 'PENDING_CONFIRMATION':
    case 'PENDING':
    case 'PAUSED':
    case 'SAVING':
      return 'border-amber-500/30 bg-amber-500/10 text-amber-300';
    case 'FAILED':
    case 'INVALID':
    case 'ERROR':
    case 'SUSPENDED':
    case 'CANCELED':
      return 'border-rose-500/30 bg-rose-500/10 text-rose-300';
    default:
      return 'border-zinc-700/80 bg-zinc-800/60 text-zinc-300';
  }
}

export const INPUT_CLS =
  'w-full rounded-lg border border-zinc-800 bg-zinc-950/80 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 transition focus:border-emerald-500/70 focus:outline-none focus:ring-2 focus:ring-emerald-500/20';

export const SELECT_CLS =
  'w-full rounded-lg border border-zinc-800 bg-zinc-950/90 px-3 py-2 text-sm text-zinc-100 transition focus:border-emerald-500/70 focus:outline-none focus:ring-2 focus:ring-emerald-500/20';

export const COMPACT_INPUT_CLS =
  'w-full rounded-lg border border-zinc-800 bg-zinc-950/80 px-2.5 py-1.5 text-xs text-zinc-100 placeholder:text-zinc-600 transition focus:border-emerald-500/70 focus:outline-none focus:ring-2 focus:ring-emerald-500/20';
