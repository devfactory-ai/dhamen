import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import {
  adherentCreateSchema,
  adherentUpdateSchema,
  adherentFiltersSchema,
  paginationSchema,
} from '@dhamen/shared';
import {
  findAdherentById,
  listAdherents,
  createAdherent,
  updateAdherent,
  softDeleteAdherent,
} from '@dhamen/db';
import type { Bindings, Variables } from '../types';
import { authMiddleware, requireRole } from '../middleware/auth';
import { generateId } from '../lib/ulid';
import { success, created, notFound, noContent, paginated } from '../lib/response';
import { logAudit } from '../middleware/audit-trail';

const adherents = new Hono<{ Bindings: Bindings; Variables: Variables }>();

// Apply auth middleware to all routes
adherents.use('*', authMiddleware());

/**
 * GET /api/v1/adherents
 * List adherents with filters and pagination
 */
adherents.get(
  '/',
  requireRole('ADMIN', 'INSURER_ADMIN', 'INSURER_AGENT'),
  zValidator('query', adherentFiltersSchema.merge(paginationSchema)),
  async (c) => {
    const { city, search, page, limit } = c.req.valid('query');

    const { data, total } = await listAdherents(c.env.DB, {
      city,
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
 * GET /api/v1/adherents/:id
 * Get an adherent by ID
 */
adherents.get(
  '/:id',
  requireRole('ADMIN', 'INSURER_ADMIN', 'INSURER_AGENT', 'PHARMACIST', 'DOCTOR', 'LAB_MANAGER', 'CLINIC_ADMIN'),
  async (c) => {
    const id = c.req.param('id');
    const adherent = await findAdherentById(c.env.DB, id);

    if (!adherent) {
      return notFound(c, 'Adhérent non trouvé');
    }

    return success(c, adherent);
  }
);

/**
 * POST /api/v1/adherents
 * Create a new adherent
 */
adherents.post(
  '/',
  requireRole('ADMIN', 'INSURER_ADMIN', 'INSURER_AGENT'),
  zValidator('json', adherentCreateSchema),
  async (c) => {
    const data = c.req.valid('json');
    const user = c.get('user');

    // In production, encrypt sensitive data
    // For now, we use a simple prefix to simulate encryption
    const encryptedNationalId = `ENC_${data.nationalId}`;
    const encryptedPhone = data.phone ? `ENC_${data.phone}` : undefined;

    const id = generateId();
    const adherent = await createAdherent(c.env.DB, id, data, encryptedNationalId, encryptedPhone);

    // Audit log (without sensitive data)
    await logAudit(c.env.DB, {
      userId: user?.sub,
      action: 'adherent.create',
      entityType: 'adherent',
      entityId: id,
      changes: {
        firstName: data.firstName,
        lastName: data.lastName,
        city: data.city,
      },
      ipAddress: c.req.header('CF-Connecting-IP'),
      userAgent: c.req.header('User-Agent'),
    });

    return created(c, adherent);
  }
);

/**
 * PUT /api/v1/adherents/:id
 * Update an adherent
 */
adherents.put(
  '/:id',
  requireRole('ADMIN', 'INSURER_ADMIN', 'INSURER_AGENT'),
  zValidator('json', adherentUpdateSchema),
  async (c) => {
    const id = c.req.param('id');
    const data = c.req.valid('json');
    const user = c.get('user');

    // Encrypt phone if provided
    const encryptedPhone = data.phone ? `ENC_${data.phone}` : undefined;

    const adherent = await updateAdherent(c.env.DB, id, data, encryptedPhone);

    if (!adherent) {
      return notFound(c, 'Adhérent non trouvé');
    }

    // Audit log
    await logAudit(c.env.DB, {
      userId: user?.sub,
      action: 'adherent.update',
      entityType: 'adherent',
      entityId: id,
      changes: {
        firstName: data.firstName,
        lastName: data.lastName,
        city: data.city,
      },
      ipAddress: c.req.header('CF-Connecting-IP'),
      userAgent: c.req.header('User-Agent'),
    });

    return success(c, adherent);
  }
);

/**
 * DELETE /api/v1/adherents/:id
 * Soft delete an adherent
 */
adherents.delete('/:id', requireRole('ADMIN'), async (c) => {
  const id = c.req.param('id');
  const user = c.get('user');

  const deleted = await softDeleteAdherent(c.env.DB, id);

  if (!deleted) {
    return notFound(c, 'Adhérent non trouvé');
  }

  // Audit log
  await logAudit(c.env.DB, {
    userId: user?.sub,
    action: 'adherent.delete',
    entityType: 'adherent',
    entityId: id,
    ipAddress: c.req.header('CF-Connecting-IP'),
    userAgent: c.req.header('User-Agent'),
  });

  return noContent(c);
});

export { adherents };
