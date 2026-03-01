/**
 * Analytics Routes
 *
 * Provides analytics and business intelligence endpoints
 */
import { Hono } from 'hono';
import type { Bindings, Variables } from '../types';
import { requireAuth, requireRole } from '../middleware/auth';
import { AnalyticsService } from '../services/analytics.service';

const analytics = new Hono<{ Bindings: Bindings; Variables: Variables }>();

// All analytics routes require authentication
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
  async (c) => {
    const insurerId = c.req.query('insurerId');
    const startDate = c.req.query('startDate');
    const endDate = c.req.query('endDate');

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
  async (c) => {
    const insurerId = c.req.query('insurerId');
    const startDate = c.req.query('startDate');
    const endDate = c.req.query('endDate');
    const granularity = (c.req.query('granularity') || 'day') as 'day' | 'week' | 'month';

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
  async (c) => {
    const insurerId = c.req.query('insurerId');
    const startDate = c.req.query('startDate');
    const endDate = c.req.query('endDate');
    const groupBy = (c.req.query('groupBy') || 'care_type') as
      | 'care_type'
      | 'status'
      | 'provider_type';

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
  async (c) => {
    const insurerId = c.req.query('insurerId');
    const months = parseInt(c.req.query('months') || '12', 10);

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
  async (c) => {
    const insurerId = c.req.query('insurerId');
    const startDate = c.req.query('startDate');
    const endDate = c.req.query('endDate');
    const limit = parseInt(c.req.query('limit') || '20', 10);

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
  async (c) => {
    const insurerId = c.req.query('insurerId');

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
  requireRole('ADMIN', 'INSURER_ADMIN', 'SOIN_GESTIONNAIRE'),
  async (c) => {
    const insurerId = c.req.query('insurerId');
    const startDate = c.req.query('startDate');
    const endDate = c.req.query('endDate');

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
  requireRole('ADMIN', 'INSURER_ADMIN', 'SOIN_GESTIONNAIRE'),
  async (c) => {
    const insurerId = c.req.query('insurerId');
    const currentStart = c.req.query('currentStart');
    const currentEnd = c.req.query('currentEnd');
    const previousStart = c.req.query('previousStart');
    const previousEnd = c.req.query('previousEnd');

    if (!currentStart || !currentEnd || !previousStart || !previousEnd) {
      return c.json(
        {
          success: false,
          error: {
            code: 'MISSING_DATES',
            message: 'All date parameters are required for comparison',
          },
        },
        400
      );
    }

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
  requireRole('ADMIN', 'INSURER_ADMIN'),
  async (c) => {
    const type = (c.req.query('type') || 'kpis') as
      | 'kpis'
      | 'trends'
      | 'providers'
      | 'adherents'
      | 'fraud';
    const format = (c.req.query('format') || 'json') as 'json' | 'csv';
    const insurerId = c.req.query('insurerId');
    const startDate = c.req.query('startDate');
    const endDate = c.req.query('endDate');

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
 * GET /analytics/dashboard
 * Get dashboard summary (combines multiple analytics)
 */
analytics.get(
  '/dashboard',
  requireRole('ADMIN', 'INSURER_ADMIN', 'INSURER_AGENT', 'SOIN_GESTIONNAIRE'),
  async (c) => {
    const insurerId = c.req.query('insurerId');

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

export default analytics;
