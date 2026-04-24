/**
 * Ceiling application — applied in strict order:
 * 1. Sub-limit (per sub_limit_key)
 * 2. Per-act ceiling
 * 3. Annual category ceiling (annual_ceiling - already reimbursed for this care_type)
 * 4. Annual global ceiling (annual_global_limit - total already reimbursed)
 */
import type { ActeResult, Acte, Guarantee, Contract, AnnualContext, PlafondType } from './types';

export function applyCeilings(
  result: ActeResult,
  acte: Acte,
  guarantee: Guarantee,
  contract: Contract,
  context: AnnualContext,
): ActeResult {
  let montant = result.montantRembourse;
  let plafond: PlafondType = result.plafondLimitant;
  const benId = acte.beneficiaire.id;
  const benCtx = context.byBeneficiaire[benId];

  // 1. Sub-limit (e.g., optique: monture 300 DT, verres 250 DT)
  if (acte.sub_limit_key && guarantee.sub_limits.length > 0) {
    const subEntry = guarantee.sub_limits.find(
      (sl) => sl.key.toLowerCase() === acte.sub_limit_key!.toLowerCase(),
    );
    if (subEntry && montant > subEntry.value) {
      montant = subEntry.value;
      plafond = 'sub_limit';
    }
  }

  // 2. Per-act ceiling
  if (guarantee.per_act_ceiling != null && montant > guarantee.per_act_ceiling) {
    montant = guarantee.per_act_ceiling;
    plafond = 'per_act';
  }

  // 3. Annual category ceiling
  if (guarantee.annual_ceiling != null) {
    const alreadyUsed = benCtx?.byCareType[acte.care_type] ?? 0;
    const remaining = Math.max(0, guarantee.annual_ceiling - alreadyUsed);
    if (montant > remaining) {
      montant = remaining;
      plafond = 'annual_category';
    }
  }

  // 4. Annual global ceiling
  if (contract.annual_global_limit != null) {
    const totalUsed = benCtx?.totalReimbursed ?? 0;
    const remaining = Math.max(0, contract.annual_global_limit - totalUsed);
    if (montant > remaining) {
      montant = remaining;
      plafond = 'annual_global';
    }
  }

  return {
    ...result,
    montantRembourse: montant,
    plafondLimitant: plafond,
  };
}
