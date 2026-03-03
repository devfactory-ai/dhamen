/**
 * Realtime Dashboard Routes
 *
 * SSE endpoints for real-time dashboard updates
 */

import { Hono } from 'hono';
import { authMiddleware, requireRole } from '../middleware/auth';
import { success, error } from '../lib/response';
import { RealtimeDashboardService, type RealtimeEventType } from '../services/realtime-dashboard.service';
import type { Bindings, Variables } from '../types';
import { getDb } from '../lib/db';

const dashboardRealtime = new Hono<{ Bindings: Bindings; Variables: Variables }>();

// Apply auth middleware
dashboardRealtime.use('*', authMiddleware());

/**
 * GET /metrics
 * Get current dashboard metrics
 */
dashboardRealtime.get('/metrics', async (c) => {
  const user = c.get('user');
  const service = new RealtimeDashboardService(c.env);

  const metrics = await service.getDashboardMetrics({
    insurerId: user.insurerId,
    providerId: user.providerId,
  });

  return success(c, metrics);
});

/**
 * GET /activity
 * Get live activity feed
 */
dashboardRealtime.get('/activity', async (c) => {
  const user = c.get('user');
  const limit = Math.min(parseInt(c.req.query('limit') || '10', 10), 100);
  const service = new RealtimeDashboardService(c.env);

  const activity = await service.getLiveActivity({
    insurerId: user.insurerId,
    providerId: user.providerId,
    limit,
  });

  return success(c, activity);
});

/**
 * GET /trending
 * Get trending metrics with comparison
 */
dashboardRealtime.get('/trending', async (c) => {
  const user = c.get('user');
  const period = (c.req.query('period') as 'hour' | 'day' | 'week') || 'day';
  const service = new RealtimeDashboardService(c.env);

  const trending = await service.getTrendingMetrics({
    insurerId: user.insurerId,
    period,
  });

  return success(c, trending);
});

/**
 * GET /events
 * Get recent events for replay
 */
dashboardRealtime.get('/events', async (c) => {
  const user = c.get('user');
  const typesParam = c.req.query('types');
  const limit = Math.min(parseInt(c.req.query('limit') || '20', 10), 100);
  const service = new RealtimeDashboardService(c.env);

  const types = typesParam
    ? (typesParam.split(',') as RealtimeEventType[])
    : undefined;

  const events = await service.getRecentEvents({
    types,
    limit,
    insurerId: user.insurerId,
    providerId: user.providerId,
  });

  return success(c, events);
});

/**
 * GET /stream
 * SSE endpoint for real-time updates
 */
dashboardRealtime.get('/stream', async (c) => {
  const user = c.get('user');
  const typesParam = c.req.query('types');

  // Parse event types to subscribe to
  const eventTypes: RealtimeEventType[] = typesParam
    ? (typesParam.split(',') as RealtimeEventType[])
    : [
        'dashboard.metrics',
        'claim.created',
        'claim.approved',
        'claim.rejected',
        'payment.completed',
        'fraud.alert',
        'notification.new',
      ];

  // Create SSE response
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      // Send initial connection event
      const connectEvent = `event: connected\ndata: ${JSON.stringify({
        userId: user.id,
        subscribedTypes: eventTypes,
        timestamp: new Date().toISOString(),
      })}\n\n`;
      controller.enqueue(encoder.encode(connectEvent));

      // Send initial metrics
      const service = new RealtimeDashboardService(c.env);
      const metrics = await service.getDashboardMetrics({
        insurerId: user.insurerId,
        providerId: user.providerId,
      });

      const metricsEvent = `event: dashboard.metrics\ndata: ${JSON.stringify(metrics)}\n\n`;
      controller.enqueue(encoder.encode(metricsEvent));

      // Set up periodic metrics update (every 30 seconds)
      const metricsInterval = setInterval(async () => {
        try {
          const updatedMetrics = await service.getDashboardMetrics({
            insurerId: user.insurerId,
            providerId: user.providerId,
          });
          const event = `event: dashboard.metrics\ndata: ${JSON.stringify(updatedMetrics)}\n\n`;
          controller.enqueue(encoder.encode(event));
        } catch (error) {
          // Ignore errors in background updates
        }
      }, 30000);

      // Keep-alive ping every 15 seconds
      const pingInterval = setInterval(() => {
        controller.enqueue(encoder.encode(': ping\n\n'));
      }, 15000);

      // Clean up on close
      c.req.raw.signal.addEventListener('abort', () => {
        clearInterval(metricsInterval);
        clearInterval(pingInterval);
        controller.close();
      });
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
});

/**
 * POST /broadcast
 * Broadcast event to all subscribers (internal use)
 */
dashboardRealtime.post('/broadcast', async (c) => {
  const user = c.get('user');

  // Only admins can broadcast
  if (user.role !== 'ADMIN' && user.role !== 'INSURER_ADMIN') {
    return error(c, 'FORBIDDEN', 'Non autorisé', 403);
  }

  const body = await c.req.json<{
    type: RealtimeEventType;
    data: Record<string, unknown>;
  }>();

  const service = new RealtimeDashboardService(c.env);

  await service.broadcastEvent({
    type: body.type,
    data: body.data,
    metadata: {
      insurerId: user.insurerId,
      userId: user.id,
    },
  });

  return success(c, { broadcasted: true });
});

/**
 * GET /kpis
 * Get KPIs for dashboard widgets
 */
dashboardRealtime.get('/kpis', async (c) => {
  const user = c.get('user');
  const insurerFilter = user.insurerId ? `AND insurer_id = '${user.insurerId}'` : '';
  const providerFilter = user.providerId ? `AND provider_id = '${user.providerId}'` : '';

  // Today's date
  const today = new Date().toISOString().split('T')[0];

  // Get various KPIs in parallel
  const [
    claimsToday,
    claimsPending,
    claimsApprovalRate,
    avgTicket,
    topProviders,
    topCategories,
  ] = await Promise.all([
    // Claims today
    getDb(c).prepare(`
      SELECT COUNT(*) as count FROM claims
      WHERE DATE(created_at) = ? ${insurerFilter} ${providerFilter}
    `).bind(today).first<{ count: number }>(),

    // Pending claims
    getDb(c).prepare(`
      SELECT COUNT(*) as count FROM claims
      WHERE status = 'pending' ${insurerFilter} ${providerFilter}
    `).first<{ count: number }>(),

    // Approval rate (last 30 days)
    getDb(c).prepare(`
      SELECT
        ROUND(
          SUM(CASE WHEN status = 'approved' THEN 1 ELSE 0 END) * 100.0 /
          NULLIF(COUNT(*), 0),
          1
        ) as rate
      FROM claims
      WHERE created_at > datetime('now', '-30 days')
        AND status IN ('approved', 'rejected')
        ${insurerFilter} ${providerFilter}
    `).first<{ rate: number }>(),

    // Average ticket amount
    getDb(c).prepare(`
      SELECT AVG(amount) as avg_amount FROM claims
      WHERE created_at > datetime('now', '-30 days')
        ${insurerFilter} ${providerFilter}
    `).first<{ avg_amount: number }>(),

    // Top 5 providers by claims
    getDb(c).prepare(`
      SELECT p.name, COUNT(c.id) as claims_count
      FROM claims c
      JOIN providers p ON c.provider_id = p.id
      WHERE c.created_at > datetime('now', '-30 days')
        ${insurerFilter}
      GROUP BY p.id
      ORDER BY claims_count DESC
      LIMIT 5
    `).all<{ name: string; claims_count: number }>(),

    // Top 5 categories
    getDb(c).prepare(`
      SELECT care_type as category, COUNT(*) as count
      FROM claims
      WHERE created_at > datetime('now', '-30 days')
        ${insurerFilter} ${providerFilter}
      GROUP BY care_type
      ORDER BY count DESC
      LIMIT 5
    `).all<{ category: string; count: number }>(),
  ]);

  return success(c, {
    claimsToday: claimsToday?.count || 0,
    claimsPending: claimsPending?.count || 0,
    approvalRate: claimsApprovalRate?.rate || 0,
    avgTicket: avgTicket?.avg_amount || 0,
    topProviders: topProviders.results || [],
    topCategories: topCategories.results || [],
  });
});

/**
 * GET /alerts
 * Get active alerts for dashboard
 */
dashboardRealtime.get('/alerts', async (c) => {
  const user = c.get('user');
  const insurerFilter = user.insurerId ? `WHERE insurer_id = '${user.insurerId}'` : '';

  // Get unacknowledged alerts
  const alerts = await getDb(c).prepare(`
    SELECT
      id,
      type,
      severity,
      title,
      message,
      data,
      created_at
    FROM alerts
    ${insurerFilter ? insurerFilter + ' AND' : 'WHERE'} acknowledged_at IS NULL
    ORDER BY
      CASE severity
        WHEN 'critical' THEN 1
        WHEN 'high' THEN 2
        WHEN 'medium' THEN 3
        WHEN 'low' THEN 4
      END,
      created_at DESC
    LIMIT 20
  `).all<{
    id: string;
    type: string;
    severity: string;
    title: string;
    message: string;
    data: string;
    created_at: string;
  }>();

  return success(c, alerts.results || []);
});

/**
 * POST /alerts/:id/acknowledge
 * Acknowledge an alert
 */
dashboardRealtime.post('/alerts/:id/acknowledge', async (c) => {
  const user = c.get('user');
  const alertId = c.req.param('id');

  await getDb(c).prepare(`
    UPDATE alerts
    SET acknowledged_at = datetime('now'),
        acknowledged_by = ?
    WHERE id = ?
  `).bind(user.id, alertId).run();

  return success(c, { acknowledged: true });
});

export { dashboardRealtime };
