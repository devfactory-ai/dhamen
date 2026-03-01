/**
 * Audit Routes
 *
 * Provides audit log search, statistics, and compliance reporting
 */
import { Hono } from 'hono';
import type { Bindings, Variables } from '../types';
import { requireAuth, requireRole } from '../middleware/auth';
import {
  AuditService,
  type AuditAction,
  type EntityType,
} from '../services/audit.service';

const audit = new Hono<{ Bindings: Bindings; Variables: Variables }>();

// All audit routes require authentication and elevated permissions
audit.use('*', requireAuth);
audit.use('*', requireRole('ADMIN', 'INSURER_ADMIN', 'SOIN_GESTIONNAIRE'));

/**
 * GET /audit/logs
 * Search audit logs
 */
audit.get('/logs', async (c) => {
  const userId = c.req.query('userId');
  const action = c.req.query('action');
  const entityType = c.req.query('entityType');
  const entityId = c.req.query('entityId');
  const insurerId = c.req.query('insurerId');
  const providerId = c.req.query('providerId');
  const result = c.req.query('result') as 'success' | 'failure' | undefined;
  const startDate = c.req.query('startDate');
  const endDate = c.req.query('endDate');
  const ipAddress = c.req.query('ipAddress');
  const searchText = c.req.query('search');
  const limit = parseInt(c.req.query('limit') || '50', 10);
  const offset = parseInt(c.req.query('offset') || '0', 10);
  const sortBy = c.req.query('sortBy') as 'timestamp' | 'action' | 'userId' | 'entityType' | undefined;
  const sortOrder = c.req.query('sortOrder') as 'asc' | 'desc' | undefined;

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
audit.get('/entity/:entityType/:entityId', async (c) => {
  const entityType = c.req.param('entityType') as EntityType;
  const entityId = c.req.param('entityId');
  const limit = parseInt(c.req.query('limit') || '100', 10);

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
audit.get('/user/:userId/activity', async (c) => {
  const userId = c.req.param('userId');
  const days = parseInt(c.req.query('days') || '30', 10);
  const limit = parseInt(c.req.query('limit') || '100', 10);

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
audit.get('/stats', async (c) => {
  const insurerId = c.req.query('insurerId');
  const startDate = c.req.query('startDate');
  const endDate = c.req.query('endDate');

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
  async (c) => {
    const startDate = c.req.query('startDate');
    const endDate = c.req.query('endDate');
    const insurerId = c.req.query('insurerId');

    if (!startDate || !endDate) {
      return c.json(
        {
          success: false,
          error: {
            code: 'MISSING_DATES',
            message: 'startDate et endDate sont requis',
          },
        },
        400
      );
    }

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
  async (c) => {
    const format = (c.req.query('format') || 'json') as 'json' | 'csv';
    const userId = c.req.query('userId');
    const action = c.req.query('action');
    const entityType = c.req.query('entityType');
    const startDate = c.req.query('startDate');
    const endDate = c.req.query('endDate');
    const insurerId = c.req.query('insurerId');

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
  async (c) => {
    const body = await c.req.json<{ retentionDays?: number }>().catch(() => ({ retentionDays: undefined }));
    const retentionDays = body.retentionDays ?? 365;

    if (retentionDays < 90) {
      return c.json(
        {
          success: false,
          error: {
            code: 'INVALID_RETENTION',
            message: 'La période de rétention minimale est de 90 jours',
          },
        },
        400
      );
    }

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
