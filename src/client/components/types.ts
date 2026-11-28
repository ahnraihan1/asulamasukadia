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
export const STORAGE_THEME_KEY = 'rage_aax_theme_v1';
export type AaxThemeMode = 'dark' | 'light';

export function useAaxTheme(): {
  themeMode: AaxThemeMode;
  toggleThemeMode: () => void;
  setThemeMode: (mode: AaxThemeMode) => void;
} {
  const [themeMode, setThemeModeState] = useState<AaxThemeMode>(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_THEME_KEY);
      return saved === 'light' ? 'light' : 'dark';
    } catch {
      return 'dark';
    }
  });

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_THEME_KEY, themeMode);
    } catch {
      // ignore
    }
    if (typeof document !== 'undefined') {
      document.body.classList.add('aax-theme');
      document.body.classList.toggle('aax-dark', themeMode === 'dark');
      document.body.classList.toggle('aax-light', themeMode === 'light');
      document.documentElement.style.colorScheme = themeMode;
    }
  }, [themeMode]);

  const toggleThemeMode = () => {
    setThemeModeState((prev) => (prev === 'dark' ? 'light' : 'dark'));
  };

  return {
    themeMode,
    toggleThemeMode,
    setThemeMode: setThemeModeState,
  };
}

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
    ? batchState.paused && batchState.pausedAt
      ? Math.max(startMs, Date.parse(batchState.pausedAt))
      : Math.max(startMs, nowMs)
    : batchState.updatedAt
      ? Math.max(startMs, Date.parse(batchState.updatedAt))
      : startMs;

  const pausedOffsetMs = Math.max(0, Number(batchState.accumulatedPauseMs) || 0);
  const elapsedSeconds = Number.isFinite(startMs)
    ? Math.max(0, Math.floor(Math.max(0, endMs - startMs - pausedOffsetMs) / 1000))
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
      return 'border-2 border-[var(--border-ink)] bg-[var(--green-tint)] text-[var(--green-ink)] font-extrabold shadow-[2px_2px_0_var(--outline)]';
    case 'PROCESSING':
    case 'OPENING_BROWSER':
    case 'CAPTURED_SAVING':
    case 'LAUNCHING':
      return 'border-2 border-[var(--border-ink)] bg-[var(--sky-tint)] text-[var(--sky-2)] font-extrabold shadow-[2px_2px_0_var(--outline)]';
    case 'VERIFICATION_REQUIRED':
    case 'PENDING_CONFIRMATION':
    case 'PENDING':
    case 'PAUSED':
    case 'SAVING':
      return 'border-2 border-[var(--border-ink)] bg-[var(--gold-tint)] text-[var(--gold-ink)] font-extrabold shadow-[2px_2px_0_var(--outline)]';
    case 'FAILED':
    case 'INVALID':
    case 'ERROR':
    case 'SUSPENDED':
    case 'CANCELED':
      return 'border-2 border-[var(--border-ink)] bg-[var(--red-tint)] text-[var(--red-ink)] font-extrabold shadow-[2px_2px_0_var(--outline)]';
    default:
      return 'border-2 border-[var(--border-ink)] bg-[var(--well)] text-[var(--ink-2)] font-extrabold shadow-[2px_2px_0_var(--outline)]';
  }
}

export const INPUT_CLS =
  'w-full rounded-xl border-[2.5px] border-[var(--border-ink)] bg-[var(--well)] px-3 py-2 text-sm font-bold text-[var(--ink)] placeholder:text-[var(--muted)] transition focus:border-[#38bdf8] focus:outline-none';

export const SELECT_CLS =
  'w-full rounded-xl border-[2.5px] border-[var(--border-ink)] bg-[var(--well)] px-3 py-2 text-sm font-bold text-[var(--ink)] transition focus:border-[#38bdf8] focus:outline-none';

export const COMPACT_INPUT_CLS =
  'w-full rounded-xl border-[2.5px] border-[var(--border-ink)] bg-[var(--well)] px-2.5 py-1.5 text-xs font-bold text-[var(--ink)] placeholder:text-[var(--muted)] transition focus:border-[#38bdf8] focus:outline-none';

export type ExportFormatPreset =
  | 'USER_PASS_COOKIE'
  | 'USER_PASS'
  | 'COOKIE_ONLY'
  | 'USER_ONLY'
  | 'CUSTOM';

export interface ParsedCredentialLine {
  username: string;
  password: string;
  cookie: string;
  raw: string;
}

export function parseCredentialLine(line: string): ParsedCredentialLine | null {
  const trimmed = line.trim();
  if (
    !trimmed ||
    trimmed === 'Belum ada akun terdaftar.' ||
    trimmed === 'Tidak ada akun terpilih.'
  ) {
    return null;
  }
  const idx1 = trimmed.indexOf(':');
  if (idx1 === -1) {
    return { username: trimmed, password: '', cookie: '', raw: trimmed };
  }
  const idx2 = trimmed.indexOf(':', idx1 + 1);
  if (idx2 === -1) {
    return {
      username: trimmed.slice(0, idx1),
      password: trimmed.slice(idx1 + 1),
      cookie: '',
      raw: trimmed,
    };
  }
  return {
    username: trimmed.slice(0, idx1),
    password: trimmed.slice(idx1 + 1, idx2),
    cookie: trimmed.slice(idx2 + 1),
    raw: trimmed,
  };
}

export function formatCredentialLines(
  rawText: string,
  preset: ExportFormatPreset = 'USER_PASS_COOKIE',
  customTemplate = '{user}:{pass}:{cookie}'
): { formattedText: string; parsedRows: ParsedCredentialLine[] } {
  const parsedRows = rawText
    .split(/\r?\n/)
    .map((l) => parseCredentialLine(l))
    .filter((r): r is ParsedCredentialLine => r !== null);

  if (parsedRows.length === 0) {
    return { formattedText: rawText, parsedRows: [] };
  }

  const tpl = customTemplate.trim() || '{user}:{pass}:{cookie}';
  const formattedLines = parsedRows.map((r) => {
    switch (preset) {
      case 'USER_PASS':
        return `${r.username}:${r.password}`;
      case 'COOKIE_ONLY':
        return r.cookie || r.raw;
      case 'USER_ONLY':
        return r.username;
      case 'CUSTOM':
        return tpl
          .replace(/\{(user|username)\}/gi, r.username)
          .replace(/\{(pass|password)\}/gi, r.password)
          .replace(/\{cookie\}/gi, r.cookie);
      case 'USER_PASS_COOKIE':
      default:
        return `${r.username}:${r.password}:${r.cookie}`;
    }
  });

  return {
    formattedText: formattedLines.join('\n'),
    parsedRows,
  };
}

function escapeCsvCell(val: string): string {
  return `"${String(val ?? '').replace(/"/g, '""')}"`;
}

export function downloadExportFile(
  rawText: string,
  ext: 'txt' | 'csv' | 'json',
  preset: ExportFormatPreset = 'USER_PASS_COOKIE',
  customTemplate = '{user}:{pass}:{cookie}'
): number {
  const { formattedText, parsedRows } = formatCredentialLines(rawText, preset, customTemplate);
  if (parsedRows.length === 0) return 0;

  let content = formattedText;
  let mimeType = 'text/plain;charset=utf-8';

  if (ext === 'csv') {
    mimeType = 'text/csv;charset=utf-8';
    const formattedLines = formattedText.split('\n');
    const csvRows = [
      '"username","password","cookie","formatted"',
      ...parsedRows.map((r, i) =>
        [
          escapeCsvCell(r.username),
          escapeCsvCell(r.password),
          escapeCsvCell(r.cookie),
          escapeCsvCell(formattedLines[i] ?? r.raw),
        ].join(',')
      ),
    ];
    content = csvRows.join('\r\n');
  } else if (ext === 'json') {
    mimeType = 'application/json;charset=utf-8';
    const formattedLines = formattedText.split('\n');
    content = JSON.stringify(
      parsedRows.map((r, i) => ({
        username: r.username,
        password: r.password,
        cookie: r.cookie,
        formatted: formattedLines[i] ?? r.raw,
      })),
      null,
      2
    );
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const filename = `rage_accounts_${parsedRows.length}_${stamp}.${ext}`;
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return parsedRows.length;
}
