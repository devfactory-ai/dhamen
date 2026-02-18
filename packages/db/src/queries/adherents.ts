import type { Adherent, AdherentCreate, AdherentUpdate, Gender } from '@dhamen/shared';

type D1Database = {
  prepare(query: string): D1PreparedStatement;
};

type D1PreparedStatement = {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T>(): Promise<T | null>;
  all<T>(): Promise<{ results: T[] }>;
  run(): Promise<{ success: boolean; meta: { changes: number } }>;
};

interface AdherentRow {
  id: string;
  national_id_encrypted: string;
  first_name: string;
  last_name: string;
  date_of_birth: string;
  gender: Gender | null;
  phone_encrypted: string | null;
  email: string | null;
  address: string | null;
  city: string | null;
  lat: number | null;
  lng: number | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

function rowToAdherent(row: AdherentRow): Adherent {
  return {
    id: row.id,
    nationalIdEncrypted: row.national_id_encrypted,
    firstName: row.first_name,
    lastName: row.last_name,
    dateOfBirth: row.date_of_birth,
    gender: row.gender,
    phoneEncrypted: row.phone_encrypted,
    email: row.email,
    address: row.address,
    city: row.city,
    lat: row.lat,
    lng: row.lng,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
  };
}

export async function findAdherentById(db: D1Database, id: string): Promise<Adherent | null> {
  const row = await db
    .prepare('SELECT * FROM adherents WHERE id = ? AND deleted_at IS NULL')
    .bind(id)
    .first<AdherentRow>();

  return row ? rowToAdherent(row) : null;
}

export async function findAdherentByNationalId(
  db: D1Database,
  nationalIdEncrypted: string
): Promise<Adherent | null> {
  const row = await db
    .prepare('SELECT * FROM adherents WHERE national_id_encrypted = ? AND deleted_at IS NULL')
    .bind(nationalIdEncrypted)
    .first<AdherentRow>();

  return row ? rowToAdherent(row) : null;
}

export async function listAdherents(
  db: D1Database,
  options: { city?: string; search?: string; page?: number; limit?: number } = {}
): Promise<{ data: Adherent[]; total: number }> {
  const { city, search, page = 1, limit = 20 } = options;
  const offset = (page - 1) * limit;

  let whereClause = 'deleted_at IS NULL';
  const params: unknown[] = [];

  if (city) {
    whereClause += ' AND city = ?';
    params.push(city);
  }
  if (search) {
    whereClause += ' AND (first_name LIKE ? OR last_name LIKE ? OR email LIKE ?)';
    params.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }

  const countResult = await db
    .prepare(`SELECT COUNT(*) as count FROM adherents WHERE ${whereClause}`)
    .bind(...params)
    .first<{ count: number }>();

  const { results } = await db
    .prepare(
      `SELECT * FROM adherents WHERE ${whereClause} ORDER BY last_name, first_name ASC LIMIT ? OFFSET ?`
    )
    .bind(...params, limit, offset)
    .all<AdherentRow>();

  return {
    data: results.map(rowToAdherent),
    total: countResult?.count ?? 0,
  };
}

export async function createAdherent(
  db: D1Database,
  id: string,
  data: AdherentCreate,
  encryptedNationalId: string,
  encryptedPhone?: string
): Promise<Adherent> {
  const now = new Date().toISOString();

  await db
    .prepare(
      `INSERT INTO adherents (id, national_id_encrypted, first_name, last_name, date_of_birth, gender, phone_encrypted, email, address, city, lat, lng, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      id,
      encryptedNationalId,
      data.firstName,
      data.lastName,
      data.dateOfBirth,
      data.gender ?? null,
      encryptedPhone ?? null,
      data.email ?? null,
      data.address ?? null,
      data.city ?? null,
      data.lat ?? null,
      data.lng ?? null,
      now,
      now
    )
    .run();

  const adherent = await findAdherentById(db, id);
  if (!adherent) {
    throw new Error('Failed to create adherent');
  }
  return adherent;
}

export async function updateAdherent(
  db: D1Database,
  id: string,
  data: AdherentUpdate,
  encryptedPhone?: string
): Promise<Adherent | null> {
  const existing = await findAdherentById(db, id);
  if (!existing) {
    return null;
  }

  const updates: string[] = [];
  const params: unknown[] = [];

  if (data.firstName !== undefined) {
    updates.push('first_name = ?');
    params.push(data.firstName);
  }
  if (data.lastName !== undefined) {
    updates.push('last_name = ?');
    params.push(data.lastName);
  }
  if (encryptedPhone !== undefined) {
    updates.push('phone_encrypted = ?');
    params.push(encryptedPhone);
  }
  if (data.email !== undefined) {
    updates.push('email = ?');
    params.push(data.email);
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

  if (updates.length === 0) {
    return existing;
  }

  updates.push('updated_at = ?');
  params.push(new Date().toISOString());
  params.push(id);

  await db
    .prepare(`UPDATE adherents SET ${updates.join(', ')} WHERE id = ?`)
    .bind(...params)
    .run();

  return findAdherentById(db, id);
}

export async function softDeleteAdherent(db: D1Database, id: string): Promise<boolean> {
  const result = await db
    .prepare(
      'UPDATE adherents SET deleted_at = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL'
    )
    .bind(new Date().toISOString(), new Date().toISOString(), id)
    .run();

  return result.meta.changes > 0;
}
