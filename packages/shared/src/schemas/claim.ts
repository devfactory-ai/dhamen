import { z } from 'zod';
import { CLAIM_STATUSES, CLAIM_TYPES } from '../types/claim';

export const claimTypeSchema = z.enum(CLAIM_TYPES);
export const claimStatusSchema = z.enum(CLAIM_STATUSES);

export const claimItemCreateSchema = z.object({
  code: z.string().min(1, 'Code requis'),
  label: z.string().min(1, 'Libellé requis'),
  quantity: z.number().int().positive('Quantité doit être positive'),
  unitPrice: z.number().int().positive('Prix unitaire doit être positif'),
  isGeneric: z.boolean().optional(),
});

export const claimCreateSchema = z.object({
  type: claimTypeSchema,
  contractId: z.string().min(1, 'Contrat requis'),
  providerId: z.string().min(1, 'Prestataire requis'),
  items: z.array(claimItemCreateSchema).min(1, 'Au moins un article requis'),
  notes: z.string().optional(),
});

export const claimUpdateSchema = z.object({
  status: claimStatusSchema.optional(),
  notes: z.string().optional(),
});

export const claimFiltersSchema = z.object({
  type: claimTypeSchema.optional(),
  status: claimStatusSchema.optional(),
  providerId: z.string().optional(),
  adherentId: z.string().optional(),
  insurerId: z.string().optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
  minFraudScore: z.number().min(0).max(100).optional(),
});

export type ClaimItemCreateInput = z.infer<typeof claimItemCreateSchema>;
export type ClaimCreateInput = z.infer<typeof claimCreateSchema>;
export type ClaimUpdateInput = z.infer<typeof claimUpdateSchema>;
export type ClaimFiltersInput = z.infer<typeof claimFiltersSchema>;
