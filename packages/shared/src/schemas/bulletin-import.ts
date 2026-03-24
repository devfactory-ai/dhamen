import { z } from 'zod';
import { acteBulletinSchema } from './acte-bulletin';

/**
 * Schema for a single bulletin in a batch import
 */
export const importBulletinSchema = z.object({
  adherent_matricule: z.string().min(1, 'Matricule requis'),
  adherent_first_name: z.string().min(1, 'Prénom requis'),
  adherent_last_name: z.string().min(1, 'Nom requis'),
  bulletin_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Format date invalide (YYYY-MM-DD)'),
  care_type: z.enum(['consultation', 'pharmacy', 'lab', 'hospital']),
  actes: z.array(acteBulletinSchema).min(1, 'Au moins un acte requis'),
});

/**
 * Schema for the full import-lot request
 */
export const importLotSchema = z.object({
  companyId: z.string().min(1, 'Entreprise requise'),
  batchName: z.string().min(1, 'Nom du lot requis'),
  bulletins: z.array(importBulletinSchema).min(1, 'Au moins un bulletin requis').max(500, 'Maximum 500 bulletins par import'),
});

export type ImportBulletinInput = z.infer<typeof importBulletinSchema>;
export type ImportLotInput = z.infer<typeof importLotSchema>;
