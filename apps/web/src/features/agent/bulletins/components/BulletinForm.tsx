/**
 * BulletinForm - Reusable bulletin form component for agent saisie.
 *
 * This module re-exports the bulletin form section with the ActeSelector
 * grouped by famille, plus the observation and healthcare professional fields.
 *
 * The main form logic currently lives in BulletinsSaisiePage.tsx.
 * This component provides the acte line item rendering for use in
 * other contexts (e.g., editing, OCR pre-fill).
 */

export { ActeSelector } from './ActeSelector';
export type { ActeSelectionResult } from './ActeSelector';

/**
 * Acte form field schema shape for React Hook Form:
 *
 * {
 *   code: string          - Code acte (e.g., 'C1', 'PH1')
 *   label: string         - Libelle acte
 *   amount: number        - Montant
 *   ref_prof_sant: string - Reference professionnel de sante
 *   nom_prof_sant: string - Nom professionnel de sante
 *   cod_msgr: string      - Code observation/message
 *   lib_msgr: string      - Libelle observation/message
 * }
 */
export interface ActeFormFields {
  code?: string;
  label: string;
  amount: number;
  ref_prof_sant: string;
  nom_prof_sant: string;
  care_description?: string;
  cod_msgr?: string;
  lib_msgr?: string;
}
