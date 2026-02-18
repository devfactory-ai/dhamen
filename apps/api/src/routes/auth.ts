import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { loginRequestSchema, refreshRequestSchema } from '@dhamen/shared';
import { findUserByEmail, userToPublic, updateUser } from '@dhamen/db';
import type { Bindings, Variables } from '../types';
import { signJWT, signRefreshToken, verifyRefreshToken } from '../lib/jwt';
import { verifyPassword } from '../lib/password';
import { success, error, unauthorized } from '../lib/response';
import { authMiddleware } from '../middleware/auth';
import { logAudit } from '../middleware/audit-trail';

const auth = new Hono<{ Bindings: Bindings; Variables: Variables }>();

/**
 * POST /api/v1/auth/login
 * Authenticate user and return tokens
 */
auth.post('/login', zValidator('json', loginRequestSchema), async (c) => {
  const { email, password } = c.req.valid('json');

  const user = await findUserByEmail(c.env.DB, email);

  if (!user) {
    return error(c, 'INVALID_CREDENTIALS', 'Email ou mot de passe incorrect', 401);
  }

  if (!user.isActive) {
    return error(c, 'ACCOUNT_DISABLED', 'Compte désactivé', 401);
  }

  const isValidPassword = await verifyPassword(password, user.passwordHash);

  if (!isValidPassword) {
    return error(c, 'INVALID_CREDENTIALS', 'Email ou mot de passe incorrect', 401);
  }

  // Check if MFA is required
  if (user.mfaEnabled) {
    // Generate MFA token (simplified - in production, use a proper OTP flow)
    const mfaToken = await signJWT(
      { sub: user.id, role: user.role },
      c.env.JWT_SECRET,
      300 // 5 minutes
    );

    return success(c, {
      requiresMfa: true,
      mfaToken,
    });
  }

  // Generate tokens
  const jwtExpiresIn = parseInt(c.env.JWT_EXPIRES_IN, 10) || 900;
  const refreshExpiresIn = parseInt(c.env.REFRESH_EXPIRES_IN, 10) || 86400;

  const accessToken = await signJWT(
    {
      sub: user.id,
      role: user.role,
      providerId: user.providerId ?? undefined,
      insurerId: user.insurerId ?? undefined,
    },
    c.env.JWT_SECRET,
    jwtExpiresIn
  );

  const refreshToken = await signRefreshToken(user.id, c.env.JWT_SECRET, refreshExpiresIn);

  // Store refresh token in KV
  await c.env.CACHE.put(`refresh:${user.id}`, refreshToken, {
    expirationTtl: refreshExpiresIn,
  });

  // Update last login
  await updateUser(c.env.DB, user.id, { lastLoginAt: new Date().toISOString() });

  // Audit log
  await logAudit(c.env.DB, {
    userId: user.id,
    action: 'auth.login',
    entityType: 'user',
    entityId: user.id,
    ipAddress: c.req.header('CF-Connecting-IP'),
    userAgent: c.req.header('User-Agent'),
  });

  return success(c, {
    requiresMfa: false,
    tokens: {
      accessToken,
      refreshToken,
      expiresIn: jwtExpiresIn,
    },
    user: userToPublic(user),
  });
});

/**
 * POST /api/v1/auth/refresh
 * Refresh access token using refresh token
 */
auth.post('/refresh', zValidator('json', refreshRequestSchema), async (c) => {
  const { refreshToken } = c.req.valid('json');

  const payload = await verifyRefreshToken(refreshToken, c.env.JWT_SECRET);

  if (!payload) {
    return unauthorized(c, 'Refresh token invalide ou expiré');
  }

  // Verify token is still valid in KV
  const storedToken = await c.env.CACHE.get(`refresh:${payload.sub}`);
  if (storedToken !== refreshToken) {
    return unauthorized(c, 'Refresh token révoqué');
  }

  const user = await findUserByEmail(c.env.DB, payload.sub);
  if (!user) {
    // Try finding by ID if not found by email (payload.sub is user ID)
    const { findUserById } = await import('@dhamen/db');
    const userById = await findUserById(c.env.DB, payload.sub);
    if (!userById || !userById.isActive) {
      return unauthorized(c, 'Utilisateur non trouvé ou désactivé');
    }

    // Generate new tokens
    const jwtExpiresIn = parseInt(c.env.JWT_EXPIRES_IN, 10) || 900;
    const refreshExpiresIn = parseInt(c.env.REFRESH_EXPIRES_IN, 10) || 86400;

    const newAccessToken = await signJWT(
      {
        sub: userById.id,
        role: userById.role,
        providerId: userById.providerId ?? undefined,
        insurerId: userById.insurerId ?? undefined,
      },
      c.env.JWT_SECRET,
      jwtExpiresIn
    );

    const newRefreshToken = await signRefreshToken(userById.id, c.env.JWT_SECRET, refreshExpiresIn);

    // Update stored refresh token
    await c.env.CACHE.put(`refresh:${userById.id}`, newRefreshToken, {
      expirationTtl: refreshExpiresIn,
    });

    return success(c, {
      tokens: {
        accessToken: newAccessToken,
        refreshToken: newRefreshToken,
        expiresIn: jwtExpiresIn,
      },
    });
  }

  // Generate new tokens
  const jwtExpiresIn = parseInt(c.env.JWT_EXPIRES_IN, 10) || 900;
  const refreshExpiresIn = parseInt(c.env.REFRESH_EXPIRES_IN, 10) || 86400;

  const newAccessToken = await signJWT(
    {
      sub: user.id,
      role: user.role,
      providerId: user.providerId ?? undefined,
      insurerId: user.insurerId ?? undefined,
    },
    c.env.JWT_SECRET,
    jwtExpiresIn
  );

  const newRefreshToken = await signRefreshToken(user.id, c.env.JWT_SECRET, refreshExpiresIn);

  // Update stored refresh token
  await c.env.CACHE.put(`refresh:${user.id}`, newRefreshToken, {
    expirationTtl: refreshExpiresIn,
  });

  return success(c, {
    tokens: {
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
      expiresIn: jwtExpiresIn,
    },
  });
});

/**
 * POST /api/v1/auth/logout
 * Logout user and revoke refresh token
 */
auth.post('/logout', authMiddleware(), async (c) => {
  const user = c.get('user');

  if (user) {
    // Delete refresh token from KV
    await c.env.CACHE.delete(`refresh:${user.sub}`);

    // Audit log
    await logAudit(c.env.DB, {
      userId: user.sub,
      action: 'auth.logout',
      entityType: 'user',
      entityId: user.sub,
      ipAddress: c.req.header('CF-Connecting-IP'),
      userAgent: c.req.header('User-Agent'),
    });
  }

  return success(c, { message: 'Déconnexion réussie' });
});

/**
 * GET /api/v1/auth/me
 * Get current user profile
 */
auth.get('/me', authMiddleware(), async (c) => {
  const jwtPayload = c.get('user');

  if (!jwtPayload) {
    return unauthorized(c);
  }

  const { findUserById } = await import('@dhamen/db');
  const user = await findUserById(c.env.DB, jwtPayload.sub);

  if (!user) {
    return unauthorized(c, 'Utilisateur non trouvé');
  }

  return success(c, userToPublic(user));
});

export { auth };
