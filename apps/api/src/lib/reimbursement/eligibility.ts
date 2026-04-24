/**
 * Eligibility checks — returns null if eligible, rejection reason string if not.
 */
import type { Acte, Contract, Guarantee } from './types';

export function checkEligibility(
  acte: Acte,
  contract: Contract,
  guarantee: Guarantee,
): string | null {
  // 0. Invalid amount
  if (acte.montant < 0) {
    return 'invalid_negative_amount';
  }

  // 1. Carence period
  if (contract.carence_days > 0) {
    const effectiveDate = new Date(contract.effective_date);
    const acteDate = new Date(acte.date);
    const carenceEnd = new Date(effectiveDate);
    carenceEnd.setDate(carenceEnd.getDate() + contract.carence_days);
    if (acteDate < carenceEnd) {
      return 'within_carence_period';
    }
  }

  // 2. Beneficiary coverage
  const ben = acte.beneficiaire;
  if (ben.type === 'spouse' && !contract.covers_spouse) {
    return 'spouse_not_covered';
  }
  if (ben.type === 'child' && !contract.covers_children) {
    return 'children_not_covered';
  }
  if (ben.type === 'child' && contract.children_max_age != null && ben.age > contract.children_max_age) {
    // Exception: students up to 28, disabled no limit
    if (ben.status === 'student' && ben.age <= 28) {
      // OK
    } else if (ben.status === 'disabled') {
      // OK — no age limit
    } else {
      return `child_age_exceeded (${ben.age} > ${contract.children_max_age})`;
    }
  }

  // 3. Guarantee age limit (strict: age must be < age_limit, not <=)
  if (guarantee.age_limit != null && ben.age >= guarantee.age_limit) {
    return `age >= age_limit (${guarantee.age_limit})`;
  }

  // 4. Prescription requirement
  if (guarantee.requires_prescription && !acte.has_prescription) {
    return 'prescription_required';
  }

  return null;
}
