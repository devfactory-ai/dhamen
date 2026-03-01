/**
 * Realtime Dashboard Service
 *
 * Service for real-time dashboard updates using SSE and Durable Objects
 */

import type { Bindings } from '../types';

// Event types for real-time updates
export type RealtimeEventType =
  | 'dashboard.metrics'
  | 'claim.created'
  | 'claim.updated'
  | 'claim.approved'
  | 'claim.rejected'
  | 'eligibility.checked'
  | 'bordereau.generated'
  | 'bordereau.validated'
  | 'payment.initiated'
  | 'payment.completed'
  | 'payment.failed'
  | 'fraud.alert'
  | 'notification.new'
  | 'adherent.updated'
  | 'contract.expiring';

export interface RealtimeEvent {
  id: string;
  type: RealtimeEventType;
  data: Record<string, unknown>;
  timestamp: string;
  metadata?: {
    insurerId?: string;
    providerId?: string;
    userId?: string;
  };
}

export interface DashboardMetrics {
  // Claims metrics
  claims: {
    today: number;
    pending: number;
    approved: number;
    rejected: number;
    totalAmount: number;
    avgProcessingTime: number;
  };
  // Eligibility metrics
  eligibility: {
    checksToday: number;
    avgResponseTime: number;
    successRate: number;
  };
  // Financial metrics
  financial: {
    pendingPayments: number;
    totalPaid: number;
    outstandingAmount: number;
  };
  // Fraud metrics
  fraud: {
    alertsToday: number;
    highRiskClaims: number;
    blockedTransactions: number;
  };
  // System health
  system: {
    apiLatency: number;
    errorRate: number;
    activeUsers: number;
  };
}

export interface RealtimeSubscription {
  id: string;
  userId: string;
  insurerId?: string;
  providerId?: string;
  eventTypes: RealtimeEventType[];
  createdAt: string;
}

export class RealtimeDashboardService {
  constructor(private env: Bindings) {}

  /**
   * Get current dashboard metrics
   */
  async getDashboardMetrics(options: {
    insurerId?: string;
    providerId?: string;
  }): Promise<DashboardMetrics> {
    const today = new Date().toISOString().split('T')[0] ?? new Date().toISOString().slice(0, 10);

    // Build WHERE clauses based on filters
    const insurerFilter = options.insurerId ? `AND c.insurer_id = '${options.insurerId}'` : '';
    const providerFilter = options.providerId ? `AND c.provider_id = '${options.providerId}'` : '';
    const filters = `${insurerFilter} ${providerFilter}`;

    // Get claims metrics
    const claimsResult = await this.env.DB.prepare(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
        SUM(CASE WHEN status = 'approved' THEN 1 ELSE 0 END) as approved,
        SUM(CASE WHEN status = 'rejected' THEN 1 ELSE 0 END) as rejected,
        SUM(CASE WHEN status = 'approved' THEN approved_amount ELSE 0 END) as total_amount,
        AVG(CASE
          WHEN processed_at IS NOT NULL
          THEN (julianday(processed_at) - julianday(created_at)) * 24 * 60
          ELSE NULL
        END) as avg_processing_minutes
      FROM claims c
      WHERE DATE(c.created_at) = ? ${filters}
    `).bind(today).first<{
      total: number;
      pending: number;
      approved: number;
      rejected: number;
      total_amount: number;
      avg_processing_minutes: number;
    }>();

    // Get eligibility metrics from cache or compute
    const eligibilityStats = await this.getEligibilityStats(today, options);

    // Get financial metrics
    const financialResult = await this.env.DB.prepare(`
      SELECT
        SUM(CASE WHEN status = 'pending' THEN amount ELSE 0 END) as pending_payments,
        SUM(CASE WHEN status = 'completed' THEN amount ELSE 0 END) as total_paid,
        SUM(CASE WHEN status IN ('pending', 'processing') THEN amount ELSE 0 END) as outstanding
      FROM payment_orders
      WHERE insurer_id = COALESCE(?, insurer_id)
    `).bind(options.insurerId || null).first<{
      pending_payments: number;
      total_paid: number;
      outstanding: number;
    }>();

    // Get fraud metrics
    const fraudResult = await this.env.DB.prepare(`
      SELECT
        COUNT(*) as alerts_today,
        SUM(CASE WHEN risk_level = 'high' THEN 1 ELSE 0 END) as high_risk,
        SUM(CASE WHEN action_taken = 'blocked' THEN 1 ELSE 0 END) as blocked
      FROM fraud_alerts
      WHERE DATE(created_at) = ?
    `).bind(today).first<{
      alerts_today: number;
      high_risk: number;
      blocked: number;
    }>();

    // Get system health from cache
    const systemHealth = await this.getSystemHealth();

    return {
      claims: {
        today: claimsResult?.total || 0,
        pending: claimsResult?.pending || 0,
        approved: claimsResult?.approved || 0,
        rejected: claimsResult?.rejected || 0,
        totalAmount: claimsResult?.total_amount || 0,
        avgProcessingTime: claimsResult?.avg_processing_minutes || 0,
      },
      eligibility: eligibilityStats,
      financial: {
        pendingPayments: financialResult?.pending_payments || 0,
        totalPaid: financialResult?.total_paid || 0,
        outstandingAmount: financialResult?.outstanding || 0,
      },
      fraud: {
        alertsToday: fraudResult?.alerts_today || 0,
        highRiskClaims: fraudResult?.high_risk || 0,
        blockedTransactions: fraudResult?.blocked || 0,
      },
      system: systemHealth,
    };
  }

  /**
   * Get eligibility statistics
   */
  private async getEligibilityStats(
    date: string,
    options: { insurerId?: string; providerId?: string }
  ): Promise<DashboardMetrics['eligibility']> {
    // Try to get from cache first
    const cacheKey = `eligibility_stats:${date}:${options.insurerId || 'all'}:${options.providerId || 'all'}`;
    const cached = await this.env.CACHE.get(cacheKey);

    if (cached) {
      return JSON.parse(cached);
    }

    // Compute from audit logs
    const result = await this.env.DB.prepare(`
      SELECT
        COUNT(*) as checks,
        AVG(CAST(json_extract(details, '$.response_time_ms') AS INTEGER)) as avg_response,
        SUM(CASE WHEN json_extract(details, '$.eligible') = 1 THEN 1 ELSE 0 END) * 100.0 / COUNT(*) as success_rate
      FROM audit_logs
      WHERE action = 'eligibility_check'
        AND DATE(created_at) = ?
    `).bind(date).first<{
      checks: number;
      avg_response: number;
      success_rate: number;
    }>();

    const stats = {
      checksToday: result?.checks || 0,
      avgResponseTime: result?.avg_response || 0,
      successRate: result?.success_rate || 100,
    };

    // Cache for 1 minute
    await this.env.CACHE.put(cacheKey, JSON.stringify(stats), { expirationTtl: 60 });

    return stats;
  }

  /**
   * Get system health metrics
   */
  private async getSystemHealth(): Promise<DashboardMetrics['system']> {
    const cacheKey = 'system_health';
    const cached = await this.env.CACHE.get(cacheKey);

    if (cached) {
      return JSON.parse(cached);
    }

    // Get active users (sessions in last 15 minutes)
    const activeUsers = await this.env.DB.prepare(`
      SELECT COUNT(DISTINCT user_id) as count
      FROM audit_logs
      WHERE created_at > datetime('now', '-15 minutes')
    `).first<{ count: number }>();

    // Get error rate from last hour
    const errorStats = await this.env.DB.prepare(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN json_extract(details, '$.status_code') >= 500 THEN 1 ELSE 0 END) as errors
      FROM audit_logs
      WHERE created_at > datetime('now', '-1 hour')
    `).first<{ total: number; errors: number }>();

    const health = {
      apiLatency: 45, // Default, updated by health checks
      errorRate: errorStats?.total ? (errorStats.errors / errorStats.total) * 100 : 0,
      activeUsers: activeUsers?.count || 0,
    };

    // Cache for 30 seconds
    await this.env.CACHE.put(cacheKey, JSON.stringify(health), { expirationTtl: 30 });

    return health;
  }

  /**
   * Broadcast event to all subscribers
   */
  async broadcastEvent(event: Omit<RealtimeEvent, 'id' | 'timestamp'>): Promise<void> {
    const fullEvent: RealtimeEvent = {
      id: crypto.randomUUID(),
      ...event,
      timestamp: new Date().toISOString(),
    };

    // Store in recent events cache for new subscribers
    await this.storeRecentEvent(fullEvent);

    // Broadcast via Durable Object
    const hubId = this.env.NOTIFICATION_HUB.idFromName('main');
    const hub = this.env.NOTIFICATION_HUB.get(hubId);

    await hub.fetch('https://internal/broadcast', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(fullEvent),
    });
  }

  /**
   * Store recent event for replay
   */
  private async storeRecentEvent(event: RealtimeEvent): Promise<void> {
    const key = `recent_events:${event.type}`;
    const existing = await this.env.CACHE.get(key);
    const events: RealtimeEvent[] = existing ? JSON.parse(existing) : [];

    // Keep last 50 events per type
    events.unshift(event);
    if (events.length > 50) {
      events.pop();
    }

    await this.env.CACHE.put(key, JSON.stringify(events), { expirationTtl: 3600 });
  }

  /**
   * Get recent events for replay
   */
  async getRecentEvents(options: {
    types?: RealtimeEventType[];
    limit?: number;
    insurerId?: string;
    providerId?: string;
  }): Promise<RealtimeEvent[]> {
    const types = options.types || [
      'claim.created',
      'claim.approved',
      'claim.rejected',
      'payment.completed',
      'fraud.alert',
    ];
    const limit = options.limit || 20;
    const allEvents: RealtimeEvent[] = [];

    for (const type of types) {
      const key = `recent_events:${type}`;
      const cached = await this.env.CACHE.get(key);
      if (cached) {
        const events: RealtimeEvent[] = JSON.parse(cached);
        // Filter by insurer/provider if specified
        const filtered = events.filter((e) => {
          if (options.insurerId && e.metadata?.insurerId !== options.insurerId) {
            return false;
          }
          if (options.providerId && e.metadata?.providerId !== options.providerId) {
            return false;
          }
          return true;
        });
        allEvents.push(...filtered);
      }
    }

    // Sort by timestamp desc and limit
    return allEvents
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, limit);
  }

  /**
   * Get live activity feed
   */
  async getLiveActivity(options: {
    insurerId?: string;
    providerId?: string;
    limit?: number;
  }): Promise<Array<{
    id: string;
    type: string;
    title: string;
    description: string;
    timestamp: string;
    icon: string;
    color: string;
  }>> {
    const limit = options.limit || 10;
    const filters: string[] = [];
    const params: (string | number)[] = [];

    if (options.insurerId) {
      filters.push('insurer_id = ?');
      params.push(options.insurerId);
    }
    if (options.providerId) {
      filters.push('provider_id = ?');
      params.push(options.providerId);
    }

    const whereClause = filters.length > 0 ? `WHERE ${filters.join(' AND ')}` : '';

    // Get recent claims
    const claims = await this.env.DB.prepare(`
      SELECT
        id,
        'claim' as type,
        status,
        adherent_id,
        amount,
        created_at
      FROM claims
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT ?
    `).bind(...params, limit).all<{
      id: string;
      type: string;
      status: string;
      adherent_id: string;
      amount: number;
      created_at: string;
    }>();

    // Map to activity items
    return (claims.results || []).map((claim) => ({
      id: claim.id,
      type: 'claim',
      title: this.getActivityTitle('claim', claim.status),
      description: `Sinistre #${claim.id.slice(-6)} - ${(claim.amount / 1000).toFixed(3)} TND`,
      timestamp: claim.created_at,
      icon: this.getActivityIcon('claim', claim.status),
      color: this.getActivityColor('claim', claim.status),
    }));
  }

  private getActivityTitle(type: string, status: string): string {
    const titles: Record<string, Record<string, string>> = {
      claim: {
        pending: 'Nouveau sinistre en attente',
        approved: 'Sinistre approuvé',
        rejected: 'Sinistre rejeté',
        processing: 'Sinistre en traitement',
      },
      payment: {
        pending: 'Paiement initié',
        completed: 'Paiement effectué',
        failed: 'Paiement échoué',
      },
    };
    return titles[type]?.[status] || `${type} ${status}`;
  }

  private getActivityIcon(type: string, status: string): string {
    const icons: Record<string, Record<string, string>> = {
      claim: {
        pending: 'clock',
        approved: 'check-circle',
        rejected: 'x-circle',
        processing: 'loader',
      },
      payment: {
        pending: 'credit-card',
        completed: 'check',
        failed: 'alert-triangle',
      },
    };
    return icons[type]?.[status] || 'info';
  }

  private getActivityColor(type: string, status: string): string {
    const colors: Record<string, Record<string, string>> = {
      claim: {
        pending: 'yellow',
        approved: 'green',
        rejected: 'red',
        processing: 'blue',
      },
      payment: {
        pending: 'yellow',
        completed: 'green',
        failed: 'red',
      },
    };
    return colors[type]?.[status] || 'gray';
  }

  /**
   * Get trending metrics (changes over time)
   */
  async getTrendingMetrics(options: {
    insurerId?: string;
    period?: 'hour' | 'day' | 'week';
  }): Promise<{
    claims: { current: number; previous: number; trend: number };
    amount: { current: number; previous: number; trend: number };
    eligibility: { current: number; previous: number; trend: number };
    fraudAlerts: { current: number; previous: number; trend: number };
  }> {
    const period = options.period || 'day';
    const intervals: Record<string, string> = {
      hour: '-1 hour',
      day: '-1 day',
      week: '-7 days',
    };
    const previousIntervals: Record<string, string> = {
      hour: '-2 hours',
      day: '-2 days',
      week: '-14 days',
    };

    const interval = intervals[period];
    const previousInterval = previousIntervals[period];
    const insurerFilter = options.insurerId ? `AND insurer_id = '${options.insurerId}'` : '';

    // Current period claims
    const currentClaims = await this.env.DB.prepare(`
      SELECT COUNT(*) as count, SUM(amount) as total
      FROM claims
      WHERE created_at > datetime('now', ?) ${insurerFilter}
    `).bind(interval).first<{ count: number; total: number }>();

    // Previous period claims
    const previousClaims = await this.env.DB.prepare(`
      SELECT COUNT(*) as count, SUM(amount) as total
      FROM claims
      WHERE created_at > datetime('now', ?)
        AND created_at <= datetime('now', ?) ${insurerFilter}
    `).bind(previousInterval, interval).first<{ count: number; total: number }>();

    // Calculate trends
    const calculateTrend = (current: number, previous: number): number => {
      if (previous === 0) return current > 0 ? 100 : 0;
      return ((current - previous) / previous) * 100;
    };

    return {
      claims: {
        current: currentClaims?.count || 0,
        previous: previousClaims?.count || 0,
        trend: calculateTrend(currentClaims?.count || 0, previousClaims?.count || 0),
      },
      amount: {
        current: currentClaims?.total || 0,
        previous: previousClaims?.total || 0,
        trend: calculateTrend(currentClaims?.total || 0, previousClaims?.total || 0),
      },
      eligibility: {
        current: 0, // Computed from cache
        previous: 0,
        trend: 0,
      },
      fraudAlerts: {
        current: 0,
        previous: 0,
        trend: 0,
      },
    };
  }
}
