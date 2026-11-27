import crypto from 'node:crypto';
import { db, AccountRecord } from '../db/index.js';
import { CredentialVault, PublicCredentialMetadata } from '../vault/credentialVault.js';

export interface AccountFilterParams {
  search?: string;
  category?: string;
  registrationStatus?: string;
  verificationStatus?: string;
  tag?: string;
}

export interface AccountDTO {
  id: string;
  robloxUsername: string;
  robloxUserId: string | null;
  credentialId: string | null;
  hasVaultCredential: boolean;
  credentialMetadata: PublicCredentialMetadata | null;
  category: string;
  registrationStatus: 'REGISTERED' | 'PENDING_CONFIRMATION' | 'SUSPENDED' | 'ARCHIVED';
  verificationStatus: 'UNVERIFIED' | 'VERIFICATION_REQUIRED' | 'VERIFIED';
  notes: string | null;
  tags: string[];
  createdById: string | null;
  createdAt: string;
  updatedAt: string;
}

export class AccountService {
  /**
   * Lists non-deleted accounts with server-side pagination, search, filtering, and sorting.
   * NEVER exposes plaintext passwords or encrypted ciphertext in responses.
   */
  public static listAccounts(params?: {
    page?: number;
    limit?: number;
    search?: string;
    category?: string;
    registrationStatus?: string;
    verificationStatus?: string;
    tag?: string;
    sortBy?: 'created_at' | 'updated_at' | 'roblox_username' | 'category';
    sortOrder?: 'asc' | 'desc';
  }): {
    items: AccountDTO[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  } {
    const page = Math.max(1, params?.page ?? 1);
    const limit = Math.max(1, Math.min(200, params?.limit ?? 25));
    const offset = (page - 1) * limit;

    const { whereClause, values } = this.buildListWhereClause(params);

    const allowedSortColumns: Record<string, string> = {
      created_at: 'a.created_at',
      updated_at: 'a.updated_at',
      roblox_username: 'a.roblox_username',
      category: 'a.category',
    };
    const sortCol = allowedSortColumns[params?.sortBy ?? 'created_at'] ?? 'a.created_at';
    const sortDir = params?.sortOrder?.toLowerCase() === 'asc' ? 'ASC' : 'DESC';

    const countRow = db.raw
      .prepare(`SELECT COUNT(*) as total FROM accounts a ${whereClause}`)
      .get(...values) as { total: number };
    const total = Number(countRow?.total ?? 0);

    const rows = db.raw
      .prepare(
        `SELECT a.*,
                c.key_version, c.algorithm, c.secret_type, c.fingerprint_sha256, c.rotated_at,
                c.created_at as cred_created_at, c.updated_at as cred_updated_at
         FROM accounts a
         LEFT JOIN credential_metadata c ON a.credential_id = c.id AND c.deleted_at IS NULL
         ${whereClause}
         ORDER BY ${sortCol} ${sortDir}
         LIMIT ? OFFSET ?`
      )
      .all(...values, limit, offset) as unknown as Array<
      AccountRecord & {
        key_version: number | null;
        algorithm: string | null;
        secret_type: string | null;
        fingerprint_sha256: string | null;
        rotated_at: string | null;
        cred_created_at: string | null;
        cred_updated_at: string | null;
      }
    >;

    return {
      items: rows.map((r) => this.mapRowToDTO(r)),
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    };
  }

  public static getAccountById(id: string): AccountDTO | null {
    const row = db.raw
      .prepare(
        `SELECT a.*,
                c.key_version, c.algorithm, c.secret_type, c.fingerprint_sha256, c.rotated_at,
                c.created_at as cred_created_at, c.updated_at as cred_updated_at
         FROM accounts a
         LEFT JOIN credential_metadata c ON a.credential_id = c.id AND c.deleted_at IS NULL
         WHERE a.id = ? AND a.deleted_at IS NULL`
      )
      .get(id) as
      | (AccountRecord & {
          key_version: number | null;
          algorithm: string | null;
          secret_type: string | null;
          fingerprint_sha256: string | null;
          rotated_at: string | null;
          cred_created_at: string | null;
          cred_updated_at: string | null;
        })
      | undefined;

    if (!row) return null;
    return this.mapRowToDTO(row);
  }

  public static createAccount(params: {
    robloxUsername: string;
    robloxUserId?: string | null;
    password?: string | null;
    category?: string;
    registrationStatus?: 'REGISTERED' | 'PENDING_CONFIRMATION' | 'SUSPENDED' | 'ARCHIVED';
    verificationStatus?: 'UNVERIFIED' | 'VERIFICATION_REQUIRED' | 'VERIFIED';
    notes?: string | null;
    tags?: string[];
    createdById?: string | null;
  }): AccountDTO {
    const username = params.robloxUsername.trim();
    const userId = params.robloxUserId?.trim() || null;

    const existing = db.raw
      .prepare(
        `SELECT id FROM accounts
         WHERE LOWER(roblox_username) = LOWER(?)
            OR (? IS NOT NULL AND roblox_user_id = ?)`
      )
      .get(username, userId, userId) as { id: string } | undefined;

    if (existing) {
      throw new Error('An account with this Roblox username or User ID already exists');
    }

    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    db.transaction(() => {
      let credentialId: string | null = null;
      if (params.password && params.password.trim().length > 0) {
        const credMeta = CredentialVault.storeCredential(params.password.trim(), 'PASSWORD');
        credentialId = credMeta.id;
      }

      db.raw
        .prepare(
          `INSERT INTO accounts (
            id, roblox_username, roblox_user_id, credential_id, category,
            registration_status, verification_status, notes, tags_json,
            created_by_id, created_at, updated_at, deleted_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)`
        )
        .run(
          id,
          username,
          userId,
          credentialId,
          (params.category ?? 'STANDARD').toUpperCase(),
          params.registrationStatus ?? 'REGISTERED',
          params.verificationStatus ?? 'UNVERIFIED',
          params.notes ?? null,
          JSON.stringify(params.tags ?? []),
          params.createdById ?? null,
          now,
          now
        );

      db.logActivity({
        userId: params.createdById ?? null,
        action: 'CREATE_ACCOUNT',
        entityType: 'ACCOUNT',
        entityId: id,
        details: {
          robloxUsername: username,
          robloxUserId: userId,
          category: (params.category ?? 'STANDARD').toUpperCase(),
          hasCredential: credentialId !== null,
        },
      });
    });

    return this.getAccountById(id)!;
  }

  public static updateAccount(
    id: string,
    params: {
      robloxUsername?: string;
      robloxUserId?: string | null;
      password?: string | null;
      category?: string;
      registrationStatus?: 'REGISTERED' | 'PENDING_CONFIRMATION' | 'SUSPENDED' | 'ARCHIVED';
      verificationStatus?: 'UNVERIFIED' | 'VERIFICATION_REQUIRED' | 'VERIFIED';
      notes?: string | null;
      tags?: string[];
      updatedById?: string | null;
    }
  ): AccountDTO {
    const current = db.raw
      .prepare('SELECT * FROM accounts WHERE id = ? AND deleted_at IS NULL')
      .get(id) as AccountRecord | undefined;

    if (!current) {
      throw new Error('Account not found');
    }

    const nextUsername = params.robloxUsername?.trim() || current.roblox_username;
    const nextUserId =
      params.robloxUserId !== undefined ? params.robloxUserId?.trim() || null : current.roblox_user_id;

    if (
      nextUsername.toLowerCase() !== current.roblox_username.toLowerCase() ||
      (nextUserId && nextUserId !== current.roblox_user_id)
    ) {
      const conflict = db.raw
        .prepare(
          `SELECT id FROM accounts
           WHERE id != ? AND (LOWER(roblox_username) = LOWER(?) OR (? IS NOT NULL AND roblox_user_id = ?))`
        )
        .get(id, nextUsername, nextUserId, nextUserId) as { id: string } | undefined;

      if (conflict) {
        throw new Error('Another account with this Roblox username or User ID already exists');
      }
    }

    const now = new Date().toISOString();

    db.transaction(() => {
      let credentialId = current.credential_id;
      if (params.password && params.password.trim().length > 0) {
        const credMeta = CredentialVault.storeCredential(params.password.trim(), 'PASSWORD');
        credentialId = credMeta.id;
      }

      db.raw
        .prepare(
          `UPDATE accounts
           SET roblox_username = ?,
               roblox_user_id = ?,
               credential_id = ?,
               category = ?,
               registration_status = ?,
               verification_status = ?,
               notes = ?,
               tags_json = ?,
               updated_at = ?
           WHERE id = ?`
        )
        .run(
          nextUsername,
          nextUserId,
          credentialId,
          params.category ? params.category.toUpperCase() : current.category,
          params.registrationStatus ?? current.registration_status,
          params.verificationStatus ?? current.verification_status,
          params.notes !== undefined ? params.notes : current.notes,
          params.tags !== undefined ? JSON.stringify(params.tags) : current.tags_json,
          now,
          id
        );

      db.logActivity({
        userId: params.updatedById ?? null,
        action: 'UPDATE_ACCOUNT',
        entityType: 'ACCOUNT',
        entityId: id,
        details: {
          robloxUsername: nextUsername,
          category: params.category ?? current.category,
          registrationStatus: params.registrationStatus ?? current.registration_status,
          verificationStatus: params.verificationStatus ?? current.verification_status,
        },
      });
    });

    return this.getAccountById(id)!;
  }

  /**
   * Soft-deletes an account and its associated credential metadata
   */
  public static deleteAccount(id: string, deletedById?: string | null): boolean {
    const current = db.raw
      .prepare('SELECT * FROM accounts WHERE id = ? AND deleted_at IS NULL')
      .get(id) as AccountRecord | undefined;

    if (!current) {
      throw new Error('Account not found');
    }

    const now = new Date().toISOString();

    db.transaction(() => {
      db.raw.prepare('UPDATE accounts SET deleted_at = ?, updated_at = ? WHERE id = ?').run(now, now, id);
      if (current.credential_id) {
        db.raw
          .prepare('UPDATE credential_metadata SET deleted_at = ?, updated_at = ? WHERE id = ?')
          .run(now, now, current.credential_id);
      }

      db.logActivity({
        userId: deletedById ?? null,
        action: 'DELETE_ACCOUNT',
        entityType: 'ACCOUNT',
        entityId: id,
        details: { robloxUsername: current.roblox_username },
      });
    });

    return true;
  }

  /**
   * High-performance bulk insert of registered accounts for 5,000-record scale & load testing
   */
  public static bulkCreateAccounts(
    records: Array<{
      robloxUsername: string;
      robloxUserId?: string | null;
      password?: string;
      category?: string;
      registrationStatus?: 'REGISTERED' | 'PENDING_CONFIRMATION' | 'SUSPENDED' | 'ARCHIVED';
      verificationStatus?: 'UNVERIFIED' | 'VERIFICATION_REQUIRED' | 'VERIFIED';
      notes?: string | null;
      tags?: string[];
    }>,
    createdById?: string | null
  ): { insertedCount: number } {
    const now = new Date().toISOString();
    let insertedCount = 0;

    db.transaction(() => {
      const insertCredStmt = db.raw.prepare(`
        INSERT INTO credential_metadata (
          id, key_version, algorithm, iv_hex, auth_tag_hex, ciphertext_hex,
          secret_type, fingerprint_sha256, rotated_at, created_at, updated_at, deleted_at
        ) VALUES (?, ?, ?, ?, ?, ?, 'PASSWORD', ?, NULL, ?, ?, NULL)
      `);

      const insertAccStmt = db.raw.prepare(`
        INSERT INTO accounts (
          id, roblox_username, roblox_user_id, credential_id, category,
          registration_status, verification_status, notes, tags_json,
          created_by_id, created_at, updated_at, deleted_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)
      `);

      for (const rec of records) {
        let credId: string | null = null;
        if (rec.password) {
          credId = crypto.randomUUID();
          const env = CredentialVault.encryptSecret(rec.password);
          insertCredStmt.run(
            credId,
            env.keyVersion,
            env.algorithm,
            env.ivHex,
            env.authTagHex,
            env.ciphertextHex,
            env.fingerprintSha256,
            now,
            now
          );
        }

        const accId = crypto.randomUUID();
        insertAccStmt.run(
          accId,
          rec.robloxUsername,
          rec.robloxUserId ?? null,
          credId,
          (rec.category ?? 'STANDARD').toUpperCase(),
          rec.registrationStatus ?? 'REGISTERED',
          rec.verificationStatus ?? 'VERIFIED',
          rec.notes ?? null,
          JSON.stringify(rec.tags ?? []),
          createdById ?? null,
          now,
          now
        );
        insertedCount++;
      }
    });

    return { insertedCount };
  }

  /**
   * Lists all non-deleted account IDs matching the active filter parameters.
   */
  public static listMatchingAccountIds(params?: AccountFilterParams): string[] {
    const { whereClause, values } = this.buildListWhereClause(params);
    const rows = db.raw
      .prepare(`SELECT a.id FROM accounts a ${whereClause} ORDER BY a.created_at DESC`)
      .all(...values) as Array<{ id: string }>;
    return rows.map((r) => r.id);
  }

  /**
   * Formats username:password:cookie lines for all accounts or a specific ID selection.
   */
  public static exportFormattedCredentials(ids?: string[]): {
    count: number;
    lines: string[];
    text: string;
  } {
    const rows: Array<{
      roblox_username: string;
      credential_id: string | null;
      created_at: string;
    }> = [];
    if (!ids) {
      const allRows = db.raw
        .prepare(
          `SELECT roblox_username, credential_id, created_at
           FROM accounts
           WHERE deleted_at IS NULL
           ORDER BY created_at DESC`
        )
        .all() as unknown as Array<{
        roblox_username: string;
        credential_id: string | null;
        created_at: string;
      }>;
      rows.push(...allRows);
    } else {
      const uniqueIds = Array.from(new Set(ids.map((id) => id.trim()).filter(Boolean)));
      for (const chunk of this.chunkIds(uniqueIds)) {
        const placeholders = chunk.map(() => '?').join(',');
        const found = db.raw
          .prepare(
            `SELECT roblox_username, credential_id, created_at
             FROM accounts
             WHERE deleted_at IS NULL AND id IN (${placeholders})`
          )
          .all(...chunk) as unknown as Array<{
          roblox_username: string;
          credential_id: string | null;
          created_at: string;
        }>;
        rows.push(...found);
      }
      rows.sort((a, b) => b.created_at.localeCompare(a.created_at));
    }

    const lines = rows.map((r) =>
      CredentialVault.formatAccountCredentialLine(r.roblox_username, r.credential_id)
    );
    return {
      count: lines.length,
      lines,
      text: lines.join('\n'),
    };
  }

  /**
   * Bulk-updates category, registration status, or verification status for selected accounts.
   */
  public static bulkUpdateAccounts(
    ids: string[],
    updates: {
      category?: string;
      registrationStatus?: 'REGISTERED' | 'PENDING_CONFIRMATION' | 'SUSPENDED' | 'ARCHIVED';
      verificationStatus?: 'UNVERIFIED' | 'VERIFICATION_REQUIRED' | 'VERIFIED';
    },
    updatedById?: string | null
  ): { updatedCount: number } {
    const uniqueIds = Array.from(new Set(ids.map((id) => id.trim()).filter(Boolean)));
    if (uniqueIds.length === 0) return { updatedCount: 0 };

    const setClauses: string[] = [];
    const setValues: string[] = [];
    if (updates.category) {
      setClauses.push('category = ?');
      setValues.push(updates.category.toUpperCase());
    }
    if (updates.registrationStatus) {
      setClauses.push('registration_status = ?');
      setValues.push(updates.registrationStatus);
    }
    if (updates.verificationStatus) {
      setClauses.push('verification_status = ?');
      setValues.push(updates.verificationStatus);
    }
    if (setClauses.length === 0) {
      return { updatedCount: 0 };
    }

    const now = new Date().toISOString();
    setClauses.push('updated_at = ?');
    setValues.push(now);

    let updatedCount = 0;
    db.transaction(() => {
      for (const chunk of this.chunkIds(uniqueIds)) {
        const placeholders = chunk.map(() => '?').join(',');
        const res = db.raw
          .prepare(
            `UPDATE accounts SET ${setClauses.join(', ')} WHERE deleted_at IS NULL AND id IN (${placeholders})`
          )
          .run(...setValues, ...chunk);
        updatedCount += Number(res.changes ?? 0);
      }

      db.logActivity({
        userId: updatedById ?? null,
        action: 'BULK_UPDATE_ACCOUNTS',
        entityType: 'ACCOUNT',
        entityId: null,
        details: {
          requestedCount: uniqueIds.length,
          updatedCount,
          category: updates.category ?? null,
          registrationStatus: updates.registrationStatus ?? null,
          verificationStatus: updates.verificationStatus ?? null,
        },
      });
    });

    return { updatedCount };
  }

  /**
   * Soft-deletes multiple accounts and their vault metadata in one transaction.
   */
  public static bulkDeleteAccounts(
    ids: string[],
    deletedById?: string | null
  ): { deletedCount: number } {
    const uniqueIds = Array.from(new Set(ids.map((id) => id.trim()).filter(Boolean)));
    if (uniqueIds.length === 0) return { deletedCount: 0 };

    const now = new Date().toISOString();
    let deletedCount = 0;

    db.transaction(() => {
      for (const chunk of this.chunkIds(uniqueIds)) {
        const placeholders = chunk.map(() => '?').join(',');
        const credRows = db.raw
          .prepare(
            `SELECT credential_id FROM accounts
             WHERE deleted_at IS NULL AND id IN (${placeholders}) AND credential_id IS NOT NULL`
          )
          .all(...chunk) as Array<{ credential_id: string }>;

        const accRes = db.raw
          .prepare(
            `UPDATE accounts SET deleted_at = ?, updated_at = ? WHERE deleted_at IS NULL AND id IN (${placeholders})`
          )
          .run(now, now, ...chunk);
        deletedCount += Number(accRes.changes ?? 0);

        const credIds = credRows.map((r) => r.credential_id);
        if (credIds.length > 0) {
          const credPlaceholders = credIds.map(() => '?').join(',');
          db.raw
            .prepare(
              `UPDATE credential_metadata SET deleted_at = ?, updated_at = ? WHERE deleted_at IS NULL AND id IN (${credPlaceholders})`
            )
            .run(now, now, ...credIds);
        }
      }

      db.logActivity({
        userId: deletedById ?? null,
        action: 'BULK_DELETE_ACCOUNTS',
        entityType: 'ACCOUNT',
        entityId: null,
        details: { requestedCount: uniqueIds.length, deletedCount },
      });
    });

    return { deletedCount };
  }

  private static chunkIds(ids: string[], chunkSize = 500): string[][] {
    const chunks: string[][] = [];
    for (let i = 0; i < ids.length; i += chunkSize) {
      chunks.push(ids.slice(i, i + chunkSize));
    }
    return chunks;
  }

  private static buildListWhereClause(params?: AccountFilterParams): {
    whereClause: string;
    values: (string | number)[];
  } {
    const conditions: string[] = ['a.deleted_at IS NULL'];
    const values: (string | number)[] = [];

    if (params?.search && params.search.trim() !== '') {
      const q = `%${params.search.trim()}%`;
      conditions.push(
        '(LOWER(a.roblox_username) LIKE LOWER(?) OR a.roblox_user_id LIKE ? OR LOWER(COALESCE(a.notes, "")) LIKE LOWER(?) OR LOWER(a.tags_json) LIKE LOWER(?))'
      );
      values.push(q, q, q, q);
    }

    if (params?.category) {
      conditions.push('a.category = ?');
      values.push(params.category);
    }

    if (params?.registrationStatus) {
      conditions.push('a.registration_status = ?');
      values.push(params.registrationStatus);
    }

    if (params?.verificationStatus) {
      conditions.push('a.verification_status = ?');
      values.push(params.verificationStatus);
    }

    if (params?.tag) {
      conditions.push('LOWER(a.tags_json) LIKE LOWER(?)');
      values.push(`%"${params.tag.trim()}"%`);
    }

    return {
      whereClause: `WHERE ${conditions.join(' AND ')}`,
      values,
    };
  }

  private static mapRowToDTO(
    row: AccountRecord & {
      key_version?: number | null;
      algorithm?: string | null;
      secret_type?: string | null;
      fingerprint_sha256?: string | null;
      rotated_at?: string | null;
      cred_created_at?: string | null;
      cred_updated_at?: string | null;
    }
  ): AccountDTO {
    let tags: string[] = [];
    try {
      tags = JSON.parse(row.tags_json || '[]');
    } catch {
      tags = [];
    }

    const credentialMetadata: PublicCredentialMetadata | null =
      row.credential_id && row.fingerprint_sha256
        ? {
            id: row.credential_id,
            keyVersion: row.key_version ?? 1,
            algorithm: row.algorithm ?? 'AES-256-GCM',
            secretType: row.secret_type ?? 'PASSWORD',
            fingerprintSha256: row.fingerprint_sha256,
            rotatedAt: row.rotated_at ?? null,
            createdAt: row.cred_created_at ?? row.created_at,
            updatedAt: row.cred_updated_at ?? row.updated_at,
          }
        : null;

    return {
      id: row.id,
      robloxUsername: row.roblox_username,
      robloxUserId: row.roblox_user_id,
      credentialId: row.credential_id,
      hasVaultCredential: credentialMetadata !== null,
      credentialMetadata,
      category: row.category,
      registrationStatus: row.registration_status,
      verificationStatus: row.verification_status,
      notes: row.notes,
      tags,
      createdById: row.created_by_id,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}
