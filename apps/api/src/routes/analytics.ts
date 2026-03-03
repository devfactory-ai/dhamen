/**
 * Analytics Routes
 *
 * Provides analytics and business intelligence endpoints
 */
import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import type { Bindings, Variables } from '../types';
import { requireAuth, requireRole } from '../middleware/auth';
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
  requireRole('ADMIN', 'INSURER_ADMIN', 'SOIN_GESTIONNAIRE'),
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
  requireRole('ADMIN', 'INSURER_ADMIN', 'SOIN_GESTIONNAIRE'),
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
  requireRole('ADMIN', 'INSURER_ADMIN'),
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

export default analytics;
