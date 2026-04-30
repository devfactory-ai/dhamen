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
  code: z.string().optional(),
  matriculeFiscal: z.string().optional(),
  contractNumber: z.string().optional(),
  dateOuverture: z.string().optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email().optional().or(z.literal('')),
  sector: z.enum(SECTORS).optional().or(z.literal('')),
  employeeCount: z.number().int().positive().optional().or(z.literal(0)),
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
    const currentUser = c.get('user');

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

    // INSURER_ADMIN / INSURER_AGENT: scope to own insurer's companies
    const effectiveInsurerId = currentUser.role !== 'ADMIN'
      ? (currentUser.insurerId || insurerId)
      : insurerId;

    if (effectiveInsurerId) {
      query += ` AND insurer_id = ?`;
      params.push(effectiveInsurerId);
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

    // Enrich each company with real adherent count
    const companyIds = (results || []).map((r: Record<string, unknown>) => r.id as string);
    let adherentCounts: Record<string, number> = {};
    if (companyIds.length > 0) {
      try {
        const placeholders = companyIds.map(() => '?').join(',');
        const countRows = await getDb(c).prepare(
          `SELECT company_id, COUNT(*) as cnt FROM adherents
           WHERE company_id IN (${placeholders})
             AND (deleted_at IS NULL OR deleted_at = '')
             AND parent_adherent_id IS NULL
           GROUP BY company_id`
        ).bind(...companyIds).all();
        for (const row of (countRows.results || []) as Array<{ company_id: string; cnt: number }>) {
          adherentCounts[row.company_id] = row.cnt;
        }
      } catch { /* column may not exist */ }
    }

    const enriched = (results || []).map((r: Record<string, unknown>) => ({
      ...r,
      real_adherent_count: adherentCounts[r.id as string] ?? 0,
    }));

    return paginated(c, enriched, {
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

  // Try to fill contract info from group_contracts if missing
  try {
    if (!company.contract_number || !company.contract_id) {
      const gc = await getDb(c).prepare(
        `SELECT id, contract_number FROM group_contracts WHERE company_id = ? AND deleted_at IS NULL LIMIT 1`
      ).bind(id).first<{ id: string; contract_number: string }>();
      if (gc) {
        if (!company.contract_number && gc.contract_number) {
          (company as Record<string, unknown>).contract_number = gc.contract_number;
        }
        if (!company.contract_id) {
          (company as Record<string, unknown>).contract_id = gc.id;
        }
      }
    }
  } catch { /* group_contracts table may not exist */ }

  return success(c, company);
});

/**
 * POST /api/v1/companies
 * Create a new company
 */
companies.post(
  '/',
  requireRole('ADMIN', 'INSURER_ADMIN', 'INSURER_AGENT'),
  zValidator('json', companyCreateSchema, validationHook),
  async (c) => {
    const data = c.req.valid('json');
    const user = c.get('user');
    const id = generateId();

    await getDb(c).prepare(
      `INSERT INTO companies (id, name, code, matricule_fiscal, contract_number, date_ouverture, address, city, phone, email, sector, employee_count, insurer_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
      .bind(
        id,
        data.name,
        data.code || null,
        data.matriculeFiscal || null,
        data.contractNumber || null,
        data.dateOuverture || null,
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
  requireRole('ADMIN', 'INSURER_ADMIN', 'INSURER_AGENT', 'HR'),
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

    // Coerce empty strings to null for optional fields
    if (data.email === '') data.email = undefined;
    if (data.sector === '') data.sector = undefined;
    if (data.insurerId === '') data.insurerId = undefined;
    if (data.phone === '') data.phone = undefined;
    if (data.employeeCount === 0) data.employeeCount = undefined;

    const updates: string[] = [];
    const params: unknown[] = [];

    if (data.name !== undefined) {
      updates.push('name = ?');
      params.push(data.name);
    }
    if (data.code !== undefined) {
      updates.push('code = ?');
      params.push(data.code || null);
    }
    if (data.matriculeFiscal !== undefined) {
      updates.push('matricule_fiscal = ?');
      params.push(data.matriculeFiscal || null);
    }
    if (data.contractNumber !== undefined) {
      updates.push('contract_number = ?');
      params.push(data.contractNumber || null);
    }
    if (data.dateOuverture !== undefined) {
      updates.push('date_ouverture = ?');
      params.push(data.dateOuverture || null);
    }
    if (data.address !== undefined) {
      updates.push('address = ?');
      params.push(data.address || null);
    }
    if (data.city !== undefined) {
      updates.push('city = ?');
      params.push(data.city || null);
    }
    if (data.phone !== undefined) {
      updates.push('phone = ?');
      params.push(data.phone || null);
    }
    if (data.email !== undefined) {
      updates.push('email = ?');
      params.push(data.email || null);
    }
    if (data.sector !== undefined) {
      updates.push('sector = ?');
      params.push(data.sector || null);
    }
    if (data.employeeCount !== undefined) {
      updates.push('employee_count = ?');
      params.push(data.employeeCount || null);
    }
    if (data.insurerId !== undefined) {
      updates.push('insurer_id = ?');
      params.push(data.insurerId || null);
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
companies.get('/:id/adherents', requireRole('ADMIN', 'INSURER_ADMIN', 'INSURER_AGENT', 'HR'), async (c) => {
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
companies.get('/:id/stats', requireRole('ADMIN', 'INSURER_ADMIN', 'INSURER_AGENT', 'HR'), async (c) => {
  const id = c.req.param('id');
  const user = c.get('user');

  // HR can only view their own company's stats
  if (user?.role === 'HR' && user?.companyId !== id) {
    return notFound(c, 'Entreprise non trouvee');
  }

  const db = getDb(c);

  // Verify company exists first — return empty stats immediately if not
  const companyExists = await db.prepare('SELECT id FROM companies WHERE id = ?').bind(id).first();
  if (!companyExists) {
    return success(c, { totalAdherents: 0, activeContracts: 0, totalClaims: 0, pendingClaims: 0, totalReimbursed: 0 });
  }

  // Single query for adherents + group_contracts (core tables, must exist)
  const coreStats = await db.prepare(
    `SELECT
       (SELECT COUNT(*) FROM adherents WHERE company_id = ?1 AND (deleted_at IS NULL OR deleted_at = '') AND parent_adherent_id IS NULL) as totalAdherents,
       (SELECT COUNT(*) FROM group_contracts WHERE company_id = ?1 AND status = 'active' AND (deleted_at IS NULL OR deleted_at = '')) as activeGroupContracts`
  ).bind(id).first<{ totalAdherents: number; activeGroupContracts: number }>();

  const totalAdherents = Number(coreStats?.totalAdherents) || 0;
  const activeContracts = Number(coreStats?.activeGroupContracts) || 0;

  // Claims stats from bulletins_soins
  let totalBulletins = 0, pendingBulletins = 0, reimbursedBulletins = 0;
  try {
    const bsStats = await db.prepare(
      `SELECT
         COUNT(*) as total,
         SUM(CASE WHEN status IN ('submitted','processing','scan_uploaded','paper_received','paper_incomplete','paper_complete','pending') THEN 1 ELSE 0 END) as pending,
         COALESCE(SUM(CASE WHEN reimbursed_amount IS NOT NULL THEN reimbursed_amount ELSE 0 END), 0) as reimbursed
       FROM bulletins_soins
       WHERE adherent_id IN (SELECT id FROM adherents WHERE company_id = ? AND (deleted_at IS NULL OR deleted_at = ''))`
    ).bind(id).first<{ total: number; pending: number; reimbursed: number }>();
    totalBulletins = Number(bsStats?.total) || 0;
    pendingBulletins = Number(bsStats?.pending) || 0;
    reimbursedBulletins = Number(bsStats?.reimbursed) || 0;
  } catch { /* bulletins_soins table may not exist */ }

  // Claims stats from sante_demandes
  let totalDemandes = 0, pendingDemandes = 0, reimbursedDemandes = 0;
  try {
    const sdStats = await db.prepare(
      `SELECT
         COUNT(*) as total,
         SUM(CASE WHEN statut IN ('soumise','en_examen') THEN 1 ELSE 0 END) as pending,
         COALESCE(SUM(CASE WHEN montant_rembourse IS NOT NULL THEN montant_rembourse ELSE 0 END), 0) as reimbursed
       FROM sante_demandes
       WHERE adherent_id IN (SELECT id FROM adherents WHERE company_id = ? AND (deleted_at IS NULL OR deleted_at = ''))`
    ).bind(id).first<{ total: number; pending: number; reimbursed: number }>();
    totalDemandes = Number(sdStats?.total) || 0;
    pendingDemandes = Number(sdStats?.pending) || 0;
    reimbursedDemandes = Number(sdStats?.reimbursed) || 0;
  } catch { /* sante_demandes table may not exist */ }

  const totalClaims = totalBulletins + totalDemandes;
  const pendingClaims = pendingBulletins + pendingDemandes;
  const totalReimbursed = reimbursedBulletins + reimbursedDemandes;

  return success(c, { totalAdherents, activeContracts, totalClaims, pendingClaims, totalReimbursed });
});

/**
 * GET /api/v1/companies/:id/contracts
 * Get contracts for a company (group contracts linked via adherents)
 */
companies.get('/:id/contracts', requireRole('ADMIN', 'INSURER_ADMIN', 'INSURER_AGENT', 'HR'), async (c) => {
  const id = c.req.param('id');
  const user = c.get('user');

  // HR can only view their own company's contracts
  if (user?.role === 'HR' && user?.companyId !== id) {
    return notFound(c, 'Entreprise non trouvee');
  }

  try {
    const { results } = await getDb(c).prepare(
      `SELECT gc.id, gc.contract_number, gc.contract_type as type,
              gc.effective_date as start_date, gc.end_date, gc.status,
              i.name as insurer_name,
              (SELECT COUNT(*) FROM adherents a WHERE a.company_id = ?1 AND a.deleted_at IS NULL) as employee_count,
              gc.annual_global_limit,
              gc.plan_category
       FROM group_contracts gc
       LEFT JOIN insurers i ON gc.insurer_id = i.id
       WHERE gc.company_id = ?1 AND gc.deleted_at IS NULL
       ORDER BY gc.created_at DESC`
    )
      .bind(id)
      .all();

    const mapped = (results || []).map((r: Record<string, unknown>) => ({
      ...r,
      status: r.status === 'active' && r.end_date && (r.end_date as string) < new Date().toISOString().split('T')[0] ? 'expired' : r.status,
    }));
    return success(c, mapped);
  } catch {
    // Table may not exist or query fails — return empty
    return success(c, []);
  }
});

/**
 * GET /api/v1/companies/:id/claims
 * Get claims/PEC for a company's adherents
 */
companies.get('/:id/claims', requireRole('ADMIN', 'INSURER_ADMIN', 'INSURER_AGENT', 'HR'), async (c) => {
  const id = c.req.param('id');
  const user = c.get('user');

  // HR can only view their own company's claims
  if (user?.role === 'HR' && user?.companyId !== id) {
    return notFound(c, 'Entreprise non trouvee');
  }

  try {
    // Combine bulletins_soins and sante_demandes for the company
    const [bulletinsResult, demandesResult] = await Promise.all([
      getDb(c).prepare(
        `SELECT bs.id, bs.bulletin_number as reference,
                a.first_name || ' ' || a.last_name as adherent_name,
                bs.adherent_id,
                COALESCE(bs.care_type, '') as type,
                COALESCE(bs.provider_name, '') as provider_name,
                COALESCE(bs.total_amount, 0) as amount,
                COALESCE(bs.reimbursed_amount, 0) as covered_amount,
                CASE bs.status
                  WHEN 'approved' THEN 'APPROVED'
                  WHEN 'paid' THEN 'PAID'
                  WHEN 'rejected' THEN 'REJECTED'
                  ELSE 'PENDING'
                END as status,
                bs.created_at,
                bs.approved_date as processed_at
         FROM bulletins_soins bs
         LEFT JOIN adherents a ON bs.adherent_id = a.id
         WHERE a.company_id = ? AND a.deleted_at IS NULL
         ORDER BY bs.created_at DESC
         LIMIT 100`
      ).bind(id).all().catch(() => ({ results: [] })),
      getDb(c).prepare(
        `SELECT sd.id, sd.numero_demande as reference,
                a.first_name || ' ' || a.last_name as adherent_name,
                sd.adherent_id,
                sd.type_soin as type,
                COALESCE(sp.nom, '') as provider_name,
                COALESCE(sd.montant_demande, 0) as amount,
                COALESCE(sd.montant_rembourse, 0) as covered_amount,
                CASE sd.statut
                  WHEN 'soumise' THEN 'PENDING'
                  WHEN 'en_examen' THEN 'PENDING'
                  WHEN 'approuvee' THEN 'APPROVED'
                  WHEN 'payee' THEN 'PAID'
                  WHEN 'rejetee' THEN 'REJECTED'
                  ELSE 'PENDING'
                END as status,
                sd.created_at,
                sd.updated_at as processed_at
         FROM sante_demandes sd
         LEFT JOIN adherents a ON sd.adherent_id = a.id
         LEFT JOIN sante_praticiens sp ON sd.praticien_id = sp.id
         WHERE a.company_id = ? AND a.deleted_at IS NULL
         ORDER BY sd.created_at DESC
         LIMIT 100`
      ).bind(id).all().catch(() => ({ results: [] })),
    ]);

    // Merge and sort by created_at desc
    const allClaims = [
      ...(bulletinsResult.results ?? []),
      ...(demandesResult.results ?? []),
    ].sort((a: Record<string, unknown>, b: Record<string, unknown>) =>
      String(b.created_at || '').localeCompare(String(a.created_at || ''))
    ).slice(0, 100);

    return success(c, allClaims);
  } catch {
    // Table may not exist — return empty
    return success(c, []);
  }
});

export { companies };
