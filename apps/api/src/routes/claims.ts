import {
  createClaim,
  createClaimItem,
  findClaimById,
  findClaimItems,
  findClaimsByFilters,
  getClaimsStats,
  updateClaimStatus,
} from '@dhamen/db';
import { findContractById } from '@dhamen/db';
import {
  claimCreateSchema,
  claimFiltersSchema,
  claimUpdateSchema,
  paginationSchema,
} from '@dhamen/shared';
import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import { z } from 'zod';
import { error, notFound, paginated, success } from '../lib/response';
import { generateId } from '../lib/ulid';
import { logAudit } from '../middleware/audit-trail';
import { authMiddleware, requireRole } from '../middleware/auth';
import type { Bindings, Variables } from '../types';
import { getDb } from '../lib/db';

const claims = new Hono<{ Bindings: Bindings; Variables: Variables }>();

// All routes require authentication
claims.use('*', authMiddleware());

/**
 * GET /api/v1/claims
 * List claims with filters
 */
claims.get(
  '/',
  zValidator(
    'query',
    claimFiltersSchema.merge(paginationSchema).extend({
      page: z.coerce.number().optional(),
      limit: z.coerce.number().optional(),
    })
  ),
  async (c) => {
    const user = c.get('user');
    const { page = 1, limit = 20, ...filters } = c.req.valid('query');

    // Providers can only see their own claims
    if (user?.providerId) {
      filters.providerId = user.providerId;
    }

    // Insurer users can only see their insurer's claims
    if (user?.insurerId) {
      filters.insurerId = user.insurerId;
    }

    // ADHERENT role can only see their own claims
    if (user?.role === 'ADHERENT') {
      // Find adherent ID for this user (by email)
      const adherent = await getDb(c).prepare(
        'SELECT id FROM adherents WHERE email = ? AND deleted_at IS NULL'
      ).bind(user.email).first<{ id: string }>();

      if (adherent) {
        filters.adherentId = adherent.id;
      } else {
        // No adherent found, return empty list
        return paginated(c, [], { page, limit, total: 0 });
      }
    }

    const { claims: claimsList, total } = await findClaimsByFilters(getDb(c), filters, page, limit);

    return paginated(c, claimsList, { page, limit, total });
  }
);

/**
 * GET /api/v1/claims/stats
 * Get claims statistics
 */
claims.get('/stats', requireRole('ADMIN', 'INSURER_ADMIN', 'INSURER_AGENT'), async (c) => {
  const user = c.get('user');
  const insurerId = user?.insurerId ?? undefined;

  const stats = await getClaimsStats(getDb(c), insurerId);
  return success(c, stats);
});

/**
 * GET /api/v1/claims/:id
 * Get claim by ID
 */
claims.get('/:id', async (c) => {
  const { id } = c.req.param();
  const user = c.get('user');

  const claim = await findClaimById(getDb(c), id);

  if (!claim) {
    return notFound(c, 'Demande non trouvée');
  }

  // Check access rights based on user role
  // Providers can only see their own claims
  if (user?.providerId && claim.providerId !== user.providerId) {
    return notFound(c, 'Demande non trouvée');
  }
  // Insurers can only see their insurer's claims
  if (user?.insurerId && claim.insurerId !== user.insurerId) {
    return notFound(c, 'Demande non trouvée');
  }
  // ADHERENT role can only see their own claims
  if (user?.role === 'ADHERENT') {
    // Find adherent ID for this user (by email)
    const adherent = await getDb(c).prepare(
      'SELECT id FROM adherents WHERE email = ? AND deleted_at IS NULL'
    ).bind(user.email).first<{ id: string }>();

    if (!adherent || claim.adherentId !== adherent.id) {
      return notFound(c, 'Demande non trouvée');
    }
  }

  // Get claim items
  const items = await findClaimItems(getDb(c), id);

  return success(c, { ...claim, items });
});

/**
 * POST /api/v1/claims
 * Create a new claim
 */
claims.post(
  '/',
  requireRole('PHARMACIST', 'DOCTOR', 'LAB_MANAGER', 'CLINIC_ADMIN'),
  zValidator('json', claimCreateSchema),
  async (c) => {
    const user = c.get('user');
    const data = c.req.valid('json');

    // Provider can only create claims for themselves
    if (user?.providerId && data.providerId !== user.providerId) {
      return error(
        c,
        'FORBIDDEN',
        'Vous ne pouvez créer des demandes que pour votre établissement',
        403
      );
    }

    // Get contract to determine adherent and insurer
    const contract = await findContractById(getDb(c), data.contractId);
    if (!contract) {
      return error(c, 'CONTRACT_NOT_FOUND', 'Contrat non trouvé', 404);
    }

    if (contract.status !== 'active') {
      return error(c, 'CONTRACT_INACTIVE', "Le contrat n'est pas actif", 400);
    }

    // Calculate totals
    let totalAmount = 0;
    for (const item of data.items) {
      totalAmount += item.quantity * item.unitPrice;
    }

    // Simple coverage calculation (in production, use tarification agent)
    const coverageRate = 0.8;
    const coveredAmount = Math.round(totalAmount * coverageRate);
    const copayAmount = totalAmount - coveredAmount;

    // Create claim
    const claimId = generateId();
    const claim = await createClaim(getDb(c), {
      id: claimId,
      type: data.type,
      contractId: data.contractId,
      providerId: data.providerId,
      adherentId: contract.adherentId,
      insurerId: contract.insurerId,
      totalAmount,
      coveredAmount,
      copayAmount,
      status: 'pending',
      notes: data.notes,
    });

    // Create claim items
    for (const item of data.items) {
      const lineTotal = item.quantity * item.unitPrice;
      const itemCovered = Math.round(lineTotal * coverageRate);

      await createClaimItem(getDb(c), {
        id: generateId(),
        claimId,
        code: item.code,
        label: item.label,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        lineTotal,
        coveredAmount: itemCovered,
        copayAmount: lineTotal - itemCovered,
        reimbursementRate: coverageRate,
        isGeneric: item.isGeneric,
      });
    }

    // Get full claim with items
    const items = await findClaimItems(getDb(c), claimId);

    // Audit log
    await logAudit(getDb(c), {
      userId: user?.sub ?? 'system',
      action: 'claims.create',
      entityType: 'claim',
      entityId: claimId,
      changes: { type: data.type, totalAmount, status: 'pending' },
      ipAddress: c.req.header('CF-Connecting-IP'),
      userAgent: c.req.header('User-Agent'),
    });

    return success(c, { ...claim, items }, 201);
  }
);

/**
 * PATCH /api/v1/claims/:id
 * Update claim status
 */
claims.patch(
  '/:id',
  requireRole('ADMIN', 'INSURER_ADMIN', 'INSURER_AGENT'),
  zValidator('json', claimUpdateSchema),
  async (c) => {
    const { id } = c.req.param();
    const user = c.get('user');
    const data = c.req.valid('json');

    const existing = await findClaimById(getDb(c), id);
    if (!existing) {
      return notFound(c, 'Demande non trouvée');
    }

    // Insurer users can only update their insurer's claims
    if (user?.insurerId && existing.insurerId !== user.insurerId) {
      return notFound(c, 'Demande non trouvée');
    }

    if (!(data.status || data.notes)) {
      return error(c, 'VALIDATION_ERROR', 'Aucune modification fournie', 400);
    }

    const claim = await updateClaimStatus(getDb(c), id, data.status ?? existing.status, data.notes);

    // Audit log
    await logAudit(getDb(c), {
      userId: user?.sub ?? 'system',
      action: 'claims.update',
      entityType: 'claim',
      entityId: id,
      changes: data,
      ipAddress: c.req.header('CF-Connecting-IP'),
      userAgent: c.req.header('User-Agent'),
    });

    return success(c, claim);
  }
);

/**
 * POST /api/v1/claims/:id/approve
 * Approve a claim
 */
claims.post('/:id/approve', requireRole('ADMIN', 'INSURER_ADMIN', 'INSURER_AGENT'), async (c) => {
  const { id } = c.req.param();
  const user = c.get('user');

  const existing = await findClaimById(getDb(c), id);
  if (!existing) {
    return notFound(c, 'Demande non trouvée');
  }

  if (user?.insurerId && existing.insurerId !== user.insurerId) {
    return notFound(c, 'Demande non trouvée');
  }

  if (existing.status !== 'pending' && existing.status !== 'pending_review') {
    return error(
      c,
      'INVALID_STATUS',
      'La demande ne peut pas être approuvée dans son état actuel',
      400
    );
  }

  const claim = await updateClaimStatus(getDb(c), id, 'approved');

  await logAudit(getDb(c), {
    userId: user?.sub ?? 'system',
    action: 'claims.approve',
    entityType: 'claim',
    entityId: id,
    changes: { previousStatus: existing.status, newStatus: 'approved' },
    ipAddress: c.req.header('CF-Connecting-IP'),
    userAgent: c.req.header('User-Agent'),
  });

  return success(c, claim);
});

/**
 * POST /api/v1/claims/:id/reject
 * Reject a claim
 */
claims.post(
  '/:id/reject',
  requireRole('ADMIN', 'INSURER_ADMIN', 'INSURER_AGENT'),
  zValidator('json', z.object({ reason: z.string().min(1, 'Motif requis') })),
  async (c) => {
    const { id } = c.req.param();
    const user = c.get('user');
    const { reason } = c.req.valid('json');

    const existing = await findClaimById(getDb(c), id);
    if (!existing) {
      return notFound(c, 'Demande non trouvée');
    }

    if (user?.insurerId && existing.insurerId !== user.insurerId) {
      return notFound(c, 'Demande non trouvée');
    }

    if (existing.status !== 'pending' && existing.status !== 'pending_review') {
      return error(
        c,
        'INVALID_STATUS',
        'La demande ne peut pas être rejetée dans son état actuel',
        400
      );
    }

    const claim = await updateClaimStatus(getDb(c), id, 'rejected', reason);

    await logAudit(getDb(c), {
      userId: user?.sub ?? 'system',
      action: 'claims.reject',
      entityType: 'claim',
      entityId: id,
      changes: { previousStatus: existing.status, newStatus: 'rejected', reason },
      ipAddress: c.req.header('CF-Connecting-IP'),
      userAgent: c.req.header('User-Agent'),
    });

    return success(c, claim);
  }
);

export { claims };
