import { createContract, findContractById, listContracts, updateContract } from '@dhamen/db';
import {
  contractCreateSchema,
  contractFiltersSchema,
  contractUpdateSchema,
  paginationSchema,
} from '@dhamen/shared';
import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import { created, notFound, paginated, success } from '../lib/response';
import { generateId } from '../lib/ulid';
import { logAudit } from '../middleware/audit-trail';
import { authMiddleware, requireRole } from '../middleware/auth';
import type { Bindings, Variables } from '../types';
import { getDb } from '../lib/db';

const contracts = new Hono<{ Bindings: Bindings; Variables: Variables }>();

// Apply auth middleware to all routes
contracts.use('*', authMiddleware());

/**
 * GET /api/v1/contracts
 * List contracts with filters and pagination
 */
contracts.get(
  '/',
  requireRole('ADMIN', 'INSURER_ADMIN', 'INSURER_AGENT'),
  zValidator('query', contractFiltersSchema.merge(paginationSchema)),
  async (c) => {
    const { insurerId, adherentId, status, planType, page, limit } = c.req.valid('query');
    const user = c.get('user');

    // Filter by insurer if user is insurer role
    let effectiveInsurerId = insurerId;
    if (user?.insurerId && (user.role === 'INSURER_ADMIN' || user.role === 'INSURER_AGENT')) {
      effectiveInsurerId = user.insurerId;
    }

    const { data, total } = await listContracts(getDb(c), {
      insurerId: effectiveInsurerId,
      adherentId,
      status,
      planType,
      page,
      limit,
    });

    return paginated(c, data, {
      page: page ?? 1,
      limit: limit ?? 20,
      total,
      totalPages: Math.ceil(total / (limit ?? 20)),
    });
  }
);

/**
 * GET /api/v1/contracts/:id
 * Get a contract by ID
 */
contracts.get(
  '/:id',
  requireRole(
    'ADMIN',
    'INSURER_ADMIN',
    'INSURER_AGENT',
    'PHARMACIST',
    'DOCTOR',
    'LAB_MANAGER',
    'CLINIC_ADMIN'
  ),
  async (c) => {
    const id = c.req.param('id');
    const contract = await findContractById(getDb(c), id);

    if (!contract) {
      return notFound(c, 'Contrat non trouvé');
    }

    // Check access for insurer roles
    const user = c.get('user');
    if (
      user?.insurerId &&
      (user.role === 'INSURER_ADMIN' || user.role === 'INSURER_AGENT') &&
      contract.insurerId !== user.insurerId
    ) {
      return notFound(c, 'Contrat non trouvé');
    }

    return success(c, contract);
  }
);

/**
 * POST /api/v1/contracts
 * Create a new contract
 */
contracts.post(
  '/',
  requireRole('ADMIN', 'INSURER_ADMIN', 'INSURER_AGENT'),
  zValidator('json', contractCreateSchema),
  async (c) => {
    const data = c.req.valid('json');
    const user = c.get('user');

    // If insurer user, force their insurer ID
    let effectiveInsurerId = data.insurerId;
    if (user?.insurerId && (user.role === 'INSURER_ADMIN' || user.role === 'INSURER_AGENT')) {
      effectiveInsurerId = user.insurerId;
    }

    if (!data.adherentId) {
      return c.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: 'adherentId requis' } },
        400
      );
    }

    // Default coverage if not provided
    const defaultCoverage = {
      pharmacy: { enabled: true, reimbursementRate: 80, annualLimit: null, genericOnly: false },
      consultation: { enabled: true, reimbursementRate: 70, annualLimit: null, specialities: [] as string[] },
      lab: { enabled: true, reimbursementRate: 80, annualLimit: null },
      hospitalization: { enabled: true, reimbursementRate: 100, annualLimit: null, roomType: 'standard' as const },
    };

    const id = generateId();
    const contract = await createContract(getDb(c), id, {
      ...data,
      adherentId: data.adherentId,
      insurerId: effectiveInsurerId,
      coverage: data.coverage ?? defaultCoverage,
    });

    // Audit log
    await logAudit(getDb(c), {
      userId: user?.sub,
      action: 'contract.create',
      entityType: 'contract',
      entityId: id,
      changes: {
        insurerId: effectiveInsurerId,
        adherentId: data.adherentId,
        contractNumber: data.contractNumber,
        planType: data.planType,
      },
      ipAddress: c.req.header('CF-Connecting-IP'),
      userAgent: c.req.header('User-Agent'),
    });

    return created(c, contract);
  }
);

/**
 * PUT /api/v1/contracts/:id
 * Update a contract
 */
contracts.put(
  '/:id',
  requireRole('ADMIN', 'INSURER_ADMIN', 'INSURER_AGENT'),
  zValidator('json', contractUpdateSchema),
  async (c) => {
    const id = c.req.param('id');
    const data = c.req.valid('json');
    const user = c.get('user');

    // Check access
    const existing = await findContractById(getDb(c), id);
    if (!existing) {
      return notFound(c, 'Contrat non trouvé');
    }

    if (
      user?.insurerId &&
      (user.role === 'INSURER_ADMIN' || user.role === 'INSURER_AGENT') &&
      existing.insurerId !== user.insurerId
    ) {
      return notFound(c, 'Contrat non trouvé');
    }

    const contract = await updateContract(getDb(c), id, data);

    if (!contract) {
      return notFound(c, 'Contrat non trouvé');
    }

    // Audit log
    await logAudit(getDb(c), {
      userId: user?.sub,
      action: 'contract.update',
      entityType: 'contract',
      entityId: id,
      changes: data,
      ipAddress: c.req.header('CF-Connecting-IP'),
      userAgent: c.req.header('User-Agent'),
    });

    return success(c, contract);
  }
);

export { contracts };
