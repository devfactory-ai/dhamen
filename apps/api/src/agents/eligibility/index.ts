/**
 * Eligibility Agent Module
 *
 * Exports for eligibility verification functionality
 */

export { checkEligibility, checkEligibilityBatch, invalidateEligibilityCache } from './eligibility.agent';

export {
  checkContractValidity,
  checkWaitingPeriod,
  checkCareTypeCoverage,
  checkAmountLimits,
  checkProviderNetwork,
  checkAgeRestriction,
  evaluateEligibility,
} from './eligibility.rules';

export type {
  EligibilityCheckRequest,
  EligibilityResult,
  EligibilityReason,
  EligibilityReasonCode,
  CoverageDetails,
  Contract,
  CoverageRule,
  Adherent,
  Provider,
  CareType,
} from './eligibility.types';

export { generateCacheKey } from './eligibility.types';
