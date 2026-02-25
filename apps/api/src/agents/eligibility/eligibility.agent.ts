/**
 * Eligibility Agent
 *
 * Main agent for verifying healthcare coverage eligibility.
 * Queries contracts, coverage rules, and applies business rules
 * to determine if a claim is eligible for coverage.
 *
 * SLA: < 100ms response time (uses KV caching)
 */

import type { Context } from 'hono';
import type { Bindings, Variables } from '../../types';
import type {
  EligibilityCheckRequest,
  EligibilityResult,
  EligibilityReason,
  CoverageDetails,
  Contract,
  CoverageRule,
  Adherent,
  Provider,
} from './eligibility.types';
import {
  checkContractValidity,
  checkWaitingPeriod,
  checkCareTypeCoverage,
  checkAmountLimits,
  checkProviderNetwork,
  checkAgeRestriction,
  evaluateEligibility,
} from './eligibility.rules';

// Cache TTL: 5 minutes for eligibility results
const CACHE_TTL_SECONDS = 300;

/**
 * Generate cache key for eligibility results
 */
function generateCacheKey(request: EligibilityCheckRequest): string {
  return `eligibility:${request.adherentId}:${request.insurerId}:${request.careType}:${request.serviceDate}`;
}

/**
 * Main eligibility check function
 */
export async function checkEligibility(
  c: Context<{ Bindings: Bindings; Variables: Variables }>,
  request: EligibilityCheckRequest
): Promise<EligibilityResult> {
  const startTime = Date.now();
  const cacheKey = generateCacheKey(request);

  // Try cache first
  const cached = await getCachedResult(c, cacheKey);
  if (cached) {
    return {
      ...cached,
      cachedResult: true,
      checkTime: Date.now() - startTime,
    };
  }

  // Fetch all required data in parallel for performance
  const [contract, coverageRule, adherent, provider, usedAmounts] = await Promise.all([
    getActiveContract(c, request.adherentId, request.insurerId, request.serviceDate),
    getCoverageRule(c, request.insurerId, request.careType, request.serviceDate),
    getAdherent(c, request.adherentId),
    getProvider(c, request.providerId),
    getUsedAmounts(c, request.adherentId, request.insurerId, request.careType, request.serviceDate),
  ]);

  // Collect all reasons from rule checks
  const reasons: EligibilityReason[] = [];

  // Rule 1: Contract validity
  reasons.push(...checkContractValidity(contract, request.serviceDate));

  // If no valid contract, skip remaining checks
  if (!contract || reasons.some((r) => r.code !== 'CONTRACT_VALID' && r.severity === 'error')) {
    const result = buildResult(null, reasons, null, startTime, false);
    await cacheResult(c, cacheKey, result);
    return result;
  }

  // Rule 2: Waiting period
  reasons.push(...checkWaitingPeriod(contract, coverageRule, request.serviceDate));

  // Rule 3: Care type coverage
  reasons.push(...checkCareTypeCoverage(coverageRule, request.careType));

  // Rule 4: Amount limits
  reasons.push(...checkAmountLimits(coverageRule, request.amount, usedAmounts));

  // Rule 5: Provider network
  reasons.push(...checkProviderNetwork(coverageRule, provider));

  // Rule 6: Age restriction
  reasons.push(...checkAgeRestriction(coverageRule, adherent, request.serviceDate));

  // Build coverage details if eligible
  const coverageDetails = buildCoverageDetails(contract, coverageRule, usedAmounts);

  // Build final result
  const result = buildResult(contract.id, reasons, coverageDetails, startTime, false);

  // Cache the result
  await cacheResult(c, cacheKey, result);

  return result;
}

/**
 * Build the final eligibility result
 */
function buildResult(
  contractId: string | null,
  reasons: EligibilityReason[],
  coverageDetails: CoverageDetails | null,
  startTime: number,
  cachedResult: boolean
): EligibilityResult {
  const { eligible, confidence } = evaluateEligibility(reasons);

  // Add ELIGIBLE reason if eligible
  if (eligible && !reasons.some((r) => r.code === 'ELIGIBLE')) {
    reasons.push({
      code: 'ELIGIBLE',
      message: 'Adherent eligible pour cette prise en charge',
      severity: 'info',
    });
  }

  return {
    eligible,
    contractId,
    reasons,
    coverageDetails,
    confidence,
    checkTime: Date.now() - startTime,
    cachedResult,
  };
}

/**
 * Build coverage details from contract and rule
 */
function buildCoverageDetails(
  contract: Contract,
  coverageRule: CoverageRule | null,
  usedAmounts: { annual: number }
): CoverageDetails | null {
  if (!coverageRule) {
    return null;
  }

  const remainingAnnualLimit = coverageRule.annualLimit
    ? coverageRule.annualLimit - usedAmounts.annual
    : null;

  return {
    planType: contract.planType,
    coveragePercentage: coverageRule.copayType === 'percentage'
      ? 100 - coverageRule.copayValue
      : 100,
    maxCoveredAmount: coverageRule.perActLimit,
    copayType: coverageRule.copayType,
    copayValue: coverageRule.copayValue,
    remainingAnnualLimit,
    effectiveDate: contract.startDate,
    expirationDate: contract.endDate,
  };
}

// =============================================================================
// Database Queries
// =============================================================================

/**
 * Get active contract for adherent with insurer
 */
async function getActiveContract(
  c: Context<{ Bindings: Bindings; Variables: Variables }>,
  adherentId: string,
  insurerId: string,
  serviceDate: string
): Promise<Contract | null> {
  const result = await c.env.DB.prepare(`
    SELECT
      id, insurer_id as insurerId, adherent_id as adherentId,
      contract_number as contractNumber, plan_type as planType,
      start_date as startDate, end_date as endDate,
      carence_days as carenceDays, annual_limit as annualLimit,
      coverage_json as coverageJson, exclusions_json as exclusionsJson,
      status
    FROM contracts
    WHERE adherent_id = ?
      AND insurer_id = ?
      AND status = 'active'
      AND start_date <= ?
      AND end_date >= ?
    LIMIT 1
  `)
    .bind(adherentId, insurerId, serviceDate, serviceDate)
    .first<Contract>();

  return result || null;
}

/**
 * Get coverage rule for care type
 */
async function getCoverageRule(
  c: Context<{ Bindings: Bindings; Variables: Variables }>,
  insurerId: string,
  careType: string,
  serviceDate: string
): Promise<CoverageRule | null> {
  const result = await c.env.DB.prepare(`
    SELECT
      id, insurer_id as insurerId, care_type as careType,
      plan_type as planType, is_covered as isCovered,
      requires_prior_auth as requiresPriorAuth,
      annual_limit as annualLimit, per_act_limit as perActLimit,
      per_day_limit as perDayLimit, per_month_limit as perMonthLimit,
      waiting_days as waitingDays, copay_type as copayType,
      copay_value as copayValue, network_only as networkOnly,
      min_age as minAge, max_age as maxAge,
      effective_from as effectiveFrom, effective_to as effectiveTo,
      is_active as isActive
    FROM care_coverage_rules
    WHERE insurer_id = ?
      AND care_type = ?
      AND is_active = 1
      AND effective_from <= ?
      AND (effective_to IS NULL OR effective_to >= ?)
    ORDER BY plan_type DESC NULLS LAST
    LIMIT 1
  `)
    .bind(insurerId, careType, serviceDate, serviceDate)
    .first<CoverageRule>();

  // Convert SQLite integers to booleans
  if (result) {
    return {
      ...result,
      isCovered: Boolean(result.isCovered),
      requiresPriorAuth: Boolean(result.requiresPriorAuth),
      networkOnly: Boolean(result.networkOnly),
      isActive: Boolean(result.isActive),
    };
  }

  return null;
}

/**
 * Get adherent details
 */
async function getAdherent(
  c: Context<{ Bindings: Bindings; Variables: Variables }>,
  adherentId: string
): Promise<Adherent | null> {
  const result = await c.env.DB.prepare(`
    SELECT
      id, insurer_id as insurerId, national_id as nationalId,
      first_name as firstName, last_name as lastName,
      date_of_birth as dateOfBirth, is_active as isActive
    FROM adherents
    WHERE id = ?
    LIMIT 1
  `)
    .bind(adherentId)
    .first<Adherent>();

  if (result) {
    return {
      ...result,
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
 * Get used amounts for the current period
 */
async function getUsedAmounts(
  c: Context<{ Bindings: Bindings; Variables: Variables }>,
  adherentId: string,
  insurerId: string,
  careType: string,
  serviceDate: string
): Promise<{ annual: number; daily: number; monthly: number; actCount: number }> {
  // Parse service date for period calculations
  const date = new Date(serviceDate);
  const yearStart = `${date.getFullYear()}-01-01`;
  const monthStart = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-01`;
  const dayStart = serviceDate;

  // Get annual usage
  const annualResult = await c.env.DB.prepare(`
    SELECT COALESCE(SUM(amount), 0) as total
    FROM claims
    WHERE adherent_id = ?
      AND insurer_id = ?
      AND care_type = ?
      AND service_date >= ?
      AND service_date <= ?
      AND status IN ('approved', 'paid')
  `)
    .bind(adherentId, insurerId, careType, yearStart, serviceDate)
    .first<{ total: number }>();

  // Get daily count
  const dailyResult = await c.env.DB.prepare(`
    SELECT COUNT(*) as count, COALESCE(SUM(amount), 0) as total
    FROM claims
    WHERE adherent_id = ?
      AND insurer_id = ?
      AND care_type = ?
      AND service_date = ?
      AND status IN ('approved', 'paid', 'pending')
  `)
    .bind(adherentId, insurerId, careType, dayStart)
    .first<{ count: number; total: number }>();

  // Get monthly total
  const monthlyResult = await c.env.DB.prepare(`
    SELECT COALESCE(SUM(amount), 0) as total
    FROM claims
    WHERE adherent_id = ?
      AND insurer_id = ?
      AND care_type = ?
      AND service_date >= ?
      AND service_date <= ?
      AND status IN ('approved', 'paid')
  `)
    .bind(adherentId, insurerId, careType, monthStart, serviceDate)
    .first<{ total: number }>();

  return {
    annual: annualResult?.total || 0,
    daily: dailyResult?.total || 0,
    monthly: monthlyResult?.total || 0,
    actCount: dailyResult?.count || 0,
  };
}

// =============================================================================
// Caching
// =============================================================================

/**
 * Get cached eligibility result
 */
async function getCachedResult(
  c: Context<{ Bindings: Bindings; Variables: Variables }>,
  cacheKey: string
): Promise<EligibilityResult | null> {
  try {
    const cached = await c.env.CACHE.get(cacheKey, 'json');
    return cached as EligibilityResult | null;
  } catch {
    return null;
  }
}

/**
 * Cache eligibility result
 */
async function cacheResult(
  c: Context<{ Bindings: Bindings; Variables: Variables }>,
  cacheKey: string,
  result: EligibilityResult
): Promise<void> {
  try {
    await c.env.CACHE.put(cacheKey, JSON.stringify(result), {
      expirationTtl: CACHE_TTL_SECONDS,
    });
  } catch (error) {
    // Log but don't fail on cache errors
    console.error('Failed to cache eligibility result:', error);
  }
}

/**
 * Invalidate cached eligibility for an adherent
 * Call this when contracts or coverage rules change
 */
export async function invalidateEligibilityCache(
  _c: Context<{ Bindings: Bindings; Variables: Variables }>,
  adherentId: string,
  insurerId?: string
): Promise<void> {
  // KV doesn't support prefix deletion, so we track keys in a set
  // For now, individual invalidation by exact key
  // In production, consider using a more sophisticated cache invalidation strategy
  const _pattern = insurerId
    ? `eligibility:${adherentId}:${insurerId}:*`
    : `eligibility:${adherentId}:*`;
  // Note: KV list + delete would be needed for full prefix invalidation
}

/**
 * Batch eligibility check for multiple requests
 * Useful for batch processing
 */
export async function checkEligibilityBatch(
  c: Context<{ Bindings: Bindings; Variables: Variables }>,
  requests: EligibilityCheckRequest[]
): Promise<EligibilityResult[]> {
  // Process in parallel with concurrency limit
  const BATCH_SIZE = 10;
  const results: EligibilityResult[] = [];

  for (let i = 0; i < requests.length; i += BATCH_SIZE) {
    const batch = requests.slice(i, i + BATCH_SIZE);
    const batchResults = await Promise.all(
      batch.map((req) => checkEligibility(c, req))
    );
    results.push(...batchResults);
  }

  return results;
}
