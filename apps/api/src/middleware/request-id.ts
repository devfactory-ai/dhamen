import type { MiddlewareHandler } from 'hono';
import type { Bindings, Variables } from '../types';
import { generateId } from '../lib/ulid';

/**
 * Request ID middleware
 * Generates or uses existing request ID for tracing
 */
export const requestIdMiddleware: MiddlewareHandler<{
  Bindings: Bindings;
  Variables: Variables;
}> = async (c, next) => {
  const requestId = c.req.header('X-Request-ID') || generateId();
  c.set('requestId', requestId);
  c.header('X-Request-ID', requestId);
  await next();
};
