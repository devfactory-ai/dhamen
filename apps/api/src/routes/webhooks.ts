/**
 * Webhooks Routes
 *
 * Incoming webhooks from external services (payment providers, etc.)
 */
import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import type { Bindings, Variables } from '../types';
import { getDb } from '../lib/db';
import { logAudit } from '../middleware/audit-trail';
import { generateId } from '../lib/ulid';

const webhooks = new Hono<{ Bindings: Bindings; Variables: Variables }>();

// =============================================================================
// Schemas
// =============================================================================

const paymentWebhookSchema = z.object({
  event: z.enum(['payment.completed', 'payment.failed', 'payment.cancelled', 'payment.pending']),
  transactionId: z.string(),
  reference: z.string(),
  amount: z.number().optional(),
  currency: z.string().default('TND'),
  status: z.string(),
  timestamp: z.string(),
  metadata: z.record(z.unknown()).optional(),
});

const mobileMoneyWebhookSchema = z.object({
  provider: z.enum(['ooredoo', 'orange', 'telecom']),
  transactionId: z.string(),
  phoneNumber: z.string(),
  amount: z.number(),
  status: z.enum(['success', 'failed', 'pending', 'cancelled']),
  reference: z.string(),
  timestamp: z.string(),
  errorCode: z.string().optional(),
  errorMessage: z.string().optional(),
});

const bankTransferWebhookSchema = z.object({
  bankCode: z.string(),
  transactionId: z.string(),
  senderAccount: z.string().optional(),
  receiverAccount: z.string(),
  amount: z.number(),
  status: z.enum(['executed', 'rejected', 'pending']),
  reference: z.string(),
  executionDate: z.string().optional(),
  rejectionReason: z.string().optional(),
});

// =============================================================================
// Middleware - Webhook Signature Verification
// =============================================================================

async function verifyWebhookSignature(
  secret: string,
  payload: string,
  signature: string
): Promise<boolean> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const signatureBuffer = await crypto.subtle.sign('HMAC', key, encoder.encode(payload));
  const expectedSignature = Array.from(new Uint8Array(signatureBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

  return signature === expectedSignature;
}

// =============================================================================
// Routes
// =============================================================================

/**
 * POST /webhooks/payment
 * Generic payment webhook handler
 */
webhooks.post('/payment', zValidator('json', paymentWebhookSchema), async (c) => {
  const payload = c.req.valid('json');
  const signature = c.req.header('X-Webhook-Signature');

  // Verify signature in production
  if (c.env.WEBHOOK_SECRET && signature) {
    const rawBody = await c.req.text();
    const isValid = await verifyWebhookSignature(c.env.WEBHOOK_SECRET, rawBody, signature);
    if (!isValid) {
      return c.json({ success: false, error: 'Invalid signature' }, 401);
    }
  }

  const now = new Date().toISOString();

  // Find payment by reference
  const payment = await getDb(c).prepare(
    'SELECT id, demande_id, statut FROM sante_paiements WHERE reference_paiement = ? OR idempotency_key = ?'
  )
    .bind(payload.reference, payload.reference)
    .first<{ id: string; demande_id: string; statut: string }>();

  if (!payment) {
    // Log unknown webhook
    await logAudit(getDb(c), {
      userId: 'WEBHOOK',
      action: 'webhook.payment.unknown',
      entityType: 'webhooks',
      entityId: payload.transactionId,
      changes: payload,
    });

    return c.json({ success: true, message: 'Webhook received, payment not found' });
  }

  // Map webhook event to payment status
  const statusMap: Record<string, string> = {
    'payment.completed': 'execute',
    'payment.failed': 'echoue',
    'payment.cancelled': 'annule',
    'payment.pending': 'en_cours',
  };

  const newStatus = statusMap[payload.event] || 'en_cours';

  // Update payment status
  await getDb(c).prepare(`
    UPDATE sante_paiements
    SET statut = ?,
        reference_paiement = COALESCE(reference_paiement, ?),
        date_execution = CASE WHEN ? = 'execute' THEN ? ELSE date_execution END,
        motif_echec = CASE WHEN ? = 'echoue' THEN ? ELSE motif_echec END,
        updated_at = ?
    WHERE id = ?
  `)
    .bind(
      newStatus,
      payload.transactionId,
      newStatus,
      now,
      newStatus,
      payload.metadata?.errorMessage || null,
      now,
      payment.id
    )
    .run();

  // Update demande status if payment completed
  if (newStatus === 'execute') {
    await getDb(c).prepare('UPDATE sante_demandes SET statut = ?, updated_at = ? WHERE id = ?')
      .bind('payee', now, payment.demande_id)
      .run();
  }

  await logAudit(getDb(c), {
    userId: 'WEBHOOK',
    action: `webhook.payment.${payload.event}`,
    entityType: 'sante_paiements',
    entityId: payment.id,
    changes: { oldStatus: payment.statut, newStatus, transactionId: payload.transactionId },
  });

  return c.json({ success: true, paymentId: payment.id, newStatus });
});

/**
 * POST /webhooks/mobile-money/:provider
 * Mobile money webhook (Ooredoo, Orange, Telecom)
 */
webhooks.post('/mobile-money/:provider', zValidator('json', mobileMoneyWebhookSchema), async (c) => {
  const provider = c.req.param('provider');
  const payload = c.req.valid('json');
  const now = new Date().toISOString();

  // Find payment by reference
  const payment = await getDb(c).prepare(
    'SELECT id, demande_id, statut FROM sante_paiements WHERE reference_paiement = ?'
  )
    .bind(payload.reference)
    .first<{ id: string; demande_id: string; statut: string }>();

  if (!payment) {
    await logAudit(getDb(c), {
      userId: 'WEBHOOK',
      action: `webhook.mobile_money.${provider}.unknown`,
      entityType: 'webhooks',
      entityId: payload.transactionId,
      changes: payload,
    });

    return c.json({ success: true, message: 'Webhook received, payment not found' });
  }

  const statusMap: Record<string, string> = {
    success: 'execute',
    failed: 'echoue',
    pending: 'en_cours',
    cancelled: 'annule',
  };

  const newStatus = statusMap[payload.status] || 'en_cours';

  await getDb(c).prepare(`
    UPDATE sante_paiements
    SET statut = ?,
        date_execution = CASE WHEN ? = 'execute' THEN ? ELSE date_execution END,
        motif_echec = CASE WHEN ? = 'echoue' THEN ? ELSE motif_echec END,
        updated_at = ?
    WHERE id = ?
  `)
    .bind(newStatus, newStatus, now, newStatus, payload.errorMessage || null, now, payment.id)
    .run();

  if (newStatus === 'execute') {
    await getDb(c).prepare('UPDATE sante_demandes SET statut = ?, updated_at = ? WHERE id = ?')
      .bind('payee', now, payment.demande_id)
      .run();
  }

  await logAudit(getDb(c), {
    userId: 'WEBHOOK',
    action: `webhook.mobile_money.${provider}`,
    entityType: 'sante_paiements',
    entityId: payment.id,
    changes: { oldStatus: payment.statut, newStatus, provider },
  });

  return c.json({ success: true, paymentId: payment.id, newStatus });
});

/**
 * POST /webhooks/bank-transfer
 * Bank transfer webhook
 */
webhooks.post('/bank-transfer', zValidator('json', bankTransferWebhookSchema), async (c) => {
  const payload = c.req.valid('json');
  const now = new Date().toISOString();

  const payment = await getDb(c).prepare(
    'SELECT id, demande_id, statut FROM sante_paiements WHERE reference_paiement = ?'
  )
    .bind(payload.reference)
    .first<{ id: string; demande_id: string; statut: string }>();

  if (!payment) {
    await logAudit(getDb(c), {
      userId: 'WEBHOOK',
      action: 'webhook.bank_transfer.unknown',
      entityType: 'webhooks',
      entityId: payload.transactionId,
      changes: payload,
    });

    return c.json({ success: true, message: 'Webhook received, payment not found' });
  }

  const statusMap: Record<string, string> = {
    executed: 'execute',
    rejected: 'echoue',
    pending: 'en_cours',
  };

  const newStatus = statusMap[payload.status] || 'en_cours';

  await getDb(c).prepare(`
    UPDATE sante_paiements
    SET statut = ?,
        date_execution = CASE WHEN ? = 'execute' THEN ? ELSE date_execution END,
        motif_echec = CASE WHEN ? = 'echoue' THEN ? ELSE motif_echec END,
        updated_at = ?
    WHERE id = ?
  `)
    .bind(newStatus, newStatus, now, newStatus, payload.rejectionReason || null, now, payment.id)
    .run();

  if (newStatus === 'execute') {
    await getDb(c).prepare('UPDATE sante_demandes SET statut = ?, updated_at = ? WHERE id = ?')
      .bind('payee', now, payment.demande_id)
      .run();
  }

  await logAudit(getDb(c), {
    userId: 'WEBHOOK',
    action: 'webhook.bank_transfer',
    entityType: 'sante_paiements',
    entityId: payment.id,
    changes: { oldStatus: payment.statut, newStatus, bankCode: payload.bankCode },
  });

  return c.json({ success: true, paymentId: payment.id, newStatus });
});

/**
 * POST /webhooks/cnam
 * CNAM (Caisse Nationale d'Assurance Maladie) webhook
 */
webhooks.post('/cnam', async (c) => {
  const payload = await c.req.json();
  const now = new Date().toISOString();

  await logAudit(getDb(c), {
    userId: 'WEBHOOK',
    action: 'webhook.cnam.received',
    entityType: 'webhooks',
    entityId: generateId(),
    changes: payload,
  });

  // Process CNAM specific data
  // This would handle eligibility updates, coverage changes, etc.

  return c.json({ success: true, message: 'CNAM webhook received' });
});

/**
 * GET /webhooks/test
 * Test endpoint to verify webhook configuration
 */
webhooks.get('/test', (c) => {
  return c.json({
    success: true,
    message: 'Webhook endpoint is active',
    timestamp: new Date().toISOString(),
  });
});

export { webhooks };
