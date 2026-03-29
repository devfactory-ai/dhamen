import { z } from 'zod';

export const acteBulletinSchema = z.object({
  code: z.string().optional(),
  label: z.string().min(1, 'Libellé de l\'acte requis'),
  amount: z.number().positive('Le montant doit être supérieur à 0'),
  ref_prof_sant: z.string().min(1, 'Matricule fiscale requis'),
  nom_prof_sant: z.string().min(1, 'Nom du praticien requis'),
  /** Provider ID resolved by frontend MF lookup — skips backend re-search if set */
  provider_id: z.string().optional(),
  care_type: z.enum(['consultation', 'pharmacy', 'lab', 'hospital']).optional(),
  care_description: z.string().optional(),
  cod_msgr: z.string().optional(),
  lib_msgr: z.string().optional(),
});

export const actesArraySchema = z
  .array(acteBulletinSchema)
  .min(1, 'Au moins un acte médical requis');

export type ActeBulletinInput = z.infer<typeof acteBulletinSchema>;
