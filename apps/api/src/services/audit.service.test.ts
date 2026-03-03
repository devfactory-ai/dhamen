/**
 * Audit Service Tests
 *
 * Tests for audit logging, search, statistics, and compliance reporting
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AuditService, type AuditEntry, type AuditAction, type EntityType } from './audit.service';

// Mock D1 Database
function createMockDB() {
  const mockRun = vi.fn().mockResolvedValue({ success: true, meta: { changes: 0 } });
  const mockFirst = vi.fn().mockResolvedValue(null);
  const mockAll = vi.fn().mockResolvedValue({ results: [] });

  const mockBind = vi.fn(() => ({
    run: mockRun,
    first: mockFirst,
    all: mockAll,
    bind: mockBind,
  }));

  return {
    prepare: vi.fn(() => ({
      bind: mockBind,
      run: mockRun,
      first: mockFirst,
      all: mockAll,
    })),
    _mocks: { run: mockRun, first: mockFirst, all: mockAll, bind: mockBind },
  };
}

// Mock KV Cache
function createMockCache() {
  return {
    put: vi.fn().mockResolvedValue(undefined),
    get: vi.fn().mockResolvedValue(null),
    delete: vi.fn().mockResolvedValue(undefined),
  };
}

// Mock R2 Storage
function createMockStorage() {
  return {
    put: vi.fn().mockResolvedValue(undefined),
    get: vi.fn().mockResolvedValue(null),
    delete: vi.fn().mockResolvedValue(undefined),
  };
}

function createMockEnv() {
  return {
    DB: createMockDB(),
    CACHE: createMockCache(),
    STORAGE: createMockStorage(),
  } as any;
}

describe('AuditService', () => {
  let service: AuditService;
  let mockEnv: ReturnType<typeof createMockEnv>;

  beforeEach(() => {
    mockEnv = createMockEnv();
    service = new AuditService(mockEnv);
  });

  describe('log', () => {
    it('should log an audit entry with generated id and timestamp', async () => {
      const entry = {
        userId: 'user123',
        userRole: 'ADMIN',
        action: 'LOGIN' as AuditAction,
        entityType: 'user' as EntityType,
        entityId: 'user123',
        details: { browser: 'Chrome' },
        result: 'success' as const,
      };

      const id = await service.log(entry);

      expect(id).toMatch(/^aud_/);
      expect(mockEnv.DB.prepare).toHaveBeenCalled();
      const prepareCall = mockEnv.DB.prepare.mock.calls[0][0];
      expect(prepareCall).toContain('INSERT INTO audit_logs');
    });

    it('should cache critical events', async () => {
      const entry = {
        userId: 'user123',
        userRole: 'ADMIN',
        action: 'LOGIN_FAILED' as AuditAction, // Critical event
        entityType: 'user' as EntityType,
        entityId: 'user123',
        details: {},
        result: 'failure' as const,
      };

      await service.log(entry);

      expect(mockEnv.CACHE.put).toHaveBeenCalled();
      const cacheCall = mockEnv.CACHE.put.mock.calls[0];
      expect(cacheCall[0]).toMatch(/^audit:critical:/);
    });

    it('should not cache non-critical events', async () => {
      const entry = {
        userId: 'user123',
        userRole: 'AGENT',
        action: 'READ' as AuditAction, // Non-critical
        entityType: 'claim' as EntityType,
        entityId: 'claim456',
        details: {},
        result: 'success' as const,
      };

      await service.log(entry);

      expect(mockEnv.CACHE.put).not.toHaveBeenCalled();
    });

    it('should include optional fields when provided', async () => {
      const entry = {
        userId: 'user123',
        userName: 'John Doe',
        userRole: 'DOCTOR',
        action: 'CLAIM_SUBMIT' as AuditAction,
        entityType: 'claim' as EntityType,
        entityId: 'claim789',
        entityName: 'PEC #789',
        details: { amount: 150000 },
        ipAddress: '192.168.1.1',
        userAgent: 'Mozilla/5.0',
        requestId: 'req_123',
        sessionId: 'sess_456',
        insurerId: 'ins_001',
        providerId: 'prov_001',
        result: 'success' as const,
        duration: 125,
      };

      await service.log(entry);

      expect(mockEnv.DB.prepare).toHaveBeenCalled();
    });
  });

  describe('logWithChanges', () => {
    it('should detect and log field changes', async () => {
      const entry = {
        userId: 'user123',
        userRole: 'ADMIN',
        action: 'UPDATE' as AuditAction,
        entityType: 'adherent' as EntityType,
        entityId: 'adh_001',
        details: {},
        result: 'success' as const,
      };

      const oldData = { name: 'Jean', phone: '12345678' };
      const newData = { name: 'Jean-Pierre', phone: '12345678' };

      await service.logWithChanges(entry, oldData, newData);

      expect(mockEnv.DB.prepare).toHaveBeenCalled();
    });

    it('should handle null old data (creation)', async () => {
      const entry = {
        userId: 'user123',
        userRole: 'ADMIN',
        action: 'CREATE' as AuditAction,
        entityType: 'adherent' as EntityType,
        entityId: 'adh_002',
        details: {},
        result: 'success' as const,
      };

      const newData = { name: 'Sami', email: 'sami@test.tn' };

      await service.logWithChanges(entry, null, newData);

      expect(mockEnv.DB.prepare).toHaveBeenCalled();
    });
  });

  describe('search', () => {
    it('should search audit logs with no filters', async () => {
      mockEnv.DB._mocks.first.mockResolvedValueOnce({ count: 0 });
      mockEnv.DB._mocks.all.mockResolvedValueOnce({ results: [] });

      const result = await service.search({});

      expect(result.entries).toEqual([]);
      expect(result.total).toBe(0);
      expect(result.hasMore).toBe(false);
    });

    it('should filter by userId', async () => {
      mockEnv.DB._mocks.first.mockResolvedValueOnce({ count: 1 });
      mockEnv.DB._mocks.all.mockResolvedValueOnce({
        results: [
          {
            id: 'aud_123',
            timestamp: '2024-01-01T00:00:00Z',
            user_id: 'user123',
            user_role: 'ADMIN',
            action: 'LOGIN',
            entity_type: 'user',
            entity_id: 'user123',
            details: '{}',
            result: 'success',
          },
        ],
      });

      const result = await service.search({ userId: 'user123' });

      expect(result.entries).toHaveLength(1);
      expect(result.entries[0]!.userId).toBe('user123');
    });

    it('should filter by multiple actions', async () => {
      mockEnv.DB._mocks.first.mockResolvedValueOnce({ count: 2 });
      mockEnv.DB._mocks.all.mockResolvedValueOnce({ results: [] });

      await service.search({ action: ['LOGIN', 'LOGOUT'] });

      const prepareCall = mockEnv.DB.prepare.mock.calls.find((call: string[]) =>
        call[0]?.includes('SELECT COUNT')
      );
      expect(prepareCall![0]).toContain('action IN');
    });

    it('should filter by date range', async () => {
      mockEnv.DB._mocks.first.mockResolvedValueOnce({ count: 0 });
      mockEnv.DB._mocks.all.mockResolvedValueOnce({ results: [] });

      await service.search({
        startDate: '2024-01-01',
        endDate: '2024-01-31',
      });

      const prepareCall = mockEnv.DB.prepare.mock.calls.find((call: string[]) =>
        call[0]?.includes('SELECT COUNT')
      );
      expect(prepareCall![0]).toContain('timestamp >=');
      expect(prepareCall![0]).toContain('timestamp <=');
    });

    it('should search by text', async () => {
      mockEnv.DB._mocks.first.mockResolvedValueOnce({ count: 0 });
      mockEnv.DB._mocks.all.mockResolvedValueOnce({ results: [] });

      await service.search({ searchText: 'Mohamed' });

      const prepareCall = mockEnv.DB.prepare.mock.calls.find((call: string[]) =>
        call[0]?.includes('SELECT COUNT')
      );
      expect(prepareCall![0]).toContain('entity_name LIKE');
      expect(prepareCall![0]).toContain('user_name LIKE');
    });

    it('should handle pagination correctly', async () => {
      mockEnv.DB._mocks.first.mockResolvedValueOnce({ count: 100 });
      mockEnv.DB._mocks.all.mockResolvedValueOnce({
        results: Array(20).fill({
          id: 'aud_test',
          timestamp: '2024-01-01T00:00:00Z',
          user_id: 'user1',
          user_role: 'ADMIN',
          action: 'READ',
          entity_type: 'claim',
          entity_id: 'clm_1',
          details: '{}',
          result: 'success',
        }),
      });

      const result = await service.search({ limit: 20, offset: 0 });

      expect(result.hasMore).toBe(true);
      expect(result.total).toBe(100);
    });
  });

  describe('getById', () => {
    it('should return null for non-existent entry', async () => {
      mockEnv.DB._mocks.first.mockResolvedValueOnce(null);

      const result = await service.getById('non_existent');

      expect(result).toBeNull();
    });

    it('should return mapped entry when found', async () => {
      mockEnv.DB._mocks.first.mockResolvedValueOnce({
        id: 'aud_123',
        timestamp: '2024-01-01T10:00:00Z',
        user_id: 'user123',
        user_name: 'John Doe',
        user_role: 'ADMIN',
        action: 'LOGIN',
        entity_type: 'user',
        entity_id: 'user123',
        details: '{"browser":"Chrome"}',
        result: 'success',
        duration: 50,
      });

      const result = await service.getById('aud_123');

      expect(result).not.toBeNull();
      expect(result?.id).toBe('aud_123');
      expect(result?.userName).toBe('John Doe');
      expect(result?.details).toEqual({ browser: 'Chrome' });
    });
  });

  describe('getEntityAuditTrail', () => {
    it('should return audit trail for an entity', async () => {
      mockEnv.DB._mocks.all.mockResolvedValueOnce({
        results: [
          {
            id: 'aud_1',
            timestamp: '2024-01-02T00:00:00Z',
            user_id: 'user1',
            user_role: 'ADMIN',
            action: 'UPDATE',
            entity_type: 'claim',
            entity_id: 'clm_001',
            details: '{}',
            result: 'success',
          },
          {
            id: 'aud_2',
            timestamp: '2024-01-01T00:00:00Z',
            user_id: 'user1',
            user_role: 'ADMIN',
            action: 'CREATE',
            entity_type: 'claim',
            entity_id: 'clm_001',
            details: '{}',
            result: 'success',
          },
        ],
      });

      const trail = await service.getEntityAuditTrail('claim', 'clm_001');

      expect(trail).toHaveLength(2);
      expect(trail[0]!.action).toBe('UPDATE');
      expect(trail[1]!.action).toBe('CREATE');
    });
  });

  describe('getUserActivity', () => {
    it('should return user activity for specified days', async () => {
      mockEnv.DB._mocks.all.mockResolvedValueOnce({
        results: [
          {
            id: 'aud_1',
            timestamp: '2024-01-15T10:00:00Z',
            user_id: 'user123',
            user_role: 'DOCTOR',
            action: 'CLAIM_SUBMIT',
            entity_type: 'claim',
            entity_id: 'clm_001',
            details: '{}',
            result: 'success',
          },
        ],
      });

      const activity = await service.getUserActivity('user123', 7);

      expect(activity).toHaveLength(1);
      expect(activity[0]!.userId).toBe('user123');
    });
  });

  describe('getStats', () => {
    it('should return comprehensive audit statistics', async () => {
      // Mock total count
      mockEnv.DB._mocks.first
        .mockResolvedValueOnce({ count: 1000 }) // totalEntries
        .mockResolvedValueOnce({ avg_duration: 150, error_rate: 2.5 }); // performance stats

      // Mock grouped results
      mockEnv.DB._mocks.all
        .mockResolvedValueOnce({ results: [{ action: 'LOGIN', count: 500 }] })
        .mockResolvedValueOnce({ results: [{ entityType: 'user', count: 300 }] })
        .mockResolvedValueOnce({ results: [{ userId: 'user1', userName: 'Admin', count: 100 }] })
        .mockResolvedValueOnce({ results: [{ result: 'success', count: 975 }] })
        .mockResolvedValueOnce({ results: [{ date: '2024-01-15', count: 50 }] });

      const stats = await service.getStats();

      expect(stats.totalEntries).toBe(1000);
      expect(stats.byAction).toHaveLength(1);
      expect(stats.avgDuration).toBe(150);
      expect(stats.errorRate).toBe(2.5);
    });
  });

  describe('generateComplianceReport', () => {
    it('should generate compliance report for date range', async () => {
      // Mock summary
      mockEnv.DB._mocks.first
        .mockResolvedValueOnce({
          total_events: 5000,
          login_attempts: 200,
          failed_logins: 15,
          data_accesses: 3000,
          data_modifications: 500,
          sensitive_operations: 100,
          privileged_actions: 50,
        })
        .mockResolvedValueOnce({ creations: 150, updates: 300, deletions: 50 });

      // Mock arrays
      mockEnv.DB._mocks.all
        .mockResolvedValueOnce({ results: [{ hour: 10, count: 500 }] }) // peakHours
        .mockResolvedValueOnce({ results: [] }) // unusualActivity
        .mockResolvedValueOnce({ results: [{ entityType: 'claim', count: 200 }] }) // changesByEntity
        .mockResolvedValueOnce({ results: [] }) // failedLogins
        .mockResolvedValueOnce({ results: [] }) // privilegedOps
        .mockResolvedValueOnce({ results: [] }); // sensitiveAccess

      const report = await service.generateComplianceReport('2024-01-01', '2024-01-31');

      expect(report.period.start).toBe('2024-01-01');
      expect(report.period.end).toBe('2024-01-31');
      expect(report.summary.totalEvents).toBe(5000);
      expect(report.summary.failedLogins).toBe(15);
      expect(report.generatedAt).toBeDefined();
    });
  });

  describe('export', () => {
    it('should export logs as JSON', async () => {
      mockEnv.DB._mocks.first.mockResolvedValueOnce({ count: 1 });
      mockEnv.DB._mocks.all.mockResolvedValueOnce({
        results: [
          {
            id: 'aud_1',
            timestamp: '2024-01-01T00:00:00Z',
            user_id: 'user1',
            user_role: 'ADMIN',
            action: 'LOGIN',
            entity_type: 'user',
            entity_id: 'user1',
            details: '{}',
            result: 'success',
          },
        ],
      });

      const result = await service.export({}, 'json');

      expect(result.contentType).toBe('application/json');
      expect(result.filename).toMatch(/audit-logs-.*\.json/);
      expect(JSON.parse(result.data)).toHaveLength(1);
    });

    it('should export logs as CSV', async () => {
      mockEnv.DB._mocks.first.mockResolvedValueOnce({ count: 1 });
      mockEnv.DB._mocks.all.mockResolvedValueOnce({
        results: [
          {
            id: 'aud_1',
            timestamp: '2024-01-01T00:00:00Z',
            user_id: 'user1',
            user_role: 'ADMIN',
            action: 'LOGIN',
            entity_type: 'user',
            entity_id: 'user1',
            details: '{}',
            result: 'success',
          },
        ],
      });

      const result = await service.export({}, 'csv');

      expect(result.contentType).toBe('text/csv');
      expect(result.filename).toMatch(/audit-logs-.*\.csv/);
      expect(result.data).toContain('id,timestamp,userId');
    });
  });

  describe('cleanupOldLogs', () => {
    it('should archive and delete old logs', async () => {
      mockEnv.DB._mocks.all.mockResolvedValueOnce({
        results: [
          { id: 'old_1', action: 'LOGIN' },
          { id: 'old_2', action: 'LOGOUT' },
        ],
      });
      mockEnv.DB._mocks.run.mockResolvedValueOnce({ success: true, meta: { changes: 2 } });

      const result = await service.cleanupOldLogs(365);

      expect(mockEnv.STORAGE.put).toHaveBeenCalled();
      expect(result.deleted).toBe(2);
    });

    it('should not archive if no old logs exist', async () => {
      mockEnv.DB._mocks.all.mockResolvedValueOnce({ results: [] });
      mockEnv.DB._mocks.run.mockResolvedValueOnce({ success: true, meta: { changes: 0 } });

      const result = await service.cleanupOldLogs(365);

      expect(mockEnv.STORAGE.put).not.toHaveBeenCalled();
      expect(result.deleted).toBe(0);
    });
  });

  describe('Critical Events Detection', () => {
    const criticalActions: AuditAction[] = [
      'LOGIN_FAILED',
      'PASSWORD_CHANGE',
      'USER_DELETE',
      'PERMISSION_GRANT',
      'CONFIG_CHANGE',
      'FRAUD_FLAG',
      'PERMANENT_DELETE',
    ];

    for (const action of criticalActions) {
      it(`should identify ${action} as critical event`, async () => {
        const entry = {
          userId: 'user123',
          userRole: 'ADMIN',
          action,
          entityType: 'user' as EntityType,
          entityId: 'user123',
          details: {},
          result: 'success' as const,
        };

        await service.log(entry);

        expect(mockEnv.CACHE.put).toHaveBeenCalled();
      });
    }
  });

  describe('Audit Actions Coverage', () => {
    const auditActions: AuditAction[] = [
      'LOGIN',
      'LOGOUT',
      'CREATE',
      'READ',
      'UPDATE',
      'DELETE',
      'CLAIM_SUBMIT',
      'CLAIM_APPROVE',
      'CLAIM_REJECT',
      'ELIGIBILITY_CHECK',
      'BORDEREAU_GENERATE',
      'PAYMENT_INITIATE',
      'DOCUMENT_UPLOAD',
      'EXPORT_DATA',
      'USER_CREATE',
    ];

    for (const action of auditActions) {
      it(`should accept action type: ${action}`, async () => {
        const entry = {
          userId: 'user123',
          userRole: 'ADMIN',
          action,
          entityType: 'claim' as EntityType,
          entityId: 'test123',
          details: {},
          result: 'success' as const,
        };

        const id = await service.log(entry);
        expect(id).toMatch(/^aud_/);
      });
    }
  });

  describe('Entity Types Coverage', () => {
    const entityTypes: EntityType[] = [
      'user',
      'adherent',
      'provider',
      'insurer',
      'contract',
      'claim',
      'bordereau',
      'payment',
      'document',
      'config',
      'session',
      'system',
    ];

    for (const entityType of entityTypes) {
      it(`should accept entity type: ${entityType}`, async () => {
        const entry = {
          userId: 'user123',
          userRole: 'ADMIN',
          action: 'READ' as AuditAction,
          entityType,
          entityId: 'test123',
          details: {},
          result: 'success' as const,
        };

        const id = await service.log(entry);
        expect(id).toMatch(/^aud_/);
      });
    }
  });
});
