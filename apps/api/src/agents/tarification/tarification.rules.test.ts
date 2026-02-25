/**
 * Tarification Rules Unit Tests
 */

import { describe, it, expect } from 'vitest';
import {
  calculateEligibleAmount,
  calculateCoverageRate,
  calculateCopay,
  applyPerActLimit,
  checkQuantityLimits,
  calculateFinalAmounts,
} from './tarification.rules';
import type { TarificationRequest, Bareme, CoverageRule, Provider } from './tarification.types';

// Test fixtures
const createRequest = (overrides: Partial<TarificationRequest> = {}): TarificationRequest => ({
  insurerId: 'insurer_001',
  providerId: 'provider_001',
  adherentId: 'adherent_001',
  careType: 'pharmacy',
  actCode: 'MED001',
  quantity: 1,
  unitPrice: 15000, // 15 TND
  serviceDate: '2024-06-15',
  ...overrides,
});

const createBareme = (overrides: Partial<Bareme> = {}): Bareme => ({
  id: 'bareme_001',
  insurerId: 'insurer_001',
  careType: 'pharmacy',
  actCode: 'MED001',
  actName: 'Medicament generique',
  referencePrice: 12000, // 12 TND
  minPrice: null,
  maxPrice: 20000,
  coverageRate: 80,
  isNetworkBonus: false,
  networkBonusRate: 0,
  effectiveFrom: '2024-01-01',
  effectiveTo: null,
  isActive: true,
  ...overrides,
});

const createCoverageRule = (overrides: Partial<CoverageRule> = {}): CoverageRule => ({
  id: 'rule_001',
  insurerId: 'insurer_001',
  careType: 'pharmacy',
  planType: 'individual',
  isCovered: true,
  copayType: 'percentage',
  copayValue: 20,
  perActLimit: 50000, // 50 TND
  networkOnly: false,
  isActive: true,
  ...overrides,
});

const createProvider = (overrides: Partial<Provider> = {}): Provider => ({
  id: 'provider_001',
  name: 'Pharmacie Centrale',
  type: 'PHARMACY',
  isActive: true,
  isNetworkProvider: true,
  ...overrides,
});

describe('calculateEligibleAmount', () => {
  it('should return full amount when no bareme exists', () => {
    const request = createRequest({ unitPrice: 15000, quantity: 2 });
    const result = calculateEligibleAmount(request, null);

    expect(result.eligibleAmount).toBe(30000);
    expect(result.priceAdjustment).toBe(0);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]?.code).toBe('ACT_NOT_IN_BAREME');
  });

  it('should limit to bareme when price exceeds reference', () => {
    const request = createRequest({ unitPrice: 15000, quantity: 1 });
    const bareme = createBareme({ referencePrice: 12000 });
    const result = calculateEligibleAmount(request, bareme);

    expect(result.eligibleAmount).toBe(12000);
    expect(result.priceAdjustment).toBe(3000);
    expect(result.warnings.some((w) => w.code === 'PRICE_ABOVE_BAREME')).toBe(true);
    expect(result.appliedRules.some((r) => r.ruleId === 'BAREME_LIMIT')).toBe(true);
  });

  it('should use full amount when price is within bareme', () => {
    const request = createRequest({ unitPrice: 10000, quantity: 1 });
    const bareme = createBareme({ referencePrice: 12000 });
    const result = calculateEligibleAmount(request, bareme);

    expect(result.eligibleAmount).toBe(10000);
    expect(result.priceAdjustment).toBe(0);
    expect(result.warnings).toHaveLength(0);
  });

  it('should handle quantity correctly', () => {
    const request = createRequest({ unitPrice: 10000, quantity: 3 });
    const bareme = createBareme({ referencePrice: 12000 });
    const result = calculateEligibleAmount(request, bareme);

    expect(result.eligibleAmount).toBe(30000);
  });

  it('should warn when price below minimum', () => {
    const request = createRequest({ unitPrice: 5000, quantity: 1 });
    const bareme = createBareme({ referencePrice: 12000, minPrice: 8000 });
    const result = calculateEligibleAmount(request, bareme);

    expect(result.eligibleAmount).toBe(5000);
    expect(result.warnings.some((w) => w.code === 'MANUAL_REVIEW_REQUIRED')).toBe(true);
  });
});

describe('calculateCoverageRate', () => {
  it('should return 100% when no bareme or rule', () => {
    const result = calculateCoverageRate(null, null, null);

    expect(result.coverageRate).toBe(100);
    expect(result.appliedRules).toHaveLength(0);
  });

  it('should use bareme coverage rate', () => {
    const bareme = createBareme({ coverageRate: 80 });
    const result = calculateCoverageRate(bareme, null, null);

    expect(result.coverageRate).toBe(80);
    expect(result.appliedRules.some((r) => r.ruleId === 'BAREME_RATE')).toBe(true);
  });

  it('should apply network bonus for in-network providers', () => {
    const bareme = createBareme({
      coverageRate: 80,
      isNetworkBonus: true,
      networkBonusRate: 10,
    });
    const provider = createProvider({ isNetworkProvider: true });
    const result = calculateCoverageRate(bareme, null, provider);

    expect(result.coverageRate).toBe(90);
    expect(result.appliedRules.some((r) => r.ruleId === 'NETWORK_BONUS')).toBe(true);
  });

  it('should not exceed 100% with network bonus', () => {
    const bareme = createBareme({
      coverageRate: 95,
      isNetworkBonus: true,
      networkBonusRate: 10,
    });
    const provider = createProvider({ isNetworkProvider: true });
    const result = calculateCoverageRate(bareme, null, provider);

    expect(result.coverageRate).toBe(100);
  });

  it('should reduce coverage for out-of-network providers when required', () => {
    const bareme = createBareme({ coverageRate: 80 });
    const rule = createCoverageRule({ networkOnly: true });
    const provider = createProvider({ isNetworkProvider: false });
    const result = calculateCoverageRate(bareme, rule, provider);

    expect(result.coverageRate).toBe(60); // 80 - 20
    expect(result.warnings.some((w) => w.code === 'NON_NETWORK_PROVIDER')).toBe(true);
    expect(result.appliedRules.some((r) => r.ruleId === 'OUT_OF_NETWORK')).toBe(true);
  });
});

describe('calculateCopay', () => {
  it('should return 0 copay when no rule', () => {
    const result = calculateCopay(10000, null);

    expect(result.copayAmount).toBe(0);
    expect(result.copayType).toBeNull();
  });

  it('should calculate fixed copay', () => {
    const rule = createCoverageRule({ copayType: 'fixed', copayValue: 2000 });
    const result = calculateCopay(10000, rule);

    expect(result.copayAmount).toBe(2000);
    expect(result.copayType).toBe('fixed');
    expect(result.appliedRules.some((r) => r.ruleId === 'FIXED_COPAY')).toBe(true);
  });

  it('should calculate percentage copay', () => {
    const rule = createCoverageRule({ copayType: 'percentage', copayValue: 20 });
    const result = calculateCopay(10000, rule);

    expect(result.copayAmount).toBe(2000);
    expect(result.copayType).toBe('percentage');
    expect(result.appliedRules.some((r) => r.ruleId === 'PERCENTAGE_COPAY')).toBe(true);
  });

  it('should round percentage copay to nearest millime', () => {
    const rule = createCoverageRule({ copayType: 'percentage', copayValue: 15 });
    const result = calculateCopay(10000, rule);

    expect(result.copayAmount).toBe(1500);
  });
});

describe('applyPerActLimit', () => {
  it('should return full amount when no limit', () => {
    const result = applyPerActLimit(30000, null);

    expect(result.limitedAmount).toBe(30000);
    expect(result.appliedLimit).toBe(false);
    expect(result.perActLimit).toBeNull();
  });

  it('should return full amount when within limit', () => {
    const rule = createCoverageRule({ perActLimit: 50000 });
    const result = applyPerActLimit(30000, rule);

    expect(result.limitedAmount).toBe(30000);
    expect(result.appliedLimit).toBe(false);
    expect(result.perActLimit).toBe(50000);
  });

  it('should apply limit when amount exceeds', () => {
    const rule = createCoverageRule({ perActLimit: 25000 });
    const result = applyPerActLimit(30000, rule);

    expect(result.limitedAmount).toBe(25000);
    expect(result.appliedLimit).toBe(true);
    expect(result.warnings.some((w) => w.code === 'REDUCED_COVERAGE')).toBe(true);
    expect(result.appliedRules.some((r) => r.ruleId === 'PER_ACT_LIMIT')).toBe(true);
  });
});

describe('checkQuantityLimits', () => {
  it('should warn when pharmacy quantity exceeds standard', () => {
    const request = createRequest({ careType: 'pharmacy', quantity: 5 });
    const warnings = checkQuantityLimits(request, null);

    expect(warnings).toHaveLength(1);
    expect(warnings[0]?.code).toBe('QUANTITY_EXCEEDS_STANDARD');
    expect(warnings[0]?.details?.standard).toBe(3);
  });

  it('should not warn when quantity is within standard', () => {
    const request = createRequest({ careType: 'pharmacy', quantity: 2 });
    const warnings = checkQuantityLimits(request, null);

    expect(warnings).toHaveLength(0);
  });

  it('should apply different standards for different care types', () => {
    const labRequest = createRequest({ careType: 'lab', quantity: 6 });
    const warnings = checkQuantityLimits(labRequest, null);

    expect(warnings).toHaveLength(1);
    expect(warnings[0]?.details?.standard).toBe(5);
  });
});

describe('calculateFinalAmounts', () => {
  it('should calculate correct covered and patient amounts', () => {
    const result = calculateFinalAmounts(
      10000, // eligible
      80, // coverage rate
      0, // copay
      8000, // limited amount
      false // applied limit
    );

    expect(result.coveredAmount).toBe(8000);
    expect(result.patientAmount).toBe(2000);
  });

  it('should subtract copay from covered amount', () => {
    const result = calculateFinalAmounts(
      10000, // eligible
      80, // coverage rate
      1000, // copay
      8000, // limited amount
      false // applied limit
    );

    expect(result.coveredAmount).toBe(7000); // 8000 - 1000
    expect(result.patientAmount).toBe(3000); // 10000 - 7000
  });

  it('should apply limit when coverage exceeds limit', () => {
    const result = calculateFinalAmounts(
      100000, // eligible
      80, // coverage rate
      0, // copay
      50000, // limited amount
      true // applied limit
    );

    expect(result.coveredAmount).toBe(50000);
    expect(result.patientAmount).toBe(50000);
  });

  it('should not go negative on covered amount', () => {
    const result = calculateFinalAmounts(
      5000, // eligible
      80, // coverage rate
      10000, // copay (more than covered!)
      4000, // limited amount
      false // applied limit
    );

    expect(result.coveredAmount).toBe(0);
    expect(result.patientAmount).toBe(5000);
  });
});
