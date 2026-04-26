export interface SubLimitEntry {
  taux?: number;           // 0-1 decimal
  plafond_jour?: number;   // millimes
  plafond_acte?: number;   // millimes
  plafond_annuel?: number; // millimes
  max_jours?: number;
}

export type SubLimitsMap = Record<string, number | SubLimitEntry>;
