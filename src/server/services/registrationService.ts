import crypto from 'node:crypto';
import { db, GeneratedAccountDataRecord, RegistrationEventRecord } from '../db/index.js';
import { CredentialVault } from '../vault/credentialVault.js';
import { JobManager } from '../queue/jobManager.js';
import { AccountService, AccountDTO } from './accountService.js';

export interface SupervisedPreparationPackage {
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

export interface RegistrationEventDTO {
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

export class RegistrationService {
  public static readonly OFFICIAL_ROBLOX_SIGNUP_URL = 'https://www.roblox.com/CreateAccount';

  /**
   * Builds a human-supervised registration checklist and preparation package.
   * Does NOT submit anything to Roblox endpoints or bypass CAPTCHA.
   */
  public static getPreparationPackage(candidateId: string): SupervisedPreparationPackage {
    const candidate = db.raw
      .prepare(
        `SELECT g.*, c.fingerprint_sha256
         FROM generated_account_data g
         LEFT JOIN credential_metadata c ON g.credential_id = c.id
         WHERE g.id = ?`
      )
      .get(candidateId) as (GeneratedAccountDataRecord & { fingerprint_sha256: string | null }) | undefined;

    if (!candidate) {
      throw new Error('Generated candidate record not found');
    }

    const generatedPassword = candidate.credential_id
      ? CredentialVault.retrieveForSupervisedRegistration(candidate.credential_id)
      : null;

    const referenceCode = `REF-${candidate.id.slice(0, 8).toUpperCase()}`;

    return {
      candidateId: candidate.id,
      jobId: candidate.job_id,
      referenceCode,
      candidateUsername: candidate.candidate_username,
      generatedPasswordForHumanCopy: generatedPassword,
      credentialFingerprint: candidate.fingerprint_sha256,
      officialRegistrationUrl: this.OFFICIAL_ROBLOX_SIGNUP_URL,
      registrationState: candidate.registration_state,
      checklist: [
        {
          step: 1,
          title: 'Open Official Roblox Registration Page',
          description: 'Open https://www.roblox.com/CreateAccount in an authorized browser session.',
          required: true,
        },
        {
          step: 2,
          title: 'Copy Candidate Username & Vault Password',
          description:
            'Enter the prepared candidate username and strong password into the official signup form.',
          required: true,
        },
        {
          step: 3,
          title: 'Complete Human Verification & Terms',
          description:
            'Complete any required Roblox security verification, CAPTCHA, or email/phone verification manually.',
          required: true,
        },
        {
          step: 4,
          title: 'Confirm Resulting Roblox User ID',
          description:
            'Copy the resulting Roblox User ID from the new profile URL and confirm registration below.',
          required: true,
        },
      ],
    };
  }

  /**
   * Records a human-confirmed registration result, creating the official Account record
   * and linking it to the encrypted credential vault entry.
   */
  public static confirmRegistration(
    candidateId: string,
    params: {
      robloxUserId: string;
      robloxUsername?: string;
      cookie?: string | null;
      category?: string;
      verificationStatus?: 'UNVERIFIED' | 'VERIFICATION_REQUIRED' | 'VERIFIED';
      notes?: string;
      tags?: string[];
      performedById?: string | null;
    }
  ): {
    account: AccountDTO;
    event: RegistrationEventDTO;
    formattedCredential: string;
  } {
    const candidate = db.raw
      .prepare('SELECT * FROM generated_account_data WHERE id = ?')
      .get(candidateId) as GeneratedAccountDataRecord | undefined;

    if (!candidate) {
      throw new Error('Generated candidate record not found');
    }
    if (candidate.registration_state === 'REGISTERED' && candidate.account_id) {
      throw new Error('This candidate has already been confirmed and linked to a registered account');
    }

    const finalUsername = (params.robloxUsername?.trim() || candidate.candidate_username).slice(0, 64);
    const robloxUserId = params.robloxUserId.trim();

    if (!/^\d{1,20}$/.test(robloxUserId)) {
      throw new Error('Roblox User ID must be a valid numeric identifier');
    }

    // Check uniqueness in accounts
    const existingAccount = db.raw
      .prepare(
        `SELECT id FROM accounts
         WHERE LOWER(roblox_username) = LOWER(?) OR roblox_user_id = ?`
      )
      .get(finalUsername, robloxUserId) as { id: string } | undefined;

    if (existingAccount) {
      throw new Error('An account with this Roblox username or Roblox User ID already exists');
    }

    const accountId = crypto.randomUUID();
    const eventId = crypto.randomUUID();
    const now = new Date().toISOString();
    const category = (params.category?.trim() || 'STANDARD').toUpperCase();
    const verificationStatus = params.verificationStatus ?? 'VERIFIED';
    const tagsJson = JSON.stringify(params.tags ?? ['supervised-registration']);

    if (params.cookie && params.cookie.trim().length > 0 && candidate.credential_id) {
      const currentSecret = CredentialVault.retrieveSecretPayload(candidate.credential_id);
      CredentialVault.updateCredentialWithCookie(
        candidate.credential_id,
        currentSecret.password,
        params.cookie.trim()
      );
    }

    db.transaction(() => {
      db.raw
        .prepare(
          `INSERT INTO accounts (
            id, roblox_username, roblox_user_id, credential_id, category,
            registration_status, verification_status, notes, tags_json,
            created_by_id, created_at, updated_at, deleted_at
          ) VALUES (?, ?, ?, ?, ?, 'REGISTERED', ?, ?, ?, ?, ?, ?, NULL)`
        )
        .run(
          accountId,
          finalUsername,
          robloxUserId,
          candidate.credential_id,
          category,
          verificationStatus,
          params.notes ?? `Confirmed from candidate ${candidate.id}`,
          tagsJson,
          params.performedById ?? null,
          now,
          now
        );

      db.raw
        .prepare(
          `UPDATE generated_account_data
           SET registration_state = 'REGISTERED',
               account_id = ?,
               candidate_username = ?,
               last_error = NULL,
               updated_at = ?
           WHERE id = ?`
        )
        .run(accountId, finalUsername, now, candidateId);

      db.raw
        .prepare(
          `INSERT INTO registration_events (
            id, candidate_id, account_id, job_id, event_type,
            status_before, status_after, roblox_user_id, roblox_username,
            notes, performed_by_id, created_at
          ) VALUES (?, ?, ?, ?, 'HUMAN_REGISTRATION_CONFIRMED', ?, 'REGISTERED', ?, ?, ?, ?, ?)`
        )
        .run(
          eventId,
          candidateId,
          accountId,
          candidate.job_id,
          candidate.registration_state,
          robloxUserId,
          finalUsername,
          params.notes ?? 'Human operator confirmed registration completion',
          params.performedById ?? null,
          now
        );

      if (candidate.job_id) {
        JobManager.recalculateJobCounters(candidate.job_id, true);
      }

      db.logActivity({
        userId: params.performedById ?? null,
        action: 'CONFIRM_REGISTRATION',
        entityType: 'ACCOUNT',
        entityId: accountId,
        details: {
          candidateId,
          jobId: candidate.job_id,
          robloxUsername: finalUsername,
          robloxUserId,
        },
      });
    });

    const account = AccountService.getAccountById(accountId)!;
    const event = this.getEventById(eventId)!;
    const formattedCredential = CredentialVault.formatAccountCredentialLine(
      finalUsername,
      candidate.credential_id
    );
    return { account, event, formattedCredential };
  }

  /**
   * Marks a candidate as requiring manual verification or additional human intervention
   */
  public static markVerificationRequired(
    candidateId: string,
    params: {
      notes?: string;
      performedById?: string | null;
    }
  ): RegistrationEventDTO {
    const candidate = db.raw
      .prepare('SELECT * FROM generated_account_data WHERE id = ?')
      .get(candidateId) as GeneratedAccountDataRecord | undefined;

    if (!candidate) {
      throw new Error('Generated candidate record not found');
    }
    if (candidate.registration_state === 'REGISTERED') {
      throw new Error('Candidate is already registered');
    }

    const eventId = crypto.randomUUID();
    const now = new Date().toISOString();

    db.transaction(() => {
      db.raw
        .prepare(
          `UPDATE generated_account_data
           SET registration_state = 'VERIFICATION_REQUIRED',
                updated_at = ?
           WHERE id = ?`
        )
        .run(now, candidateId);

      db.raw
        .prepare(
          `INSERT INTO registration_events (
            id, candidate_id, account_id, job_id, event_type,
            status_before, status_after, roblox_user_id, roblox_username,
            notes, performed_by_id, created_at
          ) VALUES (?, ?, ?, ?, 'MARKED_VERIFICATION_REQUIRED', ?, 'VERIFICATION_REQUIRED', NULL, ?, ?, ?, ?)`
        )
        .run(
          eventId,
          candidateId,
          candidate.account_id,
          candidate.job_id,
          candidate.registration_state,
          candidate.candidate_username,
          params.notes ?? 'Flagged for human verification challenge on Roblox.com',
          params.performedById ?? null,
          now
        );

      if (candidate.job_id) {
        JobManager.recalculateJobCounters(candidate.job_id, true);
      }

      db.logActivity({
        userId: params.performedById ?? null,
        action: 'MARK_VERIFICATION_REQUIRED',
        entityType: 'GENERATED_ACCOUNT_DATA',
        entityId: candidateId,
        details: {
          jobId: candidate.job_id,
          notes: params.notes ?? null,
        },
      });
    });

    return this.getEventById(eventId)!;
  }

  public static getEventById(eventId: string): RegistrationEventDTO | null {
    const row = db.raw
      .prepare(
        `SELECT e.*, g.candidate_username, u.username as performed_by_username
         FROM registration_events e
         LEFT JOIN generated_account_data g ON e.candidate_id = g.id
         LEFT JOIN users u ON e.performed_by_id = u.id
         WHERE e.id = ?`
      )
      .get(eventId) as
      | (RegistrationEventRecord & {
          candidate_username: string | null;
          performed_by_username: string | null;
        })
      | undefined;

    if (!row) return null;
    return this.mapEventRow(row);
  }

  public static getHistory(params?: {
    page?: number;
    limit?: number;
    jobId?: string;
    candidateId?: string;
    eventType?: string;
  }): {
    items: RegistrationEventDTO[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  } {
    const page = Math.max(1, params?.page ?? 1);
    const limit = Math.max(1, Math.min(100, params?.limit ?? 25));
    const offset = (page - 1) * limit;

    const conditions: string[] = [];
    const values: (string | number)[] = [];

    if (params?.jobId) {
      conditions.push('e.job_id = ?');
      values.push(params.jobId);
    }
    if (params?.candidateId) {
      conditions.push('e.candidate_id = ?');
      values.push(params.candidateId);
    }
    if (params?.eventType) {
      conditions.push('e.event_type = ?');
      values.push(params.eventType);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const countRow = db.raw
      .prepare(`SELECT COUNT(*) as total FROM registration_events e ${whereClause}`)
      .get(...values) as { total: number };
    const total = Number(countRow?.total ?? 0);

    const rows = db.raw
      .prepare(
        `SELECT e.*, g.candidate_username, u.username as performed_by_username
         FROM registration_events e
         LEFT JOIN generated_account_data g ON e.candidate_id = g.id
         LEFT JOIN users u ON e.performed_by_id = u.id
         ${whereClause}
         ORDER BY e.created_at DESC
         LIMIT ? OFFSET ?`
      )
      .all(...values, limit, offset) as unknown as Array<
      RegistrationEventRecord & {
        candidate_username: string | null;
        performed_by_username: string | null;
      }
    >;

    return {
      items: rows.map((r) => this.mapEventRow(r)),
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    };
  }

  private static mapEventRow(
    row: RegistrationEventRecord & {
      candidate_username: string | null;
      performed_by_username: string | null;
    }
  ): RegistrationEventDTO {
    return {
      id: row.id,
      candidateId: row.candidate_id,
      candidateUsername: row.candidate_username,
      accountId: row.account_id,
      jobId: row.job_id,
      eventType: row.event_type,
      statusBefore: row.status_before,
      statusAfter: row.status_after,
      robloxUserId: row.roblox_user_id,
      robloxUsername: row.roblox_username,
      notes: row.notes,
      performedById: row.performed_by_id,
      performedByUsername: row.performed_by_username,
      createdAt: row.created_at,
    };
  }
}
