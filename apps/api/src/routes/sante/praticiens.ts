/**
 * SoinFlow Praticiens routes
 */
import {
  createPraticien,
  findPraticienById,
  listPraticiens,
  listConventionnesByVille,
  listVillesAvecPraticiens,
  updatePraticien,
  softDeletePraticien,
} from '@dhamen/db';
import {
  santePraticienCreateSchema,
  santePraticienUpdateSchema,
  santePraticienFiltersSchema,
  paginationSchema,
} from '@dhamen/shared';
import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import { created, noContent, notFound, paginated, success } from '../../lib/response';
import { generateId } from '../../lib/ulid';
import { logAudit } from '../../middleware/audit-trail';
import { authMiddleware, requireRole } from '../../middleware/auth';
import type { Bindings, Variables } from '../../types';
import { getDb } from '../../lib/db';

const praticiens = new Hono<{ Bindings: Bindings; Variables: Variables }>();

// Apply auth middleware to all routes
praticiens.use('*', authMiddleware());

/**
 * GET /api/v1/sante/praticiens
 * List praticiens with filters and pagination
 */
praticiens.get(
  '/',
  requireRole('SOIN_GESTIONNAIRE', 'SOIN_AGENT', 'PRATICIEN', 'ADHERENT', 'ADMIN', 'INSURER_ADMIN', 'INSURER_AGENT'),
  zValidator('query', santePraticienFiltersSchema.merge(paginationSchema)),
  async (c) => {
    const filters = c.req.valid('query');

    const { data, total } = await listPraticiens(getDb(c), {
      ...filters,
      page: filters.page ?? 1,
      limit: filters.limit ?? 20,
    });

    return paginated(c, data, {
      page: filters.page ?? 1,
      limit: filters.limit ?? 20,
      total,
      totalPages: Math.ceil(total / (filters.limit ?? 20)),
    });
  }
);

/**
 * GET /api/v1/sante/praticiens/specialites
 * List distinct specialites
 */
praticiens.get(
  '/specialites',
  requireRole('SOIN_GESTIONNAIRE', 'SOIN_AGENT', 'PRATICIEN', 'ADHERENT', 'ADMIN', 'INSURER_ADMIN', 'INSURER_AGENT'),
  async (c) => {
    const { results } = await getDb(c).prepare(`
      SELECT DISTINCT specialite
      FROM sante_praticiens
      WHERE deleted_at IS NULL AND est_actif = 1
      ORDER BY specialite
    `).all<{ specialite: string }>();

    return success(c, results.map((r) => r.specialite));
  }
);

/**
 * GET /api/v1/sante/praticiens/villes
 * List cities with practitioners
 */
praticiens.get(
  '/villes',
  requireRole('SOIN_GESTIONNAIRE', 'SOIN_AGENT', 'PRATICIEN', 'ADHERENT', 'ADMIN', 'INSURER_ADMIN', 'INSURER_AGENT'),
  async (c) => {
    const villes = await listVillesAvecPraticiens(getDb(c));
    return success(c, villes);
  }
);

/**
 * GET /api/v1/sante/praticiens/conventionnes/:ville
 * List conventionné practitioners by city
 */
praticiens.get(
  '/conventionnes/:ville',
  requireRole('SOIN_GESTIONNAIRE', 'SOIN_AGENT', 'PRATICIEN', 'ADHERENT', 'ADMIN', 'INSURER_ADMIN', 'INSURER_AGENT'),
  async (c) => {
    const ville = c.req.param('ville');
    const data = await listConventionnesByVille(getDb(c), ville);
    return success(c, data);
  }
);

/**
 * GET /api/v1/sante/praticiens/:id
 * Get a praticien by ID
 */
praticiens.get(
  '/:id',
  requireRole('SOIN_GESTIONNAIRE', 'SOIN_AGENT', 'PRATICIEN', 'ADHERENT', 'ADMIN', 'INSURER_ADMIN', 'INSURER_AGENT'),
  async (c) => {
    const id = c.req.param('id');
    const praticien = await findPraticienById(getDb(c), id);

    if (!praticien) {
      return notFound(c, 'Praticien non trouvé');
    }

    return success(c, praticien);
  }
);

/**
 * POST /api/v1/sante/praticiens
 * Create a new praticien
 */
praticiens.post(
  '/',
  requireRole('SOIN_GESTIONNAIRE', 'ADMIN'),
  zValidator('json', santePraticienCreateSchema),
  async (c) => {
    const data = c.req.valid('json');
    const user = c.get('user');

    const id = generateId();
    const praticien = await createPraticien(getDb(c), id, data);

    await logAudit(getDb(c), {
      userId: user.sub,
      action: 'sante_praticiens.create',
      entityType: 'sante_praticiens',
      entityId: id,
      changes: { nom: data.nom, typePraticien: data.typePraticien },
    });

    return created(c, praticien);
  }
);

/**
 * PATCH /api/v1/sante/praticiens/:id
 * Update a praticien
 */
praticiens.patch(
  '/:id',
  requireRole('SOIN_GESTIONNAIRE', 'ADMIN'),
  zValidator('json', santePraticienUpdateSchema),
  async (c) => {
    const id = c.req.param('id');
    const data = c.req.valid('json');
    const user = c.get('user');

    const praticien = await updatePraticien(getDb(c), id, data);

    if (!praticien) {
      return notFound(c, 'Praticien non trouvé');
    }

    await logAudit(getDb(c), {
      userId: user.sub,
      action: 'sante_praticiens.update',
      entityType: 'sante_praticiens',
      entityId: id,
      changes: { updatedFields: Object.keys(data) },
    });

    return success(c, praticien);
  }
);

/**
 * DELETE /api/v1/sante/praticiens/:id
 * Soft delete a praticien
 */
praticiens.delete(
  '/:id',
  requireRole('SOIN_GESTIONNAIRE', 'ADMIN'),
  async (c) => {
    const id = c.req.param('id');
    const user = c.get('user');

    const deleted = await softDeletePraticien(getDb(c), id);

    if (!deleted) {
      return notFound(c, 'Praticien non trouvé');
    }

    await logAudit(getDb(c), {
      userId: user.sub,
      action: 'sante_praticiens.delete',
      entityType: 'sante_praticiens',
      entityId: id,
    });

    return noContent(c);
  }
);

export { praticiens };
