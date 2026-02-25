/**
 * Tarification Agent Types
 *
 * Types for calculating healthcare claim pricing and coverage amounts
 */

export interface TarificationRequest {
  insurerId: string;
  providerId: string;
  adherentId: string;
  careType: CareType;
  actCode: string;
  quantity: number;
  unitPrice: number; // in millimes
  serviceDate: string;
  prescriptionId?: string;
}

export type CareType = 'pharmacy' | 'consultation' | 'lab' | 'hospitalization' | 'dental' | 'optical';

export interface TarificationResult {
  requestedAmount: number; // Total amount requested
  eligibleAmount: number; // Amount that qualifies for coverage
  coveredAmount: number; // Amount covered by insurer
  patientAmount: number; // Amount patient pays (ticket modérateur)
  copayAmount: number; // Copay component
  deductibleAmount: number; // Deductible component (if applicable)
  breakdown: TarificationBreakdown;
  warnings: TarificationWarning[];
  appliedRules: AppliedRule[];
  bareme: BaremeInfo | null;
  calculationTime: number;
}

export interface TarificationBreakdown {
  baseAmount: number;
  priceAdjustment: number; // Difference between requested and eligible
  coverageRate: number; // Percentage (0-100)
  copayType: 'fixed' | 'percentage' | null;
  copayValue: number;
  perActLimit: number | null;
  appliedLimit: boolean;
}

export interface TarificationWarning {
  code: TarificationWarningCode;
  message: string;
  details?: Record<string, unknown>;
}

export type TarificationWarningCode =
  | 'PRICE_ABOVE_BAREME'
  | 'ACT_NOT_IN_BAREME'
  | 'QUANTITY_EXCEEDS_STANDARD'
  | 'NON_NETWORK_PROVIDER'
  | 'REDUCED_COVERAGE'
  | 'MANUAL_REVIEW_REQUIRED';

export interface AppliedRule {
  ruleId: string;
  ruleName: string;
  effect: string;
  value: number;
}

export interface BaremeInfo {
  id: string;
  actCode: string;
  actName: string;
  referencePrice: number;
  minPrice: number | null;
  maxPrice: number | null;
  coverageRate: number;
  effectiveDate: string;
}

export interface Bareme {
  id: string;
  insurerId: string;
  careType: CareType;
  actCode: string;
  actName: string;
  referencePrice: number; // in millimes
  minPrice: number | null;
  maxPrice: number | null;
  coverageRate: number; // percentage (0-100)
  isNetworkBonus: boolean;
  networkBonusRate: number;
  effectiveFrom: string;
  effectiveTo: string | null;
  isActive: boolean;
}

export interface CoverageRule {
  id: string;
  insurerId: string;
  careType: CareType;
  planType: 'individual' | 'family' | 'corporate' | null;
  isCovered: boolean;
  copayType: 'fixed' | 'percentage' | null;
  copayValue: number;
  perActLimit: number | null;
  networkOnly: boolean;
  isActive: boolean;
}

export interface Provider {
  id: string;
  name: string;
  type: 'PHARMACY' | 'DOCTOR' | 'LAB' | 'CLINIC';
  isActive: boolean;
  isNetworkProvider: boolean;
}

/**
 * Generate cache key for tarification results
 */
export function generateTarificationCacheKey(request: TarificationRequest): string {
  return `tarif:${request.insurerId}:${request.actCode}:${request.serviceDate}`;
}
