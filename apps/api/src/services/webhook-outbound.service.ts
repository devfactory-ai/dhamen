/**
 * Webhook Outbound Service
 *
 * Manages outbound webhooks to external systems (insurers, providers)
 */

import type { Bindings } from '../types';

export interface WebhookEndpoint {
  id: string;
  name: string;
  url: string;
  secret: string;
  events: WebhookEvent[];
  insurerId?: string;
  providerId?: string;
  isActive: boolean;
  retryPolicy?: RetryPolicy;
  headers?: Record<string, string>;
  createdAt: string;
  updatedAt: string;
}

export type WebhookEvent =
  // Claim events
  | 'claim.created'
  | 'claim.submitted'
  | 'claim.approved'
  | 'claim.rejected'
  | 'claim.updated'
  | 'claim.cancelled'
  // Eligibility events
  | 'eligibility.checked'
  | 'eligibility.expired'
  // Bordereau events
  | 'bordereau.created'
  | 'bordereau.validated'
  | 'bordereau.sent'
  | 'bordereau.paid'
  // Payment events
  | 'payment.initiated'
  | 'payment.completed'
  | 'payment.failed'
  // Fraud events
  | 'fraud.alert'
  | 'fraud.confirmed'
  // Adherent events
  | 'adherent.created'
  | 'adherent.updated'
  | 'adherent.deactivated'
  // Contract events
  | 'contract.created'
  | 'contract.renewed'
  | 'contract.terminated';

export interface RetryPolicy {
  maxRetries: number;
  initialDelay: number; // milliseconds
  maxDelay: number;
  backoffMultiplier: number;
}

export interface WebhookDelivery {
  id: string;
  endpointId: string;
  event: WebhookEvent;
  payload: Record<string, unknown>;
  attempt: number;
  status: 'pending' | 'success' | 'failed' | 'retrying';
  statusCode?: number;
  responseBody?: string;
  error?: string;
  nextRetryAt?: string;
  sentAt?: string;
  completedAt?: string;
  createdAt: string;
}

export interface WebhookPayload {
  id: string;
  event: WebhookEvent;
  timestamp: string;
  data: Record<string, unknown>;
  metadata: {
    insurerId?: string;
    providerId?: string;
    correlationId?: string;
  };
}

const DEFAULT_RETRY_POLICY: RetryPolicy = {
  maxRetries: 5,
  initialDelay: 1000,
  maxDelay: 3600000, // 1 hour
  backoffMultiplier: 2,
};

export class WebhookOutboundService {
  constructor(private env: Bindings) {}

  /**
   * Create a webhook endpoint
   */
  async createEndpoint(
    endpoint: Omit<WebhookEndpoint, 'id' | 'createdAt' | 'updatedAt'>
  ): Promise<WebhookEndpoint> {
    const id = this.generateId('wh');
    const now = new Date().toISOString();

    const newEndpoint: WebhookEndpoint = {
      ...endpoint,
      id,
      retryPolicy: endpoint.retryPolicy || DEFAULT_RETRY_POLICY,
      createdAt: now,
      updatedAt: now,
    };

    await this.env.DB.prepare(
      `INSERT INTO webhook_endpoints (
        id, name, url, secret, events, insurer_id, provider_id,
        is_active, retry_policy, headers, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
      .bind(
        id,
        endpoint.name,
        endpoint.url,
        endpoint.secret,
        JSON.stringify(endpoint.events),
        endpoint.insurerId || null,
        endpoint.providerId || null,
        endpoint.isActive ? 1 : 0,
        JSON.stringify(newEndpoint.retryPolicy),
        endpoint.headers ? JSON.stringify(endpoint.headers) : null,
        now,
        now
      )
      .run();

    return newEndpoint;
  }

  /**
   * Update a webhook endpoint
   */
  async updateEndpoint(
    id: string,
    updates: Partial<Omit<WebhookEndpoint, 'id' | 'createdAt'>>
  ): Promise<WebhookEndpoint | null> {
    const existing = await this.getEndpoint(id);
    if (!existing) return null;

    const updated = { ...existing, ...updates, updatedAt: new Date().toISOString() };

    await this.env.DB.prepare(
      `UPDATE webhook_endpoints SET
        name = ?, url = ?, secret = ?, events = ?, is_active = ?,
        retry_policy = ?, headers = ?, updated_at = ?
       WHERE id = ?`
    )
      .bind(
        updated.name,
        updated.url,
        updated.secret,
        JSON.stringify(updated.events),
        updated.isActive ? 1 : 0,
        JSON.stringify(updated.retryPolicy),
        updated.headers ? JSON.stringify(updated.headers) : null,
        updated.updatedAt,
        id
      )
      .run();

    return updated;
  }

  /**
   * Get webhook endpoint by ID
   */
  async getEndpoint(id: string): Promise<WebhookEndpoint | null> {
    const result = await this.env.DB.prepare(
      'SELECT * FROM webhook_endpoints WHERE id = ?'
    )
      .bind(id)
      .first();

    return result ? this.mapEndpoint(result) : null;
  }

  /**
   * List webhook endpoints
   */
  async listEndpoints(params: {
    insurerId?: string;
    providerId?: string;
    isActive?: boolean;
  }): Promise<WebhookEndpoint[]> {
    const conditions: string[] = [];
    const bindings: unknown[] = [];

    if (params.insurerId) {
      conditions.push('insurer_id = ?');
      bindings.push(params.insurerId);
    }

    if (params.providerId) {
      conditions.push('provider_id = ?');
      bindings.push(params.providerId);
    }

    if (params.isActive !== undefined) {
      conditions.push('is_active = ?');
      bindings.push(params.isActive ? 1 : 0);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const { results } = await this.env.DB.prepare(
      `SELECT * FROM webhook_endpoints ${whereClause} ORDER BY created_at DESC`
    )
      .bind(...bindings)
      .all();

    return (results || []).map(this.mapEndpoint);
  }

  /**
   * Delete a webhook endpoint
   */
  async deleteEndpoint(id: string): Promise<boolean> {
    const result = await this.env.DB.prepare(
      'DELETE FROM webhook_endpoints WHERE id = ?'
    )
      .bind(id)
      .run();

    return (result.meta.changes || 0) > 0;
  }

  /**
   * Trigger a webhook event
   */
  async trigger(
    event: WebhookEvent,
    data: Record<string, unknown>,
    metadata: { insurerId?: string; providerId?: string; correlationId?: string } = {}
  ): Promise<string[]> {
    // Find all active endpoints subscribed to this event
    const endpoints = await this.findSubscribedEndpoints(event, metadata);

    if (endpoints.length === 0) {
      return [];
    }

    const deliveryIds: string[] = [];

    for (const endpoint of endpoints) {
      const deliveryId = await this.createDelivery(endpoint, event, data, metadata);
      deliveryIds.push(deliveryId);

      // Queue delivery for processing
      await this.queueDelivery(deliveryId);
    }

    return deliveryIds;
  }

  /**
   * Process a webhook delivery
   */
  async processDelivery(deliveryId: string): Promise<boolean> {
    const delivery = await this.getDelivery(deliveryId);
    if (!delivery || delivery.status === 'success') {
      return false;
    }

    const endpoint = await this.getEndpoint(delivery.endpointId);
    if (!endpoint || !endpoint.isActive) {
      await this.updateDeliveryStatus(deliveryId, 'failed', {
        error: 'Endpoint not found or inactive',
      });
      return false;
    }

    const payload = this.buildPayload(delivery, endpoint);
    const signature = await this.signPayload(payload, endpoint.secret);

    try {
      const response = await fetch(endpoint.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Webhook-Signature': signature,
          'X-Webhook-Event': delivery.event,
          'X-Webhook-Delivery': deliveryId,
          'User-Agent': 'E-Sante-Webhooks/1.0',
          ...(endpoint.headers || {}),
        },
        body: JSON.stringify(payload),
      });

      const responseBody = await response.text().catch(() => '');

      if (response.ok) {
        await this.updateDeliveryStatus(deliveryId, 'success', {
          statusCode: response.status,
          responseBody: responseBody.substring(0, 1000),
          completedAt: new Date().toISOString(),
        });
        return true;
      }

      // Non-2xx response
      await this.handleDeliveryFailure(delivery, endpoint, {
        statusCode: response.status,
        responseBody: responseBody.substring(0, 1000),
        error: `HTTP ${response.status}: ${response.statusText}`,
      });
      return false;
    } catch (error) {
      await this.handleDeliveryFailure(delivery, endpoint, {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return false;
    }
  }

  /**
   * Retry failed deliveries
   */
  async retryPendingDeliveries(): Promise<number> {
    const { results } = await this.env.DB.prepare(
      `SELECT id FROM webhook_deliveries
       WHERE status = 'retrying' AND next_retry_at <= datetime('now')
       LIMIT 100`
    ).all<{ id: string }>();

    let processed = 0;
    for (const { id } of results || []) {
      await this.processDelivery(id);
      processed++;
    }

    return processed;
  }

  /**
   * Get delivery status
   */
  async getDelivery(id: string): Promise<WebhookDelivery | null> {
    const result = await this.env.DB.prepare(
      'SELECT * FROM webhook_deliveries WHERE id = ?'
    )
      .bind(id)
      .first();

    return result ? this.mapDelivery(result) : null;
  }

  /**
   * List deliveries for an endpoint
   */
  async listDeliveries(params: {
    endpointId?: string;
    event?: WebhookEvent;
    status?: WebhookDelivery['status'];
    limit?: number;
    offset?: number;
  }): Promise<{ deliveries: WebhookDelivery[]; total: number }> {
    const conditions: string[] = [];
    const bindings: unknown[] = [];

    if (params.endpointId) {
      conditions.push('endpoint_id = ?');
      bindings.push(params.endpointId);
    }

    if (params.event) {
      conditions.push('event = ?');
      bindings.push(params.event);
    }

    if (params.status) {
      conditions.push('status = ?');
      bindings.push(params.status);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countResult = await this.env.DB.prepare(
      `SELECT COUNT(*) as count FROM webhook_deliveries ${whereClause}`
    )
      .bind(...bindings)
      .first<{ count: number }>();

    const { results } = await this.env.DB.prepare(
      `SELECT * FROM webhook_deliveries ${whereClause}
       ORDER BY created_at DESC LIMIT ? OFFSET ?`
    )
      .bind(...bindings, params.limit || 50, params.offset || 0)
      .all();

    return {
      deliveries: (results || []).map(this.mapDelivery),
      total: countResult?.count || 0,
    };
  }

  /**
   * Get webhook statistics
   */
  async getStats(endpointId?: string): Promise<{
    total: number;
    success: number;
    failed: number;
    pending: number;
    avgResponseTime: number;
    byEvent: { event: string; count: number }[];
  }> {
    const filter = endpointId ? `WHERE endpoint_id = '${endpointId}'` : '';

    const stats = await this.env.DB.prepare(
      `SELECT
         COUNT(*) as total,
         SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) as success,
         SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed,
         SUM(CASE WHEN status IN ('pending', 'retrying') THEN 1 ELSE 0 END) as pending
       FROM webhook_deliveries ${filter}`
    ).first<{
      total: number;
      success: number;
      failed: number;
      pending: number;
    }>();

    const { results: byEvent } = await this.env.DB.prepare(
      `SELECT event, COUNT(*) as count FROM webhook_deliveries ${filter}
       GROUP BY event ORDER BY count DESC`
    ).all<{ event: string; count: number }>();

    return {
      total: stats?.total || 0,
      success: stats?.success || 0,
      failed: stats?.failed || 0,
      pending: stats?.pending || 0,
      avgResponseTime: 0, // Would need to track this
      byEvent: byEvent || [],
    };
  }

  /**
   * Test webhook endpoint
   */
  async testEndpoint(id: string): Promise<{
    success: boolean;
    statusCode?: number;
    responseTime: number;
    error?: string;
  }> {
    const endpoint = await this.getEndpoint(id);
    if (!endpoint) {
      return { success: false, responseTime: 0, error: 'Endpoint not found' };
    }

    const testPayload: WebhookPayload = {
      id: this.generateId('test'),
      event: 'claim.created',
      timestamp: new Date().toISOString(),
      data: { test: true, message: 'This is a test webhook' },
      metadata: {},
    };

    const signature = await this.signPayload(testPayload, endpoint.secret);
    const startTime = Date.now();

    try {
      const response = await fetch(endpoint.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Webhook-Signature': signature,
          'X-Webhook-Event': 'test',
          'User-Agent': 'E-Sante-Webhooks/1.0',
          ...(endpoint.headers || {}),
        },
        body: JSON.stringify(testPayload),
      });

      const responseTime = Date.now() - startTime;

      return {
        success: response.ok,
        statusCode: response.status,
        responseTime,
        error: response.ok ? undefined : `HTTP ${response.status}`,
      };
    } catch (error) {
      return {
        success: false,
        responseTime: Date.now() - startTime,
        error: error instanceof Error ? error.message : 'Connection failed',
      };
    }
  }

  // Private helper methods

  private async findSubscribedEndpoints(
    event: WebhookEvent,
    metadata: { insurerId?: string; providerId?: string }
  ): Promise<WebhookEndpoint[]> {
    const { results } = await this.env.DB.prepare(
      `SELECT * FROM webhook_endpoints
       WHERE is_active = 1
         AND (insurer_id IS NULL OR insurer_id = ?)
         AND (provider_id IS NULL OR provider_id = ?)`
    )
      .bind(metadata.insurerId || '', metadata.providerId || '')
      .all();

    return (results || [])
      .map(this.mapEndpoint)
      .filter((ep) => ep.events.includes(event));
  }

  private async createDelivery(
    endpoint: WebhookEndpoint,
    event: WebhookEvent,
    data: Record<string, unknown>,
    metadata: { insurerId?: string; providerId?: string; correlationId?: string }
  ): Promise<string> {
    const id = this.generateId('del');
    const now = new Date().toISOString();

    await this.env.DB.prepare(
      `INSERT INTO webhook_deliveries (
        id, endpoint_id, event, payload, attempt, status, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
      .bind(
        id,
        endpoint.id,
        event,
        JSON.stringify({ data, metadata }),
        0,
        'pending',
        now
      )
      .run();

    return id;
  }

  private async queueDelivery(deliveryId: string): Promise<void> {
    // In production, this would use Cloudflare Queues
    // For now, process immediately
    await this.processDelivery(deliveryId);
  }

  private buildPayload(
    delivery: WebhookDelivery,
    _endpoint: WebhookEndpoint
  ): WebhookPayload {
    return {
      id: delivery.id,
      event: delivery.event,
      timestamp: new Date().toISOString(),
      data: delivery.payload.data as Record<string, unknown>,
      metadata: delivery.payload.metadata as WebhookPayload['metadata'],
    };
  }

  private async signPayload(payload: WebhookPayload, secret: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(JSON.stringify(payload));
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );

    const signature = await crypto.subtle.sign('HMAC', key, data);
    const hashArray = Array.from(new Uint8Array(signature));
    return `sha256=${hashArray.map((b) => b.toString(16).padStart(2, '0')).join('')}`;
  }

  private async updateDeliveryStatus(
    id: string,
    status: WebhookDelivery['status'],
    updates: Partial<WebhookDelivery>
  ): Promise<void> {
    const setClause = ['status = ?'];
    const bindings: unknown[] = [status];

    if (updates.statusCode !== undefined) {
      setClause.push('status_code = ?');
      bindings.push(updates.statusCode);
    }

    if (updates.responseBody !== undefined) {
      setClause.push('response_body = ?');
      bindings.push(updates.responseBody);
    }

    if (updates.error !== undefined) {
      setClause.push('error = ?');
      bindings.push(updates.error);
    }

    if (updates.nextRetryAt !== undefined) {
      setClause.push('next_retry_at = ?');
      bindings.push(updates.nextRetryAt);
    }

    if (updates.completedAt !== undefined) {
      setClause.push('completed_at = ?');
      bindings.push(updates.completedAt);
    }

    if (status !== 'pending') {
      setClause.push('sent_at = COALESCE(sent_at, datetime("now"))');
    }

    bindings.push(id);

    await this.env.DB.prepare(
      `UPDATE webhook_deliveries SET ${setClause.join(', ')} WHERE id = ?`
    )
      .bind(...bindings)
      .run();
  }

  private async handleDeliveryFailure(
    delivery: WebhookDelivery,
    endpoint: WebhookEndpoint,
    failure: { statusCode?: number; responseBody?: string; error: string }
  ): Promise<void> {
    const newAttempt = delivery.attempt + 1;
    const retryPolicy = endpoint.retryPolicy || DEFAULT_RETRY_POLICY;

    if (newAttempt >= retryPolicy.maxRetries) {
      await this.updateDeliveryStatus(delivery.id, 'failed', {
        ...failure,
        completedAt: new Date().toISOString(),
      });
      return;
    }

    // Calculate next retry time with exponential backoff
    const delay = Math.min(
      retryPolicy.initialDelay *
        Math.pow(retryPolicy.backoffMultiplier, newAttempt),
      retryPolicy.maxDelay
    );

    const nextRetryAt = new Date(Date.now() + delay).toISOString();

    await this.env.DB.prepare(
      `UPDATE webhook_deliveries
       SET status = 'retrying', attempt = ?, next_retry_at = ?,
           status_code = ?, error = ?
       WHERE id = ?`
    )
      .bind(
        newAttempt,
        nextRetryAt,
        failure.statusCode || null,
        failure.error,
        delivery.id
      )
      .run();
  }

  private generateId(prefix: string): string {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 10);
    return `${prefix}_${timestamp}${random}`;
  }

  private mapEndpoint(row: Record<string, unknown>): WebhookEndpoint {
    return {
      id: row.id as string,
      name: row.name as string,
      url: row.url as string,
      secret: row.secret as string,
      events: JSON.parse(row.events as string),
      insurerId: (row.insurer_id as string) || undefined,
      providerId: (row.provider_id as string) || undefined,
      isActive: row.is_active === 1,
      retryPolicy: JSON.parse(row.retry_policy as string),
      headers: row.headers ? JSON.parse(row.headers as string) : undefined,
      createdAt: row.created_at as string,
      updatedAt: row.updated_at as string,
    };
  }

  private mapDelivery(row: Record<string, unknown>): WebhookDelivery {
    return {
      id: row.id as string,
      endpointId: row.endpoint_id as string,
      event: row.event as WebhookEvent,
      payload: JSON.parse(row.payload as string),
      attempt: row.attempt as number,
      status: row.status as WebhookDelivery['status'],
      statusCode: (row.status_code as number) || undefined,
      responseBody: (row.response_body as string) || undefined,
      error: (row.error as string) || undefined,
      nextRetryAt: (row.next_retry_at as string) || undefined,
      sentAt: (row.sent_at as string) || undefined,
      completedAt: (row.completed_at as string) || undefined,
      createdAt: row.created_at as string,
    };
  }
}
