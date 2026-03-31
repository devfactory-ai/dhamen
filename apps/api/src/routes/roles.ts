import { Hono } from 'hono';
import { z } from 'zod';
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
import { success, error } from '../lib/response';
import { getDb } from '../lib/db';
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

  // Count users per role
  const userCounts = await db
    .prepare('SELECT role, COUNT(*) as count FROM users WHERE is_active = 1 GROUP BY role')
    .all<{ role: string; count: number }>();
  const countMap: Record<string, number> = {};
  for (const row of userCounts.results ?? []) {
    countMap[row.role] = row.count;
  }

  const rolesList = ROLES.map((role) => {
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
      userCount: countMap[role] ?? 0,
      permissionsSummary: {
        resources: resourceCount,
        totalActions: actionCount,
      },
    };
  });

  return success(c, {
    roles: rolesList,
    resources: RESOURCES.map((r) => ({ id: r, label: RESOURCE_LABELS[r] })),
    actions: ACTIONS.map((a) => ({ id: a, label: ACTION_LABELS[a] })),
  });
});

/**
 * GET /roles/:roleId/permissions — Permissions détaillées d'un rôle
 */
roles.get('/:roleId/permissions', (c) => {
  const roleId = c.req.param('roleId') as Role;

  if (!ROLES.includes(roleId)) {
    return error(c, 'ROLE_NOT_FOUND', `Rôle "${roleId}" introuvable`, 404);
  }

  const permissions = getPermissions(roleId);

  // Build a complete matrix: resource -> action -> boolean
  const matrix: Record<string, Record<string, boolean>> = {};
  for (const resource of RESOURCES) {
    matrix[resource] = {};
    for (const action of ACTIONS) {
      const resourceActions = permissions[resource];
      matrix[resource][action] = resourceActions ? resourceActions.includes(action) : false;
    }
  }

  return success(c, {
    role: {
      id: roleId,
      label: ROLE_LABELS[roleId],
      description: ROLE_DESCRIPTIONS[roleId],
      isProtected: PROTECTED_ROLES.includes(roleId),
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

export { roles };
