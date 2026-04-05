import { Hono } from 'hono';
import { z } from 'zod';
import { ulid } from 'ulid';
import {
  ROLES,
  ROLE_LABELS,
  ROLE_DESCRIPTIONS,
  RESOURCE_LABELS,
  ACTION_LABELS,
  PROTECTED_ROLES,
  RESOURCES,
  ACTIONS,
  getPermissions,
} from '@dhamen/shared';
import type { Role } from '@dhamen/shared';
import { authMiddleware, requireRole } from '../middleware/auth';
import { logAudit } from '../middleware/audit-trail';
import { success, error } from '../lib/response';
import { getDb } from '../lib/db';
import { verifyPassword } from '../lib/password';
import { findUserById } from '@dhamen/db';
import type { Bindings, Variables } from '../types';

const roles = new Hono<{ Bindings: Bindings; Variables: Variables }>();

// All routes require ADMIN
roles.use('*', authMiddleware());
roles.use('*', requireRole('ADMIN'));

/**
 * GET /roles — Liste tous les rôles avec labels, descriptions et résumé des permissions
 */
roles.get('/', async (c) => {
  const db = getDb(c);

  // Roles masqués temporairement de l'interface Rôles & Permissions
  const HIDDEN_ROLES: Role[] = ['SOIN_GESTIONNAIRE', 'SOIN_AGENT', 'SOIN_RESPONSABLE', 'SOIN_DIRECTEUR', 'COMPLIANCE_OFFICER'];

  // Count users per role
  const userCounts = await db
    .prepare('SELECT role, COUNT(*) as count FROM users WHERE is_active = 1 GROUP BY role')
    .all<{ role: string; count: number }>();
  const countMap: Record<string, number> = {};
  for (const row of userCounts.results ?? []) {
    countMap[row.role] = row.count;
  }

  const builtInRoles = ROLES.filter((role) => !HIDDEN_ROLES.includes(role)).map((role) => {
    const permissions = getPermissions(role);
    const resourceCount = Object.keys(permissions).length;
    const actionCount = Object.values(permissions).reduce(
      (sum, actions) => sum + (actions?.length ?? 0),
      0
    );

    return {
      id: role,
      label: ROLE_LABELS[role],
      description: ROLE_DESCRIPTIONS[role],
      isProtected: PROTECTED_ROLES.includes(role),
      isCustom: false,
      userCount: countMap[role] ?? 0,
      permissionsSummary: {
        resources: resourceCount,
        totalActions: actionCount,
      },
    };
  });

  // Fetch custom roles from DB
  const customRolesResult = await db
    .prepare('SELECT id, name, description, is_active, created_at FROM custom_roles ORDER BY created_at DESC')
    .all<{ id: string; name: string; description: string; is_active: number; created_at: string }>();

  // Count permissions per custom role
  const permCountsResult = await db
    .prepare(
      `SELECT role_id, COUNT(DISTINCT resource) as resources, COUNT(*) as total_actions
       FROM role_permission_overrides WHERE is_granted = 1 GROUP BY role_id`
    )
    .all<{ role_id: string; resources: number; total_actions: number }>();
  const permCountMap: Record<string, { resources: number; totalActions: number }> = {};
  for (const row of permCountsResult.results ?? []) {
    permCountMap[row.role_id] = { resources: row.resources, totalActions: row.total_actions };
  }

  const customRoles = (customRolesResult.results ?? []).map((cr) => ({
    id: cr.id,
    label: cr.name,
    description: cr.description,
    isProtected: false,
    isCustom: true,
    isActive: cr.is_active === 1,
    userCount: countMap[cr.id] ?? 0,
    permissionsSummary: permCountMap[cr.id] ?? { resources: 0, totalActions: 0 },
  }));

  const rolesList = [...builtInRoles, ...customRoles];

  return success(c, {
    roles: rolesList,
    resources: RESOURCES.map((r) => ({ id: r, label: RESOURCE_LABELS[r] })),
    actions: ACTIONS.map((a) => ({ id: a, label: ACTION_LABELS[a] })),
  });
});

/**
 * GET /roles/:roleId/permissions — Permissions détaillées d'un rôle
 */
roles.get('/:roleId/permissions', async (c) => {
  const roleId = c.req.param('roleId');
  const db = getDb(c);

  const isBuiltIn = ROLES.includes(roleId as Role);

  // Check if it's a custom role
  let customRole: { id: string; name: string; description: string } | null = null;
  if (!isBuiltIn) {
    customRole = await db
      .prepare('SELECT id, name, description FROM custom_roles WHERE id = ?')
      .bind(roleId)
      .first<{ id: string; name: string; description: string }>();

    if (!customRole) {
      return error(c, 'ROLE_NOT_FOUND', `Rôle "${roleId}" introuvable`, 404);
    }
  }

  // Build base matrix: built-in roles start from static permissions, custom roles start empty
  const matrix: Record<string, Record<string, boolean>> = {};
  if (isBuiltIn) {
    const permissions = getPermissions(roleId as Role);
    for (const resource of RESOURCES) {
      matrix[resource] = {};
      for (const action of ACTIONS) {
        const resourceActions = permissions[resource];
        matrix[resource][action] = resourceActions ? resourceActions.includes(action) : false;
      }
    }
  } else {
    for (const resource of RESOURCES) {
      matrix[resource] = {};
      for (const action of ACTIONS) {
        matrix[resource][action] = false;
      }
    }
  }

  // Apply role_permission_overrides from DB (overwrite static values)
  try {
    const { results: overrides } = await db
      .prepare('SELECT resource, action, is_granted FROM role_permission_overrides WHERE role_id = ?')
      .bind(roleId)
      .all<{ resource: string; action: string; is_granted: number }>();

    for (const o of overrides ?? []) {
      if (matrix[o.resource]) {
        matrix[o.resource]![o.action] = o.is_granted === 1;
      }
    }
  } catch {
    // Table may not exist yet — use static permissions only
  }

  return success(c, {
    role: {
      id: roleId,
      label: isBuiltIn ? ROLE_LABELS[roleId as Role] : customRole!.name,
      description: isBuiltIn ? ROLE_DESCRIPTIONS[roleId as Role] : customRole!.description,
      isProtected: isBuiltIn ? PROTECTED_ROLES.includes(roleId as Role) : false,
      isCustom: !isBuiltIn,
    },
    permissions: matrix,
    resources: RESOURCES.map((r) => ({ id: r, label: RESOURCE_LABELS[r] })),
    actions: ACTIONS.map((a) => ({ id: a, label: ACTION_LABELS[a] })),
  });
});

/**
 * POST /users/:userId/role — Changer le rôle d'un utilisateur
 */
roles.post('/assign', async (c) => {
  const body = await c.req.json();

  const schema = z.object({
    userId: z.string().min(1, 'userId requis'),
    role: z.enum(ROLES as unknown as [string, ...string[]]),
  });

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return error(c, 'VALIDATION_ERROR', parsed.error.errors[0]?.message ?? 'Données invalides', 400);
  }

  const { userId, role: newRole } = parsed.data;
  const currentUser = c.get('user');
  const db = getDb(c);

  // Cannot change own role
  if (currentUser.id === userId) {
    return error(c, 'CANNOT_CHANGE_OWN_ROLE', 'Vous ne pouvez pas changer votre propre rôle', 400);
  }

  // Check target user exists
  const targetUser = await db
    .prepare('SELECT id, role, first_name, last_name, email FROM users WHERE id = ?')
    .bind(userId)
    .first<{ id: string; role: string; first_name: string; last_name: string; email: string }>();

  if (!targetUser) {
    return error(c, 'USER_NOT_FOUND', 'Utilisateur introuvable', 404);
  }

  // Cannot modify a user who has a protected role (unless setting to same role)
  if (PROTECTED_ROLES.includes(targetUser.role as Role) && targetUser.role !== newRole) {
    return error(
      c,
      'PROTECTED_ROLE',
      `Le rôle "${ROLE_LABELS[targetUser.role as Role]}" est protégé et ne peut pas être modifié`,
      403
    );
  }

  // Update role
  await db
    .prepare('UPDATE users SET role = ?, updated_at = datetime(\'now\') WHERE id = ?')
    .bind(newRole, userId)
    .run();

  return success(c, {
    userId,
    previousRole: targetUser.role,
    newRole,
    message: `Rôle de ${targetUser.first_name} ${targetUser.last_name} changé de "${ROLE_LABELS[targetUser.role as Role]}" à "${ROLE_LABELS[newRole as Role]}"`,
  });
});

/**
 * PUT /roles/:roleId/permissions — Modifier les permissions d'un rôle
 */
roles.put('/:roleId/permissions', async (c) => {
  const roleId = c.req.param('roleId') as Role;
  const currentUser = c.get('user');
  const db = getDb(c);

  if (!ROLES.includes(roleId)) {
    return error(c, 'ROLE_NOT_FOUND', `Rôle "${roleId}" introuvable`, 404);
  }

  const body = await c.req.json();
  const isProtected = PROTECTED_ROLES.includes(roleId);
  const schema = z.object({
    password: isProtected ? z.string().min(1, 'Mot de passe requis') : z.string().optional(),
    permissions: z.array(z.object({
      resource: z.string(),
      action: z.string(),
      is_granted: z.boolean(),
    })),
  });

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return error(c, 'VALIDATION_ERROR', parsed.error.errors[0]?.message ?? 'Données invalides', 400);
  }

  // Verify admin password only for protected roles (ADMIN)
  if (isProtected) {
    const user = await findUserById(db, currentUser.sub);
    if (!user || !user.passwordHash) {
      return error(c, 'USER_NOT_FOUND', 'Utilisateur introuvable', 404);
    }

    const isValidPassword = await verifyPassword(parsed.data.password!, user.passwordHash);
    if (!isValidPassword) {
      await logAudit(db, {
        userId: currentUser.sub,
        action: 'role.permissions.password_failed',
        entityType: 'role',
        entityId: roleId,
        ipAddress: c.req.header('CF-Connecting-IP'),
        userAgent: c.req.header('User-Agent'),
      });
      return error(c, 'INVALID_PASSWORD', 'Mot de passe incorrect', 401);
    }
  }

  const { permissions } = parsed.data;

  // Upsert each permission override
  for (const perm of permissions) {
    await db
      .prepare(
        `INSERT INTO role_permission_overrides (id, role_id, resource, action, is_granted, updated_by, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
         ON CONFLICT(role_id, resource, action) DO UPDATE SET is_granted = ?, updated_by = ?, updated_at = datetime('now')`
      )
      .bind(ulid(), roleId, perm.resource, perm.action, perm.is_granted ? 1 : 0, currentUser?.sub, perm.is_granted ? 1 : 0, currentUser?.sub)
      .run();
  }

  await logAudit(db, {
    userId: currentUser?.sub,
    action: PROTECTED_ROLES.includes(roleId) ? 'role.protected.permissions.updated' : 'role.permissions.updated',
    entityType: 'role',
    entityId: roleId,
    changes: { permissions_count: permissions.length, is_protected: PROTECTED_ROLES.includes(roleId) },
    ipAddress: c.req.header('CF-Connecting-IP'),
    userAgent: c.req.header('User-Agent'),
  });

  return success(c, { roleId, updated: permissions.length });
});

/**
 * POST /roles — Créer un nouveau rôle personnalisé
 */
roles.post('/', async (c) => {
  const currentUser = c.get('user');
  const db = getDb(c);

  const body = await c.req.json();
  const schema = z.object({
    name: z.string().min(2, 'Nom requis (min 2 caractères)'),
    description: z.string().min(1, 'Description requise'),
    duplicateFromId: z.string().optional(),
  });

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return error(c, 'VALIDATION_ERROR', parsed.error.errors[0]?.message ?? 'Données invalides', 400);
  }

  const { name, description, duplicateFromId } = parsed.data;

  // Check unique name
  const existing = await db
    .prepare('SELECT id FROM custom_roles WHERE name = ?')
    .bind(name)
    .first();

  if (existing) {
    return error(c, 'ROLE_NAME_EXISTS', 'Un rôle avec ce nom existe déjà', 409);
  }

  const id = ulid();
  await db
    .prepare(
      `INSERT INTO custom_roles (id, name, description, duplicated_from, created_at, updated_at)
       VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))`
    )
    .bind(id, name, description, duplicateFromId ?? null)
    .run();

  // If duplicating, copy permissions from source role
  if (duplicateFromId && ROLES.includes(duplicateFromId as Role)) {
    const sourcePerms = getPermissions(duplicateFromId as Role);
    for (const [resource, actions] of Object.entries(sourcePerms)) {
      if (!actions) continue;
      for (const action of actions) {
        await db
          .prepare(
            `INSERT INTO role_permission_overrides (id, role_id, resource, action, is_granted, updated_by, created_at, updated_at)
             VALUES (?, ?, ?, ?, 1, ?, datetime('now'), datetime('now'))`
          )
          .bind(ulid(), id, resource, action, currentUser?.sub)
          .run();
      }
    }
  }

  await logAudit(db, {
    userId: currentUser?.sub,
    action: 'role.created',
    entityType: 'role',
    entityId: id,
    changes: { name, duplicated_from: duplicateFromId },
    ipAddress: c.req.header('CF-Connecting-IP'),
    userAgent: c.req.header('User-Agent'),
  });

  return success(c, { id, name, description, duplicatedFrom: duplicateFromId ?? null }, 201);
});

/**
 * PUT /roles/:roleId/statut — Activer/désactiver un rôle
 */
roles.put('/:roleId/statut', async (c) => {
  const roleId = c.req.param('roleId');
  const currentUser = c.get('user');
  const db = getDb(c);

  if (PROTECTED_ROLES.includes(roleId as Role)) {
    return error(c, 'PROTECTED_ROLE', 'Ce rôle est protégé et ne peut pas être désactivé', 403);
  }

  const body = await c.req.json();
  const schema = z.object({
    isActive: z.boolean(),
  });

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return error(c, 'VALIDATION_ERROR', 'isActive requis', 400);
  }

  const { isActive } = parsed.data;

  // Count active users with this role
  const countResult = await db
    .prepare('SELECT COUNT(*) as count FROM users WHERE role = ? AND is_active = 1')
    .bind(roleId)
    .first<{ count: number }>();
  const usersCount = countResult?.count ?? 0;

  await logAudit(db, {
    userId: currentUser?.sub,
    action: 'role.statut.changed',
    entityType: 'role',
    entityId: roleId,
    changes: { isActive, usersCount },
    ipAddress: c.req.header('CF-Connecting-IP'),
    userAgent: c.req.header('User-Agent'),
  });

  return success(c, { roleId, isActive, usersCount });
});

/**
 * DELETE /roles/:roleId — Supprimer un rôle (sauf ADMIN)
 */
roles.delete('/:roleId', async (c) => {
  const roleId = c.req.param('roleId') as Role;
  const currentUser = c.get('user');
  const db = getDb(c);

  if (PROTECTED_ROLES.includes(roleId)) {
    return error(c, 'PROTECTED_ROLE', 'Ce rôle est protégé et ne peut pas être supprimé', 403);
  }

  // Check how many active users have this role
  const countResult = await db
    .prepare('SELECT COUNT(*) as count FROM users WHERE role = ? AND is_active = 1')
    .bind(roleId)
    .first<{ count: number }>();
  const usersCount = countResult?.count ?? 0;

  if (usersCount > 0) {
    return error(
      c,
      'ROLE_HAS_USERS',
      `Impossible de supprimer ce rôle : ${usersCount} utilisateur(s) actif(s) y sont encore assignés. Réassignez-les d'abord.`,
      400
    );
  }

  // Delete permission overrides for this role
  try {
    await db
      .prepare('DELETE FROM role_permission_overrides WHERE role_id = ?')
      .bind(roleId)
      .run();
  } catch {
    // Table may not exist
  }

  // Delete custom role if it exists
  try {
    await db
      .prepare('DELETE FROM custom_roles WHERE id = ?')
      .bind(roleId)
      .run();
  } catch {
    // Table may not exist
  }

  await logAudit(db, {
    userId: currentUser?.sub,
    action: 'role.deleted',
    entityType: 'role',
    entityId: roleId,
    changes: { label: ROLE_LABELS[roleId] ?? roleId },
    ipAddress: c.req.header('CF-Connecting-IP'),
    userAgent: c.req.header('User-Agent'),
  });

  return success(c, { roleId, deleted: true });
});

export { roles };
