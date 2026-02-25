import type { D1Database } from '@cloudflare/workers-types';

/**
 * Get effective date with default to today
 */
function getEffectiveDate(date: string | undefined): string {
  if (date !== undefined) {
    return date;
  }
  // toISOString always returns format "YYYY-MM-DDTHH:mm:ss.sssZ"
  // so split('T')[0] is always defined
  const today = new Date().toISOString().split('T')[0] as string;
  return today;
}

/**
 * Care coverage rule types
 */
export interface CareCoverageRule {
  id: string;
  insurerId: string;
  careType: 'PHARMACY' | 'CONSULTATION' | 'HOSPITALIZATION' | 'LAB';
  planType: string;
  isEnabled: boolean;
  coveredPercent: number;
  annualLimit: number | null;
  perEventLimit: number | null;
  waitingPeriodDays: number;
  requiresPreApproval: boolean;
  minAge: number | null;
  maxAge: number | null;
  effectiveFrom: string;
  effectiveTo: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CoverageRuleFilters {
  insurerId?: string;
  careType?: string;
  planType?: string;
  isEnabled?: boolean;
  isActive?: boolean;
  effectiveDate?: string;
}

interface CoverageRuleRow {
  id: string;
  insurer_id: string;
  care_type: string;
  plan_type: string;
  is_enabled: number;
  covered_percent: number;
  annual_limit: number | null;
  per_event_limit: number | null;
  waiting_period_days: number;
  requires_pre_approval: number;
  min_age: number | null;
  max_age: number | null;
  effective_from: string;
  effective_to: string | null;
  is_active: number;
  created_at: string;
  updated_at: string;
}

function rowToRule(row: CoverageRuleRow): CareCoverageRule {
  return {
    id: row.id,
    insurerId: row.insurer_id,
    careType: row.care_type as CareCoverageRule['careType'],
    planType: row.plan_type,
    isEnabled: Boolean(row.is_enabled),
    coveredPercent: row.covered_percent,
    annualLimit: row.annual_limit,
    perEventLimit: row.per_event_limit,
    waitingPeriodDays: row.waiting_period_days,
    requiresPreApproval: Boolean(row.requires_pre_approval),
    minAge: row.min_age,
    maxAge: row.max_age,
    effectiveFrom: row.effective_from,
    effectiveTo: row.effective_to,
    isActive: Boolean(row.is_active),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Find a specific coverage rule by ID
 */
export async function findCoverageRuleById(db: D1Database, id: string): Promise<CareCoverageRule | null> {
  const row = await db
    .prepare('SELECT * FROM care_coverage_rules WHERE id = ?')
    .bind(id)
    .first<CoverageRuleRow>();

  return row ? rowToRule(row) : null;
}

/**
 * Find applicable coverage rule for eligibility check
 */
export async function findApplicableCoverageRule(
  db: D1Database,
  insurerId: string,
  careType: string,
  planType: string,
  options: {
    adherentAge?: number;
    date?: string;
  } = {}
): Promise<CareCoverageRule | null> {
  const adherentAge = options.adherentAge;
  const effectiveDate = getEffectiveDate(options.date);

  let query = `
    SELECT * FROM care_coverage_rules
    WHERE insurer_id = ?
      AND care_type = ?
      AND plan_type = ?
      AND is_active = 1
      AND is_enabled = 1
      AND effective_from <= ?
      AND (effective_to IS NULL OR effective_to >= ?)
  `;

  const params: (string | number)[] = [insurerId, careType, planType, effectiveDate, effectiveDate];

  // Add age filter if provided
  if (adherentAge !== undefined) {
    query += ' AND (min_age IS NULL OR min_age <= ?)';
    query += ' AND (max_age IS NULL OR max_age >= ?)';
    params.push(adherentAge, adherentAge);
  }

  query += ' ORDER BY effective_from DESC LIMIT 1';

  const row = await db.prepare(query).bind(...params).first<CoverageRuleRow>();

  return row ? rowToRule(row) : null;
}

/**
 * List coverage rules with filters
 */
export async function listCoverageRules(
  db: D1Database,
  filters: CoverageRuleFilters = {},
  pagination: { page: number; limit: number } = { page: 1, limit: 20 }
): Promise<{ rules: CareCoverageRule[]; total: number }> {
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
  if (filters.planType) {
    whereClause += ' AND plan_type = ?';
    params.push(filters.planType);
  }
  if (filters.isEnabled !== undefined) {
    whereClause += ' AND is_enabled = ?';
    params.push(filters.isEnabled ? 1 : 0);
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
    .prepare(`SELECT COUNT(*) as total FROM care_coverage_rules ${whereClause}`)
    .bind(...params)
    .first<{ total: number }>();

  const rows = await db
    .prepare(`SELECT * FROM care_coverage_rules ${whereClause} ORDER BY care_type, plan_type LIMIT ? OFFSET ?`)
    .bind(...params, limit, offset)
    .all<CoverageRuleRow>();

  return {
    rules: (rows.results || []).map(rowToRule),
    total: countResult?.total || 0,
  };
}

/**
 * Create a new coverage rule
 */
export async function createCoverageRule(
  db: D1Database,
  data: {
    id: string;
    insurerId: string;
    careType: string;
    planType: string;
    isEnabled?: boolean;
    coveredPercent: number;
    annualLimit?: number;
    perEventLimit?: number;
    waitingPeriodDays?: number;
    requiresPreApproval?: boolean;
    minAge?: number;
    maxAge?: number;
    effectiveFrom: string;
    effectiveTo?: string;
  }
): Promise<CareCoverageRule> {
  await db
    .prepare(`
      INSERT INTO care_coverage_rules (
        id, insurer_id, care_type, plan_type, is_enabled, covered_percent,
        annual_limit, per_event_limit, waiting_period_days, requires_pre_approval,
        min_age, max_age, effective_from, effective_to, is_active,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, datetime('now'), datetime('now'))
    `)
    .bind(
      data.id,
      data.insurerId,
      data.careType,
      data.planType,
      data.isEnabled !== false ? 1 : 0,
      data.coveredPercent,
      data.annualLimit || null,
      data.perEventLimit || null,
      data.waitingPeriodDays || 0,
      data.requiresPreApproval ? 1 : 0,
      data.minAge || null,
      data.maxAge || null,
      data.effectiveFrom,
      data.effectiveTo || null
    )
    .run();

  const created = await findCoverageRuleById(db, data.id);
  if (!created) {
    throw new Error('Failed to create coverage rule');
  }
  return created;
}

/**
 * Update a coverage rule
 */
export async function updateCoverageRule(
  db: D1Database,
  id: string,
  data: Partial<{
    isEnabled: boolean;
    coveredPercent: number;
    annualLimit: number | null;
    perEventLimit: number | null;
    waitingPeriodDays: number;
    requiresPreApproval: boolean;
    effectiveTo: string | null;
    isActive: boolean;
  }>
): Promise<CareCoverageRule | null> {
  const updates: string[] = [];
  const params: (string | number | null)[] = [];

  if (data.isEnabled !== undefined) {
    updates.push('is_enabled = ?');
    params.push(data.isEnabled ? 1 : 0);
  }
  if (data.coveredPercent !== undefined) {
    updates.push('covered_percent = ?');
    params.push(data.coveredPercent);
  }
  if (data.annualLimit !== undefined) {
    updates.push('annual_limit = ?');
    params.push(data.annualLimit);
  }
  if (data.perEventLimit !== undefined) {
    updates.push('per_event_limit = ?');
    params.push(data.perEventLimit);
  }
  if (data.waitingPeriodDays !== undefined) {
    updates.push('waiting_period_days = ?');
    params.push(data.waitingPeriodDays);
  }
  if (data.requiresPreApproval !== undefined) {
    updates.push('requires_pre_approval = ?');
    params.push(data.requiresPreApproval ? 1 : 0);
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
    return findCoverageRuleById(db, id);
  }

  updates.push("updated_at = datetime('now')");
  params.push(id);

  await db
    .prepare(`UPDATE care_coverage_rules SET ${updates.join(', ')} WHERE id = ?`)
    .bind(...params)
    .run();

  return findCoverageRuleById(db, id);
}
