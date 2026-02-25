/**
 * Eligibility Rules
 *
 * Business rules for determining healthcare coverage eligibility
 */

import type {
  Contract,
  CoverageRule,
  Adherent,
  Provider,
  EligibilityReason,
  CareType,
} from './eligibility.types';

/**
 * Rule 1: Contract Validity Check
 * Verifies the contract exists and is in active status
 */
export function checkContractValidity(
  contract: Contract | null,
  serviceDate: string
): EligibilityReason[] {
  const reasons: EligibilityReason[] = [];

  if (!contract) {
    reasons.push({
      code: 'CONTRACT_NOT_FOUND',
      message: 'Aucun contrat actif trouve pour cet adherent',
      severity: 'error',
    });
    return reasons;
  }

  switch (contract.status) {
    case 'expired':
      reasons.push({
        code: 'CONTRACT_EXPIRED',
        message: 'Le contrat a expire',
        severity: 'error',
        details: { endDate: contract.endDate },
      });
      break;
    case 'suspended':
      reasons.push({
        code: 'CONTRACT_SUSPENDED',
        message: 'Le contrat est suspendu',
        severity: 'error',
      });
      break;
    case 'cancelled':
      reasons.push({
        code: 'CONTRACT_CANCELLED',
        message: 'Le contrat a ete annule',
        severity: 'error',
      });
      break;
    case 'active':
      // Check date range
      if (serviceDate < contract.startDate) {
        reasons.push({
          code: 'CONTRACT_NOT_FOUND',
          message: 'Le contrat n\'etait pas actif a cette date',
          severity: 'error',
          details: { startDate: contract.startDate, serviceDate },
        });
      } else if (serviceDate > contract.endDate) {
        reasons.push({
          code: 'CONTRACT_EXPIRED',
          message: 'Le contrat avait expire a cette date',
          severity: 'error',
          details: { endDate: contract.endDate, serviceDate },
        });
      } else {
        reasons.push({
          code: 'CONTRACT_VALID',
          message: 'Contrat valide',
          severity: 'info',
        });
      }
      break;
  }

  return reasons;
}

/**
 * Rule 2: Waiting Period Check
 * Verifies the waiting period (carence) has passed
 */
export function checkWaitingPeriod(
  contract: Contract,
  coverageRule: CoverageRule | null,
  serviceDate: string
): EligibilityReason[] {
  const reasons: EligibilityReason[] = [];

  // Use rule-specific waiting days if available, otherwise contract default
  const waitingDays = coverageRule?.waitingDays ?? contract.carenceDays;

  if (waitingDays > 0) {
    const contractStart = new Date(contract.startDate);
    const service = new Date(serviceDate);
    const daysSinceStart = Math.floor(
      (service.getTime() - contractStart.getTime()) / (1000 * 60 * 60 * 24)
    );

    if (daysSinceStart < waitingDays) {
      reasons.push({
        code: 'WAITING_PERIOD',
        message: `Periode de carence de ${waitingDays} jours non ecoulee`,
        severity: 'error',
        details: {
          waitingDays,
          daysSinceStart,
          eligibleFrom: new Date(
            contractStart.getTime() + waitingDays * 24 * 60 * 60 * 1000
          ).toISOString().split('T')[0],
        },
      });
    }
  }

  return reasons;
}

/**
 * Rule 3: Care Type Coverage Check
 * Verifies the type of care is covered by the contract
 */
export function checkCareTypeCoverage(
  coverageRule: CoverageRule | null,
  careType: CareType
): EligibilityReason[] {
  const reasons: EligibilityReason[] = [];

  if (!coverageRule) {
    reasons.push({
      code: 'CARE_NOT_COVERED',
      message: `Ce type de soin (${careType}) n'est pas couvert`,
      severity: 'error',
    });
    return reasons;
  }

  if (!coverageRule.isCovered) {
    reasons.push({
      code: 'CARE_NOT_COVERED',
      message: `Ce type de soin (${careType}) est explicitement exclu`,
      severity: 'error',
    });
  }

  if (coverageRule.requiresPriorAuth) {
    reasons.push({
      code: 'PRIOR_AUTH_REQUIRED',
      message: 'Une autorisation prealable est requise pour ce type de soin',
      severity: 'warning',
    });
  }

  return reasons;
}

/**
 * Rule 4: Amount Limits Check
 * Verifies the claim doesn't exceed various limits
 */
export function checkAmountLimits(
  coverageRule: CoverageRule | null,
  amount: number,
  usedAmounts: {
    annual: number;
    daily: number;
    monthly: number;
    actCount: number;
  }
): EligibilityReason[] {
  const reasons: EligibilityReason[] = [];

  if (!coverageRule) {
    return reasons;
  }

  // Per-act limit
  if (coverageRule.perActLimit && amount > coverageRule.perActLimit) {
    reasons.push({
      code: 'PER_ACT_LIMIT_EXCEEDED',
      message: 'Le montant depasse le plafond par acte',
      severity: 'error',
      details: {
        requested: amount,
        limit: coverageRule.perActLimit,
      },
    });
  }

  // Annual limit
  if (coverageRule.annualLimit) {
    const projectedAnnual = usedAmounts.annual + amount;
    if (projectedAnnual > coverageRule.annualLimit) {
      reasons.push({
        code: 'ANNUAL_LIMIT_EXCEEDED',
        message: 'Le plafond annuel serait depasse',
        severity: 'error',
        details: {
          used: usedAmounts.annual,
          requested: amount,
          limit: coverageRule.annualLimit,
          remaining: coverageRule.annualLimit - usedAmounts.annual,
        },
      });
    }
  }

  // Daily act limit
  if (coverageRule.perDayLimit && usedAmounts.actCount >= coverageRule.perDayLimit) {
    reasons.push({
      code: 'DAILY_LIMIT_EXCEEDED',
      message: 'Le nombre maximum d\'actes quotidiens atteint',
      severity: 'error',
      details: {
        used: usedAmounts.actCount,
        limit: coverageRule.perDayLimit,
      },
    });
  }

  // Monthly act limit
  if (coverageRule.perMonthLimit) {
    // This would need monthly count, simplified here
    reasons.push({
      code: 'MONTHLY_LIMIT_EXCEEDED',
      message: 'Verifier le plafond mensuel',
      severity: 'info',
    });
  }

  return reasons;
}

/**
 * Rule 5: Provider Network Check
 * Verifies the provider is in the insurer's network if required
 */
export function checkProviderNetwork(
  coverageRule: CoverageRule | null,
  provider: Provider | null
): EligibilityReason[] {
  const reasons: EligibilityReason[] = [];

  if (!provider) {
    reasons.push({
      code: 'PROVIDER_NOT_IN_NETWORK',
      message: 'Prestataire non trouve',
      severity: 'error',
    });
    return reasons;
  }

  if (!provider.isActive) {
    reasons.push({
      code: 'PROVIDER_NOT_IN_NETWORK',
      message: 'Prestataire inactif',
      severity: 'error',
    });
    return reasons;
  }

  if (coverageRule?.networkOnly && !provider.isNetworkProvider) {
    reasons.push({
      code: 'PROVIDER_NOT_IN_NETWORK',
      message: 'Ce prestataire n\'est pas dans le reseau conventionne',
      severity: 'error',
    });
  }

  return reasons;
}

/**
 * Rule 6: Age Restriction Check
 * Verifies the adherent's age meets requirements
 */
export function checkAgeRestriction(
  coverageRule: CoverageRule | null,
  adherent: Adherent | null,
  serviceDate: string
): EligibilityReason[] {
  const reasons: EligibilityReason[] = [];

  if (!(adherent && coverageRule)) {
    return reasons;
  }

  // Calculate age at service date
  const birthDate = new Date(adherent.dateOfBirth);
  const service = new Date(serviceDate);
  let age = service.getFullYear() - birthDate.getFullYear();
  const monthDiff = service.getMonth() - birthDate.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && service.getDate() < birthDate.getDate())) {
    age--;
  }

  if (coverageRule.minAge !== null && age < coverageRule.minAge) {
    reasons.push({
      code: 'AGE_RESTRICTION',
      message: `Age minimum requis: ${coverageRule.minAge} ans`,
      severity: 'error',
      details: { currentAge: age, minAge: coverageRule.minAge },
    });
  }

  if (coverageRule.maxAge !== null && age > coverageRule.maxAge) {
    reasons.push({
      code: 'AGE_RESTRICTION',
      message: `Age maximum autorise: ${coverageRule.maxAge} ans`,
      severity: 'error',
      details: { currentAge: age, maxAge: coverageRule.maxAge },
    });
  }

  return reasons;
}

/**
 * Aggregate all rule checks and determine final eligibility
 */
export function evaluateEligibility(reasons: EligibilityReason[]): {
  eligible: boolean;
  confidence: number;
} {
  const hasErrors = reasons.some((r) => r.severity === 'error');
  const hasWarnings = reasons.some((r) => r.severity === 'warning');

  // Calculate confidence based on rule results
  let confidence = 100;
  if (hasErrors) {
    confidence = 0;
  } else if (hasWarnings) {
    confidence = 80; // May need manual review
  }

  return {
    eligible: !hasErrors,
    confidence,
  };
}
