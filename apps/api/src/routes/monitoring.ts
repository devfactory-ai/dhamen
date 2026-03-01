/**
 * Monitoring Routes
 *
 * Health checks, metrics, and alerting endpoints
 */

import { Hono } from 'hono';
import { authMiddleware, requireRole } from '../middleware/auth';
import { success, error } from '../lib/response';
import { MonitoringService } from '../services/monitoring.service';
import type { Bindings, Variables } from '../types';
import { getDb } from '../lib/db';

const monitoring = new Hono<{ Bindings: Bindings; Variables: Variables }>();

/**
 * GET /health/live
 * Liveness probe (no auth)
 */
monitoring.get('/health/live', async (c) => {
  return c.json({ status: 'alive', timestamp: new Date().toISOString() });
});

/**
 * GET /health/ready
 * Readiness probe with dependency checks (no auth)
 */
monitoring.get('/health/ready', async (c) => {
  const service = new MonitoringService(c.env);
  const result = await service.runHealthChecks();

  const statusCode = result.status === 'unhealthy' ? 503 : 200;

  return c.json({
    status: result.status,
    checks: result.checks,
    timestamp: new Date().toISOString(),
  }, statusCode);
});

/**
 * GET /metrics
 * Prometheus metrics endpoint (no auth for scraping)
 */
monitoring.get('/metrics', async (c) => {
  const service = new MonitoringService(c.env);
  const metrics = await service.getPrometheusMetrics();

  return new Response(metrics, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
});

// Protected endpoints
monitoring.use('/*', authMiddleware());

/**
 * GET /health/detailed
 * Detailed health status (requires auth)
 */
monitoring.get('/health/detailed', async (c) => {
  const service = new MonitoringService(c.env);
  const result = await service.runHealthChecks();
  const stats = await service.getApiStats('hour');

  return success(c, {
    status: result.status,
    checks: result.checks,
    stats,
    environment: c.env.ENVIRONMENT,
    version: c.env.API_VERSION,
    timestamp: new Date().toISOString(),
  });
});

/**
 * GET /alerts
 * Get active alerts
 */
monitoring.get('/alerts', requireRole('ADMIN', 'INSURER_ADMIN'), async (c) => {
  const severity = c.req.query('severity');
  const limit = parseInt(c.req.query('limit') || '50', 10);
  const service = new MonitoringService(c.env);

  const alerts = await service.getActiveAlerts({ severity, limit });

  return success(c, {
    alerts,
    total: alerts.length,
  });
});

/**
 * POST /alerts
 * Create a new alert (for internal/manual alerts)
 */
monitoring.post('/alerts', requireRole('ADMIN'), async (c) => {
  const body = await c.req.json<{
    type: string;
    severity: 'info' | 'warning' | 'error' | 'critical';
    title: string;
    message: string;
    source?: string;
    metadata?: Record<string, unknown>;
  }>();

  const service = new MonitoringService(c.env);

  const alert = await service.createAlert({
    type: body.type,
    severity: body.severity,
    title: body.title,
    message: body.message,
    source: body.source || 'manual',
    metadata: body.metadata || {},
  });

  return success(c, alert, 201);
});

/**
 * POST /alerts/:id/resolve
 * Resolve an alert
 */
monitoring.post('/alerts/:id/resolve', requireRole('ADMIN', 'INSURER_ADMIN'), async (c) => {
  const alertId = c.req.param('id');
  const service = new MonitoringService(c.env);

  await service.resolveAlert(alertId);

  return success(c, { resolved: true });
});

/**
 * GET /stats
 * Get API statistics
 */
monitoring.get('/stats', async (c) => {
  const period = (c.req.query('period') as 'hour' | 'day' | 'week') || 'day';
  const service = new MonitoringService(c.env);

  const stats = await service.getApiStats(period);

  return success(c, stats);
});

/**
 * GET /stats/realtime
 * Get realtime statistics
 */
monitoring.get('/stats/realtime', async (c) => {
  const user = c.get('user');
  const insurerFilter = user.insurerId ? `AND insurer_id = '${user.insurerId}'` : '';

  // Get realtime stats
  const [activeUsers, pendingClaims, todayClaims, systemLoad] = await Promise.all([
    getDb(c).prepare(`
      SELECT COUNT(DISTINCT user_id) as count FROM audit_logs
      WHERE created_at > datetime('now', '-15 minutes')
    `).first<{ count: number }>(),

    getDb(c).prepare(`
      SELECT COUNT(*) as count FROM claims
      WHERE status = 'pending' ${insurerFilter}
    `).first<{ count: number }>(),

    getDb(c).prepare(`
      SELECT COUNT(*) as count, SUM(amount) as total FROM claims
      WHERE DATE(created_at) = DATE('now') ${insurerFilter}
    `).first<{ count: number; total: number }>(),

    c.env.CACHE.get('system_load'),
  ]);

  return success(c, {
    activeUsers: activeUsers?.count || 0,
    pendingClaims: pendingClaims?.count || 0,
    todayClaims: {
      count: todayClaims?.count || 0,
      total: todayClaims?.total || 0,
    },
    systemLoad: systemLoad ? JSON.parse(systemLoad) : { cpu: 0, memory: 0 },
    timestamp: new Date().toISOString(),
  });
});

/**
 * GET /audit
 * Get audit log summary
 */
monitoring.get('/audit', requireRole('ADMIN'), async (c) => {
  const limit = parseInt(c.req.query('limit') || '100', 10);
  const action = c.req.query('action');
  const userId = c.req.query('userId');

  let query = 'SELECT * FROM audit_logs WHERE 1=1';
  const params: (string | number)[] = [];

  if (action) {
    query += ' AND action = ?';
    params.push(action);
  }
  if (userId) {
    query += ' AND user_id = ?';
    params.push(userId);
  }

  query += ' ORDER BY created_at DESC LIMIT ?';
  params.push(limit);

  const result = await getDb(c).prepare(query).bind(...params).all<{
    id: string;
    user_id: string;
    action: string;
    resource_type: string;
    resource_id: string;
    details: string;
    ip_address: string;
    created_at: string;
  }>();

  return success(c, {
    logs: (result.results || []).map((log) => ({
      ...log,
      details: log.details ? JSON.parse(log.details) : null,
    })),
    total: result.results?.length || 0,
  });
});

export { monitoring };
