import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import {
  contractCreateSchema,
  contractUpdateSchema,
  contractFiltersSchema,
  paginationSchema,
} from '@dhamen/shared';
import { findContractById, listContracts, createContract, updateContract } from '@dhamen/db';
import type { Bindings, Variables } from '../types';
import { authMiddleware, requireRole } from '../middleware/auth';
import { generateId } from '../lib/ulid';
import { success, created, notFound, paginated } from '../lib/response';
import { logAudit } from '../middleware/audit-trail';

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

    const { data, total } = await listContracts(c.env.DB, {
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
    const contract = await findContractById(c.env.DB, id);

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

    const id = generateId();
    const contract = await createContract(c.env.DB, id, {
      ...data,
      insurerId: effectiveInsurerId,
    });

    // Audit log
    await logAudit(c.env.DB, {
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
    const existing = await findContractById(c.env.DB, id);
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

    const contract = await updateContract(c.env.DB, id, data);

    if (!contract) {
      return notFound(c, 'Contrat non trouvé');
    }

    // Audit log
    await logAudit(c.env.DB, {
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
