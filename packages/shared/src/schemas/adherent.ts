import { z } from 'zod';

export const genderSchema = z.enum(['M', 'F']);

export const adherentCreateSchema = z.object({
  nationalId: z.string().min(8, 'Numéro national invalide'),
  firstName: z.string().min(1, 'Prénom requis'),
  lastName: z.string().min(1, 'Nom requis'),
  dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Format date invalide (YYYY-MM-DD)'),
  gender: genderSchema.optional(),
  phone: z.string().optional(),
  email: z.string().email().optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
});

export const adherentUpdateSchema = z.object({
  firstName: z.string().min(1).optional(),
  lastName: z.string().min(1).optional(),
  phone: z.string().optional(),
  email: z.string().email().optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
});

export const adherentFiltersSchema = z.object({
  city: z.string().optional(),
  search: z.string().optional(),
});

/**
 * Schema for CSV import row validation
 */
export const adherentCsvRowSchema = z.object({
  nationalId: z.string().min(8, 'Numéro national invalide'),
  firstName: z.string().min(1, 'Prénom requis'),
  lastName: z.string().min(1, 'Nom requis'),
  dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Format date invalide (YYYY-MM-DD)'),
  gender: genderSchema.optional(),
  phone: z.string().optional(),
  email: z.string().email().optional().or(z.literal('')),
  address: z.string().optional(),
  city: z.string().optional(),
});

export const adherentImportSchema = z.object({
  adherents: z.array(adherentCsvRowSchema).min(1, 'Au moins un adhérent requis').max(1000, 'Maximum 1000 adhérents par import'),
  skipDuplicates: z.boolean().optional().default(true),
});

export type AdherentCreateInput = z.infer<typeof adherentCreateSchema>;
export type AdherentUpdateInput = z.infer<typeof adherentUpdateSchema>;
export type AdherentFiltersInput = z.infer<typeof adherentFiltersSchema>;
export type AdherentCsvRow = z.infer<typeof adherentCsvRowSchema>;
export type AdherentImportInput = z.infer<typeof adherentImportSchema>;
