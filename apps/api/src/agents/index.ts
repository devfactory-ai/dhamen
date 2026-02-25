/**
 * AI Agents Module
 *
 * Exports all agents for healthcare claims processing
 */

// Eligibility Agent - Verifies healthcare coverage eligibility
export {
  checkEligibility,
  checkEligibilityBatch,
  invalidateEligibilityCache,
} from './eligibility';
export type { EligibilityCheckRequest, EligibilityResult } from './eligibility';

// Tarification Agent - Calculates claim pricing and coverage amounts
export {
  calculateTarification,
  calculateBatchTarification,
  getCachedBaremes,
} from './tarification';
export type { TarificationRequest, TarificationResult } from './tarification';

// Fraud Detection Agent - Detects potentially fraudulent claims
export {
  detectFraud,
  detectFraudBatch,
} from './fraud';
export type { FraudCheckRequest, FraudCheckResult } from './fraud';

// Reconciliation Agent - Reconciles claims and generates bordereaux
export {
  reconcileClaims,
  getBordereau,
  updateBordereauStatus,
  resolveDiscrepancy,
  getReconciliationHistory,
  getPendingDiscrepancies,
} from './reconciliation';
export type { ReconciliationRequest, ReconciliationResult, BordereauInfo } from './reconciliation';
