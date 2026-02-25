/**
 * Fraud Detection Agent Types
 *
 * Types for detecting potentially fraudulent healthcare claims
 */

export interface FraudCheckRequest {
  claimId: string;
  adherentId: string;
  providerId: string;
  insurerId: string;
  careType: CareType;
  amount: number;
  serviceDate: string;
  serviceTime?: string; // HH:MM format
  actCodes?: string[];
  drugCodes?: string[]; // For pharmacy claims
}

export type CareType = 'pharmacy' | 'consultation' | 'lab' | 'hospitalization' | 'dental' | 'optical';

export interface FraudCheckResult {
  claimId: string;
  fraudScore: number; // 0-100, higher = more suspicious
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  recommendedAction: 'approve' | 'flag' | 'review' | 'block';
  triggeredRules: TriggeredRule[];
  drugInteractions: DrugInteraction[];
  duplicateCheck: DuplicateCheckResult;
  frequencyAnalysis: FrequencyAnalysis;
  amountAnalysis: AmountAnalysis;
  checkTime: number;
}

export interface TriggeredRule {
  ruleId: string;
  ruleCode: string;
  ruleName: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  scoreImpact: number;
  description: string;
  details?: Record<string, unknown>;
}

export interface DrugInteraction {
  drug1Code: string;
  drug1Name: string;
  drug2Code: string;
  drug2Name: string;
  interactionType: 'contraindicated' | 'severe' | 'moderate' | 'mild' | 'duplicate';
  description: string;
  scoreImpact: number;
}

export interface DuplicateCheckResult {
  isDuplicate: boolean;
  duplicateOf?: string;
  similarClaims: SimilarClaim[];
}

export interface SimilarClaim {
  claimId: string;
  serviceDate: string;
  amount: number;
  similarity: number; // 0-100
}

export interface FrequencyAnalysis {
  claimsToday: number;
  claimsThisWeek: number;
  claimsThisMonth: number;
  averageMonthly: number;
  isAnomalous: boolean;
  anomalyReason?: string;
}

export interface AmountAnalysis {
  claimAmount: number;
  averageAmount: number;
  standardDeviation: number;
  zScore: number;
  isAnomalous: boolean;
}

export interface FraudRule {
  id: string;
  insurerId: string | null;
  ruleCode: string;
  ruleName: string;
  ruleDescription: string | null;
  ruleType: 'duplicate' | 'frequency' | 'amount' | 'pattern' | 'incompatibility' | 'provider' | 'adherent';
  baseScore: number;
  thresholdValue: string | null; // JSON
  severity: 'low' | 'medium' | 'high' | 'critical';
  action: 'flag' | 'review' | 'block';
  careType: CareType | null;
  isActive: boolean;
}

export interface DrugIncompatibility {
  id: string;
  drugCode1: string;
  drugName1: string;
  drugCode2: string;
  drugName2: string;
  interactionType: 'contraindicated' | 'severe' | 'moderate' | 'mild' | 'duplicate';
  description: string | null;
  clinicalEffect: string | null;
  recommendation: string | null;
  fraudScoreImpact: number;
  isActive: boolean;
}

/**
 * Risk level thresholds
 */
export const RISK_THRESHOLDS = {
  low: 25,
  medium: 50,
  high: 75,
  critical: 90,
} as const;

/**
 * Determine risk level from fraud score
 */
export function getRiskLevel(score: number): 'low' | 'medium' | 'high' | 'critical' {
  if (score >= RISK_THRESHOLDS.critical) { return 'critical'; }
  if (score >= RISK_THRESHOLDS.high) { return 'high'; }
  if (score >= RISK_THRESHOLDS.medium) { return 'medium'; }
  return 'low';
}

/**
 * Determine recommended action from risk level
 */
export function getRecommendedAction(
  riskLevel: 'low' | 'medium' | 'high' | 'critical',
  triggeredRules: TriggeredRule[]
): 'approve' | 'flag' | 'review' | 'block' {
  // If any rule says block, block
  if (triggeredRules.some((r) => r.severity === 'critical')) {
    return 'block';
  }

  switch (riskLevel) {
    case 'critical':
      return 'block';
    case 'high':
      return 'review';
    case 'medium':
      return 'flag';
    default:
      return 'approve';
  }
}
