/**
 * SoinFlow Bordereaux routes - Payment batch management
 *
 * Bordereaux group validated/reimbursed bulletins by period for insurer billing.
 * Source: bulletins_soins table (approved/reimbursed bulletins)
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

// =============================================================================
// Schemas
// =============================================================================

const bordereauFiltersSchema = z.object({
  statut: z.enum(['genere', 'valide', 'envoye', 'paye', 'annule', 'archive']).optional(),
  dateDebut: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  dateFin: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  search: z.string().optional(),
});

const createBordereauSchema = z.object({
  periodeDebut: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  periodeFin: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  notes: z.string().optional(),
});

const updateBordereauStatutSchema = z.object({
  statut: z.enum(['valide', 'envoye', 'paye', 'annule', 'archive']),
  notes: z.string().optional(),
});

const bulkActionSchema = z.object({
  ids: z.array(z.string().min(1)).min(1),
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
  requireRole('SOIN_GESTIONNAIRE', 'INSURER_ADMIN', 'INSURER_AGENT', 'ADMIN'),
  zValidator('query', bordereauFiltersSchema.merge(paginationSchema)),
  async (c) => {
    const { statut, dateDebut, dateFin, search, page = 1, limit = 20 } = c.req.valid('query');
    const offset = (page - 1) * limit;

    const conditions: string[] = [];
    const params: unknown[] = [];

    if (statut) {
      conditions.push('statut = ?');
      params.push(statut);
    } else {
      // Exclude archived by default
      conditions.push("statut != 'archive'");
    }
    if (dateDebut) {
      conditions.push('periode_debut >= ?');
      params.push(dateDebut);
    }
    if (dateFin) {
      conditions.push('periode_fin <= ?');
      params.push(dateFin);
    }
    if (search) {
      conditions.push('numero_bordereau LIKE ?');
      params.push(`%${search}%`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countResult = await getDb(c).prepare(
      `SELECT COUNT(*) as count FROM sante_bordereaux ${whereClause}`
    )
      .bind(...params)
      .first<{ count: number }>();

    const { results } = await getDb(c).prepare(
      `SELECT * FROM sante_bordereaux ${whereClause} ORDER BY date_generation DESC LIMIT ? OFFSET ?`
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
bordereaux.get('/stats', requireRole('SOIN_GESTIONNAIRE', 'INSURER_ADMIN', 'INSURER_AGENT', 'ADMIN'), async (c) => {
  const { results: statusCounts } = await getDb(c).prepare(`
    SELECT statut, COUNT(*) as count, COALESCE(SUM(montant_total), 0) as total
    FROM sante_bordereaux
    GROUP BY statut
  `).all<{ statut: string; count: number; total: number }>();

  const totals = await getDb(c).prepare(`
    SELECT
      COUNT(*) as totalBordereaux,
      COALESCE(SUM(nombre_demandes), 0) as totalDemandes,
      COALESCE(SUM(montant_total), 0) as montantTotal
    FROM sante_bordereaux
    WHERE statut != 'annule'
  `).first<{ totalBordereaux: number; totalDemandes: number; montantTotal: number }>();

  // Count bulletins available for next bordereau
  const available = await getDb(c).prepare(`
    SELECT COUNT(*) as count, COALESCE(SUM(reimbursed_amount), 0) as total
    FROM bulletins_soins
    WHERE status IN ('approved', 'reimbursed') AND bordereau_id IS NULL
  `).first<{ count: number; total: number }>();

  const parStatut: Record<string, { count: number; total: number }> = {};
  for (const row of statusCounts || []) {
    parStatut[row.statut] = { count: row.count, total: row.total };
  }

  return success(c, {
    totalBordereaux: totals?.totalBordereaux ?? 0,
    totalDemandes: totals?.totalDemandes ?? 0,
    montantTotal: totals?.montantTotal ?? 0,
    bulletinsDisponibles: available?.count ?? 0,
    montantDisponible: available?.total ?? 0,
    parStatut,
  });
});

/**
 * GET /api/v1/sante/bordereaux/:id
 * Get bordereau details with linked bulletins
 */
bordereaux.get('/:id', requireRole('SOIN_GESTIONNAIRE', 'INSURER_ADMIN', 'INSURER_AGENT', 'ADMIN'), async (c) => {
  const id = c.req.param('id');
  const db = getDb(c);

  const row = await db.prepare('SELECT * FROM sante_bordereaux WHERE id = ?')
    .bind(id)
    .first<BordereauRow>();

  if (!row) {
    return notFound(c, 'Bordereau non trouvé');
  }

  // Get bulletins linked to this bordereau
  const { results: lignes } = await db.prepare(`
    SELECT
      bs.id,
      bs.bulletin_number,
      bs.bulletin_date,
      bs.care_type,
      bs.total_amount,
      bs.reimbursed_amount,
      bs.status,
      COALESCE(bs.adherent_first_name, a.first_name, '') || ' ' || COALESCE(bs.adherent_last_name, a.last_name, '') as adherent_nom,
      a.matricule
    FROM bulletins_soins bs
    LEFT JOIN adherents a ON bs.adherent_id = a.id
    WHERE bs.bordereau_id = ?
    ORDER BY bs.bulletin_date ASC
  `)
    .bind(id)
    .all<{
      id: string; bulletin_number: string; bulletin_date: string;
      care_type: string; total_amount: number | null; reimbursed_amount: number | null;
      status: string; adherent_nom: string; matricule: string | null;
    }>();

  return success(c, {
    ...rowToBordereau(row),
    lignes: lignes.map((l) => ({
      id: l.id,
      numeroBulletin: l.bulletin_number,
      dateSoin: l.bulletin_date,
      adherentNom: l.adherent_nom,
      matricule: l.matricule,
      typeSoin: l.care_type,
      montantDemande: l.total_amount ?? 0,
      montantRembourse: l.reimbursed_amount ?? 0,
      status: l.status,
    })),
  });
});

/**
 * POST /api/v1/sante/bordereaux
 * Generate a new bordereau from approved/reimbursed bulletins
 */
bordereaux.post(
  '/',
  requireRole('SOIN_GESTIONNAIRE', 'INSURER_ADMIN', 'INSURER_AGENT', 'ADMIN'),
  zValidator('json', createBordereauSchema),
  async (c) => {
    const data = c.req.valid('json');
    const user = c.get('user');
    const db = getDb(c);

    // Find bulletins that are approved/reimbursed, in the period, and not yet in a bordereau
    const { results: bulletinsEligibles } = await db.prepare(`
      SELECT id, total_amount, reimbursed_amount
      FROM bulletins_soins
      WHERE status IN ('approved', 'reimbursed')
        AND bordereau_id IS NULL
        AND bulletin_date >= ?
        AND bulletin_date <= ?
    `)
      .bind(data.periodeDebut, data.periodeFin)
      .all<{ id: string; total_amount: number | null; reimbursed_amount: number | null }>();

    if (bulletinsEligibles.length === 0) {
      return badRequest(c, 'Aucun bulletin validé/remboursé trouvé pour cette période');
    }

    const now = new Date().toISOString();
    const id = generateId();
    const numeroBordereau = generateNumeroBordereau();
    const montantTotal = bulletinsEligibles.reduce((sum, b) => sum + (b.reimbursed_amount ?? 0), 0);

    // Create bordereau in sante_bordereaux
    await db.prepare(`
      INSERT INTO sante_bordereaux (
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
        bulletinsEligibles.length,
        montantTotal,
        now,
        user.sub,
        data.notes ?? null,
        now,
        now
      )
      .run();

    // Link bulletins to this bordereau via bordereau_id
    const bulletinIds = bulletinsEligibles.map(b => b.id);
    const placeholders = bulletinIds.map(() => '?').join(',');
    await db.prepare(`
      UPDATE bulletins_soins SET bordereau_id = ?, updated_at = datetime('now')
      WHERE id IN (${placeholders})
    `)
      .bind(id, ...bulletinIds)
      .run();

    await logAudit(db, {
      userId: user.sub,
      action: 'bordereaux.create',
      entityType: 'bordereaux',
      entityId: id,
      changes: {
        numeroBordereau,
        periodeDebut: data.periodeDebut,
        periodeFin: data.periodeFin,
        nombreBulletins: bulletinsEligibles.length,
        montantTotal,
      },
    });

    const bordereau = await db.prepare('SELECT * FROM sante_bordereaux WHERE id = ?')
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
  requireRole('SOIN_GESTIONNAIRE', 'INSURER_ADMIN', 'INSURER_AGENT', 'ADMIN'),
  zValidator('json', updateBordereauStatutSchema),
  async (c) => {
    const id = c.req.param('id');
    const data = c.req.valid('json');
    const user = c.get('user');
    const db = getDb(c);

    const existing = await db.prepare('SELECT * FROM sante_bordereaux WHERE id = ?')
      .bind(id)
      .first<BordereauRow>();

    if (!existing) {
      return notFound(c, 'Bordereau non trouvé');
    }

    // Validate status transitions
    const validTransitions: Record<string, string[]> = {
      genere: ['valide', 'annule', 'archive'],
      valide: ['envoye', 'annule', 'archive'],
      envoye: ['paye', 'annule', 'archive'],
      paye: ['archive'],
      annule: ['archive'],
      archive: [],
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

    await db.prepare(
      `UPDATE sante_bordereaux SET ${updates.join(', ')} WHERE id = ?`
    )
      .bind(...params)
      .run();

    // If marked as paid, update all linked bulletins to 'exported' status
    if (data.statut === 'paye') {
      await db.prepare(`
        UPDATE bulletins_soins
        SET status = 'exported', updated_at = ?
        WHERE bordereau_id = ?
      `)
        .bind(now, id)
        .run();
    }

    await logAudit(db, {
      userId: user.sub,
      action: 'bordereaux.update_status',
      entityType: 'bordereaux',
      entityId: id,
      changes: { oldStatut: existing.statut, newStatut: data.statut },
    });

    const bordereau = await db.prepare('SELECT * FROM sante_bordereaux WHERE id = ?')
      .bind(id)
      .first<BordereauRow>();

    return success(c, rowToBordereau(bordereau!));
  }
);

/**
 * POST /api/v1/sante/bordereaux/bulk-archive
 * Archive multiple bordereaux
 */
bordereaux.post(
  '/bulk-archive',
  requireRole('SOIN_GESTIONNAIRE', 'INSURER_ADMIN', 'INSURER_AGENT', 'ADMIN'),
  zValidator('json', bulkActionSchema),
  async (c) => {
    const user = c.get('user');
    const db = getDb(c);
    const { ids } = c.req.valid('json');
    const now = new Date().toISOString();

    const placeholders = ids.map(() => '?').join(',');
    await db.prepare(
      `UPDATE sante_bordereaux SET statut = 'archive', updated_at = ? WHERE id IN (${placeholders})`
    )
      .bind(now, ...ids)
      .run();

    await logAudit(db, {
      userId: user.sub,
      action: 'bordereaux.bulk_archive',
      entityType: 'bordereaux',
      entityId: ids.join(','),
      changes: { ids, count: ids.length },
    });

    return success(c, { archived: ids.length });
  }
);

/**
 * POST /api/v1/sante/bordereaux/bulk-delete
 * Delete multiple bordereaux (unlinks bulletins first)
 */
bordereaux.post(
  '/bulk-delete',
  requireRole('ADMIN', 'INSURER_ADMIN'),
  zValidator('json', bulkActionSchema),
  async (c) => {
    const user = c.get('user');
    const db = getDb(c);
    const { ids } = c.req.valid('json');
    const now = new Date().toISOString();

    const placeholders = ids.map(() => '?').join(',');

    // Unlink bulletins from these bordereaux
    await db.prepare(
      `UPDATE bulletins_soins SET bordereau_id = NULL, updated_at = ? WHERE bordereau_id IN (${placeholders})`
    )
      .bind(now, ...ids)
      .run();

    // Delete the bordereaux
    await db.prepare(
      `DELETE FROM sante_bordereaux WHERE id IN (${placeholders})`
    )
      .bind(...ids)
      .run();

    await logAudit(db, {
      userId: user.sub,
      action: 'bordereaux.bulk_delete',
      entityType: 'bordereaux',
      entityId: ids.join(','),
      changes: { ids, count: ids.length },
    });

    return success(c, { deleted: ids.length });
  }
);

/**
 * GET /api/v1/sante/bordereaux/:id/export
 * Export bordereau to CSV or PDF
 */
bordereaux.get('/:id/export', requireRole('SOIN_GESTIONNAIRE', 'INSURER_ADMIN', 'INSURER_AGENT', 'ADMIN'), async (c) => {
  const id = c.req.param('id');
  const format = c.req.query('format') || 'csv';
  const db = getDb(c);

  const bordereau = await db.prepare('SELECT * FROM sante_bordereaux WHERE id = ?')
    .bind(id)
    .first<BordereauRow>();

  if (!bordereau) {
    return notFound(c, 'Bordereau non trouvé');
  }

  // Get bulletins linked to this bordereau
  const { results: lignes } = await db.prepare(`
    SELECT
      bs.bulletin_number, bs.bulletin_date, bs.care_type,
      bs.total_amount, bs.reimbursed_amount,
      COALESCE(bs.adherent_first_name, a.first_name, '') as first_name,
      COALESCE(bs.adherent_last_name, a.last_name, '') as last_name,
      a.matricule
    FROM bulletins_soins bs
    LEFT JOIN adherents a ON bs.adherent_id = a.id
    WHERE bs.bordereau_id = ?
    ORDER BY bs.bulletin_date ASC
  `)
    .bind(id)
    .all<{
      bulletin_number: string;
      bulletin_date: string;
      care_type: string;
      total_amount: number | null;
      reimbursed_amount: number | null;
      first_name: string;
      last_name: string;
      matricule: string | null;
    }>();

  if (format === 'pdf') {
    const { generatePDFHTML, formatAmount: fmtAmt, formatDate: fmtDate } = await import('../../services/pdf-generator.service');

    const html = generatePDFHTML(
      {
        title: `Bordereau ${bordereau.numero_bordereau}`,
        subtitle: `Période: ${fmtDate(bordereau.periode_debut)} — ${fmtDate(bordereau.periode_fin)}`,
      },
      [
        {
          type: 'summary',
          data: {
            items: [
              { label: 'Numéro', value: bordereau.numero_bordereau },
              { label: 'Statut', value: bordereau.statut.toUpperCase() },
              { label: 'Nombre de bulletins', value: String(bordereau.nombre_demandes) },
              { label: 'Montant total', value: fmtAmt(bordereau.montant_total) },
              { label: 'Date de génération', value: fmtDate(bordereau.date_generation) },
              ...(bordereau.date_validation ? [{ label: 'Date de validation', value: fmtDate(bordereau.date_validation) }] : []),
              ...(bordereau.date_envoi ? [{ label: "Date d'envoi", value: fmtDate(bordereau.date_envoi) }] : []),
              ...(bordereau.date_paiement ? [{ label: 'Date de paiement', value: fmtDate(bordereau.date_paiement) }] : []),
            ],
          },
        },
        { type: 'spacer', data: null },
        { type: 'heading', data: 'Détail des bulletins' },
        {
          type: 'table',
          data: {
            columns: [
              { key: 'bulletin_number', header: 'N° Bulletin' },
              { key: 'matricule', header: 'Matricule' },
              { key: 'nom', header: 'Nom' },
              { key: 'care_type', header: 'Type Soin' },
              { key: 'bulletin_date', header: 'Date Soin' },
              { key: 'total_amount', header: 'Total', align: 'right' as const, format: (v: unknown) => fmtAmt(v as number) },
              { key: 'reimbursed_amount', header: 'Remboursé', align: 'right' as const, format: (v: unknown) => fmtAmt(v as number) },
            ],
            rows: lignes.map((l) => ({
              bulletin_number: l.bulletin_number,
              matricule: l.matricule ?? '',
              nom: `${l.last_name} ${l.first_name}`,
              care_type: l.care_type,
              bulletin_date: l.bulletin_date,
              total_amount: l.total_amount ?? 0,
              reimbursed_amount: l.reimbursed_amount ?? 0,
            })),
          },
        },
      ]
    );

    return new Response(html, {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Content-Disposition': `attachment; filename="bordereau-${bordereau.numero_bordereau}.html"`,
      },
    });
  }

  // CSV format
  const headers = [
    'N° Bulletin',
    'Matricule',
    'Nom',
    'Prénom',
    'Type Soin',
    'Date Soin',
    'Montant Total',
    'Montant Remboursé',
  ];

  const rows = lignes.map((l) => [
    `"${l.bulletin_number}"`,
    `"${l.matricule ?? ''}"`,
    `"${l.last_name}"`,
    `"${l.first_name}"`,
    `"${l.care_type}"`,
    `"${l.bulletin_date}"`,
    String(l.total_amount ?? 0),
    String(l.reimbursed_amount ?? 0),
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
