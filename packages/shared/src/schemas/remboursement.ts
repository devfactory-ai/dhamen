import { z } from 'zod';

export const acteInputSchema = z.object({
  code: z.string().min(1, 'Code acte requis'),
  label: z.string().min(1, 'Libellé acte requis'),
  montantActe: z.number().nonnegative('Le montant doit être >= 0'),
  tauxRemboursement: z
    .number()
    .min(0, 'Le taux doit être >= 0')
    .max(1, 'Le taux doit être <= 1'),
});

export const remboursementRequestSchema = z.object({
  actes: z.array(acteInputSchema).min(1, 'Au moins un acte requis'),
  plafondRestant: z.number().nonnegative('Le plafond doit être >= 0'),
});

export type ActeInputSchema = z.infer<typeof acteInputSchema>;
export type RemboursementRequestSchema = z.infer<typeof remboursementRequestSchema>;
