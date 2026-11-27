export interface UserInfo {
  id: string;
  username: string;
  email: string;
  role: 'ADMIN' | 'OPERATOR' | 'VIEWER';
}

export interface GeneratedCandidate {
  id: string;
  jobId: string | null;
  candidateUsername: string;
  prefix: string | null;
  suffix: string | null;
  length: number;
  credentialId: string | null;
  credentialFingerprint: string | null;
  validationStatus: 'VALID' | 'INVALID';
  validationErrors: string[];
  registrationState: string;
  accountId: string | null;
  attemptCount: number;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface RegistrationJob {
  id: string;
  name: string;
  status: 'PENDING' | 'PROCESSING' | 'PAUSED' | 'COMPLETED' | 'FAILED' | 'VERIFICATION_REQUIRED' | 'CANCELED';
  totalCount: number;
  processedCount: number;
  completedCount: number;
  failedCount: number;
  verificationRequiredCount: number;
  progressPercent: number;
  config: Record<string, unknown>;
  errorMessage: string | null;
  startedAt: string | null;
  pausedAt: string | null;
  completedAt: string | null;
  canceledAt: string | null;
  createdById: string | null;
  createdAt: string;
  updatedAt: string;
  candidates?: GeneratedCandidate[];
}

export interface AccountItem {
  id: string;
  robloxUsername: string;
  robloxUserId: string | null;
  credentialId: string | null;
  hasVaultCredential: boolean;
  credentialMetadata: {
    id: string;
    keyVersion: number;
    algorithm: string;
    secretType: string;
    fingerprintSha256: string;
    rotatedAt: string | null;
    createdAt: string;
    updatedAt: string;
  } | null;
  category: string;
  registrationStatus: 'REGISTERED' | 'PENDING_CONFIRMATION' | 'SUSPENDED' | 'ARCHIVED';
  verificationStatus: 'UNVERIFIED' | 'VERIFICATION_REQUIRED' | 'VERIFIED';
  notes: string | null;
  tags: string[];
  createdById: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SupervisedChecklistPackage {
  candidateId: string;
  jobId: string | null;
  referenceCode: string;
  candidateUsername: string;
  generatedPasswordForHumanCopy: string | null;
  credentialFingerprint: string | null;
  officialRegistrationUrl: string;
  registrationState: string;
  checklist: Array<{
    step: number;
    title: string;
    description: string;
    required: boolean;
  }>;
}

export interface RegistrationEventItem {
  id: string;
  candidateId: string;
  candidateUsername: string | null;
  accountId: string | null;
  jobId: string | null;
  eventType: string;
  statusBefore: string | null;
  statusAfter: string;
  robloxUserId: string | null;
  robloxUsername: string | null;
  notes: string | null;
  performedById: string | null;
  performedByUsername: string | null;
  createdAt: string;
}

export interface ActivityLogItem {
  id: string;
  userId: string | null;
  username: string;
  action: string;
  entityType: string;
  entityId: string | null;
  details: Record<string, unknown>;
  ipAddress: string | null;
  createdAt: string;
}

export interface PaginatedMeta {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface AssistedSessionStatus {
  candidateId: string;
  candidateUsername: string;
  workerId?: number;
  proxyUsed?: string | null;
  status:
    | 'LAUNCHING'
    | 'FORM_FILLED_WAITING_HUMAN'
    | 'CAPTURED_SAVING'
    | 'COMPLETED'
    | 'CANCELED'
    | 'ERROR';
  message: string;
  robloxUserId: string | null;
  robloxUsername: string | null;
  accountId: string | null;
  formattedOutput: string | null;
  startedAt: string;
  updatedAt: string;
}

export type BrowserVariant =
  | 'CHROME'
  | 'EDGE'
  | 'FIREFOX'
  | 'FIREFOX_MAIN'
  | 'FIREFOX_MANUAL'
  | 'CHROMIUM'
  | 'ROTATE';

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

export interface ChromeExtensionInfo {
  userDataDir: string | null;
  sourceProfileDir: string | null;
  customExtensionsDir: string;
  extensions: Array<{
    id: string;
    name: string;
    version: string;
    path: string;
    source: 'CHROME_PROFILE' | 'CUSTOM_DIR';
  }>;
}

export interface FirefoxProfileInfo {
  executablePath: string | null;
  mainProfileDir: string | null;
  isMainProfileLocked: boolean;
  configuredProxyHint?: string | null;
  profiles: Array<{
    name: string;
    path: string;
    isDefault: boolean;
    hasData?: boolean;
  }>;
  masterProfile?: MasterFirefoxProfileStatus;
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
  totalTarget: number;
  completedCount: number;
  failedCount: number;
  replacedCount?: number;
  activeWorkerCount: number;
  workers: WorkerSlotStatus[];
  registeredLines: string[];
  startedAt: string | null;
  updatedAt: string | null;
  proxyTotalBytes?: number;
  proxyTotalBlockedRequests?: number;
}

class ApiClient {
  private csrfToken: string | null = null;

  public setCsrfToken(token: string | null) {
    this.csrfToken = token;
  }

  public async request<T>(
    path: string,
    options: RequestInit = {}
  ): Promise<{ data: T; meta?: PaginatedMeta }> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...((options.headers as Record<string, string>) ?? {}),
    };

    if (this.csrfToken) {
      headers['X-CSRF-Token'] = this.csrfToken;
    }

    const res = await fetch(`/api/v1${path}`, {
      ...options,
      credentials: 'include',
      headers,
    });

    const rawText = await res.text();
    let json: any = null;
    try {
      json = rawText ? JSON.parse(rawText) : null;
    } catch {
      const snippet = rawText.trim().slice(0, 40).toLowerCase();
      if (snippet.startsWith('<!doctype') || snippet.startsWith('<html')) {
        throw new Error(
          `Endpoint API mengembalikan halaman HTML (HTTP ${res.status}). Kemungkinan server backend masih menjalankan versi lama—silakan restart server RAGE.`
        );
      }
      throw new Error(`Respons server bukan JSON valid (HTTP ${res.status}).`);
    }

    if (!res.ok || !json?.success) {
      throw new Error(json?.error?.message || `HTTP Error ${res.status}`);
    }

    return {
      data: json.data as T,
      meta: json.meta as PaginatedMeta | undefined,
    };
  }
}

export const api = new ApiClient();
