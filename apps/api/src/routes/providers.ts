import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import {
  providerCreateSchema,
  providerUpdateSchema,
  providerFiltersSchema,
  paginationSchema,
} from '@dhamen/shared';
import {
  findProviderById,
  findProviderByLicense,
  listProviders,
  createProvider,
  updateProvider,
  softDeleteProvider,
} from '@dhamen/db';
import type { Bindings, Variables } from '../types';
import { authMiddleware, requireRole } from '../middleware/auth';
import { generateId } from '../lib/ulid';
import { success, created, notFound, conflict, noContent, paginated } from '../lib/response';
import { logAudit } from '../middleware/audit-trail';

const providers = new Hono<{ Bindings: Bindings; Variables: Variables }>();

// Apply auth middleware to all routes
providers.use('*', authMiddleware());

/**
 * GET /api/v1/providers
 * List providers with filters and pagination
 */
providers.get(
  '/',
  requireRole('ADMIN', 'INSURER_ADMIN', 'INSURER_AGENT'),
  zValidator('query', providerFiltersSchema.merge(paginationSchema)),
  async (c) => {
    const { type, city, isActive, search, page, limit } = c.req.valid('query');

    const { data, total } = await listProviders(c.env.DB, {
      type,
      city,
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
 * GET /api/v1/providers/:id
 * Get a provider by ID
 */
providers.get('/:id', requireRole('ADMIN', 'INSURER_ADMIN', 'INSURER_AGENT'), async (c) => {
  const id = c.req.param('id');
  const provider = await findProviderById(c.env.DB, id);

  if (!provider) {
    return notFound(c, 'Prestataire non trouvé');
  }

  return success(c, provider);
});

/**
 * POST /api/v1/providers
 * Create a new provider
 */
providers.post(
  '/',
  requireRole('ADMIN', 'INSURER_ADMIN'),
  zValidator('json', providerCreateSchema),
  async (c) => {
    const data = c.req.valid('json');
    const user = c.get('user');

    // Check if license number already exists
    const existing = await findProviderByLicense(c.env.DB, data.licenseNo);
    if (existing) {
      return conflict(c, 'Un prestataire avec ce numéro de licence existe déjà');
    }

    const id = generateId();
    const provider = await createProvider(c.env.DB, id, data);

    // Audit log
    await logAudit(c.env.DB, {
      userId: user?.sub,
      action: 'provider.create',
      entityType: 'provider',
      entityId: id,
      changes: data,
      ipAddress: c.req.header('CF-Connecting-IP'),
      userAgent: c.req.header('User-Agent'),
    });

    return created(c, provider);
  }
);

/**
 * PUT /api/v1/providers/:id
 * Update a provider
 */
providers.put(
  '/:id',
  requireRole('ADMIN', 'INSURER_ADMIN'),
  zValidator('json', providerUpdateSchema),
  async (c) => {
    const id = c.req.param('id');
    const data = c.req.valid('json');
    const user = c.get('user');

    const provider = await updateProvider(c.env.DB, id, data);

    if (!provider) {
      return notFound(c, 'Prestataire non trouvé');
    }

    // Audit log
    await logAudit(c.env.DB, {
      userId: user?.sub,
      action: 'provider.update',
      entityType: 'provider',
      entityId: id,
      changes: data,
      ipAddress: c.req.header('CF-Connecting-IP'),
      userAgent: c.req.header('User-Agent'),
    });

    return success(c, provider);
  }
);

/**
 * DELETE /api/v1/providers/:id
 * Soft delete a provider
 */
providers.delete('/:id', requireRole('ADMIN'), async (c) => {
  const id = c.req.param('id');
  const user = c.get('user');

  const deleted = await softDeleteProvider(c.env.DB, id);

  if (!deleted) {
    return notFound(c, 'Prestataire non trouvé');
  }

  // Audit log
  await logAudit(c.env.DB, {
    userId: user?.sub,
    action: 'provider.delete',
    entityType: 'provider',
    entityId: id,
    ipAddress: c.req.header('CF-Connecting-IP'),
    userAgent: c.req.header('User-Agent'),
  });

  return noContent(c);
});

export { providers };
