import type { ErrorHandler } from 'hono';
import { ZodError } from 'zod';
import { error, internalError, validationError } from '../lib/response';
import { structuredLog } from '../lib/logger';
import type { Bindings, Variables } from '../types';

/**
 * Global error handler middleware
 * Uses structured logging instead of console.error
 */
export const errorHandler: ErrorHandler<{ Bindings: Bindings; Variables: Variables }> = (
  err,
  c
) => {
  // Zod validation errors
  if (err instanceof ZodError) {
    const errors = err.errors.map((e) => ({
      path: e.path.join('.'),
      message: e.message,
    }));
    return validationError(c, errors);
  }

  // HTTP errors from Hono
  if ('status' in err && typeof err.status === 'number') {
    const status = err.status;
    const message = err.message || 'Erreur';

    if (status === 400) {
      return error(c, 'BAD_REQUEST', message, 400);
    }
    if (status === 401) {
      return error(c, 'UNAUTHORIZED', message, 401);
    }
    if (status === 403) {
      return error(c, 'FORBIDDEN', message, 403);
    }
    if (status === 404) {
      return error(c, 'NOT_FOUND', message, 404);
    }
    if (status === 409) {
      return error(c, 'CONFLICT', message, 409);
    }
    if (status === 429) {
      return error(c, 'RATE_LIMIT_EXCEEDED', message, 429);
    }
  }

  // Log unexpected errors using structured logger
  structuredLog(c, 'error', 'Unhandled error', {
    error: err instanceof Error ? err.message : String(err),
    stack: err instanceof Error ? err.stack : undefined,
    url: c.req.url,
    method: c.req.method,
  });

  // In non-production, expose error details for debugging
  const env = c.env?.ENVIRONMENT || 'development';
  if (env !== 'production') {
    const msg = err instanceof Error ? err.message : String(err);
    return error(c, 'INTERNAL_ERROR', msg, 500);
  }
  return internalError(c);
};
