/**
 * SoinFlow Tarification Agent Types
 *
 * Types for calculating health reimbursement coverage amounts
 * based on formules de garantie and taux de couverture.
 */

import type { SanteTypeSoin } from '@dhamen/shared';

export interface SanteTarificationRequest {
  adherentId: string;
  formuleId: string;
  typeSoin: SanteTypeSoin;
  montantDemande: number;
  dateSoin: string;
  praticienId?: string;
  codeActe?: string;
}

export interface SanteTarificationResult {
  montantDemande: number;
  montantEligible: number;
  montantCouvert: number;
  montantResteCharge: number;
  tauxCouverture: number;
  plafondApplique: boolean;
  details: TarificationDetails;
  avertissements: TarificationAvertissement[];
  tempsCalcul: number;
}

export interface TarificationDetails {
  formuleCode: string;
  formuleName: string;
  typeSoin: SanteTypeSoin;
  tauxBase: number;
  bonusConventionne: number;
  tauxFinal: number;
  plafondTypeSoin: number | null;
  plafondRestant: number | null;
  montantAvantPlafond: number;
  montantApresPlafond: number;
  depassementHonoraires: number;
}

export interface TarificationAvertissement {
  code: TarificationAvertissementCode;
  message: string;
  severite: 'info' | 'avertissement' | 'erreur';
  details?: Record<string, unknown>;
}

export type TarificationAvertissementCode =
  | 'FORMULE_NON_TROUVEE'
  | 'TYPE_SOIN_NON_COUVERT'
  | 'PLAFOND_DEPASSE'
  | 'PLAFOND_PROCHE'
  | 'PRATICIEN_NON_CONVENTIONNE'
  | 'DEPASSEMENT_HONORAIRES'
  | 'MONTANT_ELEVE';

/**
 * Formule row from database
 */
export interface FormuleRow {
  id: string;
  code: string;
  nom: string;
  taux_couverture_json: string;
  plafonds_json: string;
  plafond_global: number | null;
}

/**
 * Praticien row from database
 */
export interface PraticienRow {
  id: string;
  est_conventionne: number;
}

/**
 * Plafond consomme row from database
 */
export interface PlafondConsommeRow {
  type_soin: string;
  montant_consomme: number;
  montant_plafond: number;
}
