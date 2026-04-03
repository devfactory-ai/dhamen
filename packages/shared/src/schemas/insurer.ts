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

export const typeAssureurSchema = z.enum(['cnam', 'mutuelle', 'compagnie', 'reassureur', 'autre']);

export const insurerCreateSchema = z.object({
  name: z.string().min(1, 'Nom requis'),
  code: z.string().min(1, 'Code requis').max(10),
  type: z.enum(['INSURANCE', 'MUTUAL']).optional(),
  registrationNumber: z.string().optional(),
  taxId: z.string().optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  postalCode: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email().optional().or(z.literal('')),
  website: z.string().url().optional().or(z.literal('')),
  config: insurerConfigSchema.partial().optional(),
  typeAssureur: typeAssureurSchema.optional(),
  matriculeFiscal: z.string().optional(),
  dateDebutConvention: z.string().optional(),
  dateFinConvention: z.string().optional(),
  tauxCouverture: z.number().min(0).max(100).optional(),
});

export const insurerUpdateSchema = z.object({
  name: z.string().min(1).optional(),
  type: z.enum(['INSURANCE', 'MUTUAL']).optional(),
  registrationNumber: z.string().optional(),
  taxId: z.string().optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  postalCode: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email().optional().or(z.literal('')),
  website: z.string().url().optional().or(z.literal('')),
  config: insurerConfigSchema.partial().optional(),
  isActive: z.boolean().optional(),
  typeAssureur: typeAssureurSchema.optional(),
  matriculeFiscal: z.string().optional(),
  dateDebutConvention: z.string().optional(),
  dateFinConvention: z.string().optional(),
  tauxCouverture: z.number().min(0).max(100).optional(),
});

export const insurerFiltersSchema = z.object({
  isActive: z.boolean().optional(),
  search: z.string().optional(),
  typeAssureur: typeAssureurSchema.optional(),
});

export type InsurerCreateInput = z.infer<typeof insurerCreateSchema>;
export type InsurerUpdateInput = z.infer<typeof insurerUpdateSchema>;
export type InsurerFiltersInput = z.infer<typeof insurerFiltersSchema>;
