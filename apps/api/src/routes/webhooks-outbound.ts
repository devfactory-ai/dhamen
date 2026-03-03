/**
 * Webhooks Outbound Routes
 *
 * Manage outbound webhook endpoints and deliveries
 */
import { Hono } from 'hono';
import { z } from 'zod';
import type { Bindings, Variables } from '../types';
import { requireAuth, requireRole } from '../middleware/auth';
import { WebhookOutboundService, type WebhookEvent } from '../services/webhook-outbound.service';

const webhooksOutbound = new Hono<{ Bindings: Bindings; Variables: Variables }>();

// All routes require authentication
webhooksOutbound.use('*', requireAuth);

// Schema for webhook endpoint
const webhookEndpointSchema = z.object({
  name: z.string().min(1).max(100),
  url: z.string().url(),
  secret: z.string().min(16),
  events: z.array(z.string()).min(1),
  insurerId: z.string().optional(),
  providerId: z.string().optional(),
  isActive: z.boolean().default(true),
  retryPolicy: z
    .object({
      maxRetries: z.number().min(0).max(10).default(5),
      initialDelay: z.number().min(100).max(60000).default(1000),
      maxDelay: z.number().min(1000).max(86400000).default(3600000),
      backoffMultiplier: z.number().min(1).max(10).default(2),
    })
    .optional(),
  headers: z.record(z.string()).optional(),
});

/**
 * GET /webhooks-outbound/endpoints
 * List webhook endpoints
 */
webhooksOutbound.get(
  '/endpoints',
  requireRole('ADMIN', 'INSURER_ADMIN'),
  async (c) => {
    const insurerId = c.req.query('insurerId');
    const providerId = c.req.query('providerId');
    const isActive = c.req.query('isActive');

    const user = c.get('user');
    const effectiveInsurerId =
      user.role === 'ADMIN' ? insurerId : user.insurerId;

    const webhookService = new WebhookOutboundService(c.env);

    const endpoints = await webhookService.listEndpoints({
      insurerId: effectiveInsurerId,
      providerId,
      isActive: isActive !== undefined ? isActive === 'true' : undefined,
    });

    return c.json({
      success: true,
      data: endpoints,
    });
  }
);

/**
 * POST /webhooks-outbound/endpoints
 * Create a webhook endpoint
 */
webhooksOutbound.post(
  '/endpoints',
  requireRole('ADMIN', 'INSURER_ADMIN'),
  async (c) => {
    const body = await c.req.json();
    const validation = webhookEndpointSchema.safeParse(body);

    if (!validation.success) {
      return c.json(
        {
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid endpoint data',
            details: validation.error.errors,
          },
        },
        400
      );
    }

    const user = c.get('user');

    // Non-admin users can only create endpoints for their insurer
    if (user.role !== 'ADMIN' && validation.data.insurerId !== user.insurerId) {
      return c.json(
        {
          success: false,
          error: { code: 'FORBIDDEN', message: 'Cannot create endpoint for another insurer' },
        },
        403
      );
    }

    const webhookService = new WebhookOutboundService(c.env);

    const endpoint = await webhookService.createEndpoint({
      ...validation.data,
      events: validation.data.events as WebhookEvent[],
    });

    return c.json({
      success: true,
      data: endpoint,
    }, 201);
  }
);

/**
 * GET /webhooks-outbound/endpoints/:id
 * Get webhook endpoint details
 */
webhooksOutbound.get(
  '/endpoints/:id',
  requireRole('ADMIN', 'INSURER_ADMIN'),
  async (c) => {
    const id = c.req.param('id');

    const webhookService = new WebhookOutboundService(c.env);
    const endpoint = await webhookService.getEndpoint(id);

    if (!endpoint) {
      return c.json(
        {
          success: false,
          error: { code: 'NOT_FOUND', message: 'Endpoint non trouvé' },
        },
        404
      );
    }

    return c.json({
      success: true,
      data: endpoint,
    });
  }
);

/**
 * PUT /webhooks-outbound/endpoints/:id
 * Update webhook endpoint
 */
webhooksOutbound.put(
  '/endpoints/:id',
  requireRole('ADMIN', 'INSURER_ADMIN'),
  async (c) => {
    const id = c.req.param('id');
    const body = await c.req.json();

    const webhookService = new WebhookOutboundService(c.env);

    const updated = await webhookService.updateEndpoint(id, {
      ...body,
      events: body.events as WebhookEvent[],
    });

    if (!updated) {
      return c.json(
        {
          success: false,
          error: { code: 'NOT_FOUND', message: 'Endpoint non trouvé' },
        },
        404
      );
    }

    return c.json({
      success: true,
      data: updated,
    });
  }
);

/**
 * DELETE /webhooks-outbound/endpoints/:id
 * Delete webhook endpoint
 */
webhooksOutbound.delete(
  '/endpoints/:id',
  requireRole('ADMIN', 'INSURER_ADMIN'),
  async (c) => {
    const id = c.req.param('id');

    const webhookService = new WebhookOutboundService(c.env);
    const deleted = await webhookService.deleteEndpoint(id);

    if (!deleted) {
      return c.json(
        {
          success: false,
          error: { code: 'NOT_FOUND', message: 'Endpoint non trouvé' },
        },
        404
      );
    }

    return c.json({
      success: true,
      data: { deleted: true },
    });
  }
);

/**
 * POST /webhooks-outbound/endpoints/:id/test
 * Test webhook endpoint
 */
webhooksOutbound.post(
  '/endpoints/:id/test',
  requireRole('ADMIN', 'INSURER_ADMIN'),
  async (c) => {
    const id = c.req.param('id');

    const webhookService = new WebhookOutboundService(c.env);
    const result = await webhookService.testEndpoint(id);

    return c.json({
      success: result.success,
      data: result,
    });
  }
);

/**
 * GET /webhooks-outbound/deliveries
 * List webhook deliveries
 */
webhooksOutbound.get(
  '/deliveries',
  requireRole('ADMIN', 'INSURER_ADMIN'),
  async (c) => {
    const endpointId = c.req.query('endpointId');
    const event = c.req.query('event') as WebhookEvent | undefined;
    const status = c.req.query('status') as 'pending' | 'success' | 'failed' | 'retrying' | undefined;
    const limit = Math.min(parseInt(c.req.query('limit') || '50', 10), 100);
    const offset = parseInt(c.req.query('offset') || '0', 10);

    const webhookService = new WebhookOutboundService(c.env);

    const result = await webhookService.listDeliveries({
      endpointId,
      event,
      status,
      limit,
      offset,
    });

    return c.json({
      success: true,
      data: result.deliveries,
      meta: {
        total: result.total,
        limit,
        offset,
      },
    });
  }
);

/**
 * GET /webhooks-outbound/deliveries/:id
 * Get delivery details
 */
webhooksOutbound.get(
  '/deliveries/:id',
  requireRole('ADMIN', 'INSURER_ADMIN'),
  async (c) => {
    const id = c.req.param('id');

    const webhookService = new WebhookOutboundService(c.env);
    const delivery = await webhookService.getDelivery(id);

    if (!delivery) {
      return c.json(
        {
          success: false,
          error: { code: 'NOT_FOUND', message: 'Delivery non trouvée' },
        },
        404
      );
    }

    return c.json({
      success: true,
      data: delivery,
    });
  }
);

/**
 * POST /webhooks-outbound/deliveries/:id/retry
 * Retry a failed delivery
 */
webhooksOutbound.post(
  '/deliveries/:id/retry',
  requireRole('ADMIN', 'INSURER_ADMIN'),
  async (c) => {
    const id = c.req.param('id');

    const webhookService = new WebhookOutboundService(c.env);
    const success = await webhookService.processDelivery(id);

    return c.json({
      success: true,
      data: { retried: success },
    });
  }
);

/**
 * GET /webhooks-outbound/stats
 * Get webhook statistics
 */
webhooksOutbound.get(
  '/stats',
  requireRole('ADMIN', 'INSURER_ADMIN'),
  async (c) => {
    const endpointId = c.req.query('endpointId');

    const webhookService = new WebhookOutboundService(c.env);
    const stats = await webhookService.getStats(endpointId);

    return c.json({
      success: true,
      data: stats,
    });
  }
);

/**
 * POST /webhooks-outbound/trigger
 * Manually trigger a webhook (for testing)
 */
webhooksOutbound.post(
  '/trigger',
  requireRole('ADMIN'),
  async (c) => {
    const body = await c.req.json<{
      event: WebhookEvent;
      data: Record<string, unknown>;
      insurerId?: string;
      providerId?: string;
    }>();

    if (!body.event || !body.data) {
      return c.json(
        {
          success: false,
          error: { code: 'INVALID_REQUEST', message: 'event et data sont requis' },
        },
        400
      );
    }

    const webhookService = new WebhookOutboundService(c.env);

    const deliveryIds = await webhookService.trigger(body.event, body.data, {
      insurerId: body.insurerId,
      providerId: body.providerId,
    });

    return c.json({
      success: true,
      data: {
        triggered: deliveryIds.length,
        deliveryIds,
      },
    });
  }
);

/**
 * GET /webhooks-outbound/events
 * List available webhook events
 */
webhooksOutbound.get('/events', (c) => {
  const events = [
    { code: 'claim.created', category: 'claims', label: 'Demande créée' },
    { code: 'claim.submitted', category: 'claims', label: 'Demande soumise' },
    { code: 'claim.approved', category: 'claims', label: 'Demande approuvée' },
    { code: 'claim.rejected', category: 'claims', label: 'Demande rejetée' },
    { code: 'claim.updated', category: 'claims', label: 'Demande mise à jour' },
    { code: 'claim.cancelled', category: 'claims', label: 'Demande annulée' },
    { code: 'eligibility.checked', category: 'eligibility', label: 'Éligibilité vérifiée' },
    { code: 'eligibility.expired', category: 'eligibility', label: 'Éligibilité expirée' },
    { code: 'bordereau.created', category: 'bordereaux', label: 'Bordereau créé' },
    { code: 'bordereau.validated', category: 'bordereaux', label: 'Bordereau validé' },
    { code: 'bordereau.sent', category: 'bordereaux', label: 'Bordereau envoyé' },
    { code: 'bordereau.paid', category: 'bordereaux', label: 'Bordereau payé' },
    { code: 'payment.initiated', category: 'payments', label: 'Paiement initié' },
    { code: 'payment.completed', category: 'payments', label: 'Paiement effectué' },
    { code: 'payment.failed', category: 'payments', label: 'Paiement échoué' },
    { code: 'fraud.alert', category: 'fraud', label: 'Alerte fraude' },
    { code: 'fraud.confirmed', category: 'fraud', label: 'Fraude confirmée' },
    { code: 'adherent.created', category: 'adherents', label: 'Adhérent créé' },
    { code: 'adherent.updated', category: 'adherents', label: 'Adhérent mis à jour' },
    { code: 'adherent.deactivated', category: 'adherents', label: 'Adhérent désactivé' },
    { code: 'contract.created', category: 'contracts', label: 'Contrat créé' },
    { code: 'contract.renewed', category: 'contracts', label: 'Contrat renouvelé' },
    { code: 'contract.terminated', category: 'contracts', label: 'Contrat résilié' },
  ];

  return c.json({
    success: true,
    data: events,
  });
});

export default webhooksOutbound;
