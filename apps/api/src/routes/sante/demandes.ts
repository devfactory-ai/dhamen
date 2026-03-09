/**
 * SoinFlow Demandes routes
 */
import {
  createSanteDemande,
  findSanteDemandeAvecDetails,
  findSanteDemandeById,
  listSanteDemandesAvecNoms,
  updateSanteDemandeStatut,
  updateSanteDemandeBrouillon,
  getSanteDemandesStats,
} from '@dhamen/db';
import {
  santeDemandeCreateSchema,
  santeDemandeSubmitSchema,
  santeDemandeUpdateStatutSchema,
  santeDemandeFiltersSchema,
  paginationSchema,
} from '@dhamen/shared';
import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import { created, notFound, paginated, success, forbidden, badRequest } from '../../lib/response';
import { generateId } from '../../lib/ulid';
import { logAudit } from '../../middleware/audit-trail';
import { authMiddleware, requireRole } from '../../middleware/auth';
import type { Bindings, Variables } from '../../types';
import { getDb } from '../../lib/db';

const demandes = new Hono<{ Bindings: Bindings; Variables: Variables }>();

// Apply auth middleware to all routes
demandes.use('*', authMiddleware());

/**
 * GET /api/v1/sante/demandes
 * List demandes with filters and pagination
 */
demandes.get(
  '/',
  requireRole('SOIN_GESTIONNAIRE', 'SOIN_AGENT', 'ADMIN'),
  zValidator('query', santeDemandeFiltersSchema.merge(paginationSchema)),
  async (c) => {
    const filters = c.req.valid('query');

    const { data, total } = await listSanteDemandesAvecNoms(getDb(c), {
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
 * GET /api/v1/sante/demandes/mes-demandes
 * List current user's demandes (for adherents)
 */
demandes.get(
  '/mes-demandes',
  requireRole('ADHERENT'),
  zValidator('query', santeDemandeFiltersSchema.merge(paginationSchema)),
  async (c) => {
    const user = c.get('user');
    const filters = c.req.valid('query');

    // Get adherent's demandes only
    const { data, total } = await listSanteDemandesAvecNoms(getDb(c), {
      ...filters,
      adherentId: user.sub, // User sub is the adherent ID for mobile users
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
 * GET /api/v1/sante/demandes/praticien
 * List praticien's demandes
 */
demandes.get(
  '/praticien',
  requireRole('PRATICIEN'),
  zValidator('query', santeDemandeFiltersSchema.merge(paginationSchema)),
  async (c) => {
    const user = c.get('user');
    const filters = c.req.valid('query');

    // Get praticien's demandes only (via providerId)
    const { data, total } = await listSanteDemandesAvecNoms(getDb(c), {
      ...filters,
      praticienId: user.providerId ?? undefined,
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
 * GET /api/v1/sante/demandes/stats
 * Get demandes statistics
 */
demandes.get(
  '/stats',
  requireRole('SOIN_GESTIONNAIRE', 'ADMIN'),
  async (c) => {
    const stats = await getSanteDemandesStats(getDb(c));
    return success(c, stats);
  }
);

/**
 * GET /api/v1/sante/demandes/:id
 * Get a demande by ID with details
 */
demandes.get(
  '/:id',
  requireRole('SOIN_GESTIONNAIRE', 'SOIN_AGENT', 'PRATICIEN', 'ADHERENT', 'ADMIN'),
  async (c) => {
    const id = c.req.param('id');
    const user = c.get('user');
    const demande = await findSanteDemandeAvecDetails(getDb(c), id);

    if (!demande) {
      return notFound(c, 'Demande non trouvée');
    }

    // Check access rights
    if (user.role === 'ADHERENT' && demande.adherentId !== user.sub) {
      return forbidden(c, 'Accès non autorisé à cette demande');
    }
    if (user.role === 'PRATICIEN' && demande.praticienId !== user.providerId) {
      return forbidden(c, 'Accès non autorisé à cette demande');
    }

    return success(c, demande);
  }
);

/**
 * POST /api/v1/sante/demandes
 * Create a new demande (adherent workflow - paper upload)
 */
demandes.post(
  '/',
  requireRole('ADHERENT', 'SOIN_AGENT', 'ADMIN'),
  zValidator('json', santeDemandeCreateSchema),
  async (c) => {
    const data = c.req.valid('json');
    const user = c.get('user');

    // For ADHERENT role, enforce their own ID
    const adherentId = user.role === 'ADHERENT' ? user.sub : data.adherentId;

    const id = generateId();
    const demande = await createSanteDemande(getDb(c), id, {
      ...data,
      adherentId,
      source: 'adherent',
    });

    await logAudit(getDb(c), {
      userId: user.sub,
      action: 'sante_demandes.create',
      entityType: 'sante_demandes',
      entityId: id,
      changes: { typeSoin: data.typeSoin, montant: data.montantDemande },
    });

    return created(c, demande);
  }
);

/**
 * PATCH /api/v1/sante/demandes/:id
 * Finalize a brouillon demande (adherent submits after OCR review)
 */
demandes.patch(
  '/:id',
  requireRole('ADHERENT'),
  zValidator('json', santeDemandeSubmitSchema),
  async (c) => {
    const id = c.req.param('id');
    const data = c.req.valid('json');
    const user = c.get('user');

    // Verify the demande exists and belongs to this adherent
    const existing = await findSanteDemandeById(getDb(c), id);
    if (!existing) {
      return notFound(c, 'Demande non trouvée');
    }

    if (existing.adherentId !== user.sub) {
      return forbidden(c, 'Accès non autorisé à cette demande');
    }

    if (existing.statut !== 'brouillon') {
      return badRequest(c, 'Seule une demande en brouillon peut être soumise via cette route');
    }

    try {
      const demande = await updateSanteDemandeBrouillon(getDb(c), id, {
        montantDemande: data.montantDemande,
        dateSoin: data.dateSoin,
        typeSoin: data.typeSoin,
        praticienId: data.praticienId,
        notes: data.notes,
      });

      if (!demande) {
        return notFound(c, 'Demande non trouvée');
      }

      await logAudit(getDb(c), {
        userId: user.sub,
        action: 'sante_demandes.submit',
        entityType: 'sante_demandes',
        entityId: id,
        changes: {
          previousStatut: 'brouillon',
          newStatut: 'soumise',
          montantDemande: data.montantDemande,
          typeSoin: data.typeSoin,
        },
      });

      return success(c, demande);
    } catch (error) {
      if (error instanceof Error && error.message === 'DEMANDE_NOT_BROUILLON') {
        return badRequest(c, 'Seule une demande en brouillon peut être soumise via cette route');
      }
      throw error;
    }
  }
);

/**
 * PATCH /api/v1/sante/demandes/:id/statut
 * Update demande status (gestionnaire workflow)
 */
demandes.patch(
  '/:id/statut',
  requireRole('SOIN_GESTIONNAIRE', 'SOIN_AGENT', 'ADMIN'),
  zValidator('json', santeDemandeUpdateStatutSchema),
  async (c) => {
    const id = c.req.param('id');
    const data = c.req.valid('json');
    const user = c.get('user');

    // Validate role permissions for certain status changes
    if (
      ['approuvee', 'rejetee', 'en_paiement'].includes(data.statut) &&
      user.role === 'SOIN_AGENT'
    ) {
      return forbidden(c, 'Vous n\'avez pas les droits pour effectuer cette action');
    }

    const demande = await updateSanteDemandeStatut(getDb(c), id, data.statut, {
      montantRembourse: data.montantRembourse,
      motifRejet: data.motifRejet,
      notesInternes: data.notesInternes,
      traitePar: user.sub,
    });

    if (!demande) {
      return notFound(c, 'Demande non trouvée');
    }

    await logAudit(getDb(c), {
      userId: user.sub,
      action: 'sante_demandes.update',
      entityType: 'sante_demandes',
      entityId: id,
      changes: { newStatut: data.statut },
    });

    return success(c, demande);
  }
);

export { demandes };
