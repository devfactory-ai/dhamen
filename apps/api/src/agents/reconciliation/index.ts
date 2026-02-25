/**
 * Reconciliation Agent Module
 *
 * Exports for claims reconciliation and bordereau generation
 */

export {
  reconcileClaims,
  getBordereau,
  updateBordereauStatus,
  resolveDiscrepancy,
  getReconciliationHistory,
  getPendingDiscrepancies,
} from './reconciliation.agent';

export {
  calculateProviderReconciliation,
  calculateReconciliationSummary,
  detectAmountDiscrepancies,
  detectDuplicateClaims,
  detectStatusDiscrepancies,
  calculateAdjustments,
  validateClaimsForBordereau,
  groupClaimsByProvider,
} from './reconciliation.rules';

export type {
  ReconciliationRequest,
  ReconciliationResult,
  ReconciliationSummary,
  ProviderReconciliation,
  Adjustment,
  Discrepancy,
  DiscrepancyType,
  BordereauInfo,
  Claim,
  Provider,
} from './reconciliation.types';

export {
  generateBordereauNumber,
  generateReconciliationId,
} from './reconciliation.types';
