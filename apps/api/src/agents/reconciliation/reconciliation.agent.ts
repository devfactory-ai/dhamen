/**
 * Reconciliation Agent
 *
 * Main agent for reconciling claims between providers and insurers,
 * detecting discrepancies, and generating bordereaux (payment statements).
 */

import type { Context } from 'hono';
import type { Bindings, Variables } from '../../types';
import type {
  ReconciliationRequest,
  ReconciliationResult,
  ProviderReconciliation,
  Discrepancy,
  BordereauInfo,
  Claim,
  Provider,
} from './reconciliation.types';
import {
  generateReconciliationId,
  generateBordereauNumber,
} from './reconciliation.types';
import {
  calculateProviderReconciliation,
  calculateReconciliationSummary,
  detectAmountDiscrepancies,
  detectDuplicateClaims,
  validateClaimsForBordereau,
  groupClaimsByProvider,
} from './reconciliation.rules';

/**
 * Main reconciliation function
 */
export async function reconcileClaims(
  c: Context<{ Bindings: Bindings; Variables: Variables }>,
  request: ReconciliationRequest
): Promise<ReconciliationResult> {
  const startTime = Date.now();
  const reconciliationId = generateReconciliationId(
    request.insurerId,
    request.periodStart,
    request.periodEnd
  );

  // Fetch all claims for the period
  const claims = await getClaimsForPeriod(
    c,
    request.insurerId,
    request.providerId || null,
    request.periodStart,
    request.periodEnd
  );

  // Fetch provider details
  const providerIds = [...new Set(claims.map((c) => c.providerId))];
  const providers = await getProviders(c, providerIds);
  const providersMap = new Map(providers.map((p) => [p.id, p]));

  // Group claims by provider
  const claimsByProvider = groupClaimsByProvider(claims);

  // Calculate reconciliation for each provider
  const providerReconciliations: ProviderReconciliation[] = [];
  for (const [providerId, providerClaims] of claimsByProvider) {
    const provider = providersMap.get(providerId);
    if (provider) {
      providerReconciliations.push(
        calculateProviderReconciliation(provider, providerClaims)
      );
    }
  }

  // Detect discrepancies
  const amountDiscrepancies = detectAmountDiscrepancies(claims);
  const duplicateDiscrepancies = detectDuplicateClaims(claims);
  const allDiscrepancies = [...amountDiscrepancies, ...duplicateDiscrepancies];

  // Calculate summary
  const summary = calculateReconciliationSummary(providerReconciliations, allDiscrepancies);

  // Validate claims for bordereau
  const { valid: validClaims } = validateClaimsForBordereau(claims);

  // Generate bordereau info if there are valid claims
  let bordereau: BordereauInfo | null = null;
  if (validClaims.length > 0 && summary.totalNetPayable > 0) {
    bordereau = await generateBordereau(
      c,
      request.insurerId,
      request.providerId || 'ALL',
      request.periodStart,
      request.periodEnd,
      validClaims,
      summary.totalNetPayable
    );
  }

  return {
    reconciliationId,
    insurerId: request.insurerId,
    providerId: request.providerId || null,
    periodStart: request.periodStart,
    periodEnd: request.periodEnd,
    status: allDiscrepancies.length > 0 ? 'disputed' : 'validated',
    summary,
    providers: providerReconciliations,
    discrepancies: allDiscrepancies,
    bordereau,
    processTime: Date.now() - startTime,
  };
}

/**
 * Generate bordereau for payment
 */
async function generateBordereau(
  c: Context<{ Bindings: Bindings; Variables: Variables }>,
  insurerId: string,
  providerId: string,
  periodStart: string,
  periodEnd: string,
  claims: Claim[],
  totalAmount: number
): Promise<BordereauInfo> {
  const bordereauNumber = generateBordereauNumber(insurerId, providerId, periodStart);
  const bordereauId = `brd_${Date.now()}`;

  // Store bordereau in database
  await c.env.DB.prepare(`
    INSERT INTO bordereaux (
      id, bordereau_number, insurer_id, provider_id,
      period_start, period_end, total_amount, claims_count,
      status, generated_at, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'draft', datetime('now'), datetime('now'), datetime('now'))
  `)
    .bind(
      bordereauId,
      bordereauNumber,
      insurerId,
      providerId === 'ALL' ? null : providerId,
      periodStart,
      periodEnd,
      totalAmount,
      claims.length
    )
    .run();

  // Link claims to bordereau
  const claimIds = claims.map((c) => c.id);
  for (const claimId of claimIds) {
    await c.env.DB.prepare(`
      UPDATE claims SET bordereau_id = ?, updated_at = datetime('now')
      WHERE id = ?
    `)
      .bind(bordereauId, claimId)
      .run();
  }

  return {
    id: bordereauId,
    number: bordereauNumber,
    generatedAt: new Date().toISOString(),
    periodStart,
    periodEnd,
    totalAmount,
    claimsCount: claims.length,
    status: 'draft',
  };
}

/**
 * Get bordereau by ID
 */
export async function getBordereau(
  c: Context<{ Bindings: Bindings; Variables: Variables }>,
  bordereauId: string
): Promise<BordereauInfo | null> {
  const result = await c.env.DB.prepare(`
    SELECT
      id, bordereau_number as number, period_start as periodStart,
      period_end as periodEnd, total_amount as totalAmount,
      claims_count as claimsCount, status, generated_at as generatedAt,
      pdf_url as pdfUrl
    FROM bordereaux
    WHERE id = ?
  `)
    .bind(bordereauId)
    .first<BordereauInfo>();

  return result || null;
}

/**
 * Update bordereau status
 */
export async function updateBordereauStatus(
  c: Context<{ Bindings: Bindings; Variables: Variables }>,
  bordereauId: string,
  status: 'draft' | 'sent' | 'acknowledged' | 'paid'
): Promise<void> {
  await c.env.DB.prepare(`
    UPDATE bordereaux SET status = ?, updated_at = datetime('now')
    WHERE id = ?
  `)
    .bind(status, bordereauId)
    .run();

  // If marked as paid, update all linked claims
  if (status === 'paid') {
    await c.env.DB.prepare(`
      UPDATE claims SET status = 'paid', updated_at = datetime('now')
      WHERE bordereau_id = ?
    `)
      .bind(bordereauId)
      .run();
  }
}

/**
 * Resolve a discrepancy
 */
export async function resolveDiscrepancy(
  c: Context<{ Bindings: Bindings; Variables: Variables }>,
  discrepancyId: string,
  resolution: string,
  adjustedAmount?: number
): Promise<void> {
  await c.env.DB.prepare(`
    UPDATE discrepancies SET
      status = 'resolved',
      resolution = ?,
      adjusted_amount = ?,
      resolved_at = datetime('now'),
      updated_at = datetime('now')
    WHERE id = ?
  `)
    .bind(resolution, adjustedAmount || null, discrepancyId)
    .run();
}

// =============================================================================
// Database Queries
// =============================================================================

/**
 * Get claims for reconciliation period
 */
async function getClaimsForPeriod(
  c: Context<{ Bindings: Bindings; Variables: Variables }>,
  insurerId: string,
  providerId: string | null,
  periodStart: string,
  periodEnd: string
): Promise<Claim[]> {
  let query = `
    SELECT
      id, adherent_id as adherentId, provider_id as providerId,
      insurer_id as insurerId, care_type as careType,
      amount, approved_amount as approvedAmount, status,
      service_date as serviceDate, submitted_at as submittedAt
    FROM claims
    WHERE insurer_id = ?
      AND service_date >= ?
      AND service_date <= ?
      AND status IN ('approved', 'rejected', 'paid', 'pending')
  `;

  const bindings: (string | null)[] = [insurerId, periodStart, periodEnd];

  if (providerId) {
    query += ' AND provider_id = ?';
    bindings.push(providerId);
  }

  query += ' ORDER BY service_date, provider_id';

  const results = await c.env.DB.prepare(query)
    .bind(...bindings)
    .all<Claim>();

  return results.results || [];
}

/**
 * Get providers by IDs
 */
async function getProviders(
  c: Context<{ Bindings: Bindings; Variables: Variables }>,
  providerIds: string[]
): Promise<Provider[]> {
  if (providerIds.length === 0) {
    return [];
  }

  const placeholders = providerIds.map(() => '?').join(', ');

  const results = await c.env.DB.prepare(`
    SELECT id, name, type, is_active as isActive
    FROM providers
    WHERE id IN (${placeholders})
  `)
    .bind(...providerIds)
    .all<Provider>();

  return (results.results || []).map((p) => ({
    ...p,
    isActive: Boolean(p.isActive),
  }));
}

/**
 * Get reconciliation history for insurer
 */
export async function getReconciliationHistory(
  c: Context<{ Bindings: Bindings; Variables: Variables }>,
  insurerId: string,
  limit = 10
): Promise<
  {
    id: string;
    periodStart: string;
    periodEnd: string;
    totalAmount: number;
    status: string;
    createdAt: string;
  }[]
> {
  const results = await c.env.DB.prepare(`
    SELECT
      id, period_start as periodStart, period_end as periodEnd,
      total_amount as totalAmount, status, created_at as createdAt
    FROM bordereaux
    WHERE insurer_id = ?
    ORDER BY created_at DESC
    LIMIT ?
  `)
    .bind(insurerId, limit)
    .all<{
      id: string;
      periodStart: string;
      periodEnd: string;
      totalAmount: number;
      status: string;
      createdAt: string;
    }>();

  return results.results || [];
}

/**
 * Get pending discrepancies for insurer
 */
export async function getPendingDiscrepancies(
  c: Context<{ Bindings: Bindings; Variables: Variables }>,
  insurerId: string
): Promise<Discrepancy[]> {
  const results = await c.env.DB.prepare(`
    SELECT
      d.id, d.claim_id as claimId, d.type, d.severity,
      d.description, d.provider_amount as providerAmount,
      d.insurer_amount as insurerAmount, d.difference, d.status
    FROM discrepancies d
    JOIN claims c ON d.claim_id = c.id
    WHERE c.insurer_id = ?
      AND d.status = 'open'
    ORDER BY d.severity DESC, d.created_at DESC
  `)
    .bind(insurerId)
    .all<Discrepancy>();

  return results.results || [];
}
