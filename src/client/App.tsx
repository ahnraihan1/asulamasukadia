import React, { useState, useEffect, useCallback } from 'react';
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

type ActiveTab = 'generator' | 'jobs' | 'accounts' | 'logs' | 'settings';

const STORAGE_CFG_KEY = 'rage_ui_config_v1';
function loadSavedUiCfg(): Record<string, any> {
  try {
    const raw = window.localStorage.getItem(STORAGE_CFG_KEY);
    return raw ? (JSON.parse(raw) as Record<string, any>) : {};
  } catch {
    return {};
  }
}

function formatProxyBytes(bytes?: number): string {
  const b = Number(bytes || 0);
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / (1024 * 1024)).toFixed(2)} MB`;
}

function describeWindowSplitPreview(n: number, mode: 'AUTO' | 'COLUMNS' | 'GRID'): string {
  if (n <= 1) return '1 Worker = Tampilan Normal (Split aktif otomatis jika Worker >= 2)';
  if (mode === 'COLUMNS') return `${n} Kolom Sejajar (${n} x 1)`;
  if (mode === 'GRID') {
    const cols = Math.ceil(Math.sqrt(n));
    const rows = Math.ceil(n / cols);
    return `Grid ${cols} x ${rows} (${n} Kotak)`;
  }
  if (n <= 3) return `${n} Kolom Sejajar (${n} x 1)`;
  const rows = n <= 10 ? 2 : n <= 18 ? 3 : Math.ceil(Math.sqrt(n));
  const cols = Math.ceil(n / rows);
  return `Grid ${cols} x ${rows} (${n} Kotak)`;
}

export function App() {
  const [savedCfg] = useState<Record<string, any>>(() => loadSavedUiCfg());
  const [user, setUser] = useState<UserInfo | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [loginUsername, setLoginUsername] = useState('admin');
  const [loginPassword, setLoginPassword] = useState('Admin@RobloxEngine2026!');
  const [loginError, setLoginError] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<ActiveTab>('generator');
  const [toast, setToast] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Generator & Multi-Worker Chrome Registration state (dipulihkan dari localStorage agar proxy/setelan tidak hilang saat refresh)
  const [genQuantity, setGenQuantity] = useState<number>(() => Number(savedCfg.genQuantity) || 5);
  const [genPrefix, setGenPrefix] = useState<string>(() => savedCfg.genPrefix ?? 'rbx');
  const [genSuffix, setGenSuffix] = useState('');
  const [genLength, setGenLength] = useState<number>(() => Number(savedCfg.genLength) || 12);
  const [genPasswordPrefix, setGenPasswordPrefix] = useState<string>(() => savedCfg.genPasswordPrefix ?? 'Pass');
  const [genPasswordLength, setGenPasswordLength] = useState<number>(() => Number(savedCfg.genPasswordLength) || 16);
  const [birthDay, setBirthDay] = useState<string>(() => savedCfg.birthDay ?? 'RANDOM');
  const [birthMonth, setBirthMonth] = useState<string>(() => savedCfg.birthMonth ?? 'RANDOM');
  const [birthYear, setBirthYear] = useState<string>(() => savedCfg.birthYear ?? '2001');
  const [gender, setGender] = useState<'MALE' | 'FEMALE' | 'RANDOM'>(() => savedCfg.gender ?? 'RANDOM');
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
  const [windowSplitMode, setWindowSplitMode] = useState<'AUTO' | 'COLUMNS' | 'GRID'>(
    () => (savedCfg.windowSplitMode as 'AUTO' | 'COLUMNS' | 'GRID') || 'AUTO'
  );
  const [workerTimeoutSeconds, setWorkerTimeoutSeconds] = useState<number>(() =>
    savedCfg.workerTimeoutSeconds !== undefined ? Number(savedCfg.workerTimeoutSeconds) : 120
  );
  const [genIncludeSymbols, setGenIncludeSymbols] = useState(true);
  const [genCreateJob, setGenCreateJob] = useState(true);
  const [genJobName, setGenJobName] = useState('');
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

  // Supervised Registration Drawer state
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
  const [accSortBy, setAccSortBy] = useState<'created_at' | 'updated_at' | 'roblox_username' | 'category'>('created_at');
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
    setTimeout(() => setToast(null), 4000);
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
    [accSearch, accCategoryFilter, accRegStatusFilter, accVerifStatusFilter, accSortBy, accSortOrder, showToast]
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
        api.request<{ configured: boolean; useProxy: boolean; proxyText: string }>(
          '/registration/proxy-config'
        ).catch(() => null),
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

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
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
      showToast('error', err instanceof Error ? err.message : 'Gagal memulai Chrome Worker');
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
      showToast('success', 'Seluruh Chrome Worker dihentikan.');
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
      showToast(
        'success',
        'Membuka browser & mengisi formulir CreateAccount secara otomatis...'
      );
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
      const res = await api.request<{ count: number; text: string }>(
        '/accounts/export-formatted'
      );
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
      <div className="min-h-screen bg-zinc-950 text-zinc-400 flex items-center justify-center font-mono text-sm">
        INITIALIZING RAGE CORE ENGINE...
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-zinc-950 text-zinc-100 flex items-center justify-center p-4">
        <div className="w-full max-w-md border border-zinc-800 bg-zinc-900/60 p-8 rounded">
          <div className="mb-6 border-b border-zinc-800 pb-4">
            <div className="text-xs font-mono uppercase tracking-widest text-zinc-500">
              MONOCHROME ENTERPRISE // V1.0
            </div>
            <h1 className="text-xl font-semibold text-zinc-100 mt-1">
              Roblox Account Generator Engine
            </h1>
            <p className="text-xs text-zinc-400 mt-1">
              Human-Supervised Account Preparation & AES-256-GCM Credential Vault
            </p>
          </div>

          {loginError && (
            <div className="mb-4 p-3 border border-red-900/80 bg-red-950/40 text-red-300 text-xs font-mono">
              {loginError}
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-xs font-mono uppercase text-zinc-400 mb-1">
                Operator Username
              </label>
              <input
                type="text"
                value={loginUsername}
                onChange={(e) => setLoginUsername(e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-800 px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-zinc-500"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-mono uppercase text-zinc-400 mb-1">
                Password
              </label>
              <input
                type="password"
                value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-800 px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-zinc-500"
                required
              />
            </div>
            <button
              type="submit"
              className="w-full bg-zinc-100 text-zinc-950 font-medium text-sm py-2.5 hover:bg-zinc-300 transition cursor-pointer"
            >
              Sign In to Engine
            </button>
          </form>

          <div className="mt-6 pt-4 border-t border-zinc-800/80 text-xs text-zinc-500 font-mono space-y-1">
            <div>Seeded Accounts:</div>
            <div>• admin / Admin@RobloxEngine2026! (ADMIN)</div>
            <div>• operator / Operator@RobloxEngine2026! (OPERATOR)</div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col">
      {/* Top Enterprise Header */}
      <header className="border-b border-zinc-800 bg-zinc-900/40 px-6 py-3 flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <div className="h-3 w-3 bg-zinc-100" />
          <div>
            <span className="font-mono text-sm font-semibold tracking-wider text-zinc-100">
              RAGE // ACCOUNT GENERATOR ENGINE
            </span>
            <span className="ml-3 text-xs font-mono px-2 py-0.5 border border-zinc-700 text-zinc-400">
              HUMAN-SUPERVISED MODE
            </span>
          </div>
        </div>

        <div className="flex items-center space-x-6 text-xs font-mono">
          <span className="text-zinc-400">
            OPERATOR: <strong className="text-zinc-100">{user.username}</strong> [{user.role}]
          </span>
          <button
            onClick={handleLogout}
            className="border border-zinc-800 px-3 py-1.5 text-zinc-300 hover:bg-zinc-900 transition cursor-pointer"
          >
            LOGOUT
          </button>
        </div>
      </header>

      {/* Navigation Bar */}
      <nav className="border-b border-zinc-800 bg-zinc-950 px-6 flex space-x-1">
        {(
          [
            { id: 'generator', label: '01. GENERATOR' },
            { id: 'jobs', label: '02. REGISTRATION JOBS' },
            { id: 'accounts', label: '03. ACCOUNTS' },
            { id: 'logs', label: '04. ACTIVITY LOGS' },
            { id: 'settings', label: '05. SETTINGS' },
          ] as Array<{ id: ActiveTab; label: string }>
        ).map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-3 text-xs font-mono tracking-wider border-b-2 transition cursor-pointer ${
              activeTab === tab.id
                ? 'border-zinc-100 text-zinc-100 bg-zinc-900/50'
                : 'border-transparent text-zinc-500 hover:text-zinc-300'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      {/* Toast Notification */}
      {toast && (
        <div
          className={`fixed bottom-5 right-5 z-50 px-4 py-3 border font-mono text-xs shadow-lg ${
            toast.type === 'success'
              ? 'bg-zinc-900 border-zinc-600 text-zinc-100'
              : 'bg-red-950 border-red-800 text-red-200'
          }`}
        >
          [{toast.type.toUpperCase()}] {toast.text}
        </div>
      )}

      {/* Main Content Area */}
      <main className="flex-1 p-6 max-w-7xl w-full mx-auto space-y-6">
        {/* ================================================================ */}
        {/* PAGE 1: GENERATOR & MULTI-WORKER CHROME AUTOFILL */}
        {/* ================================================================ */}
        {activeTab === 'generator' && (
          <div className="space-y-6">
            <div className="border border-zinc-800 bg-zinc-900/30 p-6">
              <div className="flex items-center justify-between mb-4 border-b border-zinc-800 pb-3">
                <div>
                  <h2 className="text-base font-semibold text-zinc-100">
                    Multi-Worker Chrome Account Generator & Auto-Fill
                  </h2>
                  <p className="text-xs text-zinc-400">
                    Buka N tab/window Chrome bersih (dengan opsi Proxy), isi formulir CreateAccount otomatis, simpan ke Database dalam format username:password:cookie, lalu tutup browser otomatis.
                  </p>
                </div>
                <span className="text-xs font-mono text-emerald-400">
                  FORMAT: USERNAME:PASSWORD:COOKIE
                </span>
              </div>

              <form onSubmit={handleStartBatchWorkers} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <div>
                    <label className="block text-xs font-mono text-zinc-400 mb-1">
                      1. PREFIX USERNAME
                    </label>
                    <input
                      type="text"
                      maxLength={15}
                      value={genPrefix}
                      onChange={(e) => setGenPrefix(e.target.value)}
                      placeholder="Contoh: rbx"
                      className="w-full bg-zinc-950 border border-zinc-800 px-3 py-2 text-sm text-zinc-100"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-mono text-zinc-400 mb-1">
                      PANJANG USERNAME (3 - 20)
                    </label>
                    <input
                      type="number"
                      min={3}
                      max={20}
                      value={genLength}
                      onChange={(e) => setGenLength(Number(e.target.value))}
                      className="w-full bg-zinc-950 border border-zinc-800 px-3 py-2 text-sm text-zinc-100"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-mono text-zinc-400 mb-1">
                      2. PREFIX PASSWORD
                    </label>
                    <input
                      type="text"
                      maxLength={32}
                      value={genPasswordPrefix}
                      onChange={(e) => setGenPasswordPrefix(e.target.value)}
                      placeholder="Contoh: PassKu"
                      className="w-full bg-zinc-950 border border-zinc-800 px-3 py-2 text-sm text-zinc-100"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-mono text-zinc-400 mb-1">
                      PANJANG PASSWORD (12 - 64)
                    </label>
                    <input
                      type="number"
                      min={12}
                      max={64}
                      value={genPasswordLength}
                      onChange={(e) => setGenPasswordLength(Number(e.target.value))}
                      className="w-full bg-zinc-950 border border-zinc-800 px-3 py-2 text-sm text-zinc-100"
                      required
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-6 gap-4">
                  <div>
                    <label className="block text-xs font-mono text-zinc-400 mb-1">
                      3. TANGGAL LAHIR (HARI)
                    </label>
                    <select
                      value={birthDay}
                      onChange={(e) => setBirthDay(e.target.value)}
                      className="w-full bg-zinc-950 border border-zinc-800 px-3 py-2 text-sm text-zinc-100"
                    >
                      <option value="RANDOM">Random (01-28)</option>
                      {Array.from({ length: 28 }, (_, i) =>
                        String(i + 1).padStart(2, '0')
                      ).map((d) => (
                        <option key={d} value={d}>
                          {d}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-mono text-zinc-400 mb-1">
                      BULAN LAHIR
                    </label>
                    <select
                      value={birthMonth}
                      onChange={(e) => setBirthMonth(e.target.value)}
                      className="w-full bg-zinc-950 border border-zinc-800 px-3 py-2 text-sm text-zinc-100"
                    >
                      <option value="RANDOM">Random (Jan-Dec)</option>
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
                    <label className="block text-xs font-mono text-zinc-400 mb-1">
                      TAHUN LAHIR
                    </label>
                    <select
                      value={birthYear}
                      onChange={(e) => setBirthYear(e.target.value)}
                      className="w-full bg-zinc-950 border border-zinc-800 px-3 py-2 text-sm text-zinc-100"
                    >
                      <option value="RANDOM">Random (1998-2004)</option>
                      {Array.from({ length: 21 }, (_, i) => String(1990 + i)).map((y) => (
                        <option key={y} value={y}>
                          {y}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-mono text-zinc-400 mb-1">
                      4. JENIS KELAMIN
                    </label>
                    <select
                      value={gender}
                      onChange={(e) =>
                        setGender(e.target.value as 'MALE' | 'FEMALE' | 'RANDOM')
                      }
                      className="w-full bg-zinc-950 border border-zinc-800 px-3 py-2 text-sm text-zinc-100"
                    >
                      <option value="RANDOM">Random (Male / Female)</option>
                      <option value="MALE">Male (Laki-laki)</option>
                      <option value="FEMALE">Female (Perempuan)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-mono text-zinc-400 mb-1">
                      5. MAU BUAT BERAPA AKUN
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={5000}
                      value={genQuantity}
                      onChange={(e) => setGenQuantity(Number(e.target.value))}
                      className="w-full bg-zinc-950 border border-zinc-800 px-3 py-2 text-sm text-zinc-100"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-mono text-zinc-400 mb-1">
                      6. JUMLAH WORKER (TANPA BATAS)
                    </label>
                    <input
                      type="number"
                      min={1}
                      value={workerCount}
                      onChange={(e) => setWorkerCount(Math.max(1, Number(e.target.value) || 1))}
                      className="w-full bg-zinc-950 border border-zinc-800 px-3 py-2 text-sm text-zinc-100"
                      required
                    />
                  </div>
                </div>

                {/* Browser Variant & Isolated Worker Profile Configuration */}
                <div className="border border-zinc-800/80 bg-zinc-950/60 p-4 space-y-3">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-xs font-mono text-zinc-300 mb-1">
                        7. VARIAN BROWSER WORKER
                      </label>
                      <select
                        value={browserVariant}
                        onChange={(e) => {
                          const v = e.target.value as BrowserVariant;
                          setBrowserVariant(v);
                          if (v === 'FIREFOX_MAIN') {
                            setClearProfileBeforeRun(false);
                          }
                        }}
                        className="w-full bg-zinc-950 border border-zinc-800 px-3 py-2 text-xs font-mono text-zinc-100"
                      >
                        <option value="FIREFOX_MANUAL">
                          Mozilla Firefox Utama — MANUAL tanpa otomasi (CAPTCHA lolos, disarankan)
                        </option>
                        <option value="FIREFOX_MAIN">
                          Mozilla Firefox — Browser & Profil Utama Saya (Tanpa Reset)
                        </option>
                        <option value="CHROME">Google Chrome (chrome_worker_profile_N)</option>
                        <option value="EDGE">Microsoft Edge (edge_worker_profile_N)</option>
                        <option value="FIREFOX">Mozilla Firefox — Profil Worker Terisolasi</option>
                        <option value="CHROMIUM">Chromium (chromium_worker_profile_N)</option>
                        <option value="ROTATE">Rotasi Multi-Browser (Chrome / Edge / Firefox Utama)</option>
                      </select>
                    </div>

                    <div className="flex flex-col justify-end pb-1">
                      {browserVariant === 'FIREFOX_MAIN' ? (
                        <div className="text-xs font-mono text-emerald-400">
                          ✓ Mode Profil Utama Aktif: History, Ekstensi & Cookie Website Lain Aman
                          <div className="text-[10px] text-zinc-400 mt-0.5">
                            Hanya cookie sesi roblox.com yang dibersihkan saat berganti pendaftaran akun baru.
                          </div>
                        </div>
                      ) : (
                        <>
                          <label className="flex items-center space-x-2 text-xs font-mono text-zinc-200 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={clearProfileBeforeRun}
                              onChange={(e) => setClearProfileBeforeRun(e.target.checked)}
                            />
                            <span>Reset Bersih Cookie/Cache Profil Tiap Akun Baru</span>
                          </label>
                          <span className="text-[10px] font-mono text-zinc-500 mt-1">
                            Lokasi: ./data/worker_profiles/&lt;browser&gt;_worker_profile_1..10
                          </span>
                        </>
                      )}
                    </div>

                    <div className="flex items-end justify-end">
                      <button
                        type="button"
                        onClick={async () => {
                          try {
                            const r = await api.request<{ clearedFolders: number }>(
                              '/registration/reset-profiles',
                              { method: 'POST' }
                            );
                            showToast(
                              'success',
                              `Berhasil membersihkan ${r.data.clearedFolders} folder profil worker sementara!`
                            );
                          } catch (err) {
                            showToast(
                              'error',
                              err instanceof Error ? err.message : 'Gagal reset profil'
                            );
                          }
                        }}
                        className="border border-zinc-700 px-3 py-2 text-xs font-mono text-zinc-300 hover:bg-zinc-800 cursor-pointer"
                      >
                        BERSIHKAN FOLDER PROFIL WORKER SEMENTARA
                      </button>
                    </div>
                  </div>

                  {/* Auto-Split Layar Multi-Worker & Batas Waktu Per Akun */}
                  <div className="border-t border-zinc-800/80 pt-3 flex flex-wrap items-center justify-between gap-3 text-xs font-mono">
                    <div className="flex flex-wrap items-center gap-3">
                      <label className="flex items-center space-x-2 text-emerald-300 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={autoSplitWindow}
                          onChange={(e) => setAutoSplitWindow(e.target.checked)}
                        />
                        <span>AUTO-SPLIT LAYAR WORKER</span>
                      </label>
                      {autoSplitWindow && (
                        <select
                          value={windowSplitMode}
                          onChange={(e) =>
                            setWindowSplitMode(e.target.value as 'AUTO' | 'COLUMNS' | 'GRID')
                          }
                          className="bg-zinc-900 border border-zinc-700 px-2.5 py-1 text-[11px] text-zinc-100"
                        >
                          <option value="AUTO">Otomatis (2→2x1, 3→3x1, 4→2x2, 5+→Grid)</option>
                          <option value="COLUMNS">Semua Kolom Sejajar (N x 1)</option>
                          <option value="GRID">Grid Kotak Multi-Baris</option>
                        </select>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-3">
                      <label className="flex items-center space-x-2 text-[11px] text-zinc-300">
                        <span>BATAS WAKTU WORKER (DETIK):</span>
                        <input
                          type="number"
                          min={0}
                          max={3600}
                          value={workerTimeoutSeconds}
                          onChange={(e) => setWorkerTimeoutSeconds(Math.max(0, Number(e.target.value) || 0))}
                          className="w-20 bg-zinc-900 border border-zinc-700 px-2 py-1 text-xs text-amber-300"
                          title="Default 120 detik: bila lewat waktu/kendala, browser tutup otomatis dan ganti username+password baru (0 = tanpa batas)"
                        />
                      </label>
                      <span className="text-[11px] text-zinc-400">
                        {autoSplitWindow
                          ? `Split: ${describeWindowSplitPreview(workerCount, windowSplitMode)}`
                          : 'Split Nonaktif'}
                      </span>
                    </div>
                  </div>

                  {(browserVariant === 'CHROME' ||
                    browserVariant === 'EDGE' ||
                    browserVariant === 'CHROMIUM' ||
                    browserVariant === 'ROTATE') && (
                    <div className="border-t border-zinc-800/80 pt-3 text-xs font-mono">
                      <div className="border border-emerald-800/70 bg-emerald-950/20 p-3 flex flex-wrap items-center justify-between gap-3">
                        <div className="space-y-1">
                          <div className="text-xs font-semibold text-emerald-300">
                            EKSTENSI GOOGLE CHROME WORKER OTOMATIS AKTIF (OMOCAPTCHA / VIOLENTMONKEY / CUSTOM)
                          </div>
                          <div className="text-[11px] text-zinc-300">
                            {chromeExtInfo && chromeExtInfo.extensions.length > 0 ? (
                              <span>
                                Terdeteksi <strong>{chromeExtInfo.extensions.length} ekstensi</strong>:{' '}
                                {chromeExtInfo.extensions
                                  .map((e) => `${e.name} (${e.version})`)
                                  .join(', ')}
                              </span>
                            ) : (
                              <span className="text-amber-300">
                                Belum ada ekstensi terdeteksi di profil utama Chrome atau folder custom.
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-zinc-400">
                            • Otomatis menyalin ekstensi &amp; API key dari profil utama Chrome Anda (
                            <code>%LOCALAPPDATA%\Google\Chrome\User Data\Default</code>) atau taruh folder ekstensi unpacked di{' '}
                            <code>{chromeExtInfo?.customExtensionsDir || 'data/chrome_extensions'}</code>.
                          </div>
                        </div>
                        <button
                          type="button"
                          disabled={syncingChromeExt}
                          onClick={() => void handleSyncChromeExtensions()}
                          className="border border-emerald-600/80 bg-emerald-900/40 hover:bg-emerald-800/50 px-3 py-1.5 text-[11px] font-semibold text-emerald-200 cursor-pointer disabled:opacity-50"
                        >
                          {syncingChromeExt ? 'MENYINKRONKAN...' : 'SYNC ULANG EKSTENSI CHROME'}
                        </button>
                      </div>
                    </div>
                  )}

                  {(browserVariant === 'FIREFOX_MAIN' || browserVariant === 'FIREFOX_MANUAL') && (
                    <div className="border-t border-zinc-800/80 pt-3 grid grid-cols-1 md:grid-cols-2 gap-3 text-xs font-mono">
                      <div>
                        <label className="block text-[11px] text-zinc-400 mb-1">
                          PILIH PROFIL MOZILLA FIREFOX UTAMA (%APPDATA%\Mozilla\Firefox\Profiles)
                        </label>
                        {firefoxProfileInfo && firefoxProfileInfo.profiles.length > 0 ? (
                          <select
                            value={customFirefoxProfilePath}
                            onChange={(e) => setCustomFirefoxProfilePath(e.target.value)}
                            className="w-full bg-zinc-900 border border-zinc-700 px-3 py-1.5 text-xs text-zinc-100"
                          >
                            {firefoxProfileInfo.profiles.map((p) => (
                              <option key={p.path} value={p.path}>
                                {p.name} ({p.path}){p.isDefault ? ' [DEFAULT UTAMA]' : ''}
                                {p.hasData === false ? ' [KOSONG - TANPA DATA]' : ''}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <input
                            type="text"
                            value={customFirefoxProfilePath}
                            onChange={(e) => setCustomFirefoxProfilePath(e.target.value)}
                            placeholder="C:\Users\...\AppData\Roaming\Mozilla\Firefox\Profiles\xxxx.default-release"
                            className="w-full bg-zinc-900 border border-zinc-700 px-3 py-1.5 text-xs text-zinc-100"
                          />
                        )}
                      </div>

                      <div className="flex flex-col justify-end text-[11px] text-zinc-400 space-y-0.5">
                        <div>
                          Executable:{' '}
                          <span className="text-zinc-200">
                            {firefoxProfileInfo?.executablePath || 'Tidak terdeteksi'}
                          </span>
                        </div>
                        <div>
                          Status Profil Sumber:{' '}
                          {firefoxProfileInfo?.isMainProfileLocked ? (
                            <span className="text-amber-300">
                              Sedang Terbuka (Otomatis Sinkronisasi Profil agar Tidak Bentrok Lock)
                            </span>
                          ) : (
                            <span className="text-emerald-400">
                              Tutup / Siap
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="md:col-span-2 border border-sky-800/70 bg-sky-950/20 p-3 flex flex-wrap items-center justify-between gap-3">
                        <div className="space-y-1">
                          <label className="flex items-center space-x-2 text-xs text-sky-200 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={useMasterWarmProfile}
                              onChange={(e) => setUseMasterWarmProfile(e.target.checked)}
                            />
                            <span>
                              <strong>1 Master Warm Profile RAGE</strong> (History web lain &amp; ekstensi dipertahankan, Cookie/Storage/History Roblox kosong — di-reset balik ke kondisi ini setiap worker tutup/buka akun baru)
                            </span>
                          </label>
                          <div className="text-[11px] text-zinc-400 pl-5">
                            {firefoxProfileInfo?.masterProfile?.exists ? (
                              <span className="text-emerald-300">
                                Master Aktif: {firefoxProfileInfo.masterProfile.nonRobloxPlacesCount}{' '}
                                riwayat web lain, {firefoxProfileInfo.masterProfile.nonRobloxCookiesCount}{' '}
                                cookie non-Roblox,{' '}
                                {firefoxProfileInfo.masterProfile.robloxCookiesCount} cookie Roblox,{' '}
                                {firefoxProfileInfo.masterProfile.extensionCount} ekstensi
                              </span>
                            ) : (
                              <span className="text-amber-300">
                                Master Profile belum dibuat (otomatis dibuat dari profil terpilih saat Mulai Batch, atau klik tombol di kanan).
                              </span>
                            )}
                          </div>
                        </div>
                        <button
                          type="button"
                          disabled={syncingMasterProfile}
                          onClick={() => void handleSyncMasterFirefoxProfile()}
                          className="border border-sky-600/80 bg-sky-900/40 hover:bg-sky-800/50 px-3 py-1.5 text-[11px] font-semibold text-sky-200 cursor-pointer disabled:opacity-50"
                        >
                          {syncingMasterProfile
                            ? 'MENYINKRONKAN MASTER...'
                            : firefoxProfileInfo?.masterProfile?.exists
                              ? 'SYNC ULANG MASTER (STERILKAN ROBLOX)'
                              : 'BUAT MASTER PROFILE (BEBAS ROBLOX)'}
                        </button>
                      </div>

                      {browserVariant === 'FIREFOX_MANUAL' && manualBookmarkletHref && (
                        <div className="md:col-span-2 border border-emerald-800/70 bg-emerald-950/20 p-3 space-y-2.5">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div>
                              <div className="text-xs font-semibold text-emerald-300">
                                AUTOFILL &amp; KLIK SIGN UP OTOMATIS (FIREFOX MANUAL — TINGGAL CAPTCHA)
                              </div>
                              <div className="text-[11px] text-zinc-400">
                                • <strong>0-Klik Otomatis Penuh:</strong> Pasang add-on <em>Violentmonkey / Tampermonkey</em> di Firefox lalu klik <strong>PASANG USERSCRIPT</strong> &rarr; form langsung terisi &amp; klik <code>Add password</code> otomatis begitu halaman Roblox terbuka.<br />
                                • <strong>1-Klik Tanpa Add-on:</strong> Tarik tombol <strong>RAGE AUTOFILL</strong> ke Bookmark Toolbar Firefox &rarr; klik bookmark di Roblox &rarr; isi form + klik <code>Add password</code> otomatis.
                              </div>
                            </div>
                            <div className="flex flex-wrap items-center gap-2">
                              {manualUserscriptUrl && (
                                <a
                                  href={manualUserscriptUrl}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="bg-zinc-100 text-zinc-950 px-3 py-1.5 font-mono font-bold text-xs hover:bg-zinc-300"
                                  title="Pasang di Violentmonkey / Tampermonkey Firefox"
                                >
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
                                  showToast(
                                    'success',
                                    'Tarik tombol ini ke Bookmark Toolbar Firefox (jangan diklik di sini), lalu klik dari halaman Roblox!'
                                  );
                                }}
                                className="bg-emerald-500 text-zinc-950 px-3 py-1.5 font-mono font-bold text-xs hover:bg-emerald-400 cursor-grab select-none"
                                title="Tarik ke Bookmark Toolbar Firefox"
                              >
                                ★ RAGE AUTOFILL (Tarik ke Bookmark)
                              </a>
                              <button
                                type="button"
                                onClick={() => {
                                  void navigator.clipboard.writeText(manualBookmarkletHref);
                                  showToast(
                                    'success',
                                    'Kode Bookmarklet disalin! Di Firefox tekan Ctrl+Shift+O / klik kanan toolbar -> Tambah Bookmark -> tempel ke kolom URL.'
                                  );
                                }}
                                className="border border-emerald-700 px-3 py-1.5 text-xs font-mono text-emerald-200 hover:bg-emerald-900/40 cursor-pointer"
                              >
                                SALIN KODE BOOKMARKLET
                              </button>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Proxy Option */}
                <div className="border border-zinc-800/80 bg-zinc-950/60 p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="flex items-center space-x-2 text-xs font-mono text-zinc-200 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={useProxy}
                        onChange={(e) => setUseProxy(e.target.checked)}
                      />
                      <span>8. GUNAKAN PROXY (ROTASI OTOMATIS PER WORKER)</span>
                    </label>
                    <span className="text-[11px] font-mono text-zinc-500">
                      Format: ip:port atau user:pass@ip:port atau ip:port:user:pass (1 baris 1 proxy)
                    </span>
                  </div>

                  {firefoxProfileInfo?.configuredProxyHint && !useProxy && (
                    <div className="border border-amber-700/70 bg-amber-950/30 px-3 py-2 text-[11px] font-mono text-amber-200">
                      Profil Firefox utama Anda sedang mengatur proxy manual ({firefoxProfileInfo.configuredProxyHint}). Centang <strong>8. GUNAKAN PROXY</strong> di atas dan isi format <code>user:pass@host:port</code> agar jembatan lokal menyisipkan login otomatis dan popup Sign In DataImpulse tidak muncul!
                    </div>
                  )}

                  {useProxy && (
                    <div className="space-y-3">
                      <textarea
                        rows={4}
                        value={proxyText}
                        onChange={(e) => setProxyText(e.target.value)}
                        placeholder={'http://user:pass@gw.dataimpulse.com:10000\nuser:pass@gw.dataimpulse.com:10000-10019\ncurl -x "http://user:pass@host:port" https://api.ipify.org/'}
                        className="w-full bg-zinc-950 border border-zinc-800 p-2.5 text-xs font-mono text-zinc-100"
                      />

                      <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] font-mono">
                        <span className="text-zinc-400">
                          Mendukung format <code>user:pass@host:port</code>, <code>curl -x "..."</code>, atau rentang port sticky (<code>:10000-10019</code>).
                        </span>
                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              const firstLine = proxyText
                                .split(/\r?\n/)
                                .map((l) => l.trim())
                                .find(Boolean);
                              if (!firstLine) {
                                showToast('error', 'Tempel 1 baris proxy atau perintah curl -x terlebih dahulu.');
                                return;
                              }
                              const curlM = firstLine.match(
                                /^curl\b.*?(?:-x|--proxy)\s+(?:["']([^"']+)["']|(\S+))/i
                              );
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
                              const lines = Array.from(
                                { length: 20 },
                                (_, i) => `${m[1]}${basePort + i}`
                              );
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
                            }}
                            className="border border-emerald-700 px-2.5 py-1 text-emerald-300 hover:bg-emerald-950/40 cursor-pointer"
                          >
                            EXPANSI 20 PORT STICKY &amp; SIMPAN
                          </button>
                          <button
                            type="button"
                            onClick={async () => {
                              try {
                                await api.request('/registration/proxy-config', {
                                  method: 'POST',
                                  body: JSON.stringify({ useProxy, proxyText }),
                                });
                                showToast('success', 'Daftar proxy terenkripsi berhasil disimpan ke database!');
                              } catch (err) {
                                showToast(
                                  'error',
                                  err instanceof Error ? err.message : 'Gagal menyimpan proxy'
                                );
                              }
                            }}
                            className="border border-zinc-700 px-2.5 py-1 text-zinc-200 hover:bg-zinc-800 cursor-pointer"
                          >
                            SIMPAN PROXY
                          </button>
                        </div>
                      </div>

                      <div className="border border-emerald-900/60 bg-emerald-950/15 p-3 space-y-2">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <label className="flex items-center space-x-2 text-xs font-mono text-emerald-300 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={proxyDataSaver}
                              onChange={(e) => setProxyDataSaver(e.target.checked)}
                            />
                            <span>
                              MODE HEMAT KUOTA PROXY (DISARANKAN — POTONG ~80-90% DATA TIDAK PERLU)
                            </span>
                          </label>
                          <span className="text-[10px] font-mono text-emerald-400">
                            0 BYTE KE DATAIMPULSE UNTUK BLOATWARE
                          </span>
                        </div>
                        <div className="text-[11px] font-mono text-zinc-400 pl-5">
                          Otomatis memblokir Google SafeBrowsing (~18 MB/sesi), Telemetry/Merino/GMP/Widevine/DoH Firefox (~10–25 MB/profil baru), GTM/Analytics/Sentry, domain `/home` (`assetdelivery`/`catalog`/`groups`), melewatkan API solver (OMOcaptcha/YesCaptcha) langsung tanpa proxy, menghentikan muatan `/home` setelah cookie tersimpan, &amp; memaksimalkan cache JS/CSS/font.
                        </div>

                        <label className="flex items-center space-x-2 text-xs font-mono text-zinc-200 cursor-pointer pl-5 pt-1">
                          <input
                            type="checkbox"
                            checked={proxyBlockHeavyMedia}
                            onChange={(e) => setProxyBlockHeavyMedia(e.target.checked)}
                          />
                          <span>
                            Hemat Ekstra (Aman CAPTCHA): Blokir Thumbnail Game &amp; Avatar (`/home`) — Font &amp; UI CreateAccount Tetap Aman di-Cache
                          </span>
                        </label>

                        <label className="flex items-center space-x-2 text-xs font-mono text-emerald-200 cursor-pointer pl-5 pt-1">
                          <input
                            type="checkbox"
                            checked={proxyOneAccountOneSticky}
                            onChange={(e) => setProxyOneAccountOneSticky(e.target.checked)}
                          />
                          <span>
                            <strong>1 Akun = 1 Proxy Sticky Unik</strong> (Otomatis buat Session ID baru tiap akun DataImpulse — tidak pernah ulang IP lama walau 200+ akun)
                          </span>
                        </label>
                      </div>
                    </div>
                  )}
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                  <div className="flex items-center space-x-2">
                    <button
                      type="button"
                      disabled={genLoading}
                      onClick={(e) => void handleGenerate(e as any)}
                      className="border border-zinc-700 px-4 py-2.5 text-xs font-mono text-zinc-300 hover:bg-zinc-800 transition cursor-pointer"
                    >
                      GENERATE DATA SAJA (TANPA BUKA BROWSER)
                    </button>
                  </div>

                  <div className="flex items-center space-x-3">
                    {batchState?.running && (
                      <button
                        type="button"
                        onClick={() => void handleStopBatchWorkers()}
                        className="border border-red-800 bg-red-950/60 text-red-200 px-5 py-2.5 text-xs font-mono font-semibold hover:bg-red-900/70 transition cursor-pointer"
                      >
                        STOP SEMUA WORKER ({batchState.activeWorkerCount} AKTIF)
                      </button>
                    )}
                    <button
                      type="submit"
                      disabled={genLoading || batchState?.running}
                      className="bg-emerald-500 text-zinc-950 font-mono font-semibold text-xs px-6 py-2.5 hover:bg-emerald-400 transition disabled:opacity-50 cursor-pointer"
                    >
                      {batchState?.running
                        ? `WORKER SEDANG BERJALAN (${batchState.completedCount}/${batchState.totalTarget})...`
                        : browserVariant === 'FIREFOX_MAIN'
                          ? `MULAI BUKA MOZILLA FIREFOX UTAMA & AUTOFILL (${workerCount} WORKER)`
                          : `MULAI BUKA ${browserVariant} & AUTOFILL (${workerCount} WORKER)`}
                    </button>
                  </div>
                </div>
              </form>
            </div>

            {/* Live Multi-Worker Status & Registered username:password:cookie Output */}
            {batchState && batchState.batchId && (
              <div className="border border-zinc-700 bg-zinc-900/40 p-5 space-y-4">
                <div className="flex flex-wrap items-center justify-between border-b border-zinc-800 pb-3 gap-2">
                  <div>
                    <h3 className="text-sm font-semibold text-zinc-100">
                      Live Chrome Workers Monitor ({batchState.completedCount}/{batchState.totalTarget}{' '}
                      Berhasil Terdaftar)
                    </h3>
                    <p className="text-xs font-mono text-zinc-400">
                      Status: {batchState.running ? 'RUNNING' : 'IDLE / FINISHED'} | Worker Aktif:{' '}
                      {batchState.activeWorkerCount} | Gagal/Timeout: {batchState.failedCount} |
                      Diganti Baru: {batchState.replacedCount ?? 0} | Kuota Proxy:{' '}
                      {formatProxyBytes(batchState.proxyTotalBytes)} | Diblokir Hemat Kuota:{' '}
                      {batchState.proxyTotalBlockedRequests ?? 0} req
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void handleExportAllFormatted()}
                    className="bg-zinc-100 text-zinc-950 px-3 py-1.5 text-xs font-mono font-semibold hover:bg-zinc-300 cursor-pointer"
                  >
                    LIHAT SEMUA DATABASE (USERNAME:PASSWORD:COOKIE)
                  </button>
                </div>

                {/* Worker Cards */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {batchState.workers.map((w) => (
                    <div
                      key={w.workerId}
                      className="border border-zinc-800 bg-zinc-950 p-3 text-xs font-mono space-y-1"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-zinc-200 font-semibold">
                          WORKER #{w.workerId} [{w.browserVariant}]
                        </span>
                        <div className="flex items-center space-x-1.5">
                          {w.remainingSeconds != null && (
                            <span
                              className={`px-1.5 py-0.5 text-[10px] border ${
                                w.remainingSeconds <= 15
                                  ? 'border-red-700 text-red-300 bg-red-950/40'
                                  : w.remainingSeconds <= 35
                                    ? 'border-amber-700 text-amber-300 bg-amber-950/30'
                                    : 'border-zinc-700 text-zinc-300'
                              }`}
                            >
                              {w.remainingSeconds}d
                            </span>
                          )}
                          <span
                            className={`px-1.5 py-0.5 text-[10px] border ${
                              w.state === 'WAITING_REGISTRATION' || w.state === 'OPENING_BROWSER'
                                ? 'border-emerald-700 text-emerald-300 bg-emerald-950/30'
                                : 'border-zinc-800 text-zinc-400'
                            }`}
                          >
                            {w.state}
                          </span>
                        </div>
                      </div>
                      <div className="text-zinc-400">
                        Target: <strong className="text-zinc-100">{w.currentUsername || '—'}</strong>
                      </div>
                      <div className="text-zinc-500 text-[10px] truncate">
                        Profil: {w.profilePath}
                      </div>
                      {w.currentUsername && w.currentPassword && (
                        <div className="border border-emerald-800 bg-emerald-950/20 p-2 space-y-1">
                          <div className="text-emerald-300 text-[10px]">{w.formHint}</div>
                          <div className="flex gap-1">
                            <button
                              type="button"
                              className="border border-zinc-700 px-2 py-0.5 text-[10px] hover:bg-zinc-800 cursor-pointer"
                              onClick={() => {
                                void navigator.clipboard.writeText(w.currentUsername || '');
                                showToast('success', 'Username disalin');
                              }}
                            >
                              SALIN USERNAME
                            </button>
                            <button
                              type="button"
                              className="border border-zinc-700 px-2 py-0.5 text-[10px] hover:bg-zinc-800 cursor-pointer"
                              onClick={() => {
                                void navigator.clipboard.writeText(w.currentPassword || '');
                                showToast('success', 'Password disalin');
                              }}
                            >
                              SALIN PASSWORD
                            </button>
                          </div>
                        </div>
                      )}
                      <div className="text-zinc-500 text-[11px]">
                        Proxy: {w.proxyServer || 'Direct'}
                        {(w.proxyBytes !== undefined || w.proxyBlockedRequests !== undefined) &&
                          w.proxyServer &&
                          !w.proxyServer.startsWith('Direct') && (
                            <span className="text-emerald-400">
                              {' '}
                              &bull; {formatProxyBytes(w.proxyBytes)} ({w.proxyBlockedRequests ?? 0}{' '}
                              diblokir)
                            </span>
                          )}
                      </div>
                      <div className="text-zinc-300 text-[11px] pt-1 border-t border-zinc-900">
                        {w.message}
                      </div>
                      <div className="text-[10px] text-emerald-400">
                        Selesai oleh worker ini: {w.completedByWorker} akun
                      </div>
                    </div>
                  ))}
                </div>

                {/* Live Registered Output Box (username:password:cookie) */}
                {batchState.registeredLines.length > 0 && (
                  <div className="space-y-2 pt-2 border-t border-zinc-800">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-mono text-emerald-400 font-semibold">
                        HASIL TERDAFTAR DI DATABASE (FORMAT USERNAME:PASSWORD:COOKIE):
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          void navigator.clipboard.writeText(
                            batchState.registeredLines.join('\n')
                          );
                          showToast(
                            'success',
                            'Seluruh hasil username:password:cookie disalin ke clipboard!'
                          );
                        }}
                        className="border border-zinc-700 px-3 py-1 text-[11px] font-mono text-zinc-200 hover:bg-zinc-800 cursor-pointer"
                      >
                        COPY SEMUA HASIL ({batchState.registeredLines.length})
                      </button>
                    </div>
                    <textarea
                      readOnly
                      rows={5}
                      value={batchState.registeredLines.join('\n')}
                      className="w-full bg-zinc-950 border border-zinc-800 p-3 text-xs font-mono text-emerald-300 focus:outline-none"
                    />
                  </div>
                )}
              </div>
            )}

            {/* Generated Candidates Preview & Validation Table */}
            <div className="border border-zinc-800 bg-zinc-900/20">
              <div className="p-4 border-b border-zinc-800 flex flex-wrap items-center justify-between gap-4">
                <div>
                  <h3 className="text-sm font-semibold text-zinc-100">
                    Generated Candidate Records ({candidatesMeta.total})
                  </h3>
                  <p className="text-xs text-zinc-500">
                    Distinct from registered Roblox accounts until human confirmation is completed.
                  </p>
                </div>
                <div className="flex items-center space-x-3">
                  <input
                    type="text"
                    placeholder="Search candidate username..."
                    value={candidateSearch}
                    onChange={(e) => setCandidateSearch(e.target.value)}
                    className="bg-zinc-950 border border-zinc-800 px-3 py-1.5 text-xs text-zinc-100"
                  />
                  <select
                    value={candidateStateFilter}
                    onChange={(e) => setCandidateStateFilter(e.target.value)}
                    className="bg-zinc-950 border border-zinc-800 px-3 py-1.5 text-xs text-zinc-100"
                  >
                    <option value="">All States</option>
                    <option value="GENERATED_CANDIDATE">GENERATED_CANDIDATE</option>
                    <option value="VERIFICATION_REQUIRED">VERIFICATION_REQUIRED</option>
                    <option value="REGISTERED">REGISTERED</option>
                    <option value="FAILED">FAILED</option>
                  </select>
                  <button
                    onClick={() => void loadCandidates(1)}
                    className="border border-zinc-700 px-3 py-1.5 text-xs font-mono hover:bg-zinc-800 cursor-pointer"
                  >
                    FILTER
                  </button>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-zinc-800 text-[11px] font-mono text-zinc-400 bg-zinc-900/40">
                      <th className="p-3">CANDIDATE USERNAME</th>
                      <th className="p-3">LEN</th>
                      <th className="p-3">VALIDATION</th>
                      <th className="p-3">VAULT FINGERPRINT</th>
                      <th className="p-3">WORKFLOW STATE</th>
                      <th className="p-3 text-right">ACTIONS</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800/60 text-xs">
                    {candidates.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="p-6 text-center text-zinc-500 font-mono">
                          No generated candidate records found. Use the generator above to create candidates.
                        </td>
                      </tr>
                    ) : (
                      candidates.map((c) => (
                        <tr key={c.id} className="hover:bg-zinc-900/30">
                          <td className="p-3 font-mono text-zinc-100 font-medium">
                            {c.candidateUsername}
                          </td>
                          <td className="p-3 font-mono text-zinc-400">{c.length}</td>
                          <td className="p-3">
                            <span
                              className={`px-2 py-0.5 font-mono text-[10px] border ${
                                c.validationStatus === 'VALID'
                                  ? 'border-zinc-700 text-zinc-200 bg-zinc-800/50'
                                  : 'border-red-800 text-red-300 bg-red-950/30'
                              }`}
                            >
                              {c.validationStatus}
                            </span>
                          </td>
                          <td className="p-3 font-mono text-zinc-500">
                            {c.credentialFingerprint
                              ? `SHA256:${c.credentialFingerprint.slice(0, 14)}...`
                              : 'NONE'}
                          </td>
                          <td className="p-3 font-mono">
                            <span
                              className={`px-2 py-0.5 text-[10px] border ${
                                c.registrationState === 'REGISTERED'
                                  ? 'border-emerald-800/80 text-emerald-300 bg-emerald-950/20'
                                  : c.registrationState === 'VERIFICATION_REQUIRED'
                                    ? 'border-zinc-600 text-zinc-200 bg-zinc-800/60'
                                    : 'border-zinc-800 text-zinc-400'
                              }`}
                            >
                              {c.registrationState}
                            </span>
                          </td>
                          <td className="p-3 text-right space-x-2">
                            {c.registrationState !== 'REGISTERED' && (
                              <>
                                <button
                                  onClick={() => void handleRegenerateCandidate(c.id)}
                                  className="border border-zinc-700 px-2.5 py-1 text-[11px] font-mono text-zinc-300 hover:bg-zinc-800 cursor-pointer"
                                >
                                  REGENERATE
                                </button>
                                <button
                                  onClick={() => void handleStartAssistedBrowser(c.id)}
                                  className="border border-emerald-700 bg-emerald-950/40 text-emerald-300 px-2.5 py-1 text-[11px] font-mono font-medium hover:bg-emerald-900/50 cursor-pointer"
                                >
                                  AUTO-OPEN & AUTOFILL
                                </button>
                                <button
                                  onClick={() => void openSupervisedWorkflow(c.id)}
                                  className="bg-zinc-100 text-zinc-950 px-2.5 py-1 text-[11px] font-mono font-medium hover:bg-zinc-300 cursor-pointer"
                                >
                                  SUPERVISE & REGISTER
                                </button>
                              </>
                            )}
                            {c.registrationState === 'REGISTERED' && (
                              <span className="text-[11px] font-mono text-zinc-500">
                                CONFIRMED
                              </span>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              <div className="p-3 border-t border-zinc-800 flex items-center justify-between text-xs font-mono text-zinc-400">
                <span>
                  Page {candidatesMeta.page} of {candidatesMeta.totalPages} ({candidatesMeta.total} total)
                </span>
                <div className="space-x-2">
                  <button
                    disabled={candidatesMeta.page <= 1}
                    onClick={() => void loadCandidates(candidatesMeta.page - 1)}
                    className="border border-zinc-800 px-3 py-1 disabled:opacity-40 hover:bg-zinc-900 cursor-pointer"
                  >
                    PREV
                  </button>
                  <button
                    disabled={candidatesMeta.page >= candidatesMeta.totalPages}
                    onClick={() => void loadCandidates(candidatesMeta.page + 1)}
                    className="border border-zinc-800 px-3 py-1 disabled:opacity-40 hover:bg-zinc-900 cursor-pointer"
                  >
                    NEXT
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ================================================================ */}
        {/* PAGE 2: REGISTRATION JOBS */}
        {/* ================================================================ */}
        {activeTab === 'jobs' && (
          <div className="space-y-6">
            <div className="border border-zinc-800 bg-zinc-900/20">
              <div className="p-4 border-b border-zinc-800 flex items-center justify-between">
                <div>
                  <h2 className="text-base font-semibold text-zinc-100">
                    Registration Preparation Jobs ({jobsMeta.total})
                  </h2>
                  <p className="text-xs text-zinc-400">
                    Queue management with pause, resume, cancel, retry tracking, and human-supervised completion gating.
                  </p>
                </div>
                <button
                  onClick={() => void loadJobs(jobsMeta.page)}
                  className="border border-zinc-700 px-3 py-1.5 text-xs font-mono hover:bg-zinc-800 cursor-pointer"
                >
                  REFRESH QUEUE
                </button>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-zinc-800 text-[11px] font-mono text-zinc-400 bg-zinc-900/40">
                      <th className="p-3">JOB NAME / ID</th>
                      <th className="p-3">STATUS</th>
                      <th className="p-3">PROGRESS (REGISTERED / TOTAL)</th>
                      <th className="p-3">AWAITING SUPERVISION</th>
                      <th className="p-3">FAILED</th>
                      <th className="p-3">CREATED</th>
                      <th className="p-3 text-right">CONTROLS</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800/60 text-xs">
                    {jobs.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="p-6 text-center text-zinc-500 font-mono">
                          No registration jobs queued yet.
                        </td>
                      </tr>
                    ) : (
                      jobs.map((job) => (
                        <tr key={job.id} className="hover:bg-zinc-900/30">
                          <td className="p-3">
                            <div className="font-medium text-zinc-100">{job.name}</div>
                            <div className="font-mono text-[10px] text-zinc-500">{job.id}</div>
                            {job.errorMessage && (
                              <div className="font-mono text-[10px] text-red-400 mt-1">
                                Error: {job.errorMessage}
                              </div>
                            )}
                          </td>
                          <td className="p-3 font-mono">
                            <span className="px-2 py-0.5 text-[10px] border border-zinc-700 bg-zinc-800/60 text-zinc-200">
                              {job.status}
                            </span>
                          </td>
                          <td className="p-3">
                            <div className="flex items-center space-x-2">
                              <div className="w-28 h-2 bg-zinc-800 overflow-hidden">
                                <div
                                  className="h-full bg-zinc-200 transition-all"
                                  style={{ width: `${job.progressPercent}%` }}
                                />
                              </div>
                              <span className="font-mono text-[11px] text-zinc-300">
                                {job.completedCount}/{job.totalCount} ({job.progressPercent}%)
                              </span>
                            </div>
                          </td>
                          <td className="p-3 font-mono text-zinc-300">
                            {job.verificationRequiredCount}
                          </td>
                          <td className="p-3 font-mono text-zinc-400">{job.failedCount}</td>
                          <td className="p-3 font-mono text-zinc-500">
                            {new Date(job.createdAt).toLocaleString()}
                          </td>
                          <td className="p-3 text-right space-x-1.5">
                            <button
                              onClick={async () => {
                                const res = await api.request<RegistrationJob>(
                                  `/generator/jobs/${job.id}`
                                );
                                setSelectedJob(res.data);
                              }}
                              className="border border-zinc-700 px-2.5 py-1 text-[11px] font-mono hover:bg-zinc-800 cursor-pointer"
                            >
                              INSPECT
                            </button>
                            {job.status !== 'PAUSED' &&
                              job.status !== 'COMPLETED' &&
                              job.status !== 'CANCELED' && (
                                <button
                                  onClick={() => void handleJobAction(job.id, 'pause')}
                                  className="border border-zinc-700 px-2.5 py-1 text-[11px] font-mono hover:bg-zinc-800 cursor-pointer"
                                >
                                  PAUSE
                                </button>
                              )}
                            {job.status === 'PAUSED' && (
                              <button
                                onClick={() => void handleJobAction(job.id, 'resume')}
                                className="border border-zinc-600 bg-zinc-800 px-2.5 py-1 text-[11px] font-mono hover:bg-zinc-700 cursor-pointer"
                              >
                                RESUME
                              </button>
                            )}
                            {job.status !== 'COMPLETED' && job.status !== 'CANCELED' && (
                              <button
                                onClick={() => void handleJobAction(job.id, 'cancel')}
                                className="border border-red-900/70 text-red-300 px-2.5 py-1 text-[11px] font-mono hover:bg-red-950/40 cursor-pointer"
                              >
                                CANCEL
                              </button>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Selected Job Detail Inspector */}
            {selectedJob && (
              <div className="border border-zinc-700 bg-zinc-900/40 p-5 space-y-4">
                <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
                  <div>
                    <h3 className="text-sm font-semibold text-zinc-100">
                      Job Candidates Inspector: {selectedJob.name}
                    </h3>
                    <p className="text-xs font-mono text-zinc-400">
                      Status: {selectedJob.status} | Processed: {selectedJob.processedCount}/
                      {selectedJob.totalCount} | Registered: {selectedJob.completedCount}
                    </p>
                  </div>
                  <button
                    onClick={() => setSelectedJob(null)}
                    className="text-xs font-mono text-zinc-400 hover:text-zinc-100 cursor-pointer"
                  >
                    [CLOSE X]
                  </button>
                </div>

                <div className="overflow-x-auto max-h-80">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-zinc-800 font-mono text-[11px] text-zinc-400">
                        <th className="p-2">CANDIDATE</th>
                        <th className="p-2">STATE</th>
                        <th className="p-2">ATTEMPTS</th>
                        <th className="p-2">ERROR / NOTES</th>
                        <th className="p-2 text-right">SUPERVISED ACTION</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-800/60">
                      {(selectedJob.candidates ?? []).map((c) => (
                        <tr key={c.id}>
                          <td className="p-2 font-mono text-zinc-100">{c.candidateUsername}</td>
                          <td className="p-2 font-mono text-zinc-300">{c.registrationState}</td>
                          <td className="p-2 font-mono text-zinc-400">{c.attemptCount}</td>
                          <td className="p-2 font-mono text-zinc-500">
                            {c.lastError || 'Ready for human registration'}
                          </td>
                          <td className="p-2 text-right">
                            {c.registrationState !== 'REGISTERED' ? (
                              <button
                                onClick={() => void openSupervisedWorkflow(c.id)}
                                className="bg-zinc-100 text-zinc-950 px-2.5 py-1 text-[11px] font-mono font-medium hover:bg-zinc-300 cursor-pointer"
                              >
                                OPEN CHECKLIST & CONFIRM
                              </button>
                            ) : (
                              <span className="font-mono text-[11px] text-emerald-400">
                                REGISTERED
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ================================================================ */}
        {/* PAGE 3: ACCOUNTS */}
        {/* ================================================================ */}
        {activeTab === 'accounts' && (
          <div className="space-y-6">
            <div className="border border-zinc-800 bg-zinc-900/20">
              <div className="p-4 border-b border-zinc-800 flex flex-wrap items-center justify-between gap-4">
                <div>
                  <h2 className="text-base font-semibold text-zinc-100">
                    Registered Roblox Accounts ({accountsMeta.total})
                  </h2>
                  <p className="text-xs text-zinc-400">
                    Server-side indexed & paginated repository. Credentials remain isolated in the AES-256-GCM Vault.
                  </p>
                </div>
                <div className="flex items-center space-x-2">
                  <button
                    onClick={() => void handleExportAllFormatted()}
                    className="border border-zinc-700 px-3 py-1.5 text-xs font-mono text-zinc-200 hover:bg-zinc-800 cursor-pointer"
                  >
                    EXPORT ALL (USER:PASS:COOKIE)
                  </button>
                  <button
                    onClick={() => setShowCreateAccountModal(true)}
                    className="bg-zinc-100 text-zinc-950 px-3 py-1.5 text-xs font-mono font-medium hover:bg-zinc-300 cursor-pointer"
                  >
                    + ADD REGISTERED ACCOUNT
                  </button>
                </div>
              </div>

              {/* Search, Filter, and Sort Bar */}
              <div className="p-4 border-b border-zinc-800 bg-zinc-900/40 grid grid-cols-1 md:grid-cols-6 gap-3">
                <input
                  type="text"
                  placeholder="Search username, userId, tags..."
                  value={accSearch}
                  onChange={(e) => setAccSearch(e.target.value)}
                  className="md:col-span-2 bg-zinc-950 border border-zinc-800 px-3 py-1.5 text-xs text-zinc-100"
                />
                <select
                  value={accCategoryFilter}
                  onChange={(e) => setAccCategoryFilter(e.target.value)}
                  className="bg-zinc-950 border border-zinc-800 px-3 py-1.5 text-xs text-zinc-100"
                >
                  <option value="">All Categories</option>
                  <option value="STANDARD">STANDARD</option>
                  <option value="TRADING">TRADING</option>
                  <option value="STORAGE">STORAGE</option>
                  <option value="TESTING">TESTING</option>
                  <option value="VIP">VIP</option>
                </select>
                <select
                  value={accRegStatusFilter}
                  onChange={(e) => setAccRegStatusFilter(e.target.value)}
                  className="bg-zinc-950 border border-zinc-800 px-3 py-1.5 text-xs text-zinc-100"
                >
                  <option value="">All Reg Status</option>
                  <option value="REGISTERED">REGISTERED</option>
                  <option value="PENDING_CONFIRMATION">PENDING_CONFIRMATION</option>
                  <option value="SUSPENDED">SUSPENDED</option>
                  <option value="ARCHIVED">ARCHIVED</option>
                </select>
                <select
                  value={accVerifStatusFilter}
                  onChange={(e) => setAccVerifStatusFilter(e.target.value)}
                  className="bg-zinc-950 border border-zinc-800 px-3 py-1.5 text-xs text-zinc-100"
                >
                  <option value="">All Verification</option>
                  <option value="VERIFIED">VERIFIED</option>
                  <option value="VERIFICATION_REQUIRED">VERIFICATION_REQUIRED</option>
                  <option value="UNVERIFIED">UNVERIFIED</option>
                </select>
                <div className="flex space-x-1">
                  <select
                    value={accSortBy}
                    onChange={(e) => setAccSortBy(e.target.value as any)}
                    className="flex-1 bg-zinc-950 border border-zinc-800 px-2 py-1.5 text-xs text-zinc-100"
                  >
                    <option value="created_at">Sort: Created</option>
                    <option value="roblox_username">Sort: Username</option>
                    <option value="category">Sort: Category</option>
                  </select>
                  <button
                    onClick={() =>
                      setAccSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'))
                    }
                    className="border border-zinc-800 bg-zinc-950 px-2.5 text-xs font-mono hover:bg-zinc-800 cursor-pointer"
                  >
                    {accSortOrder.toUpperCase()}
                  </button>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-zinc-800 text-[11px] font-mono text-zinc-400 bg-zinc-900/40">
                      <th className="p-3">ROBLOX USERNAME</th>
                      <th className="p-3">ROBLOX USER ID</th>
                      <th className="p-3">CATEGORY</th>
                      <th className="p-3">REGISTRATION</th>
                      <th className="p-3">VERIFICATION</th>
                      <th className="p-3">VAULT STATUS</th>
                      <th className="p-3">TAGS</th>
                      <th className="p-3 text-right">ACTIONS</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800/60 text-xs">
                    {accounts.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="p-6 text-center text-zinc-500 font-mono">
                          No registered accounts match current filters.
                        </td>
                      </tr>
                    ) : (
                      accounts.map((acc) => (
                        <tr key={acc.id} className="hover:bg-zinc-900/30">
                          <td className="p-3 font-mono font-medium text-zinc-100">
                            {acc.robloxUsername}
                          </td>
                          <td className="p-3 font-mono text-zinc-300">
                            {acc.robloxUserId || '—'}
                          </td>
                          <td className="p-3 font-mono text-zinc-300">{acc.category}</td>
                          <td className="p-3 font-mono">
                            <span className="px-2 py-0.5 text-[10px] border border-zinc-700 bg-zinc-800/40">
                              {acc.registrationStatus}
                            </span>
                          </td>
                          <td className="p-3 font-mono">
                            <span className="px-2 py-0.5 text-[10px] border border-zinc-700">
                              {acc.verificationStatus}
                            </span>
                          </td>
                          <td className="p-3 font-mono text-[11px] text-zinc-400">
                            {acc.hasVaultCredential ? 'AES-256-GCM SEALED' : 'NO SECRET'}
                          </td>
                          <td className="p-3">
                            <div className="flex flex-wrap gap-1">
                              {acc.tags.map((t, idx) => (
                                <span
                                  key={idx}
                                  className="px-1.5 py-0.5 text-[10px] font-mono bg-zinc-800 text-zinc-300"
                                >
                                  #{t}
                                </span>
                              ))}
                            </div>
                          </td>
                          <td className="p-3 text-right space-x-2">
                            <button
                              onClick={() => void handleCopyAccountFormatted(acc.id)}
                              className="border border-emerald-800/80 bg-emerald-950/30 text-emerald-300 px-2.5 py-1 text-[11px] font-mono hover:bg-emerald-900/40 cursor-pointer"
                            >
                              COPY USER:PASS:COOKIE
                            </button>
                            <button
                              onClick={() => setSelectedAccount(acc)}
                              className="border border-zinc-700 px-2.5 py-1 text-[11px] font-mono hover:bg-zinc-800 cursor-pointer"
                            >
                              DETAILS / EDIT
                            </button>
                            {user.role === 'ADMIN' && (
                              <button
                                onClick={() => void handleDeleteAccount(acc.id)}
                                className="border border-red-900/60 text-red-300 px-2 py-1 text-[11px] font-mono hover:bg-red-950/40 cursor-pointer"
                              >
                                DELETE
                              </button>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              <div className="p-3 border-t border-zinc-800 flex items-center justify-between text-xs font-mono text-zinc-400">
                <span>
                  Page {accountsMeta.page} of {accountsMeta.totalPages} ({accountsMeta.total} total accounts)
                </span>
                <div className="space-x-2">
                  <button
                    disabled={accountsMeta.page <= 1}
                    onClick={() => void loadAccounts(accountsMeta.page - 1)}
                    className="border border-zinc-800 px-3 py-1 disabled:opacity-40 hover:bg-zinc-900 cursor-pointer"
                  >
                    PREV
                  </button>
                  <button
                    disabled={accountsMeta.page >= accountsMeta.totalPages}
                    onClick={() => void loadAccounts(accountsMeta.page + 1)}
                    className="border border-zinc-800 px-3 py-1 disabled:opacity-40 hover:bg-zinc-900 cursor-pointer"
                  >
                    NEXT
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ================================================================ */}
        {/* PAGE 4: ACTIVITY LOGS */}
        {/* ================================================================ */}
        {activeTab === 'logs' && (
          <div className="space-y-4">
            <div className="flex items-center space-x-2">
              <button
                onClick={() => setLogSubTab('activity')}
                className={`px-4 py-2 text-xs font-mono border cursor-pointer ${
                  logSubTab === 'activity'
                    ? 'bg-zinc-100 text-zinc-950 border-zinc-100 font-medium'
                    : 'bg-zinc-900 text-zinc-400 border-zinc-800'
                }`}
              >
                SYSTEM & USER ACTIVITY LOGS ({logsMeta.total})
              </button>
              <button
                onClick={() => setLogSubTab('registration')}
                className={`px-4 py-2 text-xs font-mono border cursor-pointer ${
                  logSubTab === 'registration'
                    ? 'bg-zinc-100 text-zinc-950 border-zinc-100 font-medium'
                    : 'bg-zinc-900 text-zinc-400 border-zinc-800'
                }`}
              >
                REGISTRATION CONFIRMATION HISTORY ({regEventsMeta.total})
              </button>
            </div>

            {logSubTab === 'activity' ? (
              <div className="border border-zinc-800 bg-zinc-900/20 overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-zinc-800 font-mono text-[11px] text-zinc-400 bg-zinc-900/40">
                      <th className="p-3">TIMESTAMP</th>
                      <th className="p-3">ACTOR</th>
                      <th className="p-3">ACTION</th>
                      <th className="p-3">ENTITY</th>
                      <th className="p-3">AUDIT DETAILS</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800/60">
                    {activityLogs.map((log) => (
                      <tr key={log.id} className="hover:bg-zinc-900/30">
                        <td className="p-3 font-mono text-zinc-500">
                          {new Date(log.createdAt).toLocaleString()}
                        </td>
                        <td className="p-3 font-mono text-zinc-200">{log.username}</td>
                        <td className="p-3 font-mono text-zinc-100">{log.action}</td>
                        <td className="p-3 font-mono text-zinc-400">
                          {log.entityType} {log.entityId ? `(${log.entityId.slice(0, 8)})` : ''}
                        </td>
                        <td className="p-3 font-mono text-[11px] text-zinc-400">
                          {JSON.stringify(log.details)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="border border-zinc-800 bg-zinc-900/20 overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-zinc-800 font-mono text-[11px] text-zinc-400 bg-zinc-900/40">
                      <th className="p-3">TIMESTAMP</th>
                      <th className="p-3">EVENT TYPE</th>
                      <th className="p-3">CANDIDATE / ROBLOX USERNAME</th>
                      <th className="p-3">ROBLOX USER ID</th>
                      <th className="p-3">STATE TRANSITION</th>
                      <th className="p-3">NOTES</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800/60">
                    {regEvents.map((ev) => (
                      <tr key={ev.id} className="hover:bg-zinc-900/30">
                        <td className="p-3 font-mono text-zinc-500">
                          {new Date(ev.createdAt).toLocaleString()}
                        </td>
                        <td className="p-3 font-mono text-zinc-100">{ev.eventType}</td>
                        <td className="p-3 font-mono text-zinc-200">
                          {ev.robloxUsername || ev.candidateUsername || '—'}
                        </td>
                        <td className="p-3 font-mono text-zinc-300">{ev.robloxUserId || '—'}</td>
                        <td className="p-3 font-mono text-zinc-400">
                          {ev.statusBefore || 'INIT'} → {ev.statusAfter}
                        </td>
                        <td className="p-3 text-zinc-400">{ev.notes || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ================================================================ */}
        {/* PAGE 5: SETTINGS */}
        {/* ================================================================ */}
        {activeTab === 'settings' && settingsData && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="border border-zinc-800 bg-zinc-900/20 p-6">
              <h2 className="text-base font-semibold text-zinc-100 mb-1">
                Generator Default Configuration
              </h2>
              <p className="text-xs text-zinc-400 mb-4 border-b border-zinc-800 pb-3">
                Persisted system defaults for candidate username and password generation.
              </p>

              <form onSubmit={handleSaveSettings} className="space-y-4">
                <div>
                  <label className="block text-xs font-mono text-zinc-400 mb-1">
                    DEFAULT PREFIX
                  </label>
                  <input
                    type="text"
                    value={settingsData.generator.defaultPrefix}
                    onChange={(e) =>
                      setSettingsData({
                        ...settingsData,
                        generator: { ...settingsData.generator, defaultPrefix: e.target.value },
                      })
                    }
                    className="w-full bg-zinc-950 border border-zinc-800 px-3 py-2 text-sm text-zinc-100"
                  />
                </div>
                <div>
                  <label className="block text-xs font-mono text-zinc-400 mb-1">
                    DEFAULT USERNAME LENGTH (3 - 20)
                  </label>
                  <input
                    type="number"
                    min={3}
                    max={20}
                    value={settingsData.generator.defaultLength}
                    onChange={(e) =>
                      setSettingsData({
                        ...settingsData,
                        generator: {
                          ...settingsData.generator,
                          defaultLength: Number(e.target.value),
                        },
                      })
                    }
                    className="w-full bg-zinc-950 border border-zinc-800 px-3 py-2 text-sm text-zinc-100"
                  />
                </div>
                <div>
                  <label className="block text-xs font-mono text-zinc-400 mb-1">
                    DEFAULT PASSWORD LENGTH (12 - 64)
                  </label>
                  <input
                    type="number"
                    min={12}
                    max={64}
                    value={settingsData.generator.defaultPasswordLength}
                    onChange={(e) =>
                      setSettingsData({
                        ...settingsData,
                        generator: {
                          ...settingsData.generator,
                          defaultPasswordLength: Number(e.target.value),
                        },
                      })
                    }
                    className="w-full bg-zinc-950 border border-zinc-800 px-3 py-2 text-sm text-zinc-100"
                  />
                </div>
                <button
                  type="submit"
                  className="bg-zinc-100 text-zinc-950 px-4 py-2 text-xs font-mono font-medium hover:bg-zinc-300 cursor-pointer"
                >
                  SAVE GENERATOR DEFAULTS
                </button>
              </form>
            </div>

            <div className="space-y-6">
              <div className="border border-zinc-800 bg-zinc-900/20 p-6">
                <h2 className="text-base font-semibold text-zinc-100 mb-1">
                  Security & Platform Compliance Controls
                </h2>
                <p className="text-xs text-zinc-400 mb-4 border-b border-zinc-800 pb-3">
                  Enforced safeguards and cryptographic configuration.
                </p>
                <dl className="space-y-2.5 text-xs font-mono">
                  <div className="flex justify-between">
                    <dt className="text-zinc-500">PASSWORD HASHING:</dt>
                    <dd className="text-zinc-200">{settingsData.security.passwordHashing}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-zinc-500">SESSION POLICY:</dt>
                    <dd className="text-zinc-200">{settingsData.security.sessionPolicy}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-zinc-500">CAPTCHA BYPASS PROHIBITED:</dt>
                    <dd className="text-emerald-400">ENFORCED (TRUE)</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-zinc-500">HUMAN SUPERVISION REQUIRED:</dt>
                    <dd className="text-emerald-400">ENFORCED (TRUE)</dd>
                  </div>
                </dl>
              </div>

              <div className="border border-zinc-800 bg-zinc-900/20 p-6">
                <h2 className="text-base font-semibold text-zinc-100 mb-1">
                  Credential Vault & Storage Health
                </h2>
                <p className="text-xs text-zinc-400 mb-4 border-b border-zinc-800 pb-3">
                  Live telemetry from /api/v1/system/health
                </p>
                <dl className="space-y-2.5 text-xs font-mono">
                  <div className="flex justify-between">
                    <dt className="text-zinc-500">VAULT CIPHER:</dt>
                    <dd className="text-zinc-200">{settingsData.storage.vaultAlgorithm}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-zinc-500">MASTER KEY SOURCE:</dt>
                    <dd className="text-zinc-200">{settingsData.storage.keyLocation}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-zinc-500">SEALED VAULT CREDENTIALS:</dt>
                    <dd className="text-zinc-200">
                      {healthData?.vault?.encryptedRecords ?? 0} records
                    </dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-zinc-500">REGISTERED ACCOUNTS:</dt>
                    <dd className="text-zinc-200">
                      {healthData?.metrics?.registeredAccounts ?? 0} records
                    </dd>
                  </div>
                </dl>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* ==================================================================== */}
      {/* MODAL: HUMAN-SUPERVISED REGISTRATION WORKFLOW */}
      {/* ==================================================================== */}
      {supervisedPkg && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-700 max-w-xl w-full p-6 space-y-5 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <div>
                <div className="text-[10px] font-mono text-zinc-400">
                  REFERENCE: {supervisedPkg.referenceCode}
                </div>
                <h3 className="text-base font-semibold text-zinc-100">
                  Human-Supervised Registration Workflow
                </h3>
              </div>
              <button
                onClick={() => setSupervisedPkg(null)}
                className="text-xs font-mono text-zinc-400 hover:text-zinc-100 cursor-pointer"
              >
                [CLOSE X]
              </button>
            </div>

            {/* Candidate Credentials Card for Operator Copy */}
            <div className="border border-zinc-800 bg-zinc-950 p-4 space-y-3 text-xs font-mono">
              <div className="flex items-center justify-between">
                <span className="text-zinc-400">CANDIDATE USERNAME:</span>
                <div className="flex items-center space-x-2">
                  <strong className="text-zinc-100 text-sm">
                    {supervisedPkg.candidateUsername}
                  </strong>
                  <button
                    type="button"
                    onClick={() => {
                      void navigator.clipboard.writeText(supervisedPkg.candidateUsername);
                      showToast('success', 'Username copied to clipboard');
                    }}
                    className="border border-zinc-700 px-2 py-0.5 text-[10px] hover:bg-zinc-800 cursor-pointer"
                  >
                    COPY
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-zinc-400">VAULT PASSWORD:</span>
                <div className="flex items-center space-x-2">
                  <span className="text-zinc-200">
                    {showVaultPassword
                      ? supervisedPkg.generatedPasswordForHumanCopy || 'N/A'
                      : '••••••••••••••••'}
                  </span>
                  <button
                    type="button"
                    onClick={() => setShowVaultPassword(!showVaultPassword)}
                    className="border border-zinc-700 px-2 py-0.5 text-[10px] hover:bg-zinc-800 cursor-pointer"
                  >
                    {showVaultPassword ? 'HIDE' : 'REVEAL'}
                  </button>
                  {supervisedPkg.generatedPasswordForHumanCopy && (
                    <button
                      type="button"
                      onClick={() => {
                        void navigator.clipboard.writeText(
                          supervisedPkg.generatedPasswordForHumanCopy!
                        );
                        showToast('success', 'Password copied to clipboard');
                      }}
                      className="border border-zinc-700 px-2 py-0.5 text-[10px] hover:bg-zinc-800 cursor-pointer"
                    >
                      COPY
                    </button>
                  )}
                </div>
              </div>

              <div className="pt-2 border-t border-zinc-900 flex items-center justify-between">
                <span className="text-zinc-500">ASSISTED BROWSER AUTOFILL:</span>
                <div className="flex items-center space-x-2">
                  <button
                    type="button"
                    onClick={() => void handleStartAssistedBrowser(supervisedPkg.candidateId)}
                    className="bg-emerald-500 text-zinc-950 px-3 py-1 text-[11px] font-mono font-semibold hover:bg-emerald-400 cursor-pointer"
                  >
                    AUTO-OPEN BROWSER & AUTOFILL FORM
                  </button>
                  <a
                    href={supervisedPkg.officialRegistrationUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline text-zinc-300 hover:text-white"
                  >
                    Manual Link ↗
                  </a>
                </div>
              </div>
            </div>

            {assistedSession && assistedSession.candidateId === supervisedPkg.candidateId && (
              <div className="p-3 border border-emerald-800/80 bg-emerald-950/30 text-xs font-mono space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-emerald-300 font-semibold">
                    STATUS AUTOFILL: {assistedSession.status}
                  </span>
                </div>
                <div className="text-zinc-200">{assistedSession.message}</div>
                {assistedSession.formattedOutput && (
                  <div className="pt-2 border-t border-emerald-900/60 space-y-1">
                    <div className="text-[11px] text-emerald-400">
                      FORMAT TERSIMPAN (username:password:cookie):
                    </div>
                    <div className="p-2 bg-zinc-950 border border-zinc-800 text-[11px] break-all text-zinc-200">
                      {assistedSession.formattedOutput}
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        void navigator.clipboard.writeText(assistedSession.formattedOutput!);
                        showToast('success', 'Copied username:password:cookie!');
                      }}
                      className="bg-zinc-100 text-zinc-950 px-3 py-1 text-[11px] font-semibold hover:bg-zinc-300 cursor-pointer"
                    >
                      COPY USERNAME:PASSWORD:COOKIE
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Preparation Checklist */}
            <div className="space-y-2">
              <div className="text-xs font-mono text-zinc-400 uppercase">
                Supervised Checklist
              </div>
              {supervisedPkg.checklist.map((item) => (
                <div
                  key={item.step}
                  className="p-2.5 border border-zinc-800 bg-zinc-950/50 text-xs"
                >
                  <div className="font-mono font-semibold text-zinc-200">
                    STEP {item.step}: {item.title}
                  </div>
                  <div className="text-zinc-400 mt-0.5">{item.description}</div>
                </div>
              ))}
            </div>

            {/* Confirmation Form */}
            <form onSubmit={handleConfirmRegistration} className="space-y-3 pt-2 border-t border-zinc-800">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-mono text-zinc-400 mb-1">
                    RESULTING ROBLOX USER ID *
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. 7182930412"
                    value={confirmRobloxUserId}
                    onChange={(e) => setConfirmRobloxUserId(e.target.value)}
                    className="w-full bg-zinc-950 border border-zinc-800 px-3 py-2 text-xs text-zinc-100"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-mono text-zinc-400 mb-1">
                    FINAL ROBLOX USERNAME *
                  </label>
                  <input
                    type="text"
                    value={confirmRobloxUsername}
                    onChange={(e) => setConfirmRobloxUsername(e.target.value)}
                    className="w-full bg-zinc-950 border border-zinc-800 px-3 py-2 text-xs text-zinc-100"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-mono text-zinc-400 mb-1">
                    ACCOUNT CATEGORY
                  </label>
                  <select
                    value={confirmCategory}
                    onChange={(e) => setConfirmCategory(e.target.value)}
                    className="w-full bg-zinc-950 border border-zinc-800 px-3 py-2 text-xs text-zinc-100"
                  >
                    <option value="STANDARD">STANDARD</option>
                    <option value="TRADING">TRADING</option>
                    <option value="STORAGE">STORAGE</option>
                    <option value="TESTING">TESTING</option>
                    <option value="VIP">VIP</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-mono text-zinc-400 mb-1">
                    OPERATOR NOTES
                  </label>
                  <input
                    type="text"
                    value={confirmNotes}
                    onChange={(e) => setConfirmNotes(e.target.value)}
                    placeholder="Optional verification notes"
                    className="w-full bg-zinc-950 border border-zinc-800 px-3 py-2 text-xs text-zinc-100"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-mono text-zinc-400 mb-1">
                  .ROBLOSECURITY COOKIE (OPTIONAL IF USING MANUAL CONFIRM)
                </label>
                <input
                  type="text"
                  value={confirmCookie}
                  onChange={(e) => setConfirmCookie(e.target.value)}
                  placeholder="_|WARNING:-DO-NOT-SHARE-THIS... (Otomatis terisi jika memakai Auto-Open Browser)"
                  className="w-full bg-zinc-950 border border-zinc-800 px-3 py-2 text-xs text-zinc-100 font-mono"
                />
              </div>

              <div className="flex items-center justify-between pt-3">
                <button
                  type="button"
                  onClick={handleMarkVerificationRequired}
                  className="border border-zinc-700 px-3 py-2 text-xs font-mono text-zinc-300 hover:bg-zinc-800 cursor-pointer"
                >
                  FLAG VERIFICATION REQUIRED
                </button>
                <button
                  type="submit"
                  className="bg-zinc-100 text-zinc-950 px-5 py-2 text-xs font-mono font-semibold hover:bg-zinc-300 cursor-pointer"
                >
                  CONFIRM & RECORD REGISTERED ACCOUNT
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* MODAL: CREATE REGISTERED ACCOUNT */}
      {/* ==================================================================== */}
      {showCreateAccountModal && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-700 max-w-md w-full p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <h3 className="text-sm font-semibold text-zinc-100">
                Add Registered Roblox Account
              </h3>
              <button
                onClick={() => setShowCreateAccountModal(false)}
                className="text-xs font-mono text-zinc-400 hover:text-zinc-100 cursor-pointer"
              >
                [CLOSE X]
              </button>
            </div>

            <form onSubmit={handleCreateManualAccount} className="space-y-3 text-xs">
              <div>
                <label className="block font-mono text-zinc-400 mb-1">ROBLOX USERNAME *</label>
                <input
                  type="text"
                  value={newAccUsername}
                  onChange={(e) => setNewAccUsername(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 px-3 py-2 text-zinc-100"
                  required
                />
              </div>
              <div>
                <label className="block font-mono text-zinc-400 mb-1">ROBLOX USER ID</label>
                <input
                  type="text"
                  value={newAccUserId}
                  onChange={(e) => setNewAccUserId(e.target.value)}
                  placeholder="Numeric ID"
                  className="w-full bg-zinc-950 border border-zinc-800 px-3 py-2 text-zinc-100"
                />
              </div>
              <div>
                <label className="block font-mono text-zinc-400 mb-1">
                  PASSWORD (ENCRYPTED IN VAULT)
                </label>
                <input
                  type="password"
                  value={newAccPassword}
                  onChange={(e) => setNewAccPassword(e.target.value)}
                  placeholder="Optional — sealed with AES-256-GCM"
                  className="w-full bg-zinc-950 border border-zinc-800 px-3 py-2 text-zinc-100"
                />
              </div>
              <div>
                <label className="block font-mono text-zinc-400 mb-1">CATEGORY</label>
                <select
                  value={newAccCategory}
                  onChange={(e) => setNewAccCategory(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 px-3 py-2 text-zinc-100"
                >
                  <option value="STANDARD">STANDARD</option>
                  <option value="TRADING">TRADING</option>
                  <option value="STORAGE">STORAGE</option>
                  <option value="TESTING">TESTING</option>
                  <option value="VIP">VIP</option>
                </select>
              </div>
              <div>
                <label className="block font-mono text-zinc-400 mb-1">TAGS (COMMA SEPARATED)</label>
                <input
                  type="text"
                  value={newAccTags}
                  onChange={(e) => setNewAccTags(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 px-3 py-2 text-zinc-100"
                />
              </div>
              <div>
                <label className="block font-mono text-zinc-400 mb-1">NOTES</label>
                <textarea
                  value={newAccNotes}
                  onChange={(e) => setNewAccNotes(e.target.value)}
                  rows={2}
                  className="w-full bg-zinc-950 border border-zinc-800 px-3 py-2 text-zinc-100"
                />
              </div>
              <button
                type="submit"
                className="w-full bg-zinc-100 text-zinc-950 py-2 font-mono font-semibold hover:bg-zinc-300 cursor-pointer"
              >
                SAVE ACCOUNT RECORD
              </button>
            </form>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* MODAL: ACCOUNT DETAILS & EDIT */}
      {/* ==================================================================== */}
      {selectedAccount && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-700 max-w-lg w-full p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <div>
                <div className="text-[10px] font-mono text-zinc-500">UUID: {selectedAccount.id}</div>
                <h3 className="text-sm font-semibold text-zinc-100">
                  Account Record: {selectedAccount.robloxUsername}
                </h3>
              </div>
              <button
                onClick={() => setSelectedAccount(null)}
                className="text-xs font-mono text-zinc-400 hover:text-zinc-100 cursor-pointer"
              >
                [CLOSE X]
              </button>
            </div>

            {selectedAccount.credentialMetadata && (
              <div className="p-3 border border-zinc-800 bg-zinc-950 text-[11px] font-mono space-y-1">
                <div className="text-zinc-300 font-semibold">
                  CREDENTIAL VAULT METADATA (SECRET REDACTED)
                </div>
                <div className="text-zinc-500">
                  Vault ID: {selectedAccount.credentialMetadata.id}
                </div>
                <div className="text-zinc-500">
                  Cipher: {selectedAccount.credentialMetadata.algorithm} (Key v
                  {selectedAccount.credentialMetadata.keyVersion})
                </div>
                <div className="text-zinc-500 break-all">
                  HMAC-SHA256: {selectedAccount.credentialMetadata.fingerprintSha256}
                </div>
              </div>
            )}

            <form onSubmit={handleUpdateAccount} className="space-y-3 text-xs">
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block font-mono text-zinc-400 mb-1">CATEGORY</label>
                  <select
                    value={selectedAccount.category}
                    onChange={(e) =>
                      setSelectedAccount({ ...selectedAccount, category: e.target.value })
                    }
                    className="w-full bg-zinc-950 border border-zinc-800 px-2 py-2 text-zinc-100"
                  >
                    <option value="STANDARD">STANDARD</option>
                    <option value="TRADING">TRADING</option>
                    <option value="STORAGE">STORAGE</option>
                    <option value="TESTING">TESTING</option>
                    <option value="VIP">VIP</option>
                  </select>
                </div>
                <div>
                  <label className="block font-mono text-zinc-400 mb-1">REGISTRATION</label>
                  <select
                    value={selectedAccount.registrationStatus}
                    onChange={(e) =>
                      setSelectedAccount({
                        ...selectedAccount,
                        registrationStatus: e.target.value as any,
                      })
                    }
                    className="w-full bg-zinc-950 border border-zinc-800 px-2 py-2 text-zinc-100"
                  >
                    <option value="REGISTERED">REGISTERED</option>
                    <option value="PENDING_CONFIRMATION">PENDING_CONFIRMATION</option>
                    <option value="SUSPENDED">SUSPENDED</option>
                    <option value="ARCHIVED">ARCHIVED</option>
                  </select>
                </div>
                <div>
                  <label className="block font-mono text-zinc-400 mb-1">VERIFICATION</label>
                  <select
                    value={selectedAccount.verificationStatus}
                    onChange={(e) =>
                      setSelectedAccount({
                        ...selectedAccount,
                        verificationStatus: e.target.value as any,
                      })
                    }
                    className="w-full bg-zinc-950 border border-zinc-800 px-2 py-2 text-zinc-100"
                  >
                    <option value="VERIFIED">VERIFIED</option>
                    <option value="VERIFICATION_REQUIRED">VERIFICATION_REQUIRED</option>
                    <option value="UNVERIFIED">UNVERIFIED</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-mono text-zinc-400 mb-1">NOTES</label>
                <textarea
                  rows={3}
                  value={selectedAccount.notes ?? ''}
                  onChange={(e) =>
                    setSelectedAccount({ ...selectedAccount, notes: e.target.value })
                  }
                  className="w-full bg-zinc-950 border border-zinc-800 px-3 py-2 text-zinc-100"
                />
              </div>

              <button
                type="submit"
                className="w-full bg-zinc-100 text-zinc-950 py-2 font-mono font-semibold hover:bg-zinc-300 cursor-pointer"
              >
                UPDATE ACCOUNT RECORD
              </button>
            </form>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* MODAL: EXPORT USERNAME:PASSWORD:COOKIE */}
      {/* ==================================================================== */}
      {exportModalText !== null && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-700 max-w-2xl w-full p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <div>
                <div className="text-[10px] font-mono text-emerald-400">
                  FORMAT: USERNAME:PASSWORD:COOKIE
                </div>
                <h3 className="text-sm font-semibold text-zinc-100">
                  Registered Account Credentials Export
                </h3>
              </div>
              <button
                onClick={() => setExportModalText(null)}
                className="text-xs font-mono text-zinc-400 hover:text-zinc-100 cursor-pointer"
              >
                [CLOSE X]
              </button>
            </div>

            <textarea
              readOnly
              rows={8}
              value={exportModalText}
              className="w-full bg-zinc-950 border border-zinc-800 p-3 text-xs font-mono text-zinc-200 focus:outline-none"
            />

            <div className="flex items-center justify-between">
              <span className="text-[11px] font-mono text-zinc-500">
                Juga otomatis tersimpan di: ./data/registered_accounts.txt
              </span>
              <button
                type="button"
                onClick={() => {
                  void navigator.clipboard.writeText(exportModalText);
                  showToast('success', 'Copied username:password:cookie to clipboard!');
                }}
                className="bg-zinc-100 text-zinc-950 px-4 py-2 text-xs font-mono font-semibold hover:bg-zinc-300 cursor-pointer"
              >
                COPY ALL TO CLIPBOARD
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
