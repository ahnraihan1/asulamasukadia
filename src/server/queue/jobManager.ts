import crypto from 'node:crypto';
import { db, AccountGenerationJobRecord, GeneratedAccountDataRecord } from '../db/index.js';
import { GeneratorService, GenerationConfig, GeneratedCandidateDTO } from '../services/generatorService.js';
import { CredentialVault } from '../vault/credentialVault.js';

export interface JobDTO {
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
  candidates?: GeneratedCandidateDTO[];
}

export class JobManager {
  private static activeJobLocks = new Set<string>();
  private static pausedJobs = new Set<string>();
  private static canceledJobs = new Set<string>();
  private static readonly MAX_RETRIES = 3;

  /**
   * Creates a new registration preparation job, generates or attaches candidates,
   * and enqueues the job for asynchronous processing.
   */
  public static createJob(params: {
    name?: string;
    candidateIds?: string[];
    generationConfig?: Omit<GenerationConfig, 'jobId'>;
    createdById?: string | null;
    autoStart?: boolean;
  }): JobDTO {
    const jobId = crypto.randomUUID();
    const now = new Date().toISOString();
    const jobName = (params.name?.trim() || `Prep-Batch-${now.slice(0, 19).replace(/[:T]/g, '-')}`).slice(
      0,
      128
    );

    let totalCount = 0;
    const configObj = params.generationConfig ?? { candidateIds: params.candidateIds ?? [] };

    db.transaction(() => {
      db.raw
        .prepare(
          `INSERT INTO account_generation_jobs (
            id, name, status, total_count, processed_count, completed_count,
            failed_count, verification_required_count, config_json, error_message,
            started_at, paused_at, completed_at, canceled_at, created_by_id, created_at, updated_at
          ) VALUES (?, ?, 'PENDING', 0, 0, 0, 0, 0, ?, NULL, NULL, NULL, NULL, NULL, ?, ?, ?)`
        )
        .run(jobId, jobName, JSON.stringify(configObj), params.createdById ?? null, now, now);

      if (params.generationConfig && params.generationConfig.quantity > 0) {
        const genResult = GeneratorService.generateBatch({
          ...params.generationConfig,
          jobId,
          createdById: params.createdById ?? null,
        });
        totalCount = genResult.candidates.length;
      } else if (params.candidateIds && params.candidateIds.length > 0) {
        const updateStmt = db.raw.prepare(`
          UPDATE generated_account_data
          SET job_id = ?, registration_state = 'QUEUED_FOR_PREPARATION', updated_at = ?
          WHERE id = ? AND registration_state IN ('GENERATED_CANDIDATE', 'FAILED')
        `);
        for (const cid of params.candidateIds) {
          const info = updateStmt.run(jobId, now, cid);
          if (info.changes > 0) totalCount++;
        }
      }

      db.raw
        .prepare('UPDATE account_generation_jobs SET total_count = ?, updated_at = ? WHERE id = ?')
        .run(totalCount, now, jobId);

      db.logActivity({
        userId: params.createdById ?? null,
        action: 'CREATE_JOB',
        entityType: 'ACCOUNT_GENERATION_JOB',
        entityId: jobId,
        details: { name: jobName, totalCount },
      });
    });

    if (params.autoStart !== false && totalCount > 0) {
      queueMicrotask(() => {
        void this.processJob(jobId);
      });
    }

    return this.getJobById(jobId, true)!;
  }

  /**
   * Processes a queued job with idempotency lock, pause/cancel responsiveness,
   * and automatic retry for recoverable internal errors.
   * Note: Marks prepared items as READY_FOR_HUMAN_REGISTRATION / VERIFICATION_REQUIRED.
   * Only human confirmation of actual registration marks an item REGISTERED and job COMPLETED.
   */
  public static async processJob(
    jobId: string,
    options?: { simulateTransientFailures?: number }
  ): Promise<JobDTO | null> {
    // Prevent duplicate concurrent execution of the same job
    if (this.activeJobLocks.has(jobId)) {
      return this.getJobById(jobId);
    }

    const job = db.raw
      .prepare('SELECT * FROM account_generation_jobs WHERE id = ?')
      .get(jobId) as AccountGenerationJobRecord | undefined;

    if (!job) return null;
    if (job.status === 'CANCELED' || job.status === 'COMPLETED') {
      return this.getJobById(jobId);
    }

    this.activeJobLocks.add(jobId);
    this.pausedJobs.delete(jobId);

    let simulatedFailuresRemaining = options?.simulateTransientFailures ?? 0;

    try {
      const startTime = job.started_at ?? new Date().toISOString();
      db.raw
        .prepare(
          `UPDATE account_generation_jobs
           SET status = 'PROCESSING', started_at = ?, paused_at = NULL, error_message = NULL, updated_at = ?
           WHERE id = ?`
        )
        .run(startTime, new Date().toISOString(), jobId);

      const candidates = db.raw
        .prepare(
          `SELECT * FROM generated_account_data
           WHERE job_id = ? AND registration_state IN ('GENERATED_CANDIDATE', 'QUEUED_FOR_PREPARATION', 'FAILED')
           ORDER BY created_at ASC`
        )
        .all(jobId) as unknown as GeneratedAccountDataRecord[];

      for (const candidate of candidates) {
        // Check if job was canceled or paused externally
        if (this.canceledJobs.has(jobId)) {
          this.canceledJobs.delete(jobId);
          return this.getJobById(jobId);
        }
        if (this.pausedJobs.has(jobId)) {
          return this.getJobById(jobId);
        }

        const currentJobState = db.raw
          .prepare('SELECT status FROM account_generation_jobs WHERE id = ?')
          .get(jobId) as { status: string } | undefined;

        if (!currentJobState || currentJobState.status === 'PAUSED' || currentJobState.status === 'CANCELED') {
          return this.getJobById(jobId);
        }

        let success = false;
        let attempt = candidate.attempt_count;
        let lastErr: string | null = null;

        while (!success && attempt < this.MAX_RETRIES) {
          attempt++;
          try {
            if (simulatedFailuresRemaining > 0) {
              simulatedFailuresRemaining--;
              throw new Error('Recoverable transient queue preparation error');
            }

            // Verify candidate validity and credential vault integrity
            const validation = GeneratorService.validateUsernameCandidate(candidate.candidate_username);
            if (!validation.valid) {
              throw new Error(`Invalid candidate username: ${validation.errors.join('; ')}`);
            }

            if (candidate.credential_id) {
              const meta = CredentialVault.getPublicMetadata(candidate.credential_id);
              if (!meta) {
                throw new Error('Missing encrypted credential metadata in vault');
              }
            }

            const now = new Date().toISOString();
            db.transaction(() => {
              db.raw
                .prepare(
                  `UPDATE generated_account_data
                   SET registration_state = 'VERIFICATION_REQUIRED',
                       attempt_count = ?,
                       last_error = NULL,
                       updated_at = ?
                   WHERE id = ?`
                )
                .run(attempt, now, candidate.id);

              db.raw
                .prepare(
                  `INSERT INTO registration_events (
                    id, candidate_id, account_id, job_id, event_type,
                    status_before, status_after, roblox_user_id, roblox_username, notes, performed_by_id, created_at
                  ) VALUES (?, ?, NULL, ?, 'PREPARED_FOR_HUMAN_SUPERVISION', ?, 'VERIFICATION_REQUIRED', NULL, ?, ?, NULL, ?)`
                )
                .run(
                  crypto.randomUUID(),
                  candidate.id,
                  jobId,
                  candidate.registration_state,
                  candidate.candidate_username,
                  'Candidate validated and queued for human-supervised registration on Roblox.com',
                  now
                );
            });

            success = true;
          } catch (err) {
            lastErr = err instanceof Error ? err.message : String(err);
            db.raw
              .prepare(
                `UPDATE generated_account_data
                 SET attempt_count = ?, last_error = ?, updated_at = ?
                 WHERE id = ?`
              )
              .run(attempt, lastErr, new Date().toISOString(), candidate.id);

            // If non-recoverable validation error, break immediately
            if (lastErr.startsWith('Invalid candidate username:')) {
              break;
            }
          }
        }

        if (!success) {
          const now = new Date().toISOString();
          db.raw
            .prepare(
              `UPDATE generated_account_data
               SET registration_state = 'FAILED', last_error = ?, updated_at = ?
               WHERE id = ?`
            )
            .run(lastErr ?? 'Preparation failed after maximum retries', now, candidate.id);
        }

        this.recalculateJobCounters(jobId);
      }

      this.recalculateJobCounters(jobId, true);
      return this.getJobById(jobId);
    } finally {
      this.activeJobLocks.delete(jobId);
    }
  }

  /**
   * Recalculates job counters from actual candidate states.
   * Ensures job is only marked COMPLETED when all candidates are actually REGISTERED.
   */
  public static recalculateJobCounters(jobId: string, finalizeStatus = false): void {
    const job = db.raw
      .prepare('SELECT * FROM account_generation_jobs WHERE id = ?')
      .get(jobId) as AccountGenerationJobRecord | undefined;
    if (!job) return;

    const counts = db.raw
      .prepare(
        `SELECT
          COUNT(*) as total,
          SUM(CASE WHEN registration_state IN ('VERIFICATION_REQUIRED', 'READY_FOR_HUMAN_REGISTRATION', 'REGISTERED', 'FAILED') THEN 1 ELSE 0 END) as processed,
          SUM(CASE WHEN registration_state = 'REGISTERED' THEN 1 ELSE 0 END) as completed,
          SUM(CASE WHEN registration_state = 'FAILED' THEN 1 ELSE 0 END) as failed,
          SUM(CASE WHEN registration_state IN ('VERIFICATION_REQUIRED', 'READY_FOR_HUMAN_REGISTRATION') THEN 1 ELSE 0 END) as verification_req
         FROM generated_account_data
         WHERE job_id = ?`
      )
      .get(jobId) as {
      total: number;
      processed: number | null;
      completed: number | null;
      failed: number | null;
      verification_req: number | null;
    };

    const total = Number(counts.total || job.total_count || 0);
    const processed = Number(counts.processed || 0);
    const completed = Number(counts.completed || 0);
    const failed = Number(counts.failed || 0);
    const verificationReq = Number(counts.verification_req || 0);

    let nextStatus = job.status;
    let completedAt = job.completed_at;
    let errorMessage = job.error_message;

    if (job.status !== 'CANCELED' && job.status !== 'PAUSED') {
      if (total > 0 && completed === total) {
        nextStatus = 'COMPLETED';
        completedAt = completedAt ?? new Date().toISOString();
      } else if (finalizeStatus || processed === total) {
        if (failed === total && total > 0) {
          nextStatus = 'FAILED';
          errorMessage = 'All candidates in job failed preparation';
        } else if (verificationReq > 0) {
          nextStatus = 'VERIFICATION_REQUIRED';
        } else if (completed > 0 && completed + failed === total) {
          nextStatus = 'COMPLETED';
          completedAt = completedAt ?? new Date().toISOString();
        }
      }
    }

    db.raw
      .prepare(
        `UPDATE account_generation_jobs
         SET total_count = ?,
             processed_count = ?,
             completed_count = ?,
             failed_count = ?,
             verification_required_count = ?,
             status = ?,
             completed_at = ?,
             error_message = ?,
             updated_at = ?
         WHERE id = ?`
      )
      .run(
        total,
        processed,
        completed,
        failed,
        verificationReq,
        nextStatus,
        completedAt,
        errorMessage,
        new Date().toISOString(),
        jobId
      );
  }

  public static pauseJob(jobId: string, userId?: string | null): JobDTO {
    const job = db.raw
      .prepare('SELECT * FROM account_generation_jobs WHERE id = ?')
      .get(jobId) as AccountGenerationJobRecord | undefined;

    if (!job) throw new Error('Job not found');
    if (job.status === 'COMPLETED' || job.status === 'CANCELED') {
      throw new Error(`Cannot pause a job in ${job.status} state`);
    }

    this.pausedJobs.add(jobId);
    const now = new Date().toISOString();

    db.raw
      .prepare(
        `UPDATE account_generation_jobs
         SET status = 'PAUSED', paused_at = ?, updated_at = ?
         WHERE id = ?`
      )
      .run(now, now, jobId);

    db.logActivity({
      userId: userId ?? null,
      action: 'PAUSE_JOB',
      entityType: 'ACCOUNT_GENERATION_JOB',
      entityId: jobId,
    });

    return this.getJobById(jobId)!;
  }

  public static async resumeJob(jobId: string, userId?: string | null): Promise<JobDTO> {
    const job = db.raw
      .prepare('SELECT * FROM account_generation_jobs WHERE id = ?')
      .get(jobId) as AccountGenerationJobRecord | undefined;

    if (!job) throw new Error('Job not found');
    if (job.status !== 'PAUSED' && job.status !== 'PENDING' && job.status !== 'FAILED') {
      throw new Error(`Cannot resume a job in ${job.status} state`);
    }

    this.pausedJobs.delete(jobId);
    const now = new Date().toISOString();

    db.raw
      .prepare(
        `UPDATE account_generation_jobs
         SET status = 'PROCESSING', paused_at = NULL, updated_at = ?
         WHERE id = ?`
      )
      .run(now, jobId);

    db.logActivity({
      userId: userId ?? null,
      action: 'RESUME_JOB',
      entityType: 'ACCOUNT_GENERATION_JOB',
      entityId: jobId,
    });

    await this.processJob(jobId);
    return this.getJobById(jobId)!;
  }

  public static cancelJob(jobId: string, userId?: string | null): JobDTO {
    const job = db.raw
      .prepare('SELECT * FROM account_generation_jobs WHERE id = ?')
      .get(jobId) as AccountGenerationJobRecord | undefined;

    if (!job) throw new Error('Job not found');
    if (job.status === 'COMPLETED') {
      throw new Error('Cannot cancel an already completed job');
    }

    this.canceledJobs.add(jobId);
    this.pausedJobs.delete(jobId);
    const now = new Date().toISOString();

    db.raw
      .prepare(
        `UPDATE account_generation_jobs
         SET status = 'CANCELED', canceled_at = ?, updated_at = ?
         WHERE id = ?`
      )
      .run(now, now, jobId);

    db.logActivity({
      userId: userId ?? null,
      action: 'CANCEL_JOB',
      entityType: 'ACCOUNT_GENERATION_JOB',
      entityId: jobId,
    });

    return this.getJobById(jobId)!;
  }

  public static getJobById(jobId: string, includeCandidates = true): JobDTO | null {
    const row = db.raw
      .prepare('SELECT * FROM account_generation_jobs WHERE id = ?')
      .get(jobId) as AccountGenerationJobRecord | undefined;

    if (!row) return null;
    const dto = this.mapRowToDTO(row);

    if (includeCandidates) {
      const candidatesList = GeneratorService.listCandidates({
        jobId,
        page: 1,
        limit: Math.max(5000, dto.totalCount || 5000),
      });
      dto.candidates = candidatesList.items;
    }

    return dto;
  }

  public static listJobs(params?: {
    page?: number;
    limit?: number;
    status?: string;
  }): {
    items: JobDTO[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  } {
    const page = Math.max(1, params?.page ?? 1);
    const limit = Math.max(1, Math.min(100, params?.limit ?? 20));
    const offset = (page - 1) * limit;

    const conditions: string[] = [];
    const values: (string | number)[] = [];

    if (params?.status) {
      conditions.push('status = ?');
      values.push(params.status);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const countRow = db.raw
      .prepare(`SELECT COUNT(*) as total FROM account_generation_jobs ${whereClause}`)
      .get(...values) as { total: number };
    const total = Number(countRow?.total ?? 0);

    const rows = db.raw
      .prepare(
        `SELECT * FROM account_generation_jobs
         ${whereClause}
         ORDER BY created_at DESC
         LIMIT ? OFFSET ?`
      )
      .all(...values, limit, offset) as unknown as AccountGenerationJobRecord[];

    return {
      items: rows.map((r) => this.mapRowToDTO(r)),
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    };
  }

  private static mapRowToDTO(row: AccountGenerationJobRecord): JobDTO {
    let config: Record<string, unknown> = {};
    try {
      config = JSON.parse(row.config_json);
    } catch {
      config = {};
    }
    const progressPercent =
      row.total_count > 0 ? Math.min(100, Math.round((row.completed_count / row.total_count) * 100)) : 0;

    return {
      id: row.id,
      name: row.name,
      status: row.status,
      totalCount: row.total_count,
      processedCount: row.processed_count,
      completedCount: row.completed_count,
      failedCount: row.failed_count,
      verificationRequiredCount: row.verification_required_count,
      progressPercent,
      config,
      errorMessage: row.error_message,
      startedAt: row.started_at,
      pausedAt: row.paused_at,
      completedAt: row.completed_at,
      canceledAt: row.canceled_at,
      createdById: row.created_by_id,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}
