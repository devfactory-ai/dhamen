/**
 * Fraud Detection Agent Module
 *
 * Exports for fraud detection functionality
 */

export { detectFraud, detectFraudBatch } from './fraud.agent';

export {
  checkDuplicateClaim,
  checkClaimFrequency,
  checkUnusualAmount,
  checkOddHours,
  checkDrugInteractions,
  checkProviderVolume,
  calculateZScore,
  calculateClaimSimilarity,
  calculateFinalScore,
} from './fraud.rules';

export type {
  FraudCheckRequest,
  FraudCheckResult,
  TriggeredRule,
  DrugInteraction,
  DuplicateCheckResult,
  SimilarClaim,
  FrequencyAnalysis,
  AmountAnalysis,
  FraudRule,
  DrugIncompatibility,
  CareType,
} from './fraud.types';

export { getRiskLevel, getRecommendedAction, RISK_THRESHOLDS } from './fraud.types';
