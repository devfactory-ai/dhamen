import type { D1Database } from '@cloudflare/workers-types';

/**
 * Fraud rule configuration types
 */
export interface FraudRule {
  id: string;
  insurerId: string | null; // null = global rule
  ruleCode: string;
  ruleType: 'FREQUENCY' | 'AMOUNT' | 'PATTERN' | 'DUPLICATE' | 'TIME' | 'DRUG_INTERACTION';
  careType: string | null; // null = applies to all care types
  name: string;
  description: string | null;
  configJson: string;
  weight: number;
  threshold: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface FraudRuleConfig {
  // Frequency rules
  maxClaimsPerDay?: number;
  maxClaimsPerWeek?: number;
  maxClaimsPerMonth?: number;

  // Amount rules
  maxAmountPerClaim?: number;
  maxAmountPerDay?: number;
  unusualAmountMultiplier?: number;

  // Time rules
  suspiciousHoursStart?: number;
  suspiciousHoursEnd?: number;

  // Pattern rules
  minClaimsForPattern?: number;
  patternWindowDays?: number;

  // Drug rules
  incompatibleDrugCodes?: string[];
}

export interface FraudRuleFilters {
  insurerId?: string | null;
  ruleType?: string;
  careType?: string | null;
  isActive?: boolean;
  ruleCode?: string;
}

interface FraudRuleRow {
  id: string;
  insurer_id: string | null;
  rule_code: string;
  rule_type: string;
  care_type: string | null;
  name: string;
  description: string | null;
  config_json: string;
  weight: number;
  threshold: number;
  is_active: number;
  created_at: string;
  updated_at: string;
}

function rowToRule(row: FraudRuleRow): FraudRule {
  return {
    id: row.id,
    insurerId: row.insurer_id,
    ruleCode: row.rule_code,
    ruleType: row.rule_type as FraudRule['ruleType'],
    careType: row.care_type,
    name: row.name,
    description: row.description,
    configJson: row.config_json,
    weight: row.weight,
    threshold: row.threshold,
    isActive: Boolean(row.is_active),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Parse fraud rule config JSON safely
 */
export function parseRuleConfig(configJson: string): FraudRuleConfig {
  try {
    return JSON.parse(configJson) as FraudRuleConfig;
  } catch {
    return {};
  }
}

/**
 * Find a specific fraud rule by ID
 */
export async function findFraudRuleById(db: D1Database, id: string): Promise<FraudRule | null> {
  const row = await db
    .prepare('SELECT * FROM fraud_rules_config WHERE id = ?')
    .bind(id)
    .first<FraudRuleRow>();

  return row ? rowToRule(row) : null;
}

/**
 * Find fraud rule by code (for a specific insurer or global)
 */
export async function findFraudRuleByCode(
  db: D1Database,
  ruleCode: string,
  insurerId?: string
): Promise<FraudRule | null> {
  // First try insurer-specific rule, then fall back to global
  const query = `
    SELECT * FROM fraud_rules_config
    WHERE rule_code = ?
      AND is_active = 1
      AND (insurer_id = ? OR insurer_id IS NULL)
    ORDER BY
      CASE WHEN insurer_id = ? THEN 0 ELSE 1 END
    LIMIT 1
  `;

  const row = await db
    .prepare(query)
    .bind(ruleCode, insurerId || null, insurerId || '')
    .first<FraudRuleRow>();

  return row ? rowToRule(row) : null;
}

/**
 * Get all active fraud rules for an insurer (includes global rules)
 */
export async function getActiveFraudRules(
  db: D1Database,
  insurerId: string,
  careType?: string
): Promise<FraudRule[]> {
  let query = `
    SELECT * FROM fraud_rules_config
    WHERE is_active = 1
      AND (insurer_id = ? OR insurer_id IS NULL)
  `;
  const params: (string | null)[] = [insurerId];

  if (careType) {
    query += ' AND (care_type = ? OR care_type IS NULL)';
    params.push(careType);
  }

  query += ' ORDER BY weight DESC, rule_type';

  const rows = await db.prepare(query).bind(...params).all<FraudRuleRow>();

  return (rows.results || []).map(rowToRule);
}

/**
 * List fraud rules with filters
 */
export async function listFraudRules(
  db: D1Database,
  filters: FraudRuleFilters = {},
  pagination: { page: number; limit: number } = { page: 1, limit: 50 }
): Promise<{ rules: FraudRule[]; total: number }> {
  const { page, limit } = pagination;
  const offset = (page - 1) * limit;

  let whereClause = 'WHERE 1=1';
  const params: (string | number | null)[] = [];

  if (filters.insurerId !== undefined) {
    if (filters.insurerId === null) {
      whereClause += ' AND insurer_id IS NULL';
    } else {
      whereClause += ' AND (insurer_id = ? OR insurer_id IS NULL)';
      params.push(filters.insurerId);
    }
  }
  if (filters.ruleType) {
    whereClause += ' AND rule_type = ?';
    params.push(filters.ruleType);
  }
  if (filters.careType !== undefined) {
    if (filters.careType === null) {
      whereClause += ' AND care_type IS NULL';
    } else {
      whereClause += ' AND (care_type = ? OR care_type IS NULL)';
      params.push(filters.careType);
    }
  }
  if (filters.isActive !== undefined) {
    whereClause += ' AND is_active = ?';
    params.push(filters.isActive ? 1 : 0);
  }
  if (filters.ruleCode) {
    whereClause += ' AND rule_code = ?';
    params.push(filters.ruleCode);
  }

  const countResult = await db
    .prepare(`SELECT COUNT(*) as total FROM fraud_rules_config ${whereClause}`)
    .bind(...params)
    .first<{ total: number }>();

  const rows = await db
    .prepare(`SELECT * FROM fraud_rules_config ${whereClause} ORDER BY weight DESC, rule_type LIMIT ? OFFSET ?`)
    .bind(...params, limit, offset)
    .all<FraudRuleRow>();

  return {
    rules: (rows.results || []).map(rowToRule),
    total: countResult?.total || 0,
  };
}

/**
 * Create a new fraud rule
 */
export async function createFraudRule(
  db: D1Database,
  data: {
    id: string;
    insurerId?: string;
    ruleCode: string;
    ruleType: string;
    careType?: string;
    name: string;
    description?: string;
    config: FraudRuleConfig;
    weight?: number;
    threshold?: number;
  }
): Promise<FraudRule> {
  await db
    .prepare(`
      INSERT INTO fraud_rules_config (
        id, insurer_id, rule_code, rule_type, care_type, name, description,
        config_json, weight, threshold, is_active, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, datetime('now'), datetime('now'))
    `)
    .bind(
      data.id,
      data.insurerId || null,
      data.ruleCode,
      data.ruleType,
      data.careType || null,
      data.name,
      data.description || null,
      JSON.stringify(data.config),
      data.weight || 1,
      data.threshold || 50
    )
    .run();

  const created = await findFraudRuleById(db, data.id);
  if (!created) {
    throw new Error('Failed to create fraud rule');
  }
  return created;
}

/**
 * Update a fraud rule
 */
export async function updateFraudRule(
  db: D1Database,
  id: string,
  data: Partial<{
    name: string;
    description: string | null;
    config: FraudRuleConfig;
    weight: number;
    threshold: number;
    isActive: boolean;
  }>
): Promise<FraudRule | null> {
  const updates: string[] = [];
  const params: (string | number | null)[] = [];

  if (data.name !== undefined) {
    updates.push('name = ?');
    params.push(data.name);
  }
  if (data.description !== undefined) {
    updates.push('description = ?');
    params.push(data.description);
  }
  if (data.config !== undefined) {
    updates.push('config_json = ?');
    params.push(JSON.stringify(data.config));
  }
  if (data.weight !== undefined) {
    updates.push('weight = ?');
    params.push(data.weight);
  }
  if (data.threshold !== undefined) {
    updates.push('threshold = ?');
    params.push(data.threshold);
  }
  if (data.isActive !== undefined) {
    updates.push('is_active = ?');
    params.push(data.isActive ? 1 : 0);
  }

  if (updates.length === 0) {
    return findFraudRuleById(db, id);
  }

  updates.push("updated_at = datetime('now')");
  params.push(id);

  await db
    .prepare(`UPDATE fraud_rules_config SET ${updates.join(', ')} WHERE id = ?`)
    .bind(...params)
    .run();

  return findFraudRuleById(db, id);
}
