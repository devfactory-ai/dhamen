import { z } from 'zod';
import { RECONCILIATION_STATUSES } from '../types/reconciliation';

export const reconciliationStatusSchema = z.enum(RECONCILIATION_STATUSES);

export const reconciliationCreateSchema = z.object({
  insurerId: z.string().min(1, 'Assureur requis'),
  periodStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Format date invalide'),
  periodEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Format date invalide'),
});

export const reconciliationUpdateSchema = z.object({
  status: reconciliationStatusSchema.optional(),
  paidAt: z.string().optional(),
});

export const reconciliationFiltersSchema = z.object({
  insurerId: z.string().optional(),
  status: reconciliationStatusSchema.optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
});

export type ReconciliationCreateInput = z.infer<typeof reconciliationCreateSchema>;
export type ReconciliationUpdateInput = z.infer<typeof reconciliationUpdateSchema>;
export type ReconciliationFiltersInput = z.infer<typeof reconciliationFiltersSchema>;
