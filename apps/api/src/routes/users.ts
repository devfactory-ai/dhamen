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
} from '@dhamen/shared';

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

  // Cap pagination limit to 100 items max to prevent DoS
  const parsedPage = page ? parseInt(page, 10) : 1;
  const parsedLimit = Math.min(limit ? parseInt(limit, 10) : 20, 100);

  const result = await listUsers(getDb(c), {
    page: parsedPage,
    limit: parsedLimit,
    role: role as any,
    search,
    isActive: isActive !== undefined ? isActive === 'true' : undefined,
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
    providerId: data.providerId,
    insurerId: data.insurerId,
    firstName: data.firstName,
    lastName: data.lastName,
    phone: data.phone,
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

  await updateUser(getDb(c), id, { isActive: false });

  // Audit log
  await logAudit(getDb(c), {
    userId: currentUser?.sub,
    action: 'user.deleted',
    entityType: 'user',
    entityId: id,
    ipAddress: c.req.header('CF-Connecting-IP'),
    userAgent: c.req.header('User-Agent'),
  });

  return success(c, { deleted: true });
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
  let deletedCount = 0;

  for (const id of filteredIds) {
    const existing = await findUserById(getDb(c), id);
    if (existing) {
      await updateUser(getDb(c), id, { isActive: false });
      deletedCount++;
    }
  }

  await logAudit(getDb(c), {
    userId: currentUser?.sub,
    action: 'user.bulk_deleted',
    entityType: 'user',
    entityId: 'bulk',
    changes: { ids: filteredIds, count: deletedCount },
    ipAddress: c.req.header('CF-Connecting-IP'),
    userAgent: c.req.header('User-Agent'),
  });

  return success(c, { deleted: deletedCount });
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

export { users };
