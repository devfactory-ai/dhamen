/**
 * Audit Routes
 *
 * Provides audit log search, statistics, and compliance reporting
 */
import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import type { Bindings, Variables } from '../types';
import { authMiddleware, requireAuth, requireRole } from '../middleware/auth';
import {
  AuditService,
  type AuditAction,
  type EntityType,
} from '../services/audit.service';

// Validation schemas
const auditLogsQuerySchema = z.object({
  userId: z.string().optional(),
  action: z.string().optional(),
  entityType: z.string().optional(),
  entityId: z.string().optional(),
  insurerId: z.string().optional(),
  providerId: z.string().optional(),
  result: z.enum(['success', 'failure']).optional(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  ipAddress: z.string().optional(),
  search: z.string().optional(),
  limit: z.coerce.number().min(1).max(100).default(50),
  offset: z.coerce.number().min(0).default(0),
  sortBy: z.enum(['timestamp', 'action', 'userId', 'entityType']).optional(),
  sortOrder: z.enum(['asc', 'desc']).optional(),
});

const entityTrailQuerySchema = z.object({
  limit: z.coerce.number().min(1).max(100).default(100),
});

const userActivityQuerySchema = z.object({
  days: z.coerce.number().min(1).max(365).default(30),
  limit: z.coerce.number().min(1).max(100).default(100),
});

const auditStatsQuerySchema = z.object({
  insurerId: z.string().optional(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

const complianceReportQuerySchema = z.object({
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  insurerId: z.string().optional(),
});

const auditExportQuerySchema = z.object({
  format: z.enum(['json', 'csv']).default('json'),
  userId: z.string().optional(),
  action: z.string().optional(),
  entityType: z.string().optional(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  insurerId: z.string().optional(),
});

const cleanupBodySchema = z.object({
  retentionDays: z.number().min(90).max(3650).optional().default(365),
});

const audit = new Hono<{ Bindings: Bindings; Variables: Variables }>();

// All audit routes require authentication and elevated permissions
audit.use('*', authMiddleware());
audit.use('*', requireAuth);
audit.use('*', requireRole('ADMIN', 'INSURER_ADMIN', 'SOIN_GESTIONNAIRE'));

/**
 * GET /audit/logs
 * Search audit logs
 */
audit.get('/logs', zValidator('query', auditLogsQuerySchema), async (c) => {
  const {
    userId,
    action,
    entityType,
    entityId,
    insurerId,
    providerId,
    result,
    startDate,
    endDate,
    ipAddress,
    search: searchText,
    limit,
    offset,
    sortBy,
    sortOrder,
  } = c.req.valid('query');

  const user = c.get('user');

  // Non-admin users can only see their insurer's audit logs
  const effectiveInsurerId =
    user.role === 'ADMIN' ? insurerId : user.insurerId;

  const auditService = new AuditService(c.env);

  const results = await auditService.search({
    userId,
    action: action ? (action.split(',') as AuditAction[]) : undefined,
    entityType: entityType ? (entityType.split(',') as EntityType[]) : undefined,
    entityId,
    insurerId: effectiveInsurerId,
    providerId,
    result,
    startDate,
    endDate,
    ipAddress,
    searchText,
    limit,
    offset,
    sortBy,
    sortOrder,
  });

  return c.json({
    success: true,
    data: results.entries,
    meta: {
      total: results.total,
      hasMore: results.hasMore,
      limit,
      offset,
    },
  });
});

/**
 * GET /audit/logs/:id
 * Get specific audit entry
 */
audit.get('/logs/:id', async (c) => {
  const id = c.req.param('id');

  const auditService = new AuditService(c.env);
  const entry = await auditService.getById(id);

  if (!entry) {
    return c.json(
      {
        success: false,
        error: { code: 'NOT_FOUND', message: 'Entrée d\'audit non trouvée' },
      },
      404
    );
  }

  return c.json({
    success: true,
    data: entry,
  });
});

/**
 * GET /audit/entity/:entityType/:entityId
 * Get audit trail for a specific entity
 */
audit.get('/entity/:entityType/:entityId', zValidator('query', entityTrailQuerySchema), async (c) => {
  const entityType = c.req.param('entityType') as EntityType;
  const entityId = c.req.param('entityId');
  const { limit } = c.req.valid('query');

  const auditService = new AuditService(c.env);
  const trail = await auditService.getEntityAuditTrail(entityType, entityId, limit);

  return c.json({
    success: true,
    data: trail,
  });
});

/**
 * GET /audit/user/:userId/activity
 * Get user activity log
 */
audit.get('/user/:userId/activity', zValidator('query', userActivityQuerySchema), async (c) => {
  const userId = c.req.param('userId');
  const { days, limit } = c.req.valid('query');

  const auditService = new AuditService(c.env);
  const activity = await auditService.getUserActivity(userId, days, limit);

  return c.json({
    success: true,
    data: activity,
  });
});

/**
 * GET /audit/stats
 * Get audit statistics
 */
audit.get('/stats', zValidator('query', auditStatsQuerySchema), async (c) => {
  const { insurerId, startDate, endDate } = c.req.valid('query');

  const user = c.get('user');
  const effectiveInsurerId =
    user.role === 'ADMIN' ? insurerId : user.insurerId;

  const auditService = new AuditService(c.env);
  const stats = await auditService.getStats(effectiveInsurerId, startDate, endDate);

  return c.json({
    success: true,
    data: stats,
  });
});

/**
 * GET /audit/compliance-report
 * Generate compliance report
 */
audit.get(
  '/compliance-report',
  requireRole('ADMIN', 'INSURER_ADMIN'),
  zValidator('query', complianceReportQuerySchema),
  async (c) => {
    const { startDate, endDate, insurerId } = c.req.valid('query');

    const user = c.get('user');
    const effectiveInsurerId =
      user.role === 'ADMIN' ? insurerId : user.insurerId;

    const auditService = new AuditService(c.env);
    const report = await auditService.generateComplianceReport(
      startDate,
      endDate,
      effectiveInsurerId
    );

    return c.json({
      success: true,
      data: report,
    });
  }
);

/**
 * GET /audit/export
 * Export audit logs
 */
audit.get(
  '/export',
  requireRole('ADMIN', 'INSURER_ADMIN'),
  zValidator('query', auditExportQuerySchema),
  async (c) => {
    const { format, userId, action, entityType, startDate, endDate, insurerId } = c.req.valid('query');

    const user = c.get('user');
    const effectiveInsurerId =
      user.role === 'ADMIN' ? insurerId : user.insurerId;

    const auditService = new AuditService(c.env);

    const result = await auditService.export(
      {
        userId,
        action: action ? (action.split(',') as AuditAction[]) : undefined,
        entityType: entityType ? (entityType.split(',') as EntityType[]) : undefined,
        insurerId: effectiveInsurerId,
        startDate,
        endDate,
      },
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
 * POST /audit/cleanup
 * Clean up old audit logs (admin only)
 */
audit.post(
  '/cleanup',
  requireRole('ADMIN'),
  zValidator('json', cleanupBodySchema),
  async (c) => {
    const { retentionDays } = c.req.valid('json');

    const auditService = new AuditService(c.env);
    const result = await auditService.cleanupOldLogs(retentionDays);

    // Log this cleanup action
    await auditService.log({
      userId: c.get('user').id,
      userName: c.get('user').email,
      userRole: c.get('user').role,
      action: 'SYSTEM_MAINTENANCE',
      entityType: 'system',
      entityId: 'audit_logs',
      details: { retentionDays, deletedCount: result.deleted },
      result: 'success',
    });

    return c.json({
      success: true,
      data: result,
    });
  }
);

/**
 * GET /audit/actions
 * Get list of audit action types
 */
audit.get('/actions', (c) => {
  const actions = [
    // Authentication
    { code: 'LOGIN', category: 'auth', label: 'Connexion' },
    { code: 'LOGOUT', category: 'auth', label: 'Déconnexion' },
    { code: 'LOGIN_FAILED', category: 'auth', label: 'Échec de connexion' },
    { code: 'PASSWORD_CHANGE', category: 'auth', label: 'Changement de mot de passe' },
    { code: 'MFA_ENABLE', category: 'auth', label: 'Activation MFA' },
    { code: 'MFA_DISABLE', category: 'auth', label: 'Désactivation MFA' },
    // CRUD
    { code: 'CREATE', category: 'data', label: 'Création' },
    { code: 'READ', category: 'data', label: 'Lecture' },
    { code: 'UPDATE', category: 'data', label: 'Modification' },
    { code: 'DELETE', category: 'data', label: 'Suppression' },
    // Business
    { code: 'CLAIM_SUBMIT', category: 'business', label: 'Soumission demande' },
    { code: 'CLAIM_APPROVE', category: 'business', label: 'Approbation demande' },
    { code: 'CLAIM_REJECT', category: 'business', label: 'Rejet demande' },
    { code: 'ELIGIBILITY_CHECK', category: 'business', label: 'Vérification éligibilité' },
    { code: 'FRAUD_FLAG', category: 'business', label: 'Signalement fraude' },
    { code: 'BORDEREAU_GENERATE', category: 'business', label: 'Génération bordereau' },
    // Documents
    { code: 'DOCUMENT_UPLOAD', category: 'document', label: 'Upload document' },
    { code: 'DOCUMENT_DOWNLOAD', category: 'document', label: 'Téléchargement document' },
    { code: 'DOCUMENT_DELETE', category: 'document', label: 'Suppression document' },
    // Admin
    { code: 'USER_CREATE', category: 'admin', label: 'Création utilisateur' },
    { code: 'USER_DELETE', category: 'admin', label: 'Suppression utilisateur' },
    { code: 'ROLE_ASSIGN', category: 'admin', label: 'Attribution rôle' },
    { code: 'CONFIG_CHANGE', category: 'admin', label: 'Modification configuration' },
  ];

  return c.json({
    success: true,
    data: actions,
  });
});

/**
 * GET /audit/entity-types
 * Get list of entity types
 */
audit.get('/entity-types', (c) => {
  const entityTypes = [
    { code: 'user', label: 'Utilisateur' },
    { code: 'adherent', label: 'Adhérent' },
    { code: 'provider', label: 'Prestataire' },
    { code: 'insurer', label: 'Assureur' },
    { code: 'contract', label: 'Contrat' },
    { code: 'claim', label: 'Demande' },
    { code: 'bordereau', label: 'Bordereau' },
    { code: 'payment', label: 'Paiement' },
    { code: 'document', label: 'Document' },
    { code: 'config', label: 'Configuration' },
    { code: 'session', label: 'Session' },
    { code: 'system', label: 'Système' },
  ];

  return c.json({
    success: true,
    data: entityTypes,
  });
});

export default audit;
