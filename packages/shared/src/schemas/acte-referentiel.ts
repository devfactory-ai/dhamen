import { z } from 'zod';

export const typeCalculSchema = z.enum(['taux', 'forfait']);

export const familleActeSchema = z.object({
  id: z.string(),
  code: z.string().regex(/^FA\d{4}$/, 'Code famille invalide (ex: FA0001)'),
  label: z.string().min(1),
  ordre: z.number().int().min(0),
  isActive: z.boolean().default(true),
});

export const acteReferentielSchema = z.object({
  id: z.string(),
  code: z.string().min(1),
  label: z.string().min(1),
  tauxRemboursement: z.number().min(0).max(1),
  plafondActe: z.number().positive().nullable().default(null),
  isActive: z.boolean().default(true),
  familleId: z.string().nullable().default(null),
  typeCalcul: typeCalculSchema.default('taux'),
  valeurBase: z.number().positive().nullable().default(null),
  codeAssureur: z.string().nullable().default(null),
});

export const acteReferentielFilterSchema = z.object({
  familleId: z.string().optional(),
  familleCode: z.string().optional(),
  typeCalcul: typeCalculSchema.optional(),
  isActive: z.boolean().optional(),
  search: z.string().optional(),
});

export type FamilleActeInput = z.infer<typeof familleActeSchema>;
export type ActeReferentielInput = z.infer<typeof acteReferentielSchema>;
export type ActeReferentielFilter = z.infer<typeof acteReferentielFilterSchema>;
