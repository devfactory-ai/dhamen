/**
 * Reconciliation Rules
 *
 * Business rules for reconciling claims and detecting discrepancies
 */

import type {
  Claim,
  ProviderReconciliation,
  Discrepancy,
  Adjustment,
  ReconciliationSummary,
  Provider,
} from './reconciliation.types';

/**
 * Calculate provider reconciliation summary
 */
export function calculateProviderReconciliation(
  provider: Provider,
  claims: Claim[]
): ProviderReconciliation {
  const approved = claims.filter((c) => c.status === 'approved' || c.status === 'paid');
  const rejected = claims.filter((c) => c.status === 'rejected');

  const requestedAmount = claims.reduce((sum, c) => sum + c.amount, 0);
  const approvedAmount = approved.reduce((sum, c) => sum + c.approvedAmount, 0);

  // Calculate adjustments (deductions for rejected claims)
  const adjustments: Adjustment[] = rejected.map((c) => ({
    type: 'deduction' as const,
    reason: 'Réclamation rejetée',
    amount: c.amount,
    claimId: c.id,
  }));

  return {
    providerId: provider.id,
    providerName: provider.name,
    providerType: provider.type,
    claimsCount: claims.length,
    approvedCount: approved.length,
    rejectedCount: rejected.length,
    requestedAmount,
    approvedAmount,
    netPayable: approvedAmount,
    adjustments,
  };
}

/**
 * Calculate overall reconciliation summary
 */
export function calculateReconciliationSummary(
  providers: ProviderReconciliation[],
  discrepancies: Discrepancy[]
): ReconciliationSummary {
  const totalClaims = providers.reduce((sum, p) => sum + p.claimsCount, 0);
  const approvedClaims = providers.reduce((sum, p) => sum + p.approvedCount, 0);
  const rejectedClaims = providers.reduce((sum, p) => sum + p.rejectedCount, 0);
  const pendingClaims = totalClaims - approvedClaims - rejectedClaims;

  const totalRequestedAmount = providers.reduce((sum, p) => sum + p.requestedAmount, 0);
  const totalApprovedAmount = providers.reduce((sum, p) => sum + p.approvedAmount, 0);
  const totalRejectedAmount = providers.reduce(
    (sum, p) => sum + p.adjustments.reduce((a, adj) => a + adj.amount, 0),
    0
  );
  const totalNetPayable = providers.reduce((sum, p) => sum + p.netPayable, 0);

  return {
    totalClaims,
    approvedClaims,
    rejectedClaims,
    pendingClaims,
    totalRequestedAmount,
    totalApprovedAmount,
    totalRejectedAmount,
    totalNetPayable,
    discrepancyCount: discrepancies.length,
  };
}

/**
 * Detect amount mismatches between submitted and approved amounts
 */
export function detectAmountDiscrepancies(
  claims: Claim[],
  tolerancePercentage = 1
): Discrepancy[] {
  const discrepancies: Discrepancy[] = [];

  for (const claim of claims) {
    if (claim.status !== 'approved' && claim.status !== 'paid') {
      continue;
    }

    const difference = claim.amount - claim.approvedAmount;
    const percentageDiff = (Math.abs(difference) / claim.amount) * 100;

    // If difference is significant (more than tolerance) and not 100% rejection
    if (percentageDiff > tolerancePercentage && claim.approvedAmount > 0) {
      discrepancies.push({
        id: `disc_${claim.id}`,
        claimId: claim.id,
        type: 'AMOUNT_MISMATCH',
        severity: percentageDiff > 20 ? 'high' : percentageDiff > 10 ? 'medium' : 'low',
        description: `Écart de ${percentageDiff.toFixed(1)}% entre montant demandé et approuvé`,
        providerAmount: claim.amount,
        insurerAmount: claim.approvedAmount,
        difference,
        status: 'open',
      });
    }
  }

  return discrepancies;
}

/**
 * Detect duplicate claims in the period
 */
export function detectDuplicateClaims(claims: Claim[]): Discrepancy[] {
  const discrepancies: Discrepancy[] = [];
  const seen = new Map<string, Claim>();

  for (const claim of claims) {
    // Create a signature for the claim
    const signature = `${claim.adherentId}:${claim.providerId}:${claim.serviceDate}:${claim.careType}`;

    const existing = seen.get(signature);
    if (existing) {
      // Check if amounts are similar (within 10%)
      const amountDiff = Math.abs(claim.amount - existing.amount);
      const maxAmount = Math.max(claim.amount, existing.amount);
      const similarAmount = amountDiff / maxAmount < 0.1;

      if (similarAmount) {
        discrepancies.push({
          id: `disc_dup_${claim.id}`,
          claimId: claim.id,
          type: 'DUPLICATE_CLAIM',
          severity: 'high',
          description: `Doublon potentiel de la réclamation ${existing.id}`,
          providerAmount: claim.amount,
          insurerAmount: existing.amount,
          difference: amountDiff,
          status: 'open',
        });
      }
    } else {
      seen.set(signature, claim);
    }
  }

  return discrepancies;
}

/**
 * Detect claims with status mismatches
 * (e.g., provider says approved, but not in our system)
 */
export function detectStatusDiscrepancies(
  claims: Claim[],
  providerSubmittedClaims: { claimId: string; providerStatus: string }[]
): Discrepancy[] {
  const discrepancies: Discrepancy[] = [];
  const claimsById = new Map(claims.map((c) => [c.id, c]));

  for (const submitted of providerSubmittedClaims) {
    const claim = claimsById.get(submitted.claimId);

    if (!claim) {
      discrepancies.push({
        id: `disc_missing_${submitted.claimId}`,
        claimId: submitted.claimId,
        type: 'MISSING_CLAIM',
        severity: 'high',
        description: 'Réclamation soumise par le praticien introuvable',
        providerAmount: 0,
        insurerAmount: 0,
        difference: 0,
        status: 'open',
      });
      continue;
    }

    // Map status names
    const statusMap: Record<string, string> = {
      approved: 'approved',
      paid: 'approved',
      rejected: 'rejected',
      pending: 'pending',
    };

    const normalizedStatus = statusMap[claim.status] || claim.status;
    const normalizedProviderStatus = statusMap[submitted.providerStatus] || submitted.providerStatus;

    if (normalizedStatus !== normalizedProviderStatus) {
      discrepancies.push({
        id: `disc_status_${claim.id}`,
        claimId: claim.id,
        type: 'STATUS_MISMATCH',
        severity: 'medium',
        description: `Statut: assureur=${claim.status}, praticien=${submitted.providerStatus}`,
        providerAmount: claim.amount,
        insurerAmount: claim.approvedAmount,
        difference: 0,
        status: 'open',
      });
    }
  }

  return discrepancies;
}

/**
 * Calculate total adjustments for a provider
 */
export function calculateAdjustments(
  claims: Claim[],
  previousOverpayments: { claimId: string; amount: number }[] = []
): Adjustment[] {
  const adjustments: Adjustment[] = [];

  // Add previous overpayment deductions
  for (const overpayment of previousOverpayments) {
    adjustments.push({
      type: 'deduction',
      reason: 'Régularisation trop-perçu période précédente',
      amount: overpayment.amount,
      claimId: overpayment.claimId,
    });
  }

  // Check for rejected claims that were initially approved
  const rejectedAfterApproval = claims.filter(
    (c) => c.status === 'rejected' && c.approvedAmount > 0
  );

  for (const claim of rejectedAfterApproval) {
    adjustments.push({
      type: 'deduction',
      reason: 'Réclamation annulée après approbation initiale',
      amount: claim.approvedAmount,
      claimId: claim.id,
    });
  }

  return adjustments;
}

/**
 * Validate claims for reconciliation
 * Returns claims that are ready for inclusion in bordereau
 */
export function validateClaimsForBordereau(claims: Claim[]): {
  valid: Claim[];
  invalid: { claim: Claim; reason: string }[];
} {
  const valid: Claim[] = [];
  const invalid: { claim: Claim; reason: string }[] = [];

  for (const claim of claims) {
    // Must be approved or paid
    if (claim.status !== 'approved' && claim.status !== 'paid') {
      invalid.push({
        claim,
        reason: `Statut non valide: ${claim.status}`,
      });
      continue;
    }

    // Must have approved amount
    if (claim.approvedAmount <= 0) {
      invalid.push({
        claim,
        reason: 'Montant approuvé invalide',
      });
      continue;
    }

    // Service date must not be in the future
    const serviceDate = new Date(claim.serviceDate);
    const today = new Date();
    if (serviceDate > today) {
      invalid.push({
        claim,
        reason: 'Date de service dans le futur',
      });
      continue;
    }

    valid.push(claim);
  }

  return { valid, invalid };
}

/**
 * Group claims by provider for reconciliation
 */
export function groupClaimsByProvider(claims: Claim[]): Map<string, Claim[]> {
  const grouped = new Map<string, Claim[]>();

  for (const claim of claims) {
    const existing = grouped.get(claim.providerId) || [];
    existing.push(claim);
    grouped.set(claim.providerId, existing);
  }

  return grouped;
}
