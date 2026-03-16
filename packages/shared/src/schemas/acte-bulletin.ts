import { z } from 'zod';

export const acteBulletinSchema = z.object({
  code: z.string().optional(),
  label: z.string().min(1, 'Libellé de l\'acte requis'),
  amount: z.number().positive('Le montant doit être supérieur à 0'),
  ref_prof_sant: z.string().optional(),
  nom_prof_sant: z.string().min(1, 'Nom du praticien requis'),
  cod_msgr: z.string().optional(),
  lib_msgr: z.string().optional(),
});

export const actesArraySchema = z
  .array(acteBulletinSchema)
  .min(1, 'Au moins un acte médical requis');

export type ActeBulletinInput = z.infer<typeof acteBulletinSchema>;
