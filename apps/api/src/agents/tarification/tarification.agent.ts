/**
 * Tarification Agent
 *
 * Main agent for calculating healthcare claim pricing and coverage.
 * Uses barèmes (tariff schedules) and coverage rules to determine
 * how much the insurer covers and how much the patient pays.
 */

import type { Context } from 'hono';
import type { Bindings, Variables } from '../../types';
import type {
  TarificationRequest,
  TarificationResult,
  TarificationWarning,
  AppliedRule,
  BaremeInfo,
  Bareme,
  CoverageRule,
  Provider,
} from './tarification.types';
import {
  calculateEligibleAmount,
  calculateCoverageRate,
  calculateCopay,
  applyPerActLimit,
  checkQuantityLimits,
  calculateFinalBreakdown,
  calculateFinalAmounts,
} from './tarification.rules';

// Cache TTL: 10 minutes for tarification (barèmes change infrequently)
const CACHE_TTL_SECONDS = 600;

/**
 * Main tarification calculation function
 */
export async function calculateTarification(
  c: Context<{ Bindings: Bindings; Variables: Variables }>,
  request: TarificationRequest
): Promise<TarificationResult> {
  const startTime = Date.now();

  // Fetch all required data in parallel
  const [bareme, coverageRule, provider] = await Promise.all([
    getBareme(c, request.insurerId, request.careType, request.actCode, request.serviceDate),
    getCoverageRule(c, request.insurerId, request.careType),
    getProvider(c, request.providerId),
  ]);

  const requestedAmount = request.unitPrice * request.quantity;
  const warnings: TarificationWarning[] = [];
  const appliedRules: AppliedRule[] = [];

  // Step 1: Calculate eligible amount based on barème
  const eligibleResult = calculateEligibleAmount(request, bareme);
  warnings.push(...eligibleResult.warnings);
  appliedRules.push(...eligibleResult.appliedRules);

  // Step 2: Calculate coverage rate
  const coverageResult = calculateCoverageRate(bareme, coverageRule, provider);
  warnings.push(...coverageResult.warnings);
  appliedRules.push(...coverageResult.appliedRules);

  // Step 3: Calculate copay
  const copayResult = calculateCopay(eligibleResult.eligibleAmount, coverageRule);
  appliedRules.push(...copayResult.appliedRules);

  // Step 4: Apply per-act limit
  const limitResult = applyPerActLimit(
    Math.round((eligibleResult.eligibleAmount * coverageResult.coverageRate) / 100),
    coverageRule
  );
  warnings.push(...limitResult.warnings);
  appliedRules.push(...limitResult.appliedRules);

  // Step 5: Check quantity limits
  const quantityWarnings = checkQuantityLimits(request, bareme);
  warnings.push(...quantityWarnings);

  // Step 6: Calculate final amounts
  const finalAmounts = calculateFinalAmounts(
    eligibleResult.eligibleAmount,
    coverageResult.coverageRate,
    copayResult.copayAmount,
    limitResult.limitedAmount,
    limitResult.appliedLimit
  );

  // Build breakdown
  const breakdown = calculateFinalBreakdown(
    requestedAmount,
    eligibleResult.eligibleAmount,
    coverageResult.coverageRate,
    copayResult.copayAmount,
    copayResult.copayType,
    copayResult.copayValue,
    limitResult.perActLimit,
    limitResult.appliedLimit
  );

  // Build barème info for response
  const baremeInfo: BaremeInfo | null = bareme
    ? {
        id: bareme.id,
        actCode: bareme.actCode,
        actName: bareme.actName,
        referencePrice: bareme.referencePrice,
        minPrice: bareme.minPrice,
        maxPrice: bareme.maxPrice,
        coverageRate: bareme.coverageRate,
        effectiveDate: bareme.effectiveFrom,
      }
    : null;

  return {
    requestedAmount,
    eligibleAmount: eligibleResult.eligibleAmount,
    coveredAmount: finalAmounts.coveredAmount,
    patientAmount: finalAmounts.patientAmount,
    copayAmount: copayResult.copayAmount,
    deductibleAmount: 0, // Could be extended for deductible logic
    breakdown,
    warnings,
    appliedRules,
    bareme: baremeInfo,
    calculationTime: Date.now() - startTime,
  };
}

/**
 * Batch tarification for multiple items (e.g., pharmacy prescription)
 */
export async function calculateBatchTarification(
  c: Context<{ Bindings: Bindings; Variables: Variables }>,
  requests: TarificationRequest[]
): Promise<{
  items: TarificationResult[];
  totals: {
    requestedAmount: number;
    eligibleAmount: number;
    coveredAmount: number;
    patientAmount: number;
    copayAmount: number;
  };
  calculationTime: number;
}> {
  const startTime = Date.now();

  // Process items in parallel
  const items = await Promise.all(
    requests.map((req) => calculateTarification(c, req))
  );

  // Calculate totals
  const totals = items.reduce(
    (acc, item) => ({
      requestedAmount: acc.requestedAmount + item.requestedAmount,
      eligibleAmount: acc.eligibleAmount + item.eligibleAmount,
      coveredAmount: acc.coveredAmount + item.coveredAmount,
      patientAmount: acc.patientAmount + item.patientAmount,
      copayAmount: acc.copayAmount + item.copayAmount,
    }),
    {
      requestedAmount: 0,
      eligibleAmount: 0,
      coveredAmount: 0,
      patientAmount: 0,
      copayAmount: 0,
    }
  );

  return {
    items,
    totals,
    calculationTime: Date.now() - startTime,
  };
}

// =============================================================================
// Database Queries
// =============================================================================

/**
 * Get barème for a specific act code
 */
async function getBareme(
  c: Context<{ Bindings: Bindings; Variables: Variables }>,
  insurerId: string,
  careType: string,
  actCode: string,
  serviceDate: string
): Promise<Bareme | null> {
  // Try exact match first
  let result = await c.env.DB.prepare(`
    SELECT
      id, insurer_id as insurerId, care_type as careType,
      act_code as actCode, act_name as actName,
      reference_price as referencePrice,
      min_price as minPrice, max_price as maxPrice,
      coverage_rate as coverageRate,
      is_network_bonus as isNetworkBonus,
      network_bonus_rate as networkBonusRate,
      effective_from as effectiveFrom,
      effective_to as effectiveTo,
      is_active as isActive
    FROM baremes
    WHERE insurer_id = ?
      AND care_type = ?
      AND act_code = ?
      AND is_active = 1
      AND effective_from <= ?
      AND (effective_to IS NULL OR effective_to >= ?)
    ORDER BY effective_from DESC
    LIMIT 1
  `)
    .bind(insurerId, careType, actCode, serviceDate, serviceDate)
    .first<Bareme>();

  // If no exact match, try generic rate for care type
  if (!result) {
    result = await c.env.DB.prepare(`
      SELECT
        id, insurer_id as insurerId, care_type as careType,
        act_code as actCode, act_name as actName,
        reference_price as referencePrice,
        min_price as minPrice, max_price as maxPrice,
        coverage_rate as coverageRate,
        is_network_bonus as isNetworkBonus,
        network_bonus_rate as networkBonusRate,
        effective_from as effectiveFrom,
        effective_to as effectiveTo,
        is_active as isActive
      FROM baremes
      WHERE insurer_id = ?
        AND care_type = ?
        AND act_code = '*'
        AND is_active = 1
        AND effective_from <= ?
        AND (effective_to IS NULL OR effective_to >= ?)
      ORDER BY effective_from DESC
      LIMIT 1
    `)
      .bind(insurerId, careType, serviceDate, serviceDate)
      .first<Bareme>();
  }

  if (result) {
    return {
      ...result,
      isNetworkBonus: Boolean(result.isNetworkBonus),
      isActive: Boolean(result.isActive),
    };
  }

  return null;
}

/**
 * Get coverage rule for care type
 */
async function getCoverageRule(
  c: Context<{ Bindings: Bindings; Variables: Variables }>,
  insurerId: string,
  careType: string
): Promise<CoverageRule | null> {
  const result = await c.env.DB.prepare(`
    SELECT
      id, insurer_id as insurerId, care_type as careType,
      plan_type as planType, is_covered as isCovered,
      copay_type as copayType, copay_value as copayValue,
      per_act_limit as perActLimit, network_only as networkOnly,
      is_active as isActive
    FROM care_coverage_rules
    WHERE insurer_id = ?
      AND care_type = ?
      AND is_active = 1
    ORDER BY plan_type DESC NULLS LAST
    LIMIT 1
  `)
    .bind(insurerId, careType)
    .first<CoverageRule>();

  if (result) {
    return {
      ...result,
      isCovered: Boolean(result.isCovered),
      networkOnly: Boolean(result.networkOnly),
      isActive: Boolean(result.isActive),
    };
  }

  return null;
}

/**
 * Get provider details
 */
async function getProvider(
  c: Context<{ Bindings: Bindings; Variables: Variables }>,
  providerId: string
): Promise<Provider | null> {
  const result = await c.env.DB.prepare(`
    SELECT
      id, name, type, is_active as isActive,
      is_network_provider as isNetworkProvider
    FROM providers
    WHERE id = ?
    LIMIT 1
  `)
    .bind(providerId)
    .first<Provider>();

  if (result) {
    return {
      ...result,
      isActive: Boolean(result.isActive),
      isNetworkProvider: Boolean(result.isNetworkProvider),
    };
  }

  return null;
}

/**
 * Get cached barème data for common lookups
 */
export async function getCachedBaremes(
  c: Context<{ Bindings: Bindings; Variables: Variables }>,
  insurerId: string,
  careType: string
): Promise<Bareme[]> {
  const cacheKey = `baremes:${insurerId}:${careType}`;

  try {
    const cached = await c.env.CACHE.get(cacheKey, 'json');
    if (cached) {
      return cached as Bareme[];
    }
  } catch {
    // Continue to fetch from DB
  }

  const today = new Date().toISOString().split('T')[0];

  const results = await c.env.DB.prepare(`
    SELECT
      id, insurer_id as insurerId, care_type as careType,
      act_code as actCode, act_name as actName,
      reference_price as referencePrice,
      min_price as minPrice, max_price as maxPrice,
      coverage_rate as coverageRate,
      is_network_bonus as isNetworkBonus,
      network_bonus_rate as networkBonusRate,
      effective_from as effectiveFrom,
      effective_to as effectiveTo,
      is_active as isActive
    FROM baremes
    WHERE insurer_id = ?
      AND care_type = ?
      AND is_active = 1
      AND effective_from <= ?
      AND (effective_to IS NULL OR effective_to >= ?)
    ORDER BY act_code
  `)
    .bind(insurerId, careType, today, today)
    .all<Bareme>();

  const baremes = (results.results || []).map((b) => ({
    ...b,
    isNetworkBonus: Boolean(b.isNetworkBonus),
    isActive: Boolean(b.isActive),
  }));

  // Cache for 10 minutes
  try {
    await c.env.CACHE.put(cacheKey, JSON.stringify(baremes), {
      expirationTtl: CACHE_TTL_SECONDS,
    });
  } catch (error) {
    console.error('Failed to cache baremes:', error);
  }

  return baremes;
}
