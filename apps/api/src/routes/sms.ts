/**
 * SMS Routes
 *
 * API endpoints for SMS management:
 * - Send SMS (single and bulk)
 * - OTP generation and verification
 * - Template management
 * - Statistics and logs
 */
import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import type { Bindings, Variables } from '../types';
import { getDb } from '../lib/db';
import { authMiddleware, requireRole } from '../middleware/auth';
import { SmsService } from '../services/sms.service';
import { logAudit } from '../middleware/audit-trail';
import { success, created, badRequest, notFound } from '../lib/response';

const sms = new Hono<{ Bindings: Bindings; Variables: Variables }>();

// All routes require authentication
sms.use('*', authMiddleware());

// =============================================================================
// Schemas
// =============================================================================

const sendSmsSchema = z.object({
  to: z.string().min(8, 'Numero de telephone invalide'),
  body: z.string().min(1).max(640, 'Message trop long (max 640 caracteres)'),
  sender: z.string().max(11).optional(),
  templateCode: z.string().optional(),
  variables: z.record(z.string()).optional(),
  priority: z.enum(['low', 'normal', 'high', 'urgent']).default('normal'),
  metadata: z.record(z.unknown()).optional(),
});

const sendBulkSmsSchema = z.object({
  recipients: z.array(
    z.object({
      to: z.string().min(8),
      variables: z.record(z.string()).optional(),
    })
  ).min(1).max(1000),
  body: z.string().optional(),
  templateCode: z.string().optional(),
  sender: z.string().max(11).optional(),
  priority: z.enum(['low', 'normal', 'high', 'urgent']).default('normal'),
});

const sendOtpSchema = z.object({
  to: z.string().min(8),
  purpose: z.enum(['login', 'reset', 'verify']).default('login'),
});

const verifyOtpSchema = z.object({
  to: z.string().min(8),
  otp: z.string().length(6),
  purpose: z.enum(['login', 'reset', 'verify']).default('login'),
});

const listMessagesSchema = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(20),
  phone: z.string().optional(),
  status: z.enum(['pending', 'queued', 'sent', 'delivered', 'failed', 'rejected', 'expired']).optional(),
  templateCode: z.string().optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
});

const templateSchema = z.object({
  code: z.string().min(1).max(50).regex(/^[A-Z_]+$/),
  name: z.string().min(1).max(100),
  description: z.string().optional(),
  bodyTemplate: z.string().min(1).max(640),
  variables: z.array(z.string()),
  maxLength: z.number().min(1).max(640).default(160),
  category: z.enum(['otp', 'notification', 'marketing', 'alert']).default('notification'),
});

// =============================================================================
// Send SMS Routes
// =============================================================================

/**
 * POST /api/v1/sms/send
 * Send a single SMS
 */
sms.post('/send', requireRole('ADMIN', 'SOIN_GESTIONNAIRE'), zValidator('json', sendSmsSchema), async (c) => {
  const body = c.req.valid('json');
  const user = c.get('user');

  const smsService = new SmsService(c.env);

  const message = await smsService.send(body);

  await logAudit(getDb(c), {
    userId: user.sub,
    action: 'sms.send',
    entityType: 'sms_messages',
    entityId: message.id,
    changes: { to: body.to, templateCode: body.templateCode },
  });

  return created(c, message);
});

/**
 * POST /api/v1/sms/send-bulk
 * Send bulk SMS
 */
sms.post('/send-bulk', requireRole('ADMIN', 'SOIN_GESTIONNAIRE'), zValidator('json', sendBulkSmsSchema), async (c) => {
  const body = c.req.valid('json');
  const user = c.get('user');

  const smsService = new SmsService(c.env);

  const results = {
    total: body.recipients.length,
    sent: 0,
    failed: 0,
    messages: [] as Array<{ to: string; messageId?: string; status: string; error?: string }>,
  };

  for (const recipient of body.recipients) {
    try {
      const message = await smsService.send({
        to: recipient.to,
        body: body.body || '',
        templateCode: body.templateCode,
        variables: recipient.variables,
        sender: body.sender,
        priority: body.priority,
      });

      results.sent++;
      results.messages.push({
        to: recipient.to,
        messageId: message.id,
        status: message.status,
      });
    } catch (error) {
      results.failed++;
      results.messages.push({
        to: recipient.to,
        status: 'failed',
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  await logAudit(getDb(c), {
    userId: user.sub,
    action: 'sms.send_bulk',
    entityType: 'sms_messages',
    entityId: 'bulk',
    changes: { total: results.total, sent: results.sent, failed: results.failed },
  });

  return success(c, results);
});

/**
 * POST /api/v1/sms/send-template
 * Send SMS using a template
 */
sms.post(
  '/send-template',
  requireRole('ADMIN', 'SOIN_GESTIONNAIRE', 'SOIN_AGENT'),
  zValidator(
    'json',
    z.object({
      templateCode: z.string(),
      to: z.string().min(8),
      variables: z.record(z.string()),
      priority: z.enum(['low', 'normal', 'high', 'urgent']).default('normal'),
    })
  ),
  async (c) => {
    const body = c.req.valid('json');
    const user = c.get('user');

    const smsService = new SmsService(c.env);
    const message = await smsService.sendFromTemplate(body.templateCode, body.to, body.variables, {
      priority: body.priority,
    });

    await logAudit(getDb(c), {
      userId: user.sub,
      action: 'sms.send_template',
      entityType: 'sms_messages',
      entityId: message.id,
      changes: { templateCode: body.templateCode, to: body.to },
    });

    return created(c, message);
  }
);

// =============================================================================
// OTP Routes
// =============================================================================

/**
 * POST /api/v1/sms/otp/send
 * Send OTP via SMS
 */
sms.post('/otp/send', zValidator('json', sendOtpSchema), async (c) => {
  const body = c.req.valid('json');

  const smsService = new SmsService(c.env);
  const result = await smsService.sendOTP(body.to, body.purpose);

  // Don't expose the OTP in the response
  return success(c, {
    messageId: result.message.id,
    status: result.message.status,
    expiresIn: 300, // 5 minutes
    message: 'OTP envoye avec succes',
  });
});

/**
 * POST /api/v1/sms/otp/verify
 * Verify OTP
 */
sms.post('/otp/verify', zValidator('json', verifyOtpSchema), async (c) => {
  const body = c.req.valid('json');

  const smsService = new SmsService(c.env);
  const isValid = await smsService.verifyOTP(body.to, body.otp, body.purpose);

  if (!isValid) {
    return badRequest(c, 'Code invalide ou expire');
  }

  return success(c, {
    valid: true,
    message: 'OTP verifie avec succes',
  });
});

// =============================================================================
// Message Management Routes
// =============================================================================

/**
 * GET /api/v1/sms/messages
 * List SMS messages with filtering
 */
sms.get(
  '/messages',
  requireRole('ADMIN', 'SOIN_GESTIONNAIRE'),
  zValidator('query', listMessagesSchema),
  async (c) => {
    const query = c.req.valid('query');
    const { page, limit, phone, status, templateCode, dateFrom, dateTo } = query;
    const offset = (page - 1) * limit;

    // Build query
    let sql = 'SELECT * FROM sms_messages WHERE 1=1';
    const params: unknown[] = [];

    if (phone) {
      sql += ' AND phone_to LIKE ?';
      params.push(`%${phone}%`);
    }
    if (status) {
      sql += ' AND status = ?';
      params.push(status);
    }
    if (templateCode) {
      sql += ' AND template_code = ?';
      params.push(templateCode);
    }
    if (dateFrom) {
      sql += ' AND created_at >= ?';
      params.push(dateFrom);
    }
    if (dateTo) {
      sql += ' AND created_at <= ?';
      params.push(dateTo + 'T23:59:59');
    }

    sql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    // Count total
    let countSql = 'SELECT COUNT(*) as total FROM sms_messages WHERE 1=1';
    const countParams: unknown[] = [];

    if (phone) {
      countSql += ' AND phone_to LIKE ?';
      countParams.push(`%${phone}%`);
    }
    if (status) {
      countSql += ' AND status = ?';
      countParams.push(status);
    }
    if (templateCode) {
      countSql += ' AND template_code = ?';
      countParams.push(templateCode);
    }
    if (dateFrom) {
      countSql += ' AND created_at >= ?';
      countParams.push(dateFrom);
    }
    if (dateTo) {
      countSql += ' AND created_at <= ?';
      countParams.push(dateTo + 'T23:59:59');
    }

    const [countResult, messages] = await Promise.all([
      getDb(c).prepare(countSql).bind(...countParams).first<{ total: number }>(),
      getDb(c).prepare(sql).bind(...params).all(),
    ]);

    return success(c, {
      messages: messages.results || [],
      meta: {
        page,
        limit,
        total: countResult?.total || 0,
      },
    });
  }
);

/**
 * GET /api/v1/sms/messages/:id
 * Get single SMS message
 */
sms.get('/messages/:id', requireRole('ADMIN', 'SOIN_GESTIONNAIRE'), async (c) => {
  const id = c.req.param('id');

  const smsService = new SmsService(c.env);
  const message = await smsService.getMessage(id);

  if (!message) {
    return notFound(c, 'Message non trouve');
  }

  // Get delivery logs
  const logs = await getDb(c).prepare(
    'SELECT * FROM sms_delivery_log WHERE message_id = ? ORDER BY created_at DESC'
  )
    .bind(id)
    .all();

  return success(c, {
    message,
    deliveryLogs: logs.results || [],
  });
});

// =============================================================================
// Template Routes
// =============================================================================

/**
 * GET /api/v1/sms/templates
 * List SMS templates
 */
sms.get('/templates', async (c) => {
  const category = c.req.query('category');

  let sql = 'SELECT * FROM sms_templates WHERE is_active = 1';
  const params: unknown[] = [];

  if (category) {
    sql += ' AND category = ?';
    params.push(category);
  }

  sql += ' ORDER BY name';

  const templates = await getDb(c).prepare(sql).bind(...params).all();

  // Also include hardcoded templates from service
  const smsService = new SmsService(c.env);
  const builtInTemplates = smsService.getTemplates();

  return success(c, {
    templates: templates.results || [],
    builtIn: builtInTemplates,
  });
});

/**
 * POST /api/v1/sms/templates
 * Create SMS template
 */
sms.post('/templates', requireRole('ADMIN'), zValidator('json', templateSchema), async (c) => {
  const body = c.req.valid('json');
  const user = c.get('user');

  const id = `tpl-${body.code.toLowerCase()}`;

  await getDb(c).prepare(
    `
    INSERT INTO sms_templates (id, code, name, description, body_template, variables, max_length, category)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `
  )
    .bind(
      id,
      body.code,
      body.name,
      body.description || null,
      body.bodyTemplate,
      JSON.stringify(body.variables),
      body.maxLength,
      body.category
    )
    .run();

  await logAudit(getDb(c), {
    userId: user.sub,
    action: 'sms.template.create',
    entityType: 'sms_templates',
    entityId: id,
    changes: body,
  });

  return created(c, { id, ...body });
});

/**
 * PUT /api/v1/sms/templates/:id
 * Update SMS template
 */
sms.put('/templates/:id', requireRole('ADMIN'), zValidator('json', templateSchema.partial()), async (c) => {
  const id = c.req.param('id');
  const body = c.req.valid('json');
  const user = c.get('user');

  const existing = await getDb(c).prepare('SELECT * FROM sms_templates WHERE id = ?').bind(id).first();

  if (!existing) {
    return notFound(c, 'Template non trouve');
  }

  await getDb(c).prepare(
    `
    UPDATE sms_templates SET
      name = COALESCE(?, name),
      description = COALESCE(?, description),
      body_template = COALESCE(?, body_template),
      variables = COALESCE(?, variables),
      max_length = COALESCE(?, max_length),
      category = COALESCE(?, category),
      updated_at = datetime('now')
    WHERE id = ?
  `
  )
    .bind(
      body.name || null,
      body.description || null,
      body.bodyTemplate || null,
      body.variables ? JSON.stringify(body.variables) : null,
      body.maxLength || null,
      body.category || null,
      id
    )
    .run();

  await logAudit(getDb(c), {
    userId: user.sub,
    action: 'sms.template.update',
    entityType: 'sms_templates',
    entityId: id,
    changes: body,
  });

  return success(c, { id, ...body });
});

/**
 * DELETE /api/v1/sms/templates/:id
 * Delete SMS template
 */
sms.delete('/templates/:id', requireRole('ADMIN'), async (c) => {
  const id = c.req.param('id');
  const user = c.get('user');

  await getDb(c).prepare('UPDATE sms_templates SET is_active = 0 WHERE id = ?').bind(id).run();

  await logAudit(getDb(c), {
    userId: user.sub,
    action: 'sms.template.delete',
    entityType: 'sms_templates',
    entityId: id,
  });

  return success(c, { message: 'Template supprime' });
});

// =============================================================================
// Statistics Routes
// =============================================================================

/**
 * GET /api/v1/sms/stats
 * Get SMS statistics
 */
sms.get('/stats', requireRole('ADMIN', 'SOIN_GESTIONNAIRE'), async (c) => {
  const period = (c.req.query('period') as 'day' | 'week' | 'month') || 'month';

  const smsService = new SmsService(c.env);
  const stats = await smsService.getStats(period);

  return success(c, stats);
});

/**
 * GET /api/v1/sms/stats/daily
 * Get daily SMS stats
 */
sms.get('/stats/daily', requireRole('ADMIN', 'SOIN_GESTIONNAIRE'), async (c) => {
  const days = parseInt(c.req.query('days') || '30');
  const since = new Date();
  since.setDate(since.getDate() - days);

  const stats = await getDb(c).prepare(
    `
    SELECT
      date(created_at) as date,
      COUNT(*) as total,
      SUM(CASE WHEN status IN ('sent', 'delivered') THEN 1 ELSE 0 END) as sent,
      SUM(CASE WHEN status = 'delivered' THEN 1 ELSE 0 END) as delivered,
      SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed,
      SUM(COALESCE(cost, 0)) as cost
    FROM sms_messages
    WHERE created_at >= ?
    GROUP BY date(created_at)
    ORDER BY date DESC
  `
  )
    .bind(since.toISOString())
    .all();

  return success(c, { stats: stats.results || [] });
});

/**
 * GET /api/v1/sms/providers
 * Get configured SMS providers
 */
sms.get('/providers', requireRole('ADMIN'), async (c) => {
  const providers = await getDb(c).prepare(
    'SELECT id, code, name, is_active, is_primary, priority, cost_per_sms, daily_limit, monthly_limit, current_daily_count, current_monthly_count FROM sms_providers ORDER BY priority'
  ).all();

  return success(c, { providers: providers.results || [] });
});

/**
 * PUT /api/v1/sms/providers/:id
 * Update SMS provider config
 */
sms.put(
  '/providers/:id',
  requireRole('ADMIN'),
  zValidator(
    'json',
    z.object({
      isActive: z.boolean().optional(),
      isPrimary: z.boolean().optional(),
      priority: z.number().min(0).optional(),
      costPerSms: z.number().min(0).optional(),
      dailyLimit: z.number().min(0).optional(),
      monthlyLimit: z.number().min(0).optional(),
    })
  ),
  async (c) => {
    const id = c.req.param('id');
    const body = c.req.valid('json');
    const user = c.get('user');

    // If setting as primary, unset others
    if (body.isPrimary) {
      await getDb(c).prepare('UPDATE sms_providers SET is_primary = 0').run();
    }

    await getDb(c).prepare(
      `
    UPDATE sms_providers SET
      is_active = COALESCE(?, is_active),
      is_primary = COALESCE(?, is_primary),
      priority = COALESCE(?, priority),
      cost_per_sms = COALESCE(?, cost_per_sms),
      daily_limit = COALESCE(?, daily_limit),
      monthly_limit = COALESCE(?, monthly_limit),
      updated_at = datetime('now')
    WHERE id = ?
  `
    )
      .bind(
        body.isActive !== undefined ? (body.isActive ? 1 : 0) : null,
        body.isPrimary !== undefined ? (body.isPrimary ? 1 : 0) : null,
        body.priority || null,
        body.costPerSms || null,
        body.dailyLimit || null,
        body.monthlyLimit || null,
        id
      )
      .run();

    await logAudit(getDb(c), {
      userId: user.sub,
      action: 'sms.provider.update',
      entityType: 'sms_providers',
      entityId: id,
      changes: body,
    });

    return success(c, { message: 'Provider mis a jour' });
  }
);

export { sms };
