import type { ApiError, ApiResponse, PaginatedResponse, PaginationMeta } from '@dhamen/shared';
import type { Context } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';

/**
 * Create a success response
 */
export function success<T>(c: Context, data: T, status: ContentfulStatusCode = 200): Response {
  const response: ApiResponse<T> = { success: true, data };
  return c.json(response, status);
}

/**
 * Create a paginated success response
 */
export function paginated<T>(
  c: Context,
  data: T[],
  meta: Omit<PaginationMeta, 'totalPages'> & { totalPages?: number },
  status: ContentfulStatusCode = 200
): Response {
  const totalPages = meta.totalPages ?? Math.ceil(meta.total / meta.limit);
  const response: PaginatedResponse<T> = {
    success: true,
    data,
    meta: {
      ...meta,
      totalPages,
    },
  };
  return c.json(response, status);
}

/**
 * Create an error response
 */
export function error(
  c: Context,
  code: string,
  message: string,
  status: ContentfulStatusCode = 400,
  details?: unknown
): Response {
  const apiError: ApiError = { code, message };
  if (details) {
    apiError.details = details;
  }
  return c.json({ success: false, error: apiError }, status);
}

/**
 * Create a 201 Created response
 */
export function created<T>(c: Context, data: T): Response {
  return success(c, data, 201);
}

/**
 * Create a 204 No Content response
 */
export function noContent(c: Context): Response {
  return c.body(null, 204);
}

/**
 * Create a 401 Unauthorized response
 */
export function unauthorized(c: Context, message = 'Authentification requise'): Response {
  return error(c, 'UNAUTHORIZED', message, 401);
}

/**
 * Create a 403 Forbidden response
 */
export function forbidden(c: Context, message = 'Accès non autorisé'): Response {
  return error(c, 'FORBIDDEN', message, 403);
}

/**
 * Create a 404 Not Found response
 */
export function notFound(c: Context, message = 'Ressource non trouvée'): Response {
  return error(c, 'NOT_FOUND', message, 404);
}

/**
 * Create a 409 Conflict response
 */
export function conflict(c: Context, message = 'Conflit avec une ressource existante'): Response {
  return error(c, 'CONFLICT', message, 409);
}

/**
 * Create a 400 Bad Request response
 */
export function badRequest(c: Context, message = 'Requête invalide'): Response {
  return error(c, 'BAD_REQUEST', message, 400);
}

/**
 * Create a 422 Validation Error response
 */
export function validationError(c: Context, details: unknown): Response {
  return error(c, 'VALIDATION_ERROR', 'Erreur de validation', 422, details);
}

/**
 * Create a 500 Internal Server Error response
 */
export function internalError(c: Context, message = 'Erreur interne du serveur'): Response {
  return error(c, 'INTERNAL_ERROR', message, 500);
}

/**
 * Create a 429 Rate Limit Exceeded response
 */
export function rateLimitExceeded(c: Context): Response {
  return error(c, 'RATE_LIMIT_EXCEEDED', 'Trop de requêtes, veuillez réessayer plus tard', 429);
}

/**
 * Simple success data wrapper (for use with c.json())
 * @deprecated Use success(c, data) instead
 */
export function successData<T>(data: T): ApiResponse<T> {
  return { success: true, data };
}

/**
 * Simple error data wrapper (for use with c.json())
 * @deprecated Use error(c, code, message, status) instead
 */
export function errorData(code: string, message: string, details?: unknown): { success: false; error: ApiError } {
  const apiError: ApiError = { code, message };
  if (details) {
    apiError.details = details;
  }
  return { success: false, error: apiError };
}
