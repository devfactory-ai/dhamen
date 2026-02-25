/**
 * Tarification Agent Module
 *
 * Exports for healthcare claim pricing calculations
 */

export { calculateTarification, calculateBatchTarification, getCachedBaremes } from './tarification.agent';

export {
  calculateEligibleAmount,
  calculateCoverageRate,
  calculateCopay,
  applyPerActLimit,
  checkQuantityLimits,
  calculateFinalBreakdown,
  calculateFinalAmounts,
} from './tarification.rules';

export type {
  TarificationRequest,
  TarificationResult,
  TarificationBreakdown,
  TarificationWarning,
  TarificationWarningCode,
  AppliedRule,
  BaremeInfo,
  Bareme,
  CoverageRule,
  Provider,
  CareType,
} from './tarification.types';

export { generateTarificationCacheKey } from './tarification.types';
