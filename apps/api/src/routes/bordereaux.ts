/**
 * Bordereaux Routes
 *
 * API endpoints for managing bordereaux (payment statements)
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

/**
 * GET /bordereaux
 * List bordereaux with pagination and filters
 */
bordereaux.get('/', zValidator('query', listQuerySchema), async (c) => {
  const user = c.get('user');
  const { page, limit, status, insurerId, providerId } = c.req.valid('query');
  const offset = (page - 1) * limit;

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

  let countResult: { total: number } | null = null;
  let bordereaux: D1Result<Record<string, unknown>>;

  try {
    [countResult, bordereaux] = await Promise.all([
      getDb(c).prepare(`SELECT COUNT(*) as total FROM bordereaux b ${whereClause}`)
        .bind(...params)
        .first<{ total: number }>(),
      getDb(c).prepare(`
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
  } catch (error) {
    return c.json({
      success: false,
      error: {
        code: 'DATABASE_ERROR',
        message: 'Erreur lors de la récupération des bordereaux',
      },
    }, 500);
  }

  return c.json({
    success: true,
    data: {
      bordereaux: (bordereaux.results || []).map((b) => ({
        id: b.id,
        bordereauNumber: b.bordereau_number,
        insurerId: b.insurer_id,
        insurerName: b.insurer_name,
        providerId: b.provider_id,
        providerName: b.provider_name,
        periodStart: b.period_start,
        periodEnd: b.period_end,
        status: b.status,
        claimCount: b.claim_count,
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
});

/**
 * GET /bordereaux/:id
 * Get bordereau details
 */
bordereaux.get('/:id', async (c) => {
  const bordereauId = c.req.param('id');

  const bordereau = await getDb(c).prepare(`
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

  // Get claims included in this bordereau
  const claims = await getDb(c).prepare(`
    SELECT c.id, c.claim_number, c.total_amount, c.covered_amount, c.status,
           a.first_name || ' ' || a.last_name as adherent_name
    FROM claims c
    LEFT JOIN adherents a ON c.adherent_id = a.id
    WHERE c.bordereau_id = ?
    ORDER BY c.created_at DESC
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
      claimCount: bordereau.claim_count,
      totalAmount: bordereau.total_amount,
      coveredAmount: bordereau.covered_amount,
      paidAmount: bordereau.paid_amount,
      submittedAt: bordereau.submitted_at,
      validatedAt: bordereau.validated_at,
      paidAt: bordereau.paid_at,
      createdAt: bordereau.created_at,
      claims: (claims.results || []).map((c) => ({
        id: c.id,
        claimNumber: c.claim_number,
        adherentName: c.adherent_name,
        totalAmount: c.total_amount,
        coveredAmount: c.covered_amount,
        status: c.status,
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

  // Get the bordereau
  const bordereau = await getDb(c).prepare(
    'SELECT * FROM bordereaux WHERE id = ?'
  )
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

  // Check if user has permission
  if (user.providerId && bordereau.provider_id !== user.providerId) {
    return c.json(
      { success: false, error: { code: 'FORBIDDEN', message: 'Accès non autorisé' } },
      403
    );
  }

  // Update status
  await getDb(c).prepare(`
    UPDATE bordereaux
    SET status = 'SUBMITTED', submitted_at = datetime('now'), updated_at = datetime('now')
    WHERE id = ?
  `)
    .bind(bordereauId)
    .run();

  // Log audit
  await getDb(c).prepare(`
    INSERT INTO audit_logs (id, user_id, action, entity_type, entity_id, details, created_at)
    VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
  `)
    .bind(ulid(), user.sub, 'SUBMIT', 'BORDEREAU', bordereauId, JSON.stringify({ previousStatus: 'DRAFT' }))
    .run();

  return c.json({
    success: true,
    message: 'Bordereau soumis avec succès',
    data: {
      id: bordereauId,
      status: 'SUBMITTED',
      submittedAt: new Date().toISOString(),
    },
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

    const bordereau = await getDb(c).prepare(
      'SELECT * FROM bordereaux WHERE id = ?'
    )
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

    await getDb(c).prepare(`
      UPDATE bordereaux
      SET status = 'VALIDATED', validated_at = datetime('now'), updated_at = datetime('now')
      WHERE id = ?
    `)
      .bind(bordereauId)
      .run();

    await getDb(c).prepare(`
      INSERT INTO audit_logs (id, user_id, action, entity_type, entity_id, details, created_at)
      VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
    `)
      .bind(ulid(), user.sub, 'VALIDATE', 'BORDEREAU', bordereauId, JSON.stringify({ previousStatus: 'SUBMITTED' }))
      .run();

    return c.json({
      success: true,
      message: 'Bordereau validé avec succès',
      data: {
        id: bordereauId,
        status: 'VALIDATED',
        validatedAt: new Date().toISOString(),
      },
    });
  }
);

/**
 * POST /bordereaux/:id/pay
 * Mark a bordereau as paid (insurer only)
 */
bordereaux.post(
  '/:id/pay',
  requireRole('INSURER_ADMIN', 'ADMIN'),
  zValidator('json', z.object({
    paymentReference: z.string().min(1),
    paymentDate: z.string().optional(),
  })),
  async (c) => {
    const user = c.get('user');
    const bordereauId = c.req.param('id');
    const { paymentReference, paymentDate } = c.req.valid('json');

    const bordereau = await getDb(c).prepare(
      'SELECT * FROM bordereaux WHERE id = ?'
    )
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

    await getDb(c).prepare(`
      UPDATE bordereaux
      SET status = 'PAID',
          paid_at = ?,
          paid_amount = covered_amount,
          payment_reference = ?,
          updated_at = datetime('now')
      WHERE id = ?
    `)
      .bind(paidAt, paymentReference, bordereauId)
      .run();

    await getDb(c).prepare(`
      INSERT INTO audit_logs (id, user_id, action, entity_type, entity_id, details, created_at)
      VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
    `)
      .bind(ulid(), user.sub, 'PAY', 'BORDEREAU', bordereauId, JSON.stringify({ paymentReference, paidAt }))
      .run();

    return c.json({
      success: true,
      message: 'Bordereau marqué comme payé',
      data: {
        id: bordereauId,
        status: 'PAID',
        paidAt,
        paymentReference,
      },
    });
  }
);

/**
 * GET /bordereaux/:id/pdf
 * Generate PDF for a bordereau
 */
bordereaux.get('/:id/pdf', async (c) => {
  const bordereauId = c.req.param('id');

  const bordereau = await getDb(c).prepare(`
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

  // Get claims
  const claims = await getDb(c).prepare(`
    SELECT c.claim_number, c.total_amount, c.covered_amount, c.care_date,
           a.first_name || ' ' || a.last_name as adherent_name,
           a.national_id
    FROM claims c
    LEFT JOIN adherents a ON c.adherent_id = a.id
    WHERE c.bordereau_id = ?
    ORDER BY c.created_at
  `)
    .bind(bordereauId)
    .all();

  // Generate simple text-based "PDF" content (in production, use a proper PDF library)
  const content = generateBordereauPdfContent(bordereau, claims.results || []);

  // Return as PDF
  return new Response(content, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="bordereau-${bordereau.bordereau_number}.pdf"`,
    },
  });
});

/**
 * Generate PDF content for a bordereau
 * In production, this would use a proper PDF generation library
 */
function generateBordereauPdfContent(bordereau: Record<string, unknown>, claims: Record<string, unknown>[]): string {
  // Simple text representation (placeholder for actual PDF generation)
  const formatAmount = (amount: number) => (amount / 1000).toFixed(3) + ' TND';

  let content = `
BORDEREAU DE FACTURATION
========================

Numéro: ${bordereau.bordereau_number}
Date: ${new Date().toLocaleDateString('fr-TN')}

PRESTATAIRE
-----------
${bordereau.provider_name}
${bordereau.provider_address || ''}

ASSUREUR
--------
${bordereau.insurer_name}
${bordereau.insurer_address || ''}

PÉRIODE
-------
Du ${bordereau.period_start} au ${bordereau.period_end}

RÉCAPITULATIF
-------------
Nombre de PEC: ${bordereau.claim_count}
Montant total: ${formatAmount(bordereau.total_amount as number)}
Montant couvert: ${formatAmount(bordereau.covered_amount as number)}

DÉTAIL DES PRISES EN CHARGE
---------------------------
`;

  for (const claim of claims) {
    content += `
${claim.claim_number} | ${claim.adherent_name} | ${claim.care_date}
  Total: ${formatAmount(claim.total_amount as number)} | Couvert: ${formatAmount(claim.covered_amount as number)}
`;
  }

  content += `

---
Document généré le ${new Date().toLocaleString('fr-TN')}
Plateforme Dhamen - www.dhamen.tn
`;

  return content;
}

export { bordereaux };
