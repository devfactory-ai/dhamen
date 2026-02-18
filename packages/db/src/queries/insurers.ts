import type { Insurer, InsurerConfig, InsurerCreate, InsurerUpdate } from '@dhamen/shared';

type D1Database = {
  prepare(query: string): D1PreparedStatement;
};

type D1PreparedStatement = {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T>(): Promise<T | null>;
  all<T>(): Promise<{ results: T[] }>;
  run(): Promise<{ success: boolean; meta: { changes: number } }>;
};

interface InsurerRow {
  id: string;
  name: string;
  code: string;
  tax_id: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  config_json: string;
  is_active: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

function rowToInsurer(row: InsurerRow): Insurer {
  return {
    id: row.id,
    name: row.name,
    code: row.code,
    taxId: row.tax_id,
    address: row.address,
    phone: row.phone,
    email: row.email,
    configJson: JSON.parse(row.config_json) as InsurerConfig,
    isActive: row.is_active === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
  };
}

export async function findInsurerById(db: D1Database, id: string): Promise<Insurer | null> {
  const row = await db
    .prepare('SELECT * FROM insurers WHERE id = ? AND deleted_at IS NULL')
    .bind(id)
    .first<InsurerRow>();

  return row ? rowToInsurer(row) : null;
}

export async function findInsurerByCode(db: D1Database, code: string): Promise<Insurer | null> {
  const row = await db
    .prepare('SELECT * FROM insurers WHERE code = ? AND deleted_at IS NULL')
    .bind(code)
    .first<InsurerRow>();

  return row ? rowToInsurer(row) : null;
}

export async function listInsurers(
  db: D1Database,
  options: { isActive?: boolean; search?: string; page?: number; limit?: number } = {}
): Promise<{ data: Insurer[]; total: number }> {
  const { isActive, search, page = 1, limit = 20 } = options;
  const offset = (page - 1) * limit;

  let whereClause = 'deleted_at IS NULL';
  const params: unknown[] = [];

  if (isActive !== undefined) {
    whereClause += ' AND is_active = ?';
    params.push(isActive ? 1 : 0);
  }

  if (search) {
    whereClause += ' AND (name LIKE ? OR code LIKE ?)';
    params.push(`%${search}%`, `%${search}%`);
  }

  const countResult = await db
    .prepare(`SELECT COUNT(*) as count FROM insurers WHERE ${whereClause}`)
    .bind(...params)
    .first<{ count: number }>();

  const { results } = await db
    .prepare(
      `SELECT * FROM insurers WHERE ${whereClause} ORDER BY name ASC LIMIT ? OFFSET ?`
    )
    .bind(...params, limit, offset)
    .all<InsurerRow>();

  return {
    data: results.map(rowToInsurer),
    total: countResult?.count ?? 0,
  };
}

export async function createInsurer(
  db: D1Database,
  id: string,
  data: InsurerCreate
): Promise<Insurer> {
  const defaultConfig: InsurerConfig = {
    reconciliation: {
      cycle: 'monthly',
      dayOfMonth: 1,
      retentionRate: 0.02,
      autoGenerate: true,
      pdfTemplate: 'standard',
    },
    fraudThresholds: {
      reviewThreshold: 31,
      blockThreshold: 71,
    },
    defaultReimbursementRate: 0.8,
  };

  const config = { ...defaultConfig, ...data.config };
  const now = new Date().toISOString();

  await db
    .prepare(
      `INSERT INTO insurers (id, name, code, tax_id, address, phone, email, config_json, is_active, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`
    )
    .bind(
      id,
      data.name,
      data.code,
      data.taxId ?? null,
      data.address ?? null,
      data.phone ?? null,
      data.email ?? null,
      JSON.stringify(config),
      now,
      now
    )
    .run();

  const insurer = await findInsurerById(db, id);
  if (!insurer) {
    throw new Error('Failed to create insurer');
  }
  return insurer;
}

export async function updateInsurer(
  db: D1Database,
  id: string,
  data: InsurerUpdate
): Promise<Insurer | null> {
  const existing = await findInsurerById(db, id);
  if (!existing) {
    return null;
  }

  const updates: string[] = [];
  const params: unknown[] = [];

  if (data.name !== undefined) {
    updates.push('name = ?');
    params.push(data.name);
  }
  if (data.taxId !== undefined) {
    updates.push('tax_id = ?');
    params.push(data.taxId);
  }
  if (data.address !== undefined) {
    updates.push('address = ?');
    params.push(data.address);
  }
  if (data.phone !== undefined) {
    updates.push('phone = ?');
    params.push(data.phone);
  }
  if (data.email !== undefined) {
    updates.push('email = ?');
    params.push(data.email);
  }
  if (data.config !== undefined) {
    const newConfig = { ...existing.configJson, ...data.config };
    updates.push('config_json = ?');
    params.push(JSON.stringify(newConfig));
  }
  if (data.isActive !== undefined) {
    updates.push('is_active = ?');
    params.push(data.isActive ? 1 : 0);
  }

  if (updates.length === 0) {
    return existing;
  }

  updates.push('updated_at = ?');
  params.push(new Date().toISOString());
  params.push(id);

  await db
    .prepare(`UPDATE insurers SET ${updates.join(', ')} WHERE id = ?`)
    .bind(...params)
    .run();

  return findInsurerById(db, id);
}

export async function softDeleteInsurer(db: D1Database, id: string): Promise<boolean> {
  const result = await db
    .prepare('UPDATE insurers SET deleted_at = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL')
    .bind(new Date().toISOString(), new Date().toISOString(), id)
    .run();

  return result.meta.changes > 0;
}
