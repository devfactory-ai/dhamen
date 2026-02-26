/**
 * SoinFlow Actes Praticiens queries
 */
import type { SanteActePraticien, SanteActeAvecDetails, SanteStatutActe } from '@dhamen/shared';

type D1Database = {
  prepare(query: string): D1PreparedStatement;
};

type D1PreparedStatement = {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T>(): Promise<T | null>;
  all<T>(): Promise<{ results: T[] }>;
  run(): Promise<{ success: boolean; meta: { changes: number } }>;
};

interface SanteActeRow {
  id: string;
  praticien_id: string;
  adherent_id: string;
  demande_id: string | null;
  code_acte: string;
  libelle_acte: string;
  montant_acte: number;
  taux_couverture: number;
  montant_couvert: number;
  montant_patient: number;
  statut: SanteStatutActe;
  date_acte: string;
  qr_code_adherent: string | null;
  signature_adherent: number;
  created_at: string;
  updated_at: string;
}

interface AdherentBasicRow {
  id: string;
  first_name: string;
  last_name: string;
  matricule: string | null;
}

interface PraticienPublicRow {
  id: string;
  nom: string;
  prenom: string | null;
  specialite: string;
  type_praticien: string;
  est_conventionne: number;
  telephone: string | null;
  adresse: string | null;
  ville: string | null;
  lat: number | null;
  lng: number | null;
}

function rowToActe(row: SanteActeRow): SanteActePraticien {
  return {
    id: row.id,
    praticienId: row.praticien_id,
    adherentId: row.adherent_id,
    demandeId: row.demande_id,
    codeActe: row.code_acte,
    libelleActe: row.libelle_acte,
    montantActe: row.montant_acte,
    tauxCouverture: row.taux_couverture,
    montantCouvert: row.montant_couvert,
    montantPatient: row.montant_patient,
    statut: row.statut,
    dateActe: row.date_acte,
    qrCodeAdherent: row.qr_code_adherent,
    signatureAdherent: row.signature_adherent === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function findActeById(
  db: D1Database,
  id: string
): Promise<SanteActePraticien | null> {
  const row = await db
    .prepare('SELECT * FROM sante_actes_praticiens WHERE id = ?')
    .bind(id)
    .first<SanteActeRow>();

  return row ? rowToActe(row) : null;
}

export async function findActeAvecDetails(
  db: D1Database,
  id: string
): Promise<SanteActeAvecDetails | null> {
  const row = await db
    .prepare('SELECT * FROM sante_actes_praticiens WHERE id = ?')
    .bind(id)
    .first<SanteActeRow>();

  if (!row) {
    return null;
  }

  const acte = rowToActe(row);

  // Get adherent info
  const adherentRow = await db
    .prepare('SELECT id, first_name, last_name, matricule FROM adherents WHERE id = ?')
    .bind(row.adherent_id)
    .first<AdherentBasicRow>();

  // Get praticien info
  const praticienRow = await db
    .prepare(
      `SELECT id, nom, prenom, specialite, type_praticien, est_conventionne,
       telephone, adresse, ville, lat, lng
       FROM sante_praticiens WHERE id = ?`
    )
    .bind(row.praticien_id)
    .first<PraticienPublicRow>();

  return {
    ...acte,
    adherent: adherentRow
      ? {
          id: adherentRow.id,
          firstName: adherentRow.first_name,
          lastName: adherentRow.last_name,
          matricule: adherentRow.matricule,
        }
      : undefined,
    praticien: praticienRow
      ? {
          id: praticienRow.id,
          nom: praticienRow.nom,
          prenom: praticienRow.prenom,
          specialite: praticienRow.specialite,
          typePraticien: praticienRow.type_praticien as SanteActeAvecDetails['praticien'] extends { typePraticien: infer T } ? T : never,
          estConventionne: praticienRow.est_conventionne === 1,
          telephone: praticienRow.telephone,
          adresse: praticienRow.adresse,
          ville: praticienRow.ville,
          lat: praticienRow.lat,
          lng: praticienRow.lng,
        }
      : undefined,
  };
}

export interface ListActesOptions {
  praticienId?: string;
  adherentId?: string;
  statut?: SanteStatutActe;
  dateDebut?: string;
  dateFin?: string;
  page?: number;
  limit?: number;
}

export async function listActes(
  db: D1Database,
  options: ListActesOptions = {}
): Promise<{ data: SanteActePraticien[]; total: number }> {
  const { praticienId, adherentId, statut, dateDebut, dateFin, page = 1, limit = 20 } = options;
  const offset = (page - 1) * limit;

  const conditions: string[] = [];
  const params: unknown[] = [];

  if (praticienId) {
    conditions.push('praticien_id = ?');
    params.push(praticienId);
  }
  if (adherentId) {
    conditions.push('adherent_id = ?');
    params.push(adherentId);
  }
  if (statut) {
    conditions.push('statut = ?');
    params.push(statut);
  }
  if (dateDebut) {
    conditions.push('date_acte >= ?');
    params.push(dateDebut);
  }
  if (dateFin) {
    conditions.push('date_acte <= ?');
    params.push(dateFin);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const countResult = await db
    .prepare(`SELECT COUNT(*) as count FROM sante_actes_praticiens ${whereClause}`)
    .bind(...params)
    .first<{ count: number }>();

  const { results } = await db
    .prepare(
      `SELECT * FROM sante_actes_praticiens ${whereClause} ORDER BY created_at DESC LIMIT ? OFFSET ?`
    )
    .bind(...params, limit, offset)
    .all<SanteActeRow>();

  return {
    data: results.map(rowToActe),
    total: countResult?.count ?? 0,
  };
}

export async function createActe(
  db: D1Database,
  id: string,
  data: {
    praticienId: string;
    adherentId: string;
    demandeId?: string;
    codeActe: string;
    libelleActe: string;
    montantActe: number;
    tauxCouverture: number;
    montantCouvert: number;
    montantPatient: number;
    dateActe: string;
    qrCodeAdherent?: string;
  }
): Promise<SanteActePraticien> {
  const now = new Date().toISOString();

  await db
    .prepare(
      `INSERT INTO sante_actes_praticiens (
        id, praticien_id, adherent_id, demande_id, code_acte, libelle_acte,
        montant_acte, taux_couverture, montant_couvert, montant_patient,
        statut, date_acte, qr_code_adherent, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'cree', ?, ?, ?, ?)`
    )
    .bind(
      id,
      data.praticienId,
      data.adherentId,
      data.demandeId ?? null,
      data.codeActe,
      data.libelleActe,
      data.montantActe,
      data.tauxCouverture,
      data.montantCouvert,
      data.montantPatient,
      data.dateActe,
      data.qrCodeAdherent ?? null,
      now,
      now
    )
    .run();

  const acte = await findActeById(db, id);
  if (!acte) {
    throw new Error('Failed to create acte');
  }
  return acte;
}

export async function updateActeStatut(
  db: D1Database,
  id: string,
  statut: SanteStatutActe,
  options: { signatureAdherent?: boolean; demandeId?: string } = {}
): Promise<SanteActePraticien | null> {
  const existing = await findActeById(db, id);
  if (!existing) {
    return null;
  }

  const now = new Date().toISOString();
  const updates: string[] = ['statut = ?', 'updated_at = ?'];
  const params: unknown[] = [statut, now];

  if (options.signatureAdherent !== undefined) {
    updates.push('signature_adherent = ?');
    params.push(options.signatureAdherent ? 1 : 0);
  }

  if (options.demandeId !== undefined) {
    updates.push('demande_id = ?');
    params.push(options.demandeId);
  }

  params.push(id);

  await db
    .prepare(`UPDATE sante_actes_praticiens SET ${updates.join(', ')} WHERE id = ?`)
    .bind(...params)
    .run();

  return findActeById(db, id);
}

export async function getActesStatsByPraticien(
  db: D1Database,
  praticienId: string,
  options: { dateDebut?: string; dateFin?: string } = {}
): Promise<{
  total: number;
  parStatut: Record<SanteStatutActe, number>;
  montantTotal: number;
  montantCouvert: number;
}> {
  const conditions: string[] = ['praticien_id = ?'];
  const params: unknown[] = [praticienId];

  if (options.dateDebut) {
    conditions.push('date_acte >= ?');
    params.push(options.dateDebut);
  }
  if (options.dateFin) {
    conditions.push('date_acte <= ?');
    params.push(options.dateFin);
  }

  const whereClause = `WHERE ${conditions.join(' AND ')}`;

  // Get counts by status
  const { results: statusCounts } = await db
    .prepare(`SELECT statut, COUNT(*) as count FROM sante_actes_praticiens ${whereClause} GROUP BY statut`)
    .bind(...params)
    .all<{ statut: SanteStatutActe; count: number }>();

  // Get totals
  const totals = await db
    .prepare(
      `SELECT
        COUNT(*) as total,
        COALESCE(SUM(montant_acte), 0) as montant_total,
        COALESCE(SUM(montant_couvert), 0) as montant_couvert
       FROM sante_actes_praticiens ${whereClause}`
    )
    .bind(...params)
    .first<{ total: number; montant_total: number; montant_couvert: number }>();

  const parStatut: Record<string, number> = {};
  for (const row of statusCounts) {
    parStatut[row.statut] = row.count;
  }

  return {
    total: totals?.total ?? 0,
    parStatut: parStatut as Record<SanteStatutActe, number>,
    montantTotal: totals?.montant_total ?? 0,
    montantCouvert: totals?.montant_couvert ?? 0,
  };
}
