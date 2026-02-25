/**
 * Fraud Detection Rules Unit Tests
 */

import { describe, it, expect } from 'vitest';
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
import type { FraudCheckRequest, SimilarClaim, FrequencyAnalysis, AmountAnalysis, DrugIncompatibility, FraudRule } from './fraud.types';

// Test fixtures
const createRequest = (overrides: Partial<FraudCheckRequest> = {}): FraudCheckRequest => ({
  claimId: 'claim_001',
  adherentId: 'adherent_001',
  providerId: 'provider_001',
  insurerId: 'insurer_001',
  careType: 'pharmacy',
  amount: 15000,
  serviceDate: '2024-06-15',
  serviceTime: '10:30',
  drugCodes: ['MED001', 'MED002'],
  ...overrides,
});

const createFraudRule = (overrides: Partial<FraudRule> = {}): FraudRule => ({
  id: 'rule_001',
  insurerId: 'insurer_001',
  ruleCode: 'TEST_RULE',
  ruleName: 'Test Rule',
  ruleDescription: null,
  ruleType: 'frequency',
  baseScore: 30,
  thresholdValue: null,
  severity: 'medium',
  action: 'flag',
  careType: null,
  isActive: true,
  ...overrides,
});

describe('checkDuplicateClaim', () => {
  it('should detect exact duplicate (95%+ similarity)', () => {
    const request = createRequest();
    const recentClaims: SimilarClaim[] = [
      { claimId: 'claim_000', serviceDate: '2024-06-15', amount: 15000, similarity: 98 },
    ];

    const result = checkDuplicateClaim(request, recentClaims, null);

    expect(result.result.isDuplicate).toBe(true);
    expect(result.result.duplicateOf).toBe('claim_000');
    expect(result.triggeredRule).not.toBeNull();
    expect(result.triggeredRule?.ruleCode).toBe('DUPLICATE_CLAIM');
    expect(result.triggeredRule?.severity).toBe('critical');
  });

  it('should not flag as duplicate when similarity is low', () => {
    const request = createRequest();
    const recentClaims: SimilarClaim[] = [
      { claimId: 'claim_000', serviceDate: '2024-06-14', amount: 10000, similarity: 50 },
    ];

    const result = checkDuplicateClaim(request, recentClaims, null);

    expect(result.result.isDuplicate).toBe(false);
    expect(result.triggeredRule).toBeNull();
  });

  it('should include similar claims in result', () => {
    const request = createRequest();
    const recentClaims: SimilarClaim[] = [
      { claimId: 'claim_000', serviceDate: '2024-06-15', amount: 12000, similarity: 75 },
      { claimId: 'claim_001', serviceDate: '2024-06-14', amount: 15000, similarity: 80 },
    ];

    const result = checkDuplicateClaim(request, recentClaims, null);

    expect(result.result.isDuplicate).toBe(false);
    expect(result.result.similarClaims).toHaveLength(2);
  });
});

describe('checkClaimFrequency', () => {
  it('should flag high frequency claims', () => {
    const frequency: FrequencyAnalysis = {
      claimsToday: 6,
      claimsThisWeek: 10,
      claimsThisMonth: 20,
      averageMonthly: 5,
      isAnomalous: true,
    };

    const result = checkClaimFrequency(frequency, null);

    expect(result).not.toBeNull();
    expect(result?.ruleCode).toBe('HIGH_FREQUENCY');
    expect(result?.description).toContain('6 réclamations');
  });

  it('should not flag normal frequency', () => {
    const frequency: FrequencyAnalysis = {
      claimsToday: 2,
      claimsThisWeek: 5,
      claimsThisMonth: 10,
      averageMonthly: 8,
      isAnomalous: false,
    };

    const result = checkClaimFrequency(frequency, null);

    expect(result).toBeNull();
  });

  it('should use custom threshold from rule', () => {
    const frequency: FrequencyAnalysis = {
      claimsToday: 3,
      claimsThisWeek: 5,
      claimsThisMonth: 10,
      averageMonthly: 8,
      isAnomalous: false,
    };

    const rule = createFraudRule({
      ruleCode: 'HIGH_FREQUENCY',
      thresholdValue: JSON.stringify({ max_claims_per_day: 2 }),
    });

    const result = checkClaimFrequency(frequency, rule);

    expect(result).not.toBeNull();
    expect(result?.details?.threshold).toBe(2);
  });
});

describe('checkUnusualAmount', () => {
  it('should flag amounts above 3 standard deviations', () => {
    const analysis: AmountAnalysis = {
      claimAmount: 50000,
      averageAmount: 10000,
      standardDeviation: 5000,
      zScore: 8,
      isAnomalous: true,
    };

    const result = checkUnusualAmount(analysis, null);

    expect(result).not.toBeNull();
    expect(result?.ruleCode).toBe('UNUSUAL_AMOUNT');
    expect(result?.description).toContain('supérieur');
  });

  it('should flag amounts below -3 standard deviations', () => {
    const analysis: AmountAnalysis = {
      claimAmount: 1000,
      averageAmount: 20000,
      standardDeviation: 5000,
      zScore: -3.8,
      isAnomalous: true,
    };

    const result = checkUnusualAmount(analysis, null);

    expect(result).not.toBeNull();
    expect(result?.description).toContain('inférieur');
  });

  it('should not flag normal amounts', () => {
    const analysis: AmountAnalysis = {
      claimAmount: 12000,
      averageAmount: 10000,
      standardDeviation: 5000,
      zScore: 0.4,
      isAnomalous: false,
    };

    const result = checkUnusualAmount(analysis, null);

    expect(result).toBeNull();
  });
});

describe('checkOddHours', () => {
  it('should flag claims at odd hours', () => {
    const result = checkOddHours('03:30', null);

    expect(result).not.toBeNull();
    expect(result?.ruleCode).toBe('ODD_HOURS');
    expect(result?.description).toContain('03:30');
  });

  it('should not flag claims during normal hours', () => {
    const result = checkOddHours('14:00', null);

    expect(result).toBeNull();
  });

  it('should return null when no service time', () => {
    const result = checkOddHours(undefined, null);

    expect(result).toBeNull();
  });

  it('should use custom thresholds from rule', () => {
    const rule = createFraudRule({
      ruleCode: 'ODD_HOURS',
      thresholdValue: JSON.stringify({ valid_hours_start: 8, valid_hours_end: 20 }),
    });

    const result = checkOddHours('07:30', rule);

    expect(result).not.toBeNull();
    expect(result?.details?.validStart).toBe(8);
  });
});

describe('checkDrugInteractions', () => {
  it('should detect contraindicated drug pairs', () => {
    const drugCodes = ['MED001', 'MED002'];
    const incompatibilities: DrugIncompatibility[] = [
      {
        id: 'incomp_001',
        drugCode1: 'MED001',
        drugName1: 'Medicament A',
        drugCode2: 'MED002',
        drugName2: 'Medicament B',
        interactionType: 'contraindicated',
        description: 'Ne pas combiner',
        clinicalEffect: null,
        recommendation: null,
        fraudScoreImpact: 50,
        isActive: true,
      },
    ];

    const result = checkDrugInteractions(drugCodes, incompatibilities);

    expect(result).toHaveLength(1);
    expect(result[0]?.interactionType).toBe('contraindicated');
    expect(result[0]?.scoreImpact).toBe(50);
  });

  it('should detect reverse order drug pairs', () => {
    const drugCodes = ['MED002', 'MED001'];
    const incompatibilities: DrugIncompatibility[] = [
      {
        id: 'incomp_001',
        drugCode1: 'MED001',
        drugName1: 'Medicament A',
        drugCode2: 'MED002',
        drugName2: 'Medicament B',
        interactionType: 'moderate',
        description: 'Attention',
        clinicalEffect: null,
        recommendation: null,
        fraudScoreImpact: 20,
        isActive: true,
      },
    ];

    const result = checkDrugInteractions(drugCodes, incompatibilities);

    expect(result).toHaveLength(1);
  });

  it('should return empty array when no interactions', () => {
    const drugCodes = ['MED001', 'MED003'];
    const incompatibilities: DrugIncompatibility[] = [
      {
        id: 'incomp_001',
        drugCode1: 'MED001',
        drugName1: 'Medicament A',
        drugCode2: 'MED002',
        drugName2: 'Medicament B',
        interactionType: 'moderate',
        description: 'Attention',
        clinicalEffect: null,
        recommendation: null,
        fraudScoreImpact: 20,
        isActive: true,
      },
    ];

    const result = checkDrugInteractions(drugCodes, incompatibilities);

    expect(result).toHaveLength(0);
  });
});

describe('checkProviderVolume', () => {
  it('should flag high volume providers', () => {
    const result = checkProviderVolume('provider_001', 150, null);

    expect(result).not.toBeNull();
    expect(result?.ruleCode).toBe('PROVIDER_HIGH_VOLUME');
    expect(result?.details?.claimsToday).toBe(150);
  });

  it('should not flag normal volume', () => {
    const result = checkProviderVolume('provider_001', 50, null);

    expect(result).toBeNull();
  });

  it('should use custom threshold from rule', () => {
    const rule = createFraudRule({
      ruleCode: 'PROVIDER_HIGH_VOLUME',
      thresholdValue: JSON.stringify({ daily_threshold: 30 }),
    });

    const result = checkProviderVolume('provider_001', 35, rule);

    expect(result).not.toBeNull();
    expect(result?.details?.threshold).toBe(30);
  });
});

describe('calculateZScore', () => {
  it('should calculate z-score correctly', () => {
    const zScore = calculateZScore(25, 20, 5);
    expect(zScore).toBe(1);
  });

  it('should handle negative z-scores', () => {
    const zScore = calculateZScore(10, 20, 5);
    expect(zScore).toBe(-2);
  });

  it('should return 0 when stdDev is 0', () => {
    const zScore = calculateZScore(25, 20, 0);
    expect(zScore).toBe(0);
  });
});

describe('calculateClaimSimilarity', () => {
  it('should return 100 for identical claims', () => {
    const claim1 = {
      providerId: 'provider_001',
      serviceDate: '2024-06-15',
      amount: 15000,
      careType: 'pharmacy',
    };

    const similarity = calculateClaimSimilarity(claim1, claim1);

    expect(similarity).toBe(100);
  });

  it('should return high similarity for same provider and date', () => {
    const claim1 = {
      providerId: 'provider_001',
      serviceDate: '2024-06-15',
      amount: 15000,
      careType: 'pharmacy',
    };
    const claim2 = {
      providerId: 'provider_001',
      serviceDate: '2024-06-15',
      amount: 12000,
      careType: 'pharmacy',
    };

    const similarity = calculateClaimSimilarity(claim1, claim2);

    expect(similarity).toBeGreaterThanOrEqual(80);
  });

  it('should return low similarity for different claims', () => {
    const claim1 = {
      providerId: 'provider_001',
      serviceDate: '2024-06-15',
      amount: 15000,
      careType: 'pharmacy',
    };
    const claim2 = {
      providerId: 'provider_002',
      serviceDate: '2024-06-10',
      amount: 50000,
      careType: 'consultation',
    };

    const similarity = calculateClaimSimilarity(claim1, claim2);

    expect(similarity).toBeLessThan(30);
  });
});

describe('calculateFinalScore', () => {
  it('should sum rule impacts', () => {
    const triggeredRules = [
      { ruleId: '1', ruleCode: 'R1', ruleName: 'R1', severity: 'medium' as const, scoreImpact: 30, description: '' },
      { ruleId: '2', ruleCode: 'R2', ruleName: 'R2', severity: 'low' as const, scoreImpact: 20, description: '' },
    ];

    const score = calculateFinalScore(triggeredRules, []);

    expect(score).toBe(50);
  });

  it('should include drug interaction impacts', () => {
    const triggeredRules = [
      { ruleId: '1', ruleCode: 'R1', ruleName: 'R1', severity: 'medium' as const, scoreImpact: 30, description: '' },
    ];
    const drugInteractions = [
      {
        drug1Code: 'MED1',
        drug1Name: 'Med 1',
        drug2Code: 'MED2',
        drug2Name: 'Med 2',
        interactionType: 'moderate' as const,
        description: '',
        scoreImpact: 15,
      },
    ];

    const score = calculateFinalScore(triggeredRules, drugInteractions);

    expect(score).toBe(45);
  });

  it('should cap score at 100', () => {
    const triggeredRules = [
      { ruleId: '1', ruleCode: 'R1', ruleName: 'R1', severity: 'critical' as const, scoreImpact: 80, description: '' },
      { ruleId: '2', ruleCode: 'R2', ruleName: 'R2', severity: 'high' as const, scoreImpact: 50, description: '' },
    ];

    const score = calculateFinalScore(triggeredRules, []);

    expect(score).toBe(100);
  });
});
