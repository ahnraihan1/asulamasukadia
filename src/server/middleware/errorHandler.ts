import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { redactSecrets } from '../config/env.js';

export class ApiError extends Error {
  public statusCode: number;
  public code: string;
  public details?: unknown;

  constructor(statusCode: number, code: string, message: string, details?: unknown) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  if (err instanceof ZodError) {
    res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid request parameters',
        details: err.issues.map((i) => ({
          path: i.path.join('.'),
          message: i.message,
        })),
      },
    });
    return;
  }

  if (err instanceof ApiError) {
    res.status(err.statusCode).json({
      success: false,
      error: {
        code: err.code,
        message: redactSecrets(err.message),
        details: err.details ? redactSecrets(err.details) : undefined,
      },
    });
    return;
  }

  const rawMessage = err instanceof Error ? err.message : 'Internal server error';
  const safeMessage = redactSecrets(rawMessage);

  const isNotFound = /not found/i.test(safeMessage);
  const isConflict = /already exists|duplicate|already been/i.test(safeMessage);
  const isBadRequest = /invalid|cannot|must be|exhausted/i.test(safeMessage);

  const statusCode = isNotFound ? 404 : isConflict ? 409 : isBadRequest ? 400 : 500;
  const code = isNotFound
    ? 'NOT_FOUND'
    : isConflict
      ? 'CONFLICT'
      : isBadRequest
        ? 'BAD_REQUEST'
        : 'INTERNAL_ERROR';

  res.status(statusCode).json({
    success: false,
    error: {
      code,
      message: safeMessage,
    },
  });
}
