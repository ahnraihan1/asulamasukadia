import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { db, UserRecord, ActivityLogRecord } from '../db/index.js';
import { env } from '../config/env.js';
import {
  AuthService,
  requireAuth,
  requireRole,
  SESSION_COOKIE_NAME,
} from '../middleware/auth.js';
import { ApiError } from '../middleware/errorHandler.js';
import { GeneratorService } from '../services/generatorService.js';
import { JobManager } from '../queue/jobManager.js';
import { RegistrationService } from '../services/registrationService.js';
import { AccountService } from '../services/accountService.js';
import { BrowserAssistService } from '../services/browserAssistService.js';
import {
  buildManualBookmarkletHref,
  buildManualUserscriptSource,
  renderManualAutofillBridgeHtml,
} from '../services/robloxFormFiller.js';
import { CredentialVault } from '../vault/credentialVault.js';

export const apiV1Router = Router();

// Helper wrapper for async route handlers
const asyncHandler =
  (fn: (req: Request, res: Response, next: NextFunction) => Promise<void> | void) =>
  (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };

// ============================================================================
// SYSTEM HEALTH
// ============================================================================
apiV1Router.get(
  '/system/health',
  asyncHandler((_req, res) => {
    const dbHealth = db.healthCheck();
    const counts = db.raw
      .prepare(
        `SELECT
          (SELECT COUNT(*) FROM accounts WHERE deleted_at IS NULL) as accounts_count,
          (SELECT COUNT(*) FROM generated_account_data) as candidates_count,
          (SELECT COUNT(*) FROM account_generation_jobs) as jobs_count,
          (SELECT COUNT(*) FROM credential_metadata WHERE deleted_at IS NULL) as vault_items_count`
      )
      .get() as {
      accounts_count: number;
      candidates_count: number;
      jobs_count: number;
      vault_items_count: number;
    };

    res.json({
      success: true,
      data: {
        status: 'healthy',
        version: '1.0.0',
        timestamp: new Date().toISOString(),
        database: dbHealth,
        vault: {
          algorithm: 'AES-256-GCM',
          keyConfigured: env.VAULT_MASTER_KEY.length === 64,
          encryptedRecords: Number(counts.vault_items_count ?? 0),
        },
        metrics: {
          registeredAccounts: Number(counts.accounts_count ?? 0),
          generatedCandidates: Number(counts.candidates_count ?? 0),
          totalJobs: Number(counts.jobs_count ?? 0),
        },
      },
    });
  })
);

// ============================================================================
// AUTHENTICATION (/api/v1/auth)
// ============================================================================
const loginSchema = z.object({
  username: z.string().min(1, 'Username is required').max(64),
  password: z.string().min(1, 'Password is required').max(128),
});

apiV1Router.post(
  '/auth/login',
  asyncHandler(async (req, res) => {
    const { username, password } = loginSchema.parse(req.body);

    const user = db.raw
      .prepare(
        'SELECT * FROM users WHERE LOWER(username) = LOWER(?) AND deleted_at IS NULL AND is_active = 1'
      )
      .get(username.trim()) as UserRecord | undefined;

    if (!user) {
      throw new ApiError(401, 'INVALID_CREDENTIALS', 'Invalid username or password');
    }

    const valid = await AuthService.verifyPassword(password, user.password_hash);
    if (!valid) {
      throw new ApiError(401, 'INVALID_CREDENTIALS', 'Invalid username or password');
    }

    const session = AuthService.createSession(user.id);

    db.logActivity({
      userId: user.id,
      action: 'AUTH_LOGIN',
      entityType: 'USER',
      entityId: user.id,
      details: { username: user.username, role: user.role },
      ipAddress: req.ip ?? null,
    });

    res.cookie(SESSION_COOKIE_NAME, session.sessionId, {
      httpOnly: true,
      secure: env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 24 * 60 * 60 * 1000,
      path: '/',
    });

    res.json({
      success: true,
      data: {
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          role: user.role,
        },
        csrfToken: session.csrfToken,
        token: session.sessionId,
        expiresAt: session.expiresAt,
      },
    });
  })
);

apiV1Router.post(
  '/auth/logout',
  requireAuth,
  asyncHandler((req, res) => {
    if (req.sessionId) {
      AuthService.revokeSession(req.sessionId);
    }
    db.logActivity({
      userId: req.user?.id ?? null,
      action: 'AUTH_LOGOUT',
      entityType: 'USER',
      entityId: req.user?.id ?? null,
      ipAddress: req.ip ?? null,
    });
    res.clearCookie(SESSION_COOKIE_NAME, { path: '/' });
    res.json({
      success: true,
      data: { message: 'Logged out successfully' },
    });
  })
);

apiV1Router.get(
  '/auth/me',
  requireAuth,
  asyncHandler((req, res) => {
    res.json({
      success: true,
      data: {
        user: req.user,
        csrfToken: req.csrfToken,
      },
    });
  })
);

// ============================================================================
// ACCOUNT DATA GENERATOR & JOBS (/api/v1/generator)
// ============================================================================
const generateSchema = z.object({
  quantity: z.coerce.number().int().min(1).max(5000).default(10),
  prefix: z
    .string()
    .max(15)
    .regex(/^[a-zA-Z0-9_]*$/, 'Prefix may only contain letters, numbers, or underscore')
    .optional()
    .default(''),
  suffix: z
    .string()
    .max(15)
    .regex(/^[a-zA-Z0-9_]*$/, 'Suffix may only contain letters, numbers, or underscore')
    .optional()
    .default(''),
  length: z.coerce.number().int().min(3).max(20).default(12),
  passwordPrefix: z.string().max(32).optional().default(''),
  passwordLength: z.coerce.number().int().min(12).max(64).default(16),
  includeSymbols: z.boolean().optional().default(true),
  createPreparationJob: z.boolean().optional().default(true),
  jobName: z.string().max(128).optional(),
});

apiV1Router.post(
  '/generator/generate',
  requireAuth,
  requireRole('ADMIN', 'OPERATOR'),
  asyncHandler((req, res) => {
    const parsed = generateSchema.parse(req.body);

    if (parsed.createPreparationJob) {
      const job = JobManager.createJob({
        name: parsed.jobName,
        generationConfig: {
          quantity: parsed.quantity,
          prefix: parsed.prefix,
          suffix: parsed.suffix,
          length: parsed.length,
          passwordPrefix: parsed.passwordPrefix,
          passwordLength: parsed.passwordLength,
          includeSymbols: parsed.includeSymbols,
        },
        createdById: req.user?.id ?? null,
        autoStart: true,
      });

      res.status(201).json({
        success: true,
        data: {
          job,
          candidates: job.candidates ?? [],
          totalGenerated: job.totalCount,
        },
      });
      return;
    }

    const result = GeneratorService.generateBatch({
      quantity: parsed.quantity,
      prefix: parsed.prefix,
      suffix: parsed.suffix,
      length: parsed.length,
      passwordPrefix: parsed.passwordPrefix,
      passwordLength: parsed.passwordLength,
      includeSymbols: parsed.includeSymbols,
      createdById: req.user?.id ?? null,
    });

    res.status(201).json({
      success: true,
      data: {
        job: null,
        candidates: result.candidates,
        duplicatesSkipped: result.duplicatesSkipped,
        totalGenerated: result.candidates.length,
      },
    });
  })
);

apiV1Router.get(
  '/generator/candidates',
  requireAuth,
  asyncHandler((req, res) => {
    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 25;
    const jobId = typeof req.query.jobId === 'string' ? req.query.jobId : undefined;
    const state = typeof req.query.state === 'string' ? req.query.state : undefined;
    const validationStatus =
      typeof req.query.validationStatus === 'string' ? req.query.validationStatus : undefined;
    const search = typeof req.query.search === 'string' ? req.query.search : undefined;

    const list = GeneratorService.listCandidates({
      page,
      limit,
      jobId,
      state,
      validationStatus,
      search,
    });

    res.json({
      success: true,
      data: list.items,
      meta: {
        total: list.total,
        page: list.page,
        limit: list.limit,
        totalPages: list.totalPages,
      },
    });
  })
);

apiV1Router.post(
  '/generator/candidates/:id/regenerate',
  requireAuth,
  requireRole('ADMIN', 'OPERATOR'),
  asyncHandler((req, res) => {
    const updated = GeneratorService.regenerateCandidate(String(req.params.id), req.user?.id ?? null);
    res.json({
      success: true,
      data: updated,
    });
  })
);

apiV1Router.get(
  '/generator/jobs',
  requireAuth,
  asyncHandler((req, res) => {
    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 20;
    const status = typeof req.query.status === 'string' ? req.query.status : undefined;

    const jobs = JobManager.listJobs({ page, limit, status });
    res.json({
      success: true,
      data: jobs.items,
      meta: {
        total: jobs.total,
        page: jobs.page,
        limit: jobs.limit,
        totalPages: jobs.totalPages,
      },
    });
  })
);

const createJobFromCandidatesSchema = z.object({
  name: z.string().max(128).optional(),
  candidateIds: z.array(z.string().uuid()).min(1),
});

apiV1Router.post(
  '/generator/jobs',
  requireAuth,
  requireRole('ADMIN', 'OPERATOR'),
  asyncHandler((req, res) => {
    const parsed = createJobFromCandidatesSchema.parse(req.body);
    const job = JobManager.createJob({
      name: parsed.name,
      candidateIds: parsed.candidateIds,
      createdById: req.user?.id ?? null,
      autoStart: true,
    });
    res.status(201).json({
      success: true,
      data: job,
    });
  })
);

apiV1Router.get(
  '/generator/jobs/:id',
  requireAuth,
  asyncHandler((req, res) => {
    const job = JobManager.getJobById(String(req.params.id), true);
    if (!job) {
      throw new ApiError(404, 'JOB_NOT_FOUND', 'Registration job not found');
    }
    res.json({
      success: true,
      data: job,
    });
  })
);

apiV1Router.post(
  '/generator/jobs/:id/pause',
  requireAuth,
  requireRole('ADMIN', 'OPERATOR'),
  asyncHandler((req, res) => {
    const job = JobManager.pauseJob(String(req.params.id), req.user?.id ?? null);
    res.json({
      success: true,
      data: job,
    });
  })
);

apiV1Router.post(
  '/generator/jobs/:id/resume',
  requireAuth,
  requireRole('ADMIN', 'OPERATOR'),
  asyncHandler(async (req, res) => {
    const job = await JobManager.resumeJob(String(req.params.id), req.user?.id ?? null);
    res.json({
      success: true,
      data: job,
    });
  })
);

apiV1Router.post(
  '/generator/jobs/:id/cancel',
  requireAuth,
  requireRole('ADMIN', 'OPERATOR'),
  asyncHandler((req, res) => {
    const job = JobManager.cancelJob(String(req.params.id), req.user?.id ?? null);
    res.json({
      success: true,
      data: job,
    });
  })
);

// ============================================================================
// HUMAN-SUPERVISED REGISTRATION WORKFLOW (/api/v1/registration)
// ============================================================================
apiV1Router.get(
  '/registration/history',
  requireAuth,
  asyncHandler((req, res) => {
    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 25;
    const jobId = typeof req.query.jobId === 'string' ? req.query.jobId : undefined;
    const candidateId = typeof req.query.candidateId === 'string' ? req.query.candidateId : undefined;
    const eventType = typeof req.query.eventType === 'string' ? req.query.eventType : undefined;

    const history = RegistrationService.getHistory({
      page,
      limit,
      jobId,
      candidateId,
      eventType,
    });

    res.json({
      success: true,
      data: history.items,
      meta: {
        total: history.total,
        page: history.page,
        limit: history.limit,
        totalPages: history.totalPages,
      },
    });
  })
);

apiV1Router.get(
  '/registration/:id/checklist',
  requireAuth,
  requireRole('ADMIN', 'OPERATOR'),
  asyncHandler((req, res) => {
    const pkg = RegistrationService.getPreparationPackage(String(req.params.id));
    res.json({
      success: true,
      data: pkg,
    });
  })
);

const confirmRegistrationSchema = z.object({
  robloxUserId: z
    .string()
    .trim()
    .regex(/^\d{1,20}$/, 'Roblox User ID must be a numeric ID (e.g. 123456789)'),
  robloxUsername: z
    .string()
    .trim()
    .min(3)
    .max(20)
    .regex(/^[a-zA-Z0-9_]+$/)
    .optional(),
  cookie: z.string().max(4096).optional().nullable(),
  category: z.string().max(64).optional().default('STANDARD'),
  verificationStatus: z
    .enum(['UNVERIFIED', 'VERIFICATION_REQUIRED', 'VERIFIED'])
    .optional()
    .default('VERIFIED'),
  notes: z.string().max(1000).optional(),
  tags: z.array(z.string().max(32)).max(20).optional(),
});

apiV1Router.post(
  '/registration/:id/confirm',
  requireAuth,
  requireRole('ADMIN', 'OPERATOR'),
  asyncHandler((req, res) => {
    const parsed = confirmRegistrationSchema.parse(req.body);
    const result = RegistrationService.confirmRegistration(String(req.params.id), {
      ...parsed,
      performedById: req.user?.id ?? null,
    });
    if (result.formattedCredential) {
      BrowserAssistService.appendExportFile(result.formattedCredential);
    }
    res.status(201).json({
      success: true,
      data: result,
    });
  })
);

apiV1Router.post(
  '/registration/:id/assist-browser',
  requireAuth,
  requireRole('ADMIN', 'OPERATOR'),
  asyncHandler(async (req, res) => {
    const status = await BrowserAssistService.startAssistedSession(
      String(req.params.id),
      req.user?.id ?? null
    );
    res.json({
      success: true,
      data: status,
    });
  })
);

apiV1Router.get(
  '/registration/:id/assist-status',
  requireAuth,
  requireRole('ADMIN', 'OPERATOR'),
  asyncHandler((req, res) => {
    const status = BrowserAssistService.getSessionStatus(String(req.params.id));
    res.json({
      success: true,
      data: status,
    });
  })
);

const batchStartSchema = z.object({
  usernamePrefix: z
    .string()
    .max(15)
    .regex(/^[a-zA-Z0-9_]*$/, 'Prefix username hanya boleh huruf/angka/underscore')
    .optional()
    .default('rbx'),
  usernameLength: z.coerce.number().int().min(3).max(20).optional().default(12),
  passwordPrefix: z.string().max(32).optional().default(''),
  passwordLength: z.coerce.number().int().min(12).max(64).optional().default(16),
  birthDay: z.string().max(10).optional().default('RANDOM'),
  birthMonth: z.string().max(10).optional().default('RANDOM'),
  birthYear: z.string().max(10).optional().default('RANDOM'),
  gender: z.enum(['MALE', 'FEMALE', 'RANDOM']).optional().default('RANDOM'),
  quantity: z.coerce.number().int().min(1).max(5000).default(1),
  workerCount: z.coerce.number().int().min(1).default(1),
  browserVariant: z
    .enum(['CHROME', 'EDGE', 'FIREFOX', 'FIREFOX_MAIN', 'FIREFOX_MANUAL', 'CHROMIUM', 'ROTATE'])
    .optional()
    .default('CHROME'),
  clearProfileBeforeRun: z.boolean().optional().default(true),
  customFirefoxProfilePath: z.string().max(512).optional(),
  useMasterWarmProfile: z.boolean().optional().default(true),
  useProxy: z.boolean().optional().default(false),
  proxyList: z.array(z.string()).optional().default([]),
  proxyDataSaver: z.boolean().optional().default(true),
  proxyBlockHeavyMedia: z.boolean().optional().default(false),
  autoSplitWindow: z.boolean().optional().default(true),
  windowSplitMode: z.enum(['AUTO', 'COLUMNS', 'GRID']).optional().default('AUTO'),
  workerTimeoutSeconds: z.coerce.number().int().min(0).max(3600).optional().default(120),
  proxyOneAccountOneSticky: z.boolean().optional().default(true),
});

apiV1Router.get(
  '/registration/firefox-profile-info',
  requireAuth,
  asyncHandler((req, res) => {
    const customPath =
      typeof req.query.customPath === 'string' ? req.query.customPath : undefined;
    const info = BrowserAssistService.getFirefoxProfileInfo(customPath);
    res.json({
      success: true,
      data: info,
    });
  })
);

apiV1Router.get(
  '/registration/chrome-extension-info',
  requireAuth,
  asyncHandler((_req, res) => {
    const info = BrowserAssistService.detectChromeExtensions();
    res.json({
      success: true,
      data: info,
    });
  })
);

apiV1Router.post(
  '/registration/chrome-extension-sync',
  requireAuth,
  requireRole('ADMIN', 'OPERATOR'),
  asyncHandler((req, res) => {
    const workerCount = Number(req.body?.workerCount) || 5;
    const result = BrowserAssistService.syncChromeExtensionsToAllWorkers(workerCount);
    db.logActivity({
      userId: req.user?.id ?? null,
      action: 'SYNC_CHROME_WORKER_EXTENSIONS',
      entityType: 'CHROME_EXTENSIONS',
      details: {
        syncedWorkers: result.syncedWorkers,
        extensionCount: result.info.extensions.length,
      },
    });
    res.json({
      success: true,
      data: result,
    });
  })
);

apiV1Router.get(
  '/registration/proxy-config',
  requireAuth,
  asyncHandler((_req, res) => {
    const cfg = BrowserAssistService.getProxyConfig();
    res.json({
      success: true,
      data: cfg,
    });
  })
);

const saveProxyConfigSchema = z.object({
  useProxy: z.boolean(),
  proxyText: z.string().max(32768),
});

apiV1Router.post(
  '/registration/proxy-config',
  requireAuth,
  requireRole('ADMIN', 'OPERATOR'),
  asyncHandler((req, res) => {
    const parsed = saveProxyConfigSchema.parse(req.body ?? {});
    const saved = BrowserAssistService.saveProxyConfig(parsed);
    res.json({
      success: true,
      data: saved,
    });
  })
);

apiV1Router.post(
  '/registration/batch-start',
  requireAuth,
  requireRole('ADMIN', 'OPERATOR'),
  asyncHandler(async (req, res) => {
    const parsed = batchStartSchema.parse(req.body ?? {});
    const state = await BrowserAssistService.startBatchWorkers(
      parsed,
      req.user?.id ?? null
    );
    res.status(201).json({
      success: true,
      data: state,
    });
  })
);

const syncMasterProfileSchema = z.object({
  sourceProfilePath: z.string().max(512).optional(),
});

apiV1Router.post(
  '/registration/master-profile/sync',
  requireAuth,
  requireRole('ADMIN', 'OPERATOR'),
  asyncHandler((req, res) => {
    const parsed = syncMasterProfileSchema.parse(req.body ?? {});
    const status = BrowserAssistService.syncMasterFirefoxProfile(parsed.sourceProfilePath);
    db.logActivity({
      userId: req.user?.id ?? null,
      action: 'SYNC_MASTER_FIREFOX_PROFILE',
      entityType: 'MASTER_FIREFOX_PROFILE',
      details: status as unknown as Record<string, unknown>,
    });
    res.json({
      success: true,
      data: status,
    });
  })
);

apiV1Router.post(
  '/registration/reset-profiles',
  requireAuth,
  requireRole('ADMIN', 'OPERATOR'),
  asyncHandler((req, res) => {
    const result = BrowserAssistService.resetAllWorkerProfiles();
    db.logActivity({
      userId: req.user?.id ?? null,
      action: 'RESET_WORKER_PROFILES',
      entityType: 'WORKER_PROFILES',
      details: result,
    });
    res.json({
      success: true,
      data: result,
    });
  })
);

apiV1Router.post(
  '/registration/batch-stop',
  requireAuth,
  requireRole('ADMIN', 'OPERATOR'),
  asyncHandler(async (_req, res) => {
    const state = await BrowserAssistService.stopBatchWorkers();
    res.json({
      success: true,
      data: state,
    });
  })
);

apiV1Router.get(
  '/registration/batch-status',
  requireAuth,
  asyncHandler((_req, res) => {
    const state = BrowserAssistService.getBatchState();
    res.json({
      success: true,
      data: state,
    });
  })
);

const resolveLocalApiBaseUrl = (req: Request): string => {
  const hostHeader = req.get('host');
  return hostHeader && /^(127\.0\.0\.1|localhost)(:\d+)?$/i.test(hostHeader)
    ? `http://${hostHeader.replace(/:5173$/, ':4000')}`
    : 'http://127.0.0.1:4000';
};

const isLoopbackRequest = (req: Request): boolean => {
  const remote = req.socket.remoteAddress || req.ip || '';
  return remote === '127.0.0.1' || remote === '::1' || remote === '::ffff:127.0.0.1';
};

apiV1Router.get(
  '/registration/manual-bookmarklet',
  requireAuth,
  asyncHandler((req, res) => {
    const apiBaseUrl = resolveLocalApiBaseUrl(req);
    res.json({
      success: true,
      data: {
        bookmarkletHref: buildManualBookmarkletHref(apiBaseUrl),
        userscriptUrl: `${apiBaseUrl}/api/v1/registration/rage-autofill.user.js`,
      },
    });
  })
);

apiV1Router.get(
  '/registration/rage-autofill.user.js',
  asyncHandler((req, res) => {
    if (!isLoopbackRequest(req)) {
      throw new ApiError(403, 'FORBIDDEN_NON_LOOPBACK', 'Userscript only accessible on loopback');
    }
    const apiBaseUrl = resolveLocalApiBaseUrl(req);
    res.setHeader('Cache-Control', 'no-store, max-age=0');
    res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
    res.send(buildManualUserscriptSource(apiBaseUrl));
  })
);

const resolveManualWorkerId = (req: Request, bodyWorkerId?: unknown): number | undefined => {
  const fromQuery = Number(req.query.workerId);
  if (Number.isInteger(fromQuery) && fromQuery > 0) return fromQuery;
  const fromBody = Number(bodyWorkerId);
  if (Number.isInteger(fromBody) && fromBody > 0) return fromBody;
  const fromCookie = Number(req.cookies?.rage_worker_id);
  if (Number.isInteger(fromCookie) && fromCookie > 0) return fromCookie;
  return undefined;
};

apiV1Router.get(
  '/registration/manual-autofill-json',
  asyncHandler((req, res) => {
    if (!isLoopbackRequest(req)) {
      throw new ApiError(403, 'FORBIDDEN_NON_LOOPBACK', 'Autofill endpoint only accessible on loopback');
    }
    const workerId = resolveManualWorkerId(req);
    if (!workerId && BrowserAssistService.getBatchState().workers.length > 1) {
      BrowserAssistService.recordMissingWorkerIdWarning();
      res.setHeader('Cache-Control', 'no-store, max-age=0');
      res.json({
        success: true,
        data: null,
        errorCode: 'MISSING_WORKER_ID',
      });
      return;
    }
    const activeTargets = BrowserAssistService.getActiveAutofillTargets(workerId);
    res.setHeader('Cache-Control', 'no-store, max-age=0');
    res.json({
      success: true,
      data: activeTargets[0] ?? null,
    });
  })
);

apiV1Router.post(
  '/registration/manual-home-signal',
  asyncHandler((req, res) => {
    if (!isLoopbackRequest(req)) {
      throw new ApiError(403, 'FORBIDDEN_NON_LOOPBACK', 'Signal endpoint only accessible on loopback');
    }
    const workerId = resolveManualWorkerId(
      req,
      (req.body as { workerId?: unknown } | undefined)?.workerId
    );
    BrowserAssistService.notifyManualHomeRedirect(workerId);
    res.json({ success: true, data: { received: true, workerId: workerId ?? 0 } });
  })
);

apiV1Router.get(
  '/registration/manual-autofill-bridge',
  asyncHandler((req, res) => {
    if (!isLoopbackRequest(req)) {
      throw new ApiError(403, 'FORBIDDEN_NON_LOOPBACK', 'Autofill bridge only accessible on loopback');
    }

    const originParam = typeof req.query.origin === 'string' ? req.query.origin : 'https://www.roblox.com';
    const workerId = resolveManualWorkerId(req);
    const activeTargets =
      !workerId && BrowserAssistService.getBatchState().workers.length > 1
        ? []
        : BrowserAssistService.getActiveAutofillTargets(workerId);

    // Izinkan popup window.opener menerima postMessage dari bridge lokal (override default COOP helmet)
    res.setHeader('Cross-Origin-Opener-Policy', 'unsafe-none');
    res.setHeader('Cache-Control', 'no-store, max-age=0');
    res.type('html').send(
      renderManualAutofillBridgeHtml({
        targetOrigin: originParam,
        activeTargets,
      })
    );
  })
);

const markVerificationSchema = z.object({
  notes: z.string().max(1000).optional(),
});

apiV1Router.post(
  '/registration/:id/mark-verification-required',
  requireAuth,
  requireRole('ADMIN', 'OPERATOR'),
  asyncHandler((req, res) => {
    const parsed = markVerificationSchema.parse(req.body ?? {});
    const event = RegistrationService.markVerificationRequired(String(req.params.id), {
      notes: parsed.notes,
      performedById: req.user?.id ?? null,
    });
    res.json({
      success: true,
      data: event,
    });
  })
);

// ============================================================================
// ACCOUNT RECORDS CRUD (/api/v1/accounts)
// ============================================================================
apiV1Router.get(
  '/accounts/export-formatted',
  requireAuth,
  requireRole('ADMIN', 'OPERATOR'),
  asyncHandler((_req, res) => {
    const exported = AccountService.exportFormattedCredentials();

    res.json({
      success: true,
      data: exported,
    });
  })
);

const bulkIdsSchema = z.object({
  ids: z.array(z.string().trim().min(1)).min(1).max(5000),
});

const bulkUpdateAccountsSchema = z
  .object({
    ids: z.array(z.string().trim().min(1)).min(1).max(5000),
    category: z.string().trim().min(1).max(64).optional(),
    registrationStatus: z
      .enum(['REGISTERED', 'PENDING_CONFIRMATION', 'SUSPENDED', 'ARCHIVED'])
      .optional(),
    verificationStatus: z
      .enum(['UNVERIFIED', 'VERIFICATION_REQUIRED', 'VERIFIED'])
      .optional(),
  })
  .refine(
    (d) =>
      Boolean(d.category) ||
      Boolean(d.registrationStatus) ||
      Boolean(d.verificationStatus),
    { message: 'At least one field to update is required' }
  );

apiV1Router.post(
  '/accounts/bulk-export-formatted',
  requireAuth,
  requireRole('ADMIN', 'OPERATOR'),
  asyncHandler((req, res) => {
    const parsed = bulkIdsSchema.parse(req.body);
    const exported = AccountService.exportFormattedCredentials(parsed.ids);
    res.json({
      success: true,
      data: exported,
    });
  })
);

apiV1Router.post(
  '/accounts/bulk-update',
  requireAuth,
  requireRole('ADMIN', 'OPERATOR'),
  asyncHandler((req, res) => {
    const parsed = bulkUpdateAccountsSchema.parse(req.body);
    const result = AccountService.bulkUpdateAccounts(
      parsed.ids,
      {
        category: parsed.category,
        registrationStatus: parsed.registrationStatus,
        verificationStatus: parsed.verificationStatus,
      },
      req.user?.id ?? null
    );
    res.json({
      success: true,
      data: result,
    });
  })
);

apiV1Router.post(
  '/accounts/bulk-delete',
  requireAuth,
  requireRole('ADMIN'),
  asyncHandler((req, res) => {
    const parsed = bulkIdsSchema.parse(req.body);
    const result = AccountService.bulkDeleteAccounts(parsed.ids, req.user?.id ?? null);
    res.json({
      success: true,
      data: result,
    });
  })
);

apiV1Router.get(
  '/accounts/ids',
  requireAuth,
  asyncHandler((req, res) => {
    const search = typeof req.query.search === 'string' ? req.query.search : undefined;
    const category = typeof req.query.category === 'string' ? req.query.category : undefined;
    const registrationStatus =
      typeof req.query.registrationStatus === 'string' ? req.query.registrationStatus : undefined;
    const verificationStatus =
      typeof req.query.verificationStatus === 'string' ? req.query.verificationStatus : undefined;
    const tag = typeof req.query.tag === 'string' ? req.query.tag : undefined;

    const ids = AccountService.listMatchingAccountIds({
      search,
      category,
      registrationStatus,
      verificationStatus,
      tag,
    });

    res.json({
      success: true,
      data: {
        ids,
        total: ids.length,
      },
    });
  })
);

apiV1Router.get(
  '/accounts/:id/formatted-credential',
  requireAuth,
  requireRole('ADMIN', 'OPERATOR'),
  asyncHandler((req, res) => {
    const acc = AccountService.getAccountById(String(req.params.id));
    if (!acc) {
      throw new ApiError(404, 'ACCOUNT_NOT_FOUND', 'Account record not found');
    }
    const formatted = CredentialVault.formatAccountCredentialLine(
      acc.robloxUsername,
      acc.credentialId
    );
    res.json({
      success: true,
      data: {
        id: acc.id,
        robloxUsername: acc.robloxUsername,
        formatted,
      },
    });
  })
);

apiV1Router.get(
  '/accounts',
  requireAuth,
  asyncHandler((req, res) => {
    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 25;
    const search = typeof req.query.search === 'string' ? req.query.search : undefined;
    const category = typeof req.query.category === 'string' ? req.query.category : undefined;
    const registrationStatus =
      typeof req.query.registrationStatus === 'string' ? req.query.registrationStatus : undefined;
    const verificationStatus =
      typeof req.query.verificationStatus === 'string' ? req.query.verificationStatus : undefined;
    const tag = typeof req.query.tag === 'string' ? req.query.tag : undefined;
    const sortBy = (
      ['created_at', 'updated_at', 'roblox_username', 'category'].includes(
        String(req.query.sortBy)
      )
        ? String(req.query.sortBy)
        : 'created_at'
    ) as 'created_at' | 'updated_at' | 'roblox_username' | 'category';
    const sortOrder = String(req.query.sortOrder).toLowerCase() === 'asc' ? 'asc' : 'desc';

    const list = AccountService.listAccounts({
      page,
      limit,
      search,
      category,
      registrationStatus,
      verificationStatus,
      tag,
      sortBy,
      sortOrder,
    });

    res.json({
      success: true,
      data: list.items,
      meta: {
        total: list.total,
        page: list.page,
        limit: list.limit,
        totalPages: list.totalPages,
      },
    });
  })
);

const createAccountSchema = z.object({
  robloxUsername: z
    .string()
    .trim()
    .min(3)
    .max(20)
    .regex(/^[a-zA-Z0-9_]+$/, 'Invalid Roblox username format'),
  robloxUserId: z
    .string()
    .trim()
    .regex(/^\d{1,20}$/, 'Roblox User ID must be numeric')
    .optional()
    .nullable(),
  password: z.string().min(8).max(128).optional().nullable(),
  category: z.string().trim().min(1).max(64).optional().default('STANDARD'),
  registrationStatus: z
    .enum(['REGISTERED', 'PENDING_CONFIRMATION', 'SUSPENDED', 'ARCHIVED'])
    .optional()
    .default('REGISTERED'),
  verificationStatus: z
    .enum(['UNVERIFIED', 'VERIFICATION_REQUIRED', 'VERIFIED'])
    .optional()
    .default('UNVERIFIED'),
  notes: z.string().max(2000).optional().nullable(),
  tags: z.array(z.string().max(32)).max(20).optional().default([]),
});

apiV1Router.post(
  '/accounts',
  requireAuth,
  requireRole('ADMIN', 'OPERATOR'),
  asyncHandler((req, res) => {
    const parsed = createAccountSchema.parse(req.body);
    const created = AccountService.createAccount({
      ...parsed,
      createdById: req.user?.id ?? null,
    });
    res.status(201).json({
      success: true,
      data: created,
    });
  })
);

apiV1Router.get(
  '/accounts/:id',
  requireAuth,
  asyncHandler((req, res) => {
    const acc = AccountService.getAccountById(String(req.params.id));
    if (!acc) {
      throw new ApiError(404, 'ACCOUNT_NOT_FOUND', 'Account record not found');
    }
    res.json({
      success: true,
      data: acc,
    });
  })
);

const updateAccountSchema = z.object({
  robloxUsername: z
    .string()
    .trim()
    .min(3)
    .max(20)
    .regex(/^[a-zA-Z0-9_]+$/)
    .optional(),
  robloxUserId: z
    .string()
    .trim()
    .regex(/^\d{1,20}$/)
    .optional()
    .nullable(),
  password: z.string().min(8).max(128).optional().nullable(),
  category: z.string().trim().min(1).max(64).optional(),
  registrationStatus: z
    .enum(['REGISTERED', 'PENDING_CONFIRMATION', 'SUSPENDED', 'ARCHIVED'])
    .optional(),
  verificationStatus: z
    .enum(['UNVERIFIED', 'VERIFICATION_REQUIRED', 'VERIFIED'])
    .optional(),
  notes: z.string().max(2000).optional().nullable(),
  tags: z.array(z.string().max(32)).max(20).optional(),
});

apiV1Router.patch(
  '/accounts/:id',
  requireAuth,
  requireRole('ADMIN', 'OPERATOR'),
  asyncHandler((req, res) => {
    const parsed = updateAccountSchema.parse(req.body);
    const updated = AccountService.updateAccount(String(req.params.id), {
      ...parsed,
      updatedById: req.user?.id ?? null,
    });
    res.json({
      success: true,
      data: updated,
    });
  })
);

apiV1Router.delete(
  '/accounts/:id',
  requireAuth,
  requireRole('ADMIN'),
  asyncHandler((req, res) => {
    AccountService.deleteAccount(String(req.params.id), req.user?.id ?? null);
    res.json({
      success: true,
      data: { id: req.params.id, deleted: true },
    });
  })
);

// ============================================================================
// ACTIVITY LOGS & SETTINGS (/api/v1/logs, /api/v1/settings)
// ============================================================================
apiV1Router.get(
  '/logs',
  requireAuth,
  asyncHandler((req, res) => {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.max(1, Math.min(100, Number(req.query.limit) || 25));
    const offset = (page - 1) * limit;
    const action = typeof req.query.action === 'string' ? req.query.action : undefined;
    const entityType = typeof req.query.entityType === 'string' ? req.query.entityType : undefined;

    const conditions: string[] = [];
    const values: (string | number)[] = [];
    if (action) {
      conditions.push('l.action = ?');
      values.push(action);
    }
    if (entityType) {
      conditions.push('l.entity_type = ?');
      values.push(entityType);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const countRow = db.raw
      .prepare(`SELECT COUNT(*) as total FROM activity_logs l ${whereClause}`)
      .get(...values) as { total: number };
    const total = Number(countRow?.total ?? 0);

    const rows = db.raw
      .prepare(
        `SELECT l.*, u.username as user_username
         FROM activity_logs l
         LEFT JOIN users u ON l.user_id = u.id
         ${whereClause}
         ORDER BY l.created_at DESC
         LIMIT ? OFFSET ?`
      )
      .all(...values, limit, offset) as unknown as Array<ActivityLogRecord & { user_username: string | null }>;

    const items = rows.map((r) => {
      let details: Record<string, unknown> = {};
      try {
        details = JSON.parse(r.details_json);
      } catch {
        details = {};
      }
      return {
        id: r.id,
        userId: r.user_id,
        username: r.user_username ?? 'system',
        action: r.action,
        entityType: r.entity_type,
        entityId: r.entity_id,
        details,
        ipAddress: r.ip_address,
        createdAt: r.created_at,
      };
    });

    res.json({
      success: true,
      data: items,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    });
  })
);

const DEFAULT_SETTINGS = {
  generator: {
    defaultPrefix: 'rbx',
    defaultSuffix: '',
    defaultLength: 12,
    defaultPasswordLength: 16,
    includeSymbols: true,
    maxBatchSize: 5000,
  },
  security: {
    passwordHashing: 'Argon2id (19 MiB, 2 iterations)',
    sessionPolicy: 'HttpOnly + SameSite=Strict + CSRF Token',
    rbacEnabled: true,
    captchaBypassProhibited: true,
    humanSupervisionRequired: true,
  },
  storage: {
    vaultAlgorithm: 'AES-256-GCM (96-bit IV, 128-bit AuthTag)',
    keyLocation: 'External Environment Variable (VAULT_MASTER_KEY)',
    databaseEngine: 'PostgreSQL / ACID WAL SQL Engine',
    queueEngine: 'BullMQ / Persistent Job Queue',
  },
};

apiV1Router.get(
  '/settings',
  requireAuth,
  asyncHandler((_req, res) => {
    const row = db.raw
      .prepare('SELECT value_json FROM system_settings WHERE key = ?')
      .get('app_settings') as { value_json: string } | undefined;

    let saved: Record<string, unknown> = {};
    if (row) {
      try {
        saved = JSON.parse(row.value_json);
      } catch {
        saved = {};
      }
    }

    res.json({
      success: true,
      data: {
        ...DEFAULT_SETTINGS,
        generator: {
          ...DEFAULT_SETTINGS.generator,
          ...((saved.generator as Record<string, unknown>) ?? {}),
        },
      },
    });
  })
);

const updateSettingsSchema = z.object({
  generator: z.object({
    defaultPrefix: z.string().max(15).optional(),
    defaultSuffix: z.string().max(15).optional(),
    defaultLength: z.coerce.number().int().min(3).max(20).optional(),
    defaultPasswordLength: z.coerce.number().int().min(12).max(64).optional(),
    includeSymbols: z.boolean().optional(),
  }),
});

apiV1Router.patch(
  '/settings',
  requireAuth,
  requireRole('ADMIN'),
  asyncHandler((req, res) => {
    const parsed = updateSettingsSchema.parse(req.body);
    const now = new Date().toISOString();

    const merged = {
      ...DEFAULT_SETTINGS,
      generator: {
        ...DEFAULT_SETTINGS.generator,
        ...parsed.generator,
      },
    };

    db.raw
      .prepare(
        `INSERT INTO system_settings (key, value_json, updated_at)
         VALUES ('app_settings', ?, ?)
         ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at`
      )
      .run(JSON.stringify(merged), now);

    db.logActivity({
      userId: req.user?.id ?? null,
      action: 'UPDATE_SETTINGS',
      entityType: 'SYSTEM_SETTINGS',
      entityId: 'app_settings',
      details: parsed.generator,
    });

    res.json({
      success: true,
      data: merged,
    });
  })
);
