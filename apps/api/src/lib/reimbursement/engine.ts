/**
 * Reimbursement engine — pure calculation module.
 *
 * Takes a contract + acte(s) + annual context, returns traceable results.
 * All monetary values in MILLIMES internally.
 */
import type {
  Acte,
  ActeResult,
  AnnualContext,
  BulletinResult,
  Contract,
  Guarantee,
} from './types';
import { NoGuaranteeError, NoStrategyError } from './types';
import { checkEligibility } from './eligibility';
import { calculateByLetterKey, calculateByRate, calculateFixedDay } from './strategies';
import { applyCeilings } from './ceilings';

/**
 * Find the matching guarantee for an acte's care_type.
 */
function findGuarantee(contract: Contract, careType: string): Guarantee | null {
  return contract.guarantees.find((g) => g.care_type === careType) ?? null;
}

/**
 * Determine which strategy to use based on acte + guarantee data.
 * Data-driven — NO switch on care_type.
 */
function chooseStrategy(
  acte: Acte,
  guarantee: Guarantee,
): 'letter_key' | 'rate' | 'fixed_day' {
  // 1. Letter-key regime: acte has a letter_key AND guarantee defines it
  if (acte.letter_key && acte.coefficient != null && guarantee.letter_keys.length > 0) {
    const upperKey = acte.letter_key.toUpperCase();
    const hasKey = guarantee.letter_keys.some(
      (lk) => lk.key.toUpperCase() === upperKey,
    );
    if (hasKey) return 'letter_key';
  }

  // 2. Percentage regime: guarantee has a rate
  if (guarantee.rate != null && guarantee.rate > 0) {
    return 'rate';
  }

  // 3. Fixed daily regime: guarantee has per_day_ceiling and acte has jours
  if (guarantee.per_day_ceiling != null) {
    return 'fixed_day';
  }

  throw new NoStrategyError(guarantee.care_type);
}

/**
 * Calculate reimbursement for a single acte.
 */
export function calculateActe(
  acte: Acte,
  contract: Contract,
  context: AnnualContext,
): ActeResult {
  // 1. Find guarantee
  const guarantee = findGuarantee(contract, acte.care_type);
  if (!guarantee) {
    throw new NoGuaranteeError(acte.care_type);
  }

  // 2. Check eligibility
  const rejection = checkEligibility(acte, contract, guarantee);
  if (rejection) {
    return {
      montantFacture: acte.montant,
      montantRembourse: 0,
      strategieAppliquee: 'rate',
      plafondLimitant: null,
      calcul: 'N/A',
      rejetRaison: rejection,
    };
  }

  // 3. Choose and apply strategy
  const strategy = chooseStrategy(acte, guarantee);
  let result: ActeResult;

  switch (strategy) {
    case 'letter_key':
      result = calculateByLetterKey(acte, guarantee);
      break;
    case 'rate':
      result = calculateByRate(acte, guarantee);
      break;
    case 'fixed_day':
      result = calculateFixedDay(acte, guarantee);
      break;
  }

  // 4. Apply ceilings
  result = applyCeilings(result, acte, guarantee, contract, context);

  return result;
}

/**
 * Calculate reimbursement for a full bulletin (list of actes).
 * Updates the annual context progressively as each acte is processed.
 */
export function calculateBulletin(
  actes: Acte[],
  contract: Contract,
  context: AnnualContext,
): BulletinResult {
  const results: ActeResult[] = [];
  let totalRembourse = 0;
  let totalFacture = 0;

  // Work on a mutable copy of context to track cumulative consumption within this bulletin
  const ctx = structuredClone(context);

  for (const acte of actes) {
    const result = calculateActe(acte, contract, ctx);
    results.push(result);

    totalRembourse += result.montantRembourse;
    totalFacture += result.montantFacture;

    // Update context for subsequent actes in the same bulletin
    const benId = acte.beneficiaire.id;
    if (!ctx.byBeneficiaire[benId]) {
      ctx.byBeneficiaire[benId] = { totalReimbursed: 0, byCareType: {} };
    }
    const benCtx = ctx.byBeneficiaire[benId]!;
    benCtx.totalReimbursed += result.montantRembourse;
    benCtx.byCareType[acte.care_type] =
      (benCtx.byCareType[acte.care_type] ?? 0) + result.montantRembourse;
  }

  return { actes: results, totalRembourse, totalFacture };
}
