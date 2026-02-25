import type { Role } from '@dhamen/shared';
import type { MiddlewareHandler } from 'hono';
import { getAccessTokenFromCookie } from '../lib/cookies';
import { verifyJWT } from '../lib/jwt';
import { error, forbidden, unauthorized } from '../lib/response';
import type { Bindings, Variables } from '../types';

/**
 * JWT authentication middleware
 * Supports both Bearer token in Authorization header and HttpOnly cookie
 */
export function authMiddleware(options?: {
  optional?: boolean;
}): MiddlewareHandler<{ Bindings: Bindings; Variables: Variables }> {
  return async (c, next) => {
    // Try Authorization header first (for API clients)
    const authHeader = c.req.header('Authorization');
    let token: string | undefined;

    if (authHeader?.startsWith('Bearer ')) {
      token = authHeader.slice(7);
    } else {
      // Fall back to HttpOnly cookie (for web clients)
      token = getAccessTokenFromCookie(c);
    }

    if (!token) {
      if (options?.optional) {
        return next();
      }
      return unauthorized(c);
    }

    const jwtSecret = c.env.JWT_SECRET;

    if (!jwtSecret) {
      return error(c, 'INTERNAL_ERROR', 'JWT secret not configured', 500);
    }

    const payload = await verifyJWT(token, jwtSecret);

    if (!payload) {
      return unauthorized(c, 'Token invalide ou expire');
    }

    // Reject tokens with limited purpose (MFA tokens shouldn't work as auth)
    if (payload.purpose) {
      return unauthorized(c, 'Token a usage limite');
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
