/**
 * AI Reconciliation Routes
 *
 * Intelligent payment-bordereau matching endpoints
 */

import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { authMiddleware, requireRole } from '../middleware/auth';
import { logAudit } from '../middleware/audit-trail';
import { success, error } from '../lib/response';
import { AIReconciliationService } from '../services/ai-reconciliation.service';
import type { Bindings, Variables } from '../types';
import { getDb } from '../lib/db';

const aiReconciliation = new Hono<{ Bindings: Bindings; Variables: Variables }>();

// Apply auth middleware
aiReconciliation.use('*', authMiddleware());

/**
 * GET /suggestions
 * Get AI-powered reconciliation suggestions
 */
aiReconciliation.get('/suggestions', async (c) => {
  const user = c.get('user');
  const minConfidence = parseFloat(c.req.query('minConfidence') || '0.7');
  const limit = Math.min(parseInt(c.req.query('limit') || '50', 10), 100);
  const service = new AIReconciliationService(c.env);

  const suggestions = await service.findPaymentMatches({
    insurerId: user.insurerId,
    minConfidence,
    limit,
  });

  return success(c, {
    suggestions,
    meta: {
      total: suggestions.length,
      minConfidence,
      highConfidence: suggestions.filter((s) => s.confidence >= 0.95).length,
      mediumConfidence: suggestions.filter((s) => s.confidence >= 0.8 && s.confidence < 0.95).length,
      lowConfidence: suggestions.filter((s) => s.confidence < 0.8).length,
    },
  });
});

/**
 * GET /anomalies
 * Detect anomalies in financial data
 */
aiReconciliation.get('/anomalies', async (c) => {
  const user = c.get('user');
  const dateFrom = c.req.query('dateFrom');
  const dateTo = c.req.query('dateTo');
  const service = new AIReconciliationService(c.env);

  const anomalies = await service.detectAnomalies({
    insurerId: user.insurerId,
    dateFrom,
    dateTo,
  });

  return success(c, {
    anomalies,
    meta: {
      total: anomalies.length,
      bySeverity: {
        critical: anomalies.filter((a) => a.severity === 'critical').length,
        high: anomalies.filter((a) => a.severity === 'high').length,
        medium: anomalies.filter((a) => a.severity === 'medium').length,
        low: anomalies.filter((a) => a.severity === 'low').length,
      },
      byType: {
        duplicate: anomalies.filter((a) => a.type === 'duplicate').length,
        amount_mismatch: anomalies.filter((a) => a.type === 'amount_mismatch').length,
        pattern_deviation: anomalies.filter((a) => a.type === 'pattern_deviation').length,
        missing_reference: anomalies.filter((a) => a.type === 'missing_reference').length,
      },
    },
  });
});

/**
 * POST /auto-reconcile
 * Run automatic reconciliation
 */
aiReconciliation.post(
  '/auto-reconcile',
  requireRole('ADMIN', 'INSURER_ADMIN', 'INSURER_AGENT'),
  zValidator('json', z.object({
    minConfidence: z.number().min(0.8).max(1).default(0.95),
    dryRun: z.boolean().default(true),
  }).optional()),
  async (c) => {
    const user = c.get('user');
    const body = c.req.valid('json') || { minConfidence: 0.95, dryRun: true };
    const service = new AIReconciliationService(c.env);

    const result = await service.autoReconcile({
      insurerId: user.insurerId,
      minConfidence: body.minConfidence,
      dryRun: body.dryRun,
    });

    logAudit(c.env.DB, {
      userId: user.id,
      action: 'ai_reconciliation.auto_reconcile',
      entityType: 'reconciliation',
      entityId: user.insurerId || 'all',
      changes: { minConfidence: body.minConfidence, dryRun: body.dryRun, ...result },
      ipAddress: c.req.header('CF-Connecting-IP'),
      userAgent: c.req.header('User-Agent'),
    });

    return success(c, {
      message: body.dryRun
        ? 'Simulation de rapprochement automatique'
        : 'Rapprochement automatique effectué',
      dryRun: body.dryRun,
      ...result,
    });
  }
);

/**
 * POST /reconcile
 * Manually reconcile a payment with a bordereau
 */
aiReconciliation.post(
  '/reconcile',
  requireRole('ADMIN', 'INSURER_ADMIN', 'INSURER_AGENT'),
  zValidator('json', z.object({
    paymentId: z.string().uuid(),
    bordereauId: z.string().uuid(),
    notes: z.string().optional(),
  })),
  async (c) => {
    const user = c.get('user');
    const { paymentId, bordereauId, notes } = c.req.valid('json');
    const now = new Date().toISOString();

    // Verify payment exists and is unreconciled
    const payment = await getDb(c).prepare(`
      SELECT id, status FROM payment_orders WHERE id = ?
    `).bind(paymentId).first<{ id: string; status: string }>();

    if (!payment) {
      return error(c, 'NOT_FOUND', 'Paiement non trouvé', 404);
    }

    // Verify bordereau exists
    const bordereau = await getDb(c).prepare(`
      SELECT id, status FROM bordereaux WHERE id = ?
    `).bind(bordereauId).first<{ id: string; status: string }>();

    if (!bordereau) {
      return error(c, 'NOT_FOUND', 'Bordereau non trouvé', 404);
    }

    // Check if already reconciled
    const existing = await getDb(c).prepare(`
      SELECT id FROM reconciliation_items
      WHERE payment_id = ? OR bordereau_id = ?
    `).bind(paymentId, bordereauId).first();

    if (existing) {
      return error(c, 'ALREADY_RECONCILED', 'Déjà rapproché', 400);
    }

    // Create reconciliation
    const id = crypto.randomUUID();

    await getDb(c).prepare(`
      INSERT INTO reconciliation_items (
        id, payment_id, bordereau_id, match_confidence,
        match_details, status, reconciled_by, created_at
      ) VALUES (?, ?, ?, 1.0, ?, 'reconciled', ?, ?)
    `).bind(
      id,
      paymentId,
      bordereauId,
      JSON.stringify({ manual: true, notes }),
      user.id,
      now
    ).run();

    // Update bordereau status
    await getDb(c).prepare(`
      UPDATE bordereaux SET status = 'paid', updated_at = ? WHERE id = ?
    `).bind(now, bordereauId).run();

    logAudit(c.env.DB, {
      userId: user.id,
      action: 'ai_reconciliation.manual_reconcile',
      entityType: 'reconciliation',
      entityId: id,
      changes: { paymentId, bordereauId, notes },
      ipAddress: c.req.header('CF-Connecting-IP'),
      userAgent: c.req.header('User-Agent'),
    });

    return success(c, {
      message: 'Rapprochement effectué',
      reconciliationId: id,
    });
  }
);

/**
 * DELETE /reconcile/:id
 * Undo a reconciliation
 */
aiReconciliation.delete(
  '/reconcile/:id',
  requireRole('ADMIN', 'INSURER_ADMIN', 'INSURER_AGENT'),
  async (c) => {
    const reconciliationId = c.req.param('id');
    const user = c.get('user');
    const now = new Date().toISOString();

    // Get reconciliation details
    const reconciliation = await getDb(c).prepare(`
      SELECT bordereau_id FROM reconciliation_items WHERE id = ?
    `).bind(reconciliationId).first<{ bordereau_id: string }>();

    if (!reconciliation) {
      return error(c, 'NOT_FOUND', 'Rapprochement non trouvé', 404);
    }

    // Delete reconciliation
    await getDb(c).prepare(`
      DELETE FROM reconciliation_items WHERE id = ?
    `).bind(reconciliationId).run();

    // Revert bordereau status
    await getDb(c).prepare(`
      UPDATE bordereaux SET status = 'pending_payment', updated_at = ? WHERE id = ?
    `).bind(now, reconciliation.bordereau_id).run();

    logAudit(c.env.DB, {
      userId: user.id,
      action: 'ai_reconciliation.undo',
      entityType: 'reconciliation',
      entityId: reconciliationId,
      changes: { bordereauId: reconciliation.bordereau_id, revertedStatus: 'pending_payment' },
      ipAddress: c.req.header('CF-Connecting-IP'),
      userAgent: c.req.header('User-Agent'),
    });

    return success(c, { message: 'Rapprochement annulé' });
  }
);

/**
 * GET /stats
 * Get reconciliation statistics
 */
aiReconciliation.get('/stats', async (c) => {
  const user = c.get('user');
  const service = new AIReconciliationService(c.env);

  const stats = await service.getReconciliationStats(user.insurerId);

  return success(c, stats);
});

/**
 * GET /history
 * Get reconciliation history
 */
aiReconciliation.get('/history', async (c) => {
  const user = c.get('user');
  const page = parseInt(c.req.query('page') || '1', 10);
  const limit = Math.min(parseInt(c.req.query('limit') || '20', 10), 100);
  const status = c.req.query('status');
  const offset = (page - 1) * limit;

  const insurerFilter = user.insurerId ? `AND p.insurer_id = '${user.insurerId}'` : '';
  const statusFilter = status ? `AND ri.status = '${status}'` : '';

  const [countResult, items] = await Promise.all([
    getDb(c).prepare(`
      SELECT COUNT(*) as count
      FROM reconciliation_items ri
      JOIN payment_orders p ON ri.payment_id = p.id
      WHERE 1=1 ${insurerFilter} ${statusFilter}
    `).first<{ count: number }>(),

    getDb(c).prepare(`
      SELECT
        ri.id,
        ri.payment_id,
        ri.bordereau_id,
        ri.match_confidence,
        ri.status,
        ri.created_at,
        p.reference as payment_ref,
        p.amount as payment_amount,
        b.reference as bordereau_ref,
        b.total_amount as bordereau_amount,
        u.full_name as reconciled_by_name
      FROM reconciliation_items ri
      JOIN payment_orders p ON ri.payment_id = p.id
      JOIN bordereaux b ON ri.bordereau_id = b.id
      LEFT JOIN users u ON ri.reconciled_by = u.id
      WHERE 1=1 ${insurerFilter} ${statusFilter}
      ORDER BY ri.created_at DESC
      LIMIT ? OFFSET ?
    `).bind(limit, offset).all<{
      id: string;
      payment_id: string;
      bordereau_id: string;
      match_confidence: number;
      status: string;
      created_at: string;
      payment_ref: string;
      payment_amount: number;
      bordereau_ref: string;
      bordereau_amount: number;
      reconciled_by_name: string;
    }>(),
  ]);

  return success(c, {
    items: items.results || [],
    meta: {
      page,
      limit,
      total: countResult?.count || 0,
      totalPages: Math.ceil((countResult?.count || 0) / limit),
    },
  });
});

/**
 * POST /anomalies/:id/acknowledge
 * Acknowledge an anomaly
 */
aiReconciliation.post(
  '/anomalies/:id/acknowledge',
  requireRole('ADMIN', 'INSURER_ADMIN', 'INSURER_AGENT'),
  zValidator('json', z.object({
    resolution: z.string().min(1).max(500),
    action: z.enum(['resolved', 'false_positive', 'deferred']),
  })),
  async (c) => {
    const user = c.get('user');
    const anomalyId = c.req.param('id');
    const { resolution, action } = c.req.valid('json');
    const now = new Date().toISOString();

    // Log the acknowledgment
    await getDb(c).prepare(`
      INSERT INTO anomaly_acknowledgments (
        id, anomaly_id, acknowledged_by, resolution, action, created_at
      ) VALUES (?, ?, ?, ?, ?, ?)
    `).bind(
      crypto.randomUUID(),
      anomalyId,
      user.id,
      resolution,
      action,
      now
    ).run();

    logAudit(c.env.DB, {
      userId: user.id,
      action: 'anomaly.acknowledge',
      entityType: 'anomaly',
      entityId: anomalyId,
      changes: { resolution, action },
      ipAddress: c.req.header('CF-Connecting-IP'),
      userAgent: c.req.header('User-Agent'),
    });

    return success(c, {
      message: 'Anomalie traitée',
      action,
    });
  }
);

/**
 * GET /report
 * Generate reconciliation report
 */
aiReconciliation.get('/report', async (c) => {
  const user = c.get('user');
  const dateFrom = c.req.query('dateFrom') || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const dateTo = c.req.query('dateTo') || new Date().toISOString().split('T')[0];
  const insurerFilter = user.insurerId ? `AND insurer_id = '${user.insurerId}'` : '';

  const [summary, byProvider, byMonth] = await Promise.all([
    // Summary
    getDb(c).prepare(`
      SELECT
        COUNT(DISTINCT ri.payment_id) as total_reconciled,
        SUM(p.amount) as total_amount,
        AVG(ri.match_confidence) as avg_confidence,
        COUNT(CASE WHEN ri.match_confidence >= 0.95 THEN 1 END) as auto_reconciled,
        COUNT(CASE WHEN ri.match_confidence < 0.95 THEN 1 END) as manual_reconciled
      FROM reconciliation_items ri
      JOIN payment_orders p ON ri.payment_id = p.id
      WHERE ri.created_at BETWEEN ? AND ?
        ${insurerFilter}
    `).bind(dateFrom, dateTo).first<{
      total_reconciled: number;
      total_amount: number;
      avg_confidence: number;
      auto_reconciled: number;
      manual_reconciled: number;
    }>(),

    // By provider
    getDb(c).prepare(`
      SELECT
        pr.name as provider_name,
        COUNT(*) as count,
        SUM(p.amount) as total_amount
      FROM reconciliation_items ri
      JOIN payment_orders p ON ri.payment_id = p.id
      JOIN providers pr ON p.provider_id = pr.id
      WHERE ri.created_at BETWEEN ? AND ?
        ${insurerFilter}
      GROUP BY pr.id
      ORDER BY total_amount DESC
      LIMIT 10
    `).bind(dateFrom, dateTo).all<{
      provider_name: string;
      count: number;
      total_amount: number;
    }>(),

    // By month
    getDb(c).prepare(`
      SELECT
        strftime('%Y-%m', ri.created_at) as month,
        COUNT(*) as count,
        SUM(p.amount) as total_amount
      FROM reconciliation_items ri
      JOIN payment_orders p ON ri.payment_id = p.id
      WHERE ri.created_at BETWEEN ? AND ?
        ${insurerFilter}
      GROUP BY month
      ORDER BY month
    `).bind(dateFrom, dateTo).all<{
      month: string;
      count: number;
      total_amount: number;
    }>(),
  ]);

  return success(c, {
    period: { from: dateFrom, to: dateTo },
    summary: summary || {},
    byProvider: byProvider.results || [],
    byMonth: byMonth.results || [],
  });
});

export { aiReconciliation };
