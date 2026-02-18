import { z } from 'zod';

export const reconciliationCycleSchema = z.enum(['weekly', 'biweekly', 'monthly']);

export const reconciliationConfigSchema = z.object({
  cycle: reconciliationCycleSchema,
  dayOfWeek: z.number().min(0).max(6).optional(),
  dayOfMonth: z.number().min(1).max(28).optional(),
  retentionRate: z.number().min(0).max(1),
  autoGenerate: z.boolean(),
  pdfTemplate: z.string(),
});

export const fraudThresholdsSchema = z.object({
  reviewThreshold: z.number().min(0).max(100),
  blockThreshold: z.number().min(0).max(100),
});

export const insurerConfigSchema = z.object({
  reconciliation: reconciliationConfigSchema,
  fraudThresholds: fraudThresholdsSchema,
  defaultReimbursementRate: z.number().min(0).max(1),
});

export const insurerCreateSchema = z.object({
  name: z.string().min(1, 'Nom requis'),
  code: z.string().min(1, 'Code requis').max(10),
  taxId: z.string().optional(),
  address: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email().optional(),
  config: insurerConfigSchema.partial().optional(),
});

export const insurerUpdateSchema = z.object({
  name: z.string().min(1).optional(),
  taxId: z.string().optional(),
  address: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email().optional(),
  config: insurerConfigSchema.partial().optional(),
  isActive: z.boolean().optional(),
});

export const insurerFiltersSchema = z.object({
  isActive: z.boolean().optional(),
  search: z.string().optional(),
});

export type InsurerCreateInput = z.infer<typeof insurerCreateSchema>;
export type InsurerUpdateInput = z.infer<typeof insurerUpdateSchema>;
export type InsurerFiltersInput = z.infer<typeof insurerFiltersSchema>;
