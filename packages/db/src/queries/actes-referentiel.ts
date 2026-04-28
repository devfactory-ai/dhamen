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
  lettre_cle: string | null;
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

/**
 * Parse a composite acte code into letter-key + numeric coefficient.
 * Splits any alphabetic prefix from a trailing integer: "B40" → {letter:"B", coefficient:40}
 * "KC50" → {letter:"KC", coefficient:50}, "PHY10" → {letter:"PHY", coefficient:10}
 * Returns null for pure codes without numeric suffix (e.g. "C1" matched as direct code).
 */
export function parseLetterKeyCode(code: string): { letter: string; coefficient: number } | null {
  if (!code) return null;
  const upper = code.toUpperCase().trim();
  // Split into alphabetic prefix + numeric suffix
  const match = upper.match(/^([A-Z]+)(\d+)$/);
  if (!match) return null;
  const letter = match[1]!;
  const num = Number(match[2]);
  // Reject single-char letter + single digit (e.g. "C1", "V2") — these are direct acte codes
  if (letter.length === 1 && match[2]!.length === 1) return null;
  if (num > 0 && Number.isInteger(num)) {
    return { letter, coefficient: num };
  }
  return null;
}

export interface FindActeRefResult {
  acte: ActeReferentielRow;
  parsedCoefficient: number | null;
}

/**
 * Find acte referentiel by code.
 * Supports composite codes: "B40" → finds acte with lettre_cle="B", returns coefficient=40
 */
export async function findActeRefByCode(
  db: D1Database,
  code: string
): Promise<ActeReferentielRow | null> {
  const result = await findActeRefByCodeWithCoefficient(db, code);
  return result?.acte ?? null;
}

/**
 * Find acte referentiel by code, returning parsed coefficient for composite codes.
 * - "AN" → acte AN, coefficient=null
 * - "B40" → acte with lettre_cle="B" (AN), coefficient=40
 * - "KC50" → acte with lettre_cle="KC" (KC/FCH), coefficient=50
 * - "C1" → acte C1 directly, coefficient=null
 */
export async function findActeRefByCodeWithCoefficient(
  db: D1Database,
  code: string
): Promise<FindActeRefResult | null> {
  if (!code) return null;
  const trimmed = code.trim();

  // 1. Direct match by code
  const direct = await db
    .prepare('SELECT * FROM actes_referentiel WHERE code = ? AND is_active = 1')
    .bind(trimmed.toUpperCase())
    .first<ActeReferentielRow>();
  if (direct) return { acte: direct, parsedCoefficient: null };

  // 2. Try case-insensitive match
  const caseInsensitive = await db
    .prepare('SELECT * FROM actes_referentiel WHERE UPPER(code) = ? AND is_active = 1')
    .bind(trimmed.toUpperCase())
    .first<ActeReferentielRow>();
  if (caseInsensitive) return { acte: caseInsensitive, parsedCoefficient: null };

  // 3. Parse composite code (B40, KC50, Z30, etc.)
  const parsed = parseLetterKeyCode(trimmed);
  if (parsed) {
    // Find acte by lettre_cle matching the parsed letter
    const byLettreCle = await db
      .prepare('SELECT * FROM actes_referentiel WHERE lettre_cle = ? AND is_active = 1 LIMIT 1')
      .bind(parsed.letter)
      .first<ActeReferentielRow>();
    if (byLettreCle) return { acte: byLettreCle, parsedCoefficient: parsed.coefficient };

    // Also try direct code match on the letter itself (e.g., "KC" is both a code and a lettre_cle)
    const byCode = await db
      .prepare('SELECT * FROM actes_referentiel WHERE code = ? AND is_active = 1')
      .bind(parsed.letter)
      .first<ActeReferentielRow>();
    if (byCode) return { acte: byCode, parsedCoefficient: parsed.coefficient };
  }

  // 4. Fuzzy match by label (handles "ANALYSE" → "Analyses biologiques", "PHARMACIE" → "Frais pharmaceutiques")
  const byLabel = await db
    .prepare('SELECT * FROM actes_referentiel WHERE UPPER(label) LIKE ? AND is_active = 1 LIMIT 1')
    .bind(`%${trimmed.toUpperCase()}%`)
    .first<ActeReferentielRow>();
  if (byLabel) return { acte: byLabel, parsedCoefficient: null };

  // 5. Try code_assureur field (legacy codes mapped during import)
  const byCodeAssureur = await db
    .prepare('SELECT * FROM actes_referentiel WHERE UPPER(code_assureur) = ? AND is_active = 1 LIMIT 1')
    .bind(trimmed.toUpperCase())
    .first<ActeReferentielRow>();
  if (byCodeAssureur) return { acte: byCodeAssureur, parsedCoefficient: null };

  return null;
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
 * List all active familles with their actes.
 * Returns ALL active familles (even those without actes), ordered by famille ordre.
 */
export async function listActesGroupesParFamille(db: D1Database): Promise<ActesGroupeParFamille[]> {
  // 1. Get all active familles
  const familles = await db
    .prepare('SELECT id, code, label, ordre FROM familles_actes WHERE is_active = 1 ORDER BY ordre ASC')
    .all<{ id: string; code: string; label: string; ordre: number }>();

  // 2. Get all active actes
  const actes = await db
    .prepare('SELECT * FROM actes_referentiel WHERE is_active = 1 ORDER BY code ASC')
    .all<ActeReferentielRow>();

  // 3. Group actes by famille_id
  const actesByFamille = new Map<string, ActeReferentielRow[]>();
  for (const acte of actes.results) {
    const fid = acte.famille_id || '__sans_famille__';
    if (!actesByFamille.has(fid)) actesByFamille.set(fid, []);
    actesByFamille.get(fid)!.push(acte);
  }

  // 4. Build result: only familles that have at least one acte (skip empty like merged FA0002)
  const result: ActesGroupeParFamille[] = familles.results.filter((fa) => actesByFamille.has(fa.id)).map((fa) => ({
    famille: { id: fa.id, code: fa.code, label: fa.label, ordre: fa.ordre },
    actes: (actesByFamille.get(fa.id) || []).map((row) => ({
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
      lettre_cle: row.lettre_cle,
    })),
  }));


  return result;
}
