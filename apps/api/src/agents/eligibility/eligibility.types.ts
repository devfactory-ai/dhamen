/**
 * Eligibility Agent Types
 *
 * Types for eligibility verification of healthcare claims
 */

export interface EligibilityCheckRequest {
  adherentId: string;
  providerId: string;
  insurerId: string;
  careType: CareType;
  amount: number; // in millimes
  serviceDate: string; // ISO date
  actCodes?: string[]; // Optional specific act codes
}

export type CareType = 'pharmacy' | 'consultation' | 'lab' | 'hospitalization' | 'dental' | 'optical';

export interface EligibilityResult {
  eligible: boolean;
  contractId: string | null;
  reasons: EligibilityReason[];
  coverageDetails: CoverageDetails | null;
  confidence: number; // 0-100
  checkTime: number; // ms
  cachedResult: boolean;
}

export interface EligibilityReason {
  code: EligibilityReasonCode;
  message: string;
  severity: 'info' | 'warning' | 'error';
  details?: Record<string, unknown>;
}

export type EligibilityReasonCode =
  | 'CONTRACT_VALID'
  | 'CONTRACT_NOT_FOUND'
  | 'CONTRACT_EXPIRED'
  | 'CONTRACT_SUSPENDED'
  | 'CONTRACT_CANCELLED'
  | 'WAITING_PERIOD'
  | 'CARE_NOT_COVERED'
  | 'ANNUAL_LIMIT_EXCEEDED'
  | 'PER_ACT_LIMIT_EXCEEDED'
  | 'DAILY_LIMIT_EXCEEDED'
  | 'MONTHLY_LIMIT_EXCEEDED'
  | 'PROVIDER_NOT_IN_NETWORK'
  | 'PRIOR_AUTH_REQUIRED'
  | 'AGE_RESTRICTION'
  | 'ELIGIBLE';

export interface CoverageDetails {
  planType: 'individual' | 'family' | 'corporate';
  coveragePercentage: number;
  maxCoveredAmount: number | null;
  copayType: 'fixed' | 'percentage' | null;
  copayValue: number;
  remainingAnnualLimit: number | null;
  effectiveDate: string;
  expirationDate: string;
}

export interface Contract {
  id: string;
  insurerId: string;
  adherentId: string;
  contractNumber: string;
  planType: 'individual' | 'family' | 'corporate';
  startDate: string;
  endDate: string;
  carenceDays: number;
  annualLimit: number | null;
  coverageJson: string;
  exclusionsJson: string;
  status: 'active' | 'suspended' | 'expired' | 'cancelled';
}

export interface CoverageRule {
  id: string;
  insurerId: string;
  careType: CareType;
  planType: 'individual' | 'family' | 'corporate' | null;
  isCovered: boolean;
  requiresPriorAuth: boolean;
  annualLimit: number | null;
  perActLimit: number | null;
  perDayLimit: number | null;
  perMonthLimit: number | null;
  waitingDays: number;
  copayType: 'fixed' | 'percentage' | null;
  copayValue: number;
  networkOnly: boolean;
  minAge: number | null;
  maxAge: number | null;
  effectiveFrom: string;
  effectiveTo: string | null;
  isActive: boolean;
}

export interface Adherent {
  id: string;
  insurerId: string;
  nationalId: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string;
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
 * Cache key generation for eligibility results
 */
export function generateCacheKey(request: EligibilityCheckRequest): string {
  return `eligibility:${request.adherentId}:${request.insurerId}:${request.careType}:${request.serviceDate}`;
}
