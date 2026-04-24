/**
 * Strategy: Fixed daily amount (forfait journalier).
 * montant_rembourse = min(montant_facture, per_day_ceiling × jours)
 * Used for: hospitalisation, cures thermales, sanatorium.
 */
import type { Acte, Guarantee, ActeResult } from '../types';

export function calculateFixedDay(
  acte: Acte,
  guarantee: Guarantee,
): ActeResult {
  const dailyCeiling = guarantee.per_day_ceiling!; // millimes
  const joursRequested = acte.jours ?? 1;
  // Apply max_days cap (e.g., cures thermales 21 jours max)
  const jours = (guarantee.max_days != null && guarantee.max_days > 0)
    ? Math.min(joursRequested, guarantee.max_days)
    : joursRequested;
  const maxReimbursement = dailyCeiling * jours;
  const montantRembourse = Math.min(acte.montant, maxReimbursement);

  return {
    montantFacture: acte.montant,
    montantRembourse,
    strategieAppliquee: 'fixed_day',
    plafondLimitant: montantRembourse < acte.montant ? 'per_act' : null,
    calcul: `min(${acte.montant}, ${dailyCeiling} × ${jours}) = ${montantRembourse}`,
  };
}
