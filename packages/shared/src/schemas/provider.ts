import { z } from 'zod';
import { PROVIDER_TYPES } from '../types/provider';

export const providerTypeSchema = z.enum(PROVIDER_TYPES);

export const providerCreateSchema = z.object({
  type: providerTypeSchema,
  name: z.string().min(1, 'Nom requis'),
  licenseNo: z.string().min(1, 'Numéro de licence requis'),
  speciality: z.string().optional(),
  address: z.string().min(1, 'Adresse requise'),
  city: z.string().min(1, 'Ville requise'),
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
  phone: z.string().optional(),
  email: z.string().email().optional(),
});

export const providerUpdateSchema = z.object({
  name: z.string().min(1).optional(),
  speciality: z.string().optional(),
  address: z.string().min(1).optional(),
  city: z.string().min(1).optional(),
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
  phone: z.string().optional(),
  email: z.string().email().optional(),
  isActive: z.boolean().optional(),
});

export const providerFiltersSchema = z.object({
  type: providerTypeSchema.optional(),
  city: z.string().optional(),
  isActive: z.boolean().optional(),
  search: z.string().optional(),
});

export type ProviderCreateInput = z.infer<typeof providerCreateSchema>;
export type ProviderUpdateInput = z.infer<typeof providerUpdateSchema>;
export type ProviderFiltersInput = z.infer<typeof providerFiltersSchema>;
