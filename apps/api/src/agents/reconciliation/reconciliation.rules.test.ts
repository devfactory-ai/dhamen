/**
 * Reconciliation Rules Unit Tests
 */

import { describe, it, expect } from 'vitest';
import {
  calculateProviderReconciliation,
  calculateReconciliationSummary,
  detectAmountDiscrepancies,
  detectDuplicateClaims,
  validateClaimsForBordereau,
  groupClaimsByProvider,
} from './reconciliation.rules';
import type { Claim, Provider, ProviderReconciliation, Discrepancy } from './reconciliation.types';

// Test fixtures
const createClaim = (overrides: Partial<Claim> = {}): Claim => ({
  id: 'claim_001',
  adherentId: 'adherent_001',
  providerId: 'provider_001',
  insurerId: 'insurer_001',
  careType: 'pharmacy',
  amount: 15000,
  approvedAmount: 12000,
  status: 'approved',
  serviceDate: '2024-06-15',
  submittedAt: '2024-06-15T10:00:00Z',
  ...overrides,
});

const createProvider = (overrides: Partial<Provider> = {}): Provider => ({
  id: 'provider_001',
  name: 'Pharmacie Centrale',
  type: 'PHARMACY',
  isActive: true,
  ...overrides,
});

describe('calculateProviderReconciliation', () => {
  it('should calculate correct totals for approved claims', () => {
    const provider = createProvider();
    const claims = [
      createClaim({ id: 'c1', amount: 10000, approvedAmount: 8000, status: 'approved' }),
      createClaim({ id: 'c2', amount: 15000, approvedAmount: 12000, status: 'approved' }),
    ];

    const result = calculateProviderReconciliation(provider, claims);

    expect(result.claimsCount).toBe(2);
    expect(result.approvedCount).toBe(2);
    expect(result.rejectedCount).toBe(0);
    expect(result.requestedAmount).toBe(25000);
    expect(result.approvedAmount).toBe(20000);
    expect(result.netPayable).toBe(20000);
  });

  it('should handle rejected claims correctly', () => {
    const provider = createProvider();
    const claims = [
      createClaim({ id: 'c1', amount: 10000, approvedAmount: 8000, status: 'approved' }),
      createClaim({ id: 'c2', amount: 15000, approvedAmount: 0, status: 'rejected' }),
    ];

    const result = calculateProviderReconciliation(provider, claims);

    expect(result.claimsCount).toBe(2);
    expect(result.approvedCount).toBe(1);
    expect(result.rejectedCount).toBe(1);
    expect(result.requestedAmount).toBe(25000);
    expect(result.approvedAmount).toBe(8000);
    expect(result.adjustments).toHaveLength(1);
    expect(result.adjustments[0]?.type).toBe('deduction');
  });

  it('should include paid claims in approved count', () => {
    const provider = createProvider();
    const claims = [
      createClaim({ id: 'c1', amount: 10000, approvedAmount: 10000, status: 'paid' }),
    ];

    const result = calculateProviderReconciliation(provider, claims);

    expect(result.approvedCount).toBe(1);
  });
});

describe('calculateReconciliationSummary', () => {
  it('should calculate correct summary totals', () => {
    const providers: ProviderReconciliation[] = [
      {
        providerId: 'p1',
        providerName: 'Provider 1',
        providerType: 'PHARMACY',
        claimsCount: 5,
        approvedCount: 4,
        rejectedCount: 1,
        requestedAmount: 50000,
        approvedAmount: 40000,
        netPayable: 40000,
        adjustments: [],
      },
      {
        providerId: 'p2',
        providerName: 'Provider 2',
        providerType: 'DOCTOR',
        claimsCount: 3,
        approvedCount: 3,
        rejectedCount: 0,
        requestedAmount: 30000,
        approvedAmount: 25000,
        netPayable: 25000,
        adjustments: [],
      },
    ];
    const discrepancies: Discrepancy[] = [
      {
        id: 'd1',
        claimId: 'c1',
        type: 'AMOUNT_MISMATCH',
        severity: 'low',
        description: 'Test',
        providerAmount: 1000,
        insurerAmount: 900,
        difference: 100,
        status: 'open',
      },
    ];

    const result = calculateReconciliationSummary(providers, discrepancies);

    expect(result.totalClaims).toBe(8);
    expect(result.approvedClaims).toBe(7);
    expect(result.rejectedClaims).toBe(1);
    expect(result.totalRequestedAmount).toBe(80000);
    expect(result.totalApprovedAmount).toBe(65000);
    expect(result.totalNetPayable).toBe(65000);
    expect(result.discrepancyCount).toBe(1);
  });
});

describe('detectAmountDiscrepancies', () => {
  it('should detect significant amount differences', () => {
    const claims = [
      createClaim({ id: 'c1', amount: 10000, approvedAmount: 7000, status: 'approved' }),
    ];

    const discrepancies = detectAmountDiscrepancies(claims, 1);

    expect(discrepancies).toHaveLength(1);
    expect(discrepancies[0]?.type).toBe('AMOUNT_MISMATCH');
    expect(discrepancies[0]?.difference).toBe(3000);
  });

  it('should not flag small differences within tolerance', () => {
    const claims = [
      createClaim({ id: 'c1', amount: 10000, approvedAmount: 9950, status: 'approved' }),
    ];

    const discrepancies = detectAmountDiscrepancies(claims, 1);

    expect(discrepancies).toHaveLength(0);
  });

  it('should determine correct severity based on percentage', () => {
    const claims = [
      createClaim({ id: 'c1', amount: 10000, approvedAmount: 5000, status: 'approved' }), // 50% diff
      createClaim({ id: 'c2', amount: 10000, approvedAmount: 8500, status: 'approved' }), // 15% diff
      createClaim({ id: 'c3', amount: 10000, approvedAmount: 9500, status: 'approved' }), // 5% diff
    ];

    const discrepancies = detectAmountDiscrepancies(claims, 1);

    const high = discrepancies.find((d) => d.claimId === 'c1');
    const medium = discrepancies.find((d) => d.claimId === 'c2');
    const low = discrepancies.find((d) => d.claimId === 'c3');

    expect(high?.severity).toBe('high');
    expect(medium?.severity).toBe('medium');
    expect(low?.severity).toBe('low');
  });

  it('should skip non-approved claims', () => {
    const claims = [
      createClaim({ id: 'c1', amount: 10000, approvedAmount: 5000, status: 'pending' }),
      createClaim({ id: 'c2', amount: 10000, approvedAmount: 0, status: 'rejected' }),
    ];

    const discrepancies = detectAmountDiscrepancies(claims, 1);

    expect(discrepancies).toHaveLength(0);
  });
});

describe('detectDuplicateClaims', () => {
  it('should detect duplicate claims', () => {
    const claims = [
      createClaim({
        id: 'c1',
        adherentId: 'a1',
        providerId: 'p1',
        serviceDate: '2024-06-15',
        careType: 'pharmacy',
        amount: 10000,
      }),
      createClaim({
        id: 'c2',
        adherentId: 'a1',
        providerId: 'p1',
        serviceDate: '2024-06-15',
        careType: 'pharmacy',
        amount: 10500, // Within 10% tolerance
      }),
    ];

    const discrepancies = detectDuplicateClaims(claims);

    expect(discrepancies).toHaveLength(1);
    expect(discrepancies[0]?.type).toBe('DUPLICATE_CLAIM');
    expect(discrepancies[0]?.claimId).toBe('c2');
    expect(discrepancies[0]?.description).toContain('c1');
  });

  it('should not flag claims with different amounts', () => {
    const claims = [
      createClaim({
        id: 'c1',
        adherentId: 'a1',
        providerId: 'p1',
        serviceDate: '2024-06-15',
        careType: 'pharmacy',
        amount: 10000,
      }),
      createClaim({
        id: 'c2',
        adherentId: 'a1',
        providerId: 'p1',
        serviceDate: '2024-06-15',
        careType: 'pharmacy',
        amount: 50000, // Very different amount
      }),
    ];

    const discrepancies = detectDuplicateClaims(claims);

    expect(discrepancies).toHaveLength(0);
  });

  it('should not flag claims with different providers', () => {
    const claims = [
      createClaim({
        id: 'c1',
        adherentId: 'a1',
        providerId: 'p1',
        serviceDate: '2024-06-15',
        amount: 10000,
      }),
      createClaim({
        id: 'c2',
        adherentId: 'a1',
        providerId: 'p2', // Different provider
        serviceDate: '2024-06-15',
        amount: 10000,
      }),
    ];

    const discrepancies = detectDuplicateClaims(claims);

    expect(discrepancies).toHaveLength(0);
  });
});

describe('validateClaimsForBordereau', () => {
  it('should accept approved claims with valid amounts', () => {
    const claims = [
      createClaim({ id: 'c1', status: 'approved', approvedAmount: 10000, serviceDate: '2024-01-15' }),
      createClaim({ id: 'c2', status: 'paid', approvedAmount: 5000, serviceDate: '2024-01-15' }),
    ];

    const result = validateClaimsForBordereau(claims);

    expect(result.valid).toHaveLength(2);
    expect(result.invalid).toHaveLength(0);
  });

  it('should reject pending and rejected claims', () => {
    const claims = [
      createClaim({ id: 'c1', status: 'pending', approvedAmount: 10000 }),
      createClaim({ id: 'c2', status: 'rejected', approvedAmount: 0 }),
    ];

    const result = validateClaimsForBordereau(claims);

    expect(result.valid).toHaveLength(0);
    expect(result.invalid).toHaveLength(2);
    expect(result.invalid[0]?.reason).toContain('Statut non valide');
  });

  it('should reject claims with zero approved amount', () => {
    const claims = [
      createClaim({ id: 'c1', status: 'approved', approvedAmount: 0, serviceDate: '2024-01-15' }),
    ];

    const result = validateClaimsForBordereau(claims);

    expect(result.valid).toHaveLength(0);
    expect(result.invalid).toHaveLength(1);
    expect(result.invalid[0]?.reason).toContain('Montant approuvé invalide');
  });

  it('should reject claims with future service dates', () => {
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 30);

    const claims = [
      createClaim({
        id: 'c1',
        status: 'approved',
        approvedAmount: 10000,
        serviceDate: futureDate.toISOString().split('T')[0]!,
      }),
    ];

    const result = validateClaimsForBordereau(claims);

    expect(result.valid).toHaveLength(0);
    expect(result.invalid).toHaveLength(1);
    expect(result.invalid[0]?.reason).toContain('Date de service dans le futur');
  });
});

describe('groupClaimsByProvider', () => {
  it('should group claims by provider ID', () => {
    const claims = [
      createClaim({ id: 'c1', providerId: 'p1' }),
      createClaim({ id: 'c2', providerId: 'p1' }),
      createClaim({ id: 'c3', providerId: 'p2' }),
    ];

    const grouped = groupClaimsByProvider(claims);

    expect(grouped.size).toBe(2);
    expect(grouped.get('p1')).toHaveLength(2);
    expect(grouped.get('p2')).toHaveLength(1);
  });

  it('should handle empty claims array', () => {
    const grouped = groupClaimsByProvider([]);

    expect(grouped.size).toBe(0);
  });

  it('should handle single provider', () => {
    const claims = [
      createClaim({ id: 'c1', providerId: 'p1' }),
      createClaim({ id: 'c2', providerId: 'p1' }),
    ];

    const grouped = groupClaimsByProvider(claims);

    expect(grouped.size).toBe(1);
    expect(grouped.get('p1')).toHaveLength(2);
  });
});
