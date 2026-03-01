/**
 * Monitoring Service
 *
 * Metrics collection, health checks, and alerting
 */

import type { Bindings } from '../types';

export interface Metric {
  name: string;
  type: 'counter' | 'gauge' | 'histogram';
  value: number;
  labels: Record<string, string>;
  timestamp: number;
}

export interface HealthCheck {
  name: string;
  status: 'healthy' | 'degraded' | 'unhealthy';
  latencyMs: number;
  message?: string;
  lastChecked: string;
}

export interface Alert {
  id: string;
  type: string;
  severity: 'info' | 'warning' | 'error' | 'critical';
  title: string;
  message: string;
  source: string;
  metadata: Record<string, unknown>;
  createdAt: string;
  resolvedAt?: string;
}

export class MonitoringService {
  private metricsBuffer: Metric[] = [];

  constructor(private env: Bindings) {}

  async incrementCounter(name: string, labels: Record<string, string> = {}, value = 1): Promise<void> {
    this.metricsBuffer.push({
      name,
      type: 'counter',
      value,
      labels,
      timestamp: Date.now(),
    });
    if (this.metricsBuffer.length >= 100) {
      await this.flushMetrics();
    }
  }

  async setGauge(name: string, value: number, labels: Record<string, string> = {}): Promise<void> {
    this.metricsBuffer.push({ name, type: 'gauge', value, labels, timestamp: Date.now() });
  }

  async observeHistogram(name: string, value: number, labels: Record<string, string> = {}): Promise<void> {
    this.metricsBuffer.push({ name, type: 'histogram', value, labels, timestamp: Date.now() });
  }

  async flushMetrics(): Promise<void> {
    if (this.metricsBuffer.length === 0) return;
    const metrics = [...this.metricsBuffer];
    this.metricsBuffer = [];
    const key = `metrics:${Date.now()}`;
    await this.env.CACHE.put(key, JSON.stringify(metrics), { expirationTtl: 86400 });
  }

  async getPrometheusMetrics(): Promise<string> {
    const lines: string[] = [
      '# HELP dhamen_up Whether the service is up',
      '# TYPE dhamen_up gauge',
      'dhamen_up 1',
      '',
      '# HELP dhamen_requests_total Total API requests',
      '# TYPE dhamen_requests_total counter',
    ];
    return lines.join('\n');
  }

  async runHealthChecks(): Promise<{ status: 'healthy' | 'degraded' | 'unhealthy'; checks: HealthCheck[] }> {
    const checks: HealthCheck[] = [];
    checks.push(await this.checkDatabase());
    checks.push(await this.checkCache());
    checks.push(await this.checkStorage());

    const unhealthy = checks.filter((c) => c.status === 'unhealthy');
    const degraded = checks.filter((c) => c.status === 'degraded');
    let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
    if (unhealthy.length > 0) status = 'unhealthy';
    else if (degraded.length > 0) status = 'degraded';

    return { status, checks };
  }

  private async checkDatabase(): Promise<HealthCheck> {
    const start = Date.now();
    try {
      await this.env.DB.prepare('SELECT 1').first();
      return { name: 'database', status: 'healthy', latencyMs: Date.now() - start, lastChecked: new Date().toISOString() };
    } catch (error) {
      return { name: 'database', status: 'unhealthy', latencyMs: Date.now() - start, message: String(error), lastChecked: new Date().toISOString() };
    }
  }

  private async checkCache(): Promise<HealthCheck> {
    const start = Date.now();
    try {
      const testKey = `health:${Date.now()}`;
      await this.env.CACHE.put(testKey, 'test', { expirationTtl: 60 });
      await this.env.CACHE.get(testKey);
      await this.env.CACHE.delete(testKey);
      return { name: 'cache', status: 'healthy', latencyMs: Date.now() - start, lastChecked: new Date().toISOString() };
    } catch (error) {
      return { name: 'cache', status: 'unhealthy', latencyMs: Date.now() - start, message: String(error), lastChecked: new Date().toISOString() };
    }
  }

  private async checkStorage(): Promise<HealthCheck> {
    const start = Date.now();
    try {
      await this.env.STORAGE.list({ limit: 1 });
      return { name: 'storage', status: 'healthy', latencyMs: Date.now() - start, lastChecked: new Date().toISOString() };
    } catch (error) {
      return { name: 'storage', status: 'degraded', latencyMs: Date.now() - start, message: String(error), lastChecked: new Date().toISOString() };
    }
  }

  async createAlert(alert: Omit<Alert, 'id' | 'createdAt'>): Promise<Alert> {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const fullAlert: Alert = { id, ...alert, createdAt: now };

    await this.env.DB.prepare(`
      INSERT INTO monitoring_alerts (id, type, severity, title, message, source, metadata, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(id, alert.type, alert.severity, alert.title, alert.message, alert.source, JSON.stringify(alert.metadata), now).run();

    await this.sendAlertNotifications(fullAlert);
    return fullAlert;
  }

  private async sendAlertNotifications(alert: Alert): Promise<void> {
    if (alert.severity === 'critical' || alert.severity === 'error') {
      console.log(`[ALERT] ${alert.severity.toUpperCase()}: ${alert.title} - ${alert.message}`);
    }
  }

  async resolveAlert(alertId: string): Promise<void> {
    await this.env.DB.prepare(`UPDATE monitoring_alerts SET resolved_at = datetime('now') WHERE id = ?`).bind(alertId).run();
  }

  async getActiveAlerts(options?: { severity?: string; limit?: number }): Promise<Alert[]> {
    const limit = options?.limit || 50;
    const severityFilter = options?.severity ? `AND severity = '${options.severity}'` : '';
    const result = await this.env.DB.prepare(`
      SELECT * FROM monitoring_alerts WHERE resolved_at IS NULL ${severityFilter} ORDER BY created_at DESC LIMIT ?
    `).bind(limit).all<{ id: string; type: string; severity: string; title: string; message: string; source: string; metadata: string; created_at: string }>();

    return (result.results || []).map((row) => ({
      id: row.id,
      type: row.type,
      severity: row.severity as Alert['severity'],
      title: row.title,
      message: row.message,
      source: row.source,
      metadata: JSON.parse(row.metadata),
      createdAt: row.created_at,
    }));
  }

  async getApiStats(period: 'hour' | 'day' | 'week' = 'day'): Promise<{
    totalRequests: number;
    errorRate: number;
    avgLatency: number;
  }> {
    const intervals = { hour: '-1 hour', day: '-1 day', week: '-7 days' };
    const result = await this.env.DB.prepare(`
      SELECT COUNT(*) as total,
        SUM(CASE WHEN json_extract(details, '$.status_code') >= 500 THEN 1 ELSE 0 END) as errors,
        AVG(CAST(json_extract(details, '$.latency_ms') AS INTEGER)) as avg_latency
      FROM audit_logs WHERE action = 'api_request' AND created_at > datetime('now', ?)
    `).bind(intervals[period]).first<{ total: number; errors: number; avg_latency: number }>();

    return {
      totalRequests: result?.total || 0,
      errorRate: result?.total ? (result.errors / result.total) * 100 : 0,
      avgLatency: result?.avg_latency || 0,
    };
  }
}
