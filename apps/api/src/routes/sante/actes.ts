/**
 * SoinFlow Actes Praticiens routes - Workflow digital tiers-payant
 */
import {
  createActe,
  findActeById,
  findActeAvecDetails,
  listActes,
  updateActeStatut,
  getActesStatsByPraticien,
  findPraticienById,
  findAdherentById,
  getPlafondConsomme,
  recordConsommation,
  createSanteDemande,
} from '@dhamen/db';
import {
  santeActeCreateSchema,
  santeActeUpdateStatutSchema,
  santeActeFiltersSchema,
  paginationSchema,
} from '@dhamen/shared';
import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import { z } from 'zod';
import { created, notFound, success, forbidden, badRequest, paginated } from '../../lib/response';
import { generateId } from '../../lib/ulid';
import { logAudit } from '../../middleware/audit-trail';
import { authMiddleware, requireRole } from '../../middleware/auth';
import type { Bindings, Variables } from '../../types';
import { getDb } from '../../lib/db';

const actes = new Hono<{ Bindings: Bindings; Variables: Variables }>();

// Apply auth middleware to all routes
actes.use('*', authMiddleware());

/**
 * GET /api/v1/sante/actes
 * List actes (gestionnaire view)
 */
actes.get(
  '/',
  requireRole('SOIN_GESTIONNAIRE', 'SOIN_AGENT', 'ADMIN'),
  zValidator('query', santeActeFiltersSchema.merge(paginationSchema)),
  async (c) => {
    const filters = c.req.valid('query');

    const { data, total } = await listActes(getDb(c), {
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
 * GET /api/v1/sante/actes/mes-actes
 * List praticien's own actes
 */
actes.get(
  '/mes-actes',
  requireRole('PRATICIEN'),
  zValidator('query', santeActeFiltersSchema.merge(paginationSchema)),
  async (c) => {
    const user = c.get('user');
    const filters = c.req.valid('query');

    if (!user.providerId) {
      return forbidden(c, 'Praticien non associé');
    }

    const { data, total } = await listActes(getDb(c), {
      ...filters,
      praticienId: user.providerId,
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
 * GET /api/v1/sante/actes/stats
 * Get praticien's actes statistics
 */
actes.get(
  '/stats',
  requireRole('PRATICIEN'),
  zValidator('query', z.object({
    dateDebut: z.string().optional(),
    dateFin: z.string().optional(),
  })),
  async (c) => {
    const user = c.get('user');
    const { dateDebut, dateFin } = c.req.valid('query');

    if (!user.providerId) {
      return forbidden(c, 'Praticien non associé');
    }

    const stats = await getActesStatsByPraticien(getDb(c), user.providerId, {
      dateDebut,
      dateFin,
    });

    return success(c, stats);
  }
);

/**
 * GET /api/v1/sante/actes/:id
 * Get acte details
 */
actes.get(
  '/:id',
  requireRole('SOIN_GESTIONNAIRE', 'SOIN_AGENT', 'PRATICIEN', 'ADHERENT', 'ADMIN'),
  async (c) => {
    const id = c.req.param('id');
    const user = c.get('user');

    const acte = await findActeAvecDetails(getDb(c), id);
    if (!acte) {
      return notFound(c, 'Acte non trouvé');
    }

    // Check access rights
    if (user.role === 'ADHERENT' && acte.adherentId !== user.sub) {
      return forbidden(c, 'Accès non autorisé');
    }
    if (user.role === 'PRATICIEN' && acte.praticienId !== user.providerId) {
      return forbidden(c, 'Accès non autorisé');
    }

    return success(c, acte);
  }
);

/**
 * POST /api/v1/sante/actes
 * Create a new acte (praticien digital workflow)
 * This initiates the tiers-payant process
 */
actes.post(
  '/',
  requireRole('PRATICIEN'),
  zValidator('json', santeActeCreateSchema),
  async (c) => {
    const data = c.req.valid('json');
    const user = c.get('user');

    if (!user.providerId) {
      return forbidden(c, 'Praticien non associé');
    }

    // Verify praticien exists and is active
    const praticien = await findPraticienById(getDb(c), user.providerId);
    if (!praticien) {
      return notFound(c, 'Praticien non trouvé');
    }
    if (!praticien.isActive) {
      return forbidden(c, 'Praticien inactif');
    }

    // Verify adherent exists and has coverage
    const adherent = await findAdherentById(getDb(c), data.adherentId);
    if (!adherent) {
      return notFound(c, 'Adhérent non trouvé');
    }

    // Check plafond disponible (simplified - full eligibility check in future sprint)
    const currentYear = new Date().getFullYear();
    const plafondConsomme = await getPlafondConsomme(getDb(c), data.adherentId, 'global', currentYear);
    // For now, just validate adherent exists - full formule check will be added later

    // Create acte
    const praticienId = user.providerId!; // Already checked above
    const today = new Date().toISOString().split('T')[0];
    const id = generateId();
    const acte = await createActe(getDb(c), id, {
      praticienId,
      adherentId: data.adherentId,
      codeActe: data.codeActe,
      libelleActe: data.libelleActe,
      montantActe: data.montantActe,
      tauxCouverture: data.tauxCouverture,
      montantCouvert: data.montantCouvert,
      montantPatient: data.montantPatient,
      dateActe: (data.dateActe ?? today) as string,
      qrCodeAdherent: data.qrCodeAdherent,
    });

    await logAudit(getDb(c), {
      userId: user.sub,
      action: 'sante_actes.create',
      entityType: 'sante_actes_praticiens',
      entityId: id,
      changes: {
        adherentId: data.adherentId,
        codeActe: data.codeActe,
        montant: data.montantActe,
      },
    });

    return created(c, acte);
  }
);

/**
 * POST /api/v1/sante/actes/:id/signer
 * Adherent signs the acte (validates the tiers-payant request)
 */
actes.post(
  '/:id/signer',
  requireRole('ADHERENT'),
  async (c) => {
    const id = c.req.param('id');
    const user = c.get('user');

    const acte = await findActeById(getDb(c), id);
    if (!acte) {
      return notFound(c, 'Acte non trouvé');
    }

    // Verify adherent owns this acte
    if (acte.adherentId !== user.sub) {
      return forbidden(c, 'Acte non autorisé');
    }

    // Check status - can only sign if 'cree'
    if (acte.statut !== 'cree') {
      return badRequest(c, `Impossible de signer un acte en statut "${acte.statut}"`);
    }

    // Update status with signature
    const updated = await updateActeStatut(getDb(c), id, 'valide_adherent', {
      signatureAdherent: true,
    });

    await logAudit(getDb(c), {
      userId: user.sub,
      action: 'sante_actes.sign',
      entityType: 'sante_actes_praticiens',
      entityId: id,
      changes: { signedAt: new Date().toISOString() },
    });

    return success(c, updated);
  }
);

/**
 * POST /api/v1/sante/actes/:id/soumettre
 * Praticien submits acte for reimbursement (creates linked demande)
 */
actes.post(
  '/:id/soumettre',
  requireRole('PRATICIEN'),
  async (c) => {
    const id = c.req.param('id');
    const user = c.get('user');

    const acte = await findActeById(getDb(c), id);
    if (!acte) {
      return notFound(c, 'Acte non trouvé');
    }

    // Verify praticien owns this acte
    if (acte.praticienId !== user.providerId) {
      return forbidden(c, 'Acte non autorisé');
    }

    // Check status - must be signed by adherent
    if (acte.statut !== 'valide_adherent') {
      return badRequest(c, 'L\'acte doit être signé par l\'adhérent avant soumission');
    }

    // Create linked demande for gestionnaire processing
    const demandeId = generateId();
    await createSanteDemande(getDb(c), demandeId, {
      adherentId: acte.adherentId,
      typeSoin: 'consultation', // Will be determined by code_acte mapping
      source: 'praticien',
      praticienId: acte.praticienId,
      montantDemande: acte.montantActe,
      dateSoin: acte.dateActe,
    });

    // Update acte with demande link and status
    const updated = await updateActeStatut(getDb(c), id, 'soumis', {
      demandeId,
    });

    await logAudit(getDb(c), {
      userId: user.sub,
      action: 'sante_actes.submit',
      entityType: 'sante_actes_praticiens',
      entityId: id,
      changes: { demandeId, submittedAt: new Date().toISOString() },
    });

    return success(c, { ...updated, demandeId });
  }
);

/**
 * PATCH /api/v1/sante/actes/:id/statut
 * Update acte status (gestionnaire workflow)
 */
actes.patch(
  '/:id/statut',
  requireRole('SOIN_GESTIONNAIRE', 'SOIN_AGENT', 'ADMIN'),
  zValidator('json', santeActeUpdateStatutSchema),
  async (c) => {
    const id = c.req.param('id');
    const data = c.req.valid('json');
    const user = c.get('user');

    const acte = await findActeById(getDb(c), id);
    if (!acte) {
      return notFound(c, 'Acte non trouvé');
    }

    // Validate role permissions for certain status changes
    const restrictedStatuses = ['rembourse', 'rejete'];
    if (restrictedStatuses.includes(data.statut) && user.role === 'SOIN_AGENT') {
      return forbidden(c, 'Droits insuffisants pour cette action');
    }

    // If approving, record plafond consumption
    if (data.statut === 'rembourse') {
      const currentYear = new Date().getFullYear();
      await recordConsommation(getDb(c), acte.adherentId, currentYear, acte.montantCouvert);
    }

    const updated = await updateActeStatut(getDb(c), id, data.statut);

    await logAudit(getDb(c), {
      userId: user.sub,
      action: 'sante_actes.update_status',
      entityType: 'sante_actes_praticiens',
      entityId: id,
      changes: { oldStatut: acte.statut, newStatut: data.statut },
    });

    return success(c, updated);
  }
);

/**
 * POST /api/v1/sante/actes/verifier-adherent
 * Quick adherent verification by QR code or matricule
 */
actes.post(
  '/verifier-adherent',
  requireRole('PRATICIEN'),
  zValidator('json', z.object({
    qrCode: z.string().optional(),
    matricule: z.string().optional(),
  }).refine(data => data.qrCode || data.matricule, {
    message: 'qrCode ou matricule requis',
  })),
  async (c) => {
    const { qrCode, matricule } = c.req.valid('json');

    // TODO: Implement QR code verification (decode and lookup)
    // For now, just lookup by matricule
    let adherent = null;

    if (matricule) {
      // Find adherent by matricule
      const result = await getDb(c)
        .prepare('SELECT * FROM adherents WHERE matricule = ? AND deleted_at IS NULL')
        .bind(matricule)
        .first();

      if (result) {
        adherent = result;
      }
    }

    if (!adherent) {
      return notFound(c, 'Adhérent non trouvé');
    }

    // Get coverage info
    const currentYear = new Date().getFullYear();
    const plafondConsomme = await getPlafondConsomme(
      getDb(c),
      adherent.id as string,
      'global',
      currentYear
    );

    return success(c, {
      id: adherent.id,
      firstName: adherent.first_name,
      lastName: adherent.last_name,
      matricule: adherent.matricule,
      formuleId: adherent.formule_id,
      plafondGlobal: adherent.plafond_global,
      plafondConsomme: plafondConsomme?.montantConsomme ?? 0,
      plafondDisponible: (adherent.plafond_global as number ?? 0) - (plafondConsomme?.montantConsomme ?? 0),
      isEligible: true, // Basic check - full eligibility in future sprint
    });
  }
);

export { actes };
