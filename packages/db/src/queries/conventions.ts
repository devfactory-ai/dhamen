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
 * Convention types
 */
export interface Convention {
  id: string;
  insurerId: string;
  providerId: string;
  startDate: string;
  endDate: string | null;
  baremeJson: string;
  termsJson: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ConventionWithRelations extends Convention {
  insurerName?: string;
  providerName?: string;
  providerType?: string;
}

export interface BaremeConfig {
  pharmacy?: {
    genericDiscount?: number;
    brandDiscount?: number;
    maxPerPrescription?: number;
  };
  consultation?: {
    generalRate?: number;
    specialistRate?: number;
    emergencyRate?: number;
  };
  hospitalization?: {
    dailyRoomRate?: number;
    surgeryRates?: Record<string, number>;
  };
  lab?: {
    standardTests?: number;
    specializedTests?: number;
  };
}

export interface ConventionFilters {
  insurerId?: string;
  providerId?: string;
  isActive?: boolean;
  effectiveDate?: string;
}

interface ConventionRow {
  id: string;
  insurer_id: string;
  provider_id: string;
  start_date: string;
  end_date: string | null;
  bareme_json: string;
  terms_json: string | null;
  is_active: number;
  created_at: string;
  updated_at: string;
  insurer_name?: string;
  provider_name?: string;
  provider_type?: string;
}

function rowToConvention(row: ConventionRow): Convention {
  return {
    id: row.id,
    insurerId: row.insurer_id,
    providerId: row.provider_id,
    startDate: row.start_date,
    endDate: row.end_date,
    baremeJson: row.bareme_json,
    termsJson: row.terms_json,
    isActive: Boolean(row.is_active),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function rowToConventionWithRelations(row: ConventionRow): ConventionWithRelations {
  return {
    ...rowToConvention(row),
    insurerName: row.insurer_name,
    providerName: row.provider_name,
    providerType: row.provider_type,
  };
}

/**
 * Parse bareme config JSON safely
 */
export function parseBaremeConfig(baremeJson: string): BaremeConfig {
  try {
    return JSON.parse(baremeJson) as BaremeConfig;
  } catch {
    return {};
  }
}

/**
 * Find a specific convention by ID
 */
export async function findConventionById(db: D1Database, id: string): Promise<ConventionWithRelations | null> {
  const row = await db
    .prepare(`
      SELECT c.*,
             i.name as insurer_name,
             p.name as provider_name,
             p.type as provider_type
      FROM conventions c
      LEFT JOIN insurers i ON c.insurer_id = i.id
      LEFT JOIN providers p ON c.provider_id = p.id
      WHERE c.id = ?
    `)
    .bind(id)
    .first<ConventionRow>();

  return row ? rowToConventionWithRelations(row) : null;
}

/**
 * Find convention between a specific insurer and provider
 */
export async function findConventionByInsurerAndProvider(
  db: D1Database,
  insurerId: string,
  providerId: string,
  options: { activeOnly?: boolean; date?: string } = {}
): Promise<ConventionWithRelations | null> {
  const activeOnly = options.activeOnly !== false;
  const effectiveDate = getEffectiveDate(options.date);

  let query = `
    SELECT c.*,
           i.name as insurer_name,
           p.name as provider_name,
           p.type as provider_type
    FROM conventions c
    LEFT JOIN insurers i ON c.insurer_id = i.id
    LEFT JOIN providers p ON c.provider_id = p.id
    WHERE c.insurer_id = ? AND c.provider_id = ?
  `;

  const params: string[] = [insurerId, providerId];

  if (activeOnly) {
    query += ' AND c.is_active = 1 AND c.start_date <= ? AND (c.end_date IS NULL OR c.end_date >= ?)';
    params.push(effectiveDate, effectiveDate);
  }

  query += ' ORDER BY c.start_date DESC LIMIT 1';

  const row = await db.prepare(query).bind(...params).first<ConventionRow>();

  return row ? rowToConventionWithRelations(row) : null;
}

/**
 * List conventions with filters
 */
export async function listConventions(
  db: D1Database,
  filters: ConventionFilters = {},
  pagination: { page: number; limit: number } = { page: 1, limit: 20 }
): Promise<{ conventions: ConventionWithRelations[]; total: number }> {
  const { page, limit } = pagination;
  const offset = (page - 1) * limit;

  let whereClause = 'WHERE 1=1';
  const params: (string | number)[] = [];

  if (filters.insurerId) {
    whereClause += ' AND c.insurer_id = ?';
    params.push(filters.insurerId);
  }
  if (filters.providerId) {
    whereClause += ' AND c.provider_id = ?';
    params.push(filters.providerId);
  }
  if (filters.isActive !== undefined) {
    whereClause += ' AND c.is_active = ?';
    params.push(filters.isActive ? 1 : 0);
  }
  if (filters.effectiveDate) {
    whereClause += ' AND c.start_date <= ? AND (c.end_date IS NULL OR c.end_date >= ?)';
    params.push(filters.effectiveDate, filters.effectiveDate);
  }

  const countResult = await db
    .prepare(`SELECT COUNT(*) as total FROM conventions c ${whereClause}`)
    .bind(...params)
    .first<{ total: number }>();

  const rows = await db
    .prepare(`
      SELECT c.*,
             i.name as insurer_name,
             p.name as provider_name,
             p.type as provider_type
      FROM conventions c
      LEFT JOIN insurers i ON c.insurer_id = i.id
      LEFT JOIN providers p ON c.provider_id = p.id
      ${whereClause}
      ORDER BY c.created_at DESC
      LIMIT ? OFFSET ?
    `)
    .bind(...params, limit, offset)
    .all<ConventionRow>();

  return {
    conventions: (rows.results || []).map(rowToConventionWithRelations),
    total: countResult?.total || 0,
  };
}

/**
 * Create a new convention
 */
export async function createConvention(
  db: D1Database,
  data: {
    id: string;
    insurerId: string;
    providerId: string;
    startDate: string;
    endDate?: string;
    bareme: BaremeConfig;
    terms?: Record<string, unknown>;
  }
): Promise<ConventionWithRelations> {
  await db
    .prepare(`
      INSERT INTO conventions (
        id, insurer_id, provider_id, start_date, end_date,
        bareme_json, terms_json, is_active, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 1, datetime('now'), datetime('now'))
    `)
    .bind(
      data.id,
      data.insurerId,
      data.providerId,
      data.startDate,
      data.endDate || null,
      JSON.stringify(data.bareme),
      data.terms ? JSON.stringify(data.terms) : null
    )
    .run();

  const created = await findConventionById(db, data.id);
  if (!created) {
    throw new Error('Failed to create convention');
  }
  return created;
}

/**
 * Update a convention
 */
export async function updateConvention(
  db: D1Database,
  id: string,
  data: Partial<{
    endDate: string | null;
    bareme: BaremeConfig;
    terms: Record<string, unknown> | null;
    isActive: boolean;
  }>
): Promise<ConventionWithRelations | null> {
  const updates: string[] = [];
  const params: (string | number | null)[] = [];

  if (data.endDate !== undefined) {
    updates.push('end_date = ?');
    params.push(data.endDate);
  }
  if (data.bareme !== undefined) {
    updates.push('bareme_json = ?');
    params.push(JSON.stringify(data.bareme));
  }
  if (data.terms !== undefined) {
    updates.push('terms_json = ?');
    params.push(data.terms ? JSON.stringify(data.terms) : null);
  }
  if (data.isActive !== undefined) {
    updates.push('is_active = ?');
    params.push(data.isActive ? 1 : 0);
  }

  if (updates.length === 0) {
    return findConventionById(db, id);
  }

  updates.push("updated_at = datetime('now')");
  params.push(id);

  await db
    .prepare(`UPDATE conventions SET ${updates.join(', ')} WHERE id = ?`)
    .bind(...params)
    .run();

  return findConventionById(db, id);
}

/**
 * Deactivate a convention (soft delete)
 */
export async function deactivateConvention(db: D1Database, id: string): Promise<boolean> {
  const result = await db
    .prepare("UPDATE conventions SET is_active = 0, updated_at = datetime('now') WHERE id = ?")
    .bind(id)
    .run();

  return result.meta.changes > 0;
}
