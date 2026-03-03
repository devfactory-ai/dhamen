/**
 * Eligibility Agent Tests
 *
 * Tests for eligibility checking, caching, and coverage determination
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { checkEligibility, checkEligibilityBatch } from './eligibility.agent';
import type { EligibilityCheckRequest, CareType } from './eligibility.types';

// Mock D1 Database
function createMockDB() {
  const mockFirst = vi.fn().mockResolvedValue(null);
  const mockAll = vi.fn().mockResolvedValue({ results: [] });

  const mockBind = vi.fn(() => ({
    first: mockFirst,
    all: mockAll,
    bind: mockBind,
  }));

  return {
    prepare: vi.fn(() => ({
      bind: mockBind,
      first: mockFirst,
      all: mockAll,
    })),
    _mocks: { first: mockFirst, all: mockAll, bind: mockBind },
  };
}

// Mock KV Cache
function createMockCache() {
  return {
    get: vi.fn().mockResolvedValue(null),
    put: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(undefined),
  };
}

function createMockContext() {
  const mockDB = createMockDB();
  const mockCache = createMockCache();
  return {
    env: {
      DB: mockDB,
      CACHE: mockCache,
    },
    _mocks: {
      db: mockDB._mocks,
      cache: mockCache,
    },
  } as any;
}

describe('Eligibility Agent', () => {
  let mockContext: ReturnType<typeof createMockContext>;

  beforeEach(() => {
    mockContext = createMockContext();
  });

  describe('checkEligibility', () => {
    it('should return cached result if available', async () => {
      const cachedResult = {
        eligible: true,
        contractId: 'contract_001',
        reasons: [{ code: 'ELIGIBLE', message: 'Eligible', severity: 'info' }],
        coverageDetails: {
          planType: 'premium',
          coveragePercentage: 80,
          maxCoveredAmount: 1000000,
        },
        confidence: 1,
        checkTime: 5,
        cachedResult: false,
      };

      mockContext._mocks.cache.get.mockResolvedValueOnce(cachedResult);

      const request: EligibilityCheckRequest = {
        adherentId: 'adh_001',
        providerId: 'prov_001',
        insurerId: 'ins_001',
        careType: 'pharmacy',
        amount: 50000,
        serviceDate: '2024-01-15',
      };

      const result = await checkEligibility(mockContext, request);

      expect(result.cachedResult).toBe(true);
      expect(result.eligible).toBe(true);
      expect(mockContext._mocks.cache.get).toHaveBeenCalled();
    });

    it('should return not eligible when no active contract', async () => {
      // No contract found
      mockContext._mocks.db.first
        .mockResolvedValueOnce(null) // contract
        .mockResolvedValueOnce(null) // coverage rule
        .mockResolvedValueOnce(null) // adherent
        .mockResolvedValueOnce(null) // provider
        .mockResolvedValueOnce({ total: 0 }); // annual used

      const request: EligibilityCheckRequest = {
        adherentId: 'adh_001',
        providerId: 'prov_001',
        insurerId: 'ins_001',
        careType: 'pharmacy',
        amount: 50000,
        serviceDate: '2024-01-15',
      };

      const result = await checkEligibility(mockContext, request);

      expect(result.eligible).toBe(false);
      expect(result.reasons.some((r) => r.code === 'CONTRACT_NOT_FOUND')).toBe(true);
    });

    it('should return eligible when all checks pass', async () => {
      // Active contract
      mockContext._mocks.db.first
        .mockResolvedValueOnce({
          id: 'contract_001',
          insurerId: 'ins_001',
          adherentId: 'adh_001',
          contractNumber: 'CTR-001',
          planType: 'premium',
          startDate: '2023-01-01',
          endDate: '2024-12-31',
          carenceDays: 30,
          annualLimit: 5000000,
          status: 'active',
        })
        .mockResolvedValueOnce({
          // coverage rule
          id: 'rule_001',
          insurerId: 'ins_001',
          careType: 'pharmacy',
          planType: 'premium',
          isCovered: 1,
          requiresPriorAuth: 0,
          annualLimit: 2000000,
          perActLimit: 100000,
          waitingDays: 0,
          copayType: 'percentage',
          copayValue: 20,
          networkOnly: 0,
          isActive: 1,
        })
        .mockResolvedValueOnce({
          // adherent
          id: 'adh_001',
          insurerId: 'ins_001',
          nationalId: '12345678',
          firstName: 'Mohamed',
          lastName: 'Ben Ali',
          dateOfBirth: '1980-05-15',
          isActive: 1,
        })
        .mockResolvedValueOnce({
          // provider
          id: 'prov_001',
          name: 'Pharmacie Centrale',
          type: 'pharmacy',
          isActive: 1,
          isNetworkProvider: 1,
        })
        .mockResolvedValueOnce({ total: 500000 }) // annual used
        .mockResolvedValueOnce({ count: 0, total: 0 }) // daily
        .mockResolvedValueOnce({ total: 100000 }); // monthly

      const request: EligibilityCheckRequest = {
        adherentId: 'adh_001',
        providerId: 'prov_001',
        insurerId: 'ins_001',
        careType: 'pharmacy',
        amount: 50000,
        serviceDate: '2024-01-15',
      };

      const result = await checkEligibility(mockContext, request);

      expect(result.eligible).toBe(true);
      expect(result.contractId).toBe('contract_001');
      expect(result.coverageDetails).toBeDefined();
    });

    it('should return not eligible when contract expired', async () => {
      // Expired contract
      mockContext._mocks.db.first
        .mockResolvedValueOnce({
          id: 'contract_001',
          insurerId: 'ins_001',
          adherentId: 'adh_001',
          contractNumber: 'CTR-001',
          planType: 'basic',
          startDate: '2022-01-01',
          endDate: '2023-12-31', // Expired
          status: 'active',
        })
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ total: 0 });

      const request: EligibilityCheckRequest = {
        adherentId: 'adh_001',
        providerId: 'prov_001',
        insurerId: 'ins_001',
        careType: 'pharmacy',
        amount: 50000,
        serviceDate: '2024-01-15', // After contract end
      };

      const result = await checkEligibility(mockContext, request);

      expect(result.eligible).toBe(false);
      expect(result.reasons.some((r) => r.code === 'CONTRACT_EXPIRED')).toBe(true);
    });

    it('should return not eligible when in waiting period', async () => {
      // Contract with waiting period
      mockContext._mocks.db.first
        .mockResolvedValueOnce({
          id: 'contract_001',
          insurerId: 'ins_001',
          adherentId: 'adh_001',
          contractNumber: 'CTR-001',
          planType: 'basic',
          startDate: '2024-01-01', // Just started
          endDate: '2024-12-31',
          carenceDays: 90, // 90 day waiting period
          status: 'active',
        })
        .mockResolvedValueOnce({
          id: 'rule_001',
          careType: 'hospitalization',
          waitingDays: 90,
          isCovered: 1,
          isActive: 1,
        })
        .mockResolvedValueOnce({
          id: 'adh_001',
          dateOfBirth: '1980-05-15',
          isActive: 1,
        })
        .mockResolvedValueOnce({
          id: 'prov_001',
          isActive: 1,
          isNetworkProvider: 1,
        })
        .mockResolvedValueOnce({ total: 0 })
        .mockResolvedValueOnce({ count: 0, total: 0 })
        .mockResolvedValueOnce({ total: 0 });

      const request: EligibilityCheckRequest = {
        adherentId: 'adh_001',
        providerId: 'prov_001',
        insurerId: 'ins_001',
        careType: 'hospitalization',
        amount: 500000,
        serviceDate: '2024-01-15', // Only 15 days after contract start
      };

      const result = await checkEligibility(mockContext, request);

      expect(result.eligible).toBe(false);
      expect(result.reasons.some((r) => r.code === 'WAITING_PERIOD')).toBe(true);
    });

    it('should return not eligible when care type not covered', async () => {
      mockContext._mocks.db.first
        .mockResolvedValueOnce({
          id: 'contract_001',
          insurerId: 'ins_001',
          adherentId: 'adh_001',
          contractNumber: 'CTR-001',
          planType: 'basic',
          startDate: '2023-01-01',
          endDate: '2024-12-31',
          status: 'active',
        })
        .mockResolvedValueOnce({
          id: 'rule_001',
          careType: 'optical',
          isCovered: 0, // Not covered
          isActive: 1,
        })
        .mockResolvedValueOnce({
          id: 'adh_001',
          dateOfBirth: '1980-05-15',
          isActive: 1,
        })
        .mockResolvedValueOnce({
          id: 'prov_001',
          isActive: 1,
          isNetworkProvider: 1,
        })
        .mockResolvedValueOnce({ total: 0 })
        .mockResolvedValueOnce({ count: 0, total: 0 })
        .mockResolvedValueOnce({ total: 0 });

      const request: EligibilityCheckRequest = {
        adherentId: 'adh_001',
        providerId: 'prov_001',
        insurerId: 'ins_001',
        careType: 'optical',
        amount: 50000,
        serviceDate: '2024-01-15',
      };

      const result = await checkEligibility(mockContext, request);

      expect(result.eligible).toBe(false);
      expect(result.reasons.some((r) => r.code === 'CARE_NOT_COVERED')).toBe(true);
    });

    it('should return not eligible when annual limit exceeded', async () => {
      mockContext._mocks.db.first
        .mockResolvedValueOnce({
          id: 'contract_001',
          insurerId: 'ins_001',
          adherentId: 'adh_001',
          planType: 'basic',
          startDate: '2023-01-01',
          endDate: '2024-12-31',
          annualLimit: 1000000,
          status: 'active',
        })
        .mockResolvedValueOnce({
          id: 'rule_001',
          careType: 'pharmacy',
          annualLimit: 1000000,
          isCovered: 1,
          isActive: 1,
        })
        .mockResolvedValueOnce({
          id: 'adh_001',
          dateOfBirth: '1980-05-15',
          isActive: 1,
        })
        .mockResolvedValueOnce({
          id: 'prov_001',
          isActive: 1,
          isNetworkProvider: 1,
        })
        .mockResolvedValueOnce({ total: 950000 }) // Already used 950K of 1M limit
        .mockResolvedValueOnce({ count: 0, total: 0 })
        .mockResolvedValueOnce({ total: 100000 });

      const request: EligibilityCheckRequest = {
        adherentId: 'adh_001',
        providerId: 'prov_001',
        insurerId: 'ins_001',
        careType: 'pharmacy',
        amount: 100000, // Would exceed limit
        serviceDate: '2024-01-15',
      };

      const result = await checkEligibility(mockContext, request);

      expect(result.eligible).toBe(false);
      expect(result.reasons.some((r) => r.code === 'ANNUAL_LIMIT_EXCEEDED')).toBe(true);
    });

    it('should return not eligible when provider not in network', async () => {
      mockContext._mocks.db.first
        .mockResolvedValueOnce({
          id: 'contract_001',
          insurerId: 'ins_001',
          adherentId: 'adh_001',
          planType: 'network',
          startDate: '2023-01-01',
          endDate: '2024-12-31',
          status: 'active',
        })
        .mockResolvedValueOnce({
          id: 'rule_001',
          careType: 'pharmacy',
          networkOnly: 1, // Network only
          isCovered: 1,
          isActive: 1,
        })
        .mockResolvedValueOnce({
          id: 'adh_001',
          dateOfBirth: '1980-05-15',
          isActive: 1,
        })
        .mockResolvedValueOnce({
          id: 'prov_001',
          isActive: 1,
          isNetworkProvider: 0, // NOT in network
        })
        .mockResolvedValueOnce({ total: 0 })
        .mockResolvedValueOnce({ count: 0, total: 0 })
        .mockResolvedValueOnce({ total: 0 });

      const request: EligibilityCheckRequest = {
        adherentId: 'adh_001',
        providerId: 'prov_001',
        insurerId: 'ins_001',
        careType: 'pharmacy',
        amount: 50000,
        serviceDate: '2024-01-15',
      };

      const result = await checkEligibility(mockContext, request);

      expect(result.eligible).toBe(false);
      expect(result.reasons.some((r) => r.code === 'PROVIDER_NOT_IN_NETWORK')).toBe(true);
    });

    it('should cache the result after checking', async () => {
      mockContext._mocks.db.first
        .mockResolvedValueOnce({
          id: 'contract_001',
          startDate: '2023-01-01',
          endDate: '2024-12-31',
          planType: 'basic',
          status: 'active',
        })
        .mockResolvedValueOnce({
          id: 'rule_001',
          careType: 'pharmacy',
          isCovered: 1,
          isActive: 1,
        })
        .mockResolvedValueOnce({ id: 'adh_001', dateOfBirth: '1980-05-15', isActive: 1 })
        .mockResolvedValueOnce({ id: 'prov_001', isActive: 1, isNetworkProvider: 1 })
        .mockResolvedValueOnce({ total: 0 })
        .mockResolvedValueOnce({ count: 0, total: 0 })
        .mockResolvedValueOnce({ total: 0 });

      const request: EligibilityCheckRequest = {
        adherentId: 'adh_001',
        providerId: 'prov_001',
        insurerId: 'ins_001',
        careType: 'pharmacy',
        amount: 50000,
        serviceDate: '2024-01-15',
      };

      await checkEligibility(mockContext, request);

      expect(mockContext._mocks.cache.put).toHaveBeenCalled();
    });

    it('should include coverage details when eligible', async () => {
      mockContext._mocks.db.first
        .mockResolvedValueOnce({
          id: 'contract_001',
          insurerId: 'ins_001',
          adherentId: 'adh_001',
          planType: 'premium',
          startDate: '2023-01-01',
          endDate: '2024-12-31',
          status: 'active',
        })
        .mockResolvedValueOnce({
          id: 'rule_001',
          careType: 'pharmacy',
          planType: 'premium',
          isCovered: 1,
          annualLimit: 2000000,
          perActLimit: 100000,
          copayType: 'percentage',
          copayValue: 20,
          isActive: 1,
        })
        .mockResolvedValueOnce({
          id: 'adh_001',
          dateOfBirth: '1980-05-15',
          isActive: 1,
        })
        .mockResolvedValueOnce({
          id: 'prov_001',
          isActive: 1,
          isNetworkProvider: 1,
        })
        .mockResolvedValueOnce({ total: 500000 })
        .mockResolvedValueOnce({ count: 0, total: 0 })
        .mockResolvedValueOnce({ total: 100000 });

      const request: EligibilityCheckRequest = {
        adherentId: 'adh_001',
        providerId: 'prov_001',
        insurerId: 'ins_001',
        careType: 'pharmacy',
        amount: 50000,
        serviceDate: '2024-01-15',
      };

      const result = await checkEligibility(mockContext, request);

      expect(result.eligible).toBe(true);
      expect(result.coverageDetails).toBeDefined();
      expect(result.coverageDetails?.planType).toBe('premium');
      expect(result.coverageDetails?.coveragePercentage).toBe(80); // 100 - 20% copay
      expect(result.coverageDetails?.maxCoveredAmount).toBe(100000);
      expect(result.coverageDetails?.remainingAnnualLimit).toBe(1500000); // 2M - 500K used
    });

    it('should track check time', async () => {
      mockContext._mocks.db.first
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ total: 0 });

      const request: EligibilityCheckRequest = {
        adherentId: 'adh_001',
        providerId: 'prov_001',
        insurerId: 'ins_001',
        careType: 'pharmacy',
        amount: 50000,
        serviceDate: '2024-01-15',
      };

      const result = await checkEligibility(mockContext, request);

      expect(result.checkTime).toBeDefined();
      expect(result.checkTime).toBeGreaterThanOrEqual(0);
    });
  });

  describe('checkEligibilityBatch', () => {
    it('should process multiple requests in batch', async () => {
      // Setup mocks for each request
      for (let i = 0; i < 2; i++) {
        mockContext._mocks.db.first
          .mockResolvedValueOnce({
            id: `contract_${i}`,
            startDate: '2023-01-01',
            endDate: '2024-12-31',
            planType: 'basic',
            status: 'active',
          })
          .mockResolvedValueOnce({
            id: `rule_${i}`,
            careType: 'pharmacy',
            isCovered: 1,
            isActive: 1,
          })
          .mockResolvedValueOnce({ id: `adh_${i}`, dateOfBirth: '1980-05-15', isActive: 1 })
          .mockResolvedValueOnce({ id: `prov_${i}`, isActive: 1, isNetworkProvider: 1 })
          .mockResolvedValueOnce({ total: 0 })
          .mockResolvedValueOnce({ count: 0, total: 0 })
          .mockResolvedValueOnce({ total: 0 });
      }

      const requests: EligibilityCheckRequest[] = [
        {
          adherentId: 'adh_001',
          providerId: 'prov_001',
          insurerId: 'ins_001',
          careType: 'pharmacy',
          amount: 30000,
          serviceDate: '2024-01-15',
        },
        {
          adherentId: 'adh_002',
          providerId: 'prov_002',
          insurerId: 'ins_001',
          careType: 'pharmacy',
          amount: 45000,
          serviceDate: '2024-01-15',
        },
      ];

      const results = await checkEligibilityBatch(mockContext, requests);

      expect(results).toHaveLength(2);
      results.forEach((result) => {
        expect(result.checkTime).toBeDefined();
      });
    });

    it('should handle empty batch', async () => {
      const results = await checkEligibilityBatch(mockContext, []);
      expect(results).toHaveLength(0);
    });
  });

  describe('Care Type Coverage', () => {
    const careTypes: CareType[] = ['pharmacy', 'consultation', 'hospitalization', 'optical', 'dental', 'lab'];

    for (const careType of careTypes) {
      it(`should check eligibility for ${careType}`, async () => {
        mockContext._mocks.db.first
          .mockResolvedValueOnce({
            id: 'contract_001',
            startDate: '2023-01-01',
            endDate: '2024-12-31',
            planType: 'basic',
            status: 'active',
          })
          .mockResolvedValueOnce({
            id: 'rule_001',
            careType,
            isCovered: 1,
            isActive: 1,
          })
          .mockResolvedValueOnce({ id: 'adh_001', dateOfBirth: '1980-05-15', isActive: 1 })
          .mockResolvedValueOnce({ id: 'prov_001', isActive: 1, isNetworkProvider: 1 })
          .mockResolvedValueOnce({ total: 0 })
          .mockResolvedValueOnce({ count: 0, total: 0 })
          .mockResolvedValueOnce({ total: 0 });

        const request: EligibilityCheckRequest = {
          adherentId: 'adh_001',
          providerId: 'prov_001',
          insurerId: 'ins_001',
          careType,
          amount: 50000,
          serviceDate: '2024-01-15',
        };

        const result = await checkEligibility(mockContext, request);

        expect(result.checkTime).toBeDefined();
      });
    }
  });

  describe('Age Restriction', () => {
    it('should check age restriction if defined', async () => {
      mockContext._mocks.db.first
        .mockResolvedValueOnce({
          id: 'contract_001',
          startDate: '2023-01-01',
          endDate: '2024-12-31',
          planType: 'basic',
          status: 'active',
        })
        .mockResolvedValueOnce({
          id: 'rule_001',
          careType: 'consultation',
          isCovered: 1,
          minAge: 0,
          maxAge: 18, // Children only
          isActive: 1,
        })
        .mockResolvedValueOnce({
          id: 'adh_001',
          dateOfBirth: '1980-05-15', // 43 years old in 2024
          isActive: 1,
        })
        .mockResolvedValueOnce({ id: 'prov_001', isActive: 1, isNetworkProvider: 1 })
        .mockResolvedValueOnce({ total: 0 })
        .mockResolvedValueOnce({ count: 0, total: 0 })
        .mockResolvedValueOnce({ total: 0 });

      const request: EligibilityCheckRequest = {
        adherentId: 'adh_001',
        providerId: 'prov_001',
        insurerId: 'ins_001',
        careType: 'consultation',
        amount: 50000,
        serviceDate: '2024-01-15',
      };

      const result = await checkEligibility(mockContext, request);

      expect(result.eligible).toBe(false);
      expect(result.reasons.some((r) => r.code === 'AGE_RESTRICTION')).toBe(true);
    });
  });

  describe('Cache Key Generation', () => {
    it('should generate unique cache keys for different requests', async () => {
      // First request
      mockContext._mocks.db.first.mockResolvedValue(null);

      const request1: EligibilityCheckRequest = {
        adherentId: 'adh_001',
        providerId: 'prov_001',
        insurerId: 'ins_001',
        careType: 'pharmacy',
        amount: 50000,
        serviceDate: '2024-01-15',
      };

      const request2: EligibilityCheckRequest = {
        adherentId: 'adh_002', // Different adherent
        providerId: 'prov_001',
        insurerId: 'ins_001',
        careType: 'pharmacy',
        amount: 50000,
        serviceDate: '2024-01-15',
      };

      await checkEligibility(mockContext, request1);
      await checkEligibility(mockContext, request2);

      // Should have called cache.get with different keys
      expect(mockContext._mocks.cache.get).toHaveBeenCalledTimes(2);
      const calls = mockContext._mocks.cache.get.mock.calls;
      expect(calls[0][0]).not.toBe(calls[1][0]);
    });
  });

  describe('Confidence Score', () => {
    it('should return confidence score', async () => {
      mockContext._mocks.db.first
        .mockResolvedValueOnce({
          id: 'contract_001',
          startDate: '2023-01-01',
          endDate: '2024-12-31',
          planType: 'basic',
          status: 'active',
        })
        .mockResolvedValueOnce({
          id: 'rule_001',
          careType: 'pharmacy',
          isCovered: 1,
          isActive: 1,
        })
        .mockResolvedValueOnce({ id: 'adh_001', dateOfBirth: '1980-05-15', isActive: 1 })
        .mockResolvedValueOnce({ id: 'prov_001', isActive: 1, isNetworkProvider: 1 })
        .mockResolvedValueOnce({ total: 0 })
        .mockResolvedValueOnce({ count: 0, total: 0 })
        .mockResolvedValueOnce({ total: 0 });

      const request: EligibilityCheckRequest = {
        adherentId: 'adh_001',
        providerId: 'prov_001',
        insurerId: 'ins_001',
        careType: 'pharmacy',
        amount: 50000,
        serviceDate: '2024-01-15',
      };

      const result = await checkEligibility(mockContext, request);

      expect(result.confidence).toBeDefined();
      expect(result.confidence).toBeGreaterThanOrEqual(0);
      expect(result.confidence).toBeLessThanOrEqual(100); // 0-100 scale
    });
  });

  describe('Performance - SLA', () => {
    it('should complete eligibility check within SLA (<100ms with mocked DB)', async () => {
      mockContext._mocks.db.first
        .mockResolvedValueOnce({
          id: 'contract_001',
          startDate: '2023-01-01',
          endDate: '2024-12-31',
          planType: 'basic',
          status: 'active',
        })
        .mockResolvedValueOnce({
          id: 'rule_001',
          careType: 'pharmacy',
          isCovered: 1,
          isActive: 1,
        })
        .mockResolvedValueOnce({ id: 'adh_001', dateOfBirth: '1980-05-15', isActive: 1 })
        .mockResolvedValueOnce({ id: 'prov_001', isActive: 1, isNetworkProvider: 1 })
        .mockResolvedValueOnce({ total: 0 })
        .mockResolvedValueOnce({ count: 0, total: 0 })
        .mockResolvedValueOnce({ total: 0 });

      const request: EligibilityCheckRequest = {
        adherentId: 'adh_001',
        providerId: 'prov_001',
        insurerId: 'ins_001',
        careType: 'pharmacy',
        amount: 50000,
        serviceDate: '2024-01-15',
      };

      const result = await checkEligibility(mockContext, request);

      // With mocked DB, should be very fast
      expect(result.checkTime).toBeLessThan(100);
    });
  });
});
