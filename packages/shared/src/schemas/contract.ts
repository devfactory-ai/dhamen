import { z } from 'zod';
import { CONTRACT_STATUSES, PLAN_TYPES } from '../types/contract';

export const contractStatusSchema = z.enum(CONTRACT_STATUSES);
export const planTypeSchema = z.enum(PLAN_TYPES);

export const pharmacyCoverageSchema = z.object({
  enabled: z.boolean(),
  reimbursementRate: z.number().min(0).max(1),
  annualLimit: z.number().positive().nullable(),
  genericOnly: z.boolean(),
});

export const consultationCoverageSchema = z.object({
  enabled: z.boolean(),
  reimbursementRate: z.number().min(0).max(1),
  annualLimit: z.number().positive().nullable(),
  specialities: z.array(z.string()),
});

export const hospitalizationCoverageSchema = z.object({
  enabled: z.boolean(),
  reimbursementRate: z.number().min(0).max(1),
  annualLimit: z.number().positive().nullable(),
  roomType: z.enum(['standard', 'private', 'any']),
});

export const labCoverageSchema = z.object({
  enabled: z.boolean(),
  reimbursementRate: z.number().min(0).max(1),
  annualLimit: z.number().positive().nullable(),
});

export const coverageConfigSchema = z.object({
  pharmacy: pharmacyCoverageSchema,
  consultation: consultationCoverageSchema,
  hospitalization: hospitalizationCoverageSchema,
  lab: labCoverageSchema,
});

export const contractCreateSchema = z.object({
  insurerId: z.string().min(1, 'Assureur requis'),
  adherentId: z.string().min(1, 'Adhérent requis'),
  contractNumber: z.string().min(1, 'Numéro de contrat requis'),
  planType: planTypeSchema,
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Format date invalide'),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Format date invalide'),
  carenceDays: z.number().min(0).optional(),
  annualLimit: z.number().positive().optional(),
  coverage: coverageConfigSchema,
  exclusions: z.array(z.string()).optional(),
});

export const contractUpdateSchema = z.object({
  planType: planTypeSchema.optional(),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  annualLimit: z.number().positive().optional(),
  coverage: coverageConfigSchema.partial().optional(),
  exclusions: z.array(z.string()).optional(),
  status: contractStatusSchema.optional(),
});

export const contractFiltersSchema = z.object({
  insurerId: z.string().optional(),
  adherentId: z.string().optional(),
  status: contractStatusSchema.optional(),
  planType: planTypeSchema.optional(),
});

export type ContractCreateInput = z.infer<typeof contractCreateSchema>;
export type ContractUpdateInput = z.infer<typeof contractUpdateSchema>;
export type ContractFiltersInput = z.infer<typeof contractFiltersSchema>;
