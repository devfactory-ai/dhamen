/**
 * Bordereaux Routes
 *
 * API endpoints for managing bordereaux (payment statements)
 * Bordereaux group validated/reimbursed bulletins by period for insurer billing
 */

import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { ulid } from 'ulid';
import type { Bindings, Variables } from '../types';
import { getDb } from '../lib/db';
import { authMiddleware, requireRole } from '../middleware/auth';

const bordereaux = new Hono<{ Bindings: Bindings; Variables: Variables }>();

// All routes require authentication
bordereaux.use('*', authMiddleware());

// Query schemas
const listQuerySchema = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(20),
  status: z.enum(['DRAFT', 'SUBMITTED', 'VALIDATED', 'PAID', 'DISPUTED']).optional(),
  insurerId: z.string().optional(),
  providerId: z.string().optional(),
});

const generateSchema = z.object({
  periodStart: z.string().min(1, 'Date de début requise'),
  periodEnd: z.string().min(1, 'Date de fin requise'),
  notes: z.string().optional(),
});

/**
 * GET /bordereaux
 * List bordereaux with pagination and filters
 */
bordereaux.get('/', zValidator('query', listQuerySchema), async (c) => {
  const user = c.get('user');
  const { page, limit, status, insurerId, providerId } = c.req.valid('query');
  const offset = (page - 1) * limit;
  const db = getDb(c);

  let whereClause = 'WHERE 1=1';
  const params: (string | number)[] = [];

  // Filter by user's provider or insurer
  if (user.providerId) {
    whereClause += ' AND b.provider_id = ?';
    params.push(user.providerId);
  } else if (user.insurerId) {
    whereClause += ' AND b.insurer_id = ?';
    params.push(user.insurerId);
  }

  if (status) {
    whereClause += ' AND b.status = ?';
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

  try {
    const [countResult, bordereauxResult] = await Promise.all([
      db.prepare(`SELECT COUNT(*) as total FROM bordereaux b ${whereClause}`)
        .bind(...params)
        .first<{ total: number }>(),
      db.prepare(`
        SELECT b.*,
               i.name as insurer_name,
               p.name as provider_name
        FROM bordereaux b
        LEFT JOIN insurers i ON b.insurer_id = i.id
        LEFT JOIN providers p ON b.provider_id = p.id
        ${whereClause}
        ORDER BY b.created_at DESC
        LIMIT ? OFFSET ?
      `)
        .bind(...params, limit, offset)
        .all(),
    ]);

    return c.json({
      success: true,
      data: {
        bordereaux: (bordereauxResult.results || []).map((b) => ({
          id: b.id,
          bordereauNumber: b.bordereau_number,
          insurerId: b.insurer_id,
          insurerName: b.insurer_name,
          providerId: b.provider_id,
          providerName: b.provider_name,
          periodStart: b.period_start,
          periodEnd: b.period_end,
          status: b.status,
          claimsCount: b.claims_count,
          totalAmount: b.total_amount,
          coveredAmount: b.covered_amount,
          paidAmount: b.paid_amount,
          submittedAt: b.submitted_at,
          paidAt: b.paid_at,
          createdAt: b.created_at,
        })),
        total: countResult?.total || 0,
      },
    });
  } catch (error) {
    console.error('[bordereaux] List error:', error);
    return c.json({
      success: false,
      error: { code: 'DATABASE_ERROR', message: 'Erreur lors de la récupération des bordereaux' },
    }, 500);
  }
});

/**
 * GET /bordereaux/available-bulletins
 * Get count and summary of bulletins available for bordereau generation
 */
bordereaux.get('/available-bulletins', async (c) => {
  const db = getDb(c);
  const periodStart = c.req.query('periodStart');
  const periodEnd = c.req.query('periodEnd');

  let whereClause = "WHERE bs.status IN ('approved', 'reimbursed') AND bs.bordereau_id IS NULL";
  const params: (string | number)[] = [];

  if (periodStart) {
    whereClause += ' AND bs.bulletin_date >= ?';
    params.push(periodStart);
  }
  if (periodEnd) {
    whereClause += ' AND bs.bulletin_date <= ?';
    params.push(periodEnd);
  }

  try {
    const summary = await db.prepare(`
      SELECT
        COUNT(*) as count,
        COALESCE(SUM(bs.total_amount), 0) as total_amount,
        COALESCE(SUM(bs.reimbursed_amount), 0) as reimbursed_amount
      FROM bulletins_soins bs
      ${whereClause}
    `)
      .bind(...params)
      .first<{ count: number; total_amount: number; reimbursed_amount: number }>();

    return c.json({
      success: true,
      data: {
        count: summary?.count || 0,
        totalAmount: summary?.total_amount || 0,
        reimbursedAmount: summary?.reimbursed_amount || 0,
      },
    });
  } catch (error) {
    console.error('[bordereaux] Available bulletins error:', error);
    return c.json({
      success: false,
      error: { code: 'DATABASE_ERROR', message: 'Erreur lors du comptage des bulletins' },
    }, 500);
  }
});

/**
 * POST /bordereaux/generate
 * Generate a new bordereau from validated/reimbursed bulletins in a period
 */
bordereaux.post(
  '/generate',
  requireRole('ADMIN', 'INSURER_ADMIN', 'INSURER_AGENT'),
  zValidator('json', generateSchema),
  async (c) => {
    const user = c.get('user');
    const db = getDb(c);
    const { periodStart, periodEnd, notes } = c.req.valid('json');

    // Find all bulletins in the period that are approved/reimbursed and not yet in a bordereau
    const bulletins = await db.prepare(`
      SELECT bs.id, bs.bulletin_number, bs.bulletin_date, bs.total_amount, bs.reimbursed_amount,
             bs.care_type, bs.adherent_id,
             COALESCE(bs.adherent_first_name, a.first_name) as first_name,
             COALESCE(bs.adherent_last_name, a.last_name) as last_name,
             a.national_id,
             c.insurer_id
      FROM bulletins_soins bs
      LEFT JOIN adherents a ON bs.adherent_id = a.id
      LEFT JOIN contracts c ON c.adherent_id = bs.adherent_id AND c.status = 'active'
      WHERE bs.status IN ('approved', 'reimbursed')
        AND bs.bordereau_id IS NULL
        AND bs.bulletin_date >= ?
        AND bs.bulletin_date <= ?
      ORDER BY bs.bulletin_date ASC
    `)
      .bind(periodStart, periodEnd)
      .all<{
        id: string; bulletin_number: string; bulletin_date: string;
        total_amount: number | null; reimbursed_amount: number | null;
        care_type: string; adherent_id: string;
        first_name: string; last_name: string; national_id: string;
        insurer_id: string | null;
      }>();

    if (!bulletins.results || bulletins.results.length === 0) {
      return c.json({
        success: false,
        error: {
          code: 'NO_BULLETINS',
          message: 'Aucun bulletin validé/remboursé trouvé pour cette période',
        },
      }, 400);
    }

    const bulletinsList = bulletins.results;

    // Calculate totals
    const totalAmount = bulletinsList.reduce((sum, b) => sum + (b.total_amount || 0), 0);
    const coveredAmount = bulletinsList.reduce((sum, b) => sum + (b.reimbursed_amount || 0), 0);

    // Get insurer from the first bulletin that has one
    const insurerId = bulletinsList.find(b => b.insurer_id)?.insurer_id || null;

    // Generate bordereau number: BDX-YYYYMM-XXXX
    const now = new Date();
    const yearMonth = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
    const countExisting = await db
      .prepare("SELECT COUNT(*) as cnt FROM bordereaux WHERE bordereau_number LIKE ?")
      .bind(`BDX-${yearMonth}-%`)
      .first<{ cnt: number }>();
    const seq = String((countExisting?.cnt || 0) + 1).padStart(4, '0');
    const bordereauNumber = `BDX-${yearMonth}-${seq}`;

    const bordereauId = ulid();

    // Create the bordereau
    await db.prepare(`
      INSERT INTO bordereaux (id, bordereau_number, insurer_id, period_start, period_end,
                              total_amount, claims_count, covered_amount, paid_amount,
                              status, generated_at, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 'DRAFT', datetime('now'), datetime('now'), datetime('now'))
    `)
      .bind(bordereauId, bordereauNumber, insurerId, periodStart, periodEnd,
            totalAmount, bulletinsList.length, coveredAmount)
      .run();

    // Link all bulletins to this bordereau
    const bulletinIds = bulletinsList.map(b => b.id);
    const placeholders = bulletinIds.map(() => '?').join(',');
    await db.prepare(`
      UPDATE bulletins_soins SET bordereau_id = ?, updated_at = datetime('now')
      WHERE id IN (${placeholders})
    `)
      .bind(bordereauId, ...bulletinIds)
      .run();

    // Audit log
    await db.prepare(`
      INSERT INTO audit_logs (id, user_id, action, entity_type, entity_id, changes_json, ip_address, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `)
      .bind(
        ulid(), user.sub, 'GENERATE', 'BORDEREAU', bordereauId,
        JSON.stringify({ periodStart, periodEnd, bulletinsCount: bulletinsList.length, totalAmount, coveredAmount, notes }),
        c.req.header('CF-Connecting-IP') || 'unknown'
      )
      .run();

    return c.json({
      success: true,
      message: `Bordereau ${bordereauNumber} généré avec ${bulletinsList.length} bulletin(s)`,
      data: {
        id: bordereauId,
        bordereauNumber,
        periodStart,
        periodEnd,
        claimsCount: bulletinsList.length,
        totalAmount,
        coveredAmount,
        status: 'DRAFT',
      },
    });
  }
);

/**
 * GET /bordereaux/:id
 * Get bordereau details with linked bulletins
 */
bordereaux.get('/:id', async (c) => {
  const bordereauId = c.req.param('id');
  const db = getDb(c);

  const bordereau = await db.prepare(`
    SELECT b.*,
           i.name as insurer_name,
           p.name as provider_name
    FROM bordereaux b
    LEFT JOIN insurers i ON b.insurer_id = i.id
    LEFT JOIN providers p ON b.provider_id = p.id
    WHERE b.id = ?
  `)
    .bind(bordereauId)
    .first();

  if (!bordereau) {
    return c.json(
      { success: false, error: { code: 'NOT_FOUND', message: 'Bordereau non trouvé' } },
      404
    );
  }

  // Get bulletins linked to this bordereau
  const bulletins = await db.prepare(`
    SELECT bs.id, bs.bulletin_number, bs.bulletin_date, bs.total_amount, bs.reimbursed_amount,
           bs.care_type, bs.status,
           COALESCE(bs.adherent_first_name, a.first_name, '') || ' ' || COALESCE(bs.adherent_last_name, a.last_name, '') as adherent_name,
           a.national_id
    FROM bulletins_soins bs
    LEFT JOIN adherents a ON bs.adherent_id = a.id
    WHERE bs.bordereau_id = ?
    ORDER BY bs.bulletin_date ASC
  `)
    .bind(bordereauId)
    .all();

  return c.json({
    success: true,
    data: {
      id: bordereau.id,
      bordereauNumber: bordereau.bordereau_number,
      insurerId: bordereau.insurer_id,
      insurerName: bordereau.insurer_name,
      providerId: bordereau.provider_id,
      providerName: bordereau.provider_name,
      periodStart: bordereau.period_start,
      periodEnd: bordereau.period_end,
      status: bordereau.status,
      claimsCount: bordereau.claims_count,
      totalAmount: bordereau.total_amount,
      coveredAmount: bordereau.covered_amount,
      paidAmount: bordereau.paid_amount,
      submittedAt: bordereau.submitted_at,
      validatedAt: bordereau.validated_at,
      paidAt: bordereau.paid_at,
      createdAt: bordereau.created_at,
      bulletins: (bulletins.results || []).map((bs) => ({
        id: bs.id,
        bulletinNumber: bs.bulletin_number,
        bulletinDate: bs.bulletin_date,
        adherentName: bs.adherent_name,
        nationalId: bs.national_id,
        careType: bs.care_type,
        totalAmount: bs.total_amount,
        reimbursedAmount: bs.reimbursed_amount,
        status: bs.status,
      })),
    },
  });
});

/**
 * POST /bordereaux/:id/submit
 * Submit a bordereau for validation
 */
bordereaux.post('/:id/submit', async (c) => {
  const user = c.get('user');
  const bordereauId = c.req.param('id');
  const db = getDb(c);

  const bordereau = await db.prepare('SELECT * FROM bordereaux WHERE id = ?')
    .bind(bordereauId)
    .first();

  if (!bordereau) {
    return c.json(
      { success: false, error: { code: 'NOT_FOUND', message: 'Bordereau non trouvé' } },
      404
    );
  }

  if (bordereau.status !== 'DRAFT') {
    return c.json(
      { success: false, error: { code: 'INVALID_STATUS', message: 'Ce bordereau ne peut pas être soumis' } },
      400
    );
  }

  if (user.providerId && bordereau.provider_id !== user.providerId) {
    return c.json(
      { success: false, error: { code: 'FORBIDDEN', message: 'Accès non autorisé' } },
      403
    );
  }

  await db.prepare(`
    UPDATE bordereaux
    SET status = 'SUBMITTED', submitted_at = datetime('now'), updated_at = datetime('now')
    WHERE id = ?
  `)
    .bind(bordereauId)
    .run();

  await db.prepare(`
    INSERT INTO audit_logs (id, user_id, action, entity_type, entity_id, changes_json, ip_address, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
  `)
    .bind(ulid(), user.sub, 'SUBMIT', 'BORDEREAU', bordereauId, JSON.stringify({ previousStatus: 'DRAFT' }), c.req.header('CF-Connecting-IP') || 'unknown')
    .run();

  return c.json({
    success: true,
    message: 'Bordereau soumis avec succès',
    data: { id: bordereauId, status: 'SUBMITTED', submittedAt: new Date().toISOString() },
  });
});

/**
 * POST /bordereaux/:id/validate
 * Validate a submitted bordereau (insurer only)
 */
bordereaux.post(
  '/:id/validate',
  requireRole('INSURER_ADMIN', 'INSURER_AGENT', 'ADMIN'),
  async (c) => {
    const user = c.get('user');
    const bordereauId = c.req.param('id');
    const db = getDb(c);

    const bordereau = await db.prepare('SELECT * FROM bordereaux WHERE id = ?')
      .bind(bordereauId)
      .first();

    if (!bordereau) {
      return c.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Bordereau non trouvé' } },
        404
      );
    }

    if (bordereau.status !== 'SUBMITTED') {
      return c.json(
        { success: false, error: { code: 'INVALID_STATUS', message: 'Ce bordereau ne peut pas être validé' } },
        400
      );
    }

    await db.prepare(`
      UPDATE bordereaux
      SET status = 'VALIDATED', validated_at = datetime('now'), updated_at = datetime('now')
      WHERE id = ?
    `)
      .bind(bordereauId)
      .run();

    await db.prepare(`
      INSERT INTO audit_logs (id, user_id, action, entity_type, entity_id, changes_json, ip_address, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `)
      .bind(ulid(), user.sub, 'VALIDATE', 'BORDEREAU', bordereauId, JSON.stringify({ previousStatus: 'SUBMITTED' }), c.req.header('CF-Connecting-IP') || 'unknown')
      .run();

    return c.json({
      success: true,
      message: 'Bordereau validé avec succès',
      data: { id: bordereauId, status: 'VALIDATED', validatedAt: new Date().toISOString() },
    });
  }
);

/**
 * POST /bordereaux/:id/pay
 * Mark a bordereau as paid (insurer only)
 */
bordereaux.post(
  '/:id/pay',
  requireRole('INSURER_ADMIN', 'INSURER_AGENT', 'ADMIN'),
  zValidator('json', z.object({
    paymentReference: z.string().min(1),
    paymentDate: z.string().optional(),
  })),
  async (c) => {
    const user = c.get('user');
    const bordereauId = c.req.param('id');
    const db = getDb(c);
    const { paymentReference, paymentDate } = c.req.valid('json');

    const bordereau = await db.prepare('SELECT * FROM bordereaux WHERE id = ?')
      .bind(bordereauId)
      .first();

    if (!bordereau) {
      return c.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Bordereau non trouvé' } },
        404
      );
    }

    if (bordereau.status !== 'VALIDATED') {
      return c.json(
        { success: false, error: { code: 'INVALID_STATUS', message: 'Ce bordereau ne peut pas être payé' } },
        400
      );
    }

    const paidAt = paymentDate || new Date().toISOString();

    await db.prepare(`
      UPDATE bordereaux
      SET status = 'PAID', paid_at = ?, paid_amount = covered_amount,
          payment_reference = ?, updated_at = datetime('now')
      WHERE id = ?
    `)
      .bind(paidAt, paymentReference, bordereauId)
      .run();

    await db.prepare(`
      INSERT INTO audit_logs (id, user_id, action, entity_type, entity_id, changes_json, ip_address, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `)
      .bind(ulid(), user.sub, 'PAY', 'BORDEREAU', bordereauId, JSON.stringify({ paymentReference, paidAt }), c.req.header('CF-Connecting-IP') || 'unknown')
      .run();

    return c.json({
      success: true,
      message: 'Bordereau marqué comme payé',
      data: { id: bordereauId, status: 'PAID', paidAt, paymentReference },
    });
  }
);

/**
 * GET /bordereaux/:id/pdf
 * Generate PDF for a bordereau
 */
bordereaux.get('/:id/pdf', async (c) => {
  const bordereauId = c.req.param('id');
  const db = getDb(c);

  const bordereau = await db.prepare(`
    SELECT b.*,
           i.name as insurer_name, i.address as insurer_address,
           p.name as provider_name, p.address as provider_address
    FROM bordereaux b
    LEFT JOIN insurers i ON b.insurer_id = i.id
    LEFT JOIN providers p ON b.provider_id = p.id
    WHERE b.id = ?
  `)
    .bind(bordereauId)
    .first();

  if (!bordereau) {
    return c.json(
      { success: false, error: { code: 'NOT_FOUND', message: 'Bordereau non trouvé' } },
      404
    );
  }

  // Get bulletins linked to this bordereau
  const bulletins = await db.prepare(`
    SELECT bs.bulletin_number, bs.bulletin_date, bs.total_amount, bs.reimbursed_amount,
           bs.care_type,
           COALESCE(bs.adherent_first_name, a.first_name, '') || ' ' || COALESCE(bs.adherent_last_name, a.last_name, '') as adherent_name,
           a.national_id
    FROM bulletins_soins bs
    LEFT JOIN adherents a ON bs.adherent_id = a.id
    WHERE bs.bordereau_id = ?
    ORDER BY bs.bulletin_date ASC
  `)
    .bind(bordereauId)
    .all();

  const content = generateBordereauPdfContent(bordereau, bulletins.results || []);

  return new Response(content, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Content-Disposition': `attachment; filename="bordereau-${bordereau.bordereau_number}.txt"`,
    },
  });
});

function generateBordereauPdfContent(bordereau: Record<string, unknown>, bulletins: Record<string, unknown>[]): string {
  const formatAmount = (amount: number) => (amount / 1000).toFixed(3) + ' TND';

  let content = `
BORDEREAU DE FACTURATION
========================

Numéro: ${bordereau.bordereau_number}
Date: ${new Date().toLocaleDateString('fr-TN')}

ASSUREUR
--------
${bordereau.insurer_name || 'N/A'}
${bordereau.insurer_address || ''}

PÉRIODE
-------
Du ${bordereau.period_start} au ${bordereau.period_end}

RÉCAPITULATIF
-------------
Nombre de bulletins: ${bordereau.claims_count}
Montant total: ${formatAmount(bordereau.total_amount as number)}
Montant remboursé: ${formatAmount(bordereau.covered_amount as number)}

DÉTAIL DES BULLETINS
--------------------
`;

  for (const bs of bulletins) {
    content += `
${bs.bulletin_number} | ${bs.adherent_name} | ${bs.bulletin_date} | ${bs.care_type}
  Total: ${formatAmount(bs.total_amount as number)} | Remboursé: ${formatAmount(bs.reimbursed_amount as number)}
`;
  }

  content += `

---
Document généré le ${new Date().toLocaleString('fr-TN')}
Plateforme E-Santé - www.e-sante.tn
`;

  return content;
}

export { bordereaux };
