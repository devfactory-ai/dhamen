import { describe, expect, it } from 'vitest';
import { batchFilterSchema, createBatchSchema } from './bulletin-batch';

describe('Bulletin Batch Schemas', () => {
  describe('createBatchSchema', () => {
    it('should validate correct data', () => {
      const result = createBatchSchema.safeParse({
        name: 'Lot Mars 2026',
        companyId: 'company-123',
      });
      expect(result.success).toBe(true);
    });

    it('should reject empty name', () => {
      const result = createBatchSchema.safeParse({
        name: '',
        companyId: 'company-123',
      });
      expect(result.success).toBe(false);
    });

    it('should reject missing companyId', () => {
      const result = createBatchSchema.safeParse({
        name: 'Lot Mars 2026',
      });
      expect(result.success).toBe(false);
    });

    it('should reject empty companyId', () => {
      const result = createBatchSchema.safeParse({
        name: 'Lot Mars 2026',
        companyId: '',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('batchFilterSchema', () => {
    it('should validate companyId with default status', () => {
      const result = batchFilterSchema.safeParse({
        companyId: 'company-123',
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.status).toBe('open');
      }
    });

    it('should validate companyId with explicit status', () => {
      const result = batchFilterSchema.safeParse({
        companyId: 'company-123',
        status: 'closed',
      });
      expect(result.success).toBe(true);
    });

    it('should reject invalid status', () => {
      const result = batchFilterSchema.safeParse({
        companyId: 'company-123',
        status: 'invalid',
      });
      expect(result.success).toBe(false);
    });

    it('should reject missing companyId', () => {
      const result = batchFilterSchema.safeParse({});
      expect(result.success).toBe(false);
    });
  });
});
