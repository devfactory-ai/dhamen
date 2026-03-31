import {
  createInsurer,
  findInsurerByCode,
  findInsurerById,
  listInsurers,
  softDeleteInsurer,
  updateInsurer,
} from '@dhamen/db';
import {
  insurerCreateSchema,
  insurerFiltersSchema,
  insurerUpdateSchema,
  paginationSchema,
  validerMatriculeFiscal,
} from '@dhamen/shared';
import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import { conflict, created, error, noContent, notFound, paginated, success } from '../lib/response';
import { generateId } from '../lib/ulid';
import { logAudit } from '../middleware/audit-trail';
import { authMiddleware, requireRole } from '../middleware/auth';
import type { Bindings, Variables } from '../types';
import { getDb } from '../lib/db';

const insurers = new Hono<{ Bindings: Bindings; Variables: Variables }>();

// Apply auth middleware to all routes
insurers.use('*', authMiddleware());

/**
 * GET /api/v1/insurers
 * List insurers with filters and pagination
 */
insurers.get(
  '/',
  requireRole('ADMIN', 'INSURER_ADMIN', 'INSURER_AGENT'),
  zValidator('query', insurerFiltersSchema.merge(paginationSchema)),
  async (c) => {
    const { isActive, search, typeAssureur, page, limit } = c.req.valid('query');

    const { data, total } = await listInsurers(getDb(c), {
      isActive,
      search,
      typeAssureur,
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
 * GET /api/v1/insurers/export/csv
 * Export insurers as CSV (BR-005) — must be before /:id
 */
insurers.get('/export/csv', requireRole('ADMIN'), async (c) => {
  const user = c.get('user');
  const db = getDb(c);
  const typeAssureurParam = c.req.query('typeAssureur');
  const isActiveParam = c.req.query('isActive');
  const isActive = isActiveParam === 'true' ? true : isActiveParam === 'false' ? false : undefined;

  const { data: exportData, total } = await listInsurers(db, {
    typeAssureur: typeAssureurParam || undefined,
    isActive,
    limit: 10000,
  });

  const TYPE_LABELS: Record<string, string> = {
    cnam: 'CNAM', mutuelle: 'Mutuelle', compagnie: 'Compagnie', reassureur: 'Réassureur', autre: 'Autre',
  };

  const header = 'Raison Sociale,Type,Code,Matricule Fiscal,Statut,Telephone,Email,Debut Convention,Fin Convention,Taux Couverture';
  const rows = exportData.map((ins) =>
    [
      `"${(ins.name || '').replace(/"/g, '""')}"`,
      TYPE_LABELS[ins.typeAssureur] || ins.typeAssureur,
      ins.code,
      ins.matriculeFiscal || '',
      ins.isActive ? 'Actif' : 'Suspendu',
      ins.phone || '',
      ins.email || '',
      ins.dateDebutConvention || '',
      ins.dateFinConvention || '',
      ins.tauxCouverture != null ? `${ins.tauxCouverture}%` : '',
    ].join(',')
  );

  const csv = [header, ...rows].join('\n');

  await logAudit(db, {
    userId: user?.sub,
    action: 'assureurs.exported',
    entityType: 'insurer',
    entityId: '',
    changes: { count: total, filters: { typeAssureur: typeAssureurParam, isActive } },
    ipAddress: c.req.header('CF-Connecting-IP'),
    userAgent: c.req.header('User-Agent'),
  });

  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="compagnies-partenaires-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
});

/**
 * GET /api/v1/insurers/:id
 * Get an insurer by ID
 */
insurers.get('/:id', requireRole('ADMIN', 'INSURER_ADMIN', 'INSURER_AGENT'), async (c) => {
  const id = c.req.param('id');
  const user = c.get('user');

  // Insurer admin can only view their own insurer
  if (user?.role === 'INSURER_ADMIN' && user.insurerId !== id) {
    return notFound(c, 'Assureur non trouvé');
  }

  const insurer = await findInsurerById(getDb(c), id);

  if (!insurer) {
    return notFound(c, 'Assureur non trouvé');
  }

  return success(c, insurer);
});

/**
 * POST /api/v1/insurers
 * Create a new insurer
 */
insurers.post('/', requireRole('ADMIN'), zValidator('json', insurerCreateSchema), async (c) => {
  const data = c.req.valid('json');
  const user = c.get('user');
  const db = getDb(c);

  // Check if code already exists
  const existing = await findInsurerByCode(db, data.code);
  if (existing) {
    return conflict(c, 'Un assureur avec ce code existe déjà');
  }

  // BR-002: CNAM singleton
  if (data.typeAssureur === 'cnam') {
    const { data: allInsurers } = await listInsurers(db, { typeAssureur: 'cnam', limit: 1 });
    if (allInsurers.length > 0) {
      return error(c, 'CNAM_DUPLICATE', 'La CNAM est déjà enregistrée', 400);
    }
  }

  // BR-001: MF validation
  let matriculeValide = false;
  if (data.matriculeFiscal) {
    const mfResult = validerMatriculeFiscal(data.matriculeFiscal);
    if (!mfResult.valid) {
      return error(c, 'MF_INVALID', `Matricule fiscal invalide : ${mfResult.errors.join(', ')}`, 400);
    }
    matriculeValide = true;
  }

  const id = generateId();
  const createData = { ...data, matriculeValide } as Parameters<typeof createInsurer>[2] & { matriculeValide?: boolean };
  const insurer = await createInsurer(db, id, createData);

  // Audit log
  await logAudit(db, {
    userId: user?.sub,
    action: 'assureur.created',
    entityType: 'insurer',
    entityId: id,
    changes: {
      name: data.name,
      code: data.code,
      typeAssureur: data.typeAssureur,
    },
    ipAddress: c.req.header('CF-Connecting-IP'),
    userAgent: c.req.header('User-Agent'),
  });

  return created(c, insurer);
});

/**
 * PUT /api/v1/insurers/:id
 * Update an insurer
 */
insurers.put(
  '/:id',
  requireRole('ADMIN', 'INSURER_ADMIN', 'INSURER_AGENT'),
  zValidator('json', insurerUpdateSchema),
  async (c) => {
    const id = c.req.param('id');
    const data = c.req.valid('json');
    const user = c.get('user');
    const db = getDb(c);

    // Insurer admin can only update their own insurer
    if (user?.role === 'INSURER_ADMIN' && user.insurerId !== id) {
      return notFound(c, 'Assureur non trouvé');
    }

    // BR-001: MF re-validation if changed
    const updateData: Record<string, unknown> = { ...data };
    if (data.matriculeFiscal !== undefined) {
      if (data.matriculeFiscal) {
        const mfResult = validerMatriculeFiscal(data.matriculeFiscal);
        if (!mfResult.valid) {
          return error(c, 'MF_INVALID', `Matricule fiscal invalide : ${mfResult.errors.join(', ')}`, 400);
        }
        updateData.matriculeValide = true;
      } else {
        updateData.matriculeValide = false;
      }
    }

    // BR-002: prevent changing type of existing CNAM
    if (data.typeAssureur) {
      const existing = await findInsurerById(db, id);
      if (existing?.typeAssureur === 'cnam' && data.typeAssureur !== 'cnam') {
        return error(c, 'CNAM_TYPE_LOCKED', 'Impossible de modifier le type d\'une entrée CNAM', 400);
      }
      if (data.typeAssureur === 'cnam' && existing?.typeAssureur !== 'cnam') {
        const { data: cnamList } = await listInsurers(db, { typeAssureur: 'cnam', limit: 1 });
        if (cnamList.length > 0) {
          return error(c, 'CNAM_DUPLICATE', 'La CNAM est déjà enregistrée', 400);
        }
      }
    }

    const insurer = await updateInsurer(db, id, updateData as Parameters<typeof updateInsurer>[2]);

    if (!insurer) {
      return notFound(c, 'Assureur non trouvé');
    }

    // Audit log
    await logAudit(db, {
      userId: user?.sub,
      action: 'assureur.updated',
      entityType: 'insurer',
      entityId: id,
      changes: data,
      ipAddress: c.req.header('CF-Connecting-IP'),
      userAgent: c.req.header('User-Agent'),
    });

    return success(c, insurer);
  }
);

/**
 * DELETE /api/v1/insurers/:id
 * Soft delete an insurer
 */
insurers.delete('/:id', requireRole('ADMIN'), async (c) => {
  const id = c.req.param('id');
  const user = c.get('user');

  const deleted = await softDeleteInsurer(getDb(c), id);

  if (!deleted) {
    return notFound(c, 'Assureur non trouvé');
  }

  // Audit log
  await logAudit(getDb(c), {
    userId: user?.sub,
    action: 'insurer.delete',
    entityType: 'insurer',
    entityId: id,
    ipAddress: c.req.header('CF-Connecting-IP'),
    userAgent: c.req.header('User-Agent'),
  });

  return noContent(c);
});

/**
 * PUT /api/v1/insurers/:id/status
 * Toggle insurer status (BR-004)
 */
insurers.put('/:id/status', requireRole('ADMIN'), async (c) => {
  const id = c.req.param('id');
  const user = c.get('user');
  const db = getDb(c);
  const body = await c.req.json<{ status: 'active' | 'suspended'; motif?: string }>();

  const existing = await findInsurerById(db, id);
  if (!existing) {
    return notFound(c, 'Assureur non trouvé');
  }

  const newIsActive = body.status === 'active';
  const insurer = await updateInsurer(db, id, { isActive: newIsActive });

  await logAudit(db, {
    userId: user?.sub,
    action: 'assureur.statut.changed',
    entityType: 'insurer',
    entityId: id,
    changes: {
      oldStatus: existing.isActive ? 'active' : 'suspended',
      newStatus: body.status,
      motif: body.motif,
    },
    ipAddress: c.req.header('CF-Connecting-IP'),
    userAgent: c.req.header('User-Agent'),
  });

  return success(c, insurer);
});

export { insurers };
