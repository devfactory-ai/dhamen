/**
 * SoinFlow Paiements routes - Payment management and tracking
 */
import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { success, created, notFound, badRequest, paginated } from '../../lib/response';
import { generateId } from '../../lib/ulid';
import { logAudit } from '../../middleware/audit-trail';
import { authMiddleware, requireRole } from '../../middleware/auth';
import type { Bindings, Variables } from '../../types';
import { getDb } from '../../lib/db';
import {
  santeStatutPaiementSchema,
  santeMethodePaiementSchema,
  santeTypeBeneficiaireSchema,
  paginationSchema,
} from '@dhamen/shared';

const paiements = new Hono<{ Bindings: Bindings; Variables: Variables }>();

// Apply auth middleware
paiements.use('*', authMiddleware());

// =============================================================================
// Types
// =============================================================================

interface PaiementRow {
  id: string;
  demande_id: string;
  type_beneficiaire: string;
  beneficiaire_id: string;
  montant: number;
  methode: string;
  rib_encrypted: string | null;
  statut: string;
  date_initiation: string | null;
  date_execution: string | null;
  reference_paiement: string | null;
  motif_echec: string | null;
  idempotency_key: string | null;
  initie_par: string | null;
  created_at: string;
  updated_at: string;
}

// =============================================================================
// Schemas
// =============================================================================

const paiementFiltersSchema = z.object({
  statut: santeStatutPaiementSchema.optional(),
  typeBeneficiaire: santeTypeBeneficiaireSchema.optional(),
  methode: santeMethodePaiementSchema.optional(),
  dateDebut: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  dateFin: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

const createPaiementSchema = z.object({
  demandeId: z.string().min(1),
  typeBeneficiaire: santeTypeBeneficiaireSchema,
  beneficiaireId: z.string().min(1),
  montant: z.number().positive(),
  methode: santeMethodePaiementSchema,
  rib: z.string().optional(),
  idempotencyKey: z.string().optional(),
});

const updateStatutPaiementSchema = z.object({
  statut: santeStatutPaiementSchema,
  referencePaiement: z.string().optional(),
  motifEchec: z.string().optional(),
});

// =============================================================================
// Routes
// =============================================================================

/**
 * GET /api/v1/sante/paiements
 * List paiements with filters
 */
paiements.get(
  '/',
  requireRole('SOIN_GESTIONNAIRE', 'ADMIN'),
  zValidator('query', paiementFiltersSchema.merge(paginationSchema)),
  async (c) => {
    const { statut, typeBeneficiaire, methode, dateDebut, dateFin, page = 1, limit = 20 } = c.req.valid('query');
    const offset = (page - 1) * limit;

    const conditions: string[] = [];
    const params: unknown[] = [];

    if (statut) {
      conditions.push('statut = ?');
      params.push(statut);
    }
    if (typeBeneficiaire) {
      conditions.push('type_beneficiaire = ?');
      params.push(typeBeneficiaire);
    }
    if (methode) {
      conditions.push('methode = ?');
      params.push(methode);
    }
    if (dateDebut) {
      conditions.push('created_at >= ?');
      params.push(dateDebut);
    }
    if (dateFin) {
      conditions.push('created_at <= ?');
      params.push(dateFin + 'T23:59:59');
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countResult = await getDb(c).prepare(
      `SELECT COUNT(*) as count FROM sante_paiements ${whereClause}`
    )
      .bind(...params)
      .first<{ count: number }>();

    const { results } = await getDb(c).prepare(
      `SELECT * FROM sante_paiements ${whereClause} ORDER BY created_at DESC LIMIT ? OFFSET ?`
    )
      .bind(...params, limit, offset)
      .all<PaiementRow>();

    const data = results.map(rowToPaiement);

    return paginated(c, data, {
      page,
      limit,
      total: countResult?.count ?? 0,
      totalPages: Math.ceil((countResult?.count ?? 0) / limit),
    });
  }
);

/**
 * GET /api/v1/sante/paiements/stats
 * Get payment statistics
 */
paiements.get('/stats', requireRole('SOIN_GESTIONNAIRE', 'ADMIN'), async (c) => {
  const { results: statusCounts } = await getDb(c).prepare(`
    SELECT statut, COUNT(*) as count, COALESCE(SUM(montant), 0) as total
    FROM sante_paiements
    GROUP BY statut
  `).all<{ statut: string; count: number; total: number }>();

  const totals = await getDb(c).prepare(`
    SELECT
      COUNT(*) as total,
      COALESCE(SUM(CASE WHEN statut = 'execute' THEN montant ELSE 0 END), 0) as totalExecute,
      COALESCE(SUM(CASE WHEN statut = 'en_attente' THEN montant ELSE 0 END), 0) as totalEnAttente
    FROM sante_paiements
  `).first<{ total: number; totalExecute: number; totalEnAttente: number }>();

  const parStatut: Record<string, { count: number; total: number }> = {};
  for (const row of statusCounts || []) {
    parStatut[row.statut] = { count: row.count, total: row.total };
  }

  return success(c, {
    total: totals?.total ?? 0,
    parStatut,
    montantTotalExecute: totals?.totalExecute ?? 0,
    montantTotalEnAttente: totals?.totalEnAttente ?? 0,
  });
});

/**
 * GET /api/v1/sante/paiements/:id
 * Get paiement details
 */
paiements.get('/:id', requireRole('SOIN_GESTIONNAIRE', 'ADMIN'), async (c) => {
  const id = c.req.param('id');

  const row = await getDb(c).prepare('SELECT * FROM sante_paiements WHERE id = ?')
    .bind(id)
    .first<PaiementRow>();

  if (!row) {
    return notFound(c, 'Paiement non trouvé');
  }

  // Get associated demande info
  const demande = await getDb(c).prepare(`
    SELECT d.numero_demande, d.adherent_id, d.montant_demande,
           a.first_name, a.last_name
    FROM sante_demandes d
    LEFT JOIN adherents a ON d.adherent_id = a.id
    WHERE d.id = ?
  `)
    .bind(row.demande_id)
    .first<{
      numero_demande: string;
      adherent_id: string;
      montant_demande: number;
      first_name: string;
      last_name: string;
    }>();

  return success(c, {
    ...rowToPaiement(row),
    demande: demande
      ? {
          numeroDemande: demande.numero_demande,
          adherentId: demande.adherent_id,
          adherentNom: `${demande.first_name} ${demande.last_name}`,
          montantDemande: demande.montant_demande,
        }
      : null,
  });
});

/**
 * POST /api/v1/sante/paiements
 * Create a new paiement
 */
paiements.post(
  '/',
  requireRole('SOIN_GESTIONNAIRE', 'ADMIN'),
  zValidator('json', createPaiementSchema),
  async (c) => {
    const data = c.req.valid('json');
    const user = c.get('user');

    // Check idempotency
    if (data.idempotencyKey) {
      const existing = await getDb(c).prepare(
        'SELECT id FROM sante_paiements WHERE idempotency_key = ?'
      )
        .bind(data.idempotencyKey)
        .first<{ id: string }>();

      if (existing) {
        return badRequest(c, 'Paiement déjà créé avec cette clé d\'idempotence');
      }
    }

    // Verify demande exists and is approved
    const demande = await getDb(c).prepare(
      'SELECT id, statut, montant_rembourse FROM sante_demandes WHERE id = ?'
    )
      .bind(data.demandeId)
      .first<{ id: string; statut: string; montant_rembourse: number }>();

    if (!demande) {
      return notFound(c, 'Demande non trouvée');
    }

    if (demande.statut !== 'approuvee' && demande.statut !== 'en_paiement') {
      return badRequest(c, 'La demande doit être approuvée pour créer un paiement');
    }

    const now = new Date().toISOString();
    const id = generateId();

    await getDb(c).prepare(`
      INSERT INTO sante_paiements (
        id, demande_id, type_beneficiaire, beneficiaire_id, montant, methode,
        rib_encrypted, statut, idempotency_key, initie_par, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'en_attente', ?, ?, ?, ?)
    `)
      .bind(
        id,
        data.demandeId,
        data.typeBeneficiaire,
        data.beneficiaireId,
        data.montant,
        data.methode,
        data.rib ?? null,
        data.idempotencyKey ?? null,
        user.sub,
        now,
        now
      )
      .run();

    // Update demande status to en_paiement
    await getDb(c).prepare(
      'UPDATE sante_demandes SET statut = ?, updated_at = ? WHERE id = ?'
    )
      .bind('en_paiement', now, data.demandeId)
      .run();

    await logAudit(getDb(c), {
      userId: user.sub,
      action: 'sante_paiements.create',
      entityType: 'sante_paiements',
      entityId: id,
      changes: { demandeId: data.demandeId, montant: data.montant, methode: data.methode },
    });

    const paiement = await getDb(c).prepare('SELECT * FROM sante_paiements WHERE id = ?')
      .bind(id)
      .first<PaiementRow>();

    return created(c, rowToPaiement(paiement!));
  }
);

/**
 * PATCH /api/v1/sante/paiements/:id/statut
 * Update paiement status
 */
paiements.patch(
  '/:id/statut',
  requireRole('SOIN_GESTIONNAIRE', 'ADMIN'),
  zValidator('json', updateStatutPaiementSchema),
  async (c) => {
    const id = c.req.param('id');
    const data = c.req.valid('json');
    const user = c.get('user');

    const existing = await getDb(c).prepare('SELECT * FROM sante_paiements WHERE id = ?')
      .bind(id)
      .first<PaiementRow>();

    if (!existing) {
      return notFound(c, 'Paiement non trouvé');
    }

    const now = new Date().toISOString();
    const updates: string[] = ['statut = ?', 'updated_at = ?'];
    const params: unknown[] = [data.statut, now];

    if (data.referencePaiement) {
      updates.push('reference_paiement = ?');
      params.push(data.referencePaiement);
    }

    if (data.motifEchec) {
      updates.push('motif_echec = ?');
      params.push(data.motifEchec);
    }

    // Set dates based on status
    if (data.statut === 'initie' && !existing.date_initiation) {
      updates.push('date_initiation = ?');
      params.push(now);
    }

    if (data.statut === 'execute') {
      updates.push('date_execution = ?');
      params.push(now);
    }

    params.push(id);

    await getDb(c).prepare(
      `UPDATE sante_paiements SET ${updates.join(', ')} WHERE id = ?`
    )
      .bind(...params)
      .run();

    // If payment executed, update demande to payee
    if (data.statut === 'execute') {
      await getDb(c).prepare(
        'UPDATE sante_demandes SET statut = ?, updated_at = ? WHERE id = ?'
      )
        .bind('payee', now, existing.demande_id)
        .run();
    }

    await logAudit(getDb(c), {
      userId: user.sub,
      action: 'sante_paiements.update_status',
      entityType: 'sante_paiements',
      entityId: id,
      changes: { oldStatut: existing.statut, newStatut: data.statut },
    });

    const paiement = await getDb(c).prepare('SELECT * FROM sante_paiements WHERE id = ?')
      .bind(id)
      .first<PaiementRow>();

    return success(c, rowToPaiement(paiement!));
  }
);

/**
 * POST /api/v1/sante/paiements/batch
 * Create batch paiements for multiple demandes
 */
paiements.post(
  '/batch',
  requireRole('SOIN_GESTIONNAIRE', 'ADMIN'),
  zValidator(
    'json',
    z.object({
      demandeIds: z.array(z.string()).min(1).max(100),
      methode: santeMethodePaiementSchema,
    })
  ),
  async (c) => {
    const { demandeIds, methode } = c.req.valid('json');
    const user = c.get('user');
    const now = new Date().toISOString();

    const created: Array<{ demandeId: string; paiementId: string }> = [];
    const errors: Array<{ demandeId: string; error: string }> = [];

    for (const demandeId of demandeIds) {
      // Get demande with adherent info
      const demande = await getDb(c).prepare(`
        SELECT d.id, d.statut, d.montant_rembourse, d.adherent_id
        FROM sante_demandes d
        WHERE d.id = ?
      `)
        .bind(demandeId)
        .first<{
          id: string;
          statut: string;
          montant_rembourse: number;
          adherent_id: string;
        }>();

      if (!demande) {
        errors.push({ demandeId, error: 'Demande non trouvée' });
        continue;
      }

      if (demande.statut !== 'approuvee') {
        errors.push({ demandeId, error: 'Demande non approuvée' });
        continue;
      }

      if (!demande.montant_rembourse || demande.montant_rembourse <= 0) {
        errors.push({ demandeId, error: 'Montant à rembourser invalide' });
        continue;
      }

      const id = generateId();

      await getDb(c).prepare(`
        INSERT INTO sante_paiements (
          id, demande_id, type_beneficiaire, beneficiaire_id, montant, methode,
          statut, initie_par, created_at, updated_at
        ) VALUES (?, ?, 'adherent', ?, ?, ?, 'en_attente', ?, ?, ?)
      `)
        .bind(
          id,
          demandeId,
          demande.adherent_id,
          demande.montant_rembourse,
          methode,
          user.sub,
          now,
          now
        )
        .run();

      await getDb(c).prepare(
        'UPDATE sante_demandes SET statut = ?, updated_at = ? WHERE id = ?'
      )
        .bind('en_paiement', now, demandeId)
        .run();

      created.push({ demandeId, paiementId: id });
    }

    await logAudit(getDb(c), {
      userId: user.sub,
      action: 'sante_paiements.batch_create',
      entityType: 'sante_paiements',
      entityId: 'batch',
      changes: { count: created.length, methode },
    });

    return success(c, { created, errors });
  }
);

// =============================================================================
// Helpers
// =============================================================================

function rowToPaiement(row: PaiementRow) {
  return {
    id: row.id,
    demandeId: row.demande_id,
    typeBeneficiaire: row.type_beneficiaire,
    beneficiaireId: row.beneficiaire_id,
    montant: row.montant,
    methode: row.methode,
    ribEncrypted: row.rib_encrypted,
    statut: row.statut,
    dateInitiation: row.date_initiation,
    dateExecution: row.date_execution,
    referencePaiement: row.reference_paiement,
    motifEchec: row.motif_echec,
    idempotencyKey: row.idempotency_key,
    initiePar: row.initie_par,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export { paiements };
