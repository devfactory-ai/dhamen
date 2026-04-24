/**
 * Strategy: Letter-key coefficient calculation.
 * montant_rembourse = coefficient × letter_key_value
 * Used for: analyses (B), chirurgie (KC), radio (Z), dentaire (D), etc.
 */
import type { Acte, Guarantee, ActeResult } from '../types';
import { MissingLetterKeyError } from '../types';

export function calculateByLetterKey(
  acte: Acte,
  guarantee: Guarantee,
): ActeResult {
  const letterKey = acte.letter_key!;
  const coefficient = acte.coefficient!;

  // Find the letter key value (case-insensitive)
  const upperKey = letterKey.toUpperCase();
  const entry = guarantee.letter_keys.find(
    (lk) => lk.key.toUpperCase() === upperKey,
  );

  if (!entry) {
    throw new MissingLetterKeyError(letterKey, guarantee.care_type);
  }

  const unitValue = entry.value; // millimes
  const raw = coefficient * unitValue;
  // Cap at invoice amount: can't reimburse more than what was invoiced
  const montantRembourse = Math.min(raw, acte.montant);

  return {
    montantFacture: acte.montant,
    montantRembourse,
    strategieAppliquee: 'letter_key',
    plafondLimitant: null,
    calcul: `min(${coefficient} × ${unitValue}, ${acte.montant}) = ${montantRembourse}`,
  };
}
