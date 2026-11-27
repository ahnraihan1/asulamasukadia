import { z } from 'zod';
import crypto from 'node:crypto';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  DATABASE_URL: z
    .string()
    .default('postgresql://postgres:postgres@localhost:5432/roblox_account_engine?schema=public'),
  REDIS_URL: z.string().default('redis://localhost:6379'),
  SESSION_SECRET: z
    .string()
    .min(32)
    .default('7f9c2e81b4a06d53e19f8a7c4b2d0e6f1a3c5e7b9d2f4a6c8e0b1d3f5a7c9e1b'),
  VAULT_MASTER_KEY: z
    .string()
    .regex(/^[0-9a-fA-F]{64}$/, 'VAULT_MASTER_KEY must be a 64-character hex string (256-bit key)')
    .default('9a8b7c6d5e4f3a2b1c0d9e8f7a6b5c4d3e2f1a0b9c8d7e6f5a4b3c2d1e0f9a8b'),
  SQLITE_DATA_PATH: z.string().default('./data/roblox_engine.db'),
  CORS_ORIGIN: z.string().default('http://localhost:5173'),
});

export type AppEnv = z.infer<typeof envSchema>;

export const env: AppEnv = envSchema.parse({
  NODE_ENV: process.env.NODE_ENV,
  PORT: process.env.PORT,
  DATABASE_URL: process.env.DATABASE_URL,
  REDIS_URL: process.env.REDIS_URL,
  SESSION_SECRET: process.env.SESSION_SECRET,
  VAULT_MASTER_KEY: process.env.VAULT_MASTER_KEY,
  SQLITE_DATA_PATH: process.env.SQLITE_DATA_PATH,
  CORS_ORIGIN: process.env.CORS_ORIGIN,
});

const SENSITIVE_KEYS = [
  'password',
  'passwordHash',
  'password_hash',
  'secret',
  'token',
  'cookie',
  'roblosecurity',
  'ciphertext',
  'ciphertextHex',
  'ciphertext_hex',
  'VAULT_MASTER_KEY',
  'SESSION_SECRET',
  'authorization',
];

export function redactSecrets<T>(input: T): T {
  if (input === null || input === undefined) return input;
  if (typeof input === 'string') {
    return input
      .replace(/Bearer\s+[A-Za-z0-9\-._~+/]+=*/gi, 'Bearer [REDACTED]')
      .replace(/_\|WARNING:-DO-NOT-SHARE-THIS[^\s"']*/gi, '[REDACTED_ROBLOX_COOKIE]') as unknown as T;
  }
  if (Array.isArray(input)) {
    return input.map((item) => redactSecrets(item)) as unknown as T;
  }
  if (typeof input === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
      if (SENSITIVE_KEYS.some((sk) => k.toLowerCase().includes(sk.toLowerCase()))) {
        out[k] = '[REDACTED]';
      } else {
        out[k] = redactSecrets(v);
      }
    }
    return out as T;
  }
  return input;
}

export function getVaultKeyBuffer(): Buffer {
  return Buffer.from(env.VAULT_MASTER_KEY, 'hex');
}

export function generateCsrfToken(sessionId: string): string {
  return crypto.createHmac('sha256', env.SESSION_SECRET).update(`csrf:${sessionId}`).digest('hex');
}
