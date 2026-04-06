import { findUserByEmail, findUserById, updateUser, userToPublic } from '@dhamen/db';
import { loginRequestSchema, mfaVerifyRequestSchema, mfaEmailSendSchema, mfaEmailVerifySchema, passwordResetRequestSchema, passwordResetConfirmSchema, magicLinkSendSchema, magicLinkVerifySchema, getPermissions, RESOURCES, ACTIONS } from '@dhamen/shared';
import type { Role } from '@dhamen/shared';
import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import { z } from 'zod';
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from '@simplewebauthn/server';
import type {
  RegistrationResponseJSON,
  AuthenticationResponseJSON,
  AuthenticatorTransportFuture,
} from '@simplewebauthn/server';
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
import { logAudit, logSecurityEvent } from '../middleware/audit-trail';
import { authMiddleware } from '../middleware/auth';
import { generateId } from '../lib/ulid';
import { verifyTurnstile } from '../lib/turnstile';
import { hashPassword } from '../lib/password';
import { NotificationService } from '../services/notification.service';
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

/** Resolve company name for a user with companyId */
async function resolveCompanyName(db: ReturnType<typeof getDb>, companyId: string | null | undefined): Promise<string | null> {
  if (!companyId) return null;
  const company = await db.prepare('SELECT name FROM companies WHERE id = ?').bind(companyId).first<{ name: string }>();
  return company?.name || null;
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
 * Build resolved permissions for a user (role + individual overrides)
 */
async function buildUserPermissions(db: ReturnType<typeof getDb>, userId: string, role: string) {
  // Role permissions matrix (from static code)
  const rolePerms = getPermissions(role as Role);
  const roleMatrix: Record<string, Record<string, boolean>> = {};
  for (const resource of RESOURCES) {
    roleMatrix[resource] = {};
    for (const action of ACTIONS) {
      const resourceActions = rolePerms[resource];
      roleMatrix[resource][action] = resourceActions ? resourceActions.includes(action) : false;
    }
  }

  // Apply role-level overrides from DB (from Rôles & Permissions page)
  try {
    const { results: roleOverrides } = await db
      .prepare('SELECT resource, action, is_granted FROM role_permission_overrides WHERE role_id = ?')
      .bind(role)
      .all<{ resource: string; action: string; is_granted: number }>();
    for (const o of roleOverrides ?? []) {
      if (roleMatrix[o.resource]) {
        roleMatrix[o.resource][o.action] = o.is_granted === 1;
      }
    }
  } catch {
    // Table may not exist yet
  }

  // Individual user overrides (highest priority)
  let overrides: { resource: string; action: string; is_granted: number; expires_at: string | null }[] = [];
  try {
    const { results } = await db
      .prepare(
        `SELECT resource, action, is_granted, expires_at FROM user_permissions
         WHERE user_id = ? AND (expires_at IS NULL OR expires_at > datetime('now'))`
      )
      .bind(userId)
      .all<{ resource: string; action: string; is_granted: number; expires_at: string | null }>();
    overrides = results ?? [];
  } catch {
    // Table may not exist yet
  }

  return {
    role: roleMatrix,
    overrides: overrides.map((o) => ({
      resource: o.resource,
      action: o.action,
      isGranted: o.is_granted === 1,
      expiresAt: o.expires_at,
    })),
  };
}

/**
 * POST /api/v1/auth/login
 * Authenticate user and return tokens
 */
auth.post('/login', zValidator('json', loginRequestSchema, validationHook), async (c) => {
  const { email, password, turnstileToken, persistSession } = c.req.valid('json');

  // Verify Turnstile if configured
  if (turnstileToken) {
    const ip = c.req.header('CF-Connecting-IP');
    const valid = await verifyTurnstile(turnstileToken, c.env.TURNSTILE_SECRET_KEY, ip);
    if (!valid) {
      return error(c, 'TURNSTILE_FAILED', 'Verification anti-bot echouee', 403);
    }
  }

  const user = await findUserByEmail(getDb(c), email);

  if (!user) {
    await logSecurityEvent(getDb(c), {
      action: 'login_failure',
      ipAddress: c.req.header('CF-Connecting-IP'),
      userAgent: c.req.header('User-Agent'),
      details: { email, reason: 'user_not_found' },
    });
    return error(c, 'INVALID_CREDENTIALS', 'Email ou mot de passe incorrect', 401);
  }

  if (!user.isActive) {
    await logSecurityEvent(getDb(c), {
      userId: user.id,
      action: 'login_failure',
      ipAddress: c.req.header('CF-Connecting-IP'),
      userAgent: c.req.header('User-Agent'),
      details: { email, reason: 'account_disabled' },
    });
    return error(c, 'ACCOUNT_DISABLED', 'Compte desactive', 401);
  }

  const isValidPassword = await verifyPassword(password, user.passwordHash);

  if (!isValidPassword) {
    await logSecurityEvent(getDb(c), {
      userId: user.id,
      action: 'login_failure',
      ipAddress: c.req.header('CF-Connecting-IP'),
      userAgent: c.req.header('User-Agent'),
      details: { email, reason: 'invalid_password' },
    });
    return error(c, 'INVALID_CREDENTIALS', 'Email ou mot de passe incorrect', 401);
  }

  // Check if user has MFA enabled or if role requires MFA (agents always require MFA)
  if (user.mfaEnabled || roleRequiresMFA(user.role)) {
    const mfaToken = await signJWT(
      { id: user.id, sub: user.id, email: user.email, role: user.role, purpose: 'mfa_verify' },
      c.env.JWT_SECRET,
      300 // 5 minutes
    );

    // Determine available MFA methods
    const mfaMethods: string[] = ['email'];
    if (user.mfaSecret) {
      mfaMethods.push('totp');
    }

    return success(c, {
      requiresMfa: true,
      mfaToken,
      mfaMethods,
    });
  }

  // Generate tokens for users without MFA requirement
  const jwtExpiresIn = Number.parseInt(c.env.JWT_EXPIRES_IN, 10) || 900;
  const refreshExpiresIn = persistSession ? 43200 : (Number.parseInt(c.env.REFRESH_EXPIRES_IN, 10) || 86400);

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

  // Resolve tenant code from insurerId for mobile clients
  let tenantCode: string | null = null;
  if (user.insurerId) {
    const insurer = await getDb(c).prepare(
      'SELECT code FROM insurers WHERE id = ?'
    ).bind(user.insurerId).first<{ code: string }>();
    tenantCode = insurer?.code || null;
  }

  // Resolve company name for users with a company
  const companyName = await resolveCompanyName(getDb(c), user.companyId);

  // Resolve user permissions (role + individual overrides)
  const permissions = await buildUserPermissions(getDb(c), user.id, user.role);

  // Check if user has any registered passkeys
  let hasPasskey = false;
  try {
    const pkRow = await getDb(c)
      .prepare('SELECT 1 FROM passkeys WHERE user_id = ? LIMIT 1')
      .bind(user.id)
      .first();
    hasPasskey = !!pkRow;
  } catch {
    // passkeys table may not exist yet
  }

  return success(c, {
    requiresMfa: false,
    expiresIn: jwtExpiresIn,
    user: userToPublic({ ...user, companyName }),
    tenantCode,
    permissions,
    hasPasskey,
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
    return error(c, 'MFA_SETUP_EXPIRED', 'Session de configuration MFA expirée', 400);
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
    message: 'MFA active. Conservez vos codes de secours en lieu sûr.',
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

  // Resolve user permissions
  const mfaPermissions = await buildUserPermissions(getDb(c), user.id, user.role);
  const mfaCompanyName = await resolveCompanyName(getDb(c), user.companyId);

  // Check if user has any registered passkeys
  let mfaHasPasskey = false;
  try {
    const pkRow = await getDb(c).prepare('SELECT 1 FROM passkeys WHERE user_id = ? LIMIT 1').bind(user.id).first();
    mfaHasPasskey = !!pkRow;
  } catch { /* passkeys table may not exist */ }

  return success(c, {
    expiresIn: jwtExpiresIn,
    user: userToPublic({ ...user, companyName: mfaCompanyName }),
    permissions: mfaPermissions,
    hasPasskey: mfaHasPasskey,
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

  const permissions = await buildUserPermissions(getDb(c), user.id, user.role);
  const backupCompanyName = await resolveCompanyName(getDb(c), user.companyId);

  // Check if user has any registered passkeys
  let backupHasPasskey = false;
  try {
    const pkRow = await getDb(c).prepare('SELECT 1 FROM passkeys WHERE user_id = ? LIMIT 1').bind(user.id).first();
    backupHasPasskey = !!pkRow;
  } catch { /* passkeys table may not exist */ }

  return success(c, {
    expiresIn: jwtExpiresIn,
    user: userToPublic({ ...user, companyName: backupCompanyName }),
    permissions,
    hasPasskey: backupHasPasskey,
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
 * POST /api/v1/auth/change-password
 * Change password for the authenticated user
 */
auth.post('/change-password', authMiddleware(), zValidator('json', z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8),
})), async (c) => {
  const { currentPassword, newPassword } = c.req.valid('json');
  const currentUser = c.get('user');
  const db = getDb(c);

  const user = await findUserById(db, currentUser.sub);
  if (!user) return unauthorized(c);

  const isValid = await verifyPassword(currentPassword, user.passwordHash);
  if (!isValid) {
    return error(c, 'INVALID_PASSWORD', 'Mot de passe actuel incorrect', 400);
  }

  const newHash = await hashPassword(newPassword);
  await updateUser(db, user.id, { passwordHash: newHash });

  await logAudit(db, {
    userId: user.id,
    action: 'auth.password_changed',
    entityType: 'user',
    entityId: user.id,
    ipAddress: c.req.header('CF-Connecting-IP'),
    userAgent: c.req.header('User-Agent'),
  });

  return success(c, { message: 'Mot de passe modifie avec succes' });
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

  const meCompanyName = await resolveCompanyName(getDb(c), user.companyId);
  return success(c, userToPublic({ ...user, companyName: meCompanyName }));
});

/**
 * PUT /api/v1/auth/me
 * Update current user profile (firstName, lastName, phone)
 */
auth.put('/me', authMiddleware(), zValidator('json', z.object({
  firstName: z.string().min(1).optional(),
  lastName: z.string().min(1).optional(),
  phone: z.string().optional(),
})), async (c) => {
  const currentUser = c.get('user');
  const data = c.req.valid('json');
  const db = getDb(c);

  await updateUser(db, currentUser.sub, data);

  const user = await findUserById(db, currentUser.sub);
  if (!user) return unauthorized(c);

  const meCompanyName = await resolveCompanyName(db, user.companyId);
  return success(c, { user: userToPublic({ ...user, companyName: meCompanyName }) });
});

/**
 * POST /api/v1/auth/me/avatar
 * Upload avatar image for the current user (max 2MB, JPEG/PNG/WebP)
 */
auth.post('/me/avatar', authMiddleware(), async (c) => {
  const currentUser = c.get('user');
  const db = getDb(c);

  const contentType = c.req.header('Content-Type') || '';
  if (!contentType.includes('multipart/form-data')) {
    return error(c, 'INVALID_CONTENT_TYPE', 'Content-Type doit etre multipart/form-data', 400);
  }

  const formData = await c.req.formData();
  const file = formData.get('avatar');
  if (!file || !(file instanceof File)) {
    return error(c, 'NO_FILE', 'Aucun fichier envoye', 400);
  }

  // Validate file type
  const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
  if (!allowedTypes.includes(file.type)) {
    return error(c, 'INVALID_FILE_TYPE', 'Format accepte: JPEG, PNG ou WebP', 400);
  }

  // Validate file size (2MB max)
  if (file.size > 2 * 1024 * 1024) {
    return error(c, 'FILE_TOO_LARGE', 'Taille maximale: 2 Mo', 400);
  }

  const ext = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg';
  const key = `avatars/${currentUser.sub}.${ext}`;

  // Upload to R2
  await c.env.STORAGE.put(key, file.stream(), {
    httpMetadata: { contentType: file.type },
  });

  // Build public URL
  const apiBase = c.env.API_BASE_URL || `https://${c.req.header('Host')}`;
  const avatarUrl = `${apiBase}/api/v1/auth/me/avatar/${currentUser.sub}.${ext}`;

  // Update user record
  await updateUser(db, currentUser.sub, { avatarUrl });

  return success(c, { avatarUrl });
});

/**
 * GET /api/v1/auth/me/avatar/:filename
 * Serve avatar image from R2
 */
auth.get('/me/avatar/:filename', async (c) => {
  const filename = c.req.param('filename');
  const key = `avatars/${filename}`;

  const object = await c.env.STORAGE.get(key);
  if (!object) {
    return c.notFound();
  }

  const headers = new Headers();
  headers.set('Content-Type', object.httpMetadata?.contentType || 'image/jpeg');
  headers.set('Cache-Control', 'public, max-age=86400');

  return new Response(object.body, { headers });
});

/**
 * POST /api/v1/auth/mfa/email/send
 * Send 6-digit verification code via email
 */
auth.post('/mfa/email/send', zValidator('json', mfaEmailSendSchema, validationHook), async (c) => {
  const { mfaToken } = c.req.valid('json');

  const payload = await verifyJWT(mfaToken, c.env.JWT_SECRET);
  if (!payload || payload.purpose !== 'mfa_verify') {
    return unauthorized(c, 'Token MFA invalide ou expire');
  }

  const user = await findUserById(getDb(c), payload.sub);
  if (!user) {
    return unauthorized(c, 'Utilisateur non trouve');
  }

  // Rate limit: max 3 sends per session
  const countKey = `mfa_email_count:${user.id}`;
  const currentCount = Number.parseInt(await c.env.CACHE.get(countKey) || '0', 10);
  if (currentCount >= 3) {
    return error(c, 'MFA_RATE_LIMIT', 'Trop de tentatives d\'envoi. Veuillez réessayer plus tard.', 429);
  }

  // Generate 6-digit code
  const array = new Uint32Array(1);
  crypto.getRandomValues(array);
  const code = String((array[0] ?? 0) % 1000000).padStart(6, '0');

  // Store code in KV with 5 min TTL
  await c.env.CACHE.put(`mfa_email:${user.id}`, code, { expirationTtl: 300 });
  await c.env.CACHE.put(countKey, String(currentCount + 1), { expirationTtl: 300 });

  // Send email via Brevo
  const notifService = new NotificationService({
    DB: getDb(c),
    CACHE: c.env.CACHE,
    BREVO_API_KEY: c.env.BREVO_API_KEY,
  });

  await notifService.sendMfaCode(user.email, code, user.firstName || 'Utilisateur');

  return success(c, { sent: true, expiresIn: 300 });
});

/**
 * POST /api/v1/auth/mfa/email/verify
 * Verify email-based MFA code
 */
auth.post('/mfa/email/verify', zValidator('json', mfaEmailVerifySchema, validationHook), async (c) => {
  const { mfaToken, otpCode, method } = c.req.valid('json');

  const payload = await verifyJWT(mfaToken, c.env.JWT_SECRET);
  if (!payload || payload.purpose !== 'mfa_verify') {
    return unauthorized(c, 'Token MFA invalide ou expire');
  }

  const user = await findUserById(getDb(c), payload.sub);
  if (!user) {
    return unauthorized(c, 'Utilisateur non trouve');
  }

  let isValid = false;

  if (method === 'totp') {
    // Use existing TOTP verification
    if (!user.mfaSecret) {
      return error(c, 'MFA_NOT_CONFIGURED', 'TOTP non configure', 400);
    }
    isValid = await verifyTOTP(otpCode, user.mfaSecret);
  } else {
    // Verify email code from KV
    const storedCode = await c.env.CACHE.get(`mfa_email:${user.id}`);
    if (!storedCode) {
      return error(c, 'MFA_CODE_EXPIRED', 'Code expire. Veuillez renvoyer un nouveau code.', 401);
    }

    // Constant-time comparison
    if (otpCode.length !== storedCode.length) {
      isValid = false;
    } else {
      const encoder = new TextEncoder();
      const a = encoder.encode(otpCode);
      const b = encoder.encode(storedCode);
      let diff = 0;
      for (let i = 0; i < a.length; i++) {
        diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
      }
      isValid = diff === 0;
    }

    if (isValid) {
      // Delete used code
      await c.env.CACHE.delete(`mfa_email:${user.id}`);
      await c.env.CACHE.delete(`mfa_email_count:${user.id}`);
    }
  }

  if (!isValid) {
    await logAudit(getDb(c), {
      userId: user.id,
      action: 'auth.mfa_failed',
      entityType: 'user',
      entityId: user.id,
      changes: { reason: `invalid_${method}_code` },
      ipAddress: c.req.header('CF-Connecting-IP'),
      userAgent: c.req.header('User-Agent'),
    });
    return error(c, 'INVALID_OTP', 'Code de verification invalide', 401);
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

  await c.env.CACHE.put(`refresh:${user.id}`, refreshToken, { expirationTtl: refreshExpiresIn });

  const isProd = isProduction(c);
  setAccessTokenCookie(c, accessToken, jwtExpiresIn, isProd);
  setRefreshTokenCookie(c, refreshToken, refreshExpiresIn, isProd);

  await updateUser(getDb(c), user.id, { lastLoginAt: new Date().toISOString() });

  await logAudit(getDb(c), {
    userId: user.id,
    action: 'auth.login_mfa_verified',
    entityType: 'user',
    entityId: user.id,
    changes: { method },
    ipAddress: c.req.header('CF-Connecting-IP'),
    userAgent: c.req.header('User-Agent'),
  });

  // Resolve tenant code
  let tenantCode: string | null = null;
  if (user.insurerId) {
    const insurer = await getDb(c).prepare('SELECT code FROM insurers WHERE id = ?').bind(user.insurerId).first<{ code: string }>();
    tenantCode = insurer?.code || null;
  }

  const permissions = await buildUserPermissions(getDb(c), user.id, user.role);
  const emailVerifyCompanyName = await resolveCompanyName(getDb(c), user.companyId);

  // Check if user has any registered passkeys
  let emailHasPasskey = false;
  try {
    const pkRow = await getDb(c).prepare('SELECT 1 FROM passkeys WHERE user_id = ? LIMIT 1').bind(user.id).first();
    emailHasPasskey = !!pkRow;
  } catch { /* passkeys table may not exist */ }

  return success(c, {
    expiresIn: jwtExpiresIn,
    user: userToPublic({ ...user, companyName: emailVerifyCompanyName }),
    permissions,
    tenantCode,
    hasPasskey: emailHasPasskey,
    tokens: { accessToken, refreshToken },
  });
});

/**
 * POST /api/v1/auth/mfa/email/enable
 * Send a verification code to enable email-based MFA from user settings
 */
auth.post('/mfa/email/enable', authMiddleware(), async (c) => {
  const jwtPayload = c.get('user');
  if (!jwtPayload) return unauthorized(c);

  const user = await findUserById(getDb(c), jwtPayload.sub);
  if (!user) return unauthorized(c, 'Utilisateur non trouve');

  if (user.mfaEnabled) {
    return error(c, 'MFA_ALREADY_ENABLED', 'MFA deja active sur ce compte', 400);
  }

  // Rate limit: max 3 sends per 5 min
  const countKey = `mfa_enable_count:${user.id}`;
  const currentCount = Number.parseInt(await c.env.CACHE.get(countKey) || '0', 10);
  if (currentCount >= 3) {
    return error(c, 'MFA_RATE_LIMIT', 'Trop de tentatives. Veuillez reessayer plus tard.', 429);
  }

  // Generate 6-digit code
  const array = new Uint32Array(1);
  crypto.getRandomValues(array);
  const code = String((array[0] ?? 0) % 1000000).padStart(6, '0');

  // Store code in KV with 5 min TTL
  await c.env.CACHE.put(`mfa_enable:${user.id}`, code, { expirationTtl: 300 });
  await c.env.CACHE.put(countKey, String(currentCount + 1), { expirationTtl: 300 });

  // Send email
  const notifService = new NotificationService({
    DB: getDb(c),
    CACHE: c.env.CACHE,
    BREVO_API_KEY: c.env.BREVO_API_KEY,
  });

  await notifService.sendMfaCode(user.email, code, user.firstName || 'Utilisateur');

  await logAudit(getDb(c), {
    userId: user.id,
    action: 'auth.mfa_email_enable_requested',
    entityType: 'user',
    entityId: user.id,
    ipAddress: c.req.header('CF-Connecting-IP'),
    userAgent: c.req.header('User-Agent'),
  });

  return success(c, { sent: true, expiresIn: 300 });
});

/**
 * POST /api/v1/auth/mfa/email/enable/verify
 * Verify code and enable email-based MFA on user account
 */
auth.post('/mfa/email/enable/verify', authMiddleware(), zValidator('json', mfaSetupSchema), async (c) => {
  const jwtPayload = c.get('user');
  const { otpCode } = c.req.valid('json');
  if (!jwtPayload) return unauthorized(c);

  const user = await findUserById(getDb(c), jwtPayload.sub);
  if (!user) return unauthorized(c, 'Utilisateur non trouve');

  // Get stored code
  const storedCode = await c.env.CACHE.get(`mfa_enable:${user.id}`);
  if (!storedCode) {
    return error(c, 'MFA_CODE_EXPIRED', 'Code expire. Veuillez renvoyer un nouveau code.', 400);
  }

  // Constant-time comparison
  const encoder = new TextEncoder();
  const a = encoder.encode(otpCode);
  const b = encoder.encode(storedCode);
  let diff = 0;
  if (a.length !== b.length) {
    return error(c, 'INVALID_OTP', 'Code invalide', 401);
  }
  for (let i = 0; i < a.length; i++) {
    diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
  }
  if (diff !== 0) {
    return error(c, 'INVALID_OTP', 'Code invalide', 401);
  }

  // Enable MFA
  await updateUser(getDb(c), user.id, { mfaEnabled: true });

  // Cleanup
  await c.env.CACHE.delete(`mfa_enable:${user.id}`);
  await c.env.CACHE.delete(`mfa_enable_count:${user.id}`);

  await logAudit(getDb(c), {
    userId: user.id,
    action: 'auth.mfa_email_enabled',
    entityType: 'user',
    entityId: user.id,
    ipAddress: c.req.header('CF-Connecting-IP'),
    userAgent: c.req.header('User-Agent'),
  });

  return success(c, { enabled: true, message: 'MFA par email activé avec succès' });
});

/**
 * POST /api/v1/auth/mfa/email/disable
 * Disable email-based MFA (no OTP required, user is already authenticated)
 */
auth.post('/mfa/email/disable', authMiddleware(), async (c) => {
  const jwtPayload = c.get('user');
  if (!jwtPayload) return unauthorized(c);

  const user = await findUserById(getDb(c), jwtPayload.sub);
  if (!user) return unauthorized(c, 'Utilisateur non trouve');

  if (!user.mfaEnabled) {
    return error(c, 'MFA_NOT_ENABLED', 'MFA non active sur ce compte', 400);
  }

  // Agents cannot disable MFA — it is mandatory for their role
  if (roleRequiresMFA(user.role)) {
    return error(c, 'MFA_REQUIRED_FOR_ROLE', 'La double authentification est obligatoire pour votre rôle', 403);
  }

  await updateUser(getDb(c), user.id, { mfaEnabled: false, mfaSecret: undefined });
  await c.env.CACHE.delete(`mfa_backup:${user.id}`);

  await logAudit(getDb(c), {
    userId: user.id,
    action: 'auth.mfa_disabled',
    entityType: 'user',
    entityId: user.id,
    ipAddress: c.req.header('CF-Connecting-IP'),
    userAgent: c.req.header('User-Agent'),
  });

  return success(c, { disabled: true, message: 'MFA desactive' });
});

/**
 * POST /api/v1/auth/password-reset/request
 * Send password reset email
 */
auth.post('/password-reset/request', zValidator('json', passwordResetRequestSchema, validationHook), async (c) => {
  const { email, turnstileToken } = c.req.valid('json');

  // Verify Turnstile if configured
  if (turnstileToken) {
    const ip = c.req.header('CF-Connecting-IP');
    const valid = await verifyTurnstile(turnstileToken, c.env.TURNSTILE_SECRET_KEY, ip);
    if (!valid) {
      return error(c, 'TURNSTILE_FAILED', 'Verification anti-bot echouee', 403);
    }
  }

  // Always return success to prevent email enumeration
  const user = await findUserByEmail(getDb(c), email);

  if (user) {
    // Generate reset token
    const resetToken = await signJWT(
      { id: user.id, sub: user.id, email: user.email, role: user.role, purpose: 'password_reset' },
      c.env.JWT_SECRET,
      1800 // 30 minutes
    );

    await c.env.CACHE.put(`password_reset:${user.id}`, resetToken, { expirationTtl: 1800 });

    // Build reset URL
    const baseUrl = c.env.WEB_BASE_URL || c.req.header('Origin') || 'https://dhamen-web-dev.pages.dev';
    const resetUrl = `${baseUrl}/auth/reset-password/confirm?token=${resetToken}`;

    const notifService = new NotificationService({
      DB: getDb(c),
      CACHE: c.env.CACHE,
      BREVO_API_KEY: c.env.BREVO_API_KEY,
    });

    await notifService.sendPasswordResetEmail(user.email, resetUrl, user.firstName || 'Utilisateur');
  }

  return success(c, { sent: true, message: 'Si un compte existe avec cet email, un lien de réinitialisation a été envoyé.' });
});

/**
 * POST /api/v1/auth/password-reset/confirm
 * Reset password with token
 */
auth.post('/password-reset/confirm', zValidator('json', passwordResetConfirmSchema, validationHook), async (c) => {
  const { token, newPassword } = c.req.valid('json');

  const payload = await verifyJWT(token, c.env.JWT_SECRET);
  if (!payload || payload.purpose !== 'password_reset') {
    return error(c, 'INVALID_TOKEN', 'Lien de réinitialisation invalide ou expire', 400);
  }

  // Verify token exists in KV
  const storedToken = await c.env.CACHE.get(`password_reset:${payload.sub}`);
  if (storedToken !== token) {
    return error(c, 'TOKEN_USED', 'Ce lien a déjà été utilisé', 400);
  }

  const user = await findUserById(getDb(c), payload.sub);
  if (!user) {
    return error(c, 'USER_NOT_FOUND', 'Utilisateur non trouve', 404);
  }

  // Hash new password and update
  const passwordHash = await hashPassword(newPassword);
  await updateUser(getDb(c), user.id, { passwordHash });

  // Cleanup
  await c.env.CACHE.delete(`password_reset:${payload.sub}`);
  await c.env.CACHE.delete(`refresh:${user.id}`);

  await logAudit(getDb(c), {
    userId: user.id,
    action: 'auth.password_reset',
    entityType: 'user',
    entityId: user.id,
    ipAddress: c.req.header('CF-Connecting-IP'),
    userAgent: c.req.header('User-Agent'),
  });

  return success(c, { reset: true, message: 'Mot de passe réinitialisé avec succès' });
});

/**
 * POST /api/v1/auth/magic-link/send
 * Send a magic link login email
 */
auth.post('/magic-link/send', zValidator('json', magicLinkSendSchema, validationHook), async (c) => {
  const { email, turnstileToken } = c.req.valid('json');

  // Verify Turnstile if configured
  if (turnstileToken) {
    const ip = c.req.header('CF-Connecting-IP');
    const valid = await verifyTurnstile(turnstileToken, c.env.TURNSTILE_SECRET_KEY, ip);
    if (!valid) {
      return error(c, 'TURNSTILE_FAILED', 'Verification anti-bot echouee', 403);
    }
  }

  // Always return success to prevent email enumeration
  const user = await findUserByEmail(getDb(c), email);

  if (user && user.isActive) {
    // Generate magic link token
    const magicToken = await signJWT(
      { id: user.id, sub: user.id, email: user.email, role: user.role, purpose: 'magic_link' as const },
      c.env.JWT_SECRET,
      900 // 15 minutes
    );

    // Store token in KV to ensure single use
    await c.env.CACHE.put(`magic_link:${user.id}`, magicToken, { expirationTtl: 900 });

    // Build magic link URL (include tenant code so verify page can set it)
    const baseUrl = c.env.WEB_BASE_URL || c.req.header('Origin') || 'https://dhamen-web-dev.pages.dev';
    const tenantCode = c.req.header('X-Tenant-Code') || '';
    const loginUrl = `${baseUrl}/auth/magic-link/verify?token=${magicToken}${tenantCode ? `&tenant=${tenantCode}` : ''}`;

    const notifService = new NotificationService({
      DB: getDb(c),
      CACHE: c.env.CACHE,
      BREVO_API_KEY: c.env.BREVO_API_KEY,
    });

    await notifService.sendMagicLinkEmail(user.email, loginUrl, user.firstName || 'Utilisateur');
  }

  return success(c, { sent: true, message: 'Si un compte existe avec cet email, un lien de connexion a été envoyé.' });
});

/**
 * POST /api/v1/auth/magic-link/verify
 * Verify magic link token and log the user in
 */
auth.post('/magic-link/verify', zValidator('json', magicLinkVerifySchema, validationHook), async (c) => {
  const { token } = c.req.valid('json');

  const payload = await verifyJWT(token, c.env.JWT_SECRET);
  if (!payload || payload.purpose !== 'magic_link') {
    await logSecurityEvent(getDb(c), {
      action: 'login_failure',
      ipAddress: c.req.header('CF-Connecting-IP'),
      userAgent: c.req.header('User-Agent'),
      details: { method: 'magic_link', reason: 'invalid_or_expired_token' },
    });
    return error(c, 'INVALID_TOKEN', 'Lien de connexion invalide ou expire', 400);
  }

  // Verify token exists in KV (single use)
  const storedToken = await c.env.CACHE.get(`magic_link:${payload.sub}`);
  if (storedToken !== token) {
    await logSecurityEvent(getDb(c), {
      userId: payload.sub,
      action: 'login_failure',
      ipAddress: c.req.header('CF-Connecting-IP'),
      userAgent: c.req.header('User-Agent'),
      details: { method: 'magic_link', reason: 'token_already_used' },
    });
    return error(c, 'TOKEN_USED', 'Ce lien a déjà été utilisé', 400);
  }

  const user = await findUserById(getDb(c), payload.sub);
  if (!user || !user.isActive) {
    await logSecurityEvent(getDb(c), {
      userId: payload.sub,
      action: 'login_failure',
      ipAddress: c.req.header('CF-Connecting-IP'),
      userAgent: c.req.header('User-Agent'),
      details: { method: 'magic_link', reason: 'user_not_found_or_disabled' },
    });
    return error(c, 'USER_NOT_FOUND', 'Utilisateur non trouve ou desactive', 404);
  }

  // Invalidate the magic link token (single use)
  await c.env.CACHE.delete(`magic_link:${payload.sub}`);

  // Generate access and refresh tokens
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
    action: 'auth.login_magic_link',
    entityType: 'user',
    entityId: user.id,
    ipAddress: c.req.header('CF-Connecting-IP'),
    userAgent: c.req.header('User-Agent'),
  });

  // Resolve tenant code
  let tenantCode: string | null = null;
  if (user.insurerId) {
    const insurer = await getDb(c).prepare('SELECT code FROM insurers WHERE id = ?').bind(user.insurerId).first<{ code: string }>();
    tenantCode = insurer?.code || null;
  }

  const permissions = await buildUserPermissions(getDb(c), user.id, user.role);
  const magicLinkCompanyName = await resolveCompanyName(getDb(c), user.companyId);

  return success(c, {
    expiresIn: jwtExpiresIn,
    user: userToPublic({ ...user, companyName: magicLinkCompanyName }),
    permissions,
    tenantCode,
    tokens: {
      accessToken,
      refreshToken,
    },
  });
});

/**
 * POST /auth/verify-password — Re-authenticate current user by password
 * Used for sensitive operations (e.g., modifying permissions)
 */
auth.post('/verify-password', authMiddleware(), async (c) => {
  const currentUser = c.get('user');
  const body = await c.req.json();

  const schema = z.object({
    password: z.string().min(1, 'Mot de passe requis'),
  });

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return error(c, 'VALIDATION_ERROR', 'Mot de passe requis', 400);
  }

  const db = getDb(c);
  const user = await findUserById(db, currentUser.sub);
  if (!user || !user.passwordHash) {
    return error(c, 'USER_NOT_FOUND', 'Utilisateur introuvable', 404);
  }

  const isValid = await verifyPassword(parsed.data.password, user.passwordHash);
  if (!isValid) {
    await logAudit(db, {
      userId: currentUser.sub,
      action: 'auth.verify_password.failed',
      entityType: 'user',
      entityId: currentUser.sub,
      ipAddress: c.req.header('CF-Connecting-IP'),
      userAgent: c.req.header('User-Agent'),
    });
    return error(c, 'INVALID_PASSWORD', 'Mot de passe incorrect', 401);
  }

  await logAudit(db, {
    userId: currentUser.sub,
    action: 'auth.verify_password.success',
    entityType: 'user',
    entityId: currentUser.sub,
    ipAddress: c.req.header('CF-Connecting-IP'),
    userAgent: c.req.header('User-Agent'),
  });

  return success(c, { verified: true });
});

/**
 * GET /auth/permissions — Refresh current user's resolved permissions
 * Returns fresh role matrix + individual overrides from DB
 */
auth.get('/permissions', authMiddleware(), async (c) => {
  const currentUser = c.get('user');
  const db = getDb(c);

  const permissions = await buildUserPermissions(db, currentUser.sub, currentUser.role);

  return success(c, { permissions });
});

// ============================================
// PASSKEY / WEBAUTHN ROUTES
// ============================================

/**
 * Helper to resolve WebAuthn RP ID and expected origins based on environment
 */
function getWebAuthnConfig(c: { env: Bindings; req: { header: (name: string) => string | undefined } }) {
  const rpName = c.env.WEBAUTHN_RP_NAME || 'E-Sante';
  const configuredRpID = c.env.WEBAUTHN_RP_ID || 'localhost';

  // Detect if request comes from localhost (dev frontend pointing to staging API)
  const origin = c.req.header('Origin') || '';
  const isLocalhost = origin.includes('localhost') || origin.includes('127.0.0.1');
  const rpID = isLocalhost ? 'localhost' : configuredRpID;

  // Build expected origins based on RP ID
  const expectedOrigins: string[] = [];
  if (isLocalhost) {
    expectedOrigins.push('http://localhost:5173', 'http://localhost:3000', 'http://127.0.0.1:5173');
  } else {
    // Production/staging: accept all subdomains + pages.dev previews
    expectedOrigins.push(
      `https://${rpID}`,
      `https://app.${rpID}`,
      `https://app-staging.${rpID}`,
      `https://staging.${rpID}`,
      'https://dhamen-web-staging.pages.dev',
      'https://dhamen-web.pages.dev',
    );
  }

  return { rpID, rpName, expectedOrigins };
}

/**
 * POST /auth/passkey/register/options
 * Generate WebAuthn registration options for the authenticated user
 */
auth.post('/passkey/register/options', authMiddleware(), async (c) => {
  const currentUser = c.get('user');
  const db = getDb(c);

  const user = await findUserById(db, currentUser.sub);
  if (!user) return unauthorized(c);

  const { rpID, rpName } = getWebAuthnConfig(c);

  // Get existing passkeys to exclude
  let existingCredentials: { credential_id: string; transports: string | null }[] = [];
  try {
    const { results } = await db
      .prepare('SELECT credential_id, transports FROM passkeys WHERE user_id = ?')
      .bind(user.id)
      .all<{ credential_id: string; transports: string | null }>();
    existingCredentials = results || [];
  } catch {
    // Table may not exist yet
  }

  const options = await generateRegistrationOptions({
    rpName,
    rpID,
    userName: user.email,
    userDisplayName: `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email,
    excludeCredentials: existingCredentials.map((cred) => ({
      id: cred.credential_id,
      transports: cred.transports ? JSON.parse(cred.transports) as AuthenticatorTransportFuture[] : undefined,
    })),
    authenticatorSelection: {
      residentKey: 'preferred',
      userVerification: 'preferred',
    },
    attestationType: 'none',
  });

  // Store challenge in KV (5 minutes TTL)
  await c.env.CACHE.put(`webauthn_reg:${user.id}`, options.challenge, {
    expirationTtl: 300,
  });

  return success(c, options);
});

/**
 * POST /auth/passkey/register/verify
 * Verify WebAuthn registration response and store the credential
 */
auth.post('/passkey/register/verify', authMiddleware(), async (c) => {
  const currentUser = c.get('user');
  const db = getDb(c);

  const body = await c.req.json<{ response: RegistrationResponseJSON; name?: string }>();

  // Retrieve stored challenge
  const expectedChallenge = await c.env.CACHE.get(`webauthn_reg:${currentUser.sub}`);
  if (!expectedChallenge) {
    return error(c, 'CHALLENGE_EXPIRED', 'Challenge expire, veuillez reessayer', 400);
  }

  const { rpID, expectedOrigins } = getWebAuthnConfig(c);

  let verification;
  try {
    verification = await verifyRegistrationResponse({
      response: body.response,
      expectedChallenge,
      expectedOrigin: expectedOrigins,
      expectedRPID: rpID,
      requireUserVerification: false,
    });
  } catch (err) {
    return error(c, 'REGISTRATION_FAILED', `Verification echouee: ${(err as Error).message}`, 400);
  }

  if (!verification.verified || !verification.registrationInfo) {
    return error(c, 'REGISTRATION_FAILED', 'La verification de la passkey a echoue', 400);
  }

  const { credential, credentialDeviceType, credentialBackedUp } = verification.registrationInfo;

  // Store passkey in DB
  const passkeyId = generateId();
  try {
    await db
      .prepare(
        `INSERT INTO passkeys (id, user_id, credential_id, public_key, counter, device_type, backed_up, transports, name)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        passkeyId,
        currentUser.sub,
        credential.id,
        credential.publicKey,
        credential.counter,
        credentialDeviceType,
        credentialBackedUp ? 1 : 0,
        credential.transports ? JSON.stringify(credential.transports) : null,
        body.name || 'Ma Passkey'
      )
      .run();
  } catch (err) {
    return error(c, 'STORAGE_ERROR', `Erreur lors de l'enregistrement: ${(err as Error).message}`, 500);
  }

  // Clean up challenge
  await c.env.CACHE.delete(`webauthn_reg:${currentUser.sub}`);

  // Audit log
  await logAudit(getDb(c), {
    userId: currentUser.sub,
    action: 'auth.passkey_registered',
    entityType: 'passkey',
    entityId: passkeyId,
    ipAddress: c.req.header('CF-Connecting-IP'),
    userAgent: c.req.header('User-Agent'),
  });

  return success(c, {
    id: passkeyId,
    name: body.name || 'Ma Passkey',
    deviceType: credentialDeviceType,
    backedUp: credentialBackedUp,
    createdAt: new Date().toISOString(),
  });
});

/**
 * POST /auth/passkey/login/options
 * Generate WebAuthn authentication options (public, no auth required)
 */
auth.post('/passkey/login/options', async (c) => {
  const db = getDb(c);
  const { rpID } = getWebAuthnConfig(c);

  let email: string | undefined;
  try {
    const body = await c.req.json<{ email?: string }>();
    email = body.email;
  } catch {
    // No body is fine — discoverable credential flow
  }

  let allowCredentials: { id: string; transports?: AuthenticatorTransportFuture[] }[] | undefined;
  let hasPasskeys = false;

  if (email) {
    const user = await findUserByEmail(db, email);
    if (user) {
      try {
        const { results } = await db
          .prepare('SELECT credential_id, transports FROM passkeys WHERE user_id = ?')
          .bind(user.id)
          .all<{ credential_id: string; transports: string | null }>();
        allowCredentials = (results || []).map((cred) => ({
          id: cred.credential_id,
          transports: cred.transports ? JSON.parse(cred.transports) as AuthenticatorTransportFuture[] : undefined,
        }));
        hasPasskeys = (allowCredentials.length > 0);
      } catch {
        // Table may not exist
      }
    }
    // If email was provided but no passkeys found, return early
    if (!hasPasskeys) {
      return error(c, 'PASSKEY_NOT_FOUND', 'Aucune Passkey enregistree pour ce compte. Connectez-vous avec vos identifiants puis creez une Passkey.', 404);
    }
  } else {
    // Discoverable credentials: check if ANY passkeys exist
    try {
      const { results } = await db
        .prepare('SELECT COUNT(*) as cnt FROM passkeys')
        .all<{ cnt: number }>();
      hasPasskeys = (results?.[0]?.cnt ?? 0) > 0;
    } catch {
      // Table may not exist
    }
    if (!hasPasskeys) {
      return error(c, 'PASSKEY_NOT_FOUND', 'Aucune Passkey enregistree. Connectez-vous avec vos identifiants puis creez une Passkey.', 404);
    }
  }

  const options = await generateAuthenticationOptions({
    rpID,
    userVerification: 'preferred',
    allowCredentials,
  });

  // Store challenge in KV
  await c.env.CACHE.put(`webauthn_auth:${options.challenge}`, email || '', {
    expirationTtl: 300,
  });

  return success(c, options);
});

/**
 * POST /auth/passkey/login/verify
 * Verify WebAuthn authentication response and issue tokens
 */
auth.post('/passkey/login/verify', async (c) => {
  const db = getDb(c);
  const body = await c.req.json<{ response: AuthenticationResponseJSON }>();

  const { rpID, expectedOrigins } = getWebAuthnConfig(c);

  // Find passkey by credential ID
  let passkey: {
    id: string;
    user_id: string;
    credential_id: string;
    public_key: ArrayBuffer;
    counter: number;
    transports: string | null;
  } | null = null;

  try {
    passkey = await db
      .prepare('SELECT id, user_id, credential_id, public_key, counter, transports FROM passkeys WHERE credential_id = ?')
      .bind(body.response.id)
      .first();
  } catch {
    return error(c, 'PASSKEY_NOT_FOUND', 'Passkey non trouvee', 404);
  }

  if (!passkey) {
    await logSecurityEvent(db, {
      action: 'login_failure',
      ipAddress: c.req.header('CF-Connecting-IP'),
      userAgent: c.req.header('User-Agent'),
      details: { method: 'passkey', reason: 'passkey_not_found', credentialId: body.response.id },
    });
    return error(c, 'PASSKEY_NOT_FOUND', 'Passkey non trouvee. Connectez-vous avec vos identifiants.', 404);
  }

  // Retrieve stored challenge
  const challengeFromResponse = body.response.response.clientDataJSON;
  // We need to find the challenge — decode clientDataJSON to extract it
  let challengeStr: string;
  try {
    const clientDataBytes = Uint8Array.from(atob(challengeFromResponse.replace(/-/g, '+').replace(/_/g, '/')), (ch) => ch.charCodeAt(0));
    const clientData = JSON.parse(new TextDecoder().decode(clientDataBytes));
    challengeStr = clientData.challenge;
  } catch {
    return error(c, 'INVALID_RESPONSE', 'Reponse WebAuthn invalide', 400);
  }

  const storedEmail = await c.env.CACHE.get(`webauthn_auth:${challengeStr}`);
  if (storedEmail === null) {
    return error(c, 'CHALLENGE_EXPIRED', 'Challenge expire, veuillez reessayer', 400);
  }

  // Load user
  const user = await findUserById(db, passkey.user_id);
  if (!user) {
    return error(c, 'USER_NOT_FOUND', 'Utilisateur non trouve', 404);
  }

  if (!user.isActive) {
    return error(c, 'ACCOUNT_DISABLED', 'Compte desactive', 401);
  }

  let verification;
  try {
    verification = await verifyAuthenticationResponse({
      response: body.response,
      expectedChallenge: challengeStr,
      expectedOrigin: expectedOrigins,
      expectedRPID: rpID,
      requireUserVerification: false,
      credential: {
        id: passkey.credential_id,
        publicKey: new Uint8Array(passkey.public_key),
        counter: passkey.counter,
        transports: passkey.transports ? JSON.parse(passkey.transports) as AuthenticatorTransportFuture[] : undefined,
      },
    });
  } catch (err) {
    return error(c, 'AUTHENTICATION_FAILED', `Verification echouee: ${(err as Error).message}`, 400);
  }

  if (!verification.verified) {
    await logSecurityEvent(db, {
      userId: user.id,
      action: 'login_failure',
      ipAddress: c.req.header('CF-Connecting-IP'),
      userAgent: c.req.header('User-Agent'),
      details: { method: 'passkey', reason: 'verification_failed' },
    });
    return error(c, 'AUTHENTICATION_FAILED', 'La verification de la passkey a echoue', 401);
  }

  // Update passkey counter and last_used_at
  try {
    await db
      .prepare('UPDATE passkeys SET counter = ?, last_used_at = datetime(\'now\'), updated_at = datetime(\'now\') WHERE id = ?')
      .bind(verification.authenticationInfo.newCounter, passkey.id)
      .run();
  } catch {
    // Non-critical
  }

  // Clean up challenge
  await c.env.CACHE.delete(`webauthn_auth:${challengeStr}`);

  // Issue JWT tokens (same flow as password login, MFA is bypassed)
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

  const isProd = isProduction(c);
  setAccessTokenCookie(c, accessToken, jwtExpiresIn, isProd);
  setRefreshTokenCookie(c, refreshToken, refreshExpiresIn, isProd);

  await updateUser(db, user.id, { lastLoginAt: new Date().toISOString() });

  // Audit log
  await logAudit(db, {
    userId: user.id,
    action: 'auth.passkey_login',
    entityType: 'user',
    entityId: user.id,
    ipAddress: c.req.header('CF-Connecting-IP'),
    userAgent: c.req.header('User-Agent'),
  });

  // Resolve tenant code
  let tenantCode: string | null = null;
  if (user.insurerId) {
    const insurer = await db.prepare('SELECT code FROM insurers WHERE id = ?').bind(user.insurerId).first<{ code: string }>();
    tenantCode = insurer?.code || null;
  }

  const companyName = await resolveCompanyName(db, user.companyId);
  const permissions = await buildUserPermissions(db, user.id, user.role);

  return success(c, {
    requiresMfa: false,
    authMethod: 'passkey',
    expiresIn: jwtExpiresIn,
    user: userToPublic({ ...user, companyName }),
    tenantCode,
    permissions,
    tokens: {
      accessToken,
      refreshToken,
    },
  });
});

/**
 * GET /auth/passkeys
 * List all passkeys for the authenticated user
 */
auth.get('/passkeys', authMiddleware(), async (c) => {
  const currentUser = c.get('user');
  const db = getDb(c);

  try {
    const { results } = await db
      .prepare('SELECT id, name, device_type, backed_up, transports, last_used_at, created_at FROM passkeys WHERE user_id = ? ORDER BY created_at DESC')
      .bind(currentUser.sub)
      .all<{
        id: string;
        name: string | null;
        device_type: string;
        backed_up: number;
        transports: string | null;
        last_used_at: string | null;
        created_at: string;
      }>();

    return success(
      c,
      (results || []).map((pk) => ({
        id: pk.id,
        name: pk.name,
        deviceType: pk.device_type,
        backedUp: pk.backed_up === 1,
        transports: pk.transports ? JSON.parse(pk.transports) : [],
        lastUsedAt: pk.last_used_at,
        createdAt: pk.created_at,
      }))
    );
  } catch {
    return success(c, []);
  }
});

/**
 * DELETE /auth/passkeys/:id
 * Remove a passkey
 */
auth.delete('/passkeys/:id', authMiddleware(), async (c) => {
  const currentUser = c.get('user');
  const passkeyId = c.req.param('id');
  const db = getDb(c);

  const result = await db
    .prepare('DELETE FROM passkeys WHERE id = ? AND user_id = ?')
    .bind(passkeyId, currentUser.sub)
    .run();

  if (!result.meta.changes || result.meta.changes === 0) {
    return error(c, 'NOT_FOUND', 'Passkey non trouvee', 404);
  }

  await logAudit(db, {
    userId: currentUser.sub,
    action: 'auth.passkey_removed',
    entityType: 'passkey',
    entityId: passkeyId,
    ipAddress: c.req.header('CF-Connecting-IP'),
    userAgent: c.req.header('User-Agent'),
  });

  return success(c, { deleted: true });
});

export { auth };
