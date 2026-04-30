import type {
  ActeInput,
  RemboursementActeResult,
  RemboursementBulletinResult,
} from '@dhamen/shared';
import { calculerRemboursementViaEngine } from '../lib/reimbursement/adapter';

/**
 * Reimbursement calculation service (REQ-009 / TASK-006)
 *
 * Production calculation is delegated to Engine A via the adapter layer.
 * This service retains: types, mappings, plafond updates, and legacy functions.
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
  fraisEngages: number; // in DT (dinars)
  dateSoin: string; // YYYY-MM-DD
  typeMaladie?: 'ordinaire' | 'chronique';
  medicationFamilyId?: string; // Famille thérapeutique du médicament (pour taux spécifique)
  nbrCle?: number; // Coefficient lettre-clé (ex: 120 pour B120, 50 pour KC50)
  nombreJours?: number; // Nombre de jours (hospitalisation, cures thermales)
  careType?: string; // Override care_type for guarantee lookup (e.g., chirurgie_refractive vs actes_courants)
}

export interface CalculRemboursementResult {
  montantRembourse: number; // in DT (dinars)
  typeCalcul: 'taux' | 'forfait';
  valeurBareme: number;
  plafondActeApplique: boolean;
  plafondJourApplique: boolean;
  plafondFamilleApplique: boolean;
  plafondGlobalApplique: boolean;
  details: {
    montantBrut: number;
    apresPlafondJour: number;
    apresPlafondActe: number;
    apresPlafondFamille: number;
    apresPlafondGlobal: number;
    plafondActeValeur: number | null; // in DT
    plafondJourValeur: number | null; // in DT
  };
  _debug?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Unit normalization helpers
// ---------------------------------------------------------------------------

/**
 * Convert millimes to DT (dinars).
 * All monetary values in contract_guarantees are stored in millimes (via barème TP extraction).
 * Bulletin amounts (total_amount, reimbursed_amount) are stored in DT.
 */
function toDinars(value: number | null | undefined): number | null {
  if (value == null) return null;
  return value / 1000;
}

/**
 * Normalize a letter-key value to DT.
 * letter_keys_json may store values in DT (0.27, 0.32) or millimes (270, 320) depending on source.
 * Heuristic: known letter-key unit values in Tunisia are 0.27–10 DT. Values >= 50 are millimes.
 */
function letterKeyValueToDinars(value: number): number {
  // If value looks like millimes (>= 50), convert; otherwise already DT
  return value >= 50 ? value / 1000 : value;
}

/**
 * Reverse mapping: care_type → famille_acte_id (for plafond initialization).
 */
const CARE_TYPE_TO_FAMILLE: Record<string, string> = {
  // Aligned with Acorad reference (migration 0144)
  consultation_visite: 'fa-001', consultation: 'fa-001',
  actes_courants: 'fa-009', medical_acts: 'fa-009',
  pharmacie: 'fa-003', pharmacy: 'fa-003',
  laboratoire: 'fa-004', laboratory: 'fa-004', lab: 'fa-004',
  orthopedie: 'fa-005', orthopedics: 'fa-005',
  optique: 'fa-006', optical: 'fa-006',
  hospitalisation: 'fa-007', hospitalization: 'fa-007', hospital: 'fa-007',
  hospitalisation_hopital: 'fa-007',
  chirurgie: 'fa-010', surgery: 'fa-010',
  chirurgie_fso: 'fa-010',
  chirurgie_usage_unique: 'fa-010',
  dentaire: 'fa-011', dental: 'fa-011',
  dentaire_prothese: 'fa-011',
  orthodontie: 'fa-011', orthodontics: 'fa-011',
  accouchement: 'fa-012', maternity: 'fa-012',
  accouchement_gemellaire: 'fa-012',
  interruption_grossesse: 'fa-012',
  cures_thermales: 'fa-013', thermal_cure: 'fa-013',
  frais_funeraires: 'fa-014', funeral: 'fa-014',
  circoncision: 'fa-015', circumcision: 'fa-015',
  transport: 'fa-016',
  chirurgie_refractive: 'fa-009', refractive_surgery: 'fa-009',
  sanatorium: 'fa-007',
};

export { CARE_TYPE_TO_FAMILLE };

// ---------------------------------------------------------------------------
// Family shared plafond: resolve principal adherent for ayants droit
// ---------------------------------------------------------------------------

/**
 * Resolve the principal adherent ID for global (family-shared) plafond lookups.
 * If the adherent is an ayant droit (conjoint/enfant), returns the parent_adherent_id.
 * If the adherent is a principal (or has no parent), returns the same adherentId.
 */
export async function resolvePrincipalAdherentId(
  db: D1Database,
  adherentId: string
): Promise<string> {
  const row = await db
    .prepare('SELECT parent_adherent_id FROM adherents WHERE id = ?')
    .bind(adherentId)
    .first<{ parent_adherent_id: string | null }>();
  return row?.parent_adherent_id || adherentId;
}

// ---------------------------------------------------------------------------
// Parse letter-key code: extract letter and coefficient from codes like "B120", "KC50", "Z30"
// ---------------------------------------------------------------------------

const KNOWN_LETTER_KEYS = ['AMM', 'AMO', 'AMY', 'AM', 'CS', 'KC', 'PC', 'B', 'C', 'D', 'E', 'K', 'Z'];

/**
 * Parse a composite acte code into its letter-key and numeric coefficient.
 * Examples: "B120" → { letter: "B", coefficient: 120 }
 *           "KC50" → { letter: "KC", coefficient: 50 }
 *           "C1"   → { letter: "C1", coefficient: null } (C1 is a specific acte, not a coefficient)
 *           "PH1"  → null (not a letter-key code)
 */
function parseLetterKeyCode(code: string): { letter: string; coefficient: number | null } | null {
  if (!code) return null;
  const upper = code.toUpperCase().trim();

  // Try longest prefixes first to match "AMM" before "AM", "KC" before "K"
  for (const key of KNOWN_LETTER_KEYS) {
    if (upper.startsWith(key) && upper.length > key.length) {
      const rest = upper.slice(key.length);
      const num = Number(rest);
      if (!isNaN(num) && num > 0 && Number.isInteger(num)) {
        return { letter: key, coefficient: num };
      }
    }
  }
  return null;
}

export { parseLetterKeyCode };

// ---------------------------------------------------------------------------
// Acte code → sub_limits_json key mapping
// Maps specific acte codes to their sub-limit key in contract_guarantees.sub_limits_json
// ---------------------------------------------------------------------------

const ACTE_CODE_TO_SUB_LIMIT_KEY: Record<string, string> = {
  // Optique (rubrique 4)
  MONTURE: 'monture',
  VERRES: 'verres_normaux',
  DOUBLES_FOYERS: 'doubles_foyers',
  LENTILLES: 'lentilles',
  // Chirurgie sub-components (rubrique 8)
  SO: 'salle_operation',
  ANE: 'anesthesie',
  PUU: 'medicaments_usage_unique',
};

// ---------------------------------------------------------------------------
// Mapping famille_actes → contract_guarantees care_type
// ---------------------------------------------------------------------------

const FAMILLE_TO_CARE_TYPES: Record<string, string[]> = {
  'fa-001': ['consultation_visite', 'consultation'],
  // fa-002 merged into fa-009

  'fa-003': ['pharmacie', 'pharmacy'],
  'fa-004': ['laboratoire', 'laboratory'],
  'fa-005': ['orthopedie', 'orthopedics'],
  'fa-006': ['optique', 'optical'],
  'fa-007': ['hospitalisation', 'hospitalisation_hopital', 'hospitalization', 'sanatorium'],
  'fa-009': ['actes_courants', 'medical_acts'],
  'fa-010': ['chirurgie', 'surgery', 'chirurgie_fso', 'chirurgie_usage_unique'],
  'fa-011': ['dentaire', 'dental', 'dentaire_prothese', 'orthodontie', 'orthodontics'],
  'fa-012': ['accouchement', 'maternity', 'accouchement_gemellaire', 'interruption_grossesse'],
  'fa-013': ['cures_thermales', 'thermal_cure'],
  'fa-014': ['frais_funeraires', 'funeral'],
  'fa-015': ['circoncision', 'circumcision'],
  'fa-016': ['transport'],
  'fa-017': ['actes_courants', 'medical_acts'], // Radiologie → actes courants
};

/**
 * @deprecated Legacy: calculerViaContractGuarantees has been replaced by the Engine A adapter.
 * Kept as dead code reference during shadow-mode transition.
 */
async function _legacyCalculerViaContractGuarantees(
  db: D1Database,
  groupContractId: string,
  familleId: string | null,
  fraisEngages: number,
  adherentId: string,
  contractId: string,
  annee: number,
  typeMaladie: 'ordinaire' | 'chronique',
  acteCode?: string,
  acteRate?: number,
  nbrCle?: number,
  nombreJours?: number,
  lettreCle?: string | null,
  careTypeOverride?: string,
): Promise<CalculRemboursementResult | null> {
  if (!familleId) return null;

  // If an explicit care_type override is provided, use it directly instead of famille mapping
  const careTypes = careTypeOverride
    ? [careTypeOverride]
    : FAMILLE_TO_CARE_TYPES[familleId];
  if (!careTypes || careTypes.length === 0) return null;

  // Build placeholders for IN clause
  const placeholders = careTypes.map(() => '?').join(', ');

  // ── Look up from contract_guarantees (source of truth, user-editable) ──
  // The most recently created active guarantee is always the source of truth:
  // - PUT /group-contracts deactivates all old rows, then INSERTs new ones
  // - Apply bareme-TP does the same (deactivate + insert)
  // So ORDER BY created_at DESC always gives the latest user-intent.
  const guarantee = await db
    .prepare(
      `SELECT care_type, reimbursement_rate, is_fixed_amount, annual_limit, per_event_limit,
              daily_limit, max_days, letter_keys_json, sub_limits_json, bareme_tp_id
       FROM contract_guarantees
       WHERE group_contract_id = ? AND care_type IN (${placeholders}) AND is_active = 1
       ORDER BY CASE WHEN care_type = 'hospitalisation' THEN 0 ELSE 1 END, created_at DESC
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
      max_days: number | null;
      letter_keys_json: string | null;
      sub_limits_json: string | null;
      bareme_tp_id: string | null;
    }>();

  if (!guarantee) return null;

  // Determine calculation type and rate
  const isFixed = guarantee.is_fixed_amount === 1;
  let rate = guarantee.reimbursement_rate ?? 0;

  // Normalize amounts: contract_guarantees may store DT or millimes depending on source.
  let perEventLimitDT = toDinars(guarantee.per_event_limit);
  const annualLimitDT = toDinars(guarantee.annual_limit);
  let dailyLimitDT = toDinars(guarantee.daily_limit);

  // Parse sub_limits_json for sub-category plafonds
  let subLimits: Record<string, number> | null = null;
  if (guarantee.sub_limits_json) {
    try { subLimits = JSON.parse(guarantee.sub_limits_json) as Record<string, number>; } catch { /* ignore */ }
  }

  // ── GAP 2: Hospitalisation hôpital vs clinique ──
  // Resolve daily limit by establishment type from sub_limits_json
  // Supports multiple key formats from different sources:
  //   Short: {"hopital": 10000, "clinique": 90000}
  //   Gemini: {"Plafond journalier en hôpital": 10000, "Plafond journalier en clinique": 90000}
  if (subLimits && (familleId === 'fa-007' || familleId === 'fa-008')) {
    const isHopital = familleId === 'fa-008';
    const keyVariants = isHopital
      ? ['hopital', 'hôpital', 'Plafond journalier en hôpital', 'Plafond journalier en hopital']
      : ['clinique', 'Plafond journalier en clinique'];
    for (const key of keyVariants) {
      // Try exact match and case-insensitive match
      const val = subLimits[key] ?? Object.entries(subLimits).find(([k]) => k.toLowerCase().includes(isHopital ? 'hopital' : 'clinique') && k.toLowerCase().includes('journalier'))?.[1];
      if (val != null) {
        dailyLimitDT = toDinars(val);
        break;
      }
    }
  }

  // ── GAP 1 & 3: Acte-code-based sub-limit override (optique, chirurgie) ──
  // If the acte code maps to a sub_limits_json key, apply that as per-event cap
  // and optionally override the rate (e.g., PUU médicaments usage unique = 90%)
  if (subLimits && acteCode) {
    const subKey = ACTE_CODE_TO_SUB_LIMIT_KEY[acteCode] || ACTE_CODE_TO_SUB_LIMIT_KEY[acteCode.toUpperCase()];
    if (subKey && subLimits[subKey] != null) {
      const subCapDT = toDinars(subLimits[subKey]!);
      if (subCapDT != null) {
        perEventLimitDT = subCapDT;
      }
      // Check for rate override: e.g., "medicaments_usage_unique_rate": 0.9
      const rateKey = `${subKey}_rate`;
      if (subLimits[rateKey] != null) {
        rate = subLimits[rateKey]!;
      } else if (acteRate != null && acteRate > 0 && acteRate !== rate) {
        // Use the acte's own rate if it differs from the guarantee's generic rate
        rate = acteRate;
      }
    }
  }

  let typeCalcul: 'taux' | 'forfait';
  let valeur: number;
  let montantBrut: number;

  // Resolve letter_keys: e.g., {"C1":45,"C2":55,"B":0.270,"KC":10}
  // Auto-parse coefficient from composite codes: "B120" → letter "B", coefficient 120
  let letterKeyValue: number | null = null;
  let resolvedCoeff: number | null = nbrCle ?? null;
  let matchedViaLettreCle = false; // true when matched via fallback lettre_cle (not direct code match)
  if (guarantee.letter_keys_json && acteCode) {
    try {
      const rawLetterKeys = JSON.parse(guarantee.letter_keys_json) as Record<string, number>;
      // Normalize letter_keys to uppercase for case-insensitive matching (handles "Kc" vs "KC")
      const letterKeys: Record<string, number> = {};
      for (const [k, v] of Object.entries(rawLetterKeys)) {
        letterKeys[k.toUpperCase()] = v;
      }
      const acteUpper = acteCode.toUpperCase();
      // Direct match first: e.g., code "C1" → letterKeys["C1"]
      if (letterKeys[acteUpper] !== undefined) {
        letterKeyValue = letterKeyValueToDinars(letterKeys[acteUpper]!);
      } else {
        // Try auto-parsing: "B120" → letter "B" (coefficient 120)
        const parsed = parseLetterKeyCode(acteCode);
        if (parsed && letterKeys[parsed.letter] !== undefined) {
          letterKeyValue = letterKeyValueToDinars(letterKeys[parsed.letter]!);
          if (!resolvedCoeff && parsed.coefficient) {
            resolvedCoeff = parsed.coefficient;
          }
        } else if (lettreCle && letterKeys[lettreCle.toUpperCase()] !== undefined) {
          // Fallback: use the acte's lettre_cle mapping (e.g., AN → B)
          letterKeyValue = letterKeyValueToDinars(letterKeys[lettreCle.toUpperCase()]!);
          matchedViaLettreCle = true;
        }
      }
    } catch { /* ignore parse errors */ }
  }

  if (letterKeyValue !== null && (resolvedCoeff || !matchedViaLettreCle)) {
    // Letter-key with coefficient (B120 → 120 × 0.320 = 38.4 DT) or direct match (C1 → 45 DT)
    const effectiveBase = (resolvedCoeff && resolvedCoeff > 0)
      ? resolvedCoeff * letterKeyValue
      : letterKeyValue;

    if (resolvedCoeff && resolvedCoeff > 0) {
      // Composite letter key with coefficient (KC50, B420): pure forfait
      // The letter_key value × coefficient IS the reimbursement amount, capped by facture.
      // The guarantee's reimbursement_rate does NOT apply here (e.g., chirurgie 90% is for FSO, not KC).
      typeCalcul = 'forfait';
      valeur = effectiveBase;
      montantBrut = Math.min(fraisEngages, effectiveBase);
    } else if (rate > 0 && rate < 1) {
      // Direct match (C1) with rate: e.g., consultation C1 at 85%, capped at base conventionnel
      typeCalcul = 'taux';
      valeur = rate;
      montantBrut = Math.floor(Math.min(fraisEngages, effectiveBase) * rate * 1000) / 1000;
    } else {
      // Pure forfait (rate=0 or rate=1): letter key IS the max reimbursement base
      typeCalcul = rate === 1 ? 'taux' : 'forfait';
      valeur = rate === 1 ? 1 : effectiveBase;
      montantBrut = Math.min(fraisEngages, effectiveBase);
    }
  } else if (letterKeyValue !== null && matchedViaLettreCle && !resolvedCoeff) {
    // Letter-key acte (e.g., AN→B) WITHOUT coefficient: use acte's own rate, not guarantee's 100%
    // The guarantee rate (100%) means "100% of conventional base", not "100% of any invoice".
    // Without coefficient, we can't compute the conventional base, so apply acte's taux as cap.
    const effectiveRate = (acteRate != null && acteRate > 0 && acteRate < 1) ? acteRate : (rate < 1 ? rate : 0.80);
    typeCalcul = 'taux';
    valeur = effectiveRate;
    montantBrut = Math.floor(fraisEngages * effectiveRate * 1000) / 1000;
  } else if (isFixed && perEventLimitDT) {
    // Fixed amount (forfait) — e.g., circoncision 200DT
    typeCalcul = 'forfait';
    valeur = perEventLimitDT;
    montantBrut = Math.min(fraisEngages, perEventLimitDT);
  } else if (rate > 0) {
    // Percentage-based — e.g., pharmacie 90%, labo 100%
    typeCalcul = 'taux';
    valeur = rate;
    montantBrut = Math.floor(fraisEngages * rate * 1000) / 1000;
  } else {
    // No rate and not fixed — can't calculate
    return null;
  }

  // ── Daily limit × nombre de jours (hospitalisation, cures thermales) ──
  // Apply max_days cap, then calculate: min(frais_jour, daily_limit) × jours
  let plafondJourApplique = false;
  if (dailyLimitDT != null) {
    if (nombreJours && nombreJours > 0) {
      const maxDays = guarantee.max_days;
      const joursEffectifs = (maxDays && maxDays > 0) ? Math.min(nombreJours, maxDays) : nombreJours;
      const capJour = dailyLimitDT * joursEffectifs;
      if (montantBrut > capJour) {
        montantBrut = capJour;
        plafondJourApplique = true;
      }
    } else if (montantBrut > dailyLimitDT) {
      // Fallback: no jours provided → cap at daily limit (1 day, legacy behavior)
      montantBrut = dailyLimitDT;
      plafondJourApplique = true;
    }
  }

  // Apply per-event plafond (in DT) — includes sub-limit overrides from gaps 1 & 3
  let apresPlafondActe = montantBrut;
  let plafondActeApplique = false;
  if (perEventLimitDT && !isFixed && apresPlafondActe > perEventLimitDT) {
    apresPlafondActe = perEventLimitDT;
    plafondActeApplique = true;
  }

  // Resolve effective annual limit (DT): check sub_limits by typeMaladie first
  let effectiveAnnualLimitDT = annualLimitDT;
  if (subLimits) {
    // Sub-limits may use various key formats:
    //   "ordinaire", "chronique" (short) or
    //   "maladies_ordinaires", "maladies_chroniques" (Gemini extraction)
    const subKeyVariants: Record<string, string[]> = {
      ordinaire: ['ordinaire', 'maladies_ordinaires'],
      chronique: ['chronique', 'maladies_chroniques'],
    };
    const candidates = subKeyVariants[typeMaladie] ?? [typeMaladie];
    for (const key of candidates) {
      if (subLimits[key] != null) {
        const subVal = toDinars(subLimits[key]!);
        if (subVal != null) {
          effectiveAnnualLimitDT = subVal;
          break;
        }
      }
    }
  }

  // Apply annual plafond from contract_guarantees
  let apresPlafondFamille = apresPlafondActe;
  let plafondFamilleApplique = false;
  if (effectiveAnnualLimitDT) {
    // Check consumed amount in plafonds_beneficiaire
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
      // plafonds_beneficiaire stores amounts in millimes, calculation is in dinars (÷1000)
      const restant = Math.max(0, (plafondRow.montant_plafond - plafondRow.montant_consomme) / 1000);
      if (apresPlafondFamille > restant) {
        apresPlafondFamille = restant;
        plafondFamilleApplique = true;
      }
    } else {
      // No plafond row exists — compute consumed amount from actual bulletins for this famille
      // This handles the case where plafonds_beneficiaire was never initialized (e.g., guarantee added after contract creation)
      // Use care_type on bulletins_soins (always present) to match the famille
      const familleCareTypes = FAMILLE_TO_CARE_TYPES[familleId!] ?? [];
      let consumedDT = 0;
      if (familleCareTypes.length > 0) {
        const ctPlaceholders = familleCareTypes.map(() => '?').join(', ');
        const consumedRow = await db
          .prepare(
            `SELECT COALESCE(SUM(bs.reimbursed_amount), 0) as total_consumed
             FROM bulletins_soins bs
             WHERE bs.adherent_id = ? AND bs.status NOT IN ('rejected', 'cancelled')
               AND strftime('%Y', bs.bulletin_date) = ?
               AND bs.care_type IN (${ctPlaceholders})`
          )
          .bind(adherentId, String(annee), ...familleCareTypes)
          .first<{ total_consumed: number }>();
        consumedDT = (consumedRow?.total_consumed ?? 0) / 1000;
      }
      const restant = Math.max(0, effectiveAnnualLimitDT - consumedDT);
      if (apresPlafondFamille > restant) {
        apresPlafondFamille = restant;
        plafondFamilleApplique = true;
      }
    }
  }

  // Apply individual global plafond (per member)
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
    const restantGlobal = Math.max(0, (plafondGlobal.montant_plafond - plafondGlobal.montant_consomme) / 1000);
    if (apresPlafondGlobal > restantGlobal) {
      apresPlafondGlobal = restantGlobal;
      plafondGlobalApplique = true;
    }
  }

  // Apply family-wide contract plafond (sum of all family members' consumption vs contract limit)
  const apresPlafondContrat = await appliquerPlafondContratFamille(
    db, adherentId, groupContractId, annee, apresPlafondGlobal
  );
  if (apresPlafondContrat !== null && apresPlafondContrat < apresPlafondGlobal) {
    apresPlafondGlobal = apresPlafondContrat;
    plafondGlobalApplique = true;
  }

  return {
    montantRembourse: Math.max(0, apresPlafondGlobal),
    typeCalcul,
    valeurBareme: valeur,
    plafondActeApplique,
    plafondJourApplique,
    plafondFamilleApplique,
    plafondGlobalApplique,
    details: {
      montantBrut,
      apresPlafondJour: montantBrut, // daily limit already folded into montantBrut in path B
      apresPlafondActe,
      apresPlafondFamille,
      apresPlafondGlobal,
      plafondActeValeur: perEventLimitDT,
      plafondJourValeur: dailyLimitDT,
    },
    _debug: {
      path: 'guarantees', effectiveAnnualLimitDT, familleId,
      annualLimit: guarantee.annual_limit,
      baremeLinked: !!guarantee.bareme_tp_id,
      groupContractId,
      careTypesQueried: careTypes,
      guaranteeCareType: guarantee.care_type,
    },
  };
}

// ---------------------------------------------------------------------------
// Main entry point — delegates to Engine A via adapter
// ---------------------------------------------------------------------------

/**
 * Shared context cache for batch reimbursement calculation.
 * Avoids repeating identical DB lookups across multiple actes in the same bulletin.
 */
export interface CalculBatchContext {
  baremeContractId?: string;
  periodeId?: string | null;
  plafondGlobal?: { montant_plafond: number; montant_consomme: number } | null;
  _resolved?: boolean;
}

export async function calculerRemboursement(
  db: D1Database,
  input: CalculRemboursementInput,
  batchCtx?: CalculBatchContext
): Promise<CalculRemboursementResult> {
  return calculerRemboursementViaEngine(db, input, batchCtx);
}

// ---------------------------------------------------------------------------
// Family-wide contract plafond check (4th level)
// ---------------------------------------------------------------------------

/**
 * Check the family-wide contract plafond (annual_global_limit from group_contracts).
 * Sums consumption across ALL family members (principal + ayants droit) and checks
 * against the contract's global limit.
 *
 * Returns the capped amount if the family plafond is exceeded, or null if no limit applies.
 */
async function appliquerPlafondContratFamille(
  db: D1Database,
  adherentId: string,
  groupContractId: string,
  annee: number,
  montantPropose: number
): Promise<number | null> {
  // Get contract's family-wide global limit
  const contract = await db
    .prepare('SELECT annual_global_limit FROM group_contracts WHERE id = ?')
    .bind(groupContractId)
    .first<{ annual_global_limit: number | null }>();

  if (!contract?.annual_global_limit || contract.annual_global_limit <= 0) return null;

  const limiteDT = toDinars(contract.annual_global_limit) ?? contract.annual_global_limit;

  // Resolve principal: if ayant droit, get parent; else self
  const principalId = await resolvePrincipalAdherentId(db, adherentId);

  // Sum consumption across ALL family members (principal + ayants droit)
  // Global plafonds (famille_acte_id IS NULL) track total consumption per member
  const familyConsumption = await db
    .prepare(
      `SELECT COALESCE(SUM(montant_consomme), 0) as total_consomme
       FROM plafonds_beneficiaire
       WHERE contract_id = ? AND annee = ? AND famille_acte_id IS NULL
         AND adherent_id IN (
           SELECT ? UNION ALL
           SELECT id FROM adherents WHERE parent_adherent_id = ?
         )`
    )
    .bind(groupContractId, annee, principalId, principalId)
    .first<{ total_consomme: number }>();

  if (!familyConsumption) return null;

  const totalConsommeDT = familyConsumption.total_consomme / 1000;
  const restantFamille = Math.max(0, limiteDT - totalConsommeDT);

  if (montantPropose > restantFamille) {
    return restantFamille;
  }

  return null; // No cap needed
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
  typeMaladie: 'ordinaire' | 'chronique' = 'ordinaire',
  cachedGroupContractId?: string
): Promise<void> {
  // Resolve group_contract_id for plafond lookup (use cache if provided)
  let plafondContractId = contractId;
  if (cachedGroupContractId !== undefined) {
    plafondContractId = cachedGroupContractId;
  } else {
    const contractRow = await db
      .prepare('SELECT group_contract_id FROM contracts WHERE id = ?')
      .bind(contractId)
      .first<{ group_contract_id: string | null }>();
    if (contractRow?.group_contract_id) {
      plafondContractId = contractRow.group_contract_id;
    }
  }

  // Update famille plafond — per individual adherent (try individual contract first, then group)
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

  // Update individual global plafond (per member, NOT shared)
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
  const remboursementBrut = Math.floor(montantActe * tauxRemboursement * 1000) / 1000;
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
