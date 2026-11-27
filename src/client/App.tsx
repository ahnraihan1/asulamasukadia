import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Shield } from 'lucide-react';
import {
  api,
  UserInfo,
  GeneratedCandidate,
  RegistrationJob,
  AccountItem,
  SupervisedChecklistPackage,
  RegistrationEventItem,
  ActivityLogItem,
  PaginatedMeta,
  AssistedSessionStatus,
  BatchRunState,
  BrowserVariant,
  ChromeExtensionInfo,
  FirefoxProfileInfo,
} from './api.js';
import {
  ActiveTab,
  BirthGender,
  STORAGE_CFG_KEY,
  ToastMessage,
  WindowSplitMode,
  loadSavedUiCfg,
} from './components/types.js';
import { LoginView } from './components/LoginView.js';
import { SidebarLayout } from './components/SidebarLayout.js';
import { GeneratorWorkspace } from './components/GeneratorWorkspace.js';
import { JobsView } from './components/JobsView.js';
import { AccountsView } from './components/AccountsView.js';
import { LogsView } from './components/LogsView.js';
import { SettingsView } from './components/SettingsView.js';
import { Modals } from './components/Modals.js';

export function App() {
  const [savedCfg] = useState<Record<string, any>>(() => loadSavedUiCfg());
  const [user, setUser] = useState<UserInfo | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [loginUsername, setLoginUsername] = useState('admin');
  const [loginPassword, setLoginPassword] = useState('Admin@RobloxEngine2026!');
  const [loginError, setLoginError] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<ActiveTab>('generator');
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Generator & Multi-Worker Configuration (persisted in localStorage)
  const [genQuantity, setGenQuantity] = useState<number>(() => Number(savedCfg.genQuantity) || 5);
  const [genPrefix, setGenPrefix] = useState<string>(() => savedCfg.genPrefix ?? 'rbx');
  const [genSuffix] = useState('');
  const [genLength, setGenLength] = useState<number>(() => Number(savedCfg.genLength) || 12);
  const [genPasswordPrefix, setGenPasswordPrefix] = useState<string>(
    () => savedCfg.genPasswordPrefix ?? 'Pass'
  );
  const [genPasswordLength, setGenPasswordLength] = useState<number>(
    () => Number(savedCfg.genPasswordLength) || 16
  );
  const [birthDay, setBirthDay] = useState<string>(() => savedCfg.birthDay ?? 'RANDOM');
  const [birthMonth, setBirthMonth] = useState<string>(() => savedCfg.birthMonth ?? 'RANDOM');
  const [birthYear, setBirthYear] = useState<string>(() => savedCfg.birthYear ?? '2001');
  const [gender, setGender] = useState<BirthGender>(() => savedCfg.gender ?? 'RANDOM');
  const [workerCount, setWorkerCount] = useState<number>(() => Number(savedCfg.workerCount) || 1);
  const [browserVariant, setBrowserVariant] = useState<BrowserVariant>(
    () => (savedCfg.browserVariant as BrowserVariant) || 'FIREFOX_MANUAL'
  );
  const [clearProfileBeforeRun, setClearProfileBeforeRun] = useState(true);
  const [firefoxProfileInfo, setFirefoxProfileInfo] = useState<FirefoxProfileInfo | null>(null);
  const [customFirefoxProfilePath, setCustomFirefoxProfilePath] = useState<string>(
    () => savedCfg.customFirefoxProfilePath ?? ''
  );
  const [useMasterWarmProfile, setUseMasterWarmProfile] = useState<boolean>(
    () => savedCfg.useMasterWarmProfile ?? true
  );
  const [syncingMasterProfile, setSyncingMasterProfile] = useState(false);
  const [chromeExtInfo, setChromeExtInfo] = useState<ChromeExtensionInfo | null>(null);
  const [syncingChromeExt, setSyncingChromeExt] = useState(false);
  const [manualBookmarkletHref, setManualBookmarkletHref] = useState('');
  const [manualUserscriptUrl, setManualUserscriptUrl] = useState('');
  const [useProxy, setUseProxy] = useState<boolean>(() => Boolean(savedCfg.useProxy));
  const [proxyText, setProxyText] = useState<string>(() => savedCfg.proxyText ?? '');
  const [proxyDataSaver, setProxyDataSaver] = useState<boolean>(
    () => savedCfg.proxyDataSaver ?? true
  );
  const [proxyBlockHeavyMedia, setProxyBlockHeavyMedia] = useState<boolean>(() =>
    savedCfg.proxyBlockHeavyMediaMigrated ? Boolean(savedCfg.proxyBlockHeavyMedia) : false
  );
  const [proxyOneAccountOneSticky, setProxyOneAccountOneSticky] = useState<boolean>(
    () => savedCfg.proxyOneAccountOneSticky ?? true
  );
  const [autoSplitWindow, setAutoSplitWindow] = useState<boolean>(
    () => savedCfg.autoSplitWindow ?? true
  );
  const [windowSplitMode, setWindowSplitMode] = useState<WindowSplitMode>(
    () => (savedCfg.windowSplitMode as WindowSplitMode) || 'AUTO'
  );
  const [workerTimeoutSeconds, setWorkerTimeoutSeconds] = useState<number>(() =>
    savedCfg.workerTimeoutSeconds !== undefined ? Number(savedCfg.workerTimeoutSeconds) : 120
  );
  const [genIncludeSymbols] = useState(true);
  const [genCreateJob] = useState(true);
  const [genJobName] = useState('');
  const [genLoading, setGenLoading] = useState(false);
  const [batchState, setBatchState] = useState<BatchRunState | null>(null);

  const [candidates, setCandidates] = useState<GeneratedCandidate[]>([]);
  const [candidatesMeta, setCandidatesMeta] = useState<PaginatedMeta>({
    total: 0,
    page: 1,
    limit: 20,
    totalPages: 1,
  });
  const [candidateSearch, setCandidateSearch] = useState('');
  const [candidateStateFilter, setCandidateStateFilter] = useState('');

  // Jobs state
  const [jobs, setJobs] = useState<RegistrationJob[]>([]);
  const [jobsMeta, setJobsMeta] = useState<PaginatedMeta>({
    total: 0,
    page: 1,
    limit: 20,
    totalPages: 1,
  });
  const [selectedJob, setSelectedJob] = useState<RegistrationJob | null>(null);

  // Supervised Registration Drawer & Modals state
  const [supervisedPkg, setSupervisedPkg] = useState<SupervisedChecklistPackage | null>(null);
  const [confirmRobloxUserId, setConfirmRobloxUserId] = useState('');
  const [confirmRobloxUsername, setConfirmRobloxUsername] = useState('');
  const [confirmCookie, setConfirmCookie] = useState('');
  const [confirmCategory, setConfirmCategory] = useState('STANDARD');
  const [confirmNotes, setConfirmNotes] = useState('');
  const [showVaultPassword, setShowVaultPassword] = useState(false);
  const [assistedSession, setAssistedSession] = useState<AssistedSessionStatus | null>(null);
  const [exportModalText, setExportModalText] = useState<string | null>(null);

  // Accounts state
  const [accounts, setAccounts] = useState<AccountItem[]>([]);
  const [accountsMeta, setAccountsMeta] = useState<PaginatedMeta>({
    total: 0,
    page: 1,
    limit: 20,
    totalPages: 1,
  });
  const [accSearch, setAccSearch] = useState('');
  const [accCategoryFilter, setAccCategoryFilter] = useState('');
  const [accRegStatusFilter, setAccRegStatusFilter] = useState('');
  const [accVerifStatusFilter, setAccVerifStatusFilter] = useState('');
  const [accSortBy, setAccSortBy] = useState<
    'created_at' | 'updated_at' | 'roblox_username' | 'category'
  >('created_at');
  const [accSortOrder, setAccSortOrder] = useState<'asc' | 'desc'>('desc');
  const [selectedAccount, setSelectedAccount] = useState<AccountItem | null>(null);
  const [showCreateAccountModal, setShowCreateAccountModal] = useState(false);
  const [newAccUsername, setNewAccUsername] = useState('');
  const [newAccUserId, setNewAccUserId] = useState('');
  const [newAccPassword, setNewAccPassword] = useState('');
  const [newAccCategory, setNewAccCategory] = useState('STANDARD');
  const [newAccNotes, setNewAccNotes] = useState('');
  const [newAccTags, setNewAccTags] = useState('manual,verified');

  // Activity Logs & Registration History state
  const [logSubTab, setLogSubTab] = useState<'activity' | 'registration'>('activity');
  const [activityLogs, setActivityLogs] = useState<ActivityLogItem[]>([]);
  const [logsMeta, setLogsMeta] = useState<PaginatedMeta>({
    total: 0,
    page: 1,
    limit: 25,
    totalPages: 1,
  });
  const [regEvents, setRegEvents] = useState<RegistrationEventItem[]>([]);
  const [regEventsMeta, setRegEventsMeta] = useState<PaginatedMeta>({
    total: 0,
    page: 1,
    limit: 25,
    totalPages: 1,
  });

  // Settings & Health state
  const [settingsData, setSettingsData] = useState<Record<string, any> | null>(null);
  const [healthData, setHealthData] = useState<Record<string, any> | null>(null);

  const showToast = useCallback((type: 'success' | 'error', text: string) => {
    setToast({ type, text });
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToast(null), 4000);
  }, []);

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    };
  }, []);

  // Check session on mount
  useEffect(() => {
    (async () => {
      try {
        const res = await api.request<{ user: UserInfo; csrfToken: string }>('/auth/me');
        setUser(res.data.user);
        api.setCsrfToken(res.data.csrfToken);
      } catch {
        setUser(null);
      } finally {
        setAuthLoading(false);
      }
    })();
  }, []);

  const loadCandidates = useCallback(
    async (page = 1) => {
      try {
        const q = new URLSearchParams({
          page: String(page),
          limit: '20',
        });
        if (candidateSearch) q.set('search', candidateSearch);
        if (candidateStateFilter) q.set('state', candidateStateFilter);
        const res = await api.request<GeneratedCandidate[]>(`/generator/candidates?${q.toString()}`);
        setCandidates(res.data);
        if (res.meta) setCandidatesMeta(res.meta);
      } catch (err) {
        showToast('error', err instanceof Error ? err.message : 'Failed to load candidates');
      }
    },
    [candidateSearch, candidateStateFilter, showToast]
  );

  const loadJobs = useCallback(
    async (page = 1) => {
      try {
        const res = await api.request<RegistrationJob[]>(`/generator/jobs?page=${page}&limit=20`);
        setJobs(res.data);
        if (res.meta) setJobsMeta(res.meta);
      } catch (err) {
        showToast('error', err instanceof Error ? err.message : 'Failed to load jobs');
      }
    },
    [showToast]
  );

  const loadAccounts = useCallback(
    async (page = 1) => {
      try {
        const q = new URLSearchParams({
          page: String(page),
          limit: '20',
          sortBy: accSortBy,
          sortOrder: accSortOrder,
        });
        if (accSearch) q.set('search', accSearch);
        if (accCategoryFilter) q.set('category', accCategoryFilter);
        if (accRegStatusFilter) q.set('registrationStatus', accRegStatusFilter);
        if (accVerifStatusFilter) q.set('verificationStatus', accVerifStatusFilter);

        const res = await api.request<AccountItem[]>(`/accounts?${q.toString()}`);
        setAccounts(res.data);
        if (res.meta) setAccountsMeta(res.meta);
      } catch (err) {
        showToast('error', err instanceof Error ? err.message : 'Failed to load accounts');
      }
    },
    [
      accSearch,
      accCategoryFilter,
      accRegStatusFilter,
      accVerifStatusFilter,
      accSortBy,
      accSortOrder,
      showToast,
    ]
  );

  const loadLogsAndHistory = useCallback(
    async (page = 1) => {
      try {
        if (logSubTab === 'activity') {
          const res = await api.request<ActivityLogItem[]>(`/logs?page=${page}&limit=25`);
          setActivityLogs(res.data);
          if (res.meta) setLogsMeta(res.meta);
        } else {
          const res = await api.request<RegistrationEventItem[]>(
            `/registration/history?page=${page}&limit=25`
          );
          setRegEvents(res.data);
          if (res.meta) setRegEventsMeta(res.meta);
        }
      } catch (err) {
        showToast('error', err instanceof Error ? err.message : 'Failed to load logs');
      }
    },
    [logSubTab, showToast]
  );

  const loadSettingsAndHealth = useCallback(async () => {
    try {
      const [sRes, hRes] = await Promise.all([
        api.request<Record<string, any>>('/settings'),
        api.request<Record<string, any>>('/system/health'),
      ]);
      setSettingsData(sRes.data);
      setHealthData(hRes.data);
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Failed to load settings');
    }
  }, [showToast]);

  const loadFirefoxProfileInfo = useCallback(async () => {
    try {
      const [res, bmRes, proxyRes, chrRes] = await Promise.all([
        api.request<FirefoxProfileInfo>('/registration/firefox-profile-info'),
        api.request<{ bookmarkletHref: string; userscriptUrl?: string }>(
          '/registration/manual-bookmarklet'
        ),
        api
          .request<{ configured: boolean; useProxy: boolean; proxyText: string }>(
            '/registration/proxy-config'
          )
          .catch(() => null),
        api.request<ChromeExtensionInfo>('/registration/chrome-extension-info').catch(() => null),
      ]);
      if (chrRes?.data) {
        setChromeExtInfo(chrRes.data);
      }
      setFirefoxProfileInfo(res.data);
      const selectedMeta = res.data.profiles.find((p) => p.path === customFirefoxProfilePath);
      if (
        res.data.mainProfileDir &&
        (!customFirefoxProfilePath || (selectedMeta && selectedMeta.hasData === false))
      ) {
        setCustomFirefoxProfilePath(res.data.mainProfileDir);
      }
      if (bmRes.data?.bookmarkletHref) {
        setManualBookmarkletHref(bmRes.data.bookmarkletHref);
      }
      if (bmRes.data?.userscriptUrl) {
        setManualUserscriptUrl(bmRes.data.userscriptUrl);
      }
      if (proxyRes?.data?.configured) {
        setUseProxy(proxyRes.data.useProxy);
        setProxyText(proxyRes.data.proxyText);
      }
    } catch {
      // ignore
    }
  }, [customFirefoxProfilePath]);

  useEffect(() => {
    try {
      window.localStorage.setItem(
        STORAGE_CFG_KEY,
        JSON.stringify({
          genQuantity,
          genPrefix,
          genLength,
          genPasswordPrefix,
          genPasswordLength,
          birthDay,
          birthMonth,
          birthYear,
          gender,
          workerCount,
          browserVariant,
          customFirefoxProfilePath,
          useMasterWarmProfile,
          useProxy,
          proxyText,
          proxyDataSaver,
          proxyBlockHeavyMedia,
          proxyBlockHeavyMediaMigrated: true,
          proxyOneAccountOneSticky,
          autoSplitWindow,
          windowSplitMode,
          workerTimeoutSeconds,
        })
      );
    } catch {
      // ignore storage quota errors
    }
  }, [
    genQuantity,
    genPrefix,
    genLength,
    genPasswordPrefix,
    genPasswordLength,
    birthDay,
    birthMonth,
    birthYear,
    gender,
    workerCount,
    browserVariant,
    customFirefoxProfilePath,
    useMasterWarmProfile,
    useProxy,
    proxyText,
    proxyDataSaver,
    proxyBlockHeavyMedia,
    proxyOneAccountOneSticky,
    autoSplitWindow,
    windowSplitMode,
    workerTimeoutSeconds,
  ]);

  useEffect(() => {
    if (!user) return;
    if (activeTab === 'generator') {
      void loadCandidates(1);
      void loadFirefoxProfileInfo();
    }
    if (activeTab === 'jobs') void loadJobs(1);
    if (activeTab === 'accounts') void loadAccounts(1);
    if (activeTab === 'logs') void loadLogsAndHistory(1);
    if (activeTab === 'settings') void loadSettingsAndHealth();
  }, [
    user,
    activeTab,
    loadCandidates,
    loadJobs,
    loadAccounts,
    loadLogsAndHistory,
    loadSettingsAndHealth,
    loadFirefoxProfileInfo,
  ]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError(null);
    try {
      const res = await api.request<{ user: UserInfo; csrfToken: string }>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ username: loginUsername, password: loginPassword }),
      });
      setUser(res.data.user);
      api.setCsrfToken(res.data.csrfToken);
      showToast('success', `Authenticated as ${res.data.user.username} (${res.data.user.role})`);
    } catch (err) {
      setLoginError(err instanceof Error ? err.message : 'Login failed');
    }
  };

  const handleLogout = async () => {
    try {
      await api.request('/auth/logout', { method: 'POST' });
    } finally {
      setUser(null);
      api.setCsrfToken(null);
    }
  };

  const handleGenerateCandidatesOnly = async () => {
    setGenLoading(true);
    try {
      const res = await api.request<{
        job: RegistrationJob | null;
        candidates: GeneratedCandidate[];
        totalGenerated: number;
      }>('/generator/generate', {
        method: 'POST',
        body: JSON.stringify({
          quantity: genQuantity,
          prefix: genPrefix,
          suffix: genSuffix,
          length: genLength,
          passwordPrefix: genPasswordPrefix,
          passwordLength: genPasswordLength,
          includeSymbols: genIncludeSymbols,
          createPreparationJob: genCreateJob,
          jobName: genJobName || undefined,
        }),
      });
      showToast(
        'success',
        `Generated ${res.data.totalGenerated} unique candidate(s)${
          res.data.job ? ` in job ${res.data.job.name}` : ''
        }`
      );
      await loadCandidates(1);
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Generation failed');
    } finally {
      setGenLoading(false);
    }
  };

  const handleSyncChromeExtensions = async () => {
    setSyncingChromeExt(true);
    try {
      const res = await api.request<{ syncedWorkers: number; info: ChromeExtensionInfo }>(
        '/registration/chrome-extension-sync',
        {
          method: 'POST',
          body: JSON.stringify({ workerCount }),
        }
      );
      setChromeExtInfo(res.data.info);
      showToast(
        'success',
        `Berhasil menyinkronkan ${res.data.info.extensions.length} ekstensi Chrome ke ${res.data.syncedWorkers} profil worker!`
      );
    } catch (err) {
      showToast(
        'error',
        err instanceof Error ? err.message : 'Gagal menyinkronkan ekstensi Chrome'
      );
    } finally {
      setSyncingChromeExt(false);
    }
  };

  const handleSyncMasterFirefoxProfile = async () => {
    setSyncingMasterProfile(true);
    try {
      const res = await api.request<{
        exists: boolean;
        nonRobloxPlacesCount: number;
        nonRobloxCookiesCount: number;
        extensionCount: number;
        lastSanitizedRemoved?: { cookies: number; storage: number; history: number };
      }>('/registration/master-profile/sync', {
        method: 'POST',
        body: JSON.stringify({
          sourceProfilePath: customFirefoxProfilePath.trim() || undefined,
        }),
      });
      await loadFirefoxProfileInfo();
      const rem = res.data.lastSanitizedRemoved;
      showToast(
        'success',
        `Master Warm Profile siap (${res.data.nonRobloxPlacesCount} history web lain, ${res.data.nonRobloxCookiesCount} cookie non-Roblox, ${res.data.extensionCount} ekstensi). Dibersihkan: ${rem?.cookies ?? 0} cookie, ${rem?.history ?? 0} history, ${rem?.storage ?? 0} storage Roblox.`
      );
    } catch (err) {
      showToast(
        'error',
        err instanceof Error ? err.message : 'Gagal membuat Master Profile'
      );
    } finally {
      setSyncingMasterProfile(false);
    }
  };

  const handleResetWorkerProfiles = async () => {
    try {
      const r = await api.request<{ clearedFolders: number }>('/registration/reset-profiles', {
        method: 'POST',
      });
      showToast(
        'success',
        `Berhasil membersihkan ${r.data.clearedFolders} folder profil worker sementara!`
      );
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Gagal reset profil');
    }
  };

  const handleExpandStickyPorts = () => {
    const firstLine = proxyText
      .split(/\r?\n/)
      .map((l) => l.trim())
      .find(Boolean);
    if (!firstLine) {
      showToast('error', 'Tempel 1 baris proxy atau perintah curl -x terlebih dahulu.');
      return;
    }
    const curlM = firstLine.match(/^curl\b.*?(?:-x|--proxy)\s+(?:["']([^"']+)["']|(\S+))/i);
    const clean = (curlM ? curlM[1] || curlM[2] || '' : firstLine)
      .replace(/^["']|["']$/g, '')
      .trim();
    const m = clean.match(/^(.*?:)(\d{2,5})$/);
    if (!m) {
      setProxyText(clean);
      showToast('success', 'Perintah curl -x dibersihkan menjadi URL proxy.');
      return;
    }
    const basePort = Number(m[2]);
    const lines = Array.from({ length: 20 }, (_, i) => `${m[1]}${basePort + i}`);
    const nextText = lines.join('\n');
    setProxyText(nextText);
    void api
      .request('/registration/proxy-config', {
        method: 'POST',
        body: JSON.stringify({ useProxy: true, proxyText: nextText }),
      })
      .catch(() => {});
    showToast(
      'success',
      `Berhasil ekspansi 20 port sticky (${basePort}–${basePort + 19}) & disimpan!`
    );
  };

  const handleSaveProxyConfig = async () => {
    try {
      await api.request('/registration/proxy-config', {
        method: 'POST',
        body: JSON.stringify({ useProxy, proxyText }),
      });
      showToast('success', 'Daftar proxy terenkripsi berhasil disimpan ke database!');
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Gagal menyimpan proxy');
    }
  };

  const handleStartBatchWorkers = async (e: React.FormEvent) => {
    e.preventDefault();
    setGenLoading(true);
    try {
      const proxyList = proxyText
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);

      void api
        .request('/registration/proxy-config', {
          method: 'POST',
          body: JSON.stringify({ useProxy, proxyText }),
        })
        .catch(() => {});

      const res = await api.request<BatchRunState>('/registration/batch-start', {
        method: 'POST',
        body: JSON.stringify({
          usernamePrefix: genPrefix,
          usernameLength: genLength,
          passwordPrefix: genPasswordPrefix,
          passwordLength: genPasswordLength,
          birthDay,
          birthMonth,
          birthYear,
          gender,
          quantity: genQuantity,
          workerCount,
          browserVariant,
          clearProfileBeforeRun:
            browserVariant === 'FIREFOX_MAIN' ? false : clearProfileBeforeRun,
          customFirefoxProfilePath:
            (browserVariant === 'FIREFOX_MAIN' || browserVariant === 'FIREFOX_MANUAL') &&
            customFirefoxProfilePath.trim()
              ? customFirefoxProfilePath.trim()
              : undefined,
          useMasterWarmProfile,
          useProxy,
          proxyList,
          proxyDataSaver,
          proxyBlockHeavyMedia,
          proxyOneAccountOneSticky,
          autoSplitWindow,
          windowSplitMode,
          workerTimeoutSeconds,
        }),
      });
      setBatchState(res.data);
      showToast(
        'success',
        `Memulai ${res.data.activeWorkerCount} Worker (${browserVariant}) untuk ${res.data.totalTarget} akun!`
      );
      await loadCandidates(1);
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Gagal memulai Worker');
    } finally {
      setGenLoading(false);
    }
  };

  const handleStopBatchWorkers = async () => {
    try {
      const res = await api.request<BatchRunState>('/registration/batch-stop', {
        method: 'POST',
      });
      setBatchState(res.data);
      showToast('success', 'Seluruh Worker dihentikan.');
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Gagal menghentikan worker');
    }
  };

  // Poll multi-worker batch status
  useEffect(() => {
    if (!user) return;
    let active = true;

    const fetchBatch = async () => {
      try {
        const res = await api.request<BatchRunState>('/registration/batch-status');
        if (active && res.data) {
          setBatchState(res.data);
        }
      } catch {
        // ignore
      }
    };

    void fetchBatch();
    const timer = setInterval(() => {
      void fetchBatch();
    }, 1500);

    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [user]);

  const handleRegenerateCandidate = async (id: string) => {
    try {
      await api.request(`/generator/candidates/${id}/regenerate`, { method: 'POST' });
      showToast('success', 'Candidate username and vault password regenerated');
      await loadCandidates(candidatesMeta.page);
      if (selectedJob) {
        const j = await api.request<RegistrationJob>(`/generator/jobs/${selectedJob.id}`);
        setSelectedJob(j.data);
      }
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Regeneration failed');
    }
  };

  const handleInspectJob = async (jobId: string) => {
    try {
      const res = await api.request<RegistrationJob>(`/generator/jobs/${jobId}`);
      setSelectedJob(res.data);
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Failed to inspect job');
    }
  };

  const handleJobAction = async (jobId: string, action: 'pause' | 'resume' | 'cancel') => {
    try {
      const res = await api.request<RegistrationJob>(`/generator/jobs/${jobId}/${action}`, {
        method: 'POST',
      });
      showToast('success', `Job ${action}d (${res.data.status})`);
      await loadJobs(jobsMeta.page);
      if (selectedJob?.id === jobId) {
        setSelectedJob(res.data);
      }
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : `Failed to ${action} job`);
    }
  };

  const openSupervisedWorkflow = async (candidateId: string) => {
    try {
      const [res, statusRes] = await Promise.all([
        api.request<SupervisedChecklistPackage>(`/registration/${candidateId}/checklist`),
        api.request<AssistedSessionStatus | null>(`/registration/${candidateId}/assist-status`),
      ]);
      setSupervisedPkg(res.data);
      setAssistedSession(statusRes.data);
      setConfirmRobloxUsername(res.data.candidateUsername);
      setConfirmRobloxUserId('');
      setConfirmCookie('');
      setConfirmNotes('');
      setShowVaultPassword(false);
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Failed to load checklist');
    }
  };

  const handleStartAssistedBrowser = async (candidateId: string) => {
    try {
      await openSupervisedWorkflow(candidateId);
      const res = await api.request<AssistedSessionStatus>(
        `/registration/${candidateId}/assist-browser`,
        { method: 'POST' }
      );
      setAssistedSession(res.data);
      showToast('success', 'Membuka browser & mengisi formulir CreateAccount secara otomatis...');
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Failed to start browser assist');
    }
  };

  // Poll assisted browser session while active
  useEffect(() => {
    if (!assistedSession) return;
    if (
      assistedSession.status !== 'LAUNCHING' &&
      assistedSession.status !== 'FORM_FILLED_WAITING_HUMAN' &&
      assistedSession.status !== 'CAPTURED_SAVING'
    ) {
      return;
    }

    const timer = setInterval(async () => {
      try {
        const res = await api.request<AssistedSessionStatus | null>(
          `/registration/${assistedSession.candidateId}/assist-status`
        );
        if (res.data) {
          setAssistedSession(res.data);
          if (res.data.status === 'COMPLETED') {
            showToast(
              'success',
              `Terdaftar! Format tersimpan: ${res.data.robloxUsername}:password:cookie`
            );
            void loadCandidates(candidatesMeta.page);
            void loadJobs(jobsMeta.page);
            void loadAccounts(accountsMeta.page);
          }
        }
      } catch {
        // ignore polling error
      }
    }, 1500);

    return () => clearInterval(timer);
  }, [
    assistedSession,
    candidatesMeta.page,
    jobsMeta.page,
    accountsMeta.page,
    loadCandidates,
    loadJobs,
    loadAccounts,
    showToast,
  ]);

  const handleCopyAccountFormatted = async (accountId: string) => {
    try {
      const res = await api.request<{ formatted: string }>(
        `/accounts/${accountId}/formatted-credential`
      );
      await navigator.clipboard.writeText(res.data.formatted);
      showToast('success', 'Copied username:password:cookie to clipboard!');
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Failed to copy credential');
    }
  };

  const handleExportAllFormatted = async () => {
    try {
      const res = await api.request<{ count: number; text: string }>('/accounts/export-formatted');
      setExportModalText(res.data.text || 'Belum ada akun terdaftar.');
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Failed to export accounts');
    }
  };

  const handleConfirmRegistration = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supervisedPkg) return;
    try {
      const res = await api.request<{ formattedCredential?: string }>(
        `/registration/${supervisedPkg.candidateId}/confirm`,
        {
          method: 'POST',
          body: JSON.stringify({
            robloxUserId: confirmRobloxUserId,
            robloxUsername: confirmRobloxUsername,
            cookie: confirmCookie || null,
            category: confirmCategory,
            verificationStatus: 'VERIFIED',
            notes: confirmNotes || 'Confirmed via Human-Supervised Registration Workflow',
          }),
        }
      );
      showToast(
        'success',
        `Account ${confirmRobloxUsername} confirmed & saved (username:password:cookie)!`
      );
      if (res.data.formattedCredential) {
        setExportModalText(res.data.formattedCredential);
      }
      setSupervisedPkg(null);
      await loadCandidates(candidatesMeta.page);
      await loadJobs(jobsMeta.page);
      if (selectedJob) {
        const j = await api.request<RegistrationJob>(`/generator/jobs/${selectedJob.id}`);
        setSelectedJob(j.data);
      }
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Confirmation failed');
    }
  };

  const handleMarkVerificationRequired = async () => {
    if (!supervisedPkg) return;
    try {
      await api.request(`/registration/${supervisedPkg.candidateId}/mark-verification-required`, {
        method: 'POST',
        body: JSON.stringify({
          notes: confirmNotes || 'Additional human verification required on Roblox.com',
        }),
      });
      showToast('success', 'Candidate marked as Verification Required');
      setSupervisedPkg(null);
      await loadCandidates(candidatesMeta.page);
      await loadJobs(jobsMeta.page);
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Failed to update status');
    }
  };

  const handleCreateManualAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const tags = newAccTags
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean);
      await api.request('/accounts', {
        method: 'POST',
        body: JSON.stringify({
          robloxUsername: newAccUsername,
          robloxUserId: newAccUserId || null,
          password: newAccPassword || null,
          category: newAccCategory,
          registrationStatus: 'REGISTERED',
          verificationStatus: 'VERIFIED',
          notes: newAccNotes || null,
          tags,
        }),
      });
      showToast('success', `Account ${newAccUsername} created`);
      setShowCreateAccountModal(false);
      setNewAccUsername('');
      setNewAccUserId('');
      setNewAccPassword('');
      setNewAccNotes('');
      await loadAccounts(1);
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Failed to create account');
    }
  };

  const handleUpdateAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAccount) return;
    try {
      await api.request(`/accounts/${selectedAccount.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          category: selectedAccount.category,
          registrationStatus: selectedAccount.registrationStatus,
          verificationStatus: selectedAccount.verificationStatus,
          notes: selectedAccount.notes,
          tags: selectedAccount.tags,
        }),
      });
      showToast('success', `Account ${selectedAccount.robloxUsername} updated`);
      setSelectedAccount(null);
      await loadAccounts(accountsMeta.page);
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Failed to update account');
    }
  };

  const handleDeleteAccount = async (id: string) => {
    try {
      await api.request(`/accounts/${id}`, { method: 'DELETE' });
      showToast('success', 'Account soft-deleted');
      if (selectedAccount?.id === id) setSelectedAccount(null);
      await loadAccounts(accountsMeta.page);
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Delete failed');
    }
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!settingsData) return;
    try {
      const res = await api.request<Record<string, any>>('/settings', {
        method: 'PATCH',
        body: JSON.stringify({ generator: settingsData.generator }),
      });
      setSettingsData(res.data);
      showToast('success', 'Generator settings persisted');
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Failed to save settings');
    }
  };

  if (authLoading) {
    return (
      <div className="min-h-screen bg-zinc-950 text-zinc-300 flex flex-col items-center justify-center gap-3 font-mono text-xs rage-grid-bg">
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-emerald-500/30 bg-emerald-500/10 text-emerald-400">
          <Shield className="h-5 w-5 animate-pulse" />
        </div>
        <span>INITIALIZING RAGE CORE ENGINE...</span>
      </div>
    );
  }

  if (!user) {
    return (
      <LoginView
        loginUsername={loginUsername}
        setLoginUsername={setLoginUsername}
        loginPassword={loginPassword}
        setLoginPassword={setLoginPassword}
        loginError={loginError}
        onSubmit={handleLogin}
      />
    );
  }

  return (
    <SidebarLayout
      user={user}
      activeTab={activeTab}
      setActiveTab={setActiveTab}
      batchState={batchState}
      jobsTotal={jobsMeta.total}
      accountsTotal={accountsMeta.total}
      toast={toast}
      onDismissToast={() => setToast(null)}
      onExportAll={() => void handleExportAllFormatted()}
      onLogout={() => void handleLogout()}
    >
      {activeTab === 'generator' && (
        <GeneratorWorkspace
          genPrefix={genPrefix}
          setGenPrefix={setGenPrefix}
          genLength={genLength}
          setGenLength={setGenLength}
          genPasswordPrefix={genPasswordPrefix}
          setGenPasswordPrefix={setGenPasswordPrefix}
          genPasswordLength={genPasswordLength}
          setGenPasswordLength={setGenPasswordLength}
          birthDay={birthDay}
          setBirthDay={setBirthDay}
          birthMonth={birthMonth}
          setBirthMonth={setBirthMonth}
          birthYear={birthYear}
          setBirthYear={setBirthYear}
          gender={gender}
          setGender={setGender}
          genQuantity={genQuantity}
          setGenQuantity={setGenQuantity}
          workerCount={workerCount}
          setWorkerCount={setWorkerCount}
          browserVariant={browserVariant}
          setBrowserVariant={setBrowserVariant}
          clearProfileBeforeRun={clearProfileBeforeRun}
          setClearProfileBeforeRun={setClearProfileBeforeRun}
          autoSplitWindow={autoSplitWindow}
          setAutoSplitWindow={setAutoSplitWindow}
          windowSplitMode={windowSplitMode}
          setWindowSplitMode={setWindowSplitMode}
          workerTimeoutSeconds={workerTimeoutSeconds}
          setWorkerTimeoutSeconds={setWorkerTimeoutSeconds}
          firefoxProfileInfo={firefoxProfileInfo}
          customFirefoxProfilePath={customFirefoxProfilePath}
          setCustomFirefoxProfilePath={setCustomFirefoxProfilePath}
          useMasterWarmProfile={useMasterWarmProfile}
          setUseMasterWarmProfile={setUseMasterWarmProfile}
          syncingMasterProfile={syncingMasterProfile}
          onSyncMasterProfile={() => void handleSyncMasterFirefoxProfile()}
          chromeExtInfo={chromeExtInfo}
          syncingChromeExt={syncingChromeExt}
          onSyncChromeExtensions={() => void handleSyncChromeExtensions()}
          onResetWorkerProfiles={() => void handleResetWorkerProfiles()}
          manualBookmarkletHref={manualBookmarkletHref}
          manualUserscriptUrl={manualUserscriptUrl}
          useProxy={useProxy}
          setUseProxy={setUseProxy}
          proxyText={proxyText}
          setProxyText={setProxyText}
          proxyDataSaver={proxyDataSaver}
          setProxyDataSaver={setProxyDataSaver}
          proxyBlockHeavyMedia={proxyBlockHeavyMedia}
          setProxyBlockHeavyMedia={setProxyBlockHeavyMedia}
          proxyOneAccountOneSticky={proxyOneAccountOneSticky}
          setProxyOneAccountOneSticky={setProxyOneAccountOneSticky}
          onExpandStickyPorts={handleExpandStickyPorts}
          onSaveProxyConfig={() => void handleSaveProxyConfig()}
          genLoading={genLoading}
          batchState={batchState}
          onStartBatchWorkers={handleStartBatchWorkers}
          onStopBatchWorkers={() => void handleStopBatchWorkers()}
          onGenerateCandidatesOnly={() => void handleGenerateCandidatesOnly()}
          onExportAllFormatted={() => void handleExportAllFormatted()}
          candidates={candidates}
          candidatesMeta={candidatesMeta}
          candidateSearch={candidateSearch}
          setCandidateSearch={setCandidateSearch}
          candidateStateFilter={candidateStateFilter}
          setCandidateStateFilter={setCandidateStateFilter}
          onLoadCandidates={(p) => void loadCandidates(p)}
          onRegenerateCandidate={(id) => void handleRegenerateCandidate(id)}
          onStartAssistedBrowser={(id) => void handleStartAssistedBrowser(id)}
          onOpenSupervisedWorkflow={(id) => void openSupervisedWorkflow(id)}
          onNotify={showToast}
        />
      )}

      {activeTab === 'jobs' && (
        <JobsView
          jobs={jobs}
          jobsMeta={jobsMeta}
          selectedJob={selectedJob}
          onLoadJobs={(p) => void loadJobs(p)}
          onInspectJob={(id) => void handleInspectJob(id)}
          onJobAction={(id, action) => void handleJobAction(id, action)}
          onCloseSelectedJob={() => setSelectedJob(null)}
          onOpenSupervisedWorkflow={(id) => void openSupervisedWorkflow(id)}
        />
      )}

      {activeTab === 'accounts' && (
        <AccountsView
          user={user}
          accounts={accounts}
          accountsMeta={accountsMeta}
          accSearch={accSearch}
          setAccSearch={setAccSearch}
          accCategoryFilter={accCategoryFilter}
          setAccCategoryFilter={setAccCategoryFilter}
          accRegStatusFilter={accRegStatusFilter}
          setAccRegStatusFilter={setAccRegStatusFilter}
          accVerifStatusFilter={accVerifStatusFilter}
          setAccVerifStatusFilter={setAccVerifStatusFilter}
          accSortBy={accSortBy}
          setAccSortBy={setAccSortBy}
          accSortOrder={accSortOrder}
          onToggleSortOrder={() => setAccSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'))}
          onLoadAccounts={(p) => void loadAccounts(p)}
          onExportAllFormatted={() => void handleExportAllFormatted()}
          onOpenCreateModal={() => setShowCreateAccountModal(true)}
          onCopyAccountFormatted={(id) => void handleCopyAccountFormatted(id)}
          onSelectAccount={(acc) => setSelectedAccount(acc)}
          onDeleteAccount={(id) => void handleDeleteAccount(id)}
        />
      )}

      {activeTab === 'logs' && (
        <LogsView
          logSubTab={logSubTab}
          setLogSubTab={setLogSubTab}
          activityLogs={activityLogs}
          logsMeta={logsMeta}
          regEvents={regEvents}
          regEventsMeta={regEventsMeta}
          onLoadLogsAndHistory={(p) => void loadLogsAndHistory(p)}
        />
      )}

      {activeTab === 'settings' && (
        <SettingsView
          settingsData={settingsData}
          setSettingsData={setSettingsData}
          healthData={healthData}
          onSaveSettings={handleSaveSettings}
        />
      )}

      <Modals
        supervisedPkg={supervisedPkg}
        onCloseSupervised={() => setSupervisedPkg(null)}
        assistedSession={assistedSession}
        showVaultPassword={showVaultPassword}
        onToggleVaultPassword={() => setShowVaultPassword((prev) => !prev)}
        onStartAssistedBrowser={(id) => void handleStartAssistedBrowser(id)}
        confirmRobloxUserId={confirmRobloxUserId}
        setConfirmRobloxUserId={setConfirmRobloxUserId}
        confirmRobloxUsername={confirmRobloxUsername}
        setConfirmRobloxUsername={setConfirmRobloxUsername}
        confirmCookie={confirmCookie}
        setConfirmCookie={setConfirmCookie}
        confirmCategory={confirmCategory}
        setConfirmCategory={setConfirmCategory}
        confirmNotes={confirmNotes}
        setConfirmNotes={setConfirmNotes}
        onConfirmRegistration={handleConfirmRegistration}
        onMarkVerificationRequired={() => void handleMarkVerificationRequired()}
        showCreateAccountModal={showCreateAccountModal}
        onCloseCreateAccount={() => setShowCreateAccountModal(false)}
        newAccUsername={newAccUsername}
        setNewAccUsername={setNewAccUsername}
        newAccUserId={newAccUserId}
        setNewAccUserId={setNewAccUserId}
        newAccPassword={newAccPassword}
        setNewAccPassword={setNewAccPassword}
        newAccCategory={newAccCategory}
        setNewAccCategory={setNewAccCategory}
        newAccNotes={newAccNotes}
        setNewAccNotes={setNewAccNotes}
        newAccTags={newAccTags}
        setNewAccTags={setNewAccTags}
        onCreateManualAccount={handleCreateManualAccount}
        selectedAccount={selectedAccount}
        setSelectedAccount={setSelectedAccount}
        onUpdateAccount={handleUpdateAccount}
        exportModalText={exportModalText}
        onCloseExportModal={() => setExportModalText(null)}
        onNotify={showToast}
      />
    </SidebarLayout>
  );
}
