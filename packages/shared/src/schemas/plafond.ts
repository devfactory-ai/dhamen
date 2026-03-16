import { z } from 'zod';

export const typeMaladieSchema = z.enum(['ordinaire', 'chronique']);

export const plafondPrestataireSchema = z.object({
  id: z.string(),
  adherentId: z.string().min(1),
  contractId: z.string().min(1),
  annee: z.number().int().min(2020).max(2100),
  familleActeId: z.string().nullable().default(null),
  typeMaladie: typeMaladieSchema.default('ordinaire'),
  montantPlafond: z.number().positive(),
  montantConsomme: z.number().min(0).default(0),
});

export type PlafondPrestataireInput = z.infer<typeof plafondPrestataireSchema>;
