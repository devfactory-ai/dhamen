/**
 * Validation du Matricule Fiscal tunisien (MF)
 *
 * Format complet : NNNNNNN/X/Y/Z/NNN (13 caractères sans séparateurs)
 *
 * Structure :
 * - 7 chiffres : identifiant séquentiel (zero-padded)
 * - 1 lettre  : clé de contrôle (A-Z sauf I, O, U — calculée modulo 23)
 * - 1 lettre  : code TVA (A, P, B, D, N)
 * - 1 lettre  : catégorie contribuable (M, P, C, N, E)
 * - 3 chiffres : établissement secondaire (000 = siège principal)
 *
 * Sources :
 * - python-stdnum (tn/mf.py)
 * - Acofis Tunisie, Profiscal, tunisia-sat forums
 */

/** Alphabet de la clé de contrôle : A-Z sans I, O, U (23 lettres) */
const CLE_ALPHABET = 'ABCDEFGHJKLMNPQRSTVWXYZ';

/** Codes TVA valides */
const CODES_TVA = new Set(['A', 'P', 'B', 'D', 'N']);

/** Codes catégorie valides */
const CODES_CATEGORIE = new Set(['M', 'P', 'C', 'N', 'E']);

/** Catégories attendues par type de praticien de santé */
const CATEGORIES_PAR_TYPE: Record<string, string[]> = {
  pharmacist: ['P', 'M'],  // Profession libérale ou société
  doctor: ['P'],            // Profession libérale
  lab: ['M', 'P'],          // Personne morale ou libérale
  clinic: ['M'],            // Personne morale
};

export interface MfValidationResult {
  valid: boolean;
  /** Format normalisé (majuscules, sans séparateurs, 13 chars) */
  normalized: string | null;
  /** Parties décomposées */
  parts: {
    identifiant: string;
    cle: string;
    codeTva: string;
    categorie: string;
    etablissement: string;
  } | null;
  /** Erreurs détaillées */
  errors: string[];
  /** Avertissements (non bloquants) */
  warnings: string[];
}

/**
 * Normalise un MF en supprimant les séparateurs courants
 * Accepte : 1234567/A/P/M/000, 1234567.A.P.M.000, 1234567-APM-000, 1234567APM000
 */
function normalizeMf(raw: string): string {
  return raw
    .trim()
    .toUpperCase()
    .replace(/[/.\-\s]/g, '');
}

/**
 * Calcule la clé de contrôle pour un identifiant à 7 chiffres
 * Algorithme : somme pondérée (poids 7→1) modulo 23 + 1 → lettre dans CLE_ALPHABET
 */
export function calculerCleMf(digits7: string): string | null {
  if (!/^[0-9]{7}$/.test(digits7)) return null;

  let sum = 0;
  for (let i = 0; i < 7; i++) {
    sum += Number.parseInt(digits7[i]!, 10) * (7 - i);
  }

  const index = (sum % 23);
  return CLE_ALPHABET[index] ?? null;
}

/**
 * Valide un matricule fiscal tunisien
 *
 * @param raw - Le MF brut (avec ou sans séparateurs)
 * @param providerType - Type de praticien pour vérifier la catégorie attendue
 * @returns Résultat détaillé de la validation
 */
export function validerMatriculeFiscal(
  raw: string,
  providerType?: 'pharmacist' | 'doctor' | 'lab' | 'clinic'
): MfValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!raw || raw.trim().length === 0) {
    return { valid: false, normalized: null, parts: null, errors: ['Matricule fiscal requis'], warnings: [] };
  }

  const normalized = normalizeMf(raw);

  // Accepter forme courte (8 chars = identifiant + clé) ou complète (13 chars)
  if (normalized.length === 8) {
    // Forme courte : seulement identifiant + clé
    const digits7 = normalized.slice(0, 7);
    const cle = normalized[7]!;

    if (!/^[0-9]{7}$/.test(digits7)) {
      errors.push('Les 7 premiers caractères doivent être des chiffres');
      return { valid: false, normalized, parts: null, errors, warnings };
    }

    if (!CLE_ALPHABET.includes(cle)) {
      errors.push(`Clé de contrôle '${cle}' invalide (I, O, U interdits)`);
      return { valid: false, normalized, parts: null, errors, warnings };
    }

    const expectedCle = calculerCleMf(digits7);
    if (expectedCle && cle !== expectedCle) {
      errors.push(`Clé de contrôle incorrecte : '${cle}' trouvé, '${expectedCle}' attendu`);
      return { valid: false, normalized, parts: null, errors, warnings };
    }

    warnings.push('Forme courte (8 chars) — code TVA, catégorie et établissement manquants');
    return {
      valid: true,
      normalized,
      parts: { identifiant: digits7, cle, codeTva: '', categorie: '', etablissement: '' },
      errors,
      warnings,
    };
  }

  if (normalized.length !== 13) {
    errors.push(`Longueur invalide : ${normalized.length} caractères (attendu : 13 ou 8)`);
    return { valid: false, normalized, parts: null, errors, warnings };
  }

  // Décomposer les 13 caractères
  const digits7 = normalized.slice(0, 7);
  const cle = normalized[7]!;
  const codeTva = normalized[8]!;
  const categorie = normalized[9]!;
  const etablissement = normalized.slice(10, 13);

  // 1. Valider les 7 chiffres
  if (!/^[0-9]{7}$/.test(digits7)) {
    errors.push('Les 7 premiers caractères doivent être des chiffres');
  }

  // 2. Valider la clé de contrôle
  if (!CLE_ALPHABET.includes(cle)) {
    errors.push(`Clé de contrôle '${cle}' invalide (lettres I, O, U interdites)`);
  } else {
    const expectedCle = calculerCleMf(digits7);
    if (expectedCle && cle !== expectedCle) {
      errors.push(`Clé de contrôle incorrecte : '${cle}' trouvé, '${expectedCle}' attendu`);
    }
  }

  // 3. Valider le code TVA
  if (!CODES_TVA.has(codeTva)) {
    errors.push(`Code TVA '${codeTva}' invalide (valides : A, P, B, D, N)`);
  }

  // 4. Valider la catégorie
  if (!CODES_CATEGORIE.has(categorie)) {
    errors.push(`Catégorie '${categorie}' invalide (valides : M, P, C, N, E)`);
  }

  // 5. Valider l'établissement
  if (!/^[0-9]{3}$/.test(etablissement)) {
    errors.push("Les 3 derniers caractères (établissement) doivent être des chiffres");
  }

  // 6. Règle croisée : si établissement != 000, catégorie doit être E
  if (etablissement !== '000' && categorie !== 'E') {
    errors.push(`Établissement secondaire (${etablissement}) requiert la catégorie 'E', trouvé '${categorie}'`);
  }
  if (categorie === 'E' && etablissement === '000') {
    warnings.push("Catégorie 'E' (établissement secondaire) avec numéro 000 — vérifiez");
  }

  // 7. Vérifier la cohérence avec le type de praticien
  if (providerType && CATEGORIES_PAR_TYPE[providerType] && errors.length === 0) {
    const expectedCategories = CATEGORIES_PAR_TYPE[providerType]!;
    if (!expectedCategories.includes(categorie)) {
      warnings.push(
        `Catégorie '${categorie}' inhabituelle pour un ${providerType} (attendu : ${expectedCategories.join(' ou ')})`
      );
    }
  }

  const parts = { identifiant: digits7, cle, codeTva, categorie, etablissement };

  return {
    valid: errors.length === 0,
    normalized,
    parts,
    errors,
    warnings,
  };
}

/**
 * Validation rapide : retourne true/false sans détails
 */
export function isMatriculeFiscalValid(raw: string): boolean {
  return validerMatriculeFiscal(raw).valid;
}

/**
 * Formate un MF normalisé avec séparateurs : NNNNNNN/X/Y/Z/NNN
 */
export function formaterMatriculeFiscal(normalized: string): string {
  const clean = normalizeMf(normalized);
  if (clean.length === 8) return clean;
  if (clean.length !== 13) return clean;
  return `${clean.slice(0, 7)}/${clean[7]}/${clean[8]}/${clean[9]}/${clean.slice(10)}`;
}
