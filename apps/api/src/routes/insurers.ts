import {
  createInsurer,
  findInsurerByCode,
  findInsurerById,
  listInsurers,
  softDeleteInsurer,
  updateInsurer,
} from '@dhamen/db';
import {
  insurerCreateSchema,
  insurerFiltersSchema,
  insurerUpdateSchema,
  paginationSchema,
} from '@dhamen/shared';
import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import { conflict, created, noContent, notFound, paginated, success } from '../lib/response';
import { generateId } from '../lib/ulid';
import { logAudit } from '../middleware/audit-trail';
import { authMiddleware, requireRole } from '../middleware/auth';
import type { Bindings, Variables } from '../types';
import { getDb } from '../lib/db';

const insurers = new Hono<{ Bindings: Bindings; Variables: Variables }>();

// Apply auth middleware to all routes
insurers.use('*', authMiddleware());

/**
 * GET /api/v1/insurers
 * List insurers with filters and pagination
 */
insurers.get(
  '/',
  requireRole('ADMIN'),
  zValidator('query', insurerFiltersSchema.merge(paginationSchema)),
  async (c) => {
    const { isActive, search, page, limit } = c.req.valid('query');

    const { data, total } = await listInsurers(getDb(c), {
      isActive,
      search,
      page,
      limit,
    });

    return paginated(c, data, {
      page: page ?? 1,
      limit: limit ?? 20,
      total,
      totalPages: Math.ceil(total / (limit ?? 20)),
    });
  }
);

/**
 * GET /api/v1/insurers/:id
 * Get an insurer by ID
 */
insurers.get('/:id', requireRole('ADMIN', 'INSURER_ADMIN'), async (c) => {
  const id = c.req.param('id');
  const user = c.get('user');

  // Insurer admin can only view their own insurer
  if (user?.role === 'INSURER_ADMIN' && user.insurerId !== id) {
    return notFound(c, 'Assureur non trouvé');
  }

  const insurer = await findInsurerById(getDb(c), id);

  if (!insurer) {
    return notFound(c, 'Assureur non trouvé');
  }

  return success(c, insurer);
});

/**
 * POST /api/v1/insurers
 * Create a new insurer
 */
insurers.post('/', requireRole('ADMIN'), zValidator('json', insurerCreateSchema), async (c) => {
  const data = c.req.valid('json');
  const user = c.get('user');

  // Check if code already exists
  const existing = await findInsurerByCode(getDb(c), data.code);
  if (existing) {
    return conflict(c, 'Un assureur avec ce code existe déjà');
  }

  const id = generateId();
  const insurer = await createInsurer(getDb(c), id, data);

  // Audit log
  await logAudit(getDb(c), {
    userId: user?.sub,
    action: 'insurer.create',
    entityType: 'insurer',
    entityId: id,
    changes: {
      name: data.name,
      code: data.code,
    },
    ipAddress: c.req.header('CF-Connecting-IP'),
    userAgent: c.req.header('User-Agent'),
  });

  return created(c, insurer);
});

/**
 * PUT /api/v1/insurers/:id
 * Update an insurer
 */
insurers.put(
  '/:id',
  requireRole('ADMIN', 'INSURER_ADMIN'),
  zValidator('json', insurerUpdateSchema),
  async (c) => {
    const id = c.req.param('id');
    const data = c.req.valid('json');
    const user = c.get('user');

    // Insurer admin can only update their own insurer
    if (user?.role === 'INSURER_ADMIN' && user.insurerId !== id) {
      return notFound(c, 'Assureur non trouvé');
    }

    const insurer = await updateInsurer(getDb(c), id, data);

    if (!insurer) {
      return notFound(c, 'Assureur non trouvé');
    }

    // Audit log
    await logAudit(getDb(c), {
      userId: user?.sub,
      action: 'insurer.update',
      entityType: 'insurer',
      entityId: id,
      changes: data,
      ipAddress: c.req.header('CF-Connecting-IP'),
      userAgent: c.req.header('User-Agent'),
    });

    return success(c, insurer);
  }
);

/**
 * DELETE /api/v1/insurers/:id
 * Soft delete an insurer
 */
insurers.delete('/:id', requireRole('ADMIN'), async (c) => {
  const id = c.req.param('id');
  const user = c.get('user');

  const deleted = await softDeleteInsurer(getDb(c), id);

  if (!deleted) {
    return notFound(c, 'Assureur non trouvé');
  }

  // Audit log
  await logAudit(getDb(c), {
    userId: user?.sub,
    action: 'insurer.delete',
    entityType: 'insurer',
    entityId: id,
    ipAddress: c.req.header('CF-Connecting-IP'),
    userAgent: c.req.header('User-Agent'),
  });

  return noContent(c);
});

export { insurers };
