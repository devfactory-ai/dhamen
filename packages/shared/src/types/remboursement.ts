/**
 * Types for reimbursement calculation (REQ-004)
 *
 * Domain rule:
 *   remboursement_brut = montant_acte × taux_remboursement
 *   remboursement_final = min(remboursement_brut, plafond_restant)
 */

export interface ActeInput {
  code: string;
  label: string;
  montantActe: number;
  tauxRemboursement: number;
}

export interface RemboursementActeResult {
  code: string;
  label: string;
  montantActe: number;
  tauxRemboursement: number;
  remboursementBrut: number;
  remboursementFinal: number;
  plafondDepasse: boolean;
}

export interface RemboursementBulletinResult {
  actes: RemboursementActeResult[];
  totalRembourse: number;
  plafondRestantApres: number;
}

export interface ActeReferentiel {
  id: string;
  code: string;
  label: string;
  tauxRemboursement: number;
  plafondActe: number | null;
  isActive: boolean;
}
