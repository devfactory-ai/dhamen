/**
 * Batch Service Tests
 *
 * Tests for batch job creation, processing, and status management
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BatchService, type BatchJob, type BatchJobType } from './batch.service';

// Mock D1 Database
function createMockDB() {
  const mockRun = vi.fn().mockResolvedValue({ success: true });
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

function createMockEnv() {
  return {
    DB: createMockDB(),
  } as any;
}

describe('BatchService', () => {
  let service: BatchService;
  let mockEnv: ReturnType<typeof createMockEnv>;

  beforeEach(() => {
    mockEnv = createMockEnv();
    service = new BatchService(mockEnv);
  });

  describe('createJob', () => {
    it('should create a batch job with pending status', async () => {
      const job = await service.createJob(
        'claims_approve',
        { claimIds: ['claim1', 'claim2'] },
        'user123'
      );

      expect(job.type).toBe('claims_approve');
      expect(job.status).toBe('pending');
      expect(job.createdBy).toBe('user123');
      expect(job.params).toEqual({ claimIds: ['claim1', 'claim2'] });
      expect(job.progress).toEqual({
        total: 0,
        processed: 0,
        succeeded: 0,
        failed: 0,
      });
      expect(job.id).toMatch(/^batch_/);
    });

    it('should insert job into database', async () => {
      await service.createJob('bordereau_generate', { insurerId: 'ins1' }, 'user456');

      expect(mockEnv.DB.prepare).toHaveBeenCalled();
      const prepareCall = mockEnv.DB.prepare.mock.calls[0][0];
      expect(prepareCall).toContain('INSERT INTO batch_jobs');
    });
  });

  describe('getJob', () => {
    it('should return null for non-existent job', async () => {
      mockEnv.DB._mocks.first.mockResolvedValueOnce(null);

      const job = await service.getJob('nonexistent');
      expect(job).toBeNull();
    });

    it('should return mapped job from database', async () => {
      mockEnv.DB._mocks.first.mockResolvedValueOnce({
        id: 'batch_123',
        type: 'claims_approve',
        status: 'completed',
        params: JSON.stringify({ claimIds: ['c1'] }),
        progress: JSON.stringify({ total: 1, processed: 1, succeeded: 1, failed: 0 }),
        results: JSON.stringify([{ entityId: 'c1', success: true }]),
        errors: null,
        created_by: 'user1',
        started_at: '2024-01-01T00:00:00Z',
        completed_at: '2024-01-01T00:01:00Z',
        created_at: '2024-01-01T00:00:00Z',
      });

      const job = await service.getJob('batch_123');

      expect(job).not.toBeNull();
      expect(job?.id).toBe('batch_123');
      expect(job?.type).toBe('claims_approve');
      expect(job?.status).toBe('completed');
      expect(job?.params).toEqual({ claimIds: ['c1'] });
      expect(job?.results).toHaveLength(1);
    });
  });

  describe('listJobs', () => {
    it('should list jobs with pagination', async () => {
      mockEnv.DB._mocks.first.mockResolvedValueOnce({ count: 2 });
      mockEnv.DB._mocks.all.mockResolvedValueOnce({
        results: [
          {
            id: 'batch_1',
            type: 'claims_approve',
            status: 'completed',
            params: '{}',
            progress: JSON.stringify({ total: 0, processed: 0, succeeded: 0, failed: 0 }),
            created_by: 'user1',
            created_at: '2024-01-01T00:00:00Z',
          },
          {
            id: 'batch_2',
            type: 'bordereau_generate',
            status: 'pending',
            params: '{}',
            progress: JSON.stringify({ total: 0, processed: 0, succeeded: 0, failed: 0 }),
            created_by: 'user2',
            created_at: '2024-01-02T00:00:00Z',
          },
        ],
      });

      const result = await service.listJobs({ limit: 10, offset: 0 });

      expect(result.total).toBe(2);
      expect(result.jobs).toHaveLength(2);
    });

    it('should filter jobs by type', async () => {
      mockEnv.DB._mocks.first.mockResolvedValueOnce({ count: 1 });
      mockEnv.DB._mocks.all.mockResolvedValueOnce({
        results: [
          {
            id: 'batch_1',
            type: 'claims_approve',
            status: 'completed',
            params: '{}',
            progress: JSON.stringify({ total: 0, processed: 0, succeeded: 0, failed: 0 }),
            created_by: 'user1',
            created_at: '2024-01-01T00:00:00Z',
          },
        ],
      });

      await service.listJobs({ type: 'claims_approve' });

      const prepareCall = mockEnv.DB.prepare.mock.calls.find(
        (call: string[]) => call[0]?.includes('SELECT COUNT')
      );
      expect(prepareCall![0]).toContain('WHERE');
      expect(prepareCall![0]).toContain('type = ?');
    });

    it('should filter jobs by status', async () => {
      mockEnv.DB._mocks.first.mockResolvedValueOnce({ count: 0 });
      mockEnv.DB._mocks.all.mockResolvedValueOnce({ results: [] });

      await service.listJobs({ status: 'pending' });

      const prepareCall = mockEnv.DB.prepare.mock.calls.find(
        (call: string[]) => call[0]?.includes('SELECT COUNT')
      );
      expect(prepareCall![0]).toContain('status = ?');
    });
  });

  describe('cancelJob', () => {
    it('should cancel a pending job', async () => {
      mockEnv.DB._mocks.first.mockResolvedValueOnce({
        id: 'batch_123',
        type: 'claims_approve',
        status: 'pending',
        params: '{}',
        progress: JSON.stringify({ total: 0, processed: 0, succeeded: 0, failed: 0 }),
        created_by: 'user1',
        created_at: '2024-01-01T00:00:00Z',
      });

      const result = await service.cancelJob('batch_123');

      expect(result).toBe(true);
    });

    it('should not cancel a running job', async () => {
      mockEnv.DB._mocks.first.mockResolvedValueOnce({
        id: 'batch_123',
        type: 'claims_approve',
        status: 'running',
        params: '{}',
        progress: JSON.stringify({ total: 0, processed: 0, succeeded: 0, failed: 0 }),
        created_by: 'user1',
        created_at: '2024-01-01T00:00:00Z',
      });

      const result = await service.cancelJob('batch_123');

      expect(result).toBe(false);
    });

    it('should not cancel a completed job', async () => {
      mockEnv.DB._mocks.first.mockResolvedValueOnce({
        id: 'batch_123',
        type: 'claims_approve',
        status: 'completed',
        params: '{}',
        progress: JSON.stringify({ total: 0, processed: 0, succeeded: 0, failed: 0 }),
        created_by: 'user1',
        created_at: '2024-01-01T00:00:00Z',
      });

      const result = await service.cancelJob('batch_123');

      expect(result).toBe(false);
    });

    it('should return false for non-existent job', async () => {
      mockEnv.DB._mocks.first.mockResolvedValueOnce(null);

      const result = await service.cancelJob('nonexistent');

      expect(result).toBe(false);
    });
  });

  describe('processJob', () => {
    it('should throw error for non-existent job', async () => {
      mockEnv.DB._mocks.first.mockResolvedValueOnce(null);

      await expect(service.processJob('nonexistent')).rejects.toThrow('Job not found');
    });

    it('should throw error if job is not pending', async () => {
      mockEnv.DB._mocks.first.mockResolvedValueOnce({
        id: 'batch_123',
        type: 'claims_approve',
        status: 'running',
        params: '{}',
        progress: JSON.stringify({ total: 0, processed: 0, succeeded: 0, failed: 0 }),
        created_by: 'user1',
        created_at: '2024-01-01T00:00:00Z',
      });

      await expect(service.processJob('batch_123')).rejects.toThrow(
        'Job cannot be started: status is running'
      );
    });

    it('should throw error for unknown job type', async () => {
      // First call returns pending job
      mockEnv.DB._mocks.first.mockResolvedValueOnce({
        id: 'batch_123',
        type: 'unknown_type',
        status: 'pending',
        params: '{}',
        progress: JSON.stringify({ total: 0, processed: 0, succeeded: 0, failed: 0 }),
        created_by: 'user1',
        created_at: '2024-01-01T00:00:00Z',
      });

      await expect(service.processJob('batch_123')).rejects.toThrow(
        'Unknown job type: unknown_type'
      );
    });
  });

  describe('Job Progress Tracking', () => {
    it('should initialize progress with correct structure', async () => {
      const job = await service.createJob('adherents_import', { contractId: 'c1', data: [] }, 'user1');

      expect(job.progress.total).toBe(0);
      expect(job.progress.processed).toBe(0);
      expect(job.progress.succeeded).toBe(0);
      expect(job.progress.failed).toBe(0);
    });
  });

  describe('Job Types', () => {
    const jobTypes: BatchJobType[] = [
      'claims_approve',
      'claims_reject',
      'claims_process',
      'bordereau_generate',
      'bordereau_validate',
      'reconciliation_run',
      'adherents_import',
      'adherents_update',
      'notifications_send',
      'reports_generate',
      'data_export',
    ];

    for (const jobType of jobTypes) {
      it(`should accept job type: ${jobType}`, async () => {
        const job = await service.createJob(jobType, {}, 'user1');
        expect(job.type).toBe(jobType);
      });
    }
  });

  describe('Job Status Transitions', () => {
    it('should create job with pending status', async () => {
      const job = await service.createJob('claims_approve', {}, 'user1');
      expect(job.status).toBe('pending');
    });

    it('should not have startedAt or completedAt on new job', async () => {
      const job = await service.createJob('claims_approve', {}, 'user1');
      expect(job.startedAt).toBeUndefined();
      expect(job.completedAt).toBeUndefined();
    });
  });

  describe('ID Generation', () => {
    it('should generate unique IDs with batch prefix', async () => {
      const job1 = await service.createJob('claims_approve', {}, 'user1');
      const job2 = await service.createJob('claims_approve', {}, 'user1');

      expect(job1.id).toMatch(/^batch_[a-z0-9]+$/);
      expect(job2.id).toMatch(/^batch_[a-z0-9]+$/);
      expect(job1.id).not.toBe(job2.id);
    });
  });

  describe('Timestamp Handling', () => {
    it('should set createdAt on job creation', async () => {
      const before = new Date().toISOString();
      const job = await service.createJob('claims_approve', {}, 'user1');
      const after = new Date().toISOString();

      expect(job.createdAt).toBeDefined();
      expect(job.createdAt >= before).toBe(true);
      expect(job.createdAt <= after).toBe(true);
    });
  });

  describe('Error Handling', () => {
    it('should handle database errors gracefully', async () => {
      mockEnv.DB._mocks.run.mockRejectedValueOnce(new Error('Database error'));

      await expect(
        service.createJob('claims_approve', {}, 'user1')
      ).rejects.toThrow('Database error');
    });
  });
});
