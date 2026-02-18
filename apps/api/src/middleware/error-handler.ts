import type { ErrorHandler } from 'hono';
import { ZodError } from 'zod';
import type { Bindings, Variables } from '../types';
import { error, internalError, validationError } from '../lib/response';

/**
 * Global error handler middleware
 */
export const errorHandler: ErrorHandler<{ Bindings: Bindings; Variables: Variables }> = (
  err,
  c
) => {
  const requestId = c.get('requestId');

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

  // Log unexpected errors
  console.error('Unhandled error:', {
    requestId,
    error: err instanceof Error ? err.message : String(err),
    stack: err instanceof Error ? err.stack : undefined,
  });

  // Don't expose internal error details in production
  return internalError(c);
};
