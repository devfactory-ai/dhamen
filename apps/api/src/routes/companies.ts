import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { created, noContent, notFound, paginated, success, validationError } from '../lib/response';
import { generateId } from '../lib/ulid';
import { logAudit } from '../middleware/audit-trail';
import { authMiddleware, requireRole } from '../middleware/auth';
import type { Bindings, Variables } from '../types';
import { getDb } from '../lib/db';

const SECTORS = ['IT', 'BANKING', 'HEALTHCARE', 'MANUFACTURING', 'RETAIL', 'SERVICES', 'OTHER'] as const;

// Schemas
const companyCreateSchema = z.object({
  name: z.string().min(1, 'Nom requis'),
  matriculeFiscal: z.string().optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email().optional(),
  sector: z.enum(SECTORS).optional(),
  employeeCount: z.number().int().positive().optional(),
  insurerId: z.string().optional(),
});

const companyUpdateSchema = companyCreateSchema.partial();

const companyFiltersSchema = z.object({
  search: z.string().optional(),
  sector: z.enum(SECTORS).optional(),
  insurerId: z.string().optional(),
  isActive: z.coerce.boolean().optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

const validationHook = (result: { success: boolean; data?: unknown; error?: z.ZodError }, c: any): Response | undefined => {
  if (!result.success && result.error) {
    const errors = result.error.errors.map((e) => ({
      path: e.path.join('.'),
      message: e.message,
    }));
    return validationError(c, errors);
  }
  return undefined;
};

const companies = new Hono<{ Bindings: Bindings; Variables: Variables }>();

// Apply auth middleware
companies.use('*', authMiddleware());

/**
 * GET /api/v1/companies
 * List companies with filters and pagination
 */
companies.get(
  '/',
  requireRole('ADMIN', 'INSURER_ADMIN', 'INSURER_AGENT'),
  zValidator('query', companyFiltersSchema, validationHook),
  async (c) => {
    const { search, sector, insurerId, isActive, page, limit } = c.req.valid('query');
    const offset = (page - 1) * limit;

    let query = `SELECT * FROM companies WHERE 1=1`;
    const params: unknown[] = [];

    if (search) {
      query += ` AND (name LIKE ? OR matricule_fiscal LIKE ? OR city LIKE ?)`;
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }
    if (sector) {
      query += ` AND sector = ?`;
      params.push(sector);
    }
    if (insurerId) {
      query += ` AND insurer_id = ?`;
      params.push(insurerId);
    }
    if (isActive !== undefined) {
      query += ` AND is_active = ?`;
      params.push(isActive ? 1 : 0);
    }

    // Count total
    const countQuery = query.replace('SELECT *', 'SELECT COUNT(*) as total');
    const countResult = await getDb(c).prepare(countQuery).bind(...params).first<{ total: number }>();
    const total = countResult?.total || 0;

    // Get paginated data
    query += ` ORDER BY name ASC LIMIT ? OFFSET ?`;
    params.push(limit, offset);

    const { results } = await getDb(c).prepare(query).bind(...params).all();

    return paginated(c, results || [], {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    });
  }
);

/**
 * GET /api/v1/companies/:id
 * Get a company by ID
 */
companies.get('/:id', requireRole('ADMIN', 'INSURER_ADMIN', 'INSURER_AGENT', 'HR'), async (c) => {
  const id = c.req.param('id');
  const user = c.get('user');

  // HR can only view their own company
  if (user?.role === 'HR' && user?.companyId !== id) {
    return notFound(c, 'Entreprise non trouvee');
  }

  const company = await getDb(c).prepare('SELECT * FROM companies WHERE id = ?').bind(id).first();

  if (!company) {
    return notFound(c, 'Entreprise non trouvee');
  }

  return success(c, company);
});

/**
 * POST /api/v1/companies
 * Create a new company
 */
companies.post(
  '/',
  requireRole('ADMIN', 'INSURER_ADMIN'),
  zValidator('json', companyCreateSchema, validationHook),
  async (c) => {
    const data = c.req.valid('json');
    const user = c.get('user');
    const id = generateId();

    await getDb(c).prepare(
      `INSERT INTO companies (id, name, matricule_fiscal, address, city, phone, email, sector, employee_count, insurer_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
      .bind(
        id,
        data.name,
        data.matriculeFiscal || null,
        data.address || null,
        data.city || null,
        data.phone || null,
        data.email || null,
        data.sector || null,
        data.employeeCount || null,
        data.insurerId || null
      )
      .run();

    const company = await getDb(c).prepare('SELECT * FROM companies WHERE id = ?').bind(id).first();

    await logAudit(getDb(c), {
      userId: user?.sub,
      action: 'company.create',
      entityType: 'company',
      entityId: id,
      changes: data,
      ipAddress: c.req.header('CF-Connecting-IP'),
      userAgent: c.req.header('User-Agent'),
    });

    return created(c, company);
  }
);

/**
 * PUT /api/v1/companies/:id
 * Update a company
 */
companies.put(
  '/:id',
  requireRole('ADMIN', 'INSURER_ADMIN', 'HR'),
  zValidator('json', companyUpdateSchema, validationHook),
  async (c) => {
    const id = c.req.param('id');
    const data = c.req.valid('json');
    const user = c.get('user');

    // HR can only update their own company
    if (user?.role === 'HR' && user?.companyId !== id) {
      return notFound(c, 'Entreprise non trouvee');
    }

    const existing = await getDb(c).prepare('SELECT * FROM companies WHERE id = ?').bind(id).first();
    if (!existing) {
      return notFound(c, 'Entreprise non trouvee');
    }

    const updates: string[] = [];
    const params: unknown[] = [];

    if (data.name !== undefined) {
      updates.push('name = ?');
      params.push(data.name);
    }
    if (data.matriculeFiscal !== undefined) {
      updates.push('matricule_fiscal = ?');
      params.push(data.matriculeFiscal);
    }
    if (data.address !== undefined) {
      updates.push('address = ?');
      params.push(data.address);
    }
    if (data.city !== undefined) {
      updates.push('city = ?');
      params.push(data.city);
    }
    if (data.phone !== undefined) {
      updates.push('phone = ?');
      params.push(data.phone);
    }
    if (data.email !== undefined) {
      updates.push('email = ?');
      params.push(data.email);
    }
    if (data.sector !== undefined) {
      updates.push('sector = ?');
      params.push(data.sector);
    }
    if (data.employeeCount !== undefined) {
      updates.push('employee_count = ?');
      params.push(data.employeeCount);
    }
    if (data.insurerId !== undefined) {
      updates.push('insurer_id = ?');
      params.push(data.insurerId);
    }

    if (updates.length > 0) {
      updates.push("updated_at = datetime('now')");
      params.push(id);

      await getDb(c).prepare(`UPDATE companies SET ${updates.join(', ')} WHERE id = ?`)
        .bind(...params)
        .run();
    }

    const company = await getDb(c).prepare('SELECT * FROM companies WHERE id = ?').bind(id).first();

    await logAudit(getDb(c), {
      userId: user?.sub,
      action: 'company.update',
      entityType: 'company',
      entityId: id,
      changes: data,
      ipAddress: c.req.header('CF-Connecting-IP'),
      userAgent: c.req.header('User-Agent'),
    });

    return success(c, company);
  }
);

/**
 * DELETE /api/v1/companies/:id
 * Soft delete a company
 */
companies.delete('/:id', requireRole('ADMIN'), async (c) => {
  const id = c.req.param('id');
  const user = c.get('user');

  const existing = await getDb(c).prepare('SELECT * FROM companies WHERE id = ?').bind(id).first();
  if (!existing) {
    return notFound(c, 'Entreprise non trouvee');
  }

  await getDb(c).prepare("UPDATE companies SET is_active = 0, updated_at = datetime('now') WHERE id = ?").bind(id).run();

  await logAudit(getDb(c), {
    userId: user?.sub,
    action: 'company.delete',
    entityType: 'company',
    entityId: id,
    ipAddress: c.req.header('CF-Connecting-IP'),
    userAgent: c.req.header('User-Agent'),
  });

  return noContent(c);
});

/**
 * GET /api/v1/companies/:id/adherents
 * Get adherents for a company
 */
companies.get('/:id/adherents', requireRole('ADMIN', 'INSURER_ADMIN', 'HR'), async (c) => {
  const id = c.req.param('id');
  const user = c.get('user');

  // HR can only view their own company's adherents
  if (user?.role === 'HR' && user?.companyId !== id) {
    return notFound(c, 'Entreprise non trouvee');
  }

  const { results } = await getDb(c).prepare(
    `SELECT a.*, c.policy_number as contract_number
     FROM adherents a
     LEFT JOIN contracts c ON c.adherent_id = a.id
     WHERE a.company_id = ?
     ORDER BY a.last_name, a.first_name`
  )
    .bind(id)
    .all();

  return success(c, results || []);
});

/**
 * GET /api/v1/companies/:id/stats
 * Get company statistics
 */
companies.get('/:id/stats', requireRole('ADMIN', 'INSURER_ADMIN', 'HR'), async (c) => {
  const id = c.req.param('id');
  const user = c.get('user');

  // HR can only view their own company's stats
  if (user?.role === 'HR' && user?.companyId !== id) {
    return notFound(c, 'Entreprise non trouvee');
  }

  const [totalAdherents, activeContracts, totalClaims, pendingClaims] = await Promise.all([
    getDb(c).prepare('SELECT COUNT(*) as count FROM adherents WHERE company_id = ?').bind(id).first<{ count: number }>(),
    getDb(c).prepare(
      `SELECT COUNT(*) as count FROM contracts WHERE adherent_id IN (SELECT id FROM adherents WHERE company_id = ?) AND status = 'active'`
    )
      .bind(id)
      .first<{ count: number }>(),
    getDb(c).prepare(
      `SELECT COUNT(*) as count FROM claims WHERE adherent_id IN (SELECT id FROM adherents WHERE company_id = ?)`
    )
      .bind(id)
      .first<{ count: number }>(),
    getDb(c).prepare(
      `SELECT COUNT(*) as count FROM claims WHERE adherent_id IN (SELECT id FROM adherents WHERE company_id = ?) AND status = 'pending'`
    )
      .bind(id)
      .first<{ count: number }>(),
  ]);

  return success(c, {
    totalAdherents: totalAdherents?.count || 0,
    activeContracts: activeContracts?.count || 0,
    totalClaims: totalClaims?.count || 0,
    pendingClaims: pendingClaims?.count || 0,
  });
});

export { companies };
