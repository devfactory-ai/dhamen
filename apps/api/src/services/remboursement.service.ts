import type {
  ActeInput,
  RemboursementActeResult,
  RemboursementBulletinResult,
} from '@dhamen/shared';

/**
 * Calculate reimbursement for a single medical act.
 *
 * Rule: remboursement_brut = montant × taux
 *       remboursement_final = min(remboursement_brut, plafond_restant)
 */
export function calculateRemboursementActe(
  montantActe: number,
  tauxRemboursement: number,
  plafondRestant: number,
): RemboursementActeResult {
  const remboursementBrut = Math.round(montantActe * tauxRemboursement);
  const remboursementFinal = Math.min(remboursementBrut, Math.max(plafondRestant, 0));
  const plafondDepasse = remboursementBrut > plafondRestant;

  return {
    code: '',
    label: '',
    montantActe,
    tauxRemboursement,
    remboursementBrut,
    remboursementFinal,
    plafondDepasse,
  };
}

/**
 * Calculate reimbursement for all acts in a bulletin.
 * Iterates through acts and decrements the remaining plafond progressively.
 */
export function calculateRemboursementBulletin(
  actes: ActeInput[],
  plafondRestant: number,
): RemboursementBulletinResult {
  let remaining = plafondRestant;
  const results: RemboursementActeResult[] = [];

  for (const acte of actes) {
    const result = calculateRemboursementActe(
      acte.montantActe,
      acte.tauxRemboursement,
      remaining,
    );
    result.code = acte.code;
    result.label = acte.label;

    remaining -= result.remboursementFinal;
    results.push(result);
  }

  const totalRembourse = results.reduce((sum, r) => sum + r.remboursementFinal, 0);

  return {
    actes: results,
    totalRembourse,
    plafondRestantApres: remaining,
  };
}
