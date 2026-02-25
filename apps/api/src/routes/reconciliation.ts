/**
 * Reconciliation Routes
 *
 * API endpoints for claims reconciliation and bordereau management
 */

import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { ulid } from 'ulid';
import type { Bindings, Variables } from '../types';
import { authMiddleware, requireRole } from '../middleware/auth';

const reconciliation = new Hono<{ Bindings: Bindings; Variables: Variables }>();

// All routes require authentication
reconciliation.use('*', authMiddleware());

// Query schemas
const listQuerySchema = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(20),
  period: z.string().regex(/^\d{4}-\d{2}$/).optional(),
  status: z.enum(['MATCHED', 'UNMATCHED', 'DISPUTED', 'RESOLVED']).optional(),
  insurerId: z.string().optional(),
  providerId: z.string().optional(),
});

const summaryQuerySchema = z.object({
  period: z.string().regex(/^\d{4}-\d{2}$/),
  insurerId: z.string().optional(),
});

const runReconciliationSchema = z.object({
  insurerId: z.string().min(1),
  providerId: z.string().optional(),
  periodStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  periodEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  cycleType: z.enum(['weekly', 'monthly', 'custom']),
});

const resolveDiscrepancySchema = z.object({
  resolution: z.string().min(1),
  adjustedAmount: z.number().optional(),
});

/**
 * GET /reconciliation
 * List reconciliation items with pagination
 */
reconciliation.get('/', zValidator('query', listQuerySchema), async (c) => {
  const user = c.get('user');
  const { page, limit, period, status, insurerId, providerId } = c.req.valid('query');
  const offset = (page - 1) * limit;

  let whereClause = 'WHERE 1=1';
  const params: (string | number)[] = [];

  // Filter by user's org
  if (user.insurerId) {
    whereClause += ' AND b.insurer_id = ?';
    params.push(user.insurerId);
  } else if (user.providerId) {
    whereClause += ' AND b.provider_id = ?';
    params.push(user.providerId);
  }

  if (period) {
    whereClause += ' AND strftime("%Y-%m", b.period_start) = ?';
    params.push(period);
  }
  if (status) {
    whereClause += ' AND r.status = ?';
    params.push(status);
  }
  if (insurerId) {
    whereClause += ' AND b.insurer_id = ?';
    params.push(insurerId);
  }
  if (providerId) {
    whereClause += ' AND b.provider_id = ?';
    params.push(providerId);
  }

  const [countResult, items] = await Promise.all([
    c.env.DB.prepare(`
      SELECT COUNT(*) as total
      FROM reconciliation_items r
      JOIN bordereaux b ON r.bordereau_id = b.id
      ${whereClause}
    `)
      .bind(...params)
      .first<{ total: number }>(),
    c.env.DB.prepare(`
      SELECT r.*,
             b.bordereau_number,
             b.period_start,
             b.period_end,
             p.id as provider_id,
             p.name as provider_name
      FROM reconciliation_items r
      JOIN bordereaux b ON r.bordereau_id = b.id
      LEFT JOIN providers p ON b.provider_id = p.id
      ${whereClause}
      ORDER BY r.created_at DESC
      LIMIT ? OFFSET ?
    `)
      .bind(...params, limit, offset)
      .all(),
  ]);

  return c.json({
    success: true,
    data: {
      items: (items.results || []).map((item) => ({
        id: item.id,
        bordereauId: item.bordereau_id,
        bordereauNumber: item.bordereau_number,
        providerId: item.provider_id,
        providerName: item.provider_name,
        period: `${item.period_start} - ${item.period_end}`,
        claimCount: item.claim_count,
        declaredAmount: item.declared_amount,
        verifiedAmount: item.verified_amount,
        difference: item.difference,
        status: item.status,
        createdAt: item.created_at,
      })),
      total: countResult?.total || 0,
    },
  });
});

/**
 * GET /reconciliation/summary
 * Get reconciliation summary for a period
 */
reconciliation.get('/summary', zValidator('query', summaryQuerySchema), async (c) => {
  const user = c.get('user');
  const { period, insurerId } = c.req.valid('query');

  let whereClause = "WHERE strftime('%Y-%m', b.period_start) = ?";
  const params: string[] = [period];

  // Filter by user's org
  if (user.insurerId) {
    whereClause += ' AND b.insurer_id = ?';
    params.push(user.insurerId);
  } else if (insurerId) {
    whereClause += ' AND b.insurer_id = ?';
    params.push(insurerId);
  }

  const summary = await c.env.DB.prepare(`
    SELECT
      COUNT(*) as total_claims,
      COALESCE(SUM(r.declared_amount), 0) as total_amount,
      COALESCE(SUM(CASE WHEN r.status = 'MATCHED' THEN 1 ELSE 0 END), 0) as matched_claims,
      COALESCE(SUM(CASE WHEN r.status = 'MATCHED' THEN r.verified_amount ELSE 0 END), 0) as matched_amount,
      COALESCE(SUM(CASE WHEN r.status = 'UNMATCHED' THEN 1 ELSE 0 END), 0) as unmatched_claims,
      COALESCE(SUM(CASE WHEN r.status = 'UNMATCHED' THEN r.declared_amount ELSE 0 END), 0) as unmatched_amount,
      COALESCE(SUM(CASE WHEN r.status = 'DISPUTED' THEN 1 ELSE 0 END), 0) as disputed_claims,
      COALESCE(SUM(CASE WHEN r.status = 'DISPUTED' THEN r.declared_amount ELSE 0 END), 0) as disputed_amount
    FROM reconciliation_items r
    JOIN bordereaux b ON r.bordereau_id = b.id
    ${whereClause}
  `)
    .bind(...params)
    .first();

  const totalClaims = Number(summary?.total_claims || 0);
  const matchedClaims = Number(summary?.matched_claims || 0);
  const matchRate = totalClaims > 0 ? (matchedClaims / totalClaims) * 100 : 0;

  return c.json({
    success: true,
    data: {
      period,
      totalClaims,
      totalAmount: Number(summary?.total_amount || 0),
      matchedClaims,
      matchedAmount: Number(summary?.matched_amount || 0),
      unmatchedClaims: Number(summary?.unmatched_claims || 0),
      unmatchedAmount: Number(summary?.unmatched_amount || 0),
      disputedClaims: Number(summary?.disputed_claims || 0),
      disputedAmount: Number(summary?.disputed_amount || 0),
      matchRate,
    },
  });
});

/**
 * GET /reconciliation/:id
 * Get a specific reconciliation item
 */
reconciliation.get('/:id', async (c) => {
  const itemId = c.req.param('id');

  const item = await c.env.DB.prepare(`
    SELECT r.*,
           b.bordereau_number,
           b.period_start,
           b.period_end,
           p.id as provider_id,
           p.name as provider_name,
           i.name as insurer_name
    FROM reconciliation_items r
    JOIN bordereaux b ON r.bordereau_id = b.id
    LEFT JOIN providers p ON b.provider_id = p.id
    LEFT JOIN insurers i ON b.insurer_id = i.id
    WHERE r.id = ?
  `)
    .bind(itemId)
    .first();

  if (!item) {
    return c.json(
      { success: false, error: { code: 'NOT_FOUND', message: 'Élément de réconciliation non trouvé' } },
      404
    );
  }

  // Get discrepancy details if any
  const discrepancies = await c.env.DB.prepare(`
    SELECT * FROM reconciliation_discrepancies
    WHERE reconciliation_item_id = ?
    ORDER BY created_at DESC
  `)
    .bind(itemId)
    .all();

  return c.json({
    success: true,
    data: {
      id: item.id,
      bordereauId: item.bordereau_id,
      bordereauNumber: item.bordereau_number,
      providerId: item.provider_id,
      providerName: item.provider_name,
      insurerName: item.insurer_name,
      period: `${item.period_start} - ${item.period_end}`,
      claimCount: item.claim_count,
      declaredAmount: item.declared_amount,
      verifiedAmount: item.verified_amount,
      difference: item.difference,
      status: item.status,
      createdAt: item.created_at,
      discrepancies: (discrepancies.results || []).map((d) => ({
        id: d.id,
        type: d.discrepancy_type,
        description: d.description,
        amount: d.amount,
        status: d.status,
        resolution: d.resolution,
        resolvedAt: d.resolved_at,
      })),
    },
  });
});

/**
 * POST /reconciliation/run
 * Run reconciliation for a period
 */
reconciliation.post(
  '/run',
  requireRole('INSURER_ADMIN', 'INSURER_AGENT', 'ADMIN'),
  zValidator('json', runReconciliationSchema),
  async (c) => {
    const user = c.get('user');
    const { insurerId, providerId, periodStart, periodEnd, cycleType } = c.req.valid('json');

    // Get all bordereaux for the period that haven't been reconciled
    let bordereauWhere = 'WHERE b.insurer_id = ? AND b.period_start >= ? AND b.period_end <= ? AND b.status IN (?, ?)';
    const bordereauParams: string[] = [insurerId, periodStart, periodEnd, 'SUBMITTED', 'VALIDATED'];

    if (providerId) {
      bordereauWhere += ' AND b.provider_id = ?';
      bordereauParams.push(providerId);
    }

    const bordereaux = await c.env.DB.prepare(`
      SELECT b.*,
             COALESCE(SUM(c.total_amount), 0) as claims_total,
             COALESCE(SUM(c.covered_amount), 0) as claims_covered,
             COUNT(c.id) as claims_count
      FROM bordereaux b
      LEFT JOIN claims c ON c.bordereau_id = b.id
      ${bordereauWhere}
      GROUP BY b.id
    `)
      .bind(...bordereauParams)
      .all();

    const results = [];
    const now = new Date().toISOString();

    for (const bordereau of bordereaux.results || []) {
      const itemId = ulid();
      const declaredAmount = Number(bordereau.covered_amount || 0);
      const verifiedAmount = Number(bordereau.claims_covered || 0);
      const difference = verifiedAmount - declaredAmount;

      // Determine status based on difference
      let status = 'MATCHED';
      if (Math.abs(difference) > 1000) {
        // Threshold of 1 TND (1000 millimes)
        status = 'UNMATCHED';
      }

      await c.env.DB.prepare(`
        INSERT INTO reconciliation_items (
          id, bordereau_id, claim_count, declared_amount, verified_amount,
          difference, status, created_at, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
        .bind(
          itemId,
          bordereau.id,
          bordereau.claims_count,
          declaredAmount,
          verifiedAmount,
          difference,
          status,
          now,
          now
        )
        .run();

      // Log discrepancy if unmatched
      if (status === 'UNMATCHED') {
        await c.env.DB.prepare(`
          INSERT INTO reconciliation_discrepancies (
            id, reconciliation_item_id, discrepancy_type, description,
            amount, status, created_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `)
          .bind(
            ulid(),
            itemId,
            'AMOUNT_MISMATCH',
            `Écart de ${Math.abs(difference / 1000).toFixed(3)} TND entre le montant déclaré et vérifié`,
            Math.abs(difference),
            'PENDING',
            now
          )
          .run();
      }

      results.push({
        bordereauId: bordereau.id,
        bordereauNumber: bordereau.bordereau_number,
        status,
        difference,
      });
    }

    // Audit log
    await c.env.DB.prepare(`
      INSERT INTO audit_logs (id, user_id, action, entity_type, entity_id, details, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `)
      .bind(
        ulid(),
        user.sub,
        'RECONCILE',
        'RECONCILIATION',
        insurerId,
        JSON.stringify({ periodStart, periodEnd, cycleType, count: results.length }),
        now
      )
      .run();

    return c.json({
      success: true,
      data: {
        processed: results.length,
        matched: results.filter((r) => r.status === 'MATCHED').length,
        unmatched: results.filter((r) => r.status === 'UNMATCHED').length,
        results,
      },
    });
  }
);

/**
 * POST /reconciliation/:id/reconcile
 * Mark an item as reconciled/matched
 */
reconciliation.post(
  '/:id/reconcile',
  requireRole('INSURER_ADMIN', 'INSURER_AGENT', 'ADMIN'),
  async (c) => {
    const user = c.get('user');
    const itemId = c.req.param('id');

    const item = await c.env.DB.prepare('SELECT * FROM reconciliation_items WHERE id = ?')
      .bind(itemId)
      .first();

    if (!item) {
      return c.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Élément non trouvé' } },
        404
      );
    }

    if (item.status === 'MATCHED') {
      return c.json(
        { success: false, error: { code: 'ALREADY_MATCHED', message: 'Cet élément est déjà rapproché' } },
        400
      );
    }

    const now = new Date().toISOString();

    await c.env.DB.prepare(`
      UPDATE reconciliation_items
      SET status = 'MATCHED', updated_at = ?
      WHERE id = ?
    `)
      .bind(now, itemId)
      .run();

    // Update any pending discrepancies
    await c.env.DB.prepare(`
      UPDATE reconciliation_discrepancies
      SET status = 'RESOLVED', resolution = 'Rapprochement manuel', resolved_at = ?
      WHERE reconciliation_item_id = ? AND status = 'PENDING'
    `)
      .bind(now, itemId)
      .run();

    // Audit log
    await c.env.DB.prepare(`
      INSERT INTO audit_logs (id, user_id, action, entity_type, entity_id, details, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `)
      .bind(
        ulid(),
        user.sub,
        'RECONCILE_MANUAL',
        'RECONCILIATION_ITEM',
        itemId,
        JSON.stringify({ previousStatus: item.status }),
        now
      )
      .run();

    return c.json({
      success: true,
      data: {
        id: itemId,
        status: 'MATCHED',
        updatedAt: now,
      },
    });
  }
);

/**
 * POST /reconciliation/discrepancies/:id/resolve
 * Resolve a discrepancy
 */
reconciliation.post(
  '/discrepancies/:id/resolve',
  requireRole('INSURER_ADMIN', 'INSURER_AGENT', 'ADMIN'),
  zValidator('json', resolveDiscrepancySchema),
  async (c) => {
    const user = c.get('user');
    const discrepancyId = c.req.param('id');
    const { resolution, adjustedAmount } = c.req.valid('json');

    const discrepancy = await c.env.DB.prepare(
      'SELECT * FROM reconciliation_discrepancies WHERE id = ?'
    )
      .bind(discrepancyId)
      .first();

    if (!discrepancy) {
      return c.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Écart non trouvé' } },
        404
      );
    }

    if (discrepancy.status === 'RESOLVED') {
      return c.json(
        { success: false, error: { code: 'ALREADY_RESOLVED', message: 'Cet écart est déjà résolu' } },
        400
      );
    }

    const now = new Date().toISOString();

    await c.env.DB.prepare(`
      UPDATE reconciliation_discrepancies
      SET status = 'RESOLVED', resolution = ?, adjusted_amount = ?, resolved_at = ?
      WHERE id = ?
    `)
      .bind(resolution, adjustedAmount || null, now, discrepancyId)
      .run();

    // Check if all discrepancies for this item are resolved
    const pendingCount = await c.env.DB.prepare(`
      SELECT COUNT(*) as count FROM reconciliation_discrepancies
      WHERE reconciliation_item_id = ? AND status = 'PENDING'
    `)
      .bind(discrepancy.reconciliation_item_id)
      .first<{ count: number }>();

    // If no more pending discrepancies, mark item as resolved
    if (pendingCount?.count === 0) {
      await c.env.DB.prepare(`
        UPDATE reconciliation_items SET status = 'RESOLVED', updated_at = ?
        WHERE id = ?
      `)
        .bind(now, discrepancy.reconciliation_item_id)
        .run();
    }

    // Audit log
    await c.env.DB.prepare(`
      INSERT INTO audit_logs (id, user_id, action, entity_type, entity_id, details, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `)
      .bind(
        ulid(),
        user.sub,
        'RESOLVE_DISCREPANCY',
        'RECONCILIATION_DISCREPANCY',
        discrepancyId,
        JSON.stringify({ resolution, adjustedAmount }),
        now
      )
      .run();

    return c.json({
      success: true,
      data: {
        id: discrepancyId,
        status: 'RESOLVED',
        resolution,
        resolvedAt: now,
      },
    });
  }
);

/**
 * GET /reconciliation/export
 * Export reconciliation data as CSV/Excel
 */
reconciliation.get(
  '/export',
  zValidator('query', summaryQuerySchema),
  async (c) => {
    const user = c.get('user');
    const { period, insurerId } = c.req.valid('query');

    let whereClause = "WHERE strftime('%Y-%m', b.period_start) = ?";
    const params: string[] = [period];

    if (user.insurerId) {
      whereClause += ' AND b.insurer_id = ?';
      params.push(user.insurerId);
    } else if (insurerId) {
      whereClause += ' AND b.insurer_id = ?';
      params.push(insurerId);
    }

    const items = await c.env.DB.prepare(`
      SELECT r.*,
             b.bordereau_number,
             b.period_start,
             b.period_end,
             p.name as provider_name,
             i.name as insurer_name
      FROM reconciliation_items r
      JOIN bordereaux b ON r.bordereau_id = b.id
      LEFT JOIN providers p ON b.provider_id = p.id
      LEFT JOIN insurers i ON b.insurer_id = i.id
      ${whereClause}
      ORDER BY r.created_at DESC
    `)
      .bind(...params)
      .all();

    // Generate CSV content
    const headers = [
      'Bordereau',
      'Prestataire',
      'Période',
      'Nombre PEC',
      'Montant Déclaré (TND)',
      'Montant Vérifié (TND)',
      'Écart (TND)',
      'Statut',
      'Date',
    ];

    const rows = (items.results || []).map((item) => [
      item.bordereau_number,
      item.provider_name,
      `${item.period_start} - ${item.period_end}`,
      item.claim_count,
      (Number(item.declared_amount) / 1000).toFixed(3),
      (Number(item.verified_amount) / 1000).toFixed(3),
      (Number(item.difference) / 1000).toFixed(3),
      item.status,
      new Date(item.created_at as string).toLocaleDateString('fr-TN'),
    ]);

    const csv = [
      headers.join(','),
      ...rows.map((row) =>
        row.map((cell) => (typeof cell === 'string' && cell.includes(',') ? `"${cell}"` : cell)).join(',')
      ),
    ].join('\n');

    // Return as CSV (could be enhanced to Excel with a proper library)
    return new Response(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="reconciliation-${period}.csv"`,
      },
    });
  }
);

export { reconciliation };
