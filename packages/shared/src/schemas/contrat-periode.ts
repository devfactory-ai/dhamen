import { z } from 'zod';
import { typeCalculSchema } from './acte-referentiel';

export const contratPeriodeSchema = z.object({
  id: z.string(),
  contractId: z.string().min(1),
  numero: z.number().int().min(1),
  dateDebut: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  dateFin: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  refPeriode: z.string().nullable().default(null),
  isActive: z.boolean().default(true),
});

export const contratBaremeSchema = z.object({
  id: z.string(),
  periodeId: z.string().min(1),
  acteRefId: z.string().nullable().default(null),
  familleId: z.string().nullable().default(null),
  typeCalcul: typeCalculSchema.default('taux'),
  valeur: z.number().min(0),
  plafondActe: z.number().positive().nullable().default(null),
  plafondFamilleAnnuel: z.number().positive().nullable().default(null),
  limite: z.number().int().positive().nullable().default(null),
  contreVisite: z.boolean().default(false),
});

export type ContratPeriodeInput = z.infer<typeof contratPeriodeSchema>;
export type ContratBaremeInput = z.infer<typeof contratBaremeSchema>;
