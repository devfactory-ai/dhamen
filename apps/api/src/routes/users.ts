/**
 * Users Routes
 * CRUD operations and bulk import for users management
 */
import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { ulid } from 'ulid';
import { authMiddleware, requireRole } from '../middleware/auth';
import { logAudit } from '../middleware/audit-trail';
import { success, error, validationError, notFound } from '../lib/response';
import { hashPassword } from '../lib/password';
import type { Bindings, Variables } from '../types';
import { getDb } from '../lib/db';
import {
  listUsers,
  findUserById,
  findUserByEmail,
  createUser,
  updateUser,
  userToPublic,
} from '@dhamen/db';
import {
  userCreateSchema,
  userUpdateSchema,
  ROLES,
  PROTECTED_ROLES,
  getPermissions,
  RESOURCES,
  ACTIONS,
} from '@dhamen/shared';
import type { Role } from '@dhamen/shared';

// Validation hook
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

// Import schema
const userCsvRowSchema = z.object({
  email: z.string().email('Email invalide'),
  firstName: z.string().min(1, 'Prenom requis'),
  lastName: z.string().min(1, 'Nom requis'),
  role: z.enum(ROLES),
  phone: z.string().optional(),
});

const userImportSchema = z.object({
  users: z.array(userCsvRowSchema).min(1, 'Au moins un utilisateur requis').max(500, 'Maximum 500 utilisateurs'),
  skipDuplicates: z.boolean().optional().default(true),
});

const users = new Hono<{ Bindings: Bindings; Variables: Variables }>();

// Apply auth middleware to all routes
users.use('*', authMiddleware());

/**
 * GET /api/v1/users
 * List users with pagination and filters
 */
users.get('/', requireRole('ADMIN', 'INSURER_ADMIN', 'INSURER_AGENT'), async (c) => {
  const { page, limit, role, search, isActive } = c.req.query();
  const currentUser = c.get('user');

  // Cap pagination limit to 100 items max to prevent DoS
  const parsedPage = page ? parseInt(page, 10) : 1;
  const parsedLimit = Math.min(limit ? parseInt(limit, 10) : 20, 100);

  // INSURER_ADMIN / INSURER_AGENT: scope to own insurer only
  const insurerId = currentUser.role !== 'ADMIN' ? currentUser.insurerId : undefined;

  const result = await listUsers(getDb(c), {
    page: parsedPage,
    limit: parsedLimit,
    role: role as any,
    search,
    isActive: isActive !== undefined ? isActive === 'true' : undefined,
    insurerId: insurerId || undefined,
  });

  return success(c, {
    data: result.data.map(userToPublic),
    meta: {
      page: parsedPage,
      limit: parsedLimit,
      total: result.total,
    },
  });
});

/**
 * GET /api/v1/users/:id
 * Get user by ID
 */
users.get('/:id', requireRole('ADMIN', 'INSURER_ADMIN', 'INSURER_AGENT'), async (c) => {
  const { id } = c.req.param();

  const user = await findUserById(getDb(c), id);
  if (!user) {
    return notFound(c, 'Utilisateur non trouve');
  }

  return success(c, userToPublic(user));
});

/**
 * POST /api/v1/users
 * Create a new user
 */
users.post('/', requireRole('ADMIN', 'INSURER_ADMIN', 'INSURER_AGENT'), zValidator('json', userCreateSchema, validationHook), async (c) => {
  const data = c.req.valid('json');
  const currentUser = c.get('user');

  // Check if email already exists
  const existing = await findUserByEmail(getDb(c), data.email);
  if (existing) {
    return error(c, 'EMAIL_EXISTS', 'Un utilisateur avec cet email existe deja', 409);
  }

  const id = ulid();
  const passwordHash = await hashPassword(data.password);

  const user = await createUser(getDb(c), id, {
    email: data.email,
    passwordHash,
    role: data.role,
    providerId: data.providerId || undefined,
    insurerId: data.insurerId || undefined,
    companyId: data.companyId || undefined,
    firstName: data.firstName,
    lastName: data.lastName,
    phone: data.phone || undefined,
    mfaEnabled: data.mfaEnabled,
  });

  // Audit log
  await logAudit(getDb(c), {
    userId: currentUser?.sub,
    action: 'user.created',
    entityType: 'user',
    entityId: id,
    changes: { email: data.email, role: data.role },
    ipAddress: c.req.header('CF-Connecting-IP'),
    userAgent: c.req.header('User-Agent'),
  });

  return success(c, userToPublic(user), 201);
});

/**
 * PATCH /api/v1/users/:id
 * Update an existing user
 */
users.patch('/:id', requireRole('ADMIN', 'INSURER_ADMIN', 'INSURER_AGENT'), zValidator('json', userUpdateSchema, validationHook), async (c) => {
  const { id } = c.req.param();
  const data = c.req.valid('json');
  const currentUser = c.get('user');

  const existing = await findUserById(getDb(c), id);
  if (!existing) {
    return notFound(c, 'Utilisateur non trouve');
  }

  // If changing email, check it doesn't already exist
  if (data.email && data.email !== existing.email) {
    const emailExists = await findUserByEmail(getDb(c), data.email);
    if (emailExists) {
      return error(c, 'EMAIL_EXISTS', 'Un utilisateur avec cet email existe deja', 409);
    }
  }

  // Hash password if changing
  let updateData: any = { ...data };
  if (data.password) {
    updateData.passwordHash = await hashPassword(data.password);
    delete updateData.password;
  }
  // Coerce empty strings to null for FK fields
  if (updateData.companyId === '') updateData.companyId = null;
  if (updateData.phone === '') delete updateData.phone;

  const user = await updateUser(getDb(c), id, updateData);

  // Audit log
  await logAudit(getDb(c), {
    userId: currentUser?.sub,
    action: 'user.updated',
    entityType: 'user',
    entityId: id,
    changes: data,
    ipAddress: c.req.header('CF-Connecting-IP'),
    userAgent: c.req.header('User-Agent'),
  });

  return success(c, user ? userToPublic(user) : null);
});

/**
 * DELETE /api/v1/users/:id
 * Deactivate a user (soft delete)
 */
users.delete('/:id', requireRole('ADMIN'), async (c) => {
  const { id } = c.req.param();
  const currentUser = c.get('user');

  const existing = await findUserById(getDb(c), id);
  if (!existing) {
    return notFound(c, 'Utilisateur non trouve');
  }

  // Don't allow deleting yourself
  if (currentUser?.sub === id) {
    return error(c, 'CANNOT_DELETE_SELF', 'Vous ne pouvez pas supprimer votre propre compte', 400);
  }

  if (existing.isActive) {
    // Active user → soft delete (deactivate)
    await updateUser(getDb(c), id, { isActive: false });
    await logAudit(getDb(c), {
      userId: currentUser?.sub,
      action: 'user.deactivated',
      entityType: 'user',
      entityId: id,
      ipAddress: c.req.header('CF-Connecting-IP'),
      userAgent: c.req.header('User-Agent'),
    });
    return success(c, { deleted: true, mode: 'deactivated' });
  } else {
    // Already inactive → hard delete
    await getDb(c).prepare('DELETE FROM users WHERE id = ?').bind(id).run();
    await logAudit(getDb(c), {
      userId: currentUser?.sub,
      action: 'user.hard_deleted',
      entityType: 'user',
      entityId: id,
      changes: { email: existing.email, role: existing.role },
      ipAddress: c.req.header('CF-Connecting-IP'),
      userAgent: c.req.header('User-Agent'),
    });
    return success(c, { deleted: true, mode: 'hard_deleted' });
  }
});

/**
 * POST /api/v1/users/bulk-delete
 * Deactivate multiple users (soft delete)
 */
users.post('/bulk-delete', requireRole('ADMIN'), async (c) => {
  const currentUser = c.get('user');
  const { ids } = await c.req.json<{ ids: string[] }>();

  if (!ids || !Array.isArray(ids) || ids.length === 0) {
    return error(c, 'VALIDATION_ERROR', 'Liste d\'identifiants requise', 400);
  }

  // Filter out self
  const filteredIds = ids.filter((id) => id !== currentUser?.sub);
  let deactivatedCount = 0;
  let hardDeletedCount = 0;
  const db = getDb(c);

  for (const id of filteredIds) {
    const existing = await findUserById(db, id);
    if (existing) {
      if (existing.isActive) {
        await updateUser(db, id, { isActive: false });
        deactivatedCount++;
      } else {
        await db.prepare('DELETE FROM users WHERE id = ?').bind(id).run();
        hardDeletedCount++;
      }
    }
  }

  await logAudit(db, {
    userId: currentUser?.sub,
    action: 'user.bulk_deleted',
    entityType: 'user',
    entityId: 'bulk',
    changes: { ids: filteredIds, deactivated: deactivatedCount, hardDeleted: hardDeletedCount },
    ipAddress: c.req.header('CF-Connecting-IP'),
    userAgent: c.req.header('User-Agent'),
  });

  return success(c, { deleted: deactivatedCount + hardDeletedCount, deactivated: deactivatedCount, hardDeleted: hardDeletedCount });
});

/**
 * POST /api/v1/users/import
 * Bulk import users from CSV data
 */
users.post('/import', requireRole('ADMIN'), zValidator('json', userImportSchema, validationHook), async (c) => {
  const { users: usersData, skipDuplicates } = c.req.valid('json');
  const currentUser = c.get('user');

  const results = {
    success: 0,
    skipped: 0,
    errors: [] as { row: number; email: string; error: string }[],
  };

  // Default password for imported users (they must change it on first login)
  const defaultPassword = `ESante@${new Date().getFullYear()}!`;
  const defaultPasswordHash = await hashPassword(defaultPassword);

  for (let i = 0; i < usersData.length; i++) {
    const userData = usersData[i];
    if (!userData) continue;

    try {
      // Check if email exists
      const existing = await findUserByEmail(getDb(c), userData.email);

      if (existing) {
        if (skipDuplicates) {
          results.skipped++;
          continue;
        }
        results.errors.push({
          row: i + 1,
          email: userData.email,
          error: 'Email deja utilise',
        });
        continue;
      }

      // Create user
      const id = ulid();
      await createUser(getDb(c), id, {
        email: userData.email,
        passwordHash: defaultPasswordHash,
        role: userData.role,
        firstName: userData.firstName,
        lastName: userData.lastName,
        phone: userData.phone,
        mfaEnabled: true,
      });

      results.success++;
    } catch (err) {
      results.errors.push({
        row: i + 1,
        email: userData.email,
        error: err instanceof Error ? err.message : 'Erreur inconnue',
      });
    }
  }

  // Audit log
  await logAudit(getDb(c), {
    userId: currentUser?.sub,
    action: 'users.imported',
    entityType: 'user',
    entityId: 'bulk',
    changes: {
      total: usersData.length,
      success: results.success,
      skipped: results.skipped,
      errors: results.errors.length,
    },
    ipAddress: c.req.header('CF-Connecting-IP'),
    userAgent: c.req.header('User-Agent'),
  });

  return success(c, results);
});

// ============================================
// Permission Overrides (surcharges individuelles)
// ============================================

interface PermissionOverrideRow {
  id: string;
  user_id: string;
  resource: string;
  action: string;
  is_granted: number;
  reason: string;
  expires_at: string | null;
  granted_by: string;
  created_at: string;
  updated_at: string;
}

/**
 * GET /api/v1/users/:id/permissions
 * Get role permissions + individual overrides for a user
 */
users.get('/:id/permissions', requireRole('ADMIN', 'INSURER_ADMIN', 'INSURER_AGENT'), async (c) => {
  const { id } = c.req.param();
  const db = getDb(c);

  const user = await findUserById(db, id);
  if (!user) {
    return notFound(c, 'Utilisateur non trouvé');
  }

  // Role permissions matrix (static + role overrides from DB)
  const rolePerms = getPermissions(user.role as Role);
  const roleMatrix: Record<string, Record<string, boolean>> = {};
  for (const resource of RESOURCES) {
    roleMatrix[resource] = {};
    for (const action of ACTIONS) {
      const resourceActions = rolePerms[resource];
      roleMatrix[resource][action] = resourceActions ? resourceActions.includes(action) : false;
    }
  }

  // Apply role-level overrides from role_permission_overrides table
  try {
    const { results: roleOverrides } = await db
      .prepare('SELECT resource, action, is_granted FROM role_permission_overrides WHERE role_id = ?')
      .bind(user.role)
      .all<{ resource: string; action: string; is_granted: number }>();
    for (const o of roleOverrides ?? []) {
      if (roleMatrix[o.resource]) {
        roleMatrix[o.resource][o.action] = o.is_granted === 1;
      }
    }
  } catch {
    // Table may not exist yet
  }

  // Individual overrides
  const { results: overrides } = await db
    .prepare(
      `SELECT up.*, u.first_name || ' ' || u.last_name as granted_by_name
       FROM user_permissions up
       LEFT JOIN users u ON u.id = up.granted_by
       WHERE up.user_id = ?
       ORDER BY up.created_at DESC`
    )
    .bind(id)
    .all<PermissionOverrideRow & { granted_by_name: string }>();

  return success(c, {
    user: {
      id: user.id,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
    },
    rolePermissions: roleMatrix,
    overrides: (overrides ?? []).map((o) => ({
      id: o.id,
      resource: o.resource,
      action: o.action,
      isGranted: o.is_granted === 1,
      reason: o.reason,
      expiresAt: o.expires_at,
      grantedByName: o.granted_by_name,
      createdAt: o.created_at,
    })),
  });
});

/**
 * POST /api/v1/users/:id/permissions
 * Add an individual permission override
 */
users.post('/:id/permissions', requireRole('ADMIN', 'INSURER_ADMIN'), async (c) => {
  const { id } = c.req.param();
  const currentUser = c.get('user');
  const db = getDb(c);

  // Cannot override own permissions
  if (currentUser?.sub === id) {
    return error(c, 'SELF_OVERRIDE', 'Vous ne pouvez pas modifier vos propres permissions', 403);
  }

  const user = await findUserById(db, id);
  if (!user) {
    return notFound(c, 'Utilisateur non trouvé');
  }

  // Check protected
  if (PROTECTED_ROLES.includes(user.role as Role)) {
    return error(c, 'PROTECTED_ACCOUNT', 'Ce compte est protégé et ne peut pas être modifié', 403);
  }

  const body = await c.req.json();
  const schema = z.object({
    resource: z.string().min(1),
    action: z.string().min(1),
    isGranted: z.boolean(),
    reason: z.string().min(10, 'La raison doit contenir au moins 10 caractères'),
    expiresAt: z.string().nullable().optional(),
  });

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return error(c, 'VALIDATION_ERROR', parsed.error.errors[0]?.message ?? 'Données invalides', 400);
  }

  const { resource, action, isGranted, reason, expiresAt } = parsed.data;

  // Check limit (max 20 active overrides)
  const countResult = await db
    .prepare('SELECT COUNT(*) as count FROM user_permissions WHERE user_id = ?')
    .bind(id)
    .first<{ count: number }>();
  if ((countResult?.count ?? 0) >= 20) {
    return error(c, 'LIMIT_REACHED', 'Limite de surcharges atteinte (20/20)', 400);
  }

  // Check duplicate
  const existing = await db
    .prepare('SELECT id FROM user_permissions WHERE user_id = ? AND resource = ? AND action = ?')
    .bind(id, resource, action)
    .first();
  if (existing) {
    return error(c, 'DUPLICATE_OVERRIDE', 'Une surcharge existe déjà pour cette ressource et action', 409);
  }

  const overrideId = ulid();
  await db
    .prepare(
      `INSERT INTO user_permissions (id, user_id, resource, action, is_granted, reason, expires_at, granted_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`
    )
    .bind(overrideId, id, resource, action, isGranted ? 1 : 0, reason, expiresAt ?? null, currentUser?.sub)
    .run();

  await logAudit(db, {
    userId: currentUser?.sub,
    action: 'permission.override.added',
    entityType: 'user',
    entityId: id,
    changes: { resource, action, isGranted, reason, expiresAt },
    ipAddress: c.req.header('CF-Connecting-IP'),
    userAgent: c.req.header('User-Agent'),
  });

  return success(c, { id: overrideId, resource, action, isGranted, reason }, 201);
});

/**
 * DELETE /api/v1/users/:id/permissions/:permId
 * Remove an individual permission override
 */
users.delete('/:id/permissions/:permId', requireRole('ADMIN', 'INSURER_ADMIN'), async (c) => {
  const { id, permId } = c.req.param();
  const currentUser = c.get('user');
  const db = getDb(c);

  const override = await db
    .prepare('SELECT * FROM user_permissions WHERE id = ? AND user_id = ?')
    .bind(permId, id)
    .first<PermissionOverrideRow>();

  if (!override) {
    return notFound(c, 'Surcharge non trouvée');
  }

  await db
    .prepare('DELETE FROM user_permissions WHERE id = ?')
    .bind(permId)
    .run();

  await logAudit(db, {
    userId: currentUser?.sub,
    action: 'permission.override.removed',
    entityType: 'user',
    entityId: id,
    changes: { resource: override.resource, action: override.action },
    ipAddress: c.req.header('CF-Connecting-IP'),
    userAgent: c.req.header('User-Agent'),
  });

  return success(c, { deleted: true });
});

export { users };
