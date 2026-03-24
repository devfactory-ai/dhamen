import { z } from 'zod';

/**
 * Schemas for medication family baremes (time-based reimbursement rates)
 */

export const createMedicationFamilyBaremeSchema = z.object({
  contractId: z.string().min(1, 'Contrat requis'),
  medicationFamilyId: z.string().min(1, 'Famille de médicaments requise'),
  tauxRemboursement: z
    .number()
    .min(0, 'Le taux doit être >= 0')
    .max(1, 'Le taux doit être <= 1'),
  plafondActe: z.number().positive().optional(),
  plafondFamilleAnnuel: z.number().positive().optional(),
  dateEffet: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Format date: YYYY-MM-DD'),
  dateFinEffet: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Format date: YYYY-MM-DD')
    .optional(),
  motif: z.string().optional(),
});

export const updateMedicationFamilyBaremeSchema = z.object({
  tauxRemboursement: z
    .number()
    .min(0, 'Le taux doit être >= 0')
    .max(1, 'Le taux doit être <= 1')
    .optional(),
  plafondActe: z.number().positive().nullable().optional(),
  plafondFamilleAnnuel: z.number().positive().nullable().optional(),
  dateEffet: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Format date: YYYY-MM-DD')
    .optional(),
  dateFinEffet: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Format date: YYYY-MM-DD')
    .nullable()
    .optional(),
  motif: z.string().optional(),
});

export type CreateMedicationFamilyBareme = z.infer<typeof createMedicationFamilyBaremeSchema>;
export type UpdateMedicationFamilyBareme = z.infer<typeof updateMedicationFamilyBaremeSchema>;
