/**
 * Fraud Detection Agent
 *
 * Main agent for detecting potentially fraudulent healthcare claims.
 * Uses configurable rules, pattern analysis, and drug interaction checks.
 */

import type { Context } from 'hono';
import type { Bindings, Variables } from '../../types';
import type {
  FraudCheckRequest,
  FraudCheckResult,
  TriggeredRule,
  DrugInteraction,
  FrequencyAnalysis,
  AmountAnalysis,
  SimilarClaim,
  FraudRule,
  DrugIncompatibility,
} from './fraud.types';
import { getRiskLevel, getRecommendedAction } from './fraud.types';
import {
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

/**
 * Main fraud detection function
 */
export async function detectFraud(
  c: Context<{ Bindings: Bindings; Variables: Variables }>,
  request: FraudCheckRequest
): Promise<FraudCheckResult> {
  const startTime = Date.now();

  // Fetch all required data in parallel
  const [
    fraudRules,
    recentClaims,
    frequencyData,
    amountStats,
    drugIncompatibilities,
    providerClaimsToday,
  ] = await Promise.all([
    getFraudRules(c, request.insurerId, request.careType),
    getRecentSimilarClaims(c, request),
    getClaimFrequency(c, request.adherentId, request.providerId, request.serviceDate),
    getAmountStatistics(c, request.insurerId, request.careType),
    request.drugCodes?.length ? getDrugIncompatibilities(c, request.drugCodes) : Promise.resolve([]),
    getProviderClaimsToday(c, request.providerId, request.serviceDate),
  ]);

  const triggeredRules: TriggeredRule[] = [];

  // Get rule configs by code
  const rulesByCode = new Map(fraudRules.map((r) => [r.ruleCode, r]));

  // Check 1: Duplicate claims
  const duplicateResult = checkDuplicateClaim(
    request,
    recentClaims,
    rulesByCode.get('DUPLICATE_CLAIM') || null
  );
  if (duplicateResult.triggeredRule) {
    triggeredRules.push(duplicateResult.triggeredRule);
  }

  // Check 2: Claim frequency
  const frequencyAnalysis: FrequencyAnalysis = {
    claimsToday: frequencyData.today,
    claimsThisWeek: frequencyData.week,
    claimsThisMonth: frequencyData.month,
    averageMonthly: frequencyData.avgMonthly,
    isAnomalous: frequencyData.today > 5 || frequencyData.month > frequencyData.avgMonthly * 2,
    anomalyReason:
      frequencyData.today > 5
        ? 'Nombre élevé de réclamations aujourd\'hui'
        : frequencyData.month > frequencyData.avgMonthly * 2
          ? 'Volume mensuel anormalement élevé'
          : undefined,
  };

  const frequencyRule = checkClaimFrequency(
    frequencyAnalysis,
    rulesByCode.get('HIGH_FREQUENCY') || null
  );
  if (frequencyRule) {
    triggeredRules.push(frequencyRule);
  }

  // Check 3: Unusual amount
  const amountAnalysis: AmountAnalysis = {
    claimAmount: request.amount,
    averageAmount: amountStats.average,
    standardDeviation: amountStats.stdDev,
    zScore: calculateZScore(request.amount, amountStats.average, amountStats.stdDev),
    isAnomalous: false,
  };
  amountAnalysis.isAnomalous = Math.abs(amountAnalysis.zScore) >= 3;

  const amountRule = checkUnusualAmount(
    amountAnalysis,
    rulesByCode.get('UNUSUAL_AMOUNT') || null
  );
  if (amountRule) {
    triggeredRules.push(amountRule);
  }

  // Check 4: Odd hours
  const oddHoursRule = checkOddHours(
    request.serviceTime,
    rulesByCode.get('ODD_HOURS') || null
  );
  if (oddHoursRule) {
    triggeredRules.push(oddHoursRule);
  }

  // Check 5: Drug interactions
  const drugInteractions: DrugInteraction[] = request.drugCodes?.length
    ? checkDrugInteractions(request.drugCodes, drugIncompatibilities)
    : [];

  // Add triggered rules for drug interactions
  for (const interaction of drugInteractions) {
    if (interaction.interactionType === 'contraindicated') {
      triggeredRules.push({
        ruleId: 'DRUG_CONTRAINDICATED',
        ruleCode: 'DRUG_CONTRAINDICATED',
        ruleName: 'Médicaments contre-indiqués',
        severity: 'critical',
        scoreImpact: interaction.scoreImpact,
        description: `${interaction.drug1Name} et ${interaction.drug2Name} sont contre-indiqués ensemble`,
        details: {
          drug1: interaction.drug1Code,
          drug2: interaction.drug2Code,
          interaction: interaction.description,
        },
      });
    } else if (interaction.interactionType === 'duplicate') {
      triggeredRules.push({
        ruleId: 'DRUG_DUPLICATE',
        ruleCode: 'DRUG_DUPLICATE',
        ruleName: 'Médicament en double',
        severity: 'high',
        scoreImpact: interaction.scoreImpact,
        description: `${interaction.drug1Name} prescrit plusieurs fois`,
        details: {
          drug: interaction.drug1Code,
          interaction: interaction.description,
        },
      });
    }
  }

  // Check 6: Provider volume
  const providerRule = checkProviderVolume(
    request.providerId,
    providerClaimsToday,
    rulesByCode.get('PROVIDER_HIGH_VOLUME') || null
  );
  if (providerRule) {
    triggeredRules.push(providerRule);
  }

  // Calculate final fraud score
  const fraudScore = calculateFinalScore(triggeredRules, drugInteractions);
  const riskLevel = getRiskLevel(fraudScore);
  const recommendedAction = getRecommendedAction(riskLevel, triggeredRules);

  return {
    claimId: request.claimId,
    fraudScore,
    riskLevel,
    recommendedAction,
    triggeredRules,
    drugInteractions,
    duplicateCheck: duplicateResult.result,
    frequencyAnalysis,
    amountAnalysis,
    checkTime: Date.now() - startTime,
  };
}

/**
 * Batch fraud check for multiple claims
 */
export async function detectFraudBatch(
  c: Context<{ Bindings: Bindings; Variables: Variables }>,
  requests: FraudCheckRequest[]
): Promise<FraudCheckResult[]> {
  // Process in parallel with concurrency limit
  const BATCH_SIZE = 5;
  const results: FraudCheckResult[] = [];

  for (let i = 0; i < requests.length; i += BATCH_SIZE) {
    const batch = requests.slice(i, i + BATCH_SIZE);
    const batchResults = await Promise.all(
      batch.map((req) => detectFraud(c, req))
    );
    results.push(...batchResults);
  }

  return results;
}

// =============================================================================
// Database Queries
// =============================================================================

/**
 * Get active fraud rules for insurer
 */
async function getFraudRules(
  c: Context<{ Bindings: Bindings; Variables: Variables }>,
  insurerId: string,
  careType: string
): Promise<FraudRule[]> {
  const results = await c.env.DB.prepare(`
    SELECT
      id, insurer_id as insurerId, rule_code as ruleCode,
      rule_name as ruleName, rule_description as ruleDescription,
      rule_type as ruleType, base_score as baseScore,
      threshold_value as thresholdValue, severity, action,
      care_type as careType, is_active as isActive
    FROM fraud_rules_config
    WHERE (insurer_id = ? OR insurer_id IS NULL)
      AND (care_type = ? OR care_type IS NULL)
      AND is_active = 1
    ORDER BY insurer_id NULLS LAST
  `)
    .bind(insurerId, careType)
    .all<FraudRule>();

  return (results.results || []).map((r) => ({
    ...r,
    isActive: Boolean(r.isActive),
  }));
}

/**
 * Get recent similar claims for duplicate detection
 */
async function getRecentSimilarClaims(
  c: Context<{ Bindings: Bindings; Variables: Variables }>,
  request: FraudCheckRequest
): Promise<SimilarClaim[]> {
  // Look back 24 hours
  const results = await c.env.DB.prepare(`
    SELECT
      id as claimId, service_date as serviceDate, amount,
      provider_id as providerId, care_type as careType
    FROM claims
    WHERE adherent_id = ?
      AND service_date >= date(?, '-1 day')
      AND service_date <= ?
      AND id != ?
    ORDER BY service_date DESC
    LIMIT 10
  `)
    .bind(request.adherentId, request.serviceDate, request.serviceDate, request.claimId)
    .all<{ claimId: string; serviceDate: string; amount: number; providerId: string; careType: string }>();

  return (results.results || []).map((claim) => ({
    claimId: claim.claimId,
    serviceDate: claim.serviceDate,
    amount: claim.amount,
    similarity: calculateClaimSimilarity(
      {
        providerId: request.providerId,
        serviceDate: request.serviceDate,
        amount: request.amount,
        careType: request.careType,
      },
      {
        providerId: claim.providerId,
        serviceDate: claim.serviceDate,
        amount: claim.amount,
        careType: claim.careType,
      }
    ),
  }));
}

/**
 * Get claim frequency data
 */
async function getClaimFrequency(
  c: Context<{ Bindings: Bindings; Variables: Variables }>,
  adherentId: string,
  _providerId: string,
  serviceDate: string
): Promise<{ today: number; week: number; month: number; avgMonthly: number }> {
  const todayResult = await c.env.DB.prepare(`
    SELECT COUNT(*) as count FROM claims
    WHERE adherent_id = ? AND service_date = ?
  `)
    .bind(adherentId, serviceDate)
    .first<{ count: number }>();

  const weekResult = await c.env.DB.prepare(`
    SELECT COUNT(*) as count FROM claims
    WHERE adherent_id = ?
      AND service_date >= date(?, '-7 days')
      AND service_date <= ?
  `)
    .bind(adherentId, serviceDate, serviceDate)
    .first<{ count: number }>();

  const monthResult = await c.env.DB.prepare(`
    SELECT COUNT(*) as count FROM claims
    WHERE adherent_id = ?
      AND service_date >= date(?, '-30 days')
      AND service_date <= ?
  `)
    .bind(adherentId, serviceDate, serviceDate)
    .first<{ count: number }>();

  // Calculate average monthly claims over past 6 months
  const avgResult = await c.env.DB.prepare(`
    SELECT COUNT(*) / 6.0 as avg FROM claims
    WHERE adherent_id = ?
      AND service_date >= date(?, '-180 days')
      AND service_date < date(?, '-30 days')
  `)
    .bind(adherentId, serviceDate, serviceDate)
    .first<{ avg: number }>();

  return {
    today: todayResult?.count || 0,
    week: weekResult?.count || 0,
    month: monthResult?.count || 0,
    avgMonthly: avgResult?.avg || 0,
  };
}

/**
 * Get amount statistics for care type
 */
async function getAmountStatistics(
  c: Context<{ Bindings: Bindings; Variables: Variables }>,
  insurerId: string,
  careType: string
): Promise<{ average: number; stdDev: number }> {
  const result = await c.env.DB.prepare(`
    SELECT
      AVG(amount) as average,
      SQRT(AVG(amount * amount) - AVG(amount) * AVG(amount)) as stdDev
    FROM claims
    WHERE insurer_id = ?
      AND care_type = ?
      AND service_date >= date('now', '-90 days')
      AND status IN ('approved', 'paid')
  `)
    .bind(insurerId, careType)
    .first<{ average: number; stdDev: number }>();

  return {
    average: result?.average || 0,
    stdDev: result?.stdDev || 1, // Avoid division by zero
  };
}

/**
 * Get drug incompatibilities for given drug codes
 */
async function getDrugIncompatibilities(
  c: Context<{ Bindings: Bindings; Variables: Variables }>,
  drugCodes: string[]
): Promise<DrugIncompatibility[]> {
  // Build placeholders for IN clause
  const placeholders = drugCodes.map(() => '?').join(', ');

  const results = await c.env.DB.prepare(`
    SELECT
      id, drug_code_1 as drugCode1, drug_name_1 as drugName1,
      drug_code_2 as drugCode2, drug_name_2 as drugName2,
      interaction_type as interactionType,
      description, clinical_effect as clinicalEffect,
      recommendation, fraud_score_impact as fraudScoreImpact,
      is_active as isActive
    FROM drug_incompatibilities
    WHERE is_active = 1
      AND (drug_code_1 IN (${placeholders}) OR drug_code_2 IN (${placeholders}))
  `)
    .bind(...drugCodes, ...drugCodes)
    .all<DrugIncompatibility>();

  return (results.results || []).map((r) => ({
    ...r,
    isActive: Boolean(r.isActive),
  }));
}

/**
 * Get provider claims count for today
 */
async function getProviderClaimsToday(
  c: Context<{ Bindings: Bindings; Variables: Variables }>,
  providerId: string,
  serviceDate: string
): Promise<number> {
  const result = await c.env.DB.prepare(`
    SELECT COUNT(*) as count FROM claims
    WHERE provider_id = ? AND service_date = ?
  `)
    .bind(providerId, serviceDate)
    .first<{ count: number }>();

  return result?.count || 0;
}
