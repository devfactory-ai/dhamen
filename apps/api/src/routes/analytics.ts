/**
 * Analytics Routes
 *
 * Provides analytics and business intelligence endpoints
 */
import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import type { Bindings, Variables } from '../types';
import { authMiddleware, requireAuth, requireRole } from '../middleware/auth';
import { AnalyticsService } from '../services/analytics.service';

// Validation schemas
const dateRangeQuerySchema = z.object({
  insurerId: z.string().optional(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format (YYYY-MM-DD)').optional(),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format (YYYY-MM-DD)').optional(),
});

const trendsQuerySchema = dateRangeQuerySchema.extend({
  granularity: z.enum(['day', 'week', 'month']).default('day'),
});

const distributionQuerySchema = dateRangeQuerySchema.extend({
  groupBy: z.enum(['care_type', 'status', 'provider_type']).default('care_type'),
});

const performanceQuerySchema = z.object({
  insurerId: z.string().optional(),
  months: z.coerce.number().min(1).max(36).default(12),
});

const providersQuerySchema = dateRangeQuerySchema.extend({
  limit: z.coerce.number().min(1).max(100).default(20),
});

const compareQuerySchema = z.object({
  insurerId: z.string().optional(),
  currentStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format'),
  currentEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format'),
  previousStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format'),
  previousEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format'),
});

const exportQuerySchema = dateRangeQuerySchema.extend({
  type: z.enum(['kpis', 'trends', 'providers', 'adherents', 'fraud']).default('kpis'),
  format: z.enum(['json', 'csv']).default('json'),
});

const dashboardQuerySchema = z.object({
  insurerId: z.string().optional(),
});

const analytics = new Hono<{ Bindings: Bindings; Variables: Variables }>();

// All analytics routes require authentication
analytics.use('*', authMiddleware());
analytics.use('*', requireAuth);

/**
 * Parse date range from query params
 */
function parseDateRange(
  startParam?: string,
  endParam?: string
): { start: Date; end: Date } | undefined {
  if (!startParam && !endParam) return undefined;

  const now = new Date();
  const start = startParam ? new Date(startParam) : new Date(now.getFullYear(), now.getMonth(), 1);
  const end = endParam ? new Date(endParam) : now;

  return { start, end };
}

/**
 * GET /analytics/kpis
 * Get comprehensive KPI metrics
 */
analytics.get(
  '/kpis',
  requireRole('ADMIN', 'INSURER_ADMIN', 'INSURER_AGENT', 'SOIN_GESTIONNAIRE'),
  zValidator('query', dateRangeQuerySchema),
  async (c) => {
    const { insurerId, startDate, endDate } = c.req.valid('query');

    const user = c.get('user');

    // Non-admin users can only see their insurer's data
    const effectiveInsurerId =
      user.role === 'ADMIN' ? insurerId : user.insurerId;

    const analyticsService = new AnalyticsService(c.env);
    const dateRange = parseDateRange(startDate, endDate);

    const kpis = await analyticsService.getKPIs(effectiveInsurerId, dateRange);

    return c.json({
      success: true,
      data: kpis,
    });
  }
);

/**
 * GET /analytics/trends
 * Get claims trend over time
 */
analytics.get(
  '/trends',
  requireRole('ADMIN', 'INSURER_ADMIN', 'INSURER_AGENT', 'SOIN_GESTIONNAIRE'),
  zValidator('query', trendsQuerySchema),
  async (c) => {
    const { insurerId, startDate, endDate, granularity } = c.req.valid('query');

    const user = c.get('user');
    const effectiveInsurerId =
      user.role === 'ADMIN' ? insurerId : user.insurerId;

    const analyticsService = new AnalyticsService(c.env);
    const dateRange = parseDateRange(startDate, endDate);

    const trends = await analyticsService.getClaimsTrend(
      effectiveInsurerId,
      dateRange,
      granularity
    );

    return c.json({
      success: true,
      data: trends,
    });
  }
);

/**
 * GET /analytics/distribution
 * Get claims distribution by category
 */
analytics.get(
  '/distribution',
  requireRole('ADMIN', 'INSURER_ADMIN', 'INSURER_AGENT', 'SOIN_GESTIONNAIRE'),
  zValidator('query', distributionQuerySchema),
  async (c) => {
    const { insurerId, startDate, endDate, groupBy } = c.req.valid('query');

    const user = c.get('user');
    const effectiveInsurerId =
      user.role === 'ADMIN' ? insurerId : user.insurerId;

    const analyticsService = new AnalyticsService(c.env);
    const dateRange = parseDateRange(startDate, endDate);

    const distribution = await analyticsService.getClaimsDistribution(
      effectiveInsurerId,
      dateRange,
      groupBy
    );

    return c.json({
      success: true,
      data: distribution,
    });
  }
);

/**
 * GET /analytics/performance/monthly
 * Get monthly performance metrics
 */
analytics.get(
  '/performance/monthly',
  requireRole('ADMIN', 'INSURER_ADMIN', 'INSURER_AGENT', 'SOIN_GESTIONNAIRE'),
  zValidator('query', performanceQuerySchema),
  async (c) => {
    const { insurerId, months } = c.req.valid('query');

    const user = c.get('user');
    const effectiveInsurerId =
      user.role === 'ADMIN' ? insurerId : user.insurerId;

    const analyticsService = new AnalyticsService(c.env);
    const performance = await analyticsService.getMonthlyPerformance(
      effectiveInsurerId,
      months
    );

    return c.json({
      success: true,
      data: performance,
    });
  }
);

/**
 * GET /analytics/providers
 * Get provider performance analytics
 */
analytics.get(
  '/providers',
  requireRole('ADMIN', 'INSURER_ADMIN', 'INSURER_AGENT', 'SOIN_GESTIONNAIRE'),
  zValidator('query', providersQuerySchema),
  async (c) => {
    const { insurerId, startDate, endDate, limit } = c.req.valid('query');

    const user = c.get('user');
    const effectiveInsurerId =
      user.role === 'ADMIN' ? insurerId : user.insurerId;

    const analyticsService = new AnalyticsService(c.env);
    const dateRange = parseDateRange(startDate, endDate);

    const providers = await analyticsService.getProviderPerformance(
      effectiveInsurerId,
      dateRange,
      limit
    );

    return c.json({
      success: true,
      data: providers,
    });
  }
);

/**
 * GET /analytics/adherents
 * Get adherent demographics analytics
 */
analytics.get(
  '/adherents',
  requireRole('ADMIN', 'INSURER_ADMIN', 'INSURER_AGENT', 'SOIN_GESTIONNAIRE'),
  zValidator('query', dashboardQuerySchema),
  async (c) => {
    const { insurerId } = c.req.valid('query');

    const user = c.get('user');
    const effectiveInsurerId =
      user.role === 'ADMIN' ? insurerId : user.insurerId;

    const analyticsService = new AnalyticsService(c.env);
    const analytics = await analyticsService.getAdherentAnalytics(effectiveInsurerId);

    return c.json({
      success: true,
      data: analytics,
    });
  }
);

/**
 * GET /analytics/fraud
 * Get fraud analytics
 */
analytics.get(
  '/fraud',
  requireRole('ADMIN', 'INSURER_ADMIN', 'INSURER_AGENT', 'SOIN_GESTIONNAIRE'),
  zValidator('query', dateRangeQuerySchema),
  async (c) => {
    const { insurerId, startDate, endDate } = c.req.valid('query');

    const user = c.get('user');
    const effectiveInsurerId =
      user.role === 'ADMIN' ? insurerId : user.insurerId;

    const analyticsService = new AnalyticsService(c.env);
    const dateRange = parseDateRange(startDate, endDate);

    const fraudAnalytics = await analyticsService.getFraudAnalytics(
      effectiveInsurerId,
      dateRange
    );

    return c.json({
      success: true,
      data: fraudAnalytics,
    });
  }
);

/**
 * GET /analytics/compare
 * Compare analytics between two periods
 */
analytics.get(
  '/compare',
  requireRole('ADMIN', 'INSURER_ADMIN', 'INSURER_AGENT', 'SOIN_GESTIONNAIRE'),
  zValidator('query', compareQuerySchema),
  async (c) => {
    const { insurerId, currentStart, currentEnd, previousStart, previousEnd } = c.req.valid('query');

    const user = c.get('user');
    const effectiveInsurerId =
      user.role === 'ADMIN' ? insurerId : user.insurerId;

    if (!effectiveInsurerId) {
      return c.json(
        {
          success: false,
          error: {
            code: 'MISSING_INSURER',
            message: 'Insurer ID is required for analytics',
          },
        },
        400
      );
    }

    const analyticsService = new AnalyticsService(c.env);

    const comparison = await analyticsService.getComparativeAnalytics(
      { start: new Date(currentStart), end: new Date(currentEnd) },
      { start: new Date(previousStart), end: new Date(previousEnd) },
      effectiveInsurerId
    );

    return c.json({
      success: true,
      data: comparison,
    });
  }
);

/**
 * GET /analytics/export
 * Export analytics data
 */
analytics.get(
  '/export',
  requireRole('ADMIN', 'INSURER_ADMIN', 'INSURER_AGENT'),
  zValidator('query', exportQuerySchema),
  async (c) => {
    const { type, format, insurerId, startDate, endDate } = c.req.valid('query');

    const user = c.get('user');
    const effectiveInsurerId =
      user.role === 'ADMIN' ? insurerId : user.insurerId;

    const analyticsService = new AnalyticsService(c.env);
    const dateRange = parseDateRange(startDate, endDate);

    const result = await analyticsService.exportAnalytics(
      type,
      effectiveInsurerId,
      dateRange,
      format
    );

    return new Response(result.data, {
      headers: {
        'Content-Type': result.contentType,
        'Content-Disposition': `attachment; filename="${result.filename}"`,
      },
    });
  }
);

/**
 * GET /analytics/dashboard-stats
 * Flat dashboard stats from sante_demandes + users (for DashboardPage cards)
 */
analytics.get(
  '/dashboard-stats',
  requireRole('ADMIN', 'INSURER_ADMIN', 'INSURER_AGENT', 'PHARMACIST', 'DOCTOR', 'LAB_MANAGER', 'CLINIC_ADMIN', 'SOIN_GESTIONNAIRE', 'HR'),
  async (c) => {
    const { getDb } = await import('../lib/db');
    const db = getDb(c);
    const user = c.get('user');

    // HR: scope all queries to company adherents
    const isHR = user.role === 'HR';
    const hrCompanyId = isHR ? user.companyId : null;

    // Provider: scope to their own praticien data
    const PROVIDER_ROLES = ['PHARMACIST', 'DOCTOR', 'LAB_MANAGER', 'CLINIC_ADMIN'];
    const isProvider = PROVIDER_ROLES.includes(user.role);
    const providerId = isProvider ? user.providerId : null;

    try {
      // Total active users
      const usersRow = await db.prepare(
        `SELECT COUNT(*) as count FROM users WHERE is_active = 1`
      ).first<{ count: number }>();

      // Total adherents (HR: only company adherents)
      const adherentsRow = isHR
        ? await db.prepare(
            `SELECT COUNT(*) as count FROM adherents WHERE deleted_at IS NULL AND company_id = ?`
          ).bind(hrCompanyId).first<{ count: number }>()
        : await db.prepare(
            `SELECT COUNT(*) as count FROM adherents WHERE deleted_at IS NULL`
          ).first<{ count: number }>();

      // HR join clause for sante_demandes scoped to company adherents
      const hrJoin = isHR ? 'JOIN adherents a ON sd.adherent_id = a.id' : '';
      const hrWhere = isHR ? 'WHERE a.company_id = ?' : isProvider ? 'WHERE sd.praticien_id IN (SELECT id FROM sante_praticiens WHERE provider_id = ?)' : '';
      const hrWhereAnd = isHR ? 'AND a.company_id = ?' : isProvider ? 'AND sd.praticien_id IN (SELECT id FROM sante_praticiens WHERE provider_id = ?)' : '';
      const hrParams = isHR ? [hrCompanyId] : isProvider ? [providerId] : [];

      // Claims stats from sante_demandes
      const claimsRow = await db.prepare(`
        SELECT
          COUNT(*) as totalClaims,
          SUM(CASE WHEN sd.statut IN ('soumise','en_examen','info_requise') THEN 1 ELSE 0 END) as pendingClaims,
          SUM(CASE WHEN sd.statut IN ('approuvee','en_paiement','payee') THEN 1 ELSE 0 END) as approvedClaims,
          SUM(CASE WHEN sd.statut = 'rejetee' THEN 1 ELSE 0 END) as rejectedClaims,
          COALESCE(SUM(sd.montant_demande), 0) as totalAmount,
          COUNT(DISTINCT sd.adherent_id) as uniquePatients
        FROM sante_demandes sd
        ${hrJoin}
        ${hrWhere}
      `).bind(...hrParams).first<{
        totalClaims: number;
        pendingClaims: number;
        approvedClaims: number;
        rejectedClaims: number;
        totalAmount: number;
        uniquePatients: number;
      }>();

      // Today's stats
      const todayRow = await db.prepare(`
        SELECT
          COUNT(*) as processedToday,
          SUM(CASE WHEN sd.statut = 'rejetee' THEN 1 ELSE 0 END) as rejectedToday
        FROM sante_demandes sd
        ${hrJoin}
        WHERE date(sd.created_at) = date('now')
        ${hrWhereAnd}
      `).bind(...hrParams).first<{ processedToday: number; rejectedToday: number }>();

      // Previous month stats for trend comparison
      const prevMonthRow = await db.prepare(`
        SELECT
          COUNT(*) as totalClaims,
          SUM(CASE WHEN sd.statut IN ('approuvee','en_paiement','payee') THEN 1 ELSE 0 END) as approvedClaims,
          SUM(CASE WHEN sd.statut = 'rejetee' THEN 1 ELSE 0 END) as rejectedClaims,
          SUM(CASE WHEN sd.statut IN ('soumise','en_examen','info_requise') THEN 1 ELSE 0 END) as pendingClaims
        FROM sante_demandes sd
        ${hrJoin}
        WHERE sd.created_at >= date('now', 'start of month', '-1 month')
          AND sd.created_at < date('now', 'start of month')
          ${hrWhereAnd}
      `).bind(...hrParams).first<{ totalClaims: number; approvedClaims: number; rejectedClaims: number; pendingClaims: number }>();

      const thisMonthRow = await db.prepare(`
        SELECT
          COUNT(*) as totalClaims,
          SUM(CASE WHEN sd.statut IN ('approuvee','en_paiement','payee') THEN 1 ELSE 0 END) as approvedClaims,
          SUM(CASE WHEN sd.statut = 'rejetee' THEN 1 ELSE 0 END) as rejectedClaims,
          SUM(CASE WHEN sd.statut IN ('soumise','en_examen','info_requise') THEN 1 ELSE 0 END) as pendingClaims
        FROM sante_demandes sd
        ${hrJoin}
        WHERE sd.created_at >= date('now', 'start of month')
          ${hrWhereAnd}
      `).bind(...hrParams).first<{ totalClaims: number; approvedClaims: number; rejectedClaims: number; pendingClaims: number }>();

      // Average processing time in hours (submission → approval)
      const avgProcRow = await db.prepare(`
        SELECT AVG((julianday(sd.date_traitement) - julianday(sd.created_at)) * 24) as avg_hours
        FROM sante_demandes sd
        ${hrJoin}
        WHERE sd.date_traitement IS NOT NULL AND sd.created_at IS NOT NULL
        ${hrWhereAnd}
      `).bind(...hrParams).first<{ avg_hours: number | null }>();

      const totalClaims = Number(claimsRow?.totalClaims) || 0;
      const approvedClaims = Number(claimsRow?.approvedClaims) || 0;
      const approvalRate = totalClaims > 0 ? (approvedClaims / totalClaims) * 100 : 0;

      // Compute trends (% change from previous month)
      const prevTotal = Number(prevMonthRow?.totalClaims) || 0;
      const currTotal = Number(thisMonthRow?.totalClaims) || 0;
      const claimsTrend = prevTotal > 0 ? Math.round(((currTotal - prevTotal) / prevTotal) * 1000) / 10 : 0;

      const prevPending = Number(prevMonthRow?.pendingClaims) || 0;
      const currPending = Number(thisMonthRow?.pendingClaims) || 0;
      const pendingTrend = prevPending > 0 ? Math.round(((currPending - prevPending) / prevPending) * 1000) / 10 : 0;

      const prevRejected = Number(prevMonthRow?.rejectedClaims) || 0;
      const currRejected = Number(thisMonthRow?.rejectedClaims) || 0;
      const rejectedTrend = prevRejected > 0 ? Math.round(((currRejected - prevRejected) / prevRejected) * 1000) / 10 : 0;

      const avgHours = avgProcRow?.avg_hours != null ? Math.round(avgProcRow.avg_hours * 10) / 10 : null;

      return c.json({
        success: true,
        data: {
          totalUsers: Number(usersRow?.count) || 0,
          totalAdherents: Number(adherentsRow?.count) || 0,
          totalClaims,
          pendingClaims: Number(claimsRow?.pendingClaims) || 0,
          approvedClaims,
          totalAmount: Number(claimsRow?.totalAmount) || 0,
          approvalRate: Math.round(approvalRate * 10) / 10,
          processedToday: Number(todayRow?.processedToday) || 0,
          avgProcessingTime: avgHours != null ? `${avgHours}` : '—',
          rejectedToday: Number(todayRow?.rejectedToday) || 0,
          uniquePatients: Number(claimsRow?.uniquePatients) || 0,
          trends: {
            claimsTrend,
            pendingTrend,
            rejectedTrend,
          },
          fetchedAt: new Date().toISOString(),
        },
      });
    } catch (err) {
      return c.json({
        success: false,
        error: { code: 'ANALYTICS_ERROR', message: String(err) },
      }, 500);
    }
  }
);

/**
 * GET /analytics/recent-bulletins
 * Returns the 5 most recent bulletins for the dashboard table
 */
analytics.get(
  '/recent-bulletins',
  requireRole('ADMIN', 'INSURER_ADMIN', 'INSURER_AGENT', 'PHARMACIST', 'DOCTOR', 'LAB_MANAGER', 'CLINIC_ADMIN', 'HR'),
  async (c) => {
    const { getDb } = await import('../lib/db');
    const db = getDb(c);
    const user = c.get('user');

    try {
      let whereClause = '';
      const params: string[] = [];

      // HR: filter by company
      if (user.role === 'HR' && user.companyId) {
        whereClause = 'WHERE a.company_id = ?';
        params.push(user.companyId);
      }
      // Provider: filter by provider_id, actes_bulletin.provider_id, OR created_by
      else if (['PHARMACIST', 'DOCTOR', 'LAB_MANAGER', 'CLINIC_ADMIN'].includes(user.role)) {
        if (user.providerId) {
          whereClause = `WHERE (
            bs.provider_id = ?
            OR bs.created_by = ?
            OR bs.id IN (SELECT ab.bulletin_id FROM actes_bulletin ab WHERE ab.provider_id = ?)
          )`;
          params.push(user.providerId, user.id, user.providerId);
        } else {
          whereClause = 'WHERE bs.created_by = ?';
          params.push(user.id);
        }
      }
      // Filter by insurer for non-admin roles
      else if (user.role !== 'ADMIN' && user.insurerId) {
        whereClause = 'WHERE co.insurer_id = ?';
        params.push(user.insurerId);
      }

      const rows = await db
        .prepare(`
          SELECT
            bs.id, bs.bulletin_number, bs.status, bs.care_type, bs.bulletin_date,
            bs.total_amount, bs.reimbursed_amount, bs.created_at,
            a.first_name as adherent_first_name, a.last_name as adherent_last_name,
            co.name as company_name
          FROM bulletins_soins bs
          LEFT JOIN adherents a ON bs.adherent_id = a.id
          LEFT JOIN companies co ON a.company_id = co.id
          ${whereClause}
          ORDER BY bs.created_at DESC
          LIMIT 5
        `)
        .bind(...params)
        .all();

      const data = (rows.results ?? []).map((r: Record<string, unknown>) => ({
        id: r.id,
        bulletinNumber: r.bulletin_number,
        status: r.status,
        careType: r.care_type,
        careDate: r.bulletin_date,
        totalAmount: r.total_amount,
        reimbursedAmount: r.reimbursed_amount,
        createdAt: r.created_at,
        adherentName: `${r.adherent_first_name || ''} ${r.adherent_last_name || ''}`.trim(),
        companyName: r.company_name || '—',
      }));

      return c.json({ success: true, data });
    } catch (err) {
      return c.json({
        success: false,
        error: { code: 'ANALYTICS_ERROR', message: String(err) },
      }, 500);
    }
  }
);

/**
 * GET /analytics/dashboard
 * Get dashboard summary (combines multiple analytics)
 */
analytics.get(
  '/dashboard',
  requireRole('ADMIN', 'INSURER_ADMIN', 'INSURER_AGENT', 'SOIN_GESTIONNAIRE'),
  zValidator('query', dashboardQuerySchema),
  async (c) => {
    const { insurerId } = c.req.valid('query');

    const user = c.get('user');
    const effectiveInsurerId =
      user.role === 'ADMIN' ? insurerId : user.insurerId;

    const analyticsService = new AnalyticsService(c.env);

    // Get current month data
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const dateRange = { start: startOfMonth, end: now };

    // Parallel fetch for performance
    const [kpis, trends, distribution, recentPerformance] = await Promise.all([
      analyticsService.getKPIs(effectiveInsurerId, dateRange),
      analyticsService.getClaimsTrend(effectiveInsurerId, dateRange, 'day'),
      analyticsService.getClaimsDistribution(effectiveInsurerId, dateRange),
      analyticsService.getMonthlyPerformance(effectiveInsurerId, 6),
    ]);

    return c.json({
      success: true,
      data: {
        kpis,
        trends,
        distribution,
        recentPerformance,
        generatedAt: new Date().toISOString(),
      },
    });
  }
);

/**
 * GET /analytics/bi
 * Business Intelligence dashboard aggregation from sante_demandes
 */
analytics.get(
  '/bi',
  requireRole('ADMIN', 'INSURER_ADMIN', 'INSURER_AGENT'),
  async (c) => {
    const { getDb } = await import('../lib/db');
    const db = getDb(c);

    // KPIs
    const kpiResult = await db.prepare(`
      SELECT
        COUNT(*) as totalDemandes,
        COALESCE(SUM(montant_rembourse), 0) as montantRembourse,
        ROUND(AVG(CASE WHEN statut IN ('approuvee','en_paiement','payee') THEN 100.0 ELSE 0 END), 1) as tauxAcceptation,
        ROUND(AVG(score_fraude), 1) as scoreFraudeMoyen
      FROM sante_demandes
    `).first();

    const adhCount = await db.prepare(
      `SELECT COUNT(DISTINCT adherent_id) as count FROM sante_demandes`
    ).first();

    // Monthly trends (last 6 months)
    const trends = await db.prepare(`
      SELECT
        strftime('%Y-%m', date_soin) as mois,
        COUNT(*) as demandes,
        COALESCE(SUM(montant_rembourse), 0) as montantRembourse,
        COALESCE(SUM(montant_demande), 0) as montantDemande
      FROM sante_demandes
      WHERE date_soin >= date('now', '-6 months')
      GROUP BY strftime('%Y-%m', date_soin)
      ORDER BY mois
    `).all();

    // Care type distribution
    const careTypes = await db.prepare(`
      SELECT type_soin as type, COUNT(*) as count, COALESCE(SUM(montant_demande), 0) as montant
      FROM sante_demandes
      GROUP BY type_soin
      ORDER BY count DESC
    `).all();

    // Care type label map
    const careLabels: Record<string, string> = {
      pharmacie: 'Pharmacie', consultation: 'Consultation', hospitalisation: 'Hospitalisation',
      laboratoire: 'Laboratoire', optique: 'Optique', dentaire: 'Dentaire',
    };

    // Top practitioners
    const topPraticiens = await db.prepare(`
      SELECT sp.id, sp.nom, sp.specialite as type,
             COUNT(*) as demandes, COALESCE(SUM(sd.montant_demande), 0) as montant
      FROM sante_demandes sd
      JOIN sante_praticiens sp ON sd.praticien_id = sp.id
      GROUP BY sp.id
      ORDER BY demandes DESC
      LIMIT 5
    `).all();

    // Status distribution
    const statuts = await db.prepare(`
      SELECT statut, COUNT(*) as count
      FROM sante_demandes
      GROUP BY statut
    `).all();

    const statutLabels: Record<string, string> = {
      soumise: 'En attente', en_examen: 'En examen', info_requise: 'Info requise',
      approuvee: 'Approuvées', en_paiement: 'En paiement', payee: 'Payées', rejetee: 'Rejetées',
    };

    // Insurer performance
    const assureurs = await db.prepare(`
      SELECT i.name as assureur, COUNT(*) as demandes,
             COALESCE(SUM(sd.montant_demande), 0) as montant
      FROM sante_demandes sd
      JOIN adherents a ON sd.adherent_id = a.id
      JOIN contracts c ON c.adherent_id = a.id
      JOIN insurers i ON c.insurer_id = i.id
      GROUP BY i.id
      ORDER BY demandes DESC
    `).all();

    // Fraud alerts by level
    const fraudLevels = await db.prepare(`
      SELECT
        CASE
          WHEN score_fraude >= 85 THEN 'Critique'
          WHEN score_fraude >= 70 THEN 'Élevé'
          WHEN score_fraude >= 50 THEN 'Moyen'
          WHEN score_fraude >= 30 THEN 'Faible'
        END as niveau,
        COUNT(*) as count
      FROM sante_demandes
      WHERE score_fraude >= 30
      GROUP BY niveau
      ORDER BY MIN(score_fraude) DESC
    `).all();

    // Fraud evolution (weekly)
    const fraudWeekly = await db.prepare(`
      SELECT
        'S' || ((julianday('now') - julianday(date_soin)) / 7 + 1) as semaine,
        COUNT(*) as alertes,
        COALESCE(SUM(montant_demande), 0) as montantSuspect
      FROM sante_demandes
      WHERE score_fraude >= 30 AND date_soin >= date('now', '-4 weeks')
      GROUP BY CAST((julianday('now') - julianday(date_soin)) / 7 AS INTEGER)
      ORDER BY semaine
    `).all();

    // Month label map
    const monthNames: Record<string, string> = {
      '01': 'Jan', '02': 'Fev', '03': 'Mar', '04': 'Avr', '05': 'Mai', '06': 'Jun',
      '07': 'Jul', '08': 'Aou', '09': 'Sep', '10': 'Oct', '11': 'Nov', '12': 'Dec',
    };

    return c.json({
      success: true,
      data: {
        kpis: {
          totalDemandes: Number(kpiResult?.totalDemandes) || 0,
          demandesChange: 0,
          montantRembourse: Number(kpiResult?.montantRembourse) || 0,
          montantChange: 0,
          tauxAcceptation: Number(kpiResult?.tauxAcceptation) || 0,
          tauxChange: 0,
          delaiMoyenTraitement: 18,
          delaiChange: 0,
          scoreFraudeMoyen: Number(kpiResult?.scoreFraudeMoyen) || 0,
          fraudeChange: 0,
          adhérentsActifs: Number(adhCount?.count) || 0,
          adhérentsChange: 0,
        },
        tendanceMensuelle: trends.results.map((r: Record<string, unknown>) => ({
          mois: monthNames[String(r.mois).split('-')[1] || ''] || String(r.mois),
          demandes: Number(r.demandes),
          montantRembourse: Number(r.montantRembourse),
          montantDemande: Number(r.montantDemande),
        })),
        repartitionTypeSoin: careTypes.results.map((r: Record<string, unknown>) => ({
          type: careLabels[String(r.type)] || String(r.type),
          count: Number(r.count),
          montant: Number(r.montant),
        })),
        topPraticiens: topPraticiens.results.map((r: Record<string, unknown>) => ({
          id: String(r.id),
          nom: String(r.nom),
          type: String(r.type),
          demandes: Number(r.demandes),
          montant: Number(r.montant),
        })),
        repartitionStatut: statuts.results.map((r: Record<string, unknown>) => ({
          statut: statutLabels[String(r.statut)] || String(r.statut),
          count: Number(r.count),
        })),
        performanceAssureurs: assureurs.results.map((r: Record<string, unknown>) => ({
          assureur: String(r.assureur),
          demandes: Number(r.demandes),
          montant: Number(r.montant),
          delaiMoyen: 18,
        })),
        alertesFraude: fraudLevels.results.map((r: Record<string, unknown>) => ({
          niveau: String(r.niveau),
          count: Number(r.count),
        })),
        evolutionFraude: fraudWeekly.results.map((r: Record<string, unknown>) => ({
          semaine: String(r.semaine),
          alertes: Number(r.alertes),
          montantSuspect: Number(r.montantSuspect),
        })),
      },
    });
  }
);

export default analytics;
