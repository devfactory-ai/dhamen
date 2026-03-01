/**
 * Compliance & GDPR Routes
 *
 * Data protection, audit logs, and compliance management
 */
import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import type { Bindings, Variables } from '../types';
import { getDb } from '../lib/db';
import { authMiddleware, requireRole } from '../middleware/auth';
import { generatePrefixedId } from '../lib/ulid';
import { logAudit } from '../middleware/audit-trail';

const compliance = new Hono<{ Bindings: Bindings; Variables: Variables }>();

// All routes require authentication
compliance.use('*', authMiddleware());

// =============================================================================
// Schemas
// =============================================================================

const dataAccessRequestSchema = z.object({
  type: z.enum(['access', 'rectification', 'deletion', 'portability', 'restriction']),
  subjectId: z.string().min(1),
  subjectType: z.enum(['adherent', 'user', 'provider']),
  reason: z.string().min(10),
  contactEmail: z.string().email(),
});

const consentSchema = z.object({
  subjectId: z.string().min(1),
  purpose: z.enum(['marketing', 'analytics', 'data_sharing', 'automated_decisions']),
  granted: z.boolean(),
});

const auditQuerySchema = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(50),
  entityType: z.string().optional(),
  action: z.string().optional(),
  userId: z.string().optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
});

// =============================================================================
// Types
// =============================================================================

interface DataAccessRequest {
  id: string;
  type: string;
  subjectId: string;
  subjectType: string;
  reason: string;
  contactEmail: string;
  status: 'pending' | 'in_progress' | 'completed' | 'rejected';
  requestedBy: string;
  requestedAt: string;
  processedBy?: string;
  processedAt?: string;
  notes?: string;
}

interface ConsentRecord {
  id: string;
  subjectId: string;
  purpose: string;
  granted: boolean;
  timestamp: string;
  ipAddress?: string;
  userAgent?: string;
}

// =============================================================================
// Routes
// =============================================================================

/**
 * GET /compliance/audit-logs
 * Get audit logs with filtering
 */
compliance.get(
  '/audit-logs',
  requireRole('ADMIN', 'COMPLIANCE_OFFICER'),
  zValidator('query', auditQuerySchema),
  async (c) => {
    const { page, limit, entityType, action, userId, dateFrom, dateTo } = c.req.valid('query');
    const offset = (page - 1) * limit;

    const conditions: string[] = [];
    const params: unknown[] = [];

    if (entityType) {
      conditions.push('entity_type = ?');
      params.push(entityType);
    }
    if (action) {
      conditions.push('action LIKE ?');
      params.push(`%${action}%`);
    }
    if (userId) {
      conditions.push('user_id = ?');
      params.push(userId);
    }
    if (dateFrom) {
      conditions.push('created_at >= ?');
      params.push(dateFrom);
    }
    if (dateTo) {
      conditions.push('created_at <= ?');
      params.push(dateTo + 'T23:59:59');
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countResult = await getDb(c).prepare(`SELECT COUNT(*) as count FROM audit_logs ${whereClause}`)
      .bind(...params)
      .first<{ count: number }>();

    const { results } = await getDb(c).prepare(
      `SELECT * FROM audit_logs ${whereClause} ORDER BY created_at DESC LIMIT ? OFFSET ?`
    )
      .bind(...params, limit, offset)
      .all();

    return c.json({
      success: true,
      data: {
        logs: results,
        meta: {
          page,
          limit,
          total: countResult?.count || 0,
        },
      },
    });
  }
);

/**
 * GET /compliance/audit-logs/:id
 * Get single audit log entry
 */
compliance.get('/audit-logs/:id', requireRole('ADMIN', 'COMPLIANCE_OFFICER'), async (c) => {
  const logId = c.req.param('id');

  const log = await getDb(c).prepare('SELECT * FROM audit_logs WHERE id = ?').bind(logId).first();

  if (!log) {
    return c.json({ success: false, error: { code: 'NOT_FOUND', message: 'Log non trouvé' } }, 404);
  }

  return c.json({ success: true, data: log });
});

/**
 * POST /compliance/data-requests
 * Create a data access request (GDPR Article 15-22)
 */
compliance.post(
  '/data-requests',
  requireRole('ADMIN', 'COMPLIANCE_OFFICER', 'INSURER_ADMIN'),
  zValidator('json', dataAccessRequestSchema),
  async (c) => {
    const data = c.req.valid('json');
    const user = c.get('user');
    const now = new Date().toISOString();

    const requestId = generatePrefixedId('DAR');

    const request: DataAccessRequest = {
      id: requestId,
      ...data,
      status: 'pending',
      requestedBy: user.sub,
      requestedAt: now,
    };

    // In production, save to D1
    // await getDb(c).prepare(`INSERT INTO data_access_requests ...`).run();

    await logAudit(getDb(c), {
      userId: user.sub,
      action: 'compliance.data_request.create',
      entityType: 'data_access_requests',
      entityId: requestId,
      changes: { type: data.type, subjectType: data.subjectType },
    });

    return c.json({ success: true, data: request }, 201);
  }
);

/**
 * GET /compliance/data-requests
 * List data access requests
 */
compliance.get('/data-requests', requireRole('ADMIN', 'COMPLIANCE_OFFICER'), async (c) => {
  const page = parseInt(c.req.query('page') || '1');
  const limit = Math.min(parseInt(c.req.query('limit') || '20'), 100);
  const status = c.req.query('status');

  // Mock data
  const requests: DataAccessRequest[] = [
    {
      id: 'DAR-001',
      type: 'access',
      subjectId: 'ADH-001',
      subjectType: 'adherent',
      reason: 'Demande de copie des données personnelles',
      contactEmail: 'adherent@email.com',
      status: 'pending',
      requestedBy: 'USR-001',
      requestedAt: '2025-02-26T10:00:00Z',
    },
    {
      id: 'DAR-002',
      type: 'deletion',
      subjectId: 'ADH-002',
      subjectType: 'adherent',
      reason: 'Demande de suppression après fin de contrat',
      contactEmail: 'autre@email.com',
      status: 'completed',
      requestedBy: 'USR-001',
      requestedAt: '2025-02-20T14:00:00Z',
      processedBy: 'ADMIN-001',
      processedAt: '2025-02-22T09:00:00Z',
    },
  ];

  const filtered = status ? requests.filter((r) => r.status === status) : requests;

  return c.json({
    success: true,
    data: {
      requests: filtered,
      meta: { page, limit, total: filtered.length },
    },
  });
});

/**
 * PATCH /compliance/data-requests/:id
 * Update data access request status
 */
compliance.patch(
  '/data-requests/:id',
  requireRole('ADMIN', 'COMPLIANCE_OFFICER'),
  zValidator(
    'json',
    z.object({
      status: z.enum(['in_progress', 'completed', 'rejected']),
      notes: z.string().optional(),
    })
  ),
  async (c) => {
    const requestId = c.req.param('id');
    const { status, notes } = c.req.valid('json');
    const user = c.get('user');
    const now = new Date().toISOString();

    // In production, update D1
    await logAudit(getDb(c), {
      userId: user.sub,
      action: 'compliance.data_request.update',
      entityType: 'data_access_requests',
      entityId: requestId,
      changes: { status, notes },
    });

    return c.json({
      success: true,
      data: {
        id: requestId,
        status,
        processedBy: user.sub,
        processedAt: now,
        notes,
      },
    });
  }
);

/**
 * POST /compliance/consents
 * Record consent
 */
compliance.post('/consents', zValidator('json', consentSchema), async (c) => {
  const data = c.req.valid('json');
  const user = c.get('user');
  const now = new Date().toISOString();

  const consentId = generatePrefixedId('CNS');

  const consent: ConsentRecord = {
    id: consentId,
    subjectId: data.subjectId,
    purpose: data.purpose,
    granted: data.granted,
    timestamp: now,
    ipAddress: c.req.header('CF-Connecting-IP') || c.req.header('X-Forwarded-For'),
    userAgent: c.req.header('User-Agent'),
  };

  // In production, save to D1
  await logAudit(getDb(c), {
    userId: user.sub,
    action: data.granted ? 'compliance.consent.grant' : 'compliance.consent.revoke',
    entityType: 'consents',
    entityId: consentId,
    changes: { purpose: data.purpose, granted: data.granted },
  });

  return c.json({ success: true, data: consent }, 201);
});

/**
 * GET /compliance/consents/:subjectId
 * Get consent history for a subject
 */
compliance.get('/consents/:subjectId', async (c) => {
  const subjectId = c.req.param('subjectId');

  // Mock consent history
  const consents: ConsentRecord[] = [
    {
      id: 'CNS-001',
      subjectId,
      purpose: 'marketing',
      granted: false,
      timestamp: '2025-02-15T10:00:00Z',
    },
    {
      id: 'CNS-002',
      subjectId,
      purpose: 'analytics',
      granted: true,
      timestamp: '2025-02-10T14:30:00Z',
    },
  ];

  return c.json({ success: true, data: consents });
});

/**
 * GET /compliance/data-export/:subjectId
 * Export all data for a subject (GDPR portability)
 */
compliance.get(
  '/data-export/:subjectId',
  requireRole('ADMIN', 'COMPLIANCE_OFFICER'),
  async (c) => {
    const subjectId = c.req.param('subjectId');
    const user = c.get('user');

    // Fetch all data for the subject
    const adherent = await getDb(c).prepare('SELECT * FROM adherents WHERE id = ?')
      .bind(subjectId)
      .first();

    if (!adherent) {
      return c.json({ success: false, error: { code: 'NOT_FOUND', message: 'Sujet non trouvé' } }, 404);
    }

    // Fetch related data
    const { results: demandes } = await getDb(c).prepare(
      'SELECT * FROM sante_demandes WHERE adherent_id = ?'
    )
      .bind(subjectId)
      .all();

    const { results: auditLogs } = await getDb(c).prepare(
      "SELECT * FROM audit_logs WHERE entity_id = ? OR (changes LIKE ? AND entity_type = 'adherents')"
    )
      .bind(subjectId, `%${subjectId}%`)
      .all();

    const exportData = {
      exportedAt: new Date().toISOString(),
      exportedBy: user.sub,
      subject: {
        id: subjectId,
        type: 'adherent',
      },
      personalData: adherent,
      healthData: {
        demandes,
      },
      auditTrail: auditLogs,
      consents: [], // Would fetch from consents table
    };

    await logAudit(getDb(c), {
      userId: user.sub,
      action: 'compliance.data_export',
      entityType: 'adherents',
      entityId: subjectId,
      changes: { exportedAt: exportData.exportedAt },
    });

    return c.json({ success: true, data: exportData });
  }
);

/**
 * DELETE /compliance/data/:subjectId
 * Delete all data for a subject (GDPR right to be forgotten)
 */
compliance.delete(
  '/data/:subjectId',
  requireRole('ADMIN', 'COMPLIANCE_OFFICER'),
  async (c) => {
    const subjectId = c.req.param('subjectId');
    const user = c.get('user');
    const confirm = c.req.query('confirm');

    if (confirm !== 'true') {
      return c.json(
        {
          success: false,
          error: {
            code: 'CONFIRMATION_REQUIRED',
            message: 'Ajoutez ?confirm=true pour confirmer la suppression',
          },
        },
        400
      );
    }

    // In production, implement actual deletion with:
    // 1. Anonymize instead of delete for legal retention
    // 2. Keep audit trail
    // 3. Notify related services

    await logAudit(getDb(c), {
      userId: user.sub,
      action: 'compliance.data_deletion',
      entityType: 'adherents',
      entityId: subjectId,
      changes: { deletedAt: new Date().toISOString(), deletedBy: user.sub },
    });

    return c.json({
      success: true,
      message: 'Données supprimées avec succès',
      data: {
        subjectId,
        deletedAt: new Date().toISOString(),
      },
    });
  }
);

/**
 * GET /compliance/stats
 * Get compliance statistics
 */
compliance.get('/stats', requireRole('ADMIN', 'COMPLIANCE_OFFICER'), async (c) => {
  // Mock stats
  const stats = {
    dataRequests: {
      total: 45,
      pending: 5,
      inProgress: 3,
      completed: 35,
      rejected: 2,
      averageProcessingDays: 2.5,
    },
    consents: {
      marketing: { granted: 1250, revoked: 450 },
      analytics: { granted: 2800, revoked: 120 },
      dataSharing: { granted: 980, revoked: 220 },
    },
    auditLogs: {
      totalThisMonth: 15420,
      byAction: {
        create: 4520,
        update: 8240,
        delete: 1280,
        export: 380,
        login: 1000,
      },
    },
    dataRetention: {
      adherentsActive: 15420,
      adherentsArchived: 2340,
      adherentsPendingDeletion: 12,
    },
  };

  return c.json({ success: true, data: stats });
});

/**
 * GET /compliance/retention-policies
 * Get data retention policies
 */
compliance.get('/retention-policies', async (c) => {
  const policies = [
    {
      id: 'POL-001',
      dataType: 'adherent_personal',
      description: 'Données personnelles des adhérents',
      retentionPeriod: '5 ans après fin de contrat',
      legalBasis: 'Obligation légale (Code des assurances)',
      deletionMethod: 'Anonymisation',
    },
    {
      id: 'POL-002',
      dataType: 'health_claims',
      description: 'Demandes de soins et remboursements',
      retentionPeriod: '10 ans',
      legalBasis: 'Obligation légale (Prescription médicale)',
      deletionMethod: 'Archivage puis suppression',
    },
    {
      id: 'POL-003',
      dataType: 'audit_logs',
      description: 'Journaux d\'audit',
      retentionPeriod: '5 ans',
      legalBasis: 'Obligation légale (Traçabilité)',
      deletionMethod: 'Suppression définitive',
    },
    {
      id: 'POL-004',
      dataType: 'marketing_consents',
      description: 'Consentements marketing',
      retentionPeriod: '3 ans après dernier consentement',
      legalBasis: 'RGPD Article 7',
      deletionMethod: 'Suppression définitive',
    },
  ];

  return c.json({ success: true, data: policies });
});

export { compliance };
