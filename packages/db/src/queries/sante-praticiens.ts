/**
 * SoinFlow Praticiens queries
 */
import type {
  SantePraticien,
  SantePraticienPublic,
  SanteTypePraticien,
} from '@dhamen/shared';

type D1Database = {
  prepare(query: string): D1PreparedStatement;
};

type D1PreparedStatement = {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T>(): Promise<T | null>;
  all<T>(): Promise<{ results: T[] }>;
  run(): Promise<{ success: boolean; meta: { changes: number } }>;
};

interface SantePraticienRow {
  id: string;
  provider_id: string | null;
  nom: string;
  prenom: string | null;
  specialite: string;
  type_praticien: SanteTypePraticien;
  est_conventionne: number;
  convention_numero: string | null;
  convention_debut: string | null;
  convention_fin: string | null;
  telephone: string | null;
  email: string | null;
  adresse: string | null;
  ville: string | null;
  code_postal: string | null;
  lat: number | null;
  lng: number | null;
  numero_ordre: string | null;
  numero_cnam: string | null;
  is_active: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

function rowToPraticien(row: SantePraticienRow): SantePraticien {
  return {
    id: row.id,
    providerId: row.provider_id,
    nom: row.nom,
    prenom: row.prenom,
    specialite: row.specialite,
    typePraticien: row.type_praticien,
    estConventionne: row.est_conventionne === 1,
    conventionNumero: row.convention_numero,
    conventionDebut: row.convention_debut,
    conventionFin: row.convention_fin,
    telephone: row.telephone,
    email: row.email,
    adresse: row.adresse,
    ville: row.ville,
    codePostal: row.code_postal,
    lat: row.lat,
    lng: row.lng,
    numeroOrdre: row.numero_ordre,
    numeroCnam: row.numero_cnam,
    isActive: row.is_active === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function rowToPraticienPublic(row: SantePraticienRow): SantePraticienPublic {
  return {
    id: row.id,
    nom: row.nom,
    prenom: row.prenom,
    specialite: row.specialite,
    typePraticien: row.type_praticien,
    estConventionne: row.est_conventionne === 1,
    telephone: row.telephone,
    adresse: row.adresse,
    ville: row.ville,
    lat: row.lat,
    lng: row.lng,
  };
}

export async function findPraticienById(
  db: D1Database,
  id: string
): Promise<SantePraticien | null> {
  const row = await db
    .prepare('SELECT * FROM sante_praticiens WHERE id = ? AND deleted_at IS NULL')
    .bind(id)
    .first<SantePraticienRow>();

  return row ? rowToPraticien(row) : null;
}

export async function findPraticienByProviderId(
  db: D1Database,
  providerId: string
): Promise<SantePraticien | null> {
  const row = await db
    .prepare('SELECT * FROM sante_praticiens WHERE provider_id = ? AND deleted_at IS NULL')
    .bind(providerId)
    .first<SantePraticienRow>();

  return row ? rowToPraticien(row) : null;
}

export interface ListPraticiensOptions {
  typePraticien?: SanteTypePraticien;
  ville?: string;
  estConventionne?: boolean;
  search?: string;
  activeOnly?: boolean;
  page?: number;
  limit?: number;
}

export async function listPraticiens(
  db: D1Database,
  options: ListPraticiensOptions = {}
): Promise<{ data: SantePraticienPublic[]; total: number }> {
  const {
    typePraticien,
    ville,
    estConventionne,
    search,
    activeOnly = true,
    page = 1,
    limit = 20,
  } = options;
  const offset = (page - 1) * limit;

  const conditions: string[] = ['deleted_at IS NULL'];
  const params: unknown[] = [];

  if (activeOnly) {
    conditions.push('is_active = 1');
  }
  if (typePraticien) {
    conditions.push('type_praticien = ?');
    params.push(typePraticien);
  }
  if (ville) {
    conditions.push('ville = ?');
    params.push(ville);
  }
  if (estConventionne !== undefined) {
    conditions.push('est_conventionne = ?');
    params.push(estConventionne ? 1 : 0);
  }
  if (search) {
    conditions.push('(nom LIKE ? OR prenom LIKE ? OR specialite LIKE ?)');
    params.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const countResult = await db
    .prepare(`SELECT COUNT(*) as count FROM sante_praticiens ${whereClause}`)
    .bind(...params)
    .first<{ count: number }>();

  const { results } = await db
    .prepare(
      `SELECT * FROM sante_praticiens ${whereClause} ORDER BY nom ASC LIMIT ? OFFSET ?`
    )
    .bind(...params, limit, offset)
    .all<SantePraticienRow>();

  return {
    data: results.map(rowToPraticienPublic),
    total: countResult?.count ?? 0,
  };
}

export async function listConventionnesByVille(
  db: D1Database,
  ville: string
): Promise<SantePraticienPublic[]> {
  const { results } = await db
    .prepare(
      `SELECT * FROM sante_praticiens
       WHERE ville = ? AND est_conventionne = 1 AND is_active = 1 AND deleted_at IS NULL
       ORDER BY nom ASC`
    )
    .bind(ville)
    .all<SantePraticienRow>();

  return results.map(rowToPraticienPublic);
}

export async function createPraticien(
  db: D1Database,
  id: string,
  data: {
    providerId?: string;
    nom: string;
    prenom?: string;
    specialite: string;
    typePraticien: SanteTypePraticien;
    estConventionne?: boolean;
    conventionNumero?: string;
    conventionDebut?: string;
    conventionFin?: string;
    telephone?: string;
    email?: string;
    adresse?: string;
    ville?: string;
    codePostal?: string;
    lat?: number;
    lng?: number;
    numeroOrdre?: string;
    numeroCnam?: string;
  }
): Promise<SantePraticien> {
  const now = new Date().toISOString();

  await db
    .prepare(
      `INSERT INTO sante_praticiens (
        id, provider_id, nom, prenom, specialite, type_praticien,
        est_conventionne, convention_numero, convention_debut, convention_fin,
        telephone, email, adresse, ville, code_postal, lat, lng,
        numero_ordre, numero_cnam, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      id,
      data.providerId ?? null,
      data.nom,
      data.prenom ?? null,
      data.specialite,
      data.typePraticien,
      data.estConventionne ? 1 : 0,
      data.conventionNumero ?? null,
      data.conventionDebut ?? null,
      data.conventionFin ?? null,
      data.telephone ?? null,
      data.email ?? null,
      data.adresse ?? null,
      data.ville ?? null,
      data.codePostal ?? null,
      data.lat ?? null,
      data.lng ?? null,
      data.numeroOrdre ?? null,
      data.numeroCnam ?? null,
      now,
      now
    )
    .run();

  const praticien = await findPraticienById(db, id);
  if (!praticien) {
    throw new Error('Failed to create praticien');
  }
  return praticien;
}

export async function updatePraticien(
  db: D1Database,
  id: string,
  data: Partial<{
    nom: string;
    prenom: string;
    specialite: string;
    typePraticien: SanteTypePraticien;
    estConventionne: boolean;
    conventionNumero: string;
    conventionDebut: string;
    conventionFin: string;
    telephone: string;
    email: string;
    adresse: string;
    ville: string;
    codePostal: string;
    lat: number;
    lng: number;
    numeroOrdre: string;
    numeroCnam: string;
    isActive: boolean;
  }>
): Promise<SantePraticien | null> {
  const existing = await findPraticienById(db, id);
  if (!existing) {
    return null;
  }

  const updates: string[] = ['updated_at = ?'];
  const params: unknown[] = [new Date().toISOString()];

  if (data.nom !== undefined) {
    updates.push('nom = ?');
    params.push(data.nom);
  }
  if (data.prenom !== undefined) {
    updates.push('prenom = ?');
    params.push(data.prenom);
  }
  if (data.specialite !== undefined) {
    updates.push('specialite = ?');
    params.push(data.specialite);
  }
  if (data.typePraticien !== undefined) {
    updates.push('type_praticien = ?');
    params.push(data.typePraticien);
  }
  if (data.estConventionne !== undefined) {
    updates.push('est_conventionne = ?');
    params.push(data.estConventionne ? 1 : 0);
  }
  if (data.conventionNumero !== undefined) {
    updates.push('convention_numero = ?');
    params.push(data.conventionNumero);
  }
  if (data.conventionDebut !== undefined) {
    updates.push('convention_debut = ?');
    params.push(data.conventionDebut);
  }
  if (data.conventionFin !== undefined) {
    updates.push('convention_fin = ?');
    params.push(data.conventionFin);
  }
  if (data.telephone !== undefined) {
    updates.push('telephone = ?');
    params.push(data.telephone);
  }
  if (data.email !== undefined) {
    updates.push('email = ?');
    params.push(data.email);
  }
  if (data.adresse !== undefined) {
    updates.push('adresse = ?');
    params.push(data.adresse);
  }
  if (data.ville !== undefined) {
    updates.push('ville = ?');
    params.push(data.ville);
  }
  if (data.codePostal !== undefined) {
    updates.push('code_postal = ?');
    params.push(data.codePostal);
  }
  if (data.lat !== undefined) {
    updates.push('lat = ?');
    params.push(data.lat);
  }
  if (data.lng !== undefined) {
    updates.push('lng = ?');
    params.push(data.lng);
  }
  if (data.numeroOrdre !== undefined) {
    updates.push('numero_ordre = ?');
    params.push(data.numeroOrdre);
  }
  if (data.numeroCnam !== undefined) {
    updates.push('numero_cnam = ?');
    params.push(data.numeroCnam);
  }
  if (data.isActive !== undefined) {
    updates.push('is_active = ?');
    params.push(data.isActive ? 1 : 0);
  }

  params.push(id);

  await db
    .prepare(`UPDATE sante_praticiens SET ${updates.join(', ')} WHERE id = ?`)
    .bind(...params)
    .run();

  return findPraticienById(db, id);
}

export async function softDeletePraticien(db: D1Database, id: string): Promise<boolean> {
  const result = await db
    .prepare(
      'UPDATE sante_praticiens SET deleted_at = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL'
    )
    .bind(new Date().toISOString(), new Date().toISOString(), id)
    .run();

  return result.meta.changes > 0;
}

/**
 * Get distinct cities with practitioners
 */
export async function listVillesAvecPraticiens(db: D1Database): Promise<string[]> {
  const { results } = await db
    .prepare(
      `SELECT DISTINCT ville FROM sante_praticiens
       WHERE ville IS NOT NULL AND is_active = 1 AND deleted_at IS NULL
       ORDER BY ville ASC`
    )
    .all<{ ville: string }>();

  return results.map((r) => r.ville);
}
