/**
 * Tarification Rules
 *
 * Business rules for calculating healthcare claim pricing
 */

import type {
  TarificationRequest,
  TarificationBreakdown,
  TarificationWarning,
  AppliedRule,
  Bareme,
  CoverageRule,
  Provider,
} from './tarification.types';

/**
 * Rule 1: Calculate eligible amount based on barème
 * If price exceeds barème, only the reference price is eligible
 */
export function calculateEligibleAmount(
  request: TarificationRequest,
  bareme: Bareme | null
): {
  eligibleAmount: number;
  priceAdjustment: number;
  warnings: TarificationWarning[];
  appliedRules: AppliedRule[];
} {
  const requestedAmount = request.unitPrice * request.quantity;
  const warnings: TarificationWarning[] = [];
  const appliedRules: AppliedRule[] = [];

  // If no barème found, use full requested amount but warn
  if (!bareme) {
    warnings.push({
      code: 'ACT_NOT_IN_BAREME',
      message: `Acte ${request.actCode} non trouve dans le bareme`,
      details: { actCode: request.actCode },
    });

    return {
      eligibleAmount: requestedAmount,
      priceAdjustment: 0,
      warnings,
      appliedRules,
    };
  }

  // Calculate based on barème reference price
  const baremeAmount = bareme.referencePrice * request.quantity;

  // Check if requested price exceeds barème
  if (request.unitPrice > bareme.referencePrice) {
    const adjustment = requestedAmount - baremeAmount;

    warnings.push({
      code: 'PRICE_ABOVE_BAREME',
      message: `Prix demande (${request.unitPrice}) superieur au bareme (${bareme.referencePrice})`,
      details: {
        requestedUnitPrice: request.unitPrice,
        baremePrice: bareme.referencePrice,
        adjustment,
      },
    });

    appliedRules.push({
      ruleId: 'BAREME_LIMIT',
      ruleName: 'Plafonnement au barème',
      effect: 'Montant ramené au tarif conventionné',
      value: baremeAmount,
    });

    return {
      eligibleAmount: baremeAmount,
      priceAdjustment: adjustment,
      warnings,
      appliedRules,
    };
  }

  // Check if price is below minimum (if defined)
  if (bareme.minPrice && request.unitPrice < bareme.minPrice) {
    warnings.push({
      code: 'MANUAL_REVIEW_REQUIRED',
      message: 'Prix inferieur au minimum du bareme',
      details: {
        requestedUnitPrice: request.unitPrice,
        minPrice: bareme.minPrice,
      },
    });
  }

  return {
    eligibleAmount: requestedAmount,
    priceAdjustment: 0,
    warnings,
    appliedRules,
  };
}

/**
 * Rule 2: Calculate coverage percentage
 */
export function calculateCoverageRate(
  bareme: Bareme | null,
  coverageRule: CoverageRule | null,
  provider: Provider | null
): {
  coverageRate: number;
  warnings: TarificationWarning[];
  appliedRules: AppliedRule[];
} {
  const warnings: TarificationWarning[] = [];
  const appliedRules: AppliedRule[] = [];

  // Default coverage rate
  let coverageRate = 100;

  // Apply barème coverage rate if available
  if (bareme) {
    coverageRate = bareme.coverageRate;
    appliedRules.push({
      ruleId: 'BAREME_RATE',
      ruleName: 'Taux barème',
      effect: `Couverture à ${coverageRate}%`,
      value: coverageRate,
    });
  }

  // Check network provider bonus
  if (bareme?.isNetworkBonus && provider?.isNetworkProvider) {
    const bonus = bareme.networkBonusRate;
    const newRate = Math.min(100, coverageRate + bonus);
    appliedRules.push({
      ruleId: 'NETWORK_BONUS',
      ruleName: 'Bonus réseau',
      effect: `+${bonus}% pour prestataire conventionné`,
      value: bonus,
    });
    coverageRate = newRate;
  }

  // Reduce coverage for non-network providers if required
  if (coverageRule?.networkOnly && provider && !provider.isNetworkProvider) {
    const reduction = 20; // Typical reduction for out-of-network
    const newRate = Math.max(0, coverageRate - reduction);

    warnings.push({
      code: 'NON_NETWORK_PROVIDER',
      message: 'Prestataire hors reseau - couverture reduite',
      details: {
        originalRate: coverageRate,
        reduction,
        newRate,
      },
    });

    appliedRules.push({
      ruleId: 'OUT_OF_NETWORK',
      ruleName: 'Hors réseau',
      effect: `-${reduction}% pour prestataire non conventionné`,
      value: -reduction,
    });

    coverageRate = newRate;
  }

  return { coverageRate, warnings, appliedRules };
}

/**
 * Rule 3: Calculate copay amount
 */
export function calculateCopay(
  eligibleAmount: number,
  coverageRule: CoverageRule | null
): {
  copayAmount: number;
  copayType: 'fixed' | 'percentage' | null;
  copayValue: number;
  appliedRules: AppliedRule[];
} {
  const appliedRules: AppliedRule[] = [];

  if (!(coverageRule?.copayType)) {
    return {
      copayAmount: 0,
      copayType: null,
      copayValue: 0,
      appliedRules,
    };
  }

  let copayAmount = 0;

  if (coverageRule.copayType === 'fixed') {
    copayAmount = coverageRule.copayValue;
    appliedRules.push({
      ruleId: 'FIXED_COPAY',
      ruleName: 'Ticket modérateur fixe',
      effect: `Montant fixe de ${coverageRule.copayValue} millimes`,
      value: coverageRule.copayValue,
    });
  } else if (coverageRule.copayType === 'percentage') {
    copayAmount = Math.round((eligibleAmount * coverageRule.copayValue) / 100);
    appliedRules.push({
      ruleId: 'PERCENTAGE_COPAY',
      ruleName: 'Ticket modérateur %',
      effect: `${coverageRule.copayValue}% du montant éligible`,
      value: coverageRule.copayValue,
    });
  }

  return {
    copayAmount,
    copayType: coverageRule.copayType,
    copayValue: coverageRule.copayValue,
    appliedRules,
  };
}

/**
 * Rule 4: Apply per-act limit
 */
export function applyPerActLimit(
  amount: number,
  coverageRule: CoverageRule | null
): {
  limitedAmount: number;
  appliedLimit: boolean;
  perActLimit: number | null;
  appliedRules: AppliedRule[];
  warnings: TarificationWarning[];
} {
  const appliedRules: AppliedRule[] = [];
  const warnings: TarificationWarning[] = [];

  if (!coverageRule?.perActLimit) {
    return {
      limitedAmount: amount,
      appliedLimit: false,
      perActLimit: null,
      appliedRules,
      warnings,
    };
  }

  if (amount > coverageRule.perActLimit) {
    appliedRules.push({
      ruleId: 'PER_ACT_LIMIT',
      ruleName: 'Plafond par acte',
      effect: `Limité à ${coverageRule.perActLimit} millimes`,
      value: coverageRule.perActLimit,
    });

    warnings.push({
      code: 'REDUCED_COVERAGE',
      message: 'Montant plafonné au maximum par acte',
      details: {
        originalAmount: amount,
        limitedAmount: coverageRule.perActLimit,
        reduction: amount - coverageRule.perActLimit,
      },
    });

    return {
      limitedAmount: coverageRule.perActLimit,
      appliedLimit: true,
      perActLimit: coverageRule.perActLimit,
      appliedRules,
      warnings,
    };
  }

  return {
    limitedAmount: amount,
    appliedLimit: false,
    perActLimit: coverageRule.perActLimit,
    appliedRules,
    warnings,
  };
}

/**
 * Rule 5: Check quantity limits
 */
export function checkQuantityLimits(
  request: TarificationRequest,
  _bareme: Bareme | null
): TarificationWarning[] {
  const warnings: TarificationWarning[] = [];

  // Standard quantity limits by care type
  const standardQuantities: Record<string, number> = {
    pharmacy: 3, // Max 3 boxes per item
    consultation: 1,
    lab: 5, // Max 5 tests per visit
    dental: 1,
    optical: 2, // Pair of lenses
  };

  const standardQty = standardQuantities[request.careType];

  if (standardQty && request.quantity > standardQty) {
    warnings.push({
      code: 'QUANTITY_EXCEEDS_STANDARD',
      message: `Quantité (${request.quantity}) superieure à la norme (${standardQty})`,
      details: {
        requested: request.quantity,
        standard: standardQty,
        careType: request.careType,
      },
    });
  }

  return warnings;
}

/**
 * Calculate final tarification breakdown
 */
export function calculateFinalBreakdown(
  requestedAmount: number,
  eligibleAmount: number,
  coverageRate: number,
  _copayAmount: number,
  copayType: 'fixed' | 'percentage' | null,
  copayValue: number,
  perActLimit: number | null,
  appliedLimit: boolean
): TarificationBreakdown {
  return {
    baseAmount: requestedAmount,
    priceAdjustment: requestedAmount - eligibleAmount,
    coverageRate,
    copayType,
    copayValue,
    perActLimit,
    appliedLimit,
  };
}

/**
 * Calculate final amounts
 */
export function calculateFinalAmounts(
  eligibleAmount: number,
  coverageRate: number,
  copayAmount: number,
  limitedAmount: number,
  appliedLimit: boolean
): {
  coveredAmount: number;
  patientAmount: number;
} {
  // Calculate covered amount based on coverage rate
  let coveredAmount = Math.round((eligibleAmount * coverageRate) / 100);

  // Apply per-act limit if needed
  if (appliedLimit && coveredAmount > limitedAmount) {
    coveredAmount = limitedAmount;
  }

  // Subtract copay from covered amount
  coveredAmount = Math.max(0, coveredAmount - copayAmount);

  // Patient pays the rest
  const patientAmount = eligibleAmount - coveredAmount;

  return {
    coveredAmount,
    patientAmount,
  };
}
