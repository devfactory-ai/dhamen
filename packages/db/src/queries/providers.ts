import type { Provider, ProviderCreate, ProviderType, ProviderUpdate } from '@dhamen/shared';

type D1Database = {
  prepare(query: string): D1PreparedStatement;
};

type D1PreparedStatement = {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T>(): Promise<T | null>;
  all<T>(): Promise<{ results: T[] }>;
  run(): Promise<{ success: boolean; meta: { changes: number } }>;
};

interface ProviderRow {
  id: string;
  type: ProviderType;
  name: string;
  license_no: string;
  speciality: string | null;
  address: string;
  city: string;
  lat: number | null;
  lng: number | null;
  phone: string | null;
  email: string | null;
  is_active: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

function rowToProvider(row: ProviderRow): Provider {
  return {
    id: row.id,
    type: row.type,
    name: row.name,
    licenseNo: row.license_no,
    speciality: row.speciality,
    address: row.address,
    city: row.city,
    lat: row.lat,
    lng: row.lng,
    phone: row.phone,
    email: row.email,
    isActive: row.is_active === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
  };
}

export async function findProviderById(db: D1Database, id: string): Promise<Provider | null> {
  const row = await db
    .prepare('SELECT * FROM providers WHERE id = ? AND deleted_at IS NULL')
    .bind(id)
    .first<ProviderRow>();

  return row ? rowToProvider(row) : null;
}

export async function findProviderByLicense(
  db: D1Database,
  licenseNo: string
): Promise<Provider | null> {
  const row = await db
    .prepare('SELECT * FROM providers WHERE license_no = ? AND deleted_at IS NULL')
    .bind(licenseNo)
    .first<ProviderRow>();

  return row ? rowToProvider(row) : null;
}

export async function listProviders(
  db: D1Database,
  options: {
    type?: ProviderType;
    city?: string;
    isActive?: boolean;
    search?: string;
    page?: number;
    limit?: number;
  } = {}
): Promise<{ data: Provider[]; total: number }> {
  const { type, city, isActive, search, page = 1, limit = 20 } = options;
  const offset = (page - 1) * limit;

  let whereClause = 'deleted_at IS NULL';
  const params: unknown[] = [];

  if (type) {
    whereClause += ' AND type = ?';
    params.push(type);
  }
  if (city) {
    whereClause += ' AND city = ?';
    params.push(city);
  }
  if (isActive !== undefined) {
    whereClause += ' AND is_active = ?';
    params.push(isActive ? 1 : 0);
  }
  if (search) {
    whereClause += ' AND (name LIKE ? OR license_no LIKE ?)';
    params.push(`%${search}%`, `%${search}%`);
  }

  const countResult = await db
    .prepare(`SELECT COUNT(*) as count FROM providers WHERE ${whereClause}`)
    .bind(...params)
    .first<{ count: number }>();

  const { results } = await db
    .prepare(
      `SELECT * FROM providers WHERE ${whereClause} ORDER BY name ASC LIMIT ? OFFSET ?`
    )
    .bind(...params, limit, offset)
    .all<ProviderRow>();

  return {
    data: results.map(rowToProvider),
    total: countResult?.count ?? 0,
  };
}

export async function createProvider(
  db: D1Database,
  id: string,
  data: ProviderCreate
): Promise<Provider> {
  const now = new Date().toISOString();

  await db
    .prepare(
      `INSERT INTO providers (id, type, name, license_no, speciality, address, city, lat, lng, phone, email, is_active, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`
    )
    .bind(
      id,
      data.type,
      data.name,
      data.licenseNo,
      data.speciality ?? null,
      data.address,
      data.city,
      data.lat ?? null,
      data.lng ?? null,
      data.phone ?? null,
      data.email ?? null,
      now,
      now
    )
    .run();

  const provider = await findProviderById(db, id);
  if (!provider) {
    throw new Error('Failed to create provider');
  }
  return provider;
}

export async function updateProvider(
  db: D1Database,
  id: string,
  data: ProviderUpdate
): Promise<Provider | null> {
  const existing = await findProviderById(db, id);
  if (!existing) {
    return null;
  }

  const updates: string[] = [];
  const params: unknown[] = [];

  if (data.name !== undefined) {
    updates.push('name = ?');
    params.push(data.name);
  }
  if (data.speciality !== undefined) {
    updates.push('speciality = ?');
    params.push(data.speciality);
  }
  if (data.address !== undefined) {
    updates.push('address = ?');
    params.push(data.address);
  }
  if (data.city !== undefined) {
    updates.push('city = ?');
    params.push(data.city);
  }
  if (data.lat !== undefined) {
    updates.push('lat = ?');
    params.push(data.lat);
  }
  if (data.lng !== undefined) {
    updates.push('lng = ?');
    params.push(data.lng);
  }
  if (data.phone !== undefined) {
    updates.push('phone = ?');
    params.push(data.phone);
  }
  if (data.email !== undefined) {
    updates.push('email = ?');
    params.push(data.email);
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
    .prepare(`UPDATE providers SET ${updates.join(', ')} WHERE id = ?`)
    .bind(...params)
    .run();

  return findProviderById(db, id);
}

export async function softDeleteProvider(db: D1Database, id: string): Promise<boolean> {
  const result = await db
    .prepare(
      'UPDATE providers SET deleted_at = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL'
    )
    .bind(new Date().toISOString(), new Date().toISOString(), id)
    .run();

  return result.meta.changes > 0;
}
