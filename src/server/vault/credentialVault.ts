import crypto from 'node:crypto';
import { db, CredentialMetadataRecord } from '../db/index.js';
import { getVaultKeyBuffer } from '../config/env.js';

export interface EncryptedEnvelope {
  keyVersion: number;
  algorithm: 'AES-256-GCM';
  ivHex: string;
  authTagHex: string;
  ciphertextHex: string;
  fingerprintSha256: string;
}

export interface PublicCredentialMetadata {
  id: string;
  keyVersion: number;
  algorithm: string;
  secretType: string;
  fingerprintSha256: string;
  rotatedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface VaultSecretPayload {
  password: string;
  cookie: string | null;
}

export class CredentialVault {
  private static readonly ALGORITHM = 'aes-256-gcm';
  private static readonly IV_BYTES = 12; // 96-bit recommended for GCM
  private static readonly KEY_VERSION = 1;

  public static encryptSecret(plaintext: string, customKey?: Buffer): EncryptedEnvelope {
    if (!plaintext || typeof plaintext !== 'string') {
      throw new Error('Vault encryption requires a non-empty string secret');
    }
    const key = customKey ?? getVaultKeyBuffer();
    if (key.length !== 32) {
      throw new Error('AES-256-GCM requires a 32-byte (256-bit) encryption key');
    }

    const iv = crypto.randomBytes(this.IV_BYTES);
    const cipher = crypto.createCipheriv(this.ALGORITHM, key, iv, { authTagLength: 16 });
    const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();
    const fingerprintSha256 = crypto
      .createHmac('sha256', key)
      .update(plaintext, 'utf8')
      .digest('hex');

    return {
      keyVersion: this.KEY_VERSION,
      algorithm: 'AES-256-GCM',
      ivHex: iv.toString('hex'),
      authTagHex: authTag.toString('hex'),
      ciphertextHex: encrypted.toString('hex'),
      fingerprintSha256,
    };
  }

  public static decryptSecret(
    envelope: Pick<EncryptedEnvelope, 'ivHex' | 'authTagHex' | 'ciphertextHex'>,
    customKey?: Buffer
  ): string {
    const key = customKey ?? getVaultKeyBuffer();
    if (key.length !== 32) {
      throw new Error('AES-256-GCM requires a 32-byte (256-bit) encryption key');
    }

    const iv = Buffer.from(envelope.ivHex, 'hex');
    const authTag = Buffer.from(envelope.authTagHex, 'hex');
    const ciphertext = Buffer.from(envelope.ciphertextHex, 'hex');

    const decipher = crypto.createDecipheriv(this.ALGORITHM, key, iv, { authTagLength: 16 });
    decipher.setAuthTag(authTag);
    const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return decrypted.toString('utf8');
  }

  public static storeCredential(
    plaintext: string,
    secretType: 'PASSWORD' | 'AUTHORIZED_TOKEN' | 'PASSWORD_AND_COOKIE' = 'PASSWORD',
    cookie?: string | null
  ): PublicCredentialMetadata {
    const serialized =
      cookie !== undefined && cookie !== null
        ? JSON.stringify({ password: plaintext, cookie })
        : plaintext;

    const effectiveType = cookie ? 'PASSWORD_AND_COOKIE' : secretType;
    const envelope = this.encryptSecret(serialized);
    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    const stmt = db.raw.prepare(`
      INSERT INTO credential_metadata (
        id, key_version, algorithm, iv_hex, auth_tag_hex, ciphertext_hex,
        secret_type, fingerprint_sha256, rotated_at, created_at, updated_at, deleted_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, NULL)
    `);

    stmt.run(
      id,
      envelope.keyVersion,
      envelope.algorithm,
      envelope.ivHex,
      envelope.authTagHex,
      envelope.ciphertextHex,
      effectiveType,
      envelope.fingerprintSha256,
      now,
      now
    );

    return {
      id,
      keyVersion: envelope.keyVersion,
      algorithm: envelope.algorithm,
      secretType: effectiveType,
      fingerprintSha256: envelope.fingerprintSha256,
      rotatedAt: null,
      createdAt: now,
      updatedAt: now,
    };
  }

  public static updateCredentialWithCookie(
    credentialId: string,
    password: string,
    cookie: string
  ): PublicCredentialMetadata {
    const serialized = JSON.stringify({ password, cookie });
    const envelope = this.encryptSecret(serialized);
    const now = new Date().toISOString();

    db.raw
      .prepare(
        `UPDATE credential_metadata
         SET iv_hex = ?, auth_tag_hex = ?, ciphertext_hex = ?,
             secret_type = 'PASSWORD_AND_COOKIE', fingerprint_sha256 = ?,
             rotated_at = ?, updated_at = ?
         WHERE id = ?`
      )
      .run(
        envelope.ivHex,
        envelope.authTagHex,
        envelope.ciphertextHex,
        envelope.fingerprintSha256,
        now,
        now,
        credentialId
      );

    return this.getPublicMetadata(credentialId)!;
  }

  public static getPublicMetadata(credentialId: string): PublicCredentialMetadata | null {
    const row = db.raw
      .prepare(
        `SELECT id, key_version, algorithm, secret_type, fingerprint_sha256, rotated_at, created_at, updated_at
         FROM credential_metadata
         WHERE id = ? AND deleted_at IS NULL`
      )
      .get(credentialId) as Omit<
      CredentialMetadataRecord,
      'iv_hex' | 'auth_tag_hex' | 'ciphertext_hex' | 'deleted_at'
    > | undefined;

    if (!row) return null;
    return {
      id: row.id,
      keyVersion: row.key_version,
      algorithm: row.algorithm,
      secretType: row.secret_type,
      fingerprintSha256: row.fingerprint_sha256,
      rotatedAt: row.rotated_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  public static retrieveSecretPayload(credentialId: string): VaultSecretPayload {
    const row = db.raw
      .prepare(
        `SELECT iv_hex, auth_tag_hex, ciphertext_hex, secret_type
         FROM credential_metadata
         WHERE id = ? AND deleted_at IS NULL`
      )
      .get(credentialId) as
      | Pick<CredentialMetadataRecord, 'iv_hex' | 'auth_tag_hex' | 'ciphertext_hex' | 'secret_type'>
      | undefined;

    if (!row) {
      return { password: '', cookie: null };
    }

    const raw = this.decryptSecret({
      ivHex: row.iv_hex,
      authTagHex: row.auth_tag_hex,
      ciphertextHex: row.ciphertext_hex,
    });

    if (row.secret_type === 'PASSWORD_AND_COOKIE' || raw.startsWith('{')) {
      try {
        const parsed = JSON.parse(raw) as { password?: string; cookie?: string };
        if (typeof parsed.password === 'string') {
          return {
            password: parsed.password,
            cookie: parsed.cookie ?? null,
          };
        }
      } catch {
        // fallback to raw password
      }
    }

    return { password: raw, cookie: null };
  }

  /**
   * Internal-only retrieval for human-supervised registration preparation checklist.
   * Never exposed in ordinary account listing responses.
   */
  public static retrieveForSupervisedRegistration(credentialId: string): string | null {
    const payload = this.retrieveSecretPayload(credentialId);
    return payload.password || null;
  }

  /**
   * Formats an account's credentials as username:password:cookie for authorized operator export.
   */
  public static formatAccountCredentialLine(
    username: string,
    credentialId: string | null
  ): string {
    if (!credentialId) {
      return `${username}::`;
    }
    const payload = this.retrieveSecretPayload(credentialId);
    return `${username}:${payload.password}:${payload.cookie ?? ''}`;
  }
}
