import { Hono } from 'hono';
import { authMiddleware, requireRole } from '../middleware/auth';
import { error, success } from '../lib/response';
import { getDb } from '../lib/db';
import type { Bindings, Variables } from '../types';

const adminStats = new Hono<{ Bindings: Bindings; Variables: Variables }>();
adminStats.use('*', authMiddleware());
adminStats.use('*', requireRole('ADMIN'));

/**
 * GET /bulletins-stats — Statistiques des bulletins de soins
 */
adminStats.get('/bulletins-stats', async (c) => {
  const db = getDb(c);

  try {
    const [thisMonth, thisQuarter, thisYear] = await Promise.all([
      db.prepare(`
        SELECT COUNT(*) as count FROM bulletins_soins
        WHERE created_at >= date('now', 'start of month')
      `).first<{ count: number }>(),
      db.prepare(`
        SELECT COUNT(*) as count FROM bulletins_soins
        WHERE created_at >= date('now', 'start of month', '-' || ((CAST(strftime('%m', 'now') AS INTEGER) - 1) % 3) || ' months')
      `).first<{ count: number }>(),
      db.prepare(`
        SELECT COUNT(*) as count FROM bulletins_soins
        WHERE created_at >= date('now', 'start of year')
      `).first<{ count: number }>(),
    ]);

    // Count by status
    const statusResults = await db.prepare(`
      SELECT status, COUNT(*) as count
      FROM bulletins_soins
      GROUP BY status
    `).all<{ status: string; count: number }>();

    const byStatus: Record<string, number> = {};
    for (const row of statusResults.results ?? []) {
      byStatus[row.status] = row.count;
    }

    // Approval rate
    const approved = byStatus['approved'] ?? 0;
    const rejected = byStatus['rejected'] ?? 0;
    const approvalRate = approved + rejected > 0
      ? Math.round((approved / (approved + rejected)) * 10000) / 100
      : 0;

    // Average processing time (submission_date → approved_date) in days
    const avgProcessing = await db.prepare(`
      SELECT AVG(julianday(approved_date) - julianday(submission_date)) as avg_days
      FROM bulletins_soins
      WHERE approved_date IS NOT NULL
        AND submission_date IS NOT NULL
    `).first<{ avg_days: number | null }>();

    return success(c, {
      periods: {
        thisMonth: thisMonth?.count ?? 0,
        thisQuarter: thisQuarter?.count ?? 0,
        thisYear: thisYear?.count ?? 0,
      },
      byStatus,
      approvalRate,
      avgProcessingDays: avgProcessing?.avg_days != null
        ? Math.round(avgProcessing.avg_days * 100) / 100
        : null,
    });
  } catch (err) {
    return error(c, 'STATS_ERROR', `Erreur stats bulletins: ${err instanceof Error ? err.message : String(err)}`, 500);
  }
});

/**
 * GET /remboursements-stats — Statistiques des remboursements
 */
adminStats.get('/remboursements-stats', async (c) => {
  const db = getDb(c);

  try {
    const [thisMonth, thisQuarter, thisYear] = await Promise.all([
      db.prepare(`
        SELECT COALESCE(SUM(reimbursed_amount), 0) as total
        FROM bulletins_soins
        WHERE reimbursed_amount IS NOT NULL
          AND created_at >= date('now', 'start of month')
      `).first<{ total: number }>(),
      db.prepare(`
        SELECT COALESCE(SUM(reimbursed_amount), 0) as total
        FROM bulletins_soins
        WHERE reimbursed_amount IS NOT NULL
          AND created_at >= date('now', 'start of month', '-' || ((CAST(strftime('%m', 'now') AS INTEGER) - 1) % 3) || ' months')
      `).first<{ total: number }>(),
      db.prepare(`
        SELECT COALESCE(SUM(reimbursed_amount), 0) as total
        FROM bulletins_soins
        WHERE reimbursed_amount IS NOT NULL
          AND created_at >= date('now', 'start of year')
      `).first<{ total: number }>(),
    ]);

    // Average amount per bulletin
    const avgAmount = await db.prepare(`
      SELECT AVG(reimbursed_amount) as avg_amount
      FROM bulletins_soins
      WHERE reimbursed_amount IS NOT NULL
    `).first<{ avg_amount: number | null }>();

    // Distribution by care_type
    const byCareType = await db.prepare(`
      SELECT care_type, COUNT(*) as count, COALESCE(SUM(reimbursed_amount), 0) as total
      FROM bulletins_soins
      WHERE reimbursed_amount IS NOT NULL
      GROUP BY care_type
      ORDER BY total DESC
    `).all<{ care_type: string; count: number; total: number }>();

    // Top 5 providers by volume
    const topPractitioners = await db.prepare(`
      SELECT provider_name, COUNT(*) as count, COALESCE(SUM(reimbursed_amount), 0) as total
      FROM bulletins_soins
      WHERE reimbursed_amount IS NOT NULL
        AND provider_name IS NOT NULL
      GROUP BY provider_name
      ORDER BY count DESC
      LIMIT 5
    `).all<{ provider_name: string; count: number; total: number }>();

    return success(c, {
      periods: {
        thisMonth: thisMonth?.total ?? 0,
        thisQuarter: thisQuarter?.total ?? 0,
        thisYear: thisYear?.total ?? 0,
      },
      avgAmountPerBulletin: avgAmount?.avg_amount != null
        ? Math.round(avgAmount.avg_amount * 100) / 100
        : null,
      byCareType: byCareType.results ?? [],
      topPractitioners: topPractitioners.results ?? [],
    });
  } catch (err) {
    return error(c, 'STATS_ERROR', `Erreur stats remboursements: ${err instanceof Error ? err.message : String(err)}`, 500);
  }
});

/**
 * GET /alertes — Alertes actionables pour le tableau de bord admin
 */
adminStats.get('/alertes', async (c) => {
  const db = getDb(c);

  try {
    const [pendingBulletins, expiringContracts] = await Promise.all([
      // Bulletins pending > 5 days
      db.prepare(`
        SELECT id, status, care_type, total_amount, created_at
        FROM bulletins_soins
        WHERE status IN ('scan_uploaded', 'paper_received', 'paper_incomplete', 'paper_complete', 'processing')
          AND created_at < datetime('now', '-5 days')
        ORDER BY created_at ASC
      `).all<{
        id: string;
        status: string;
        care_type: string;
        total_amount: number | null;
        created_at: string;
      }>(),

      // Contracts expiring within 30 days (group_contracts HAS deleted_at)
      db.prepare(`
        SELECT id, end_date, status
        FROM group_contracts
        WHERE end_date IS NOT NULL
          AND end_date <= date('now', '+30 days')
          AND end_date >= date('now')
          AND status != 'terminated'
          AND deleted_at IS NULL
        ORDER BY end_date ASC
      `).all<{
        id: string;
        end_date: string;
        status: string;
      }>(),
    ]);

    return success(c, {
      pendingBulletins: {
        count: pendingBulletins.results?.length ?? 0,
        items: pendingBulletins.results ?? [],
      },
      expiringContracts: {
        count: expiringContracts.results?.length ?? 0,
        items: expiringContracts.results ?? [],
      },
    });
  } catch (err) {
    return error(c, 'ALERTS_ERROR', `Erreur alertes: ${err instanceof Error ? err.message : String(err)}`, 500);
  }
});

/**
 * GET /evolution-mensuelle — Évolution mensuelle sur les 12 derniers mois
 */
adminStats.get('/evolution-mensuelle', async (c) => {
  const db = getDb(c);

  try {
    const evolution = await db.prepare(`
      SELECT
        strftime('%Y-%m', created_at) as month,
        COUNT(*) as count,
        COALESCE(SUM(reimbursed_amount), 0) as total_reimbursed
      FROM bulletins_soins
      WHERE created_at >= date('now', '-12 months')
      GROUP BY strftime('%Y-%m', created_at)
      ORDER BY month ASC
    `).all<{ month: string; count: number; total_reimbursed: number }>();

    return success(c, {
      months: evolution.results ?? [],
    });
  } catch (err) {
    return error(c, 'STATS_ERROR', `Erreur évolution: ${err instanceof Error ? err.message : String(err)}`, 500);
  }
});

export { adminStats };
