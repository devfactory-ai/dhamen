/**
 * Reimbursement engine types.
 * All monetary values are in MILLIMES unless explicitly noted.
 */

// ---------------------------------------------------------------------------
// Input types
// ---------------------------------------------------------------------------

export interface Guarantee {
  care_type: string;
  rate: number | null;                                // 0-100 (percentage)
  annual_ceiling: number | null;                      // millimes
  per_act_ceiling: number | null;                     // millimes
  per_day_ceiling: number | null;                     // millimes
  max_days: number | null;                             // max days for fixed_daily (e.g., cures thermales 21j)
  letter_keys: { key: string; value: number }[];      // value in millimes
  sub_limits: { key: string; value: number }[];       // value in millimes
  requires_prescription: boolean;
  requires_cnam_complement: boolean;
  renewal_period: string;
  age_limit: number | null;
  conditions: string;
}

export interface Contract {
  id: string;
  annual_global_limit: number | null;                 // millimes
  carence_days: number;
  effective_date: string;                             // YYYY-MM-DD
  guarantees: Guarantee[];
  covers_spouse: boolean;
  covers_children: boolean;
  children_max_age: number | null;
}

export interface Beneficiaire {
  id: string;
  type: 'adherent' | 'spouse' | 'child';
  age: number;
  status?: 'student' | 'disabled' | 'retiree';
}

export interface Acte {
  care_type: string;
  letter_key?: string;                                // 'B', 'C2', 'KC', 'D'…
  coefficient?: number;                               // e.g., 40 for B40
  montant: number;                                    // millimes (invoiced amount)
  jours?: number;                                     // hospitalization days
  date: string;                                       // YYYY-MM-DD
  sub_limit_key?: string;                             // 'monture', 'verres', etc.
  has_prescription?: boolean;
  beneficiaire: Beneficiaire;
}

export interface AnnualContext {
  year: number;
  byBeneficiaire: {
    [beneficiaireId: string]: {
      totalReimbursed: number;                        // millimes
      byCareType: {
        [care_type: string]: number;                  // millimes
      };
    };
  };
}

// ---------------------------------------------------------------------------
// Output types
// ---------------------------------------------------------------------------

export type StrategyType = 'letter_key' | 'rate' | 'fixed_day';
export type PlafondType = 'per_act' | 'sub_limit' | 'annual_category' | 'annual_global' | null;

export interface ActeResult {
  montantFacture: number;                             // millimes
  montantRembourse: number;                           // millimes
  strategieAppliquee: StrategyType;
  plafondLimitant: PlafondType;
  calcul: string;                                     // e.g., "40 × 270 = 10800"
  rejetRaison?: string;
}

export interface BulletinResult {
  actes: ActeResult[];
  totalRembourse: number;                             // millimes
  totalFacture: number;                               // millimes
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export class MissingLetterKeyError extends Error {
  constructor(letterKey: string, careType: string) {
    super(`Letter key "${letterKey}" not found in guarantee for care_type "${careType}"`);
    this.name = 'MissingLetterKeyError';
  }
}

export class NoGuaranteeError extends Error {
  constructor(careType: string) {
    super(`No guarantee found for care_type "${careType}"`);
    this.name = 'NoGuaranteeError';
  }
}

export class NoStrategyError extends Error {
  constructor(careType: string) {
    super(`Cannot determine reimbursement strategy for care_type "${careType}": no rate, no letter_keys, no per_day_ceiling`);
    this.name = 'NoStrategyError';
  }
}
