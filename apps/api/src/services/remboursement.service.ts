import type {
  ActeInput,
  RemboursementActeResult,
  RemboursementBulletinResult,
} from '@dhamen/shared';

/**
 * Reimbursement calculation service (REQ-009 / TASK-006)
 *
 * Supports contract baremes (taux/forfait per period) and 3-level plafonds:
 *   1. Plafond per act
 *   2. Plafond per family/year
 *   3. Plafond global/year
 *
 * Distinguishes between ordinary and chronic illness types for pharmacy plafonds.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface D1Database {
  prepare(query: string): D1PreparedStatement;
  batch<T = unknown>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]>;
}

interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T = unknown>(): Promise<T | null>;
  run(): Promise<D1Result>;
}

interface D1Result<T = unknown> {
  results?: T[];
  success: boolean;
  meta: Record<string, unknown>;
}

export interface CalculRemboursementInput {
  adherentId: string;
  contractId: string;
  acteRefId: string;
  fraisEngages: number; // in millimes
  dateSoin: string; // YYYY-MM-DD
  typeMaladie?: 'ordinaire' | 'chronique';
  medicationFamilyId?: string; // Famille thérapeutique du médicament (pour taux spécifique)
}

export interface CalculRemboursementResult {
  montantRembourse: number; // in millimes
  typeCalcul: 'taux' | 'forfait';
  valeurBareme: number;
  plafondActeApplique: boolean;
  plafondFamilleApplique: boolean;
  plafondGlobalApplique: boolean;
  details: {
    montantBrut: number;
    apresPlafondActe: number;
    apresPlafondFamille: number;
    apresPlafondGlobal: number;
  };
}

// ---------------------------------------------------------------------------
// Mapping famille_actes → contract_guarantees care_type
// ---------------------------------------------------------------------------

const FAMILLE_TO_CARE_TYPES: Record<string, string[]> = {
  'fa-001': ['consultation_visite', 'consultation'],
  'fa-002': ['actes_courants', 'medical_acts'],
  'fa-003': ['pharmacie', 'pharmacy'],
  'fa-004': ['laboratoire', 'laboratory'],
  'fa-005': ['orthopedie', 'orthopedics'],
  'fa-006': ['optique', 'optical'],
  'fa-007': ['hospitalisation', 'hospitalization'],
  'fa-008': ['hospitalisation', 'hospitalization'],
  'fa-009': ['actes_courants', 'medical_acts'],
  'fa-010': ['chirurgie', 'surgery'],
  'fa-011': ['dentaire', 'dental'],
  'fa-012': ['accouchement', 'maternity'],
  'fa-013': ['cures_thermales', 'thermal_cure'],
  'fa-014': ['orthodontie', 'orthodontics'],
  'fa-015': ['circoncision', 'circumcision'],
  'fa-016': ['transport'],
  'fa-017': ['actes_courants', 'medical_acts'], // Radiologie → actes courants
  'fa-019': ['frais_funeraires', 'funeral'],
};

/**
 * Fallback: Calculate reimbursement using contract_guarantees when no contrat_baremes exist.
 * Maps the acte's famille_id to a care_type and looks up the guarantee in contract_guarantees.
 */
async function calculerViaContractGuarantees(
  db: D1Database,
  groupContractId: string,
  familleId: string | null,
  fraisEngages: number,
  adherentId: string,
  contractId: string,
  annee: number,
  typeMaladie: 'ordinaire' | 'chronique',
): Promise<CalculRemboursementResult | null> {
  if (!familleId) return null;

  const careTypes = FAMILLE_TO_CARE_TYPES[familleId];
  if (!careTypes || careTypes.length === 0) return null;

  // Build placeholders for IN clause
  const placeholders = careTypes.map(() => '?').join(', ');
  const guarantee = await db
    .prepare(
      `SELECT care_type, reimbursement_rate, is_fixed_amount, annual_limit, per_event_limit,
              daily_limit, letter_keys_json, sub_limits_json
       FROM contract_guarantees
       WHERE group_contract_id = ? AND care_type IN (${placeholders}) AND is_active = 1
       LIMIT 1`
    )
    .bind(groupContractId, ...careTypes)
    .first<{
      care_type: string;
      reimbursement_rate: number | null;
      is_fixed_amount: number;
      annual_limit: number | null;
      per_event_limit: number | null;
      daily_limit: number | null;
      letter_keys_json: string | null;
      sub_limits_json: string | null;
    }>();

  if (!guarantee) return null;

  // Determine calculation type and rate
  const isFixed = guarantee.is_fixed_amount === 1;
  const rate = guarantee.reimbursement_rate ?? 0;

  // For letter-key based guarantees (e.g., consultation C1=45DT), use per_event_limit as forfait
  // For rate-based guarantees, apply rate to fraisEngages
  let typeCalcul: 'taux' | 'forfait';
  let valeur: number;
  let montantBrut: number;

  if (isFixed && guarantee.per_event_limit) {
    // Fixed amount (forfait) — e.g., circoncision 200DT, consultation C1=45DT
    typeCalcul = 'forfait';
    valeur = guarantee.per_event_limit;
    montantBrut = Math.min(fraisEngages, guarantee.per_event_limit);
  } else if (rate > 0) {
    // Percentage-based — e.g., pharmacie 90%, labo 100%
    typeCalcul = 'taux';
    valeur = rate;
    montantBrut = Math.round(fraisEngages * rate);
  } else {
    // No rate and not fixed — can't calculate
    return null;
  }

  // Apply per-event plafond
  let apresPlafondActe = montantBrut;
  let plafondActeApplique = false;
  if (guarantee.per_event_limit && !isFixed && apresPlafondActe > guarantee.per_event_limit) {
    apresPlafondActe = guarantee.per_event_limit;
    plafondActeApplique = true;
  }

  // Apply annual plafond from contract_guarantees
  let apresPlafondFamille = apresPlafondActe;
  let plafondFamilleApplique = false;
  if (guarantee.annual_limit) {
    // Check consumed amount in plafonds_beneficiaire, or estimate from existing bulletins
    let plafondRow = await db
      .prepare(
        `SELECT montant_plafond, montant_consomme FROM plafonds_beneficiaire
         WHERE adherent_id = ? AND contract_id = ? AND annee = ? AND famille_acte_id = ? AND type_maladie = ?`
      )
      .bind(adherentId, contractId, annee, familleId, typeMaladie)
      .first<{ montant_plafond: number; montant_consomme: number }>();

    if (!plafondRow) {
      plafondRow = await db
        .prepare(
          `SELECT montant_plafond, montant_consomme FROM plafonds_beneficiaire
           WHERE adherent_id = ? AND contract_id = ? AND annee = ? AND famille_acte_id = ? AND type_maladie = ?`
        )
        .bind(adherentId, groupContractId, annee, familleId, typeMaladie)
        .first<{ montant_plafond: number; montant_consomme: number }>();
    }

    if (plafondRow) {
      const restant = Math.max(0, plafondRow.montant_plafond - plafondRow.montant_consomme);
      if (apresPlafondFamille > restant) {
        apresPlafondFamille = restant;
        plafondFamilleApplique = true;
      }
    }
    // If no plafond row exists yet, the full annual limit is available (no deduction)
  }

  // Apply global plafond
  let apresPlafondGlobal = apresPlafondFamille;
  let plafondGlobalApplique = false;
  let plafondGlobal = await db
    .prepare(
      `SELECT montant_plafond, montant_consomme FROM plafonds_beneficiaire
       WHERE adherent_id = ? AND contract_id = ? AND annee = ? AND famille_acte_id IS NULL AND type_maladie = 'ordinaire'`
    )
    .bind(adherentId, contractId, annee)
    .first<{ montant_plafond: number; montant_consomme: number }>();

  if (!plafondGlobal) {
    plafondGlobal = await db
      .prepare(
        `SELECT montant_plafond, montant_consomme FROM plafonds_beneficiaire
         WHERE adherent_id = ? AND contract_id = ? AND annee = ? AND famille_acte_id IS NULL AND type_maladie = 'ordinaire'`
      )
      .bind(adherentId, groupContractId, annee)
      .first<{ montant_plafond: number; montant_consomme: number }>();
  }

  if (plafondGlobal) {
    const restantGlobal = Math.max(0, plafondGlobal.montant_plafond - plafondGlobal.montant_consomme);
    if (apresPlafondGlobal > restantGlobal) {
      apresPlafondGlobal = restantGlobal;
      plafondGlobalApplique = true;
    }
  }

  return {
    montantRembourse: Math.max(0, apresPlafondGlobal),
    typeCalcul,
    valeurBareme: valeur,
    plafondActeApplique,
    plafondFamilleApplique,
    plafondGlobalApplique,
    details: {
      montantBrut,
      apresPlafondActe,
      apresPlafondFamille,
      apresPlafondGlobal,
    },
  };
}

// ---------------------------------------------------------------------------
// New contract-bareme-aware reimbursement calculation
// ---------------------------------------------------------------------------

/**
 * Calculate reimbursement for a single act using contract baremes and 3-level plafonds.
 *
 * Flow:
 *   1. Find active period for the contract at the date of care
 *   2. Look up acte in actes_referentiel (to get famille_id and defaults)
 *   3. Find bareme in contrat_baremes (by acte_ref_id, then by famille_id)
 *   4. Calculate base reimbursement (taux or forfait)
 *   5. Apply plafond per act
 *   6. Apply plafond per family/year
 *   7. Apply plafond global/year
 */
export async function calculerRemboursement(
  db: D1Database,
  input: CalculRemboursementInput
): Promise<CalculRemboursementResult> {
  const {
    adherentId,
    contractId,
    acteRefId,
    fraisEngages,
    dateSoin,
    typeMaladie = 'ordinaire',
    medicationFamilyId,
  } = input;
  const annee = Number(dateSoin.split('-')[0]);

  // 1. Resolve group_contract_id from individual contract (for baremes/periodes lookup)
  //    Individual contracts (table `contracts`) link to group_contracts via group_contract_id.
  //    Baremes and periodes are stored at the group_contract level.
  let baremeContractId = contractId;
  const contractRow = await db
    .prepare('SELECT group_contract_id FROM contracts WHERE id = ?')
    .bind(contractId)
    .first<{ group_contract_id: string | null }>();
  if (contractRow?.group_contract_id) {
    baremeContractId = contractRow.group_contract_id;
  }

  // Find the active period for this contract and date
  // Try with baremeContractId (group_contract_id) first, fallback to contractId directly
  let periode = await db
    .prepare(
      `SELECT cp.id FROM contrat_periodes cp
       WHERE cp.contract_id = ? AND cp.is_active = 1
         AND cp.date_debut <= ? AND cp.date_fin >= ?`
    )
    .bind(baremeContractId, dateSoin, dateSoin)
    .first<{ id: string }>();

  if (!periode && baremeContractId !== contractId) {
    periode = await db
      .prepare(
        `SELECT cp.id FROM contrat_periodes cp
         WHERE cp.contract_id = ? AND cp.is_active = 1
           AND cp.date_debut <= ? AND cp.date_fin >= ?`
      )
      .bind(contractId, dateSoin, dateSoin)
      .first<{ id: string }>();
  }

  // 2. Get the acte info (to know famille_id and defaults)
  const acte = await db
    .prepare(
      'SELECT id, famille_id, type_calcul, valeur_base, taux_remboursement, plafond_acte FROM actes_referentiel WHERE id = ?'
    )
    .bind(acteRefId)
    .first<{
      id: string;
      famille_id: string | null;
      type_calcul: string;
      valeur_base: number | null;
      taux_remboursement: number;
      plafond_acte: number | null;
    }>();

  if (!acte) {
    throw new Error('ACTE_NOT_FOUND: Acte referentiel non trouve');
  }

  // -----------------------------------------------------------------------
  // FALLBACK: If no contrat_periodes/contrat_baremes, use contract_guarantees
  // -----------------------------------------------------------------------
  if (!periode) {
    const guaranteeResult = await calculerViaContractGuarantees(
      db, baremeContractId, acte.famille_id, fraisEngages, adherentId, contractId, annee, typeMaladie
    );
    if (guaranteeResult) return guaranteeResult;
    // If no guarantee found either, throw
    throw new Error('BAREME_NOT_FOUND: Aucune periode active ni garantie trouvee pour ce contrat');
  }

  // 3. Find bareme for this acte in this period (first by acte_ref_id, then by famille_id)
  let bareme = await db
    .prepare(
      `SELECT type_calcul, valeur, plafond_acte, plafond_famille_annuel
       FROM contrat_baremes WHERE periode_id = ? AND acte_ref_id = ?`
    )
    .bind(periode.id, acteRefId)
    .first<{
      type_calcul: string;
      valeur: number;
      plafond_acte: number | null;
      plafond_famille_annuel: number | null;
    }>();

  if (!bareme && acte.famille_id) {
    bareme = await db
      .prepare(
        `SELECT type_calcul, valeur, plafond_acte, plafond_famille_annuel
         FROM contrat_baremes WHERE periode_id = ? AND famille_id = ? AND acte_ref_id IS NULL`
      )
      .bind(periode.id, acte.famille_id)
      .first<{
        type_calcul: string;
        valeur: number;
        plafond_acte: number | null;
        plafond_famille_annuel: number | null;
      }>();
  }

  // 3b. If this is a pharmacy act with a medication family, check for medication family bareme
  //     This allows time-based rates per medication therapeutic family (ATB, CVS, etc.)
  let medFamilyBareme: {
    taux_remboursement: number;
    plafond_acte: number | null;
    plafond_famille_annuel: number | null;
  } | null = null;

  if (medicationFamilyId) {
    // Try baremeContractId (group_contract) first, then individual contractId
    medFamilyBareme = await db
      .prepare(
        `SELECT taux_remboursement, plafond_acte, plafond_famille_annuel
         FROM medication_family_baremes
         WHERE contract_id = ? AND medication_family_id = ? AND is_active = 1
           AND date_effet <= ? AND (date_fin_effet IS NULL OR date_fin_effet >= ?)
         ORDER BY date_effet DESC LIMIT 1`
      )
      .bind(baremeContractId, medicationFamilyId, dateSoin, dateSoin)
      .first<{
        taux_remboursement: number;
        plafond_acte: number | null;
        plafond_famille_annuel: number | null;
      }>();
    if (!medFamilyBareme && baremeContractId !== contractId) {
      medFamilyBareme = await db
        .prepare(
          `SELECT taux_remboursement, plafond_acte, plafond_famille_annuel
           FROM medication_family_baremes
           WHERE contract_id = ? AND medication_family_id = ? AND is_active = 1
             AND date_effet <= ? AND (date_fin_effet IS NULL OR date_fin_effet >= ?)
           ORDER BY date_effet DESC LIMIT 1`
        )
        .bind(contractId, medicationFamilyId, dateSoin, dateSoin)
        .first<{
          taux_remboursement: number;
          plafond_acte: number | null;
          plafond_famille_annuel: number | null;
        }>();
    }
  }

  // Resolution order: medication family bareme > contract bareme (acte/famille) > acte defaults
  const typeCalcul = medFamilyBareme
    ? 'taux' as const
    : (bareme?.type_calcul || acte.type_calcul) as 'taux' | 'forfait';
  const valeur = medFamilyBareme
    ? medFamilyBareme.taux_remboursement
    : bareme?.valeur ?? (typeCalcul === 'forfait' ? acte.valeur_base : acte.taux_remboursement) ?? 0;
  const plafondActe = medFamilyBareme?.plafond_acte ?? bareme?.plafond_acte ?? acte.plafond_acte;
  const plafondFamilleAnnuel = medFamilyBareme?.plafond_famille_annuel ?? bareme?.plafond_famille_annuel ?? null;

  // 4. Calculate base reimbursement
  let montantBrut: number;
  if (typeCalcul === 'forfait') {
    montantBrut = Math.min(fraisEngages, valeur);
  } else {
    montantBrut = Math.round(fraisEngages * valeur);
  }

  // 5. Apply plafond acte
  let apresPlafondActe = montantBrut;
  let plafondActeApplique = false;
  if (plafondActe !== null && apresPlafondActe > plafondActe) {
    apresPlafondActe = plafondActe;
    plafondActeApplique = true;
  }

  // 6. Apply plafond famille/an
  //    Plafonds are stored with either the individual contractId or the baremeContractId
  let apresPlafondFamille = apresPlafondActe;
  let plafondFamilleApplique = false;
  if (plafondFamilleAnnuel !== null && acte.famille_id) {
    // Try individual contract first, then group contract
    let plafondRow = await db
      .prepare(
        `SELECT montant_plafond, montant_consomme FROM plafonds_beneficiaire
         WHERE adherent_id = ? AND contract_id = ? AND annee = ? AND famille_acte_id = ? AND type_maladie = ?`
      )
      .bind(adherentId, contractId, annee, acte.famille_id, typeMaladie)
      .first<{ montant_plafond: number; montant_consomme: number }>();

    if (!plafondRow && baremeContractId !== contractId) {
      plafondRow = await db
        .prepare(
          `SELECT montant_plafond, montant_consomme FROM plafonds_beneficiaire
           WHERE adherent_id = ? AND contract_id = ? AND annee = ? AND famille_acte_id = ? AND type_maladie = ?`
        )
        .bind(adherentId, baremeContractId, annee, acte.famille_id, typeMaladie)
        .first<{ montant_plafond: number; montant_consomme: number }>();
    }

    if (plafondRow) {
      const restant = Math.max(0, plafondRow.montant_plafond - plafondRow.montant_consomme);
      if (apresPlafondFamille > restant) {
        apresPlafondFamille = restant;
        plafondFamilleApplique = true;
      }
    }
  }

  // 7. Apply plafond global/an
  let apresPlafondGlobal = apresPlafondFamille;
  let plafondGlobalApplique = false;
  let plafondGlobal = await db
    .prepare(
      `SELECT montant_plafond, montant_consomme FROM plafonds_beneficiaire
       WHERE adherent_id = ? AND contract_id = ? AND annee = ? AND famille_acte_id IS NULL AND type_maladie = 'ordinaire'`
    )
    .bind(adherentId, contractId, annee)
    .first<{ montant_plafond: number; montant_consomme: number }>();

  if (!plafondGlobal && baremeContractId !== contractId) {
    plafondGlobal = await db
      .prepare(
        `SELECT montant_plafond, montant_consomme FROM plafonds_beneficiaire
         WHERE adherent_id = ? AND contract_id = ? AND annee = ? AND famille_acte_id IS NULL AND type_maladie = 'ordinaire'`
      )
      .bind(adherentId, baremeContractId, annee)
      .first<{ montant_plafond: number; montant_consomme: number }>();
  }

  if (plafondGlobal) {
    const restantGlobal = Math.max(
      0,
      plafondGlobal.montant_plafond - plafondGlobal.montant_consomme
    );
    if (apresPlafondGlobal > restantGlobal) {
      apresPlafondGlobal = restantGlobal;
      plafondGlobalApplique = true;
    }
  }

  return {
    montantRembourse: Math.max(0, apresPlafondGlobal),
    typeCalcul,
    valeurBareme: valeur,
    plafondActeApplique,
    plafondFamilleApplique,
    plafondGlobalApplique,
    details: {
      montantBrut,
      apresPlafondActe,
      apresPlafondFamille,
      apresPlafondGlobal,
    },
  };
}

// ---------------------------------------------------------------------------
// Plafond consumption update (called after bulletin validation)
// ---------------------------------------------------------------------------

/**
 * Update plafond consumption counters after a bulletin has been validated.
 * Increments both the family-level plafond (if applicable) and the global plafond.
 */
export async function mettreAJourPlafonds(
  db: D1Database,
  adherentId: string,
  contractId: string,
  annee: number,
  familleActeId: string | null,
  montant: number,
  typeMaladie: 'ordinaire' | 'chronique' = 'ordinaire'
): Promise<void> {
  // Resolve group_contract_id for plafond lookup (plafonds may be stored under group contract)
  let plafondContractId = contractId;
  const contractRow = await db
    .prepare('SELECT group_contract_id FROM contracts WHERE id = ?')
    .bind(contractId)
    .first<{ group_contract_id: string | null }>();
  if (contractRow?.group_contract_id) {
    plafondContractId = contractRow.group_contract_id;
  }

  // Update famille plafond (try individual first, then group)
  if (familleActeId) {
    const result = await db
      .prepare(
        `UPDATE plafonds_beneficiaire SET montant_consomme = montant_consomme + ?, updated_at = datetime('now')
         WHERE adherent_id = ? AND contract_id = ? AND annee = ? AND famille_acte_id = ? AND type_maladie = ?`
      )
      .bind(montant, adherentId, contractId, annee, familleActeId, typeMaladie)
      .run();
    if (result.meta.changes === 0 && plafondContractId !== contractId) {
      await db
        .prepare(
          `UPDATE plafonds_beneficiaire SET montant_consomme = montant_consomme + ?, updated_at = datetime('now')
           WHERE adherent_id = ? AND contract_id = ? AND annee = ? AND famille_acte_id = ? AND type_maladie = ?`
        )
        .bind(montant, adherentId, plafondContractId, annee, familleActeId, typeMaladie)
        .run();
    }
  }

  // Update global plafond (try individual first, then group)
  const globalResult = await db
    .prepare(
      `UPDATE plafonds_beneficiaire SET montant_consomme = montant_consomme + ?, updated_at = datetime('now')
       WHERE adherent_id = ? AND contract_id = ? AND annee = ? AND famille_acte_id IS NULL`
    )
    .bind(montant, adherentId, contractId, annee)
    .run();
  if (globalResult.meta.changes === 0 && plafondContractId !== contractId) {
    await db
      .prepare(
        `UPDATE plafonds_beneficiaire SET montant_consomme = montant_consomme + ?, updated_at = datetime('now')
         WHERE adherent_id = ? AND contract_id = ? AND annee = ? AND famille_acte_id IS NULL`
      )
      .bind(montant, adherentId, plafondContractId, annee)
      .run();
  }
}

// ---------------------------------------------------------------------------
// Legacy functions (kept for backward compatibility)
// ---------------------------------------------------------------------------

/**
 * Calculate reimbursement for a single medical act (legacy simple calculation).
 *
 * @deprecated Use calculerRemboursement for contract-bareme-aware calculation.
 *
 * Rule: remboursement_brut = montant * taux
 *       remboursement_final = min(remboursement_brut, plafond_restant)
 */
export function calculateRemboursementActe(
  montantActe: number,
  tauxRemboursement: number,
  plafondRestant: number
): RemboursementActeResult {
  const remboursementBrut = Math.round(montantActe * tauxRemboursement);
  const remboursementFinal = Math.min(remboursementBrut, Math.max(plafondRestant, 0));
  const plafondDepasse = remboursementBrut > plafondRestant;

  return {
    code: '',
    label: '',
    montantActe,
    tauxRemboursement,
    remboursementBrut,
    remboursementFinal,
    plafondDepasse,
  };
}

/**
 * Calculate reimbursement for all acts in a bulletin (legacy simple calculation).
 * Iterates through acts and decrements the remaining plafond progressively.
 *
 * @deprecated Use calculerRemboursement per-act for contract-bareme-aware calculation.
 */
export function calculateRemboursementBulletin(
  actes: ActeInput[],
  plafondRestant: number
): RemboursementBulletinResult {
  let remaining = plafondRestant;
  const results: RemboursementActeResult[] = [];

  for (const acte of actes) {
    const result = calculateRemboursementActe(acte.montantActe, acte.tauxRemboursement, remaining);
    result.code = acte.code;
    result.label = acte.label;

    remaining -= result.remboursementFinal;
    results.push(result);
  }

  const totalRembourse = results.reduce((sum, r) => sum + r.remboursementFinal, 0);

  return {
    actes: results,
    totalRembourse,
    plafondRestantApres: remaining,
  };
}
