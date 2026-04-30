/**
 * Strategy: Percentage-based reimbursement.
 * montant_rembourse = montant_facture × (rate / 100)
 * Used for: pharmacie, consultation, dentaire (when no letter_key), etc.
 */
import type { Acte, Guarantee, ActeResult } from '../types';

export function calculateByRate(
  acte: Acte,
  guarantee: Guarantee,
): ActeResult {
  const rate = guarantee.rate!; // 0-100
  const montantRembourse = Math.round(acte.montant * (rate / 100));

  return {
    montantFacture: acte.montant,
    montantRembourse,
    strategieAppliquee: 'rate',
    plafondLimitant: null,
    calcul: `${acte.montant} × ${rate}% = ${montantRembourse}`,
  };
}
