/**
 * Adapter: DB → Engine A bridge.
 *
 * Converts database rows (contract_guarantees, contrat_baremes, plafonds_beneficiaire)
 * into Engine A types, delegates calculation, then converts back to service result format.
 *
 * Unit conversions:
 *  - DB reimbursement_rate: 0–1 decimal → Engine rate: 0–100 integer
 *  - DB annual_global_limit: DT → Engine: millimes (×1000)
 *  - DB letter_keys_json values: may be DT or millimes (heuristic ≥50 = millimes)
 *  - Service fraisEngages: DT → Engine montant: millimes
 *  - Engine result montantRembourse: millimes → Service: DT (÷1000)
 */
import type {
  Acte,
  ActeResult,
  AnnualContext,
  Beneficiaire,
  Contract,
  Guarantee,
} from './types';
import { calculateActe } from './engine';
import { toMillimes, toDinars } from './units';
// Types inlined to avoid circular dependency with remboursement.service.ts

export interface CalculRemboursementInput {
  adherentId: string;
  contractId: string;
  acteRefId: string;
  fraisEngages: number; // in DT (dinars)
  dateSoin: string; // YYYY-MM-DD
  typeMaladie?: 'ordinaire' | 'chronique';
  medicationFamilyId?: string;
  nbrCle?: number;
  nombreJours?: number;
  careType?: string;
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
    plafondActeValeur: number | null;
    plafondJourValeur: number | null;
  };
  _debug?: Record<string, unknown>;
}

export interface CalculBatchContext {
  baremeContractId?: string;
  periodeId?: string | null;
  plafondGlobal?: { montant_plafond: number; montant_consomme: number } | null;
  _resolved?: boolean;
}

// ---------------------------------------------------------------------------
// DB type interfaces (matching D1 row shapes)
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

interface DbGuaranteeRow {
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
}

interface DbBaremeRow {
  type_calcul: string;
  valeur: number;
  plafond_acte: number | null;
  plafond_famille_annuel: number | null;
  plafond_jour: number | null;
  max_jours: number | null;
}

// ---------------------------------------------------------------------------
// Utility functions (self-contained to avoid circular imports)
// ---------------------------------------------------------------------------

async function resolvePrincipalAdherentId(
  db: D1Database,
  adherentId: string,
): Promise<string> {
  const row = await db
    .prepare('SELECT parent_adherent_id FROM adherents WHERE id = ?')
    .bind(adherentId)
    .first<{ parent_adherent_id: string | null }>();
  return row?.parent_adherent_id || adherentId;
}

function parseLetterKeyCode(code: string): { letter: string; coefficient: number | null } | null {
  if (!code) return null;
  const upper = code.toUpperCase().trim();
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

// ---------------------------------------------------------------------------
// Acte code → sub_limits_json key mapping
// ---------------------------------------------------------------------------

const ACTE_CODE_TO_SUB_LIMIT_KEY: Record<string, string> = {
  MONTURE: 'monture',
  VERRES: 'verres_normaux',
  DOUBLES_FOYERS: 'doubles_foyers',
  LENTILLES: 'lentilles',
  SO: 'salle_operation',
  ANE: 'anesthesie',
  PUU: 'medicaments_usage_unique',
};

// Reverse mapping: famille_actes → contract_guarantees care_type
const FAMILLE_TO_CARE_TYPES: Record<string, string[]> = {
  'fa-001': ['consultation_visite', 'consultation'],
  'fa-003': ['pharmacie', 'pharmacy'],
  'fa-004': ['laboratoire', 'laboratory'],
  'fa-005': ['orthopedie', 'orthopedics'],
  'fa-006': ['optique', 'optical'],
  'fa-007': ['hospitalisation', 'hospitalization'],
  'fa-008': ['hospitalisation_hopital', 'hospitalisation', 'hospitalization'],
  'fa-009': ['actes_courants', 'medical_acts'],
  'fa-010': ['chirurgie', 'surgery', 'chirurgie_fso', 'chirurgie_usage_unique'],
  'fa-011': ['dentaire', 'dental', 'dentaire_prothese', 'orthodontie', 'orthodontics'],
  'fa-012': ['accouchement', 'maternity', 'accouchement_gemellaire', 'interruption_grossesse'],
  'fa-013': ['cures_thermales', 'thermal_cure'],
  'fa-014': ['frais_funeraires', 'funeral'],
  'fa-015': ['circoncision', 'circumcision'],
  'fa-016': ['transport'],
  'fa-017': ['actes_courants', 'medical_acts'],
};

// Known letter keys for parseLetterKeyCode
const KNOWN_LETTER_KEYS = ['AMM', 'AMO', 'AMY', 'AM', 'CS', 'KC', 'PC', 'B', 'C', 'D', 'E', 'K', 'Z'];

// ---------------------------------------------------------------------------
// Unit normalization
// ---------------------------------------------------------------------------

/**
 * Normalize a letter-key value to millimes.
 * letter_keys_json may store values in DT (0.27, 0.32) or millimes (270, 320).
 * Heuristic: values >= 50 are already millimes; otherwise DT → convert to millimes.
 */
export function letterKeyValueToMillimes(value: number): number {
  return value >= 50 ? value : toMillimes(value);
}

/**
 * Normalize a rate from DB format (0–1 decimal) to Engine format (0–100 integer).
 * Handles edge cases where rate is already 0–100 (>1).
 */
export function normalizeRate(dbRate: number | null): number | null {
  if (dbRate == null) return null;
  if (dbRate > 1) return dbRate; // already 0–100
  return Math.round(dbRate * 100);
}

// ---------------------------------------------------------------------------
// DB → Engine type converters
// ---------------------------------------------------------------------------

/**
 * Convert a contract_guarantees DB row to an Engine A Guarantee.
 */
export function dbRowToGuarantee(
  row: DbGuaranteeRow,
  opts?: {
    familleId?: string;
    typeMaladie?: 'ordinaire' | 'chronique';
    acteCode?: string;
    acteRate?: number;
  },
): Guarantee {
  const rate = normalizeRate(row.reimbursement_rate);

  // Parse letter_keys_json → { key, value }[] in millimes
  let letterKeys: { key: string; value: number }[] = [];
  if (row.letter_keys_json) {
    try {
      const raw = JSON.parse(row.letter_keys_json) as Record<string, number>;
      letterKeys = Object.entries(raw).map(([k, v]) => ({
        key: k.toUpperCase(),
        value: letterKeyValueToMillimes(v),
      }));
    } catch { /* ignore */ }
  }

  // Parse sub_limits_json → { key, value }[] in millimes
  let subLimits: { key: string; value: number }[] = [];
  let subLimitsRaw: Record<string, number> | null = null;
  if (row.sub_limits_json) {
    try {
      subLimitsRaw = JSON.parse(row.sub_limits_json) as Record<string, number>;
    } catch { /* ignore */ }
  }

  // Resolve per_act_ceiling: base from per_event_limit, possibly overridden by sub-limits
  let perActCeiling = row.per_event_limit; // already millimes

  // Resolve daily_limit with hospitalisation hôpital/clinique variants
  let dailyLimit = row.daily_limit; // millimes
  if (subLimitsRaw && (opts?.familleId === 'fa-007' || opts?.familleId === 'fa-008')) {
    const isHopital = opts?.familleId === 'fa-008';
    const keyVariants = isHopital
      ? ['hopital', 'hôpital', 'Plafond journalier en hôpital', 'Plafond journalier en hopital']
      : ['clinique', 'Plafond journalier en clinique'];
    for (const key of keyVariants) {
      const val = subLimitsRaw[key] ??
        Object.entries(subLimitsRaw).find(
          ([k]) => k.toLowerCase().includes(isHopital ? 'hopital' : 'clinique') && k.toLowerCase().includes('journalier')
        )?.[1];
      if (val != null) {
        dailyLimit = val; // already millimes in sub_limits
        break;
      }
    }
  }

  // Acte-code-based sub-limit overrides (optique, chirurgie components)
  let effectiveRate = rate;
  if (subLimitsRaw && opts?.acteCode) {
    const subKey = ACTE_CODE_TO_SUB_LIMIT_KEY[opts.acteCode] ??
      ACTE_CODE_TO_SUB_LIMIT_KEY[opts.acteCode.toUpperCase()];
    if (subKey && subLimitsRaw[subKey] != null) {
      perActCeiling = subLimitsRaw[subKey]!; // millimes
      // Check for rate override in sub-limits
      const rateKey = `${subKey}_rate`;
      if (subLimitsRaw[rateKey] != null) {
        effectiveRate = normalizeRate(subLimitsRaw[rateKey]!);
      } else if (opts.acteRate != null && opts.acteRate > 0 && normalizeRate(opts.acteRate) !== rate) {
        effectiveRate = normalizeRate(opts.acteRate);
      }
    }
  }

  // Build sub_limits array for Engine A (non-hospitalisation sub-limits)
  if (subLimitsRaw) {
    // Collect sub-limits that are relevant (not rate overrides, not hospitalisation variants)
    const skipKeys = new Set([
      'hopital', 'hôpital', 'clinique',
      'ordinaire', 'chronique', 'maladies_ordinaires', 'maladies_chroniques',
    ]);
    subLimits = Object.entries(subLimitsRaw)
      .filter(([k]) => !k.endsWith('_rate') && !skipKeys.has(k.toLowerCase()) && !k.toLowerCase().includes('journalier'))
      .map(([k, v]) => ({ key: k, value: v })); // already millimes
  }

  // Resolve annual_limit: check sub-limits by typeMaladie first
  let annualCeiling = row.annual_limit; // millimes
  if (subLimitsRaw && opts?.typeMaladie) {
    const subKeyVariants: Record<string, string[]> = {
      ordinaire: ['ordinaire', 'maladies_ordinaires'],
      chronique: ['chronique', 'maladies_chroniques'],
    };
    const candidates = subKeyVariants[opts.typeMaladie] ?? [opts.typeMaladie];
    for (const key of candidates) {
      if (subLimitsRaw[key] != null) {
        annualCeiling = subLimitsRaw[key]!; // millimes
        break;
      }
    }
  }

  return {
    care_type: row.care_type,
    rate: effectiveRate,
    annual_ceiling: annualCeiling,
    per_act_ceiling: perActCeiling,
    per_day_ceiling: dailyLimit,
    max_days: row.max_days,
    letter_keys: letterKeys,
    sub_limits: subLimits,
    requires_prescription: false, // Not checked in adapter path (already validated upstream)
    requires_cnam_complement: false,
    renewal_period: '',
    age_limit: null,
    conditions: '',
  };
}

/**
 * Convert a contrat_baremes row to an Engine A Guarantee.
 * Used when contrat_periodes/contrat_baremes path is active.
 */
export function baremeRowToGuarantee(
  bareme: DbBaremeRow,
  careType: string,
  opts?: {
    acteLettreCle?: string | null;
    nbrCle?: number;
    medFamilyRate?: number | null;
  },
): Guarantee {
  const isRate = bareme.type_calcul === 'taux';
  let rate: number | null = null;
  const letterKeys: { key: string; value: number }[] = [];

  if (isRate) {
    // valeur is a decimal rate (0.85) → convert to 0–100
    rate = opts?.medFamilyRate != null
      ? normalizeRate(opts.medFamilyRate)
      : normalizeRate(bareme.valeur);
  } else {
    // forfait: valeur is a unit value in millimes
    // If nbrCle or lettreCle is present, treat as letter_key
    if (opts?.acteLettreCle || opts?.nbrCle) {
      const key = opts?.acteLettreCle?.toUpperCase() ?? 'UNIT';
      letterKeys.push({ key, value: bareme.valeur }); // already millimes
    } else if (bareme.plafond_jour != null) {
      // Daily forfait (hospitalisation) — use per_day_ceiling path
      // Nothing extra needed, per_day_ceiling will be set below
    } else {
      // Fixed forfait (circoncision, etc.) — set as per_act_ceiling
      // Engine will use rate path with rate=100 capped by per_act_ceiling
      rate = 100;
    }
  }

  return {
    care_type: careType,
    rate,
    annual_ceiling: opts?.medFamilyRate != null
      ? null  // med family annual limit handled separately
      : bareme.plafond_famille_annuel, // already millimes
    per_act_ceiling: opts?.medFamilyRate != null
      ? null
      : bareme.plafond_acte, // already millimes
    per_day_ceiling: bareme.plafond_jour, // already millimes
    max_days: bareme.max_jours,
    letter_keys: letterKeys,
    sub_limits: [],
    requires_prescription: false,
    requires_cnam_complement: false,
    renewal_period: '',
    age_limit: null,
    conditions: '',
  };
}

/**
 * Build an AnnualContext from plafonds_beneficiaire DB rows.
 */
export async function buildAnnualContext(
  db: D1Database,
  adherentId: string,
  contractId: string,
  groupContractId: string,
  annee: number,
  careType: string,
  typeMaladie: 'ordinaire' | 'chronique',
  familleId: string | null,
  batchCtx?: CalculBatchContext,
): Promise<{
  context: AnnualContext;
  annualGlobalLimit: number | null;
  effectiveCategoryCeiling: number | null;
}> {
  // 1. Get annual global limit from group_contracts (DT → millimes)
  let annualGlobalLimit: number | null = null;
  const contract = await db
    .prepare('SELECT annual_global_limit FROM group_contracts WHERE id = ?')
    .bind(groupContractId)
    .first<{ annual_global_limit: number | null }>();
  if (contract?.annual_global_limit && contract.annual_global_limit > 0) {
    // annual_global_limit is stored in DT in group_contracts
    annualGlobalLimit = toMillimes(contract.annual_global_limit);
  }

  // 2. Get category plafond consumption
  // CRITICAL: use montant_plafond from plafonds_beneficiaire as the effective ceiling,
  // NOT guarantee.annual_limit — they may differ (e.g., sub-limit overrides at init time).
  let categoryConsumed = 0;
  let effectiveCategoryCeiling: number | null = null;
  if (familleId) {
    let plafondRow = await db
      .prepare(
        `SELECT montant_plafond, montant_consomme FROM plafonds_beneficiaire
         WHERE adherent_id = ? AND contract_id = ? AND annee = ? AND famille_acte_id = ? AND type_maladie = ?`
      )
      .bind(adherentId, contractId, annee, familleId, typeMaladie)
      .first<{ montant_plafond: number; montant_consomme: number }>();

    if (!plafondRow && groupContractId !== contractId) {
      plafondRow = await db
        .prepare(
          `SELECT montant_plafond, montant_consomme FROM plafonds_beneficiaire
           WHERE adherent_id = ? AND contract_id = ? AND annee = ? AND famille_acte_id = ? AND type_maladie = ?`
        )
        .bind(adherentId, groupContractId, annee, familleId, typeMaladie)
        .first<{ montant_plafond: number; montant_consomme: number }>();
    }

    if (plafondRow) {
      categoryConsumed = plafondRow.montant_consomme; // already millimes
      effectiveCategoryCeiling = plafondRow.montant_plafond; // authoritative ceiling from DB
    } else {
      // No plafond row — compute from bulletins
      const famCareTypes = FAMILLE_TO_CARE_TYPES[familleId] ?? [];
      if (famCareTypes.length > 0) {
        const ctP = famCareTypes.map(() => '?').join(', ');
        const consumedRow = await db
          .prepare(
            `SELECT COALESCE(SUM(bs.reimbursed_amount), 0) as total_consumed
             FROM bulletins_soins bs
             WHERE bs.adherent_id = ? AND bs.status NOT IN ('rejected', 'cancelled')
               AND strftime('%Y', bs.bulletin_date) = ?
               AND bs.care_type IN (${ctP})`
          )
          .bind(adherentId, String(annee), ...famCareTypes)
          .first<{ total_consumed: number }>();
        // reimbursed_amount is in DT → convert to millimes
        categoryConsumed = toMillimes(consumedRow?.total_consumed ?? 0);
      }
    }
  }

  // 3. Get global (individual) plafond consumption
  let globalConsumed = 0;
  let plafondGlobalRow: { montant_plafond: number; montant_consomme: number } | null | undefined;
  if (batchCtx && batchCtx.plafondGlobal !== undefined) {
    plafondGlobalRow = batchCtx.plafondGlobal;
  } else {
    plafondGlobalRow = await db
      .prepare(
        `SELECT montant_plafond, montant_consomme FROM plafonds_beneficiaire
         WHERE adherent_id = ? AND contract_id = ? AND annee = ? AND famille_acte_id IS NULL AND type_maladie = 'ordinaire'`
      )
      .bind(adherentId, contractId, annee)
      .first<{ montant_plafond: number; montant_consomme: number }>();

    if (!plafondGlobalRow && groupContractId !== contractId) {
      plafondGlobalRow = await db
        .prepare(
          `SELECT montant_plafond, montant_consomme FROM plafonds_beneficiaire
           WHERE adherent_id = ? AND contract_id = ? AND annee = ? AND famille_acte_id IS NULL AND type_maladie = 'ordinaire'`
        )
        .bind(adherentId, groupContractId, annee)
        .first<{ montant_plafond: number; montant_consomme: number }>();
    }
    if (batchCtx) {
      batchCtx.plafondGlobal = plafondGlobalRow ?? null;
    }
  }

  if (plafondGlobalRow) {
    globalConsumed = plafondGlobalRow.montant_consomme; // millimes
  }

  const context: AnnualContext = {
    year: annee,
    byBeneficiaire: {
      [adherentId]: {
        totalReimbursed: globalConsumed,
        byCareType: {
          [careType]: categoryConsumed,
        },
      },
    },
  };

  return { context, annualGlobalLimit, effectiveCategoryCeiling };
}

/**
 * Convert Engine A ActeResult (millimes) → service CalculRemboursementResult (DT).
 */
export function engineResultToServiceResult(
  result: ActeResult,
  typeCalcul: 'taux' | 'forfait',
  valeurBareme: number,
  guarantee: Guarantee,
  debugInfo?: Record<string, unknown>,
): CalculRemboursementResult {
  const montantRembourseDT = toDinars(result.montantRembourse);
  const montantBrutDT = toDinars(
    // Reconstruct brut from calcul trace or use montantRembourse as upper bound
    result.rejetRaison ? 0 : result.montantRembourse
  );

  // Map plafondLimitant to service boolean flags
  const plafond = result.plafondLimitant;

  return {
    montantRembourse: Math.max(0, montantRembourseDT),
    typeCalcul,
    valeurBareme,
    plafondActeApplique: plafond === 'per_act' || plafond === 'sub_limit',
    plafondJourApplique: false, // fixed_day strategy handles this internally
    plafondFamilleApplique: plafond === 'annual_category',
    plafondGlobalApplique: plafond === 'annual_global',
    details: {
      montantBrut: toDinars(result.montantFacture),
      apresPlafondJour: montantRembourseDT,
      apresPlafondActe: montantRembourseDT,
      apresPlafondFamille: montantRembourseDT,
      apresPlafondGlobal: montantRembourseDT,
      plafondActeValeur: guarantee.per_act_ceiling != null ? toDinars(guarantee.per_act_ceiling) : null,
      plafondJourValeur: guarantee.per_day_ceiling != null ? toDinars(guarantee.per_day_ceiling) : null,
    },
    _debug: { path: 'engine_adapter', ...debugInfo },
  };
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

/**
 * Calculate reimbursement by bridging DB data to Engine A.
 *
 * This is the main adapter function that:
 * 1. Loads acte/contract/guarantee data from DB
 * 2. Converts to Engine A types
 * 3. Calls calculateActe
 * 4. Applies family-wide plafond (post-processing, not in Engine A)
 * 5. Converts result back to CalculRemboursementResult
 */
export async function calculerRemboursementViaEngine(
  db: D1Database,
  input: CalculRemboursementInput,
  batchCtx?: CalculBatchContext,
): Promise<CalculRemboursementResult> {
  const {
    adherentId,
    contractId,
    acteRefId,
    fraisEngages,
    dateSoin,
    typeMaladie = 'ordinaire',
    medicationFamilyId,
    nbrCle,
    nombreJours,
    careType: careTypeOverride,
  } = input;
  const annee = Number(dateSoin.split('-')[0]);

  // 1. Resolve group_contract_id (cached in batchCtx)
  let baremeContractId: string;
  if (batchCtx?._resolved && batchCtx.baremeContractId !== undefined) {
    baremeContractId = batchCtx.baremeContractId;
  } else {
    baremeContractId = contractId;
    const contractRow = await db
      .prepare('SELECT group_contract_id FROM contracts WHERE id = ?')
      .bind(contractId)
      .first<{ group_contract_id: string | null }>();
    if (contractRow?.group_contract_id) {
      baremeContractId = contractRow.group_contract_id;
    }
    if (batchCtx) {
      batchCtx.baremeContractId = baremeContractId;
    }
  }

  // 2. Find active period (cached in batchCtx)
  let periode: { id: string } | null;
  if (batchCtx?._resolved && batchCtx.periodeId !== undefined) {
    periode = batchCtx.periodeId ? { id: batchCtx.periodeId } : null;
  } else {
    periode = await db
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
    if (batchCtx) {
      batchCtx.periodeId = periode?.id ?? null;
      batchCtx._resolved = true;
    }
  }

  // 3. Get acte info
  const acte = await db
    .prepare(
      'SELECT id, code, famille_id, type_calcul, valeur_base, taux_remboursement, plafond_acte, lettre_cle FROM actes_referentiel WHERE id = ?'
    )
    .bind(acteRefId)
    .first<{
      id: string;
      code: string;
      famille_id: string | null;
      type_calcul: string;
      valeur_base: number | null;
      taux_remboursement: number;
      plafond_acte: number | null;
      lettre_cle: string | null;
    }>();

  if (!acte) {
    throw new Error('ACTE_NOT_FOUND: Acte referentiel non trouve');
  }

  const familleId = acte.famille_id;

  // 4. Determine care_type for guarantee lookup
  let careType: string;
  if (careTypeOverride) {
    careType = careTypeOverride;
  } else if (familleId) {
    const careTypes = FAMILLE_TO_CARE_TYPES[familleId];
    careType = careTypes?.[0] ?? familleId;
  } else {
    careType = acte.code;
  }

  // 5. Build guarantee from either contrat_baremes or contract_guarantees
  let guarantee: Guarantee;
  let typeCalcul: 'taux' | 'forfait';
  let valeurBareme: number;
  let debugInfo: Record<string, unknown> = {};

  if (periode) {
    // --- contrat_baremes path ---
    let bareme = await db
      .prepare(
        `SELECT type_calcul, valeur, plafond_acte, plafond_famille_annuel, plafond_jour, max_jours
         FROM contrat_baremes WHERE periode_id = ? AND acte_ref_id = ?`
      )
      .bind(periode.id, acteRefId)
      .first<DbBaremeRow>();

    if (!bareme && familleId) {
      bareme = await db
        .prepare(
          `SELECT type_calcul, valeur, plafond_acte, plafond_famille_annuel, plafond_jour, max_jours
           FROM contrat_baremes WHERE periode_id = ? AND famille_id = ? AND acte_ref_id IS NULL`
        )
        .bind(periode.id, familleId)
        .first<DbBaremeRow>();
    }

    // Fetch medication family bareme if applicable
    let medFamilyRate: number | null = null;
    let medFamilyPlafondActe: number | null = null;
    let medFamilyPlafondAnnuel: number | null = null;
    if (medicationFamilyId) {
      let medBareme = await db
        .prepare(
          `SELECT taux_remboursement, plafond_acte, plafond_famille_annuel
           FROM medication_family_baremes
           WHERE contract_id = ? AND medication_family_id = ? AND is_active = 1
             AND date_effet <= ? AND (date_fin_effet IS NULL OR date_fin_effet >= ?)
           ORDER BY date_effet DESC LIMIT 1`
        )
        .bind(baremeContractId, medicationFamilyId, dateSoin, dateSoin)
        .first<{ taux_remboursement: number; plafond_acte: number | null; plafond_famille_annuel: number | null }>();

      if (!medBareme && baremeContractId !== contractId) {
        medBareme = await db
          .prepare(
            `SELECT taux_remboursement, plafond_acte, plafond_famille_annuel
             FROM medication_family_baremes
             WHERE contract_id = ? AND medication_family_id = ? AND is_active = 1
               AND date_effet <= ? AND (date_fin_effet IS NULL OR date_fin_effet >= ?)
             ORDER BY date_effet DESC LIMIT 1`
          )
          .bind(contractId, medicationFamilyId, dateSoin, dateSoin)
          .first<{ taux_remboursement: number; plafond_acte: number | null; plafond_famille_annuel: number | null }>();
      }

      if (medBareme) {
        medFamilyRate = medBareme.taux_remboursement;
        medFamilyPlafondActe = medBareme.plafond_acte;
        medFamilyPlafondAnnuel = medBareme.plafond_famille_annuel;
      }
    }

    if (!bareme) {
      // No contrat_baremes found — fallback to contract_guarantees
      return calculerViaGuaranteesPath(
        db, baremeContractId, familleId, fraisEngages, adherentId, contractId,
        annee, typeMaladie, acte, nbrCle, nombreJours, careTypeOverride, batchCtx
      );
    }

    // Build guarantee from bareme
    guarantee = baremeRowToGuarantee(bareme, careType, {
      acteLettreCle: acte.lettre_cle,
      nbrCle,
      medFamilyRate,
    });

    // Override plafonds from medication family if applicable
    if (medFamilyPlafondActe != null) {
      guarantee.per_act_ceiling = medFamilyPlafondActe;
    }
    if (medFamilyPlafondAnnuel != null) {
      guarantee.annual_ceiling = medFamilyPlafondAnnuel;
    }

    // Determine typeCalcul and valeurBareme for service result
    if (medFamilyRate != null) {
      typeCalcul = 'taux';
      valeurBareme = medFamilyRate;
    } else {
      typeCalcul = bareme.type_calcul as 'taux' | 'forfait';
      valeurBareme = bareme.valeur;
    }

    debugInfo = { path: 'baremes', periodeId: periode.id, baremeFound: true, familleId, medFamilyRate };
  } else {
    // --- contract_guarantees path (no contrat_periodes) ---
    return calculerViaGuaranteesPath(
      db, baremeContractId, familleId, fraisEngages, adherentId, contractId,
      annee, typeMaladie, acte, nbrCle, nombreJours, careTypeOverride, batchCtx
    );
  }

  // 6. Build Engine A Acte
  const engineActe = buildEngineActe(
    acte, careType, fraisEngages, dateSoin, adherentId, nbrCle, nombreJours, guarantee
  );

  // 7. Build AnnualContext
  const { context, annualGlobalLimit, effectiveCategoryCeiling } = await buildAnnualContext(
    db, adherentId, contractId, baremeContractId, annee, careType, typeMaladie, familleId, batchCtx
  );

  // Override guarantee annual_ceiling with DB plafond value (authoritative)
  if (effectiveCategoryCeiling != null) {
    guarantee.annual_ceiling = effectiveCategoryCeiling;
  }

  // 8. Build Contract
  const engineContract: Contract = {
    id: baremeContractId,
    annual_global_limit: null, // Individual global handled via context
    carence_days: 0, // Already validated upstream
    effective_date: '2000-01-01',
    guarantees: [guarantee],
    covers_spouse: true,
    covers_children: true,
    children_max_age: null,
  };

  // 9. Calculate via Engine A
  let result = calculateActe(engineActe, engineContract, context);

  // 10. Apply individual global plafond (from plafonds_beneficiaire)
  if (context.byBeneficiaire[adherentId]) {
    const globalConsumed = context.byBeneficiaire[adherentId]!.totalReimbursed;
    let plafondGlobalRow: { montant_plafond: number; montant_consomme: number } | null | undefined;
    if (batchCtx && batchCtx.plafondGlobal !== undefined) {
      plafondGlobalRow = batchCtx.plafondGlobal;
    }
    if (plafondGlobalRow) {
      const restantGlobal = Math.max(0, plafondGlobalRow.montant_plafond - plafondGlobalRow.montant_consomme);
      if (result.montantRembourse > restantGlobal) {
        result = {
          ...result,
          montantRembourse: restantGlobal,
          plafondLimitant: 'annual_global',
        };
      }
    }
  }

  // 11. Convert result to service format
  let serviceResult = engineResultToServiceResult(result, typeCalcul, valeurBareme, guarantee, debugInfo);

  // 12. Apply family-wide contract plafond (post-processing)
  const apresPlafondContrat = await appliquerPlafondContratFamilleMillimes(
    db, adherentId, baremeContractId, annee, serviceResult.montantRembourse
  );
  if (apresPlafondContrat !== null && apresPlafondContrat < serviceResult.montantRembourse) {
    serviceResult = {
      ...serviceResult,
      montantRembourse: apresPlafondContrat,
      plafondGlobalApplique: true,
    };
  }

  return serviceResult;
}

// ---------------------------------------------------------------------------
// Internal: contract_guarantees fallback path (proven calculation, no Engine A)
// Uses direct DT-based math identical to the original service logic.
// ---------------------------------------------------------------------------

async function calculerViaGuaranteesPath(
  db: D1Database,
  groupContractId: string,
  familleId: string | null,
  fraisEngages: number,
  adherentId: string,
  contractId: string,
  annee: number,
  typeMaladie: 'ordinaire' | 'chronique',
  acte: {
    code: string;
    famille_id: string | null;
    taux_remboursement: number;
    lettre_cle: string | null;
  },
  nbrCle?: number,
  nombreJours?: number,
  careTypeOverride?: string,
  batchCtx?: CalculBatchContext,
): Promise<CalculRemboursementResult> {
  if (!familleId) {
    throw new Error('BAREME_NOT_FOUND: Aucune periode active ni garantie trouvee pour ce contrat');
  }

  const careTypes = careTypeOverride
    ? [careTypeOverride]
    : FAMILLE_TO_CARE_TYPES[familleId];
  if (!careTypes || careTypes.length === 0) {
    throw new Error('BAREME_NOT_FOUND: Aucune periode active ni garantie trouvee pour ce contrat');
  }

  const placeholders = careTypes.map(() => '?').join(', ');
  const guarantee = await db
    .prepare(
      `SELECT care_type, reimbursement_rate, is_fixed_amount, annual_limit, per_event_limit,
              daily_limit, max_days, letter_keys_json, sub_limits_json, bareme_tp_id
       FROM contract_guarantees
       WHERE group_contract_id = ? AND care_type IN (${placeholders}) AND is_active = 1
       ORDER BY created_at DESC
       LIMIT 1`
    )
    .bind(groupContractId, ...careTypes)
    .first<DbGuaranteeRow>();

  if (!guarantee) {
    throw new Error('BAREME_NOT_FOUND: Aucune periode active ni garantie trouvee pour ce contrat');
  }

  // --- Direct calculation in DT (proven logic from original service) ---
  const isFixed = guarantee.is_fixed_amount === 1;
  let rate = guarantee.reimbursement_rate ?? 0;

  // Normalize amounts: contract_guarantees stores in millimes → convert to DT
  let perEventLimitDT = guarantee.per_event_limit != null ? guarantee.per_event_limit / 1000 : null;
  const annualLimitDT = guarantee.annual_limit != null ? guarantee.annual_limit / 1000 : null;
  let dailyLimitDT = guarantee.daily_limit != null ? guarantee.daily_limit / 1000 : null;

  // Parse sub_limits_json
  let subLimits: Record<string, number> | null = null;
  if (guarantee.sub_limits_json) {
    try { subLimits = JSON.parse(guarantee.sub_limits_json) as Record<string, number>; } catch { /* ignore */ }
  }

  // Hospitalisation hôpital vs clinique daily limit
  if (subLimits && (familleId === 'fa-007' || familleId === 'fa-008')) {
    const isHopital = familleId === 'fa-008';
    const keyVariants = isHopital
      ? ['hopital', 'hôpital', 'Plafond journalier en hôpital', 'Plafond journalier en hopital']
      : ['clinique', 'Plafond journalier en clinique'];
    for (const key of keyVariants) {
      const val = subLimits[key] ?? Object.entries(subLimits).find(([k]) => k.toLowerCase().includes(isHopital ? 'hopital' : 'clinique') && k.toLowerCase().includes('journalier'))?.[1];
      if (val != null) {
        dailyLimitDT = val / 1000;
        break;
      }
    }
  }

  // Acte-code-based sub-limit override (optique, chirurgie)
  if (subLimits && acte.code) {
    const subKey = ACTE_CODE_TO_SUB_LIMIT_KEY[acte.code] ?? ACTE_CODE_TO_SUB_LIMIT_KEY[acte.code.toUpperCase()];
    if (subKey && subLimits[subKey] != null) {
      const subCapDT = subLimits[subKey]! / 1000;
      if (subCapDT != null) perEventLimitDT = subCapDT;
      const rateKey = `${subKey}_rate`;
      if (subLimits[rateKey] != null) {
        rate = subLimits[rateKey]!;
      } else if (acte.taux_remboursement != null && acte.taux_remboursement > 0 && acte.taux_remboursement !== rate) {
        rate = acte.taux_remboursement;
      }
    }
  }

  let typeCalcul: 'taux' | 'forfait';
  let valeur: number;
  let montantBrut: number;

  // Resolve letter_keys
  let letterKeyValue: number | null = null;
  let resolvedCoeff: number | null = nbrCle ?? null;
  let matchedViaLettreCle = false;

  function letterKeyValueToDinars(v: number): number {
    return v >= 50 ? v / 1000 : v;
  }

  if (guarantee.letter_keys_json && acte.code) {
    try {
      const rawLetterKeys = JSON.parse(guarantee.letter_keys_json) as Record<string, number>;
      const letterKeys: Record<string, number> = {};
      for (const [k, v] of Object.entries(rawLetterKeys)) {
        letterKeys[k.toUpperCase()] = v;
      }
      const acteUpper = acte.code.toUpperCase();
      if (letterKeys[acteUpper] !== undefined) {
        letterKeyValue = letterKeyValueToDinars(letterKeys[acteUpper]!);
      } else {
        const parsed = parseLetterKeyCode(acte.code);
        if (parsed && letterKeys[parsed.letter] !== undefined) {
          letterKeyValue = letterKeyValueToDinars(letterKeys[parsed.letter]!);
          if (!resolvedCoeff && parsed.coefficient) resolvedCoeff = parsed.coefficient;
        } else if (acte.lettre_cle && letterKeys[acte.lettre_cle.toUpperCase()] !== undefined) {
          letterKeyValue = letterKeyValueToDinars(letterKeys[acte.lettre_cle.toUpperCase()]!);
          matchedViaLettreCle = true;
        }
      }
    } catch { /* ignore */ }
  }

  if (letterKeyValue !== null && (resolvedCoeff || !matchedViaLettreCle)) {
    const effectiveBase = (resolvedCoeff && resolvedCoeff > 0)
      ? resolvedCoeff * letterKeyValue
      : letterKeyValue;
    if (resolvedCoeff && resolvedCoeff > 0) {
      typeCalcul = 'forfait';
      valeur = effectiveBase;
      montantBrut = Math.min(fraisEngages, effectiveBase);
    } else if (rate > 0 && rate < 1) {
      typeCalcul = 'taux';
      valeur = rate;
      montantBrut = Math.floor(Math.min(fraisEngages, effectiveBase) * rate * 1000) / 1000;
    } else {
      typeCalcul = rate === 1 ? 'taux' : 'forfait';
      valeur = rate === 1 ? 1 : effectiveBase;
      montantBrut = Math.min(fraisEngages, effectiveBase);
    }
  } else if (letterKeyValue !== null && matchedViaLettreCle && !resolvedCoeff) {
    const effectiveRate = (acte.taux_remboursement != null && acte.taux_remboursement > 0 && acte.taux_remboursement < 1)
      ? acte.taux_remboursement : (rate < 1 ? rate : 0.80);
    typeCalcul = 'taux';
    valeur = effectiveRate;
    montantBrut = Math.floor(fraisEngages * effectiveRate * 1000) / 1000;
  } else if (isFixed && perEventLimitDT) {
    typeCalcul = 'forfait';
    valeur = perEventLimitDT;
    montantBrut = Math.min(fraisEngages, perEventLimitDT);
  } else if (rate > 0) {
    typeCalcul = 'taux';
    valeur = rate;
    montantBrut = Math.floor(fraisEngages * rate * 1000) / 1000;
  } else {
    throw new Error('BAREME_NOT_FOUND: Aucune periode active ni garantie trouvee pour ce contrat');
  }

  // Daily limit
  let plafondJourApplique = false;
  if (dailyLimitDT != null) {
    if (nombreJours && nombreJours > 0) {
      const maxDays = guarantee.max_days;
      const joursEffectifs = (maxDays && maxDays > 0) ? Math.min(nombreJours, maxDays) : nombreJours;
      const capJour = dailyLimitDT * joursEffectifs;
      if (montantBrut > capJour) { montantBrut = capJour; plafondJourApplique = true; }
    } else if (montantBrut > dailyLimitDT) {
      montantBrut = dailyLimitDT;
      plafondJourApplique = true;
    }
  }

  // Per-event plafond
  let apresPlafondActe = montantBrut;
  let plafondActeApplique = false;
  if (perEventLimitDT && !isFixed && apresPlafondActe > perEventLimitDT) {
    apresPlafondActe = perEventLimitDT;
    plafondActeApplique = true;
  }

  // Annual family plafond: resolve effective limit
  let effectiveAnnualLimitDT = annualLimitDT;
  if (subLimits) {
    const subKeyVariants: Record<string, string[]> = {
      ordinaire: ['ordinaire', 'maladies_ordinaires'],
      chronique: ['chronique', 'maladies_chroniques'],
    };
    const candidates = subKeyVariants[typeMaladie] ?? [typeMaladie];
    for (const key of candidates) {
      if (subLimits[key] != null) {
        const subVal = subLimits[key]! / 1000;
        if (subVal != null) { effectiveAnnualLimitDT = subVal; break; }
      }
    }
  }

  // Apply annual plafond
  let apresPlafondFamille = apresPlafondActe;
  let plafondFamilleApplique = false;
  if (effectiveAnnualLimitDT) {
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
      const restant = Math.max(0, (plafondRow.montant_plafond - plafondRow.montant_consomme) / 1000);
      if (apresPlafondFamille > restant) { apresPlafondFamille = restant; plafondFamilleApplique = true; }
    } else {
      const familleCareTypes = FAMILLE_TO_CARE_TYPES[familleId] ?? [];
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
      if (apresPlafondFamille > restant) { apresPlafondFamille = restant; plafondFamilleApplique = true; }
    }
  }

  // Individual global plafond
  let apresPlafondGlobal = apresPlafondFamille;
  let plafondGlobalApplique = false;

  let plafondGlobalRow: { montant_plafond: number; montant_consomme: number } | null | undefined;
  if (batchCtx && batchCtx.plafondGlobal !== undefined) {
    plafondGlobalRow = batchCtx.plafondGlobal;
  } else {
    plafondGlobalRow = await db
      .prepare(
        `SELECT montant_plafond, montant_consomme FROM plafonds_beneficiaire
         WHERE adherent_id = ? AND contract_id = ? AND annee = ? AND famille_acte_id IS NULL AND type_maladie = 'ordinaire'`
      )
      .bind(adherentId, contractId, annee)
      .first<{ montant_plafond: number; montant_consomme: number }>();

    if (!plafondGlobalRow && groupContractId !== contractId) {
      plafondGlobalRow = await db
        .prepare(
          `SELECT montant_plafond, montant_consomme FROM plafonds_beneficiaire
           WHERE adherent_id = ? AND contract_id = ? AND annee = ? AND famille_acte_id IS NULL AND type_maladie = 'ordinaire'`
        )
        .bind(adherentId, groupContractId, annee)
        .first<{ montant_plafond: number; montant_consomme: number }>();
    }
    if (batchCtx) {
      batchCtx.plafondGlobal = plafondGlobalRow ?? null;
    }
  }

  if (plafondGlobalRow) {
    const restantGlobal = Math.max(0, (plafondGlobalRow.montant_plafond - plafondGlobalRow.montant_consomme) / 1000);
    if (apresPlafondGlobal > restantGlobal) { apresPlafondGlobal = restantGlobal; plafondGlobalApplique = true; }
  }

  // Family-wide contract plafond
  const apresPlafondContrat = await appliquerPlafondContratFamilleMillimes(
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
      apresPlafondJour: montantBrut,
      apresPlafondActe,
      apresPlafondFamille,
      apresPlafondGlobal,
      plafondActeValeur: perEventLimitDT,
      plafondJourValeur: dailyLimitDT,
    },
    _debug: {
      path: 'guarantees', effectiveAnnualLimitDT, familleId,
      annualLimit: guarantee.annual_limit,
      groupContractId,
      careTypesQueried: careTypes,
      guaranteeCareType: guarantee.care_type,
    },
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildEngineActe(
  acte: { code: string; lettre_cle: string | null },
  careType: string,
  fraisEngages: number,
  dateSoin: string,
  adherentId: string,
  nbrCle?: number,
  nombreJours?: number,
  guarantee?: Guarantee,
): Acte {
  let letterKey: string | undefined;
  let coefficient: number | undefined;

  // Determine letter_key and coefficient for Engine A
  if (guarantee && guarantee.letter_keys.length > 0) {
    if (acte.lettre_cle) {
      const upper = acte.lettre_cle.toUpperCase();
      if (guarantee.letter_keys.some(lk => lk.key === upper)) {
        letterKey = upper;
        coefficient = nbrCle ?? 1;
      }
    }
    if (!letterKey && nbrCle) {
      // Try to find the key from the acte code
      const parsed = parseLetterKeyCode(acte.code);
      if (parsed && guarantee.letter_keys.some(lk => lk.key === parsed.letter)) {
        letterKey = parsed.letter;
        coefficient = nbrCle;
      }
    }
  }

  return {
    care_type: careType,
    letter_key: letterKey,
    coefficient,
    montant: toMillimes(fraisEngages),
    jours: nombreJours,
    date: dateSoin,
    has_prescription: true,
    beneficiaire: {
      id: adherentId,
      type: 'adherent',
      age: 35,
    },
  };
}

/**
 * Family-wide contract plafond check (operates in DT, same as service).
 */
async function appliquerPlafondContratFamilleMillimes(
  db: D1Database,
  adherentId: string,
  groupContractId: string,
  annee: number,
  montantProposeDT: number,
): Promise<number | null> {
  const contract = await db
    .prepare('SELECT annual_global_limit FROM group_contracts WHERE id = ?')
    .bind(groupContractId)
    .first<{ annual_global_limit: number | null }>();

  if (!contract?.annual_global_limit || contract.annual_global_limit <= 0) return null;

  // annual_global_limit stored in DT in group_contracts
  const limiteDT = contract.annual_global_limit >= 50
    ? toDinars(contract.annual_global_limit) // was millimes
    : contract.annual_global_limit; // already DT

  const principalId = await resolvePrincipalAdherentId(db, adherentId);

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

  if (montantProposeDT > restantFamille) {
    return restantFamille;
  }

  return null;
}
