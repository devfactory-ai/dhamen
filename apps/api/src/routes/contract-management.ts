/**
 * Contract Management Routes
 *
 * Advanced contract management: templates, renewals, versioning
 */

import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { authMiddleware, requireRole } from '../middleware/auth';
import { success, error, paginated } from '../lib/response';
import { ContractManagementService } from '../services/contract-management.service';
import type { Bindings, Variables } from '../types';
import { getDb } from '../lib/db';

const contractManagement = new Hono<{ Bindings: Bindings; Variables: Variables }>();

// Apply auth middleware
contractManagement.use('*', authMiddleware());

// ============== TEMPLATES ==============

const templateSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500),
  type: z.enum(['individual', 'group', 'corporate']),
  category: z.enum(['basic', 'standard', 'premium', 'vip']),
  coverageRules: z.array(z.object({
    careType: z.string(),
    coveragePercent: z.number().min(0).max(100),
    maxAmount: z.number().optional(),
    copay: z.number().optional(),
    deductible: z.number().optional(),
    requiresApproval: z.boolean(),
    networkOnly: z.boolean(),
  })),
  exclusions: z.array(z.string()),
  waitingPeriods: z.array(z.object({
    careType: z.string(),
    days: z.number().min(0),
    waivable: z.boolean(),
  })),
  limits: z.object({
    annual: z.number(),
    perEvent: z.number(),
    perCareType: z.record(z.number()),
    lifetime: z.number().optional(),
  }),
  pricing: z.object({
    basePremium: z.number(),
    currency: z.string().default('TND'),
    frequency: z.enum(['monthly', 'quarterly', 'annually']),
    ageFactors: z.array(z.object({
      minAge: z.number(),
      maxAge: z.number(),
      factor: z.number(),
    })),
    familyDiscount: z.number(),
    groupDiscount: z.number(),
  }),
  documents: z.array(z.object({
    type: z.enum(['terms', 'coverage', 'exclusions', 'claim_form']),
    name: z.string(),
    url: z.string().url(),
  })).default([]),
  isActive: z.boolean().default(false),
});

/**
 * GET /templates
 * List contract templates
 */
contractManagement.get('/templates', async (c) => {
  const user = c.get('user');
  const { type, category, active, page, limit } = c.req.query();
  const service = new ContractManagementService(c.env);

  // Cap pagination limit to 100 items max
  const parsedPage = page ? parseInt(page, 10) : 1;
  const parsedLimit = Math.min(limit ? parseInt(limit, 10) : 20, 100);

  const result = await service.listTemplates({
    insurerId: user.insurerId,
    type,
    category,
    isActive: active ? active === 'true' : undefined,
    page: parsedPage,
    limit: parsedLimit,
  });

  return paginated(c, result.templates, {
    page: parsedPage,
    limit: parsedLimit,
    total: result.total,
  });
});

/**
 * POST /templates
 * Create new template
 */
contractManagement.post(
  '/templates',
  requireRole('ADMIN', 'INSURER_ADMIN'),
  zValidator('json', templateSchema),
  async (c) => {
    const user = c.get('user');
    const body = c.req.valid('json');
    const service = new ContractManagementService(c.env);

    const insurerId = user.insurerId || c.req.query('insurerId');
    if (!insurerId) {
      return error(c, 'BAD_REQUEST', 'Assureur requis', 400);
    }

    const template = await service.createTemplate({
      ...body,
      insurerId,
    });

    return success(c, template, 201);
  }
);

/**
 * GET /templates/:id
 * Get template details
 */
contractManagement.get('/templates/:id', async (c) => {
  const templateId = c.req.param('id');
  const service = new ContractManagementService(c.env);

  const template = await service.getTemplate(templateId);
  if (!template) {
    return error(c, 'NOT_FOUND', 'Template non trouvé', 404);
  }

  return success(c, template);
});

/**
 * PUT /templates/:id
 * Update template
 */
contractManagement.put(
  '/templates/:id',
  requireRole('ADMIN', 'INSURER_ADMIN'),
  zValidator('json', templateSchema.partial()),
  async (c) => {
    const user = c.get('user');
    const templateId = c.req.param('id');
    const body = c.req.valid('json');
    const reason = c.req.query('reason');
    const service = new ContractManagementService(c.env);

    try {
      const template = await service.updateTemplate(templateId, body, user.id, reason);
      return success(c, template);
    } catch (err) {
      return error(c, 'NOT_FOUND', 'Template non trouvé', 404);
    }
  }
);

/**
 * POST /templates/:id/clone
 * Clone a template
 */
contractManagement.post(
  '/templates/:id/clone',
  requireRole('ADMIN', 'INSURER_ADMIN'),
  zValidator('json', z.object({
    name: z.string().min(1).max(100),
    insurerId: z.string().optional(),
  })),
  async (c) => {
    const user = c.get('user');
    const templateId = c.req.param('id');
    const { name, insurerId } = c.req.valid('json');
    const service = new ContractManagementService(c.env);

    const targetInsurerId = insurerId || user.insurerId;
    if (!targetInsurerId) {
      return error(c, 'BAD_REQUEST', 'Assureur requis', 400);
    }

    try {
      const template = await service.cloneTemplate(templateId, name, targetInsurerId);
      return success(c, template, 201);
    } catch (err) {
      return error(c, 'NOT_FOUND', 'Template non trouvé', 404);
    }
  }
);

/**
 * POST /templates/:id/activate
 * Activate a template
 */
contractManagement.post(
  '/templates/:id/activate',
  requireRole('ADMIN', 'INSURER_ADMIN'),
  async (c) => {
    const user = c.get('user');
    const templateId = c.req.param('id');
    const service = new ContractManagementService(c.env);

    try {
      const template = await service.updateTemplate(
        templateId,
        { isActive: true },
        user.id,
        'Template activated'
      );
      return success(c, template);
    } catch (err) {
      return error(c, 'NOT_FOUND', 'Template non trouvé', 404);
    }
  }
);

/**
 * POST /templates/:id/deactivate
 * Deactivate a template
 */
contractManagement.post(
  '/templates/:id/deactivate',
  requireRole('ADMIN', 'INSURER_ADMIN'),
  async (c) => {
    const user = c.get('user');
    const templateId = c.req.param('id');
    const service = new ContractManagementService(c.env);

    try {
      const template = await service.updateTemplate(
        templateId,
        { isActive: false },
        user.id,
        'Template deactivated'
      );
      return success(c, template);
    } catch (err) {
      return error(c, 'NOT_FOUND', 'Template non trouvé', 404);
    }
  }
);

// ============== VERSIONING ==============

/**
 * GET /templates/:id/versions
 * Get template version history
 */
contractManagement.get('/templates/:id/versions', async (c) => {
  const templateId = c.req.param('id');
  const service = new ContractManagementService(c.env);

  const versions = await service.getVersionHistory(templateId);
  return success(c, versions);
});

/**
 * POST /templates/:id/restore/:version
 * Restore template to specific version
 */
contractManagement.post(
  '/templates/:id/restore/:version',
  requireRole('ADMIN', 'INSURER_ADMIN'),
  async (c) => {
    const user = c.get('user');
    const templateId = c.req.param('id');
    const version = parseInt(c.req.param('version'), 10);
    const service = new ContractManagementService(c.env);

    try {
      const template = await service.restoreVersion(templateId, version, user.id);
      return success(c, template);
    } catch (err) {
      return error(c, 'NOT_FOUND', 'Version non trouvée', 404);
    }
  }
);

// ============== RENEWALS ==============

const renewalConfigSchema = z.object({
  autoRenew: z.boolean(),
  renewalPeriodDays: z.number().min(30).max(730).default(365),
  notificationDays: z.array(z.number()).default([30, 15, 7]),
  priceAdjustment: z.enum(['fixed', 'indexed', 'manual']).default('fixed'),
  indexRate: z.number().min(0).max(20).optional(),
  maxIncreasePercent: z.number().min(0).max(50).optional(),
  requiresApproval: z.boolean().default(false),
  nextRenewalDate: z.string(),
});

/**
 * GET /renewals/due
 * Get contracts due for renewal
 */
contractManagement.get('/renewals/due', async (c) => {
  const user = c.get('user');
  const daysAhead = parseInt(c.req.query('days') || '30', 10);
  const service = new ContractManagementService(c.env);

  const contracts = await service.getContractsDueForRenewal({
    insurerId: user.insurerId,
    daysAhead,
  });

  return success(c, contracts);
});

/**
 * POST /contracts/:id/renewal-config
 * Configure renewal settings
 */
contractManagement.post(
  '/contracts/:id/renewal-config',
  requireRole('ADMIN', 'INSURER_ADMIN', 'INSURER_AGENT'),
  zValidator('json', renewalConfigSchema),
  async (c) => {
    const contractId = c.req.param('id');
    const body = c.req.valid('json');
    const service = new ContractManagementService(c.env);

    const config = await service.configureRenewal({
      contractId,
      ...body,
    });

    return success(c, config);
  }
);

/**
 * POST /contracts/:id/renew
 * Manually renew a contract
 */
contractManagement.post(
  '/contracts/:id/renew',
  requireRole('ADMIN', 'INSURER_ADMIN', 'INSURER_AGENT'),
  zValidator('json', z.object({
    newEndDate: z.string().optional(),
    priceAdjustment: z.number().min(-20).max(50).optional(),
  }).optional()),
  async (c) => {
    const contractId = c.req.param('id');
    const body = c.req.valid('json') || {};
    const service = new ContractManagementService(c.env);

    const result = await service.renewContract(contractId, body);

    if (!result.success) {
      return error(c, 'RENEWAL_FAILED', result.error || 'Échec du renouvellement', 400);
    }

    return success(c, {
      message: 'Contrat renouvelé avec succès',
      newContractId: result.newContractId,
    });
  }
);

/**
 * POST /renewals/process
 * Process automatic renewals (cron job)
 */
contractManagement.post(
  '/renewals/process',
  requireRole('ADMIN'),
  async (c) => {
    const service = new ContractManagementService(c.env);

    const result = await service.processAutoRenewals();

    return success(c, {
      message: 'Renouvellements traités',
      ...result,
    });
  }
);

// ============== CREATE FROM TEMPLATE ==============

const createFromTemplateSchema = z.object({
  templateId: z.string().uuid(),
  adherentId: z.string().uuid(),
  startDate: z.string(),
  endDate: z.string().optional(),
  beneficiaries: z.array(z.object({
    name: z.string(),
    relationship: z.string(),
    birthDate: z.string(),
  })).optional(),
  customCoverage: z.array(z.object({
    careType: z.string(),
    coveragePercent: z.number().optional(),
    maxAmount: z.number().optional(),
  })).optional(),
});

/**
 * POST /contracts/from-template
 * Create contract from template
 */
contractManagement.post(
  '/contracts/from-template',
  requireRole('ADMIN', 'INSURER_ADMIN', 'INSURER_AGENT'),
  zValidator('json', createFromTemplateSchema),
  async (c) => {
    const body = c.req.valid('json');
    const service = new ContractManagementService(c.env);

    try {
      const result = await service.createContractFromTemplate(body);
      return success(c, {
        message: 'Contrat créé avec succès',
        ...result,
      }, 201);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erreur lors de la création';
      return error(c, 'CONTRACT_CREATION_FAILED', message, 400);
    }
  }
);

// ============== STATISTICS ==============

/**
 * GET /templates/stats
 * Get template usage statistics
 */
contractManagement.get('/templates/stats', async (c) => {
  const user = c.get('user');
  const insurerFilter = user.insurerId ? `WHERE ct.insurer_id = '${user.insurerId}'` : '';

  const stats = await getDb(c).prepare(`
    SELECT
      ct.id,
      ct.name,
      ct.category,
      COUNT(c.id) as contracts_count,
      SUM(c.premium) as total_premium,
      AVG(c.premium) as avg_premium,
      COUNT(CASE WHEN c.status = 'active' THEN 1 END) as active_contracts
    FROM contract_templates ct
    LEFT JOIN contracts c ON ct.id = c.template_id
    ${insurerFilter}
    GROUP BY ct.id
    ORDER BY contracts_count DESC
  `).all<{
    id: string;
    name: string;
    category: string;
    contracts_count: number;
    total_premium: number;
    avg_premium: number;
    active_contracts: number;
  }>();

  return success(c, stats.results || []);
});

/**
 * GET /renewals/stats
 * Get renewal statistics
 */
contractManagement.get('/renewals/stats', async (c) => {
  const user = c.get('user');
  const insurerFilter = user.insurerId ? `AND c.insurer_id = '${user.insurerId}'` : '';

  const [upcoming, autoRenewEnabled, renewedThisMonth] = await Promise.all([
    // Upcoming renewals by period
    getDb(c).prepare(`
      SELECT
        CASE
          WHEN julianday(c.end_date) - julianday('now') <= 7 THEN 'this_week'
          WHEN julianday(c.end_date) - julianday('now') <= 30 THEN 'this_month'
          ELSE 'later'
        END as period,
        COUNT(*) as count
      FROM contracts c
      WHERE c.status = 'active'
        AND c.end_date <= date('now', '+60 days')
        ${insurerFilter}
      GROUP BY period
    `).all<{ period: string; count: number }>(),

    // Auto-renew enabled count
    getDb(c).prepare(`
      SELECT COUNT(*) as count
      FROM contract_renewals cr
      JOIN contracts c ON cr.contract_id = c.id
      WHERE cr.auto_renew = 1
        AND c.status = 'active'
        ${insurerFilter}
    `).first<{ count: number }>(),

    // Renewed this month
    getDb(c).prepare(`
      SELECT COUNT(*) as count
      FROM contracts c
      WHERE c.status = 'renewed'
        AND c.updated_at >= date('now', 'start of month')
        ${insurerFilter}
    `).first<{ count: number }>(),
  ]);

  return success(c, {
    upcoming: upcoming.results || [],
    autoRenewEnabled: autoRenewEnabled?.count || 0,
    renewedThisMonth: renewedThisMonth?.count || 0,
  });
});

export { contractManagement };
