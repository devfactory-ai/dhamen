/**
 * Eligibility Rules Unit Tests
 */

import { describe, it, expect } from 'vitest';
import {
  checkContractValidity,
  checkWaitingPeriod,
  checkCareTypeCoverage,
  checkAmountLimits,
  checkProviderNetwork,
  checkAgeRestriction,
  evaluateEligibility,
} from './eligibility.rules';
import type { Contract, CoverageRule, Adherent, Provider } from './eligibility.types';

// Test fixtures
const createContract = (overrides: Partial<Contract> = {}): Contract => ({
  id: 'contract_001',
  insurerId: 'insurer_001',
  adherentId: 'adherent_001',
  contractNumber: 'CNT-2024-001',
  planType: 'individual',
  startDate: '2024-01-01',
  endDate: '2024-12-31',
  carenceDays: 30,
  annualLimit: 5000000, // 5000 TND
  coverageJson: '{}',
  exclusionsJson: '{}',
  status: 'active',
  ...overrides,
});

const createCoverageRule = (overrides: Partial<CoverageRule> = {}): CoverageRule => ({
  id: 'rule_001',
  insurerId: 'insurer_001',
  careType: 'pharmacy',
  planType: 'individual',
  isCovered: true,
  requiresPriorAuth: false,
  annualLimit: 2000000, // 2000 TND
  perActLimit: 100000, // 100 TND
  perDayLimit: 3,
  perMonthLimit: null,
  waitingDays: 0,
  copayType: 'percentage',
  copayValue: 20,
  networkOnly: false,
  minAge: null,
  maxAge: null,
  effectiveFrom: '2024-01-01',
  effectiveTo: null,
  isActive: true,
  ...overrides,
});

const createAdherent = (overrides: Partial<Adherent> = {}): Adherent => ({
  id: 'adherent_001',
  insurerId: 'insurer_001',
  nationalId: '12345678',
  firstName: 'Mohamed',
  lastName: 'Ben Ali',
  dateOfBirth: '1985-06-15',
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

describe('checkContractValidity', () => {
  it('should return CONTRACT_NOT_FOUND when contract is null', () => {
    const reasons = checkContractValidity(null, '2024-06-15');
    expect(reasons).toHaveLength(1);
    expect(reasons[0]?.code).toBe('CONTRACT_NOT_FOUND');
    expect(reasons[0]?.severity).toBe('error');
  });

  it('should return CONTRACT_EXPIRED for expired contract', () => {
    const contract = createContract({ status: 'expired' });
    const reasons = checkContractValidity(contract, '2024-06-15');
    expect(reasons).toHaveLength(1);
    expect(reasons[0]?.code).toBe('CONTRACT_EXPIRED');
    expect(reasons[0]?.severity).toBe('error');
  });

  it('should return CONTRACT_SUSPENDED for suspended contract', () => {
    const contract = createContract({ status: 'suspended' });
    const reasons = checkContractValidity(contract, '2024-06-15');
    expect(reasons).toHaveLength(1);
    expect(reasons[0]?.code).toBe('CONTRACT_SUSPENDED');
    expect(reasons[0]?.severity).toBe('error');
  });

  it('should return CONTRACT_CANCELLED for cancelled contract', () => {
    const contract = createContract({ status: 'cancelled' });
    const reasons = checkContractValidity(contract, '2024-06-15');
    expect(reasons).toHaveLength(1);
    expect(reasons[0]?.code).toBe('CONTRACT_CANCELLED');
    expect(reasons[0]?.severity).toBe('error');
  });

  it('should return CONTRACT_VALID for active contract within date range', () => {
    const contract = createContract();
    const reasons = checkContractValidity(contract, '2024-06-15');
    expect(reasons).toHaveLength(1);
    expect(reasons[0]?.code).toBe('CONTRACT_VALID');
    expect(reasons[0]?.severity).toBe('info');
  });

  it('should return error when service date is before contract start', () => {
    const contract = createContract({ startDate: '2024-03-01' });
    const reasons = checkContractValidity(contract, '2024-02-15');
    expect(reasons).toHaveLength(1);
    expect(reasons[0]?.code).toBe('CONTRACT_NOT_FOUND');
    expect(reasons[0]?.details?.startDate).toBe('2024-03-01');
  });

  it('should return error when service date is after contract end', () => {
    const contract = createContract({ endDate: '2024-06-30' });
    const reasons = checkContractValidity(contract, '2024-07-15');
    expect(reasons).toHaveLength(1);
    expect(reasons[0]?.code).toBe('CONTRACT_EXPIRED');
    expect(reasons[0]?.details?.endDate).toBe('2024-06-30');
  });
});

describe('checkWaitingPeriod', () => {
  it('should return no reasons when no waiting period', () => {
    const contract = createContract({ carenceDays: 0 });
    const rule = createCoverageRule({ waitingDays: 0 });
    const reasons = checkWaitingPeriod(contract, rule, '2024-01-15');
    expect(reasons).toHaveLength(0);
  });

  it('should return WAITING_PERIOD when carence not passed', () => {
    const contract = createContract({ carenceDays: 30, startDate: '2024-06-01' });
    const reasons = checkWaitingPeriod(contract, null, '2024-06-15');
    expect(reasons).toHaveLength(1);
    expect(reasons[0]?.code).toBe('WAITING_PERIOD');
    expect(reasons[0]?.severity).toBe('error');
    expect(reasons[0]?.details?.waitingDays).toBe(30);
  });

  it('should return no reasons when carence has passed', () => {
    const contract = createContract({ carenceDays: 30, startDate: '2024-01-01' });
    const reasons = checkWaitingPeriod(contract, null, '2024-06-15');
    expect(reasons).toHaveLength(0);
  });

  it('should use rule-specific waiting days over contract carence', () => {
    const contract = createContract({ carenceDays: 30, startDate: '2024-06-01' });
    const rule = createCoverageRule({ waitingDays: 60 });
    const reasons = checkWaitingPeriod(contract, rule, '2024-07-15');
    expect(reasons).toHaveLength(1);
    expect(reasons[0]?.details?.waitingDays).toBe(60);
  });
});

describe('checkCareTypeCoverage', () => {
  it('should return CARE_NOT_COVERED when rule is null', () => {
    const reasons = checkCareTypeCoverage(null, 'pharmacy');
    expect(reasons).toHaveLength(1);
    expect(reasons[0]?.code).toBe('CARE_NOT_COVERED');
    expect(reasons[0]?.severity).toBe('error');
  });

  it('should return CARE_NOT_COVERED when care type is excluded', () => {
    const rule = createCoverageRule({ isCovered: false });
    const reasons = checkCareTypeCoverage(rule, 'pharmacy');
    expect(reasons).toHaveLength(1);
    expect(reasons[0]?.code).toBe('CARE_NOT_COVERED');
    expect(reasons[0]?.message).toContain('exclu');
  });

  it('should return no errors when care type is covered', () => {
    const rule = createCoverageRule({ isCovered: true, requiresPriorAuth: false });
    const reasons = checkCareTypeCoverage(rule, 'pharmacy');
    expect(reasons).toHaveLength(0);
  });

  it('should return PRIOR_AUTH_REQUIRED warning when prior auth needed', () => {
    const rule = createCoverageRule({ isCovered: true, requiresPriorAuth: true });
    const reasons = checkCareTypeCoverage(rule, 'hospitalization');
    expect(reasons).toHaveLength(1);
    expect(reasons[0]?.code).toBe('PRIOR_AUTH_REQUIRED');
    expect(reasons[0]?.severity).toBe('warning');
  });
});

describe('checkAmountLimits', () => {
  const defaultUsedAmounts = { annual: 0, daily: 0, monthly: 0, actCount: 0 };

  it('should return no reasons when rule is null', () => {
    const reasons = checkAmountLimits(null, 50000, defaultUsedAmounts);
    expect(reasons).toHaveLength(0);
  });

  it('should return PER_ACT_LIMIT_EXCEEDED when amount exceeds per-act limit', () => {
    const rule = createCoverageRule({ perActLimit: 50000 });
    const reasons = checkAmountLimits(rule, 75000, defaultUsedAmounts);
    const limitReason = reasons.find((r) => r.code === 'PER_ACT_LIMIT_EXCEEDED');
    expect(limitReason).toBeDefined();
    expect(limitReason?.details?.requested).toBe(75000);
    expect(limitReason?.details?.limit).toBe(50000);
  });

  it('should return ANNUAL_LIMIT_EXCEEDED when annual limit would be exceeded', () => {
    const rule = createCoverageRule({ annualLimit: 1000000 });
    const usedAmounts = { ...defaultUsedAmounts, annual: 900000 };
    const reasons = checkAmountLimits(rule, 200000, usedAmounts);
    const limitReason = reasons.find((r) => r.code === 'ANNUAL_LIMIT_EXCEEDED');
    expect(limitReason).toBeDefined();
    expect(limitReason?.details?.remaining).toBe(100000);
  });

  it('should return DAILY_LIMIT_EXCEEDED when daily act count reached', () => {
    const rule = createCoverageRule({ perDayLimit: 3 });
    const usedAmounts = { ...defaultUsedAmounts, actCount: 3 };
    const reasons = checkAmountLimits(rule, 50000, usedAmounts);
    const limitReason = reasons.find((r) => r.code === 'DAILY_LIMIT_EXCEEDED');
    expect(limitReason).toBeDefined();
  });

  it('should allow amount within all limits', () => {
    const rule = createCoverageRule({
      perActLimit: 100000,
      annualLimit: 2000000,
      perDayLimit: 5,
      perMonthLimit: null,
    });
    const usedAmounts = { annual: 500000, daily: 50000, monthly: 200000, actCount: 2 };
    const reasons = checkAmountLimits(rule, 50000, usedAmounts);
    // Only MONTHLY_LIMIT_EXCEEDED info should be returned (if perMonthLimit is set)
    expect(reasons.filter((r) => r.severity === 'error')).toHaveLength(0);
  });
});

describe('checkProviderNetwork', () => {
  it('should return PROVIDER_NOT_IN_NETWORK when provider is null', () => {
    const reasons = checkProviderNetwork(null, null);
    expect(reasons).toHaveLength(1);
    expect(reasons[0]?.code).toBe('PROVIDER_NOT_IN_NETWORK');
  });

  it('should return PROVIDER_NOT_IN_NETWORK when provider is inactive', () => {
    const provider = createProvider({ isActive: false });
    const reasons = checkProviderNetwork(null, provider);
    expect(reasons).toHaveLength(1);
    expect(reasons[0]?.code).toBe('PROVIDER_NOT_IN_NETWORK');
    expect(reasons[0]?.message).toContain('inactif');
  });

  it('should return PROVIDER_NOT_IN_NETWORK when network only and not in network', () => {
    const rule = createCoverageRule({ networkOnly: true });
    const provider = createProvider({ isNetworkProvider: false });
    const reasons = checkProviderNetwork(rule, provider);
    expect(reasons).toHaveLength(1);
    expect(reasons[0]?.code).toBe('PROVIDER_NOT_IN_NETWORK');
    expect(reasons[0]?.message).toContain('reseau');
  });

  it('should return no reasons when provider is in network', () => {
    const rule = createCoverageRule({ networkOnly: true });
    const provider = createProvider({ isNetworkProvider: true });
    const reasons = checkProviderNetwork(rule, provider);
    expect(reasons).toHaveLength(0);
  });

  it('should return no reasons when network not required', () => {
    const rule = createCoverageRule({ networkOnly: false });
    const provider = createProvider({ isNetworkProvider: false });
    const reasons = checkProviderNetwork(rule, provider);
    expect(reasons).toHaveLength(0);
  });
});

describe('checkAgeRestriction', () => {
  it('should return no reasons when no adherent', () => {
    const rule = createCoverageRule({ minAge: 18 });
    const reasons = checkAgeRestriction(rule, null, '2024-06-15');
    expect(reasons).toHaveLength(0);
  });

  it('should return no reasons when no rule', () => {
    const adherent = createAdherent();
    const reasons = checkAgeRestriction(null, adherent, '2024-06-15');
    expect(reasons).toHaveLength(0);
  });

  it('should return AGE_RESTRICTION when under minimum age', () => {
    const rule = createCoverageRule({ minAge: 18 });
    const adherent = createAdherent({ dateOfBirth: '2010-06-15' }); // 14 years old
    const reasons = checkAgeRestriction(rule, adherent, '2024-06-15');
    expect(reasons).toHaveLength(1);
    expect(reasons[0]?.code).toBe('AGE_RESTRICTION');
    expect(reasons[0]?.details?.currentAge).toBe(14);
    expect(reasons[0]?.details?.minAge).toBe(18);
  });

  it('should return AGE_RESTRICTION when over maximum age', () => {
    const rule = createCoverageRule({ maxAge: 65 });
    const adherent = createAdherent({ dateOfBirth: '1955-01-01' }); // 69 years old
    const reasons = checkAgeRestriction(rule, adherent, '2024-06-15');
    expect(reasons).toHaveLength(1);
    expect(reasons[0]?.code).toBe('AGE_RESTRICTION');
    expect(reasons[0]?.details?.currentAge).toBe(69);
    expect(reasons[0]?.details?.maxAge).toBe(65);
  });

  it('should return no reasons when age is within range', () => {
    const rule = createCoverageRule({ minAge: 18, maxAge: 65 });
    const adherent = createAdherent({ dateOfBirth: '1985-06-15' }); // 39 years old
    const reasons = checkAgeRestriction(rule, adherent, '2024-06-15');
    expect(reasons).toHaveLength(0);
  });

  it('should calculate age correctly at boundary', () => {
    const rule = createCoverageRule({ minAge: 18 });
    // Born June 16, 2006 - on June 15, 2024 they are still 17
    const adherent = createAdherent({ dateOfBirth: '2006-06-16' });
    const reasons = checkAgeRestriction(rule, adherent, '2024-06-15');
    expect(reasons).toHaveLength(1);
    expect(reasons[0]?.details?.currentAge).toBe(17);
  });
});

describe('evaluateEligibility', () => {
  it('should return eligible with 100% confidence when no errors or warnings', () => {
    const reasons = [
      { code: 'CONTRACT_VALID' as const, message: 'Contrat valide', severity: 'info' as const },
    ];
    const result = evaluateEligibility(reasons);
    expect(result.eligible).toBe(true);
    expect(result.confidence).toBe(100);
  });

  it('should return not eligible with 0% confidence when errors present', () => {
    const reasons = [
      { code: 'CONTRACT_EXPIRED' as const, message: 'Contrat expire', severity: 'error' as const },
    ];
    const result = evaluateEligibility(reasons);
    expect(result.eligible).toBe(false);
    expect(result.confidence).toBe(0);
  });

  it('should return eligible with 80% confidence when warnings present', () => {
    const reasons = [
      { code: 'CONTRACT_VALID' as const, message: 'Contrat valide', severity: 'info' as const },
      { code: 'PRIOR_AUTH_REQUIRED' as const, message: 'Auth requise', severity: 'warning' as const },
    ];
    const result = evaluateEligibility(reasons);
    expect(result.eligible).toBe(true);
    expect(result.confidence).toBe(80);
  });

  it('should return not eligible when mix of errors and warnings', () => {
    const reasons = [
      { code: 'CONTRACT_VALID' as const, message: 'Contrat valide', severity: 'info' as const },
      { code: 'ANNUAL_LIMIT_EXCEEDED' as const, message: 'Limite atteinte', severity: 'error' as const },
      { code: 'PRIOR_AUTH_REQUIRED' as const, message: 'Auth requise', severity: 'warning' as const },
    ];
    const result = evaluateEligibility(reasons);
    expect(result.eligible).toBe(false);
    expect(result.confidence).toBe(0);
  });
});
