/**
 * SoinFlow Bordereaux routes - Payment batch management
 *
 * Bordereaux are periodic summaries of approved claims sent to insurers
 * for bulk payment processing.
 */
import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { success, created, notFound, badRequest, paginated } from '../../lib/response';
import { generateId } from '../../lib/ulid';
import { logAudit } from '../../middleware/audit-trail';
import { authMiddleware, requireRole } from '../../middleware/auth';
import type { Bindings, Variables } from '../../types';
import { paginationSchema } from '@dhamen/shared';

const bordereaux = new Hono<{ Bindings: Bindings; Variables: Variables }>();

// Apply auth middleware
bordereaux.use('*', authMiddleware());

// =============================================================================
// Types
// =============================================================================

interface BordereauRow {
  id: string;
  numero_bordereau: string;
  periode_debut: string;
  periode_fin: string;
  nombre_demandes: number;
  montant_total: number;
  statut: string;
  date_generation: string;
  date_validation: string | null;
  date_envoi: string | null;
  date_paiement: string | null;
  genere_par: string;
  valide_par: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

interface BordereauLigneRow {
  id: string;
  bordereau_id: string;
  demande_id: string;
  numero_demande: string;
  adherent_nom: string;
  type_soin: string;
  date_soin: string;
  montant_demande: number;
  montant_rembourse: number;
}

// =============================================================================
// Schemas
// =============================================================================

const bordereauFiltersSchema = z.object({
  statut: z.enum(['genere', 'valide', 'envoye', 'paye', 'annule']).optional(),
  dateDebut: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  dateFin: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

const createBordereauSchema = z.object({
  periodeDebut: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  periodeFin: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  notes: z.string().optional(),
});

const updateBordereauStatutSchema = z.object({
  statut: z.enum(['valide', 'envoye', 'paye', 'annule']),
  notes: z.string().optional(),
});

// =============================================================================
// Routes
// =============================================================================

/**
 * GET /api/v1/sante/bordereaux
 * List bordereaux with filters
 */
bordereaux.get(
  '/',
  requireRole('SOIN_GESTIONNAIRE', 'ADMIN'),
  zValidator('query', bordereauFiltersSchema.merge(paginationSchema)),
  async (c) => {
    const { statut, dateDebut, dateFin, page = 1, limit = 20 } = c.req.valid('query');
    const offset = (page - 1) * limit;

    const conditions: string[] = [];
    const params: unknown[] = [];

    if (statut) {
      conditions.push('statut = ?');
      params.push(statut);
    }
    if (dateDebut) {
      conditions.push('periode_debut >= ?');
      params.push(dateDebut);
    }
    if (dateFin) {
      conditions.push('periode_fin <= ?');
      params.push(dateFin);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countResult = await c.env.DB.prepare(
      `SELECT COUNT(*) as count FROM bordereaux ${whereClause}`
    )
      .bind(...params)
      .first<{ count: number }>();

    const { results } = await c.env.DB.prepare(
      `SELECT * FROM bordereaux ${whereClause} ORDER BY date_generation DESC LIMIT ? OFFSET ?`
    )
      .bind(...params, limit, offset)
      .all<BordereauRow>();

    const data = results.map(rowToBordereau);

    return paginated(c, data, {
      page,
      limit,
      total: countResult?.count ?? 0,
      totalPages: Math.ceil((countResult?.count ?? 0) / limit),
    });
  }
);

/**
 * GET /api/v1/sante/bordereaux/stats
 * Get bordereau statistics
 */
bordereaux.get('/stats', requireRole('SOIN_GESTIONNAIRE', 'ADMIN'), async (c) => {
  const { results: statusCounts } = await c.env.DB.prepare(`
    SELECT statut, COUNT(*) as count, COALESCE(SUM(montant_total), 0) as total
    FROM bordereaux
    GROUP BY statut
  `).all<{ statut: string; count: number; total: number }>();

  const totals = await c.env.DB.prepare(`
    SELECT
      COUNT(*) as totalBordereaux,
      COALESCE(SUM(nombre_demandes), 0) as totalDemandes,
      COALESCE(SUM(montant_total), 0) as montantTotal
    FROM bordereaux
    WHERE statut != 'annule'
  `).first<{ totalBordereaux: number; totalDemandes: number; montantTotal: number }>();

  const parStatut: Record<string, { count: number; total: number }> = {};
  for (const row of statusCounts || []) {
    parStatut[row.statut] = { count: row.count, total: row.total };
  }

  return success(c, {
    totalBordereaux: totals?.totalBordereaux ?? 0,
    totalDemandes: totals?.totalDemandes ?? 0,
    montantTotal: totals?.montantTotal ?? 0,
    parStatut,
  });
});

/**
 * GET /api/v1/sante/bordereaux/:id
 * Get bordereau details with lines
 */
bordereaux.get('/:id', requireRole('SOIN_GESTIONNAIRE', 'ADMIN'), async (c) => {
  const id = c.req.param('id');

  const row = await c.env.DB.prepare('SELECT * FROM bordereaux WHERE id = ?')
    .bind(id)
    .first<BordereauRow>();

  if (!row) {
    return notFound(c, 'Bordereau non trouvé');
  }

  // Get bordereau lines
  const { results: lignes } = await c.env.DB.prepare(`
    SELECT
      bl.id, bl.bordereau_id, bl.demande_id,
      d.numero_demande, d.type_soin, d.date_soin,
      d.montant_demande, d.montant_rembourse,
      a.first_name || ' ' || a.last_name as adherent_nom
    FROM bordereau_lignes bl
    JOIN sante_demandes d ON bl.demande_id = d.id
    LEFT JOIN adherents a ON d.adherent_id = a.id
    WHERE bl.bordereau_id = ?
    ORDER BY d.date_soin
  `)
    .bind(id)
    .all<BordereauLigneRow>();

  return success(c, {
    ...rowToBordereau(row),
    lignes: lignes.map((l) => ({
      id: l.id,
      demandeId: l.demande_id,
      numeroDemande: l.numero_demande,
      adherentNom: l.adherent_nom,
      typeSoin: l.type_soin,
      dateSoin: l.date_soin,
      montantDemande: l.montant_demande,
      montantRembourse: l.montant_rembourse,
    })),
  });
});

/**
 * POST /api/v1/sante/bordereaux
 * Generate a new bordereau from approved claims
 */
bordereaux.post(
  '/',
  requireRole('SOIN_GESTIONNAIRE', 'ADMIN'),
  zValidator('json', createBordereauSchema),
  async (c) => {
    const data = c.req.valid('json');
    const user = c.get('user');

    // Find approved demandes in the period that are not in any bordereau
    const { results: demandesEligibles } = await c.env.DB.prepare(`
      SELECT d.id, d.montant_rembourse
      FROM sante_demandes d
      LEFT JOIN bordereau_lignes bl ON d.id = bl.demande_id
      WHERE d.statut = 'approuvee'
        AND d.date_soin >= ?
        AND d.date_soin <= ?
        AND bl.id IS NULL
        AND d.montant_rembourse > 0
    `)
      .bind(data.periodeDebut, data.periodeFin)
      .all<{ id: string; montant_rembourse: number }>();

    if (demandesEligibles.length === 0) {
      return badRequest(c, 'Aucune demande approuvée trouvée pour cette période');
    }

    const now = new Date().toISOString();
    const id = generateId();
    const numeroBordereau = generateNumeroBordereau();
    const montantTotal = demandesEligibles.reduce((sum, d) => sum + d.montant_rembourse, 0);

    // Create bordereau
    await c.env.DB.prepare(`
      INSERT INTO bordereaux (
        id, numero_bordereau, periode_debut, periode_fin,
        nombre_demandes, montant_total, statut, date_generation,
        genere_par, notes, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, 'genere', ?, ?, ?, ?, ?)
    `)
      .bind(
        id,
        numeroBordereau,
        data.periodeDebut,
        data.periodeFin,
        demandesEligibles.length,
        montantTotal,
        now,
        user.sub,
        data.notes ?? null,
        now,
        now
      )
      .run();

    // Create bordereau lines
    for (const demande of demandesEligibles) {
      const ligneId = generateId();
      await c.env.DB.prepare(`
        INSERT INTO bordereau_lignes (id, bordereau_id, demande_id, created_at)
        VALUES (?, ?, ?, ?)
      `)
        .bind(ligneId, id, demande.id, now)
        .run();
    }

    await logAudit(c.env.DB, {
      userId: user.sub,
      action: 'bordereaux.create',
      entityType: 'bordereaux',
      entityId: id,
      changes: {
        numeroBordereau,
        periodeDebut: data.periodeDebut,
        periodeFin: data.periodeFin,
        nombreDemandes: demandesEligibles.length,
        montantTotal,
      },
    });

    const bordereau = await c.env.DB.prepare('SELECT * FROM bordereaux WHERE id = ?')
      .bind(id)
      .first<BordereauRow>();

    return created(c, rowToBordereau(bordereau!));
  }
);

/**
 * PATCH /api/v1/sante/bordereaux/:id/statut
 * Update bordereau status
 */
bordereaux.patch(
  '/:id/statut',
  requireRole('SOIN_GESTIONNAIRE', 'ADMIN'),
  zValidator('json', updateBordereauStatutSchema),
  async (c) => {
    const id = c.req.param('id');
    const data = c.req.valid('json');
    const user = c.get('user');

    const existing = await c.env.DB.prepare('SELECT * FROM bordereaux WHERE id = ?')
      .bind(id)
      .first<BordereauRow>();

    if (!existing) {
      return notFound(c, 'Bordereau non trouvé');
    }

    // Validate status transitions
    const validTransitions: Record<string, string[]> = {
      genere: ['valide', 'annule'],
      valide: ['envoye', 'annule'],
      envoye: ['paye', 'annule'],
      paye: [],
      annule: [],
    };

    if (!validTransitions[existing.statut]?.includes(data.statut)) {
      return badRequest(
        c,
        `Transition de "${existing.statut}" vers "${data.statut}" non autorisée`
      );
    }

    const now = new Date().toISOString();
    const updates: string[] = ['statut = ?', 'updated_at = ?'];
    const params: unknown[] = [data.statut, now];

    // Set dates based on status
    if (data.statut === 'valide') {
      updates.push('date_validation = ?', 'valide_par = ?');
      params.push(now, user.sub);
    } else if (data.statut === 'envoye') {
      updates.push('date_envoi = ?');
      params.push(now);
    } else if (data.statut === 'paye') {
      updates.push('date_paiement = ?');
      params.push(now);
    }

    if (data.notes) {
      updates.push('notes = ?');
      params.push(data.notes);
    }

    params.push(id);

    await c.env.DB.prepare(
      `UPDATE bordereaux SET ${updates.join(', ')} WHERE id = ?`
    )
      .bind(...params)
      .run();

    // If marked as paid, update all demandes to payee
    if (data.statut === 'paye') {
      await c.env.DB.prepare(`
        UPDATE sante_demandes
        SET statut = 'payee', updated_at = ?
        WHERE id IN (SELECT demande_id FROM bordereau_lignes WHERE bordereau_id = ?)
      `)
        .bind(now, id)
        .run();
    }

    await logAudit(c.env.DB, {
      userId: user.sub,
      action: 'bordereaux.update_status',
      entityType: 'bordereaux',
      entityId: id,
      changes: { oldStatut: existing.statut, newStatut: data.statut },
    });

    const bordereau = await c.env.DB.prepare('SELECT * FROM bordereaux WHERE id = ?')
      .bind(id)
      .first<BordereauRow>();

    return success(c, rowToBordereau(bordereau!));
  }
);

/**
 * GET /api/v1/sante/bordereaux/:id/export
 * Export bordereau to CSV
 */
bordereaux.get('/:id/export', requireRole('SOIN_GESTIONNAIRE', 'ADMIN'), async (c) => {
  const id = c.req.param('id');

  const bordereau = await c.env.DB.prepare('SELECT * FROM bordereaux WHERE id = ?')
    .bind(id)
    .first<BordereauRow>();

  if (!bordereau) {
    return notFound(c, 'Bordereau non trouvé');
  }

  const { results: lignes } = await c.env.DB.prepare(`
    SELECT
      d.numero_demande, d.type_soin, d.date_soin,
      d.montant_demande, d.montant_rembourse,
      a.first_name, a.last_name, a.matricule
    FROM bordereau_lignes bl
    JOIN sante_demandes d ON bl.demande_id = d.id
    LEFT JOIN adherents a ON d.adherent_id = a.id
    WHERE bl.bordereau_id = ?
    ORDER BY d.date_soin
  `)
    .bind(id)
    .all<{
      numero_demande: string;
      type_soin: string;
      date_soin: string;
      montant_demande: number;
      montant_rembourse: number;
      first_name: string;
      last_name: string;
      matricule: string | null;
    }>();

  // Build CSV
  const headers = [
    'Numéro Demande',
    'Matricule',
    'Nom',
    'Prénom',
    'Type Soin',
    'Date Soin',
    'Montant Demandé',
    'Montant Remboursé',
  ];

  const rows = lignes.map((l) => [
    l.numero_demande,
    l.matricule ?? '',
    l.last_name,
    l.first_name,
    l.type_soin,
    l.date_soin,
    l.montant_demande.toString(),
    l.montant_rembourse.toString(),
  ]);

  const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');

  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="bordereau-${bordereau.numero_bordereau}.csv"`,
    },
  });
});

// =============================================================================
// Helpers
// =============================================================================

function generateNumeroBordereau(): string {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const random = Math.floor(Math.random() * 9999)
    .toString()
    .padStart(4, '0');
  return `BDX-${year}${month}-${random}`;
}

function rowToBordereau(row: BordereauRow) {
  return {
    id: row.id,
    numeroBordereau: row.numero_bordereau,
    periodeDebut: row.periode_debut,
    periodeFin: row.periode_fin,
    nombreDemandes: row.nombre_demandes,
    montantTotal: row.montant_total,
    statut: row.statut,
    dateGeneration: row.date_generation,
    dateValidation: row.date_validation,
    dateEnvoi: row.date_envoi,
    datePaiement: row.date_paiement,
    generePar: row.genere_par,
    validePar: row.valide_par,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export { bordereaux };
