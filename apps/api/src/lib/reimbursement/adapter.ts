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
import type { SubLimitEntry, SubLimitsMap } from '@dhamen/shared';
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
  beneficiaire?: { age: number; type: 'adherent' | 'spouse' | 'child' };
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
  all<T = unknown>(): Promise<D1Result<T>>;
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
  age_limit: number | null;
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
// SubLimitEntry normalization (backward compat for number values)
// ---------------------------------------------------------------------------

function normalizeSubLimitEntry(value: number | SubLimitEntry, context: 'jour' | 'acte' | 'annuel'): SubLimitEntry {
  if (typeof value === 'number') {
    if (context === 'jour') return { plafond_jour: value };
    if (context === 'annuel') return { plafond_annuel: value };
    return { plafond_acte: value };
  }
  return value;
}

// ---------------------------------------------------------------------------
// Acte code → sub_limits_json key mapping
// ---------------------------------------------------------------------------

// Maps acte code → candidate keys to search in sub_limits_json (case-insensitive)
// Multiple candidates per acte handle variant naming across contracts
const ACTE_CODE_TO_SUB_LIMIT_CANDIDATES: Record<string, string[]> = {
  MONTURE: ['monture'],
  VERRES: ['verres', 'verres_normaux', 'verres (normaux)'],
  DOUBLES_FOYERS: ['doubles_foyers', 'verres (doubles foyers)', 'doubles foyers'],
  LENTILLES: ['lentilles'],
  LASER: ['laser', 'traitement par laser', 'chirurgie_refractive'],
  SO: ['salle_operation', 'salle_op', 'so', 'fso', 'plafond fso', 'fso (max par acte)', 'frais de la salle'],
  ANE: ['anesthesie', 'ane', 'anesthésie'],
  PUU: ['medicaments_usage_unique', 'puu', 'materiel_usage_unique', 'usage unique', 'plafond usage unique', 'usage unique (max par acte)', 'médicaments et produit'],
};

/**
 * Find the sub-limit value for an acte code in a parsed sub_limits_json object.
 * Search order:
 *   1. Direct match by acte code (case-insensitive) — e.g. "ACC", "IG", "MONTURE"
 *   2. Legacy alias candidates from ACTE_CODE_TO_SUB_LIMIT_CANDIDATES
 * Supports both legacy number values and rich SubLimitEntry objects.
 * Values may be in DT or millimes — normalizes to millimes.
 */
export function findSubLimitValue(
  subLimits: SubLimitsMap,
  acteCode: string,
): number | null {
  // Build a lowercase map of the sub_limits keys
  const lowerMap: Record<string, number | SubLimitEntry> = {};
  for (const [k, v] of Object.entries(subLimits)) {
    lowerMap[k.toLowerCase()] = v;
  }

  function extractValue(raw: number | SubLimitEntry): number | null {
    if (typeof raw === 'number') {
      return raw < 1000 ? raw * 1000 : raw;
    }
    const val = raw.plafond_acte ?? raw.plafond_jour ?? raw.plafond_annuel;
    if (val != null) return val < 1000 ? val * 1000 : val;
    return null;
  }

  // 1. Direct match by acte code
  const direct = lowerMap[acteCode.toLowerCase()];
  if (direct != null) return extractValue(direct);

  // 2. Legacy alias candidates (exact key match)
  const candidates = ACTE_CODE_TO_SUB_LIMIT_CANDIDATES[acteCode] ??
    ACTE_CODE_TO_SUB_LIMIT_CANDIDATES[acteCode.toUpperCase()];
  if (candidates) {
    for (const candidate of candidates) {
      const raw = lowerMap[candidate.toLowerCase()];
      if (raw != null) return extractValue(raw);
    }
  }

  // 3. Partial match: check if any sub_limits key contains a candidate or vice versa
  const allKeys = Object.keys(lowerMap);
  if (candidates) {
    for (const candidate of candidates) {
      const cl = candidate.toLowerCase();
      for (const key of allKeys) {
        if (key.includes(cl) || cl.includes(key)) {
          return extractValue(lowerMap[key]!);
        }
      }
    }
  }
  // Also try acte code as partial match (skip single-letter codes — too ambiguous)
  const codeLower = acteCode.toLowerCase();
  if (codeLower.length >= 2) {
    for (const key of allKeys) {
      if (key.includes(codeLower) || codeLower.includes(key)) {
        return extractValue(lowerMap[key]!);
      }
    }
  }

  return null;
}

/**
 * Find sub-limit rate override in sub_limits_json.
 * Search order: direct acte code match, then legacy alias candidates.
 * Supports rich SubLimitEntry (taux field) and legacy "_rate" suffix keys.
 */
function findSubLimitRate(
  subLimits: SubLimitsMap,
  acteCode: string,
): number | null {
  const lowerMap: Record<string, number | SubLimitEntry> = {};
  for (const [k, v] of Object.entries(subLimits)) {
    lowerMap[k.toLowerCase()] = v;
  }

  function tryExtract(key: string): number | null {
    const raw = lowerMap[key.toLowerCase()];
    if (raw != null && typeof raw === 'object' && raw.taux != null) return raw.taux;
    const rateVal = lowerMap[`${key.toLowerCase()}_rate`];
    if (rateVal != null && typeof rateVal === 'number') return rateVal;
    return null;
  }

  // 1. Direct match by acte code
  const direct = tryExtract(acteCode);
  if (direct != null) return direct;

  // 2. Legacy alias candidates (exact key match)
  const candidates = ACTE_CODE_TO_SUB_LIMIT_CANDIDATES[acteCode] ??
    ACTE_CODE_TO_SUB_LIMIT_CANDIDATES[acteCode.toUpperCase()];
  if (candidates) {
    for (const candidate of candidates) {
      const val = tryExtract(candidate);
      if (val != null) return val;
    }
  }

  // 3. Partial match: check if any sub_limits key contains a candidate or vice versa
  // Require minimum 2-char match to avoid false positives (e.g. "R" matching "ELR")
  function tryExtractPartial(searchTerms: string[]): number | null {
    const allKeys = Object.keys(lowerMap);
    for (const term of searchTerms) {
      const tl = term.toLowerCase();
      if (tl.length < 2) continue; // skip single-letter codes — too ambiguous for partial match
      for (const key of allKeys) {
        if (key.includes(tl) || tl.includes(key)) {
          const raw = lowerMap[key];
          if (raw != null && typeof raw === 'object' && raw.taux != null) return raw.taux;
        }
      }
    }
    return null;
  }
  if (candidates) {
    const partial = tryExtractPartial(candidates);
    if (partial != null) return partial;
  }
  const partialCode = tryExtractPartial([acteCode]);
  if (partialCode != null) return partialCode;

  return null;
}

// Fallback mapping used only if familles_actes.care_type column doesn't exist yet
const FAMILLE_TO_CARE_TYPES_FALLBACK: Record<string, string[]> = {
  'fa-001': ['consultation_visite', 'consultation'],
  'fa-003': ['pharmacie', 'pharmacy'],
  'fa-004': ['laboratoire', 'laboratory'],
  'fa-005': ['orthopedie', 'orthopedics'],
  'fa-006': ['optique', 'optical'],
  'fa-007': ['hospitalisation', 'hospitalisation_hopital', 'hospitalization', 'sanatorium'],
  'fa-009': ['actes_courants', 'medical_acts'],
  'fa-010': ['chirurgie', 'surgery', 'chirurgie_fso', 'chirurgie_usage_unique'],
  'fa-011': ['dentaire', 'dental', 'dentaire_prothese'],
  'fa-012': ['accouchement', 'maternity', 'accouchement_gemellaire', 'interruption_grossesse'],
  'fa-013': ['cures_thermales', 'thermal_cure'],
  'fa-014': ['frais_funeraires', 'funeral'],
  'fa-015': ['circoncision', 'circumcision'],
  'fa-016': ['transport'],
  'fa-017': ['actes_specialistes', 'actes_courants', 'medical_acts'],
  'fa-019': ['frais_funeraires', 'funeral'],
};

/**
 * Resolve care_types for a famille_id.
 * Collects ALL candidates (DB care_type + fallback aliases),
 * then filters to only those that exist in the contract (if known).
 * This handles mismatches like 'consultation' vs 'consultation_visite'.
 */
async function getCareTypesForFamille(db: D1Database, familleId: string, groupContractId?: string): Promise<string[]> {
  const candidates = new Set<string>();

  // 1. DB care_type (authoritative)
  try {
    const row = await db
      .prepare('SELECT care_type FROM familles_actes WHERE id = ?')
      .bind(familleId)
      .first<{ care_type: string | null }>();
    if (row?.care_type) candidates.add(row.care_type);
  } catch { /* column may not exist yet */ }

  // 2. Fallback aliases (covers all known variants)
  const fallback = FAMILLE_TO_CARE_TYPES_FALLBACK[familleId];
  if (fallback) for (const ct of fallback) candidates.add(ct);

  if (candidates.size === 0) return [];

  // 3. If contract known, filter to care_types that actually exist in it
  if (groupContractId) {
    const all = [...candidates];
    const placeholders = all.map(() => '?').join(', ');
    const rows = await db
      .prepare(
        `SELECT DISTINCT care_type FROM contract_guarantees
         WHERE group_contract_id = ? AND care_type IN (${placeholders}) AND is_active = 1`
      )
      .bind(groupContractId, ...all)
      .all<{ care_type: string }>();
    if (rows.results && rows.results.length > 0) {
      return rows.results.map((r: { care_type: string }) => r.care_type);
    }
  }

  return [...candidates];
}

/**
 * Broad guarantee search: when the specific care_type-based lookup fails,
 * search ALL active guarantees for the group contract and match by:
 *   1. Famille label keywords (e.g., 'chirurgie' in label → care_type 'chirurgie')
 *   2. Acte code in letter_keys_json (e.g., 'KC' key → chirurgie guarantee)
 *   3. Acte code in sub_limits_json (e.g., 'FCH' key → chirurgie guarantee)
 * This is a safety net to handle mismatches between famille→care_type mapping.
 */
async function findGuaranteeBroad(
  db: D1Database,
  groupContractId: string,
  familleId: string | null,
  acteCode: string,
  lettreCle: string | null,
): Promise<DbGuaranteeRow | null> {
  // Get all active guarantees for this contract
  const { results: allGuarantees } = await db
    .prepare(
      `SELECT care_type, reimbursement_rate, is_fixed_amount, annual_limit, per_event_limit,
              daily_limit, max_days, letter_keys_json, sub_limits_json, bareme_tp_id, age_limit
       FROM contract_guarantees
       WHERE group_contract_id = ? AND is_active = 1`
    )
    .bind(groupContractId)
    .all<DbGuaranteeRow>();

  if (!allGuarantees || allGuarantees.length === 0) return null;

  const acteUpper = acteCode.toUpperCase();
  const lettreUpper = lettreCle?.toUpperCase();

  // Strategy 1: Check if any guarantee has this acte code or lettre_cle in its letter_keys_json
  for (const g of allGuarantees) {
    if (!g.letter_keys_json) continue;
    try {
      const keys = JSON.parse(g.letter_keys_json) as Record<string, unknown>;
      const upperKeys = Object.keys(keys).map(k => k.toUpperCase());
      if (upperKeys.includes(acteUpper) || (lettreUpper && upperKeys.includes(lettreUpper))) {
        return g;
      }
    } catch { /* ignore */ }
  }

  // Strategy 2: Check if any guarantee has this acte code in its sub_limits_json
  for (const g of allGuarantees) {
    if (!g.sub_limits_json) continue;
    try {
      const subs = JSON.parse(g.sub_limits_json) as Record<string, unknown>;
      const upperKeys = Object.keys(subs).map(k => k.toUpperCase());
      if (upperKeys.includes(acteUpper)) {
        return g;
      }
    } catch { /* ignore */ }
  }

  // Strategy 3: Match by famille label keywords in care_type
  if (familleId) {
    try {
      const fam = await db
        .prepare('SELECT label FROM familles_actes WHERE id = ?')
        .bind(familleId)
        .first<{ label: string }>();
      if (fam?.label) {
        const famWords = fam.label.toLowerCase().split(/[\s\/,()-]+/).filter(w => w.length > 3);
        for (const g of allGuarantees) {
          const ct = g.care_type.toLowerCase().replace(/_/g, ' ');
          if (famWords.some(w => ct.includes(w))) {
            return g;
          }
        }
      }
    } catch { /* ignore */ }
  }

  return null;
}

// Known letter keys for parseLetterKeyCode
const KNOWN_LETTER_KEYS = ['AMM', 'AMO', 'AMY', 'AM', 'CS', 'DC', 'DP', 'KC', 'PC', 'B', 'C', 'D', 'E', 'K', 'Z'];

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
// Hospitalisation sub-limit keyword resolution
// ---------------------------------------------------------------------------

/**
 * Resolve the sub_limits keyword for hospitalisation daily limit.
 * Uses acte code as primary signal (CL=clinique, HP=hôpital),
 * falls back to careType for backward compat.
 */
function resolveHospKeyword(acteCode?: string, careType?: string): string {
  const code = acteCode?.toUpperCase();
  if (code === 'SANA') return 'sanatorium';
  if (code === 'HP') return 'hopital';
  if (code === 'CL') return 'clinique';
  // Fallback: careType-based (backward compat)
  if (careType === 'sanatorium') return 'sanatorium';
  if (careType === 'hospitalisation_hopital') return 'hopital';
  return 'clinique';
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
    careType?: string;
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

  // Parse sub_limits_json → SubLimitsMap (supports rich entries)
  let subLimits: { key: string; value: number }[] = [];
  let subLimitsRaw: SubLimitsMap | null = null;
  if (row.sub_limits_json) {
    try {
      subLimitsRaw = JSON.parse(row.sub_limits_json) as SubLimitsMap;
    } catch { /* ignore */ }
  }

  // Resolve per_act_ceiling: base from per_event_limit, possibly overridden by sub-limits
  let perActCeiling = row.per_event_limit; // already millimes
  let effectiveRate = rate;

  // Resolve daily_limit with hospitalisation hôpital/clinique/sanatorium variants
  let dailyLimit = row.daily_limit; // millimes
  let maxDays = row.max_days;
  if (subLimitsRaw && opts?.familleId === 'fa-007') {
    const keyword = resolveHospKeyword(opts?.acteCode, opts?.careType);
    const match = Object.entries(subLimitsRaw).find(
      ([k]) => k.toLowerCase().replace(/ô/g, 'o').includes(keyword)
    );
    if (match != null) {
      const raw = match[1];
      if (typeof raw === 'number') {
        dailyLimit = raw < 1000 ? raw * 1000 : raw;
      } else if (typeof raw === 'object' && raw !== null) {
        const entry = raw as SubLimitEntry;
        if (entry.plafond_jour != null) {
          dailyLimit = entry.plafond_jour < 1000 ? entry.plafond_jour * 1000 : entry.plafond_jour;
        }
        if (entry.max_jours != null) maxDays = entry.max_jours;
        // Hospitalisation = forfait journalier → rate parent suffit, pas d'override depuis sous-acte
      }
    }
  }

  // Acte-code-based sub-limit overrides (optique, chirurgie components)
  if (subLimitsRaw && opts?.acteCode) {
    const subVal = findSubLimitValue(subLimitsRaw, opts.acteCode);
    if (subVal != null) {
      perActCeiling = subVal; // millimes (normalized)
      const subRate = findSubLimitRate(subLimitsRaw, opts.acteCode);
      if (subRate != null) {
        effectiveRate = normalizeRate(subRate);
      } else if (opts.acteRate != null && opts.acteRate > 0 && normalizeRate(opts.acteRate) !== rate) {
        effectiveRate = normalizeRate(opts.acteRate);
      }
    }
  }

  // Build sub_limits array for Engine A (non-hospitalisation sub-limits)
  if (subLimitsRaw) {
    const skipKeys = new Set([
      'hopital', 'hôpital', 'clinique', 'sanatorium',
      'ordinaire', 'chronique', 'maladies_ordinaires', 'maladies_chroniques',
    ]);
    subLimits = Object.entries(subLimitsRaw)
      .filter(([k]) => !k.endsWith('_rate') && !skipKeys.has(k.toLowerCase()) && !k.toLowerCase().includes('journalier'))
      .map(([k, v]) => ({ key: k, value: typeof v === 'number' ? v : (v.plafond_acte ?? v.plafond_jour ?? v.plafond_annuel ?? 0) }));
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
      const raw = subLimitsRaw[key];
      if (raw != null) {
        if (typeof raw === 'number') {
          annualCeiling = raw;
        } else if (typeof raw === 'object' && raw !== null) {
          const entry = raw as SubLimitEntry;
          if (entry.plafond_annuel != null) annualCeiling = entry.plafond_annuel;
          if (entry.taux != null) effectiveRate = normalizeRate(entry.taux);
        }
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
    max_days: maxDays,
    letter_keys: letterKeys,
    sub_limits: subLimits,
    requires_prescription: false, // Not checked in adapter path (already validated upstream)
    requires_cnam_complement: false,
    renewal_period: '',
    age_limit: row.age_limit ?? null,
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
    if (opts?.nbrCle && opts.nbrCle > 0) {
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
      const famCareTypes = await getCareTypesForFamille(db, familleId, groupContractId);
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
    } else {
      // Fallback: if contract has no group_contract_id, try to find a group contract
      // that has guarantees by looking at the adherent's other contracts
      const gcFallback = await db
        .prepare(
          `SELECT DISTINCT c2.group_contract_id FROM contracts c1
           JOIN adherents a ON a.contract_id = c1.id OR a.id = c1.adherent_id
           JOIN contracts c2 ON c2.adherent_id = a.id AND c2.group_contract_id IS NOT NULL
           WHERE c1.id = ? AND c2.status = 'active'
           LIMIT 1`
        )
        .bind(contractId)
        .first<{ group_contract_id: string }>();
      if (gcFallback?.group_contract_id) {
        baremeContractId = gcFallback.group_contract_id;
      } else {
        // Last resort: find ANY group_contract that has active guarantees
        const anyGc = await db
          .prepare(
            `SELECT DISTINCT group_contract_id FROM contract_guarantees
             WHERE is_active = 1 LIMIT 1`
          )
          .first<{ group_contract_id: string }>();
        if (anyGc?.group_contract_id) {
          baremeContractId = anyGc.group_contract_id;
        }
      }
    }
    if (batchCtx) {
      batchCtx.baremeContractId = baremeContractId;
    }
  }

  // 1b. Resolve beneficiary age & type for eligibility checks (age_limit)
  let benInfo: { age: number; type: 'adherent' | 'spouse' | 'child' } | undefined;
  if (batchCtx?.beneficiaire) {
    benInfo = batchCtx.beneficiaire;
  } else {
    const adRow = await db
      .prepare('SELECT date_of_birth, parent_adherent_id, code_type FROM adherents WHERE id = ?')
      .bind(adherentId)
      .first<{ date_of_birth: string | null; parent_adherent_id: string | null; code_type: string | null }>();
    if (adRow?.date_of_birth) {
      const birth = new Date(adRow.date_of_birth);
      const ref = new Date(dateSoin);
      let age = ref.getFullYear() - birth.getFullYear();
      const monthDiff = ref.getMonth() - birth.getMonth();
      if (monthDiff < 0 || (monthDiff === 0 && ref.getDate() < birth.getDate())) age--;
      const codeUpper = adRow.code_type?.toUpperCase() ?? '';
      const benType: 'adherent' | 'spouse' | 'child' =
        codeUpper === 'C' ? 'spouse'
        : (codeUpper === 'E' || adRow.parent_adherent_id) ? 'child'
        : 'adherent';
      benInfo = { age, type: benType };
    }
    if (batchCtx) {
      batchCtx.beneficiaire = benInfo;
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

  // 4. Determine care_type for guarantee lookup (DB-driven)
  let careType: string;
  if (careTypeOverride) {
    careType = careTypeOverride;
  } else if (familleId) {
    const careTypes = await getCareTypesForFamille(db, familleId, baremeContractId);
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

    // Per-acte sub-limit from contract (e.g., optique: monture 300, verres 250)
    // Loaded from contract_guarantees.sub_limits_json — contract is authoritative
    const subLimitCandidates = ACTE_CODE_TO_SUB_LIMIT_CANDIDATES[acte.code] ??
      ACTE_CODE_TO_SUB_LIMIT_CANDIDATES[acte.code.toUpperCase()];
    if (subLimitCandidates) {
      const famCareTypes = familleId ? await getCareTypesForFamille(db, familleId, baremeContractId) : [];
      const careTypesForLookup = famCareTypes && famCareTypes.length > 0
        ? famCareTypes
        : (careTypeOverride ? [careTypeOverride] : [careType]);
      const ctPlaceholders = careTypesForLookup.map(() => '?').join(', ');
      // When multiple care_types, pick the guarantee whose sub_limits mention this acte code
      let cgRow: { sub_limits_json: string | null } | null = null;
      if (careTypesForLookup.length > 1 && acte.code) {
        const allCg = await db
          .prepare(
            `SELECT sub_limits_json FROM contract_guarantees
             WHERE group_contract_id = ? AND care_type IN (${ctPlaceholders}) AND is_active = 1
             ORDER BY CASE WHEN care_type = 'hospitalisation' THEN 0 ELSE 1 END, guarantee_number ASC`
          )
          .bind(baremeContractId, ...careTypesForLookup)
          .all<{ sub_limits_json: string | null }>();
        const cgRows = allCg.results || [];
        const codeUp = acte.code.toUpperCase();
        for (const r of cgRows) {
          if (r.sub_limits_json) {
            try {
              const keys = Object.keys(JSON.parse(r.sub_limits_json) as Record<string, unknown>);
              if (keys.some(k => k.toUpperCase() === codeUp)) { cgRow = r; break; }
            } catch { /* skip */ }
          }
        }
        if (!cgRow && cgRows.length > 0) cgRow = cgRows[0]!;
      } else {
        cgRow = await db
          .prepare(
            `SELECT sub_limits_json FROM contract_guarantees
             WHERE group_contract_id = ? AND care_type IN (${ctPlaceholders}) AND is_active = 1
             ORDER BY CASE WHEN care_type = 'hospitalisation' THEN 0 ELSE 1 END, created_at DESC LIMIT 1`
          )
          .bind(baremeContractId, ...careTypesForLookup)
          .first<{ sub_limits_json: string | null }>();
      }

      if (cgRow?.sub_limits_json) {
        try {
          const subLimits = JSON.parse(cgRow.sub_limits_json) as SubLimitsMap;
          const subVal = findSubLimitValue(subLimits, acte.code);
          if (subVal != null) {
            guarantee.per_act_ceiling = subVal; // millimes (normalized)
          }
          const subRate = findSubLimitRate(subLimits, acte.code);
          if (subRate != null) {
            guarantee.rate = normalizeRate(subRate);
          }
        } catch { /* ignore */ }
      }
    }

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
    acte, careType, fraisEngages, dateSoin, adherentId, nbrCle, nombreJours, guarantee, benInfo
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

function safeParseJson(s: string): Record<string, unknown> {
  try { return JSON.parse(s) as Record<string, unknown>; } catch { return {}; }
}

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
  // Always use famille-based care types for guarantee lookup (the contract may store
  // a single "hospitalisation" guarantee covering both clinique and hôpital).
  // careTypeOverride is kept for sub_limits resolution (clinique vs hôpital daily limit).
  const familleCareTypes = familleId ? await getCareTypesForFamille(db, familleId, groupContractId) : null;
  const careTypes = familleCareTypes && familleCareTypes.length > 0
    ? familleCareTypes
    : careTypeOverride ? [careTypeOverride] : null;
  let guarantee: DbGuaranteeRow | null = null;

  if (careTypes && careTypes.length > 0) {
    const placeholders = careTypes.map(() => '?').join(', ');

    if (careTypes.length === 1) {
      // Single care_type — simple LIMIT 1
      guarantee = await db
        .prepare(
          `SELECT care_type, reimbursement_rate, is_fixed_amount, annual_limit, per_event_limit,
                  daily_limit, max_days, letter_keys_json, sub_limits_json, bareme_tp_id, age_limit
           FROM contract_guarantees
           WHERE group_contract_id = ? AND care_type IN (${placeholders}) AND is_active = 1
           ORDER BY CASE WHEN care_type = 'hospitalisation' THEN 0 ELSE 1 END, created_at DESC
           LIMIT 1`
        )
        .bind(groupContractId, ...careTypes)
        .first<DbGuaranteeRow>();
    } else {
      // Multiple care_types (e.g. fa-017 → actes_specialistes + actes_courants):
      // pick the guarantee that mentions this acte code in sub_limits or letter_keys
      const allRows = await db
        .prepare(
          `SELECT care_type, reimbursement_rate, is_fixed_amount, annual_limit, per_event_limit,
                  daily_limit, max_days, letter_keys_json, sub_limits_json, bareme_tp_id, age_limit
           FROM contract_guarantees
           WHERE group_contract_id = ? AND care_type IN (${placeholders}) AND is_active = 1
           ORDER BY CASE WHEN care_type = 'hospitalisation' THEN 0 ELSE 1 END, guarantee_number ASC`
        )
        .bind(groupContractId, ...careTypes)
        .all<DbGuaranteeRow>();
      const rows = allRows.results || [];
      if (rows.length <= 1) {
        guarantee = rows[0] ?? null;
      } else if (acte.code) {
        // Pick the guarantee that has this acte code in its sub_limits or letter_keys
        const codeUpper = acte.code.toUpperCase();
        const lkUpper = acte.lettre_cle?.toUpperCase() || null;
        // Parse composite code letter (e.g., "R" from "R40", "PHY" from "PHY50")
        const parsedLetter = parseLetterKeyCode(acte.code)?.letter || null;

        // 1. If careTypeOverride is specified, prefer the guarantee matching that care_type
        if (careTypeOverride) {
          const overrideRow = rows.find(r => r.care_type === careTypeOverride);
          if (overrideRow) guarantee = overrideRow;
        }

        // 2. If no match yet, match by acte code / lettre_cle / parsed letter in sub_limits or letter_keys
        if (!guarantee) {
          for (const row of rows) {
            try {
              if (row.sub_limits_json) {
                const keys = Object.keys(JSON.parse(row.sub_limits_json) as Record<string, unknown>);
                if (keys.some(k => {
                  const ku = k.toUpperCase();
                  return ku === codeUpper || (lkUpper && ku === lkUpper) || (parsedLetter && ku === parsedLetter);
                })) {
                  guarantee = row; break;
                }
              }
              if (row.letter_keys_json) {
                const keys = Object.keys(JSON.parse(row.letter_keys_json) as Record<string, unknown>);
                if (keys.some(k => {
                  const ku = k.toUpperCase();
                  return ku === codeUpper || (lkUpper && ku === lkUpper) || (parsedLetter && ku === parsedLetter);
                })) {
                  guarantee = row; break;
                }
              }
            } catch { /* skip malformed JSON */ }
          }
        }
        if (!guarantee) guarantee = rows[0]!;
      } else {
        guarantee = rows[0]!;
      }
    }
  }

  // Broad fallback: if specific care_type lookup failed, search by acte code / lettre_cle / famille label
  if (!guarantee) {
    guarantee = await findGuaranteeBroad(db, groupContractId, familleId, acte.code, acte.lettre_cle);
  }

  if (!guarantee) {
    throw new Error(
      `BAREME_NOT_FOUND: Aucune garantie trouvee pour contrat=${groupContractId}, ` +
      `famille=${familleId}, acte=${acte.code}, careTypes=[${careTypes?.join(',')}]`
    );
  }

  // --- Direct calculation in DT (proven logic from original service) ---
  const isFixed = guarantee.is_fixed_amount === 1;
  let rate = guarantee.reimbursement_rate ?? 0;

  // Normalize amounts: contract_guarantees stores in millimes → convert to DT
  let perEventLimitDT = guarantee.per_event_limit != null ? guarantee.per_event_limit / 1000 : null;
  const annualLimitDT = guarantee.annual_limit != null ? guarantee.annual_limit / 1000 : null;
  let dailyLimitDT = guarantee.daily_limit != null ? guarantee.daily_limit / 1000 : null;

  // Parse sub_limits_json (supports rich SubLimitEntry)
  let subLimits: SubLimitsMap | null = null;
  let maxDaysDT = guarantee.max_days;
  if (guarantee.sub_limits_json) {
    try { subLimits = JSON.parse(guarantee.sub_limits_json) as SubLimitsMap; } catch { /* ignore */ }
  }

  // Hospitalisation hôpital/clinique/sanatorium daily limit
  if (subLimits && familleId === 'fa-007') {
    const keyword = resolveHospKeyword(acte.code, careTypeOverride || guarantee.care_type);
    const match = Object.entries(subLimits).find(
      ([k]) => k.toLowerCase().replace(/ô/g, 'o').includes(keyword)
    );
    if (match != null) {
      const raw = match[1];
      if (typeof raw === 'number') {
        dailyLimitDT = raw < 1000 ? raw : raw / 1000;
      } else if (typeof raw === 'object' && raw !== null) {
        const entry = raw as SubLimitEntry;
        if (entry.plafond_jour != null) {
          dailyLimitDT = entry.plafond_jour < 1000 ? entry.plafond_jour : entry.plafond_jour / 1000;
        }
        if (entry.max_jours != null) maxDaysDT = entry.max_jours;
        // Hospitalisation = forfait journalier → rate parent suffit, pas d'override depuis sous-acte
      }
    }
  }

  // Acte-code-based sub-limit override (optique, chirurgie, actes courants per-key rate)
  // Skip per-event plafond when dailyLimit is already resolved (hospitalisation/sanatorium)
  // — the daily limit × jours calculation handles these ceilings, applying it again as
  //   perEventLimit would collapse the multi-day total back to a single-day amount.
  if (subLimits && acte.code) {
    const subVal = findSubLimitValue(subLimits, acte.code);
    if (subVal != null && dailyLimitDT == null) {
      perEventLimitDT = subVal / 1000;
    }
    // Rate override from sub_limits (independent of plafond — allows taux-only entries like PHY: 90%)
    const subRate = findSubLimitRate(subLimits, acte.code);
    if (subRate != null) {
      rate = subRate;
    } else if (subVal != null && acte.taux_remboursement != null && acte.taux_remboursement > 0 && acte.taux_remboursement !== rate) {
      rate = acte.taux_remboursement;
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
      const capped = Math.min(fraisEngages, effectiveBase);
      if (rate > 0 && rate < 1) {
        // Apply guarantee rate to the capped amount (e.g., 90% × min(facture, coeff × key_value))
        typeCalcul = 'taux';
        valeur = rate;
        montantBrut = Math.floor(capped * rate * 1000) / 1000;
      } else {
        // 100% capped (e.g., K: 100% with max = coeff × 1.5 DT)
        typeCalcul = 'forfait';
        valeur = effectiveBase;
        montantBrut = capped;
      }
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
    // Matched via lettre_cle without coefficient — apply rate × frais engagés
    // Priority: contract sub_limit rate > contract guarantee rate > acte referentiel rate > fallback 80%
    const effectiveRate = (rate > 0 && rate <= 1) ? rate
      : (acte.taux_remboursement != null && acte.taux_remboursement > 0 && acte.taux_remboursement <= 1)
        ? acte.taux_remboursement : 0.80;
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
    // Last resort: use acte referentiel taux instead of throwing
    const fallbackRate = (acte.taux_remboursement != null && acte.taux_remboursement > 0)
      ? acte.taux_remboursement
      : 0.80;
    typeCalcul = 'taux';
    valeur = fallbackRate;
    montantBrut = Math.floor(fraisEngages * fallbackRate * 1000) / 1000;
  }

  // Daily limit
  let plafondJourApplique = false;
  if (dailyLimitDT != null) {
    if (nombreJours && nombreJours > 0) {
      const joursEffectifs = (maxDaysDT && maxDaysDT > 0) ? Math.min(nombreJours, maxDaysDT) : nombreJours;
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
      const raw = subLimits[key];
      if (raw != null) {
        if (typeof raw === 'number') {
          effectiveAnnualLimitDT = raw / 1000;
        } else if (typeof raw === 'object' && raw !== null) {
          const entry = raw as SubLimitEntry;
          if (entry.plafond_annuel != null) effectiveAnnualLimitDT = entry.plafond_annuel / 1000;
          if (entry.taux != null) rate = entry.taux;
        }
        break;
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
      const familleCareTypes = familleId ? await getCareTypesForFamille(db, familleId, groupContractId) : [];
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
      dailyLimit: guarantee.daily_limit,
      dailyLimitResolved: dailyLimitDT,
      maxDays: guarantee.max_days,
      maxDaysResolved: maxDaysDT,
      nombreJours,
      rate,
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
  beneficiaire?: { age: number; type: 'adherent' | 'spouse' | 'child' },
): Acte {
  let letterKey: string | undefined;
  let coefficient: number | undefined;

  // Determine letter_key and coefficient for Engine A
  // Only use letter-key path when nbrCle (cotation) is provided — without it,
  // Engine A would default coefficient=1 which is wrong for analyses/chirurgie.
  if (guarantee && guarantee.letter_keys.length > 0 && nbrCle && nbrCle > 0) {
    if (acte.lettre_cle) {
      const upper = acte.lettre_cle.toUpperCase();
      if (guarantee.letter_keys.some(lk => lk.key === upper)) {
        letterKey = upper;
        coefficient = nbrCle;
      }
    }
    if (!letterKey) {
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
      type: beneficiaire?.type ?? 'adherent',
      age: beneficiaire?.age ?? 35,
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
