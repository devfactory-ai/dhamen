/**
 * SoinFlow Garanties et Formules queries
 */
import type {
  SanteGarantieFormule,
  SanteTypeSoin,
  SantePlafondConsomme,
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

interface SanteGarantieFormuleRow {
  id: string;
  code: string;
  nom: string;
  description: string | null;
  taux_couverture_json: string;
  plafonds_json: string;
  plafond_global: number | null;
  tarif_mensuel: number;
  is_active: number;
  effective_from: string;
  effective_to: string | null;
  created_at: string;
  updated_at: string;
}

interface SantePlafondConsommeRow {
  id: string;
  adherent_id: string;
  annee: number;
  type_soin: string;
  montant_consomme: number;
  montant_plafond: number;
  pourcentage_consomme: number;
  updated_at: string;
}

function rowToFormule(row: SanteGarantieFormuleRow): SanteGarantieFormule {
  return {
    id: row.id,
    code: row.code,
    nom: row.nom,
    description: row.description,
    tauxCouverture: JSON.parse(row.taux_couverture_json),
    plafonds: JSON.parse(row.plafonds_json),
    plafondGlobal: row.plafond_global,
    tarifMensuel: row.tarif_mensuel,
    isActive: row.is_active === 1,
    effectiveFrom: row.effective_from,
    effectiveTo: row.effective_to,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function rowToPlafondConsomme(row: SantePlafondConsommeRow): SantePlafondConsomme {
  return {
    id: row.id,
    adherentId: row.adherent_id,
    annee: row.annee,
    typeSoin: row.type_soin as SanteTypeSoin | 'global',
    montantConsomme: row.montant_consomme,
    montantPlafond: row.montant_plafond,
    pourcentageConsomme: row.pourcentage_consomme,
    updatedAt: row.updated_at,
  };
}

// ============================================
// Formules
// ============================================

export async function findFormuleById(
  db: D1Database,
  id: string
): Promise<SanteGarantieFormule | null> {
  const row = await db
    .prepare('SELECT * FROM sante_garanties_formules WHERE id = ?')
    .bind(id)
    .first<SanteGarantieFormuleRow>();

  return row ? rowToFormule(row) : null;
}

export async function findFormuleByCode(
  db: D1Database,
  code: string
): Promise<SanteGarantieFormule | null> {
  const row = await db
    .prepare('SELECT * FROM sante_garanties_formules WHERE code = ? AND is_active = 1')
    .bind(code)
    .first<SanteGarantieFormuleRow>();

  return row ? rowToFormule(row) : null;
}

export async function listFormules(
  db: D1Database,
  options: { activeOnly?: boolean } = {}
): Promise<SanteGarantieFormule[]> {
  const { activeOnly = true } = options;

  const whereClause = activeOnly ? 'WHERE is_active = 1' : '';

  const { results } = await db
    .prepare(`SELECT * FROM sante_garanties_formules ${whereClause} ORDER BY tarif_mensuel ASC`)
    .all<SanteGarantieFormuleRow>();

  return results.map(rowToFormule);
}

export async function createFormule(
  db: D1Database,
  id: string,
  data: {
    code: string;
    nom: string;
    description?: string;
    tauxCouverture: Record<string, number>;
    plafonds: Record<string, number>;
    plafondGlobal?: number;
    tarifMensuel: number;
    effectiveFrom: string;
    effectiveTo?: string;
  }
): Promise<SanteGarantieFormule> {
  const now = new Date().toISOString();

  await db
    .prepare(
      `INSERT INTO sante_garanties_formules (
        id, code, nom, description, taux_couverture_json, plafonds_json,
        plafond_global, tarif_mensuel, effective_from, effective_to, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      id,
      data.code,
      data.nom,
      data.description ?? null,
      JSON.stringify(data.tauxCouverture),
      JSON.stringify(data.plafonds),
      data.plafondGlobal ?? null,
      data.tarifMensuel,
      data.effectiveFrom,
      data.effectiveTo ?? null,
      now,
      now
    )
    .run();

  const formule = await findFormuleById(db, id);
  if (!formule) {
    throw new Error('Failed to create formule');
  }
  return formule;
}

export async function updateFormule(
  db: D1Database,
  id: string,
  data: Partial<{
    nom: string;
    description: string;
    tauxCouverture: Record<string, number>;
    plafonds: Record<string, number>;
    plafondGlobal: number;
    tarifMensuel: number;
    isActive: boolean;
    effectiveTo: string;
  }>
): Promise<SanteGarantieFormule | null> {
  const existing = await findFormuleById(db, id);
  if (!existing) {
    return null;
  }

  const updates: string[] = ['updated_at = ?'];
  const params: unknown[] = [new Date().toISOString()];

  if (data.nom !== undefined) {
    updates.push('nom = ?');
    params.push(data.nom);
  }
  if (data.description !== undefined) {
    updates.push('description = ?');
    params.push(data.description);
  }
  if (data.tauxCouverture !== undefined) {
    updates.push('taux_couverture_json = ?');
    params.push(JSON.stringify(data.tauxCouverture));
  }
  if (data.plafonds !== undefined) {
    updates.push('plafonds_json = ?');
    params.push(JSON.stringify(data.plafonds));
  }
  if (data.plafondGlobal !== undefined) {
    updates.push('plafond_global = ?');
    params.push(data.plafondGlobal);
  }
  if (data.tarifMensuel !== undefined) {
    updates.push('tarif_mensuel = ?');
    params.push(data.tarifMensuel);
  }
  if (data.isActive !== undefined) {
    updates.push('is_active = ?');
    params.push(data.isActive ? 1 : 0);
  }
  if (data.effectiveTo !== undefined) {
    updates.push('effective_to = ?');
    params.push(data.effectiveTo);
  }

  params.push(id);

  await db
    .prepare(`UPDATE sante_garanties_formules SET ${updates.join(', ')} WHERE id = ?`)
    .bind(...params)
    .run();

  return findFormuleById(db, id);
}

// ============================================
// Plafonds Consommés
// ============================================

export async function getPlafondConsomme(
  db: D1Database,
  adherentId: string,
  typeSoin: SanteTypeSoin | 'global',
  annee?: number
): Promise<SantePlafondConsomme | null> {
  const year = annee ?? new Date().getFullYear();

  const row = await db
    .prepare(
      'SELECT * FROM sante_plafonds_consommes WHERE adherent_id = ? AND type_soin = ? AND annee = ?'
    )
    .bind(adherentId, typeSoin, year)
    .first<SantePlafondConsommeRow>();

  return row ? rowToPlafondConsomme(row) : null;
}

export async function listPlafondsConsommes(
  db: D1Database,
  adherentId: string,
  annee?: number
): Promise<SantePlafondConsomme[]> {
  const year = annee ?? new Date().getFullYear();

  const { results } = await db
    .prepare('SELECT * FROM sante_plafonds_consommes WHERE adherent_id = ? AND annee = ?')
    .bind(adherentId, year)
    .all<SantePlafondConsommeRow>();

  return results.map(rowToPlafondConsomme);
}

export async function upsertPlafondConsomme(
  db: D1Database,
  id: string,
  data: {
    adherentId: string;
    annee: number;
    typeSoin: SanteTypeSoin | 'global';
    montantConsomme: number;
    montantPlafond: number;
  }
): Promise<SantePlafondConsomme> {
  const now = new Date().toISOString();

  // Try to get existing
  const existing = await getPlafondConsomme(db, data.adherentId, data.typeSoin, data.annee);

  if (existing) {
    await db
      .prepare(
        `UPDATE sante_plafonds_consommes
         SET montant_consomme = ?, montant_plafond = ?, updated_at = ?
         WHERE id = ?`
      )
      .bind(data.montantConsomme, data.montantPlafond, now, existing.id)
      .run();

    const result = await getPlafondConsomme(db, data.adherentId, data.typeSoin, data.annee);
    if (!result) {
      throw new Error('Failed to retrieve updated plafond consomme');
    }
    return result;
  }

  await db
    .prepare(
      `INSERT INTO sante_plafonds_consommes (id, adherent_id, annee, type_soin, montant_consomme, montant_plafond, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(id, data.adherentId, data.annee, data.typeSoin, data.montantConsomme, data.montantPlafond, now)
    .run();

  const result = await getPlafondConsomme(db, data.adherentId, data.typeSoin, data.annee);
  if (!result) {
    throw new Error('Failed to create plafond consomme');
  }
  return result;
}

export async function incrementPlafondConsomme(
  db: D1Database,
  adherentId: string,
  typeSoin: SanteTypeSoin | 'global',
  montant: number,
  annee?: number
): Promise<void> {
  const year = annee ?? new Date().getFullYear();
  const now = new Date().toISOString();

  await db
    .prepare(
      `UPDATE sante_plafonds_consommes
       SET montant_consomme = montant_consomme + ?, updated_at = ?
       WHERE adherent_id = ? AND type_soin = ? AND annee = ?`
    )
    .bind(montant, now, adherentId, typeSoin, year)
    .run();
}

/**
 * Record consumption for an adherent - convenience wrapper for global plafond
 */
export async function recordConsommation(
  db: D1Database,
  adherentId: string,
  annee: number,
  montant: number
): Promise<void> {
  const existing = await getPlafondConsomme(db, adherentId, 'global', annee);

  if (existing) {
    await incrementPlafondConsomme(db, adherentId, 'global', montant, annee);
  } else {
    // Create new record with ULID-like ID
    const id = Date.now().toString(36) + Math.random().toString(36).substring(2);
    await db
      .prepare(
        `INSERT INTO sante_plafonds_consommes (id, adherent_id, annee, type_soin, montant_consomme, montant_plafond, updated_at)
         VALUES (?, ?, ?, 'global', ?, 0, ?)`
      )
      .bind(id, adherentId, annee, montant, new Date().toISOString())
      .run();
  }
}

/**
 * Calculate coverage for a given type of care and formule
 */
export async function calculateCoverage(
  db: D1Database,
  formuleId: string,
  typeSoin: SanteTypeSoin,
  montantDemande: number,
  adherentId: string
): Promise<{
  montantCouvert: number;
  tauxCouverture: number;
  plafondAtteint: boolean;
  plafondRestant: number;
}> {
  const formule = await findFormuleById(db, formuleId);
  if (!formule) {
    throw new Error('Formule not found');
  }

  const tauxCouverture = formule.tauxCouverture[typeSoin] ?? 0;
  const plafond = formule.plafonds[typeSoin] ?? formule.plafondGlobal ?? 0;

  // Get current consumption
  const consumption = await getPlafondConsomme(db, adherentId, typeSoin);
  const montantConsomme = consumption?.montantConsomme ?? 0;
  const montantPlafond = consumption?.montantPlafond ?? plafond;

  const plafondRestant = Math.max(0, montantPlafond - montantConsomme);

  // Calculate coverage
  let montantCouvert = Math.round((montantDemande * tauxCouverture) / 100);

  // Apply ceiling
  const plafondAtteint = montantCouvert > plafondRestant;
  if (plafondAtteint) {
    montantCouvert = plafondRestant;
  }

  return {
    montantCouvert,
    tauxCouverture,
    plafondAtteint,
    plafondRestant: Math.max(0, plafondRestant - montantCouvert),
  };
}
