/**
 * SoinFlow Eligibility Agent Types
 *
 * Types for verifying adherent eligibility for health reimbursements
 * based on formules de garantie and plafonds.
 */

import type { SanteTypeSoin, } from '@dhamen/shared';

export interface SanteEligibilityRequest {
  adherentId: string;
  typeSoin: SanteTypeSoin;
  montant: number;
  dateSoin: string;
  praticienId?: string;
}

export interface SanteEligibilityResult {
  eligible: boolean;
  adherent: AdherentInfo | null;
  formule: FormuleInfo | null;
  couverture: CouvertureInfo | null;
  plafonds: PlafondInfo[];
  raisons: EligibilityRaison[];
  scoreConfiance: number;
  tempsVerification: number;
  cacheResult: boolean;
}

export interface AdherentInfo {
  id: string;
  nom: string;
  prenom: string;
  matricule: string | null;
  dateNaissance: string;
  estActif: boolean;
}

export interface FormuleInfo {
  id: string;
  code: string;
  nom: string;
  plafondGlobal: number | null;
  tauxCouverture: number;
}

export interface CouvertureInfo {
  typeSoin: SanteTypeSoin;
  tauxCouverture: number;
  plafond: number | null;
  plafondRestant: number;
  montantMaxCouvert: number;
  estConventionne: boolean;
}

export interface PlafondInfo {
  typeSoin: SanteTypeSoin | 'global';
  montantPlafond: number;
  montantConsomme: number;
  montantRestant: number;
  pourcentageUtilise: number;
}

export interface EligibilityRaison {
  code: EligibilityRaisonCode;
  message: string;
  severite: 'info' | 'avertissement' | 'erreur';
  details?: Record<string, unknown>;
}

export type EligibilityRaisonCode =
  | 'ADHERENT_ACTIF'
  | 'ADHERENT_INACTIF'
  | 'ADHERENT_NON_TROUVE'
  | 'FORMULE_VALIDE'
  | 'FORMULE_NON_TROUVEE'
  | 'FORMULE_EXPIREE'
  | 'TYPE_SOIN_COUVERT'
  | 'TYPE_SOIN_NON_COUVERT'
  | 'PLAFOND_DISPONIBLE'
  | 'PLAFOND_ATTEINT'
  | 'PLAFOND_PARTIEL'
  | 'PRATICIEN_CONVENTIONNE'
  | 'PRATICIEN_NON_CONVENTIONNE'
  | 'ELIGIBLE';

/**
 * Formule row from database
 */
export interface FormuleRow {
  id: string;
  code: string;
  nom: string;
  description: string | null;
  taux_couverture_json: string;
  plafonds_json: string;
  plafond_global: number | null;
  tarif_mensuel: number;
  is_active: number;
  effective_from: string;
  effective_to: string | null;
}

/**
 * Adherent row from database (extended for sante)
 */
export interface AdherentRow {
  id: string;
  first_name: string;
  last_name: string;
  date_of_birth: string;
  matricule: string | null;
  formule_id: string | null;
  plafond_global: number | null;
  is_active: number;
}

/**
 * Praticien row from database
 */
export interface PraticienRow {
  id: string;
  nom: string;
  prenom: string | null;
  specialite: string;
  est_conventionne: number;
  is_active: number;
}

/**
 * Plafond consomme row from database
 */
export interface PlafondConsommeRow {
  id: string;
  adherent_id: string;
  annee: number;
  type_soin: string;
  montant_consomme: number;
  montant_plafond: number;
}

/**
 * Generate cache key for eligibility results
 */
export function generateSanteCacheKey(request: SanteEligibilityRequest): string {
  return `sante:eligibility:${request.adherentId}:${request.typeSoin}:${request.dateSoin}`;
}
