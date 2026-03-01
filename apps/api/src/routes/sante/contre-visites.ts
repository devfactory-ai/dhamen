/**
 * SoinFlow Contre-Visites routes
 * Manage follow-up examinations requested by insurers
 */
import {
  santeContreVisiteCreateSchema,
  santeContreVisitePlanifierSchema,
  santeContreVisiteRapportSchema,
  santeContreVisiteUpdateStatutSchema,
  santeContreVisiteFiltersSchema,
  paginationSchema,
} from '@dhamen/shared';
import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import { created, noContent, notFound, paginated, success, badRequest } from '../../lib/response';
import { generateId } from '../../lib/ulid';
import { logAudit } from '../../middleware/audit-trail';
import { authMiddleware, requireRole } from '../../middleware/auth';
import type { Bindings, Variables } from '../../types';
import { getDb } from '../../lib/db';

const contreVisites = new Hono<{ Bindings: Bindings; Variables: Variables }>();

// Apply auth middleware to all routes
contreVisites.use('*', authMiddleware());

/**
 * Generate unique contre-visite number
 */
function generateNumeroContreVisite(): string {
  const year = new Date().getFullYear();
  const random = Math.random().toString(36).substring(2, 8).toUpperCase();
  return `CV-${year}-${random}`;
}

/**
 * GET /api/v1/sante/contre-visites
 * List all contre-visites with filters
 */
contreVisites.get(
  '/',
  requireRole('ADMIN', 'INSURER_ADMIN', 'INSURER_AGENT', 'SOIN_GESTIONNAIRE'),
  zValidator('query', santeContreVisiteFiltersSchema.merge(paginationSchema)),
  async (c) => {
    const filters = c.req.valid('query');
    const page = filters.page ?? 1;
    const limit = filters.limit ?? 20;
    const offset = (page - 1) * limit;

    let whereClause = '1=1';
    const params: unknown[] = [];

    if (filters.statut) {
      whereClause += ' AND cv.statut = ?';
      params.push(filters.statut);
    }
    if (filters.praticienId) {
      whereClause += ' AND cv.praticien_id = ?';
      params.push(filters.praticienId);
    }
    if (filters.dateDebut) {
      whereClause += ' AND cv.date_demande >= ?';
      params.push(filters.dateDebut);
    }
    if (filters.dateFin) {
      whereClause += ' AND cv.date_demande <= ?';
      params.push(filters.dateFin);
    }

    const countResult = await getDb(c).prepare(
      `SELECT COUNT(*) as total FROM sante_contre_visites cv WHERE ${whereClause}`
    )
      .bind(...params)
      .first<{ total: number }>();

    const total = countResult?.total ?? 0;

    const { results } = await getDb(c).prepare(
      `SELECT cv.*,
              d.numero_demande, d.type_soin, d.montant_demande, d.statut as demande_statut,
              a.first_name as adherent_first_name, a.last_name as adherent_last_name,
              p.nom as praticien_nom, p.prenom as praticien_prenom, p.specialite as praticien_specialite,
              u.first_name as demandeur_first_name, u.last_name as demandeur_last_name
       FROM sante_contre_visites cv
       LEFT JOIN sante_demandes d ON cv.demande_id = d.id
       LEFT JOIN adherents a ON d.adherent_id = a.id
       LEFT JOIN sante_praticiens p ON cv.praticien_id = p.id
       LEFT JOIN users u ON cv.demande_par = u.id
       WHERE ${whereClause}
       ORDER BY cv.created_at DESC
       LIMIT ? OFFSET ?`
    )
      .bind(...params, limit, offset)
      .all();

    const data = results.map((cv: Record<string, unknown>) => ({
      id: cv.id,
      demandeId: cv.demande_id,
      numeroContreVisite: cv.numero_contre_visite,
      praticienId: cv.praticien_id,
      statut: cv.statut,
      motif: cv.motif,
      dateDemande: cv.date_demande,
      datePlanifiee: cv.date_planifiee,
      dateLimite: cv.date_limite,
      dateEffectuee: cv.date_effectuee,
      conclusion: cv.conclusion,
      impactDecision: cv.impact_decision,
      demande: {
        numeroDemande: cv.numero_demande,
        typeSoin: cv.type_soin,
        montantDemande: cv.montant_demande,
        statut: cv.demande_statut,
      },
      adherent: {
        firstName: cv.adherent_first_name,
        lastName: cv.adherent_last_name,
      },
      praticien: cv.praticien_id ? {
        nom: cv.praticien_nom,
        prenom: cv.praticien_prenom,
        specialite: cv.praticien_specialite,
      } : null,
      demandeur: cv.demande_par ? {
        firstName: cv.demandeur_first_name,
        lastName: cv.demandeur_last_name,
      } : null,
      createdAt: cv.created_at,
    }));

    return paginated(c, data, {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    });
  }
);

/**
 * GET /api/v1/sante/contre-visites/:id
 * Get contre-visite details
 */
contreVisites.get(
  '/:id',
  requireRole('ADMIN', 'INSURER_ADMIN', 'INSURER_AGENT', 'SOIN_GESTIONNAIRE', 'SOIN_AGENT', 'PRATICIEN'),
  async (c) => {
    const id = c.req.param('id');

    const cv = await getDb(c).prepare(
      `SELECT cv.*,
              d.numero_demande, d.type_soin, d.montant_demande, d.montant_rembourse,
              d.statut as demande_statut, d.date_soin, d.adherent_id,
              a.first_name as adherent_first_name, a.last_name as adherent_last_name,
              a.email as adherent_email, a.phone_encrypted as adherent_phone,
              p.nom as praticien_nom, p.prenom as praticien_prenom,
              p.specialite as praticien_specialite, p.telephone as praticien_telephone,
              p.adresse as praticien_adresse, p.ville as praticien_ville,
              u.first_name as demandeur_first_name, u.last_name as demandeur_last_name
       FROM sante_contre_visites cv
       LEFT JOIN sante_demandes d ON cv.demande_id = d.id
       LEFT JOIN adherents a ON d.adherent_id = a.id
       LEFT JOIN sante_praticiens p ON cv.praticien_id = p.id
       LEFT JOIN users u ON cv.demande_par = u.id
       WHERE cv.id = ?`
    )
      .bind(id)
      .first();

    if (!cv) {
      return notFound(c, 'Contre-visite non trouvée');
    }

    return success(c, {
      id: cv.id,
      demandeId: cv.demande_id,
      numeroContreVisite: cv.numero_contre_visite,
      praticienId: cv.praticien_id,
      statut: cv.statut,
      motif: cv.motif,
      description: cv.description,
      dateDemande: cv.date_demande,
      datePlanifiee: cv.date_planifiee,
      dateLimite: cv.date_limite,
      dateEffectuee: cv.date_effectuee,
      lieu: cv.lieu,
      adresse: cv.adresse,
      ville: cv.ville,
      rapport: cv.rapport,
      conclusion: cv.conclusion,
      impactMontant: cv.impact_montant,
      impactDecision: cv.impact_decision,
      documentsJson: cv.documents_json,
      notesInternes: cv.notes_internes,
      createdAt: cv.created_at,
      updatedAt: cv.updated_at,
      demande: {
        id: cv.demande_id,
        numeroDemande: cv.numero_demande,
        typeSoin: cv.type_soin,
        montantDemande: cv.montant_demande,
        montantRembourse: cv.montant_rembourse,
        statut: cv.demande_statut,
        dateSoin: cv.date_soin,
      },
      adherent: {
        id: cv.adherent_id,
        firstName: cv.adherent_first_name,
        lastName: cv.adherent_last_name,
        email: cv.adherent_email,
        phone: typeof cv.adherent_phone === 'string' ? cv.adherent_phone.replace('ENC_', '') : null,
      },
      praticien: cv.praticien_id ? {
        id: cv.praticien_id,
        nom: cv.praticien_nom,
        prenom: cv.praticien_prenom,
        specialite: cv.praticien_specialite,
        telephone: cv.praticien_telephone,
        adresse: cv.praticien_adresse,
        ville: cv.praticien_ville,
      } : null,
      demandeur: cv.demande_par ? {
        firstName: cv.demandeur_first_name,
        lastName: cv.demandeur_last_name,
      } : null,
    });
  }
);

/**
 * POST /api/v1/sante/demandes/:demandeId/contre-visite
 * Create a contre-visite request for a demande
 */
contreVisites.post(
  '/demande/:demandeId',
  requireRole('ADMIN', 'INSURER_ADMIN', 'INSURER_AGENT'),
  zValidator('json', santeContreVisiteCreateSchema),
  async (c) => {
    const demandeId = c.req.param('demandeId');
    const data = c.req.valid('json');
    const user = c.get('user');

    // Verify demande exists
    const demande = await getDb(c).prepare(
      'SELECT id, statut, contre_visite_requise FROM sante_demandes WHERE id = ?'
    )
      .bind(demandeId)
      .first();

    if (!demande) {
      return notFound(c, 'Demande non trouvée');
    }

    // Check if contre-visite already exists
    if (demande.contre_visite_requise) {
      return badRequest(c, 'Une contre-visite existe déjà pour cette demande');
    }

    const id = generateId();
    const numeroContreVisite = generateNumeroContreVisite();

    // Create contre-visite
    await getDb(c).prepare(
      `INSERT INTO sante_contre_visites (
        id, demande_id, numero_contre_visite, praticien_id, statut, motif, description,
        date_planifiee, date_limite, lieu, adresse, ville, demande_par, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`
    )
      .bind(
        id,
        demandeId,
        numeroContreVisite,
        data.praticienId || null,
        data.praticienId && data.datePlanifiee ? 'planifiee' : 'demandee',
        data.motif,
        data.description || null,
        data.datePlanifiee || null,
        data.dateLimite || null,
        data.lieu || null,
        data.adresse || null,
        data.ville || null,
        user.sub
      )
      .run();

    // Update demande to mark contre-visite required
    await getDb(c).prepare(
      `UPDATE sante_demandes
       SET contre_visite_requise = 1, contre_visite_id = ?, updated_at = datetime('now')
       WHERE id = ?`
    )
      .bind(id, demandeId)
      .run();

    // Audit log
    await logAudit(getDb(c), {
      userId: user.sub,
      action: 'sante_contre_visite.create',
      entityType: 'sante_contre_visites',
      entityId: id,
      changes: { demandeId, motif: data.motif },
    });

    return created(c, {
      id,
      numeroContreVisite,
      demandeId,
      statut: data.praticienId && data.datePlanifiee ? 'planifiee' : 'demandee',
    });
  }
);

/**
 * PATCH /api/v1/sante/contre-visites/:id/planifier
 * Schedule a contre-visite with practitioner and date
 */
contreVisites.patch(
  '/:id/planifier',
  requireRole('ADMIN', 'INSURER_ADMIN', 'INSURER_AGENT', 'SOIN_GESTIONNAIRE'),
  zValidator('json', santeContreVisitePlanifierSchema),
  async (c) => {
    const id = c.req.param('id');
    const data = c.req.valid('json');
    const user = c.get('user');

    // Verify contre-visite exists
    const cv = await getDb(c).prepare(
      'SELECT id, statut FROM sante_contre_visites WHERE id = ?'
    )
      .bind(id)
      .first();

    if (!cv) {
      return notFound(c, 'Contre-visite non trouvée');
    }

    if (!['demandee', 'planifiee'].includes(cv.statut as string)) {
      return badRequest(c, 'La contre-visite ne peut plus être planifiée');
    }

    // Verify praticien exists
    const praticien = await getDb(c).prepare(
      'SELECT id FROM sante_praticiens WHERE id = ? AND deleted_at IS NULL'
    )
      .bind(data.praticienId)
      .first();

    if (!praticien) {
      return notFound(c, 'Praticien non trouvé');
    }

    await getDb(c).prepare(
      `UPDATE sante_contre_visites
       SET praticien_id = ?, date_planifiee = ?, lieu = ?, adresse = ?, ville = ?,
           statut = 'planifiee', updated_at = datetime('now')
       WHERE id = ?`
    )
      .bind(
        data.praticienId,
        data.datePlanifiee,
        data.lieu || null,
        data.adresse || null,
        data.ville || null,
        id
      )
      .run();

    await logAudit(getDb(c), {
      userId: user.sub,
      action: 'sante_contre_visite.planifier',
      entityType: 'sante_contre_visites',
      entityId: id,
      changes: { praticienId: data.praticienId, datePlanifiee: data.datePlanifiee },
    });

    return success(c, { id, statut: 'planifiee' });
  }
);

/**
 * PATCH /api/v1/sante/contre-visites/:id/rapport
 * Submit rapport for a contre-visite (by practitioner or gestionnaire)
 */
contreVisites.patch(
  '/:id/rapport',
  requireRole('ADMIN', 'SOIN_GESTIONNAIRE', 'PRATICIEN'),
  zValidator('json', santeContreVisiteRapportSchema),
  async (c) => {
    const id = c.req.param('id');
    const data = c.req.valid('json');
    const user = c.get('user');

    const cv = await getDb(c).prepare(
      'SELECT id, statut, demande_id FROM sante_contre_visites WHERE id = ?'
    )
      .bind(id)
      .first();

    if (!cv) {
      return notFound(c, 'Contre-visite non trouvée');
    }

    if (!['planifiee', 'en_attente', 'effectuee'].includes(cv.statut as string)) {
      return badRequest(c, 'La contre-visite ne peut pas recevoir de rapport dans cet état');
    }

    await getDb(c).prepare(
      `UPDATE sante_contre_visites
       SET rapport = ?, conclusion = ?, impact_montant = ?, impact_decision = ?,
           notes_internes = ?, statut = 'rapport_soumis', date_effectuee = datetime('now'),
           traite_par = ?, updated_at = datetime('now')
       WHERE id = ?`
    )
      .bind(
        data.rapport,
        data.conclusion,
        data.impactMontant || null,
        data.impactDecision || null,
        data.notesInternes || null,
        user.sub,
        id
      )
      .run();

    await logAudit(getDb(c), {
      userId: user.sub,
      action: 'sante_contre_visite.rapport',
      entityType: 'sante_contre_visites',
      entityId: id,
      changes: { conclusion: data.conclusion, impactDecision: data.impactDecision },
    });

    return success(c, { id, statut: 'rapport_soumis' });
  }
);

/**
 * PATCH /api/v1/sante/contre-visites/:id/valider
 * Validate a contre-visite and apply impact to demande
 */
contreVisites.patch(
  '/:id/valider',
  requireRole('ADMIN', 'INSURER_ADMIN', 'SOIN_GESTIONNAIRE'),
  async (c) => {
    const id = c.req.param('id');
    const user = c.get('user');

    const cv = await getDb(c).prepare(
      'SELECT id, statut, demande_id, impact_montant, impact_decision FROM sante_contre_visites WHERE id = ?'
    )
      .bind(id)
      .first();

    if (!cv) {
      return notFound(c, 'Contre-visite non trouvée');
    }

    if (cv.statut !== 'rapport_soumis') {
      return badRequest(c, 'La contre-visite doit avoir un rapport soumis pour être validée');
    }

    // Update contre-visite status
    await getDb(c).prepare(
      `UPDATE sante_contre_visites
       SET statut = 'validee', traite_par = ?, updated_at = datetime('now')
       WHERE id = ?`
    )
      .bind(user.sub, id)
      .run();

    // Apply impact to demande if specified
    if (cv.impact_decision) {
      let newStatut: string | null = null;
      let montantUpdate = '';

      switch (cv.impact_decision) {
        case 'rejeter':
          newStatut = 'rejetee';
          break;
        case 'approuver':
          newStatut = 'approuvee';
          break;
        case 'reduire':
          if (cv.impact_montant) {
            montantUpdate = `, montant_rembourse = ${cv.impact_montant}`;
          }
          newStatut = 'approuvee';
          break;
        case 'maintenir':
          // No change needed
          break;
      }

      if (newStatut) {
        await getDb(c).prepare(
          `UPDATE sante_demandes
           SET statut = ?, date_traitement = datetime('now'), traite_par = ?${montantUpdate}, updated_at = datetime('now')
           WHERE id = ?`
        )
          .bind(newStatut, user.sub, cv.demande_id)
          .run();
      }
    }

    await logAudit(getDb(c), {
      userId: user.sub,
      action: 'sante_contre_visite.valider',
      entityType: 'sante_contre_visites',
      entityId: id,
      changes: { impactDecision: cv.impact_decision, impactMontant: cv.impact_montant },
    });

    return success(c, { id, statut: 'validee' });
  }
);

/**
 * PATCH /api/v1/sante/contre-visites/:id/statut
 * Update contre-visite status
 */
contreVisites.patch(
  '/:id/statut',
  requireRole('ADMIN', 'INSURER_ADMIN', 'SOIN_GESTIONNAIRE'),
  zValidator('json', santeContreVisiteUpdateStatutSchema),
  async (c) => {
    const id = c.req.param('id');
    const data = c.req.valid('json');
    const user = c.get('user');

    const cv = await getDb(c).prepare(
      'SELECT id, statut FROM sante_contre_visites WHERE id = ?'
    )
      .bind(id)
      .first();

    if (!cv) {
      return notFound(c, 'Contre-visite non trouvée');
    }

    await getDb(c).prepare(
      `UPDATE sante_contre_visites
       SET statut = ?, notes_internes = COALESCE(?, notes_internes), updated_at = datetime('now')
       WHERE id = ?`
    )
      .bind(data.statut, data.notesInternes || null, id)
      .run();

    await logAudit(getDb(c), {
      userId: user.sub,
      action: 'sante_contre_visite.update_statut',
      entityType: 'sante_contre_visites',
      entityId: id,
      changes: { oldStatut: cv.statut, newStatut: data.statut },
    });

    return success(c, { id, statut: data.statut });
  }
);

/**
 * DELETE /api/v1/sante/contre-visites/:id
 * Cancel a contre-visite
 */
contreVisites.delete(
  '/:id',
  requireRole('ADMIN', 'INSURER_ADMIN'),
  async (c) => {
    const id = c.req.param('id');
    const user = c.get('user');

    const cv = await getDb(c).prepare(
      'SELECT id, statut, demande_id FROM sante_contre_visites WHERE id = ?'
    )
      .bind(id)
      .first();

    if (!cv) {
      return notFound(c, 'Contre-visite non trouvée');
    }

    if (['validee', 'effectuee', 'rapport_soumis'].includes(cv.statut as string)) {
      return badRequest(c, 'Cette contre-visite ne peut plus être annulée');
    }

    // Update contre-visite status to cancelled
    await getDb(c).prepare(
      `UPDATE sante_contre_visites SET statut = 'annulee', updated_at = datetime('now') WHERE id = ?`
    )
      .bind(id)
      .run();

    // Remove contre-visite link from demande
    await getDb(c).prepare(
      `UPDATE sante_demandes
       SET contre_visite_requise = 0, contre_visite_id = NULL, updated_at = datetime('now')
       WHERE id = ?`
    )
      .bind(cv.demande_id)
      .run();

    await logAudit(getDb(c), {
      userId: user.sub,
      action: 'sante_contre_visite.cancel',
      entityType: 'sante_contre_visites',
      entityId: id,
    });

    return noContent(c);
  }
);

export { contreVisites };
