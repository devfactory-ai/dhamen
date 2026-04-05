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
  // Extended fields
  matricule: string | null;
  plafond_global: number | null;
  plafond_consomme: number | null;
  company_id: string | null;
  company_name: string | null;
  is_active: number | null;
  lieu_naissance: string | null;
  etat_civil: string | null;
  date_mariage: string | null;
  date_debut_adhesion: string | null;
  date_fin_adhesion: string | null;
  rang: number | null;
  postal_code: string | null;
  rue: string | null;
  mobile_encrypted: string | null;
  banque: string | null;
  rib_encrypted: string | null;
  regime_social: string | null;
  handicap: number | null;
  fonction: string | null;
  maladie_chronique: number | null;
  matricule_conjoint: string | null;
  type_piece_identite: string | null;
  date_edition_piece: string | null;
  contre_visite_obligatoire: number | null;
  etat_fiche: string | null;
  credit: number | null;
  contract_number: string | null;
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
    // Extended fields
    matricule: row.matricule,
    plafondGlobal: row.plafond_global,
    plafondConsomme: row.plafond_consomme,
    companyId: row.company_id,
    companyName: row.company_name,
    isActive: row.is_active !== 0,
    lieuNaissance: row.lieu_naissance,
    etatCivil: row.etat_civil,
    dateMarriage: row.date_mariage,
    dateDebutAdhesion: row.date_debut_adhesion,
    dateFinAdhesion: row.date_fin_adhesion,
    rang: row.rang,
    postalCode: row.postal_code,
    rue: row.rue,
    mobile: row.mobile_encrypted,
    banque: row.banque,
    rib: row.rib_encrypted,
    regimeSocial: row.regime_social,
    handicap: !!row.handicap,
    fonction: row.fonction,
    maladiChronique: !!row.maladie_chronique,
    matriculeConjoint: row.matricule_conjoint,
    typePieceIdentite: row.type_piece_identite,
    dateEditionPiece: row.date_edition_piece,
    contreVisiteObligatoire: !!row.contre_visite_obligatoire,
    etatFiche: row.etat_fiche,
    credit: row.credit,
    contractNumber: row.contract_number,
  };
}

export async function findAdherentById(db: D1Database, id: string): Promise<Adherent | null> {
  const row = await db
    .prepare(
      `SELECT a.*, co.name as company_name,
              (SELECT COALESCE(gc.contract_number, ct.contract_number)
               FROM contracts ct
               LEFT JOIN group_contracts gc ON ct.group_contract_id = gc.id
               WHERE ct.adherent_id = a.id AND ct.status = 'active'
               ORDER BY ct.created_at DESC LIMIT 1) as contract_number
       FROM adherents a
       LEFT JOIN companies co ON a.company_id = co.id
       WHERE a.id = ? AND a.deleted_at IS NULL`
    )
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
  const now = new Date().toISOString();
  const result = await db
    .prepare(
      'UPDATE adherents SET deleted_at = ?, is_active = 0, updated_at = ? WHERE id = ? AND deleted_at IS NULL'
    )
    .bind(now, now, id)
    .run();

  // Also soft-delete ayants droit
  await db
    .prepare(
      'UPDATE adherents SET deleted_at = ?, is_active = 0, updated_at = ? WHERE parent_adherent_id = ? AND deleted_at IS NULL'
    )
    .bind(now, now, id)
    .run();

  // Also delete associated bulletins and their actes
  try {
    await db
      .prepare(
        'DELETE FROM actes_bulletin WHERE bulletin_id IN (SELECT id FROM bulletins_soins WHERE adherent_id = ?)'
      )
      .bind(id)
      .run();
    await db
      .prepare(
        'DELETE FROM bulletins_soins WHERE adherent_id = ?'
      )
      .bind(id)
      .run();
  } catch {
    // Tables may not exist on all tenants — ignore
  }

  return result.meta.changes > 0;
}
