import { z } from 'zod';
import { paginationSchema, sortSchema } from './common';

/**
 * Bareme configuration schema for pharmacy
 */
export const pharmacyBaremeSchema = z.object({
  genericDiscount: z.number().min(0).max(100).optional(),
  brandDiscount: z.number().min(0).max(100).optional(),
  maxPerPrescription: z.number().min(0).optional(),
});

/**
 * Bareme configuration schema for consultation
 */
export const consultationBaremeSchema = z.object({
  generalRate: z.number().min(0).optional(),
  specialistRate: z.number().min(0).optional(),
  emergencyRate: z.number().min(0).optional(),
});

/**
 * Bareme configuration schema for hospitalization
 */
export const hospitalizationBaremeSchema = z.object({
  dailyRoomRate: z.number().min(0).optional(),
  surgeryRates: z.record(z.string(), z.number().min(0)).optional(),
});

/**
 * Bareme configuration schema for lab
 */
export const labBaremeSchema = z.object({
  standardTests: z.number().min(0).optional(),
  specializedTests: z.number().min(0).optional(),
});

/**
 * Complete bareme configuration schema
 */
export const baremeConfigSchema = z.object({
  pharmacy: pharmacyBaremeSchema.optional(),
  consultation: consultationBaremeSchema.optional(),
  hospitalization: hospitalizationBaremeSchema.optional(),
  lab: labBaremeSchema.optional(),
});

/**
 * Convention terms schema
 */
export const conventionTermsSchema = z.object({
  paymentTermDays: z.number().min(1).max(180).optional(),
  autoRenewal: z.boolean().optional(),
  noticePeriodDays: z.number().min(0).max(365).optional(),
  exclusions: z.array(z.string()).optional(),
  specialConditions: z.string().optional(),
});

/**
 * Convention create schema
 */
export const conventionCreateSchema = z.object({
  insurerId: z.string().min(1, 'ID assureur requis'),
  providerId: z.string().min(1, 'ID prestataire requis'),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Format de date invalide (YYYY-MM-DD)'),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Format de date invalide (YYYY-MM-DD)').optional(),
  bareme: baremeConfigSchema,
  terms: conventionTermsSchema.optional(),
}).refine(
  (data) => !data.endDate || data.endDate >= data.startDate,
  { message: 'La date de fin doit être postérieure à la date de début', path: ['endDate'] }
);

/**
 * Convention update schema
 */
export const conventionUpdateSchema = z.object({
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Format de date invalide (YYYY-MM-DD)').nullable().optional(),
  bareme: baremeConfigSchema.optional(),
  terms: conventionTermsSchema.nullable().optional(),
  isActive: z.boolean().optional(),
});

/**
 * Convention filters schema
 */
export const conventionFiltersSchema = z.object({
  insurerId: z.string().optional(),
  providerId: z.string().optional(),
  isActive: z.coerce.boolean().optional(),
  effectiveDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
}).merge(paginationSchema).merge(sortSchema);

/**
 * Types inferred from schemas
 * Note: Using Schema suffix to avoid conflict with types/convention.ts
 */
export type BaremeConfigSchema = z.infer<typeof baremeConfigSchema>;
export type ConventionTermsSchema = z.infer<typeof conventionTermsSchema>;
export type ConventionCreateInput = z.infer<typeof conventionCreateSchema>;
export type ConventionUpdateInput = z.infer<typeof conventionUpdateSchema>;
export type ConventionFiltersInput = z.infer<typeof conventionFiltersSchema>;
