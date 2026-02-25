import type { D1Database } from '@cloudflare/workers-types';

/**
 * Bareme (tariff) types
 */
export interface Bareme {
  id: string;
  insurerId: string;
  careType: 'PHARMACY' | 'CONSULTATION' | 'HOSPITALIZATION' | 'LAB';
  providerType: string | null;
  actCode: string | null;
  planType: string | null;
  baseAmount: number;
  coveredPercent: number;
  maxAmount: number | null;
  effectiveFrom: string;
  effectiveTo: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface BaremeFilters {
  insurerId?: string;
  careType?: string;
  providerType?: string;
  actCode?: string;
  planType?: string;
  isActive?: boolean;
  effectiveDate?: string;
}

interface BaremeRow {
  id: string;
  insurer_id: string;
  care_type: string;
  provider_type: string | null;
  act_code: string | null;
  plan_type: string | null;
  base_amount: number;
  covered_percent: number;
  max_amount: number | null;
  effective_from: string;
  effective_to: string | null;
  is_active: number;
  created_at: string;
  updated_at: string;
}

function rowToBareme(row: BaremeRow): Bareme {
  return {
    id: row.id,
    insurerId: row.insurer_id,
    careType: row.care_type as Bareme['careType'],
    providerType: row.provider_type,
    actCode: row.act_code,
    planType: row.plan_type,
    baseAmount: row.base_amount,
    coveredPercent: row.covered_percent,
    maxAmount: row.max_amount,
    effectiveFrom: row.effective_from,
    effectiveTo: row.effective_to,
    isActive: Boolean(row.is_active),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Find a specific bareme by ID
 */
export async function findBaremeById(db: D1Database, id: string): Promise<Bareme | null> {
  const row = await db
    .prepare('SELECT * FROM baremes WHERE id = ?')
    .bind(id)
    .first<BaremeRow>();

  return row ? rowToBareme(row) : null;
}

/**
 * Find applicable bareme for a specific care type, plan, and date
 */
export async function findApplicableBareme(
  db: D1Database,
  insurerId: string,
  careType: string,
  options: {
    providerType?: string;
    actCode?: string;
    planType?: string;
    date?: string;
  } = {}
): Promise<Bareme | null> {
  const { providerType, actCode, planType, date = new Date().toISOString().split('T')[0] } = options;

  // Build query to find the most specific matching bareme
  // Priority: exact act_code match > provider_type match > general
  const query = `
    SELECT * FROM baremes
    WHERE insurer_id = ?
      AND care_type = ?
      AND is_active = 1
      AND effective_from <= ?
      AND (effective_to IS NULL OR effective_to >= ?)
      AND (plan_type IS NULL OR plan_type = ?)
      AND (provider_type IS NULL OR provider_type = ?)
      AND (act_code IS NULL OR act_code = ?)
    ORDER BY
      CASE WHEN act_code = ? THEN 0 ELSE 1 END,
      CASE WHEN provider_type = ? THEN 0 ELSE 1 END,
      CASE WHEN plan_type = ? THEN 0 ELSE 1 END,
      effective_from DESC
    LIMIT 1
  `;

  const row = await db
    .prepare(query)
    .bind(
      insurerId,
      careType,
      date,
      date,
      planType || null,
      providerType || null,
      actCode || null,
      actCode || '',
      providerType || '',
      planType || ''
    )
    .first<BaremeRow>();

  return row ? rowToBareme(row) : null;
}

/**
 * List baremes with filters
 */
export async function listBaremes(
  db: D1Database,
  filters: BaremeFilters = {},
  pagination: { page: number; limit: number } = { page: 1, limit: 20 }
): Promise<{ baremes: Bareme[]; total: number }> {
  const { page, limit } = pagination;
  const offset = (page - 1) * limit;

  let whereClause = 'WHERE 1=1';
  const params: (string | number)[] = [];

  if (filters.insurerId) {
    whereClause += ' AND insurer_id = ?';
    params.push(filters.insurerId);
  }
  if (filters.careType) {
    whereClause += ' AND care_type = ?';
    params.push(filters.careType);
  }
  if (filters.providerType) {
    whereClause += ' AND provider_type = ?';
    params.push(filters.providerType);
  }
  if (filters.actCode) {
    whereClause += ' AND act_code = ?';
    params.push(filters.actCode);
  }
  if (filters.planType) {
    whereClause += ' AND plan_type = ?';
    params.push(filters.planType);
  }
  if (filters.isActive !== undefined) {
    whereClause += ' AND is_active = ?';
    params.push(filters.isActive ? 1 : 0);
  }
  if (filters.effectiveDate) {
    whereClause += ' AND effective_from <= ? AND (effective_to IS NULL OR effective_to >= ?)';
    params.push(filters.effectiveDate, filters.effectiveDate);
  }

  const countResult = await db
    .prepare(`SELECT COUNT(*) as total FROM baremes ${whereClause}`)
    .bind(...params)
    .first<{ total: number }>();

  const rows = await db
    .prepare(`SELECT * FROM baremes ${whereClause} ORDER BY effective_from DESC LIMIT ? OFFSET ?`)
    .bind(...params, limit, offset)
    .all<BaremeRow>();

  return {
    baremes: (rows.results || []).map(rowToBareme),
    total: countResult?.total || 0,
  };
}

/**
 * Create a new bareme
 */
export async function createBareme(
  db: D1Database,
  data: {
    id: string;
    insurerId: string;
    careType: string;
    providerType?: string;
    actCode?: string;
    planType?: string;
    baseAmount: number;
    coveredPercent: number;
    maxAmount?: number;
    effectiveFrom: string;
    effectiveTo?: string;
  }
): Promise<Bareme> {
  await db
    .prepare(`
      INSERT INTO baremes (
        id, insurer_id, care_type, provider_type, act_code, plan_type,
        base_amount, covered_percent, max_amount, effective_from, effective_to,
        is_active, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, datetime('now'), datetime('now'))
    `)
    .bind(
      data.id,
      data.insurerId,
      data.careType,
      data.providerType || null,
      data.actCode || null,
      data.planType || null,
      data.baseAmount,
      data.coveredPercent,
      data.maxAmount || null,
      data.effectiveFrom,
      data.effectiveTo || null
    )
    .run();

  const created = await findBaremeById(db, data.id);
  if (!created) {
    throw new Error('Failed to create bareme');
  }
  return created;
}

/**
 * Update a bareme
 */
export async function updateBareme(
  db: D1Database,
  id: string,
  data: Partial<{
    baseAmount: number;
    coveredPercent: number;
    maxAmount: number | null;
    effectiveTo: string | null;
    isActive: boolean;
  }>
): Promise<Bareme | null> {
  const updates: string[] = [];
  const params: (string | number | null)[] = [];

  if (data.baseAmount !== undefined) {
    updates.push('base_amount = ?');
    params.push(data.baseAmount);
  }
  if (data.coveredPercent !== undefined) {
    updates.push('covered_percent = ?');
    params.push(data.coveredPercent);
  }
  if (data.maxAmount !== undefined) {
    updates.push('max_amount = ?');
    params.push(data.maxAmount);
  }
  if (data.effectiveTo !== undefined) {
    updates.push('effective_to = ?');
    params.push(data.effectiveTo);
  }
  if (data.isActive !== undefined) {
    updates.push('is_active = ?');
    params.push(data.isActive ? 1 : 0);
  }

  if (updates.length === 0) {
    return findBaremeById(db, id);
  }

  updates.push("updated_at = datetime('now')");
  params.push(id);

  await db
    .prepare(`UPDATE baremes SET ${updates.join(', ')} WHERE id = ?`)
    .bind(...params)
    .run();

  return findBaremeById(db, id);
}
