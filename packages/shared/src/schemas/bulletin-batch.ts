import { z } from 'zod';
import { BATCH_STATUSES } from '../types/bulletin-batch';

/**
 * Schema for creating a new bulletin batch linked to a company
 */
export const createBatchSchema = z.object({
  name: z.string().min(1, 'Nom du lot requis'),
  companyId: z.string().min(1, 'Entreprise requise'),
});

/**
 * Schema for filtering bulletin batches
 */
export const batchFilterSchema = z.object({
  companyId: z.string().min(1, 'Entreprise requise'),
  status: z.enum(BATCH_STATUSES).optional().default('open'),
});

export type CreateBatchInput = z.infer<typeof createBatchSchema>;
export type BatchFilterInput = z.infer<typeof batchFilterSchema>;
