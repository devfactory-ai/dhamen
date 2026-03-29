/**
 * Fraud Detection Rules
 *
 * Business rules for detecting potentially fraudulent healthcare claims
 */

import type {
  FraudCheckRequest,
  TriggeredRule,
  DrugInteraction,
  DuplicateCheckResult,
  SimilarClaim,
  FrequencyAnalysis,
  AmountAnalysis,
  FraudRule,
  DrugIncompatibility,
} from './fraud.types';

/**
 * Rule 1: Check for duplicate claims
 * Same adherent, same provider, same date = likely duplicate
 */
export function checkDuplicateClaim(
  _request: FraudCheckRequest,
  recentClaims: SimilarClaim[],
  rule: FraudRule | null
): {
  result: DuplicateCheckResult;
  triggeredRule: TriggeredRule | null;
} {
  // Find exact duplicates (same provider, same date, very similar amount)
  const exactDuplicate = recentClaims.find((c) => c.similarity >= 95);

  if (exactDuplicate) {
    const triggeredRule: TriggeredRule = {
      ruleId: rule?.id || 'DUPLICATE_CLAIM',
      ruleCode: 'DUPLICATE_CLAIM',
      ruleName: 'Réclamation en double',
      severity: 'critical',
      scoreImpact: rule?.baseScore || 80,
      description: 'Cette réclamation semble être un doublon',
      details: {
        duplicateOf: exactDuplicate.claimId,
        similarity: exactDuplicate.similarity,
      },
    };

    return {
      result: {
        isDuplicate: true,
        duplicateOf: exactDuplicate.claimId,
        similarClaims: recentClaims,
      },
      triggeredRule,
    };
  }

  // Find high similarity claims (potential duplicates)
  const highSimilarity = recentClaims.filter((c) => c.similarity >= 70);

  return {
    result: {
      isDuplicate: false,
      similarClaims: highSimilarity,
    },
    triggeredRule: null,
  };
}

/**
 * Rule 2: Check claim frequency
 */
export function checkClaimFrequency(
  frequency: FrequencyAnalysis,
  rule: FraudRule | null
): TriggeredRule | null {
  const thresholds = rule?.thresholdValue
    ? JSON.parse(rule.thresholdValue)
    : { max_claims_per_day: 5 };

  if (frequency.claimsToday >= thresholds.max_claims_per_day) {
    return {
      ruleId: rule?.id || 'HIGH_FREQUENCY',
      ruleCode: 'HIGH_FREQUENCY',
      ruleName: 'Fréquence élevée',
      severity: rule?.severity || 'high',
      scoreImpact: rule?.baseScore || 40,
      description: `${frequency.claimsToday} réclamations aujourd'hui (max: ${thresholds.max_claims_per_day})`,
      details: {
        claimsToday: frequency.claimsToday,
        threshold: thresholds.max_claims_per_day,
      },
    };
  }

  return null;
}

/**
 * Rule 3: Check unusual amounts using z-score
 */
export function checkUnusualAmount(
  analysis: AmountAnalysis,
  rule: FraudRule | null
): TriggeredRule | null {
  const thresholds = rule?.thresholdValue
    ? JSON.parse(rule.thresholdValue)
    : { std_dev_threshold: 3 };

  if (Math.abs(analysis.zScore) >= thresholds.std_dev_threshold) {
    return {
      ruleId: rule?.id || 'UNUSUAL_AMOUNT',
      ruleCode: 'UNUSUAL_AMOUNT',
      ruleName: 'Montant inhabituel',
      severity: rule?.severity || 'medium',
      scoreImpact: rule?.baseScore || 30,
      description: `Montant ${analysis.zScore > 0 ? 'supérieur' : 'inférieur'} de ${Math.abs(analysis.zScore).toFixed(1)} écarts-types`,
      details: {
        amount: analysis.claimAmount,
        average: analysis.averageAmount,
        zScore: analysis.zScore,
        threshold: thresholds.std_dev_threshold,
      },
    };
  }

  return null;
}

/**
 * Rule 4: Check for odd hours (suspicious timing)
 */
export function checkOddHours(
  serviceTime: string | undefined,
  rule: FraudRule | null
): TriggeredRule | null {
  if (!serviceTime) { return null; }

  const thresholds = rule?.thresholdValue
    ? JSON.parse(rule.thresholdValue)
    : { valid_hours_start: 6, valid_hours_end: 22 };

  const hour = Number.parseInt(serviceTime.split(':')[0] || '12', 10);

  if (hour < thresholds.valid_hours_start || hour >= thresholds.valid_hours_end) {
    return {
      ruleId: rule?.id || 'ODD_HOURS',
      ruleCode: 'ODD_HOURS',
      ruleName: 'Horaires suspects',
      severity: rule?.severity || 'low',
      scoreImpact: rule?.baseScore || 20,
      description: `Réclamation à ${serviceTime} (horaires normaux: ${thresholds.valid_hours_start}h-${thresholds.valid_hours_end}h)`,
      details: {
        serviceTime,
        validStart: thresholds.valid_hours_start,
        validEnd: thresholds.valid_hours_end,
      },
    };
  }

  return null;
}

/**
 * Rule 5: Check drug interactions/incompatibilities
 */
export function checkDrugInteractions(
  drugCodes: string[],
  incompatibilities: DrugIncompatibility[]
): DrugInteraction[] {
  const interactions: DrugInteraction[] = [];

  // Check all pairs of drugs
  for (let i = 0; i < drugCodes.length; i++) {
    for (let j = i + 1; j < drugCodes.length; j++) {
      const code1 = drugCodes[i]!;
      const code2 = drugCodes[j]!;

      // Find matching incompatibility
      const incomp = incompatibilities.find(
        (inc) =>
          (inc.drugCode1 === code1 && inc.drugCode2 === code2) ||
          (inc.drugCode1 === code2 && inc.drugCode2 === code1)
      );

      if (incomp) {
        interactions.push({
          drug1Code: incomp.drugCode1,
          drug1Name: incomp.drugName1,
          drug2Code: incomp.drugCode2,
          drug2Name: incomp.drugName2,
          interactionType: incomp.interactionType,
          description: incomp.description || 'Interaction détectée',
          scoreImpact: incomp.fraudScoreImpact,
        });
      }
    }

    // Check for same drug prescribed twice (self-interaction)
    const selfMatches = drugCodes.filter((c) => c === drugCodes[i]).length;
    if (selfMatches > 1) {
      // Only add once
      const alreadyAdded = interactions.some(
        (int) => int.drug1Code === drugCodes[i] && int.drug2Code === drugCodes[i]
      );
      if (!alreadyAdded) {
        const selfIncomp = incompatibilities.find(
          (inc) => inc.drugCode1 === drugCodes[i] && inc.drugCode2 === drugCodes[i]
        );
        if (selfIncomp) {
          interactions.push({
            drug1Code: selfIncomp.drugCode1,
            drug1Name: selfIncomp.drugName1,
            drug2Code: selfIncomp.drugCode2,
            drug2Name: selfIncomp.drugName2,
            interactionType: 'duplicate',
            description: selfIncomp.description || 'Même médicament prescrit plusieurs fois',
            scoreImpact: selfIncomp.fraudScoreImpact,
          });
        }
      }
    }
  }

  return interactions;
}

/**
 * Rule 6: Provider volume check
 * High volume from a single provider may indicate fraud
 */
export function checkProviderVolume(
  providerId: string,
  providerClaimsToday: number,
  rule: FraudRule | null
): TriggeredRule | null {
  const thresholds = rule?.thresholdValue
    ? JSON.parse(rule.thresholdValue)
    : { daily_threshold: 100 };

  if (providerClaimsToday >= thresholds.daily_threshold) {
    return {
      ruleId: rule?.id || 'PROVIDER_HIGH_VOLUME',
      ruleCode: 'PROVIDER_HIGH_VOLUME',
      ruleName: 'Volume praticien élevé',
      severity: rule?.severity || 'medium',
      scoreImpact: rule?.baseScore || 25,
      description: `${providerClaimsToday} réclamations du praticien aujourd'hui (seuil: ${thresholds.daily_threshold})`,
      details: {
        providerId,
        claimsToday: providerClaimsToday,
        threshold: thresholds.daily_threshold,
      },
    };
  }

  return null;
}

/**
 * Calculate z-score for amount analysis
 */
export function calculateZScore(value: number, mean: number, stdDev: number): number {
  if (stdDev === 0) { return 0; }
  return (value - mean) / stdDev;
}

/**
 * Calculate similarity between two claims
 * Returns 0-100 where 100 = identical
 */
export function calculateClaimSimilarity(
  claim1: { providerId: string; serviceDate: string; amount: number; careType: string },
  claim2: { providerId: string; serviceDate: string; amount: number; careType: string }
): number {
  let score = 0;

  // Same provider: +40 points
  if (claim1.providerId === claim2.providerId) {
    score += 40;
  }

  // Same date: +30 points
  if (claim1.serviceDate === claim2.serviceDate) {
    score += 30;
  }

  // Same care type: +10 points
  if (claim1.careType === claim2.careType) {
    score += 10;
  }

  // Similar amount: up to +20 points
  const amountDiff = Math.abs(claim1.amount - claim2.amount);
  const maxAmount = Math.max(claim1.amount, claim2.amount);
  if (maxAmount > 0) {
    const amountSimilarity = 1 - amountDiff / maxAmount;
    score += Math.round(amountSimilarity * 20);
  }

  return Math.min(100, score);
}

/**
 * Aggregate all triggered rules and calculate final score
 */
export function calculateFinalScore(
  triggeredRules: TriggeredRule[],
  drugInteractions: DrugInteraction[]
): number {
  let score = 0;

  // Sum rule impacts
  for (const rule of triggeredRules) {
    score += rule.scoreImpact;
  }

  // Sum drug interaction impacts
  for (const interaction of drugInteractions) {
    score += interaction.scoreImpact;
  }

  // Cap at 100
  return Math.min(100, score);
}
