import { findUserByEmail, findUserById, updateUser, userToPublic } from '@dhamen/db';
import { loginRequestSchema, mfaVerifyRequestSchema, } from '@dhamen/shared';
import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import { z } from 'zod';
import {
  setAccessTokenCookie,
  setRefreshTokenCookie,
  clearAuthCookies,
  getRefreshTokenFromCookie,
} from '../lib/cookies';
import { signJWT, signRefreshToken, verifyRefreshToken, verifyJWT } from '../lib/jwt';
import { verifyPassword } from '../lib/password';
import { error, success, unauthorized, validationError } from '../lib/response';
import {
  generateTOTPSecret,
  generateTOTPUri,
  verifyTOTP,
  generateBackupCodes,
  hashBackupCode,
  verifyBackupCode,
  roleRequiresMFA,
} from '../lib/totp';
import { logAudit } from '../middleware/audit-trail';
import { authMiddleware } from '../middleware/auth';
import type { Bindings, Variables } from '../types';
import { getDb } from '../lib/db';

// Custom validation hook to handle errors gracefully
const validationHook = (result: { success: boolean; data?: unknown; error?: z.ZodError }, c: any): Response | undefined => {
  if (!result.success && result.error) {
    const errors = result.error.errors.map((e) => ({
      path: e.path.join('.'),
      message: e.message,
    }));
    return validationError(c, errors);
  }
  return undefined;
};

/** Helper to check if running in production */
function isProduction(c: { env: Bindings }): boolean {
  return c.env.ENVIRONMENT === 'production';
}

// Schema for MFA setup
const mfaSetupSchema = z.object({
  otpCode: z.string().length(6, 'Code OTP doit contenir 6 chiffres'),
});

// Schema for backup code verification
const backupCodeSchema = z.object({
  mfaToken: z.string().min(1, 'Token MFA requis'),
  backupCode: z.string().min(8, 'Code de secours requis'),
});

const auth = new Hono<{ Bindings: Bindings; Variables: Variables }>();

/**
 * POST /api/v1/auth/login
 * Authenticate user and return tokens
 */
auth.post('/login', zValidator('json', loginRequestSchema, validationHook), async (c) => {
  const { email, password } = c.req.valid('json');

  const user = await findUserByEmail(getDb(c), email);

  if (!user) {
    return error(c, 'INVALID_CREDENTIALS', 'Email ou mot de passe incorrect', 401);
  }

  if (!user.isActive) {
    return error(c, 'ACCOUNT_DISABLED', 'Compte desactive', 401);
  }

  const isValidPassword = await verifyPassword(password, user.passwordHash);

  if (!isValidPassword) {
    return error(c, 'INVALID_CREDENTIALS', 'Email ou mot de passe incorrect', 401);
  }

  // Check if MFA is required for this role but not yet enabled
  const mfaRequired = roleRequiresMFA(user.role);
  if (mfaRequired && !user.mfaEnabled) {
    // User needs to set up MFA first
    const mfaSetupToken = await signJWT(
      { id: user.id, sub: user.id, email: user.email, role: user.role, purpose: 'mfa_setup' },
      c.env.JWT_SECRET,
      600 // 10 minutes
    );

    return success(c, {
      requiresMfaSetup: true,
      mfaSetupToken,
      message: 'Configuration MFA requise pour ce compte',
    });
  }

  // Check if MFA verification is needed
  if (user.mfaEnabled && user.mfaSecret) {
    // Generate MFA verification token
    const mfaToken = await signJWT(
      { id: user.id, sub: user.id, email: user.email, role: user.role, purpose: 'mfa_verify' },
      c.env.JWT_SECRET,
      300 // 5 minutes
    );

    return success(c, {
      requiresMfa: true,
      mfaToken,
    });
  }

  // Generate tokens for users without MFA requirement
  const jwtExpiresIn = Number.parseInt(c.env.JWT_EXPIRES_IN, 10) || 900;
  const refreshExpiresIn = Number.parseInt(c.env.REFRESH_EXPIRES_IN, 10) || 86400;

  const accessToken = await signJWT(
    {
      id: user.id,
      sub: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
      providerId: user.providerId ?? undefined,
      insurerId: user.insurerId ?? undefined,
      companyId: user.companyId ?? undefined,
    },
    c.env.JWT_SECRET,
    jwtExpiresIn
  );

  const refreshToken = await signRefreshToken(user.id, c.env.JWT_SECRET, refreshExpiresIn);

  // Store refresh token in KV
  await c.env.CACHE.put(`refresh:${user.id}`, refreshToken, {
    expirationTtl: refreshExpiresIn,
  });

  // Set HttpOnly cookies for secure token storage
  const isProd = isProduction(c);
  setAccessTokenCookie(c, accessToken, jwtExpiresIn, isProd);
  setRefreshTokenCookie(c, refreshToken, refreshExpiresIn, isProd);

  // Update last login
  await updateUser(getDb(c), user.id, { lastLoginAt: new Date().toISOString() });

  // Audit log
  await logAudit(getDb(c), {
    userId: user.id,
    action: 'auth.login',
    entityType: 'user',
    entityId: user.id,
    ipAddress: c.req.header('CF-Connecting-IP'),
    userAgent: c.req.header('User-Agent'),
  });

  return success(c, {
    requiresMfa: false,
    expiresIn: jwtExpiresIn,
    user: userToPublic(user),
    // Also return tokens in body for localStorage fallback (cross-origin cookie issues)
    tokens: {
      accessToken,
      refreshToken,
    },
  });
});

/**
 * POST /api/v1/auth/mfa/setup
 * Initialize MFA setup - generates secret and QR code URI
 */
auth.post('/mfa/setup', authMiddleware(), async (c) => {
  const jwtPayload = c.get('user');

  if (!jwtPayload) {
    return unauthorized(c);
  }

  const user = await findUserById(getDb(c), jwtPayload.sub);
  if (!user) {
    return unauthorized(c, 'Utilisateur non trouve');
  }

  if (user.mfaEnabled) {
    return error(c, 'MFA_ALREADY_ENABLED', 'MFA deja active sur ce compte', 400);
  }

  // Generate new TOTP secret
  const secret = generateTOTPSecret();
  const uri = generateTOTPUri(secret, user.email);

  // Store secret temporarily (not enabled until verified)
  await c.env.CACHE.put(`mfa_setup:${user.id}`, secret, {
    expirationTtl: 600, // 10 minutes
  });

  // Audit log
  await logAudit(getDb(c), {
    userId: user.id,
    action: 'auth.mfa_setup_initiated',
    entityType: 'user',
    entityId: user.id,
    ipAddress: c.req.header('CF-Connecting-IP'),
    userAgent: c.req.header('User-Agent'),
  });

  return success(c, {
    secret,
    uri,
    message: 'Scannez le QR code avec votre application d\'authentification',
  });
});

/**
 * POST /api/v1/auth/mfa/setup/verify
 * Verify MFA setup with OTP code - enables MFA on account
 */
auth.post('/mfa/setup/verify', authMiddleware(), zValidator('json', mfaSetupSchema), async (c) => {
  const jwtPayload = c.get('user');
  const { otpCode } = c.req.valid('json');

  if (!jwtPayload) {
    return unauthorized(c);
  }

  const user = await findUserById(getDb(c), jwtPayload.sub);
  if (!user) {
    return unauthorized(c, 'Utilisateur non trouve');
  }

  // Get temporary secret from cache
  const secret = await c.env.CACHE.get(`mfa_setup:${user.id}`);
  if (!secret) {
    return error(c, 'MFA_SETUP_EXPIRED', 'Session de configuration MFA expiree', 400);
  }

  // Verify the OTP code
  const isValid = await verifyTOTP(otpCode, secret);
  if (!isValid) {
    return error(c, 'INVALID_OTP', 'Code OTP invalide', 400);
  }

  // Generate backup codes
  const backupCodes = generateBackupCodes(10);
  const hashedCodes = await Promise.all(backupCodes.map(hashBackupCode));

  // Enable MFA and store secret + backup codes
  await updateUser(getDb(c), user.id, {
    mfaEnabled: true,
    mfaSecret: secret,
  });

  // Store hashed backup codes in KV
  await c.env.CACHE.put(`mfa_backup:${user.id}`, JSON.stringify(hashedCodes), {
    // No expiration - backup codes are permanent until used
  });

  // Clean up setup secret
  await c.env.CACHE.delete(`mfa_setup:${user.id}`);

  // Audit log
  await logAudit(getDb(c), {
    userId: user.id,
    action: 'auth.mfa_enabled',
    entityType: 'user',
    entityId: user.id,
    ipAddress: c.req.header('CF-Connecting-IP'),
    userAgent: c.req.header('User-Agent'),
  });

  return success(c, {
    enabled: true,
    backupCodes, // Show these once, user must save them
    message: 'MFA active. Conservez vos codes de secours en lieu sur.',
  });
});

/**
 * POST /api/v1/auth/mfa/verify
 * Verify MFA code during login
 */
auth.post('/mfa/verify', zValidator('json', mfaVerifyRequestSchema), async (c) => {
  const { mfaToken, otpCode } = c.req.valid('json');

  // Verify MFA token
  const payload = await verifyJWT(mfaToken, c.env.JWT_SECRET);
  if (!payload || payload.purpose !== 'mfa_verify') {
    return unauthorized(c, 'Token MFA invalide ou expire');
  }

  const user = await findUserById(getDb(c), payload.sub);
  if (!(user?.mfaSecret)) {
    return unauthorized(c, 'Utilisateur non trouve');
  }

  // Verify OTP code
  const isValid = await verifyTOTP(otpCode, user.mfaSecret);
  if (!isValid) {
    // Audit failed attempt
    await logAudit(getDb(c), {
      userId: user.id,
      action: 'auth.mfa_failed',
      entityType: 'user',
      entityId: user.id,
      changes: { reason: 'invalid_otp' },
      ipAddress: c.req.header('CF-Connecting-IP'),
      userAgent: c.req.header('User-Agent'),
    });

    return error(c, 'INVALID_OTP', 'Code OTP invalide', 401);
  }

  // Generate final tokens
  const jwtExpiresIn = Number.parseInt(c.env.JWT_EXPIRES_IN, 10) || 900;
  const refreshExpiresIn = Number.parseInt(c.env.REFRESH_EXPIRES_IN, 10) || 86400;

  const accessToken = await signJWT(
    {
      id: user.id,
      sub: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
      providerId: user.providerId ?? undefined,
      insurerId: user.insurerId ?? undefined,
      companyId: user.companyId ?? undefined,
    },
    c.env.JWT_SECRET,
    jwtExpiresIn
  );

  const refreshToken = await signRefreshToken(user.id, c.env.JWT_SECRET, refreshExpiresIn);

  // Store refresh token in KV
  await c.env.CACHE.put(`refresh:${user.id}`, refreshToken, {
    expirationTtl: refreshExpiresIn,
  });

  // Set HttpOnly cookies
  const isProd = isProduction(c);
  setAccessTokenCookie(c, accessToken, jwtExpiresIn, isProd);
  setRefreshTokenCookie(c, refreshToken, refreshExpiresIn, isProd);

  // Update last login
  await updateUser(getDb(c), user.id, { lastLoginAt: new Date().toISOString() });

  // Audit log
  await logAudit(getDb(c), {
    userId: user.id,
    action: 'auth.login_mfa_verified',
    entityType: 'user',
    entityId: user.id,
    ipAddress: c.req.header('CF-Connecting-IP'),
    userAgent: c.req.header('User-Agent'),
  });

  return success(c, {
    expiresIn: jwtExpiresIn,
    user: userToPublic(user),
    // Also return tokens in body for localStorage fallback
    tokens: {
      accessToken,
      refreshToken,
    },
  });
});

/**
 * POST /api/v1/auth/mfa/backup
 * Verify backup code for account recovery
 */
auth.post('/mfa/backup', zValidator('json', backupCodeSchema), async (c) => {
  const { mfaToken, backupCode } = c.req.valid('json');

  // Verify MFA token
  const payload = await verifyJWT(mfaToken, c.env.JWT_SECRET);
  if (!payload || payload.purpose !== 'mfa_verify') {
    return unauthorized(c, 'Token MFA invalide ou expire');
  }

  const user = await findUserById(getDb(c), payload.sub);
  if (!user) {
    return unauthorized(c, 'Utilisateur non trouve');
  }

  // Get backup codes
  const storedCodes = await c.env.CACHE.get(`mfa_backup:${user.id}`);
  if (!storedCodes) {
    return error(c, 'NO_BACKUP_CODES', 'Aucun code de secours disponible', 400);
  }

  const hashedCodes: string[] = JSON.parse(storedCodes);
  const matchIndex = await verifyBackupCode(backupCode, hashedCodes);

  if (matchIndex === -1) {
    // Audit failed attempt
    await logAudit(getDb(c), {
      userId: user.id,
      action: 'auth.backup_code_failed',
      entityType: 'user',
      entityId: user.id,
      ipAddress: c.req.header('CF-Connecting-IP'),
      userAgent: c.req.header('User-Agent'),
    });

    return error(c, 'INVALID_BACKUP_CODE', 'Code de secours invalide', 401);
  }

  // Remove used backup code
  hashedCodes.splice(matchIndex, 1);
  await c.env.CACHE.put(`mfa_backup:${user.id}`, JSON.stringify(hashedCodes));

  // Generate final tokens
  const jwtExpiresIn = Number.parseInt(c.env.JWT_EXPIRES_IN, 10) || 900;
  const refreshExpiresIn = Number.parseInt(c.env.REFRESH_EXPIRES_IN, 10) || 86400;

  const accessToken = await signJWT(
    {
      id: user.id,
      sub: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
      providerId: user.providerId ?? undefined,
      insurerId: user.insurerId ?? undefined,
      companyId: user.companyId ?? undefined,
    },
    c.env.JWT_SECRET,
    jwtExpiresIn
  );

  const refreshToken = await signRefreshToken(user.id, c.env.JWT_SECRET, refreshExpiresIn);

  await c.env.CACHE.put(`refresh:${user.id}`, refreshToken, {
    expirationTtl: refreshExpiresIn,
  });

  // Set HttpOnly cookies
  const isProd = isProduction(c);
  setAccessTokenCookie(c, accessToken, jwtExpiresIn, isProd);
  setRefreshTokenCookie(c, refreshToken, refreshExpiresIn, isProd);

  await updateUser(getDb(c), user.id, { lastLoginAt: new Date().toISOString() });

  // Audit log
  await logAudit(getDb(c), {
    userId: user.id,
    action: 'auth.login_backup_code_used',
    entityType: 'user',
    entityId: user.id,
    changes: { remainingCodes: hashedCodes.length },
    ipAddress: c.req.header('CF-Connecting-IP'),
    userAgent: c.req.header('User-Agent'),
  });

  return success(c, {
    expiresIn: jwtExpiresIn,
    user: userToPublic(user),
    remainingBackupCodes: hashedCodes.length,
    warning: hashedCodes.length < 3 ? 'Attention: peu de codes de secours restants' : undefined,
    // Also return tokens in body for localStorage fallback
    tokens: {
      accessToken,
      refreshToken,
    },
  });
});

/**
 * POST /api/v1/auth/mfa/disable
 * Disable MFA on account (requires current OTP)
 */
auth.post('/mfa/disable', authMiddleware(), zValidator('json', mfaSetupSchema), async (c) => {
  const jwtPayload = c.get('user');
  const { otpCode } = c.req.valid('json');

  if (!jwtPayload) {
    return unauthorized(c);
  }

  const user = await findUserById(getDb(c), jwtPayload.sub);
  if (!(user?.mfaSecret)) {
    return error(c, 'MFA_NOT_ENABLED', 'MFA non active sur ce compte', 400);
  }

  // Verify OTP before disabling
  const isValid = await verifyTOTP(otpCode, user.mfaSecret);
  if (!isValid) {
    return error(c, 'INVALID_OTP', 'Code OTP invalide', 401);
  }

  // Check if MFA is required for this role
  if (roleRequiresMFA(user.role)) {
    return error(c, 'MFA_REQUIRED', 'MFA est obligatoire pour votre role', 403);
  }

  // Disable MFA
  await updateUser(getDb(c), user.id, {
    mfaEnabled: false,
    mfaSecret: undefined,
  });

  // Remove backup codes
  await c.env.CACHE.delete(`mfa_backup:${user.id}`);

  // Audit log
  await logAudit(getDb(c), {
    userId: user.id,
    action: 'auth.mfa_disabled',
    entityType: 'user',
    entityId: user.id,
    ipAddress: c.req.header('CF-Connecting-IP'),
    userAgent: c.req.header('User-Agent'),
  });

  return success(c, {
    disabled: true,
    message: 'MFA desactive',
  });
});

/**
 * GET /api/v1/auth/mfa/status
 * Get MFA status for current user
 */
auth.get('/mfa/status', authMiddleware(), async (c) => {
  const jwtPayload = c.get('user');

  if (!jwtPayload) {
    return unauthorized(c);
  }

  const user = await findUserById(getDb(c), jwtPayload.sub);
  if (!user) {
    return unauthorized(c, 'Utilisateur non trouvé');
  }

  // Get backup codes count
  let backupCodesCount = 0;
  const storedCodes = await c.env.CACHE.get(`mfa_backup:${user.id}`);
  if (storedCodes) {
    const hashedCodes: string[] = JSON.parse(storedCodes);
    backupCodesCount = hashedCodes.length;
  }

  return success(c, {
    mfaEnabled: user.mfaEnabled,
    mfaRequired: roleRequiresMFA(user.role),
    backupCodesRemaining: user.mfaEnabled ? backupCodesCount : 0,
  });
});

/**
 * POST /api/v1/auth/mfa/backup/regenerate
 * Regenerate backup codes (requires current OTP)
 */
auth.post('/mfa/backup/regenerate', authMiddleware(), zValidator('json', mfaSetupSchema), async (c) => {
  const jwtPayload = c.get('user');
  const { otpCode } = c.req.valid('json');

  if (!jwtPayload) {
    return unauthorized(c);
  }

  const user = await findUserById(getDb(c), jwtPayload.sub);
  if (!(user?.mfaSecret)) {
    return error(c, 'MFA_NOT_ENABLED', 'MFA non activé sur ce compte', 400);
  }

  // Verify OTP before regenerating
  const isValid = await verifyTOTP(otpCode, user.mfaSecret);
  if (!isValid) {
    return error(c, 'INVALID_OTP', 'Code OTP invalide', 401);
  }

  // Generate new backup codes
  const backupCodes = generateBackupCodes(10);
  const hashedCodes = await Promise.all(backupCodes.map(hashBackupCode));

  // Store new hashed backup codes
  await c.env.CACHE.put(`mfa_backup:${user.id}`, JSON.stringify(hashedCodes));

  // Audit log
  await logAudit(getDb(c), {
    userId: user.id,
    action: 'auth.backup_codes_regenerated',
    entityType: 'user',
    entityId: user.id,
    ipAddress: c.req.header('CF-Connecting-IP'),
    userAgent: c.req.header('User-Agent'),
  });

  return success(c, {
    backupCodes,
    message: 'Nouveaux codes de secours générés. Conservez-les en lieu sûr.',
  });
});

/**
 * POST /api/v1/auth/refresh
 * Refresh access token using refresh token from cookie or body
 */
auth.post('/refresh', async (c) => {
  // Try to get refresh token from cookie first, then from body
  let refreshToken = getRefreshTokenFromCookie(c);

  if (!refreshToken) {
    try {
      const body = await c.req.json() as { refreshToken?: string };
      refreshToken = body.refreshToken;
    } catch {
      // No body provided
    }
  }

  if (!refreshToken) {
    return unauthorized(c, 'Refresh token manquant');
  }

  const payload = await verifyRefreshToken(refreshToken, c.env.JWT_SECRET);

  if (!payload) {
    return unauthorized(c, 'Refresh token invalide ou expire');
  }

  // Verify token is still valid in KV
  const storedToken = await c.env.CACHE.get(`refresh:${payload.sub}`);
  if (storedToken !== refreshToken) {
    return unauthorized(c, 'Refresh token revoque');
  }

  // Find user by ID
  const user = await findUserById(getDb(c), payload.sub);
  if (!user?.isActive) {
    return unauthorized(c, 'Utilisateur non trouve ou desactive');
  }

  // Generate new tokens
  const jwtExpiresIn = Number.parseInt(c.env.JWT_EXPIRES_IN, 10) || 900;
  const refreshExpiresIn = Number.parseInt(c.env.REFRESH_EXPIRES_IN, 10) || 86400;

  const newAccessToken = await signJWT(
    {
      id: user.id,
      sub: user.id,
      email: user.email,
      role: user.role,
      providerId: user.providerId ?? undefined,
      insurerId: user.insurerId ?? undefined,
      companyId: user.companyId ?? undefined,
    },
    c.env.JWT_SECRET,
    jwtExpiresIn
  );

  const newRefreshToken = await signRefreshToken(user.id, c.env.JWT_SECRET, refreshExpiresIn);

  // Update stored refresh token
  await c.env.CACHE.put(`refresh:${user.id}`, newRefreshToken, {
    expirationTtl: refreshExpiresIn,
  });

  // Set HttpOnly cookies
  const isProd = isProduction(c);
  setAccessTokenCookie(c, newAccessToken, jwtExpiresIn, isProd);
  setRefreshTokenCookie(c, newRefreshToken, refreshExpiresIn, isProd);

  return success(c, {
    expiresIn: jwtExpiresIn,
    // Also return tokens in body for localStorage fallback
    tokens: {
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
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
    await logAudit(getDb(c), {
      userId: user.sub,
      action: 'auth.logout',
      entityType: 'user',
      entityId: user.sub,
      ipAddress: c.req.header('CF-Connecting-IP'),
      userAgent: c.req.header('User-Agent'),
    });
  }

  // Clear authentication cookies
  clearAuthCookies(c, isProduction(c));

  return success(c, { message: 'Deconnexion reussie' });
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
  const user = await findUserById(getDb(c), jwtPayload.sub);

  if (!user) {
    return unauthorized(c, 'Utilisateur non trouvé');
  }

  return success(c, userToPublic(user));
});

export { auth };
