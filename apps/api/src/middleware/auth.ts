import type { MiddlewareHandler } from 'hono';
import type { Role } from '@dhamen/shared';
import type { Bindings, Variables } from '../types';
import { verifyJWT } from '../lib/jwt';
import { error, forbidden, unauthorized } from '../lib/response';

/**
 * JWT authentication middleware
 */
export function authMiddleware(options?: {
  optional?: boolean;
}): MiddlewareHandler<{ Bindings: Bindings; Variables: Variables }> {
  return async (c, next) => {
    const authHeader = c.req.header('Authorization');

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      if (options?.optional) {
        return next();
      }
      return unauthorized(c);
    }

    const token = authHeader.slice(7);
    const jwtSecret = c.env.JWT_SECRET;

    if (!jwtSecret) {
      return error(c, 'INTERNAL_ERROR', 'JWT secret not configured', 500);
    }

    const payload = await verifyJWT(token, jwtSecret);

    if (!payload) {
      return unauthorized(c, 'Token invalide ou expiré');
    }

    c.set('user', payload);
    return next();
  };
}

/**
 * Role-based access control middleware
 */
export function requireRole(
  ...roles: Role[]
): MiddlewareHandler<{ Bindings: Bindings; Variables: Variables }> {
  return async (c, next) => {
    const user = c.get('user');

    if (!user) {
      return unauthorized(c);
    }

    if (!roles.includes(user.role)) {
      return forbidden(c, `Rôle requis: ${roles.join(' ou ')}`);
    }

    return next();
  };
}

/**
 * Require authentication (shorthand for authMiddleware + user check)
 */
export const requireAuth: MiddlewareHandler<{ Bindings: Bindings; Variables: Variables }> = async (
  c,
  next
) => {
  const user = c.get('user');
  if (!user) {
    return unauthorized(c);
  }
  return next();
};
