/**
 * Queries for actes_referentiel table
 */

export interface ActeReferentielRow {
  id: string;
  code: string;
  label: string;
  taux_remboursement: number;
  plafond_acte: number | null;
  is_active: number;
}

export async function findActeRefByCode(
  db: D1Database,
  code: string,
): Promise<ActeReferentielRow | null> {
  return db
    .prepare('SELECT * FROM actes_referentiel WHERE code = ? AND is_active = 1')
    .bind(code)
    .first<ActeReferentielRow>();
}

export async function findActeRefById(
  db: D1Database,
  id: string,
): Promise<ActeReferentielRow | null> {
  return db
    .prepare('SELECT * FROM actes_referentiel WHERE id = ?')
    .bind(id)
    .first<ActeReferentielRow>();
}

export async function listActesReferentiel(
  db: D1Database,
): Promise<ActeReferentielRow[]> {
  const result = await db
    .prepare('SELECT * FROM actes_referentiel WHERE is_active = 1 ORDER BY code')
    .all<ActeReferentielRow>();
  return result.results;
}
