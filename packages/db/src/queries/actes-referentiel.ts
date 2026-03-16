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
  famille_id: string | null;
  type_calcul: 'taux' | 'forfait';
  valeur_base: number | null;
  code_assureur: string | null;
}

export interface ActeReferentielGroupeRow extends ActeReferentielRow {
  famille_code: string | null;
  famille_label: string | null;
  famille_ordre: number | null;
}

export interface FamilleActeRow {
  id: string;
  code: string;
  label: string;
  ordre: number;
}

export interface ActesGroupeParFamille {
  famille: FamilleActeRow;
  actes: ActeReferentielRow[];
}

export async function findActeRefByCode(
  db: D1Database,
  code: string
): Promise<ActeReferentielRow | null> {
  return db
    .prepare('SELECT * FROM actes_referentiel WHERE code = ? AND is_active = 1')
    .bind(code)
    .first<ActeReferentielRow>();
}

export async function findActeRefById(
  db: D1Database,
  id: string
): Promise<ActeReferentielRow | null> {
  return db
    .prepare('SELECT * FROM actes_referentiel WHERE id = ?')
    .bind(id)
    .first<ActeReferentielRow>();
}

export async function listActesReferentiel(db: D1Database): Promise<ActeReferentielRow[]> {
  const result = await db
    .prepare('SELECT * FROM actes_referentiel WHERE is_active = 1 ORDER BY code')
    .all<ActeReferentielRow>();
  return result.results;
}

/**
 * List actes referentiel grouped by famille.
 * Returns actes joined with familles_actes, ordered by famille ordre then acte code.
 */
export async function listActesGroupesParFamille(db: D1Database): Promise<ActesGroupeParFamille[]> {
  const result = await db
    .prepare(`
      SELECT
        ar.*,
        fa.code as famille_code,
        fa.label as famille_label,
        fa.ordre as famille_ordre
      FROM actes_referentiel ar
      LEFT JOIN familles_actes fa ON ar.famille_id = fa.id
      WHERE ar.is_active = 1
      ORDER BY fa.ordre ASC, ar.code ASC
    `)
    .all<ActeReferentielGroupeRow>();

  const groupMap = new Map<string, ActesGroupeParFamille>();

  for (const row of result.results) {
    const familleId = row.famille_id || '__sans_famille__';
    if (!groupMap.has(familleId)) {
      groupMap.set(familleId, {
        famille: {
          id: row.famille_id || '__sans_famille__',
          code: row.famille_code || 'AUTRE',
          label: row.famille_label || 'Autres actes',
          ordre: row.famille_ordre ?? 999,
        },
        actes: [],
      });
    }
    const group = groupMap.get(familleId) as ActesGroupeParFamille;
    group.actes.push({
      id: row.id,
      code: row.code,
      label: row.label,
      taux_remboursement: row.taux_remboursement,
      plafond_acte: row.plafond_acte,
      is_active: row.is_active,
      famille_id: row.famille_id,
      type_calcul: row.type_calcul,
      valeur_base: row.valeur_base,
      code_assureur: row.code_assureur,
    });
  }

  return Array.from(groupMap.values()).sort((a, b) => a.famille.ordre - b.famille.ordre);
}
