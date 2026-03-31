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
  type_assureur: string | null;
  matricule_fiscal: string | null;
  matricule_valide: number;
  date_debut_convention: string | null;
  date_fin_convention: string | null;
  taux_couverture: number | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

function isConventionExpiringSoon(dateFinConvention: string | null): boolean {
  if (!dateFinConvention) return false;
  const fin = new Date(dateFinConvention);
  const dans30j = new Date();
  dans30j.setDate(dans30j.getDate() + 30);
  return fin <= dans30j && fin >= new Date();
}

function rowToInsurer(row: InsurerRow): Insurer {
  const typeAssureur = (row.type_assureur || 'autre') as Insurer['typeAssureur'];
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
    typeAssureur,
    matriculeFiscal: row.matricule_fiscal,
    matriculeValide: row.matricule_valide === 1,
    dateDebutConvention: row.date_debut_convention,
    dateFinConvention: row.date_fin_convention,
    tauxCouverture: row.taux_couverture,
    conventionExpireBientot: isConventionExpiringSoon(row.date_fin_convention),
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
  options: { isActive?: boolean; search?: string; typeAssureur?: string; page?: number; limit?: number } = {}
): Promise<{ data: Insurer[]; total: number }> {
  const { isActive, search, typeAssureur, page = 1, limit = 20 } = options;
  const offset = (page - 1) * limit;

  let whereClause = 'deleted_at IS NULL';
  const params: unknown[] = [];

  if (isActive !== undefined) {
    whereClause += ' AND is_active = ?';
    params.push(isActive ? 1 : 0);
  }

  if (search) {
    whereClause += ' AND (name LIKE ? OR code LIKE ? OR matricule_fiscal LIKE ?)';
    params.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }

  if (typeAssureur) {
    whereClause += ' AND type_assureur = ?';
    params.push(typeAssureur);
  }

  const countResult = await db
    .prepare(`SELECT COUNT(*) as count FROM insurers WHERE ${whereClause}`)
    .bind(...params)
    .first<{ count: number }>();

  const { results } = await db
    .prepare(`SELECT * FROM insurers WHERE ${whereClause} ORDER BY name ASC LIMIT ? OFFSET ?`)
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
      `INSERT INTO insurers (id, name, code, tax_id, address, phone, email, config_json, is_active,
       type_assureur, matricule_fiscal, matricule_valide, date_debut_convention, date_fin_convention, taux_couverture,
       created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?)`
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
      data.typeAssureur ?? 'autre',
      data.matriculeFiscal ?? null,
      data.matriculeFiscal ? 1 : 0,
      data.dateDebutConvention ?? null,
      data.dateFinConvention ?? null,
      data.tauxCouverture ?? null,
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
  if (data.typeAssureur !== undefined) {
    updates.push('type_assureur = ?');
    params.push(data.typeAssureur);
  }
  if (data.matriculeFiscal !== undefined) {
    updates.push('matricule_fiscal = ?');
    params.push(data.matriculeFiscal || null);
  }
  if ('matriculeValide' in (data as Record<string, unknown>)) {
    updates.push('matricule_valide = ?');
    params.push((data as Record<string, unknown>).matriculeValide ? 1 : 0);
  }
  if (data.dateDebutConvention !== undefined) {
    updates.push('date_debut_convention = ?');
    params.push(data.dateDebutConvention || null);
  }
  if (data.dateFinConvention !== undefined) {
    updates.push('date_fin_convention = ?');
    params.push(data.dateFinConvention || null);
  }
  if (data.tauxCouverture !== undefined) {
    updates.push('taux_couverture = ?');
    params.push(data.tauxCouverture);
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
    .prepare(
      'UPDATE insurers SET deleted_at = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL'
    )
    .bind(new Date().toISOString(), new Date().toISOString(), id)
    .run();

  return result.meta.changes > 0;
}
