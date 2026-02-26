/**
 * SoinFlow Demandes queries
 */
import type {
  SanteDemande,
  SanteDemandeAvecDetails,
  SanteStatutDemande,
  SanteTypeSoin,
  SanteSourceDemande,
  SanteDemandeCreate,
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

interface SanteDemandeRow {
  id: string;
  numero_demande: string;
  adherent_id: string;
  praticien_id: string | null;
  formule_id: string | null;
  source: SanteSourceDemande;
  type_soin: SanteTypeSoin;
  statut: SanteStatutDemande;
  montant_demande: number;
  montant_rembourse: number | null;
  montant_reste_charge: number | null;
  est_tiers_payant: number;
  montant_praticien: number | null;
  date_soin: string;
  traite_par: string | null;
  date_traitement: string | null;
  motif_rejet: string | null;
  notes_internes: string | null;
  score_fraude: number | null;
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

function rowToDemande(row: SanteDemandeRow): SanteDemande {
  return {
    id: row.id,
    numeroDemande: row.numero_demande,
    adherentId: row.adherent_id,
    praticienId: row.praticien_id,
    formuleId: row.formule_id,
    source: row.source,
    typeSoin: row.type_soin,
    statut: row.statut,
    montantDemande: row.montant_demande,
    montantRembourse: row.montant_rembourse,
    montantResteCharge: row.montant_reste_charge,
    estTiersPayant: row.est_tiers_payant === 1,
    montantPraticien: row.montant_praticien,
    dateSoin: row.date_soin,
    traitePar: row.traite_par,
    dateTraitement: row.date_traitement,
    motifRejet: row.motif_rejet,
    notesInternes: row.notes_internes,
    scoreFraude: row.score_fraude,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function findSanteDemandeById(
  db: D1Database,
  id: string
): Promise<SanteDemande | null> {
  const row = await db
    .prepare('SELECT * FROM sante_demandes WHERE id = ?')
    .bind(id)
    .first<SanteDemandeRow>();

  return row ? rowToDemande(row) : null;
}

export async function findSanteDemandeByNumero(
  db: D1Database,
  numeroDemande: string
): Promise<SanteDemande | null> {
  const row = await db
    .prepare('SELECT * FROM sante_demandes WHERE numero_demande = ?')
    .bind(numeroDemande)
    .first<SanteDemandeRow>();

  return row ? rowToDemande(row) : null;
}

export async function findSanteDemandeAvecDetails(
  db: D1Database,
  id: string
): Promise<SanteDemandeAvecDetails | null> {
  const row = await db
    .prepare('SELECT * FROM sante_demandes WHERE id = ?')
    .bind(id)
    .first<SanteDemandeRow>();

  if (!row) {
    return null;
  }

  const demande = rowToDemande(row);

  // Get adherent info
  const adherentRow = await db
    .prepare('SELECT id, first_name, last_name, matricule FROM adherents WHERE id = ?')
    .bind(row.adherent_id)
    .first<AdherentBasicRow>();

  // Get praticien info if exists
  let praticien: SanteDemandeAvecDetails['praticien'] = null;
  if (row.praticien_id) {
    const praticienRow = await db
      .prepare(
        `SELECT id, nom, prenom, specialite, type_praticien, est_conventionne,
         telephone, adresse, ville, lat, lng
         FROM sante_praticiens WHERE id = ?`
      )
      .bind(row.praticien_id)
      .first<PraticienPublicRow>();

    if (praticienRow) {
      praticien = {
        id: praticienRow.id,
        nom: praticienRow.nom,
        prenom: praticienRow.prenom,
        specialite: praticienRow.specialite,
        typePraticien: praticienRow.type_praticien as SanteDemandeAvecDetails['praticien'] extends { typePraticien: infer T } ? T : never,
        estConventionne: praticienRow.est_conventionne === 1,
        telephone: praticienRow.telephone,
        adresse: praticienRow.adresse,
        ville: praticienRow.ville,
        lat: praticienRow.lat,
        lng: praticienRow.lng,
      };
    }
  }

  return {
    ...demande,
    adherent: adherentRow
      ? {
          id: adherentRow.id,
          firstName: adherentRow.first_name,
          lastName: adherentRow.last_name,
          matricule: adherentRow.matricule,
        }
      : undefined,
    praticien,
  };
}

export interface ListSanteDemandesOptions {
  statut?: SanteStatutDemande;
  source?: SanteSourceDemande;
  typeSoin?: SanteTypeSoin;
  adherentId?: string;
  praticienId?: string;
  dateDebut?: string;
  dateFin?: string;
  page?: number;
  limit?: number;
}

export async function listSanteDemandes(
  db: D1Database,
  options: ListSanteDemandesOptions = {}
): Promise<{ data: SanteDemande[]; total: number }> {
  const { statut, source, typeSoin, adherentId, praticienId, dateDebut, dateFin, page = 1, limit = 20 } = options;
  const offset = (page - 1) * limit;

  const conditions: string[] = [];
  const params: unknown[] = [];

  if (statut) {
    conditions.push('statut = ?');
    params.push(statut);
  }
  if (source) {
    conditions.push('source = ?');
    params.push(source);
  }
  if (typeSoin) {
    conditions.push('type_soin = ?');
    params.push(typeSoin);
  }
  if (adherentId) {
    conditions.push('adherent_id = ?');
    params.push(adherentId);
  }
  if (praticienId) {
    conditions.push('praticien_id = ?');
    params.push(praticienId);
  }
  if (dateDebut) {
    conditions.push('date_soin >= ?');
    params.push(dateDebut);
  }
  if (dateFin) {
    conditions.push('date_soin <= ?');
    params.push(dateFin);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const countResult = await db
    .prepare(`SELECT COUNT(*) as count FROM sante_demandes ${whereClause}`)
    .bind(...params)
    .first<{ count: number }>();

  const { results } = await db
    .prepare(
      `SELECT * FROM sante_demandes ${whereClause} ORDER BY created_at DESC LIMIT ? OFFSET ?`
    )
    .bind(...params, limit, offset)
    .all<SanteDemandeRow>();

  return {
    data: results.map(rowToDemande),
    total: countResult?.count ?? 0,
  };
}

/**
 * Generate unique demande number: SF-YYYY-NNNNNN
 */
function generateNumeroDemande(): string {
  const year = new Date().getFullYear();
  const random = Math.floor(Math.random() * 999999)
    .toString()
    .padStart(6, '0');
  return `SF-${year}-${random}`;
}

export async function createSanteDemande(
  db: D1Database,
  id: string,
  data: SanteDemandeCreate & {
    source?: SanteSourceDemande;
    formuleId?: string;
    praticienId?: string;
    estTiersPayant?: boolean;
    montantPraticien?: number;
  }
): Promise<SanteDemande> {
  const now = new Date().toISOString();
  const numeroDemande = generateNumeroDemande();

  await db
    .prepare(
      `INSERT INTO sante_demandes (
        id, numero_demande, adherent_id, praticien_id, formule_id, source,
        type_soin, statut, montant_demande, est_tiers_payant, montant_praticien,
        date_soin, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'soumise', ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      id,
      numeroDemande,
      data.adherentId,
      data.praticienId ?? null,
      data.formuleId ?? null,
      data.source ?? 'adherent',
      data.typeSoin,
      data.montantDemande,
      data.estTiersPayant ? 1 : 0,
      data.montantPraticien ?? null,
      data.dateSoin,
      now,
      now
    )
    .run();

  const demande = await findSanteDemandeById(db, id);
  if (!demande) {
    throw new Error('Failed to create demande');
  }
  return demande;
}

export async function updateSanteDemandeStatut(
  db: D1Database,
  id: string,
  statut: SanteStatutDemande,
  options: {
    montantRembourse?: number;
    montantResteCharge?: number;
    motifRejet?: string;
    notesInternes?: string;
    traitePar?: string;
  } = {}
): Promise<SanteDemande | null> {
  const existing = await findSanteDemandeById(db, id);
  if (!existing) {
    return null;
  }

  const now = new Date().toISOString();
  const updates: string[] = ['statut = ?', 'updated_at = ?'];
  const params: unknown[] = [statut, now];

  if (options.montantRembourse !== undefined) {
    updates.push('montant_rembourse = ?');
    params.push(options.montantRembourse);
  }
  if (options.montantResteCharge !== undefined) {
    updates.push('montant_reste_charge = ?');
    params.push(options.montantResteCharge);
  }
  if (options.motifRejet !== undefined) {
    updates.push('motif_rejet = ?');
    params.push(options.motifRejet);
  }
  if (options.notesInternes !== undefined) {
    updates.push('notes_internes = ?');
    params.push(options.notesInternes);
  }
  if (options.traitePar !== undefined) {
    updates.push('traite_par = ?');
    params.push(options.traitePar);
  }

  // Set date_traitement when moving to examination or later stages
  if (['en_examen', 'approuvee', 'rejetee'].includes(statut) && !existing.dateTraitement) {
    updates.push('date_traitement = ?');
    params.push(now);
  }

  params.push(id);

  await db
    .prepare(`UPDATE sante_demandes SET ${updates.join(', ')} WHERE id = ?`)
    .bind(...params)
    .run();

  return findSanteDemandeById(db, id);
}

export async function updateSanteDemandeScoreFraude(
  db: D1Database,
  id: string,
  scoreFraude: number
): Promise<void> {
  await db
    .prepare('UPDATE sante_demandes SET score_fraude = ?, updated_at = ? WHERE id = ?')
    .bind(scoreFraude, new Date().toISOString(), id)
    .run();
}

/**
 * Get statistics for dashboard
 */
export async function getSanteDemandesStats(
  db: D1Database,
  options: { praticienId?: string; dateDebut?: string; dateFin?: string } = {}
): Promise<{
  total: number;
  parStatut: Record<SanteStatutDemande, number>;
  montantTotal: number;
  montantRembourse: number;
}> {
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (options.praticienId) {
    conditions.push('praticien_id = ?');
    params.push(options.praticienId);
  }
  if (options.dateDebut) {
    conditions.push('date_soin >= ?');
    params.push(options.dateDebut);
  }
  if (options.dateFin) {
    conditions.push('date_soin <= ?');
    params.push(options.dateFin);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  // Get counts by status
  const { results: statusCounts } = await db
    .prepare(`SELECT statut, COUNT(*) as count FROM sante_demandes ${whereClause} GROUP BY statut`)
    .bind(...params)
    .all<{ statut: SanteStatutDemande; count: number }>();

  // Get totals
  const totals = await db
    .prepare(
      `SELECT
        COUNT(*) as total,
        COALESCE(SUM(montant_demande), 0) as montant_total,
        COALESCE(SUM(montant_rembourse), 0) as montant_rembourse
       FROM sante_demandes ${whereClause}`
    )
    .bind(...params)
    .first<{ total: number; montant_total: number; montant_rembourse: number }>();

  const parStatut: Record<string, number> = {};
  for (const row of statusCounts) {
    parStatut[row.statut] = row.count;
  }

  return {
    total: totals?.total ?? 0,
    parStatut: parStatut as Record<SanteStatutDemande, number>,
    montantTotal: totals?.montant_total ?? 0,
    montantRembourse: totals?.montant_rembourse ?? 0,
  };
}
