import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { env } from '../config/env.js';

export interface UserRecord {
  id: string;
  username: string;
  email: string;
  password_hash: string;
  role: 'ADMIN' | 'OPERATOR' | 'VIEWER';
  is_active: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface CredentialMetadataRecord {
  id: string;
  key_version: number;
  algorithm: string;
  iv_hex: string;
  auth_tag_hex: string;
  ciphertext_hex: string;
  secret_type: 'PASSWORD' | 'AUTHORIZED_TOKEN' | 'PASSWORD_AND_COOKIE';
  fingerprint_sha256: string;
  rotated_at: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface AccountRecord {
  id: string;
  roblox_username: string;
  roblox_user_id: string | null;
  credential_id: string | null;
  category: string;
  registration_status: 'REGISTERED' | 'PENDING_CONFIRMATION' | 'SUSPENDED' | 'ARCHIVED';
  verification_status: 'UNVERIFIED' | 'VERIFICATION_REQUIRED' | 'VERIFIED';
  notes: string | null;
  tags_json: string;
  created_by_id: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface AccountGenerationJobRecord {
  id: string;
  name: string;
  status: 'PENDING' | 'PROCESSING' | 'PAUSED' | 'COMPLETED' | 'FAILED' | 'VERIFICATION_REQUIRED' | 'CANCELED';
  total_count: number;
  processed_count: number;
  completed_count: number;
  failed_count: number;
  verification_required_count: number;
  config_json: string;
  error_message: string | null;
  started_at: string | null;
  paused_at: string | null;
  completed_at: string | null;
  canceled_at: string | null;
  created_by_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface GeneratedAccountDataRecord {
  id: string;
  job_id: string | null;
  candidate_username: string;
  prefix: string | null;
  suffix: string | null;
  length: number;
  credential_id: string | null;
  validation_status: 'VALID' | 'INVALID';
  validation_errors: string | null;
  registration_state:
    | 'GENERATED_CANDIDATE'
    | 'QUEUED_FOR_PREPARATION'
    | 'READY_FOR_HUMAN_REGISTRATION'
    | 'VERIFICATION_REQUIRED'
    | 'REGISTERED'
    | 'FAILED';
  account_id: string | null;
  attempt_count: number;
  last_error: string | null;
  created_at: string;
  updated_at: string;
}

export interface RegistrationEventRecord {
  id: string;
  candidate_id: string;
  account_id: string | null;
  job_id: string | null;
  event_type: string;
  status_before: string | null;
  status_after: string;
  roblox_user_id: string | null;
  roblox_username: string | null;
  notes: string | null;
  performed_by_id: string | null;
  created_at: string;
}

export interface ActivityLogRecord {
  id: string;
  user_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  details_json: string;
  ip_address: string | null;
  created_at: string;
}

class DatabaseManager {
  private db: DatabaseSync;
  private dbPath: string;
  private inTransaction = false;

  constructor(customPath?: string) {
    this.dbPath = customPath || (env.NODE_ENV === 'test' ? ':memory:' : env.SQLITE_DATA_PATH);
    if (this.dbPath !== ':memory:') {
      const dir = path.dirname(path.resolve(this.dbPath));
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
      }
    }
    this.db = new DatabaseSync(this.dbPath);
    this.initialize();
  }

  private initialize(): void {
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA synchronous = NORMAL;
      PRAGMA foreign_keys = ON;
      PRAGMA temp_store = MEMORY;
      PRAGMA cache_size = -64000;

      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        username TEXT NOT NULL UNIQUE,
        email TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'OPERATOR',
        is_active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        deleted_at TEXT
      );

      CREATE TABLE IF NOT EXISTS credential_metadata (
        id TEXT PRIMARY KEY,
        key_version INTEGER NOT NULL DEFAULT 1,
        algorithm TEXT NOT NULL DEFAULT 'AES-256-GCM',
        iv_hex TEXT NOT NULL,
        auth_tag_hex TEXT NOT NULL,
        ciphertext_hex TEXT NOT NULL,
        secret_type TEXT NOT NULL DEFAULT 'PASSWORD',
        fingerprint_sha256 TEXT NOT NULL,
        rotated_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        deleted_at TEXT
      );

      CREATE TABLE IF NOT EXISTS accounts (
        id TEXT PRIMARY KEY,
        roblox_username TEXT NOT NULL UNIQUE,
        roblox_user_id TEXT UNIQUE,
        credential_id TEXT UNIQUE,
        category TEXT NOT NULL DEFAULT 'STANDARD',
        registration_status TEXT NOT NULL DEFAULT 'REGISTERED',
        verification_status TEXT NOT NULL DEFAULT 'UNVERIFIED',
        notes TEXT,
        tags_json TEXT NOT NULL DEFAULT '[]',
        created_by_id TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        deleted_at TEXT,
        FOREIGN KEY (credential_id) REFERENCES credential_metadata(id) ON DELETE SET NULL,
        FOREIGN KEY (created_by_id) REFERENCES users(id) ON DELETE SET NULL
      );

      CREATE TABLE IF NOT EXISTS account_generation_jobs (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'PENDING',
        total_count INTEGER NOT NULL DEFAULT 0,
        processed_count INTEGER NOT NULL DEFAULT 0,
        completed_count INTEGER NOT NULL DEFAULT 0,
        failed_count INTEGER NOT NULL DEFAULT 0,
        verification_required_count INTEGER NOT NULL DEFAULT 0,
        config_json TEXT NOT NULL DEFAULT '{}',
        error_message TEXT,
        started_at TEXT,
        paused_at TEXT,
        completed_at TEXT,
        canceled_at TEXT,
        created_by_id TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (created_by_id) REFERENCES users(id) ON DELETE SET NULL
      );

      CREATE TABLE IF NOT EXISTS generated_account_data (
        id TEXT PRIMARY KEY,
        job_id TEXT,
        candidate_username TEXT NOT NULL UNIQUE,
        prefix TEXT,
        suffix TEXT,
        length INTEGER NOT NULL,
        credential_id TEXT UNIQUE,
        validation_status TEXT NOT NULL DEFAULT 'VALID',
        validation_errors TEXT,
        registration_state TEXT NOT NULL DEFAULT 'GENERATED_CANDIDATE',
        account_id TEXT UNIQUE,
        attempt_count INTEGER NOT NULL DEFAULT 0,
        last_error TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (job_id) REFERENCES account_generation_jobs(id) ON DELETE CASCADE,
        FOREIGN KEY (credential_id) REFERENCES credential_metadata(id) ON DELETE SET NULL,
        FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE SET NULL
      );

      CREATE TABLE IF NOT EXISTS registration_events (
        id TEXT PRIMARY KEY,
        candidate_id TEXT NOT NULL,
        account_id TEXT,
        job_id TEXT,
        event_type TEXT NOT NULL,
        status_before TEXT,
        status_after TEXT NOT NULL,
        roblox_user_id TEXT,
        roblox_username TEXT,
        notes TEXT,
        performed_by_id TEXT,
        created_at TEXT NOT NULL,
        FOREIGN KEY (candidate_id) REFERENCES generated_account_data(id) ON DELETE CASCADE,
        FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE SET NULL,
        FOREIGN KEY (job_id) REFERENCES account_generation_jobs(id) ON DELETE SET NULL,
        FOREIGN KEY (performed_by_id) REFERENCES users(id) ON DELETE SET NULL
      );

      CREATE TABLE IF NOT EXISTS activity_logs (
        id TEXT PRIMARY KEY,
        user_id TEXT,
        action TEXT NOT NULL,
        entity_type TEXT NOT NULL,
        entity_id TEXT,
        details_json TEXT NOT NULL DEFAULT '{}',
        ip_address TEXT,
        created_at TEXT NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
      );

      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        csrf_token TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        created_at TEXT NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS system_settings (
        key TEXT PRIMARY KEY,
        value_json TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_users_role_active ON users(role, is_active);
      CREATE INDEX IF NOT EXISTS idx_users_deleted ON users(deleted_at);
      CREATE INDEX IF NOT EXISTS idx_cred_fingerprint ON credential_metadata(fingerprint_sha256);
      CREATE INDEX IF NOT EXISTS idx_accounts_filters ON accounts(category, registration_status, verification_status);
      CREATE INDEX IF NOT EXISTS idx_accounts_created ON accounts(created_at);
      CREATE INDEX IF NOT EXISTS idx_accounts_deleted ON accounts(deleted_at);
      CREATE INDEX IF NOT EXISTS idx_jobs_status_created ON account_generation_jobs(status, created_at);
      CREATE INDEX IF NOT EXISTS idx_gen_job_state ON generated_account_data(job_id, registration_state);
      CREATE INDEX IF NOT EXISTS idx_gen_validation ON generated_account_data(validation_status);
      CREATE INDEX IF NOT EXISTS idx_gen_created ON generated_account_data(created_at);
      CREATE INDEX IF NOT EXISTS idx_regevents_candidate ON registration_events(candidate_id, created_at);
      CREATE INDEX IF NOT EXISTS idx_regevents_job ON registration_events(job_id, event_type);
      CREATE INDEX IF NOT EXISTS idx_logs_action_entity ON activity_logs(action, entity_type);
      CREATE INDEX IF NOT EXISTS idx_logs_created ON activity_logs(created_at);
    `);
  }

  public get raw(): DatabaseSync {
    return this.db;
  }

  public transaction<T>(fn: () => T): T {
    if (this.inTransaction) {
      return fn();
    }
    this.db.exec('BEGIN IMMEDIATE TRANSACTION');
    this.inTransaction = true;
    try {
      const result = fn();
      this.db.exec('COMMIT');
      this.inTransaction = false;
      return result;
    } catch (err) {
      if (this.inTransaction) {
        try {
          this.db.exec('ROLLBACK');
        } catch {
          // ignore rollback error if already rolled back
        }
        this.inTransaction = false;
      }
      throw err;
    }
  }

  public logActivity(params: {
    userId?: string | null;
    action: string;
    entityType: string;
    entityId?: string | null;
    details?: Record<string, unknown>;
    ipAddress?: string | null;
  }): ActivityLogRecord {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const detailsJson = JSON.stringify(params.details ?? {});
    const stmt = this.db.prepare(`
      INSERT INTO activity_logs (id, user_id, action, entity_type, entity_id, details_json, ip_address, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      id,
      params.userId ?? null,
      params.action,
      params.entityType,
      params.entityId ?? null,
      detailsJson,
      params.ipAddress ?? null,
      now
    );
    return {
      id,
      user_id: params.userId ?? null,
      action: params.action,
      entity_type: params.entityType,
      entity_id: params.entityId ?? null,
      details_json: detailsJson,
      ip_address: params.ipAddress ?? null,
      created_at: now,
    };
  }

  public healthCheck(): { connected: boolean; engine: string; tables: number } {
    const row = this.db
      .prepare("SELECT COUNT(*) as cnt FROM sqlite_master WHERE type='table'")
      .get() as { cnt: number };
    return {
      connected: true,
      engine: 'Prisma-Compatible SQL Engine (WAL ACID)',
      tables: Number(row?.cnt ?? 0),
    };
  }

  public resetForTests(): void {
    this.db.exec(`
      DELETE FROM registration_events;
      DELETE FROM activity_logs;
      DELETE FROM generated_account_data;
      DELETE FROM account_generation_jobs;
      DELETE FROM accounts;
      DELETE FROM credential_metadata;
      DELETE FROM sessions;
      DELETE FROM system_settings;
      DELETE FROM users;
    `);
  }
}

export const db = new DatabaseManager();
export { DatabaseManager };
