import crypto from 'node:crypto';
import { Request, Response, NextFunction } from 'express';
import { argon2id, argon2Verify } from 'hash-wasm';
import { db, UserRecord } from '../db/index.js';
import { env, generateCsrfToken } from '../config/env.js';

export interface AuthenticatedUser {
  id: string;
  username: string;
  email: string;
  role: 'ADMIN' | 'OPERATOR' | 'VIEWER';
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
      sessionId?: string;
      csrfToken?: string;
    }
  }
}

export const SESSION_COOKIE_NAME = 'rage_session';

export class AuthService {
  public static async hashPassword(password: string): Promise<string> {
    const salt = crypto.randomBytes(16);
    return argon2id({
      password,
      salt,
      parallelism: 1,
      iterations: 2,
      memorySize: 19456, // 19 MiB OWASP recommendation for Argon2id
      hashLength: 32,
      outputType: 'encoded',
    });
  }

  public static async verifyPassword(password: string, hash: string): Promise<boolean> {
    try {
      return await argon2Verify({
        password,
        hash,
      });
    } catch {
      return false;
    }
  }

  public static async ensureDefaultUsers(): Promise<void> {
    const existingCount = db.raw.prepare('SELECT COUNT(*) as cnt FROM users').get() as { cnt: number };
    if (Number(existingCount?.cnt ?? 0) > 0) return;

    const now = new Date().toISOString();
    const adminHash = await this.hashPassword('Admin@RobloxEngine2026!');
    const operatorHash = await this.hashPassword('Operator@RobloxEngine2026!');
    const viewerHash = await this.hashPassword('Viewer@RobloxEngine2026!');

    db.transaction(() => {
      const insertUser = db.raw.prepare(`
        INSERT OR IGNORE INTO users (id, username, email, password_hash, role, is_active, created_at, updated_at, deleted_at)
        VALUES (?, ?, ?, ?, ?, 1, ?, ?, NULL)
      `);

      insertUser.run(
        crypto.randomUUID(),
        'admin',
        'admin@rage.internal',
        adminHash,
        'ADMIN',
        now,
        now
      );
      insertUser.run(
        crypto.randomUUID(),
        'operator',
        'operator@rage.internal',
        operatorHash,
        'OPERATOR',
        now,
        now
      );
      insertUser.run(
        crypto.randomUUID(),
        'viewer',
        'viewer@rage.internal',
        viewerHash,
        'VIEWER',
        now,
        now
      );
    });
  }

  public static createSession(userId: string): {
    sessionId: string;
    csrfToken: string;
    expiresAt: string;
  } {
    const sessionId = crypto.randomBytes(32).toString('hex');
    const csrfToken = generateCsrfToken(sessionId);
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();

    db.raw
      .prepare(
        `INSERT INTO sessions (id, user_id, csrf_token, expires_at, created_at)
         VALUES (?, ?, ?, ?, ?)`
      )
      .run(sessionId, userId, csrfToken, expiresAt, now.toISOString());

    return { sessionId, csrfToken, expiresAt };
  }

  public static revokeSession(sessionId: string): void {
    db.raw.prepare('DELETE FROM sessions WHERE id = ?').run(sessionId);
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const sessionId =
    req.cookies?.[SESSION_COOKIE_NAME] ||
    (req.headers.authorization?.startsWith('Bearer ')
      ? req.headers.authorization.slice(7).trim()
      : undefined);

  if (!sessionId) {
    res.status(401).json({
      success: false,
      error: {
        code: 'UNAUTHORIZED',
        message: 'Authentication required',
      },
    });
    return;
  }

  const session = db.raw
    .prepare(
      `SELECT s.id as session_id, s.csrf_token, s.expires_at,
              u.id as user_id, u.username, u.email, u.role, u.is_active, u.deleted_at
       FROM sessions s
       INNER JOIN users u ON s.user_id = u.id
       WHERE s.id = ?`
    )
    .get(sessionId) as
    | {
        session_id: string;
        csrf_token: string;
        expires_at: string;
        user_id: string;
        username: string;
        email: string;
        role: 'ADMIN' | 'OPERATOR' | 'VIEWER';
        is_active: number;
        deleted_at: string | null;
      }
    | undefined;

  if (!session || session.deleted_at !== null || session.is_active !== 1) {
    res.status(401).json({
      success: false,
      error: {
        code: 'INVALID_SESSION',
        message: 'Session is invalid or user account is inactive',
      },
    });
    return;
  }

  if (new Date(session.expires_at).getTime() < Date.now()) {
    AuthService.revokeSession(sessionId);
    res.status(401).json({
      success: false,
      error: {
        code: 'SESSION_EXPIRED',
        message: 'Session has expired, please sign in again',
      },
    });
    return;
  }

  // Enforce CSRF check on state-mutating cookie-authenticated requests
  const isMutating = ['POST', 'PATCH', 'PUT', 'DELETE'].includes(req.method.toUpperCase());
  const usedCookie = Boolean(req.cookies?.[SESSION_COOKIE_NAME]);
  if (isMutating && usedCookie) {
    const headerCsrf = req.headers['x-csrf-token'];
    if (!headerCsrf || headerCsrf !== session.csrf_token) {
      res.status(403).json({
        success: false,
        error: {
          code: 'CSRF_TOKEN_MISMATCH',
          message: 'Missing or invalid CSRF token',
        },
      });
      return;
    }
  }

  req.user = {
    id: session.user_id,
    username: session.username,
    email: session.email,
    role: session.role,
  };
  req.sessionId = session.session_id;
  req.csrfToken = session.csrf_token;
  next();
}

export function requireRole(...allowedRoles: Array<'ADMIN' | 'OPERATOR' | 'VIEWER'>) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Authentication required',
        },
      });
      return;
    }

    if (!allowedRoles.includes(req.user.role)) {
      res.status(403).json({
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: `Insufficient permissions. Required role: ${allowedRoles.join(' or ')}`,
        },
      });
      return;
    }

    next();
  };
}
