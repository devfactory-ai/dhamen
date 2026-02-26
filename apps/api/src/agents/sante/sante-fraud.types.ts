/**
 * SoinFlow Fraud Detection Agent Types
 *
 * Types for detecting fraudulent health reimbursement claims
 */

import type { SanteTypeSoin, SanteSourceDemande } from '@dhamen/shared';

export interface SanteFraudRequest {
  demandeId: string;
  adherentId: string;
  praticienId?: string;
  typeSoin: SanteTypeSoin;
  source: SanteSourceDemande;
  montant: number;
  dateSoin: string;
  heureSoin?: string;
  medicaments?: string[];
}

export interface SanteFraudResult {
  demandeId: string;
  scoreFraude: number;
  niveauRisque: NiveauRisque;
  actionRecommandee: ActionRecommandee;
  reglesActivees: RegleFraudeActivee[];
  analyseFrequence: FrequenceAnalyse;
  analyseMontant: MontantAnalyse;
  tempsAnalyse: number;
}

export type NiveauRisque = 'faible' | 'moyen' | 'eleve' | 'critique';

export type ActionRecommandee = 'auto_approuver' | 'revue_standard' | 'revue_approfondie' | 'bloquer';

export interface RegleFraudeActivee {
  code: RegleFraudeCode;
  nom: string;
  description: string;
  severite: 'faible' | 'moyenne' | 'elevee' | 'critique';
  impactScore: number;
  details?: Record<string, unknown>;
}

export type RegleFraudeCode =
  | 'DOUBLON_DEMANDE'
  | 'FREQUENCE_ELEVEE'
  | 'MONTANT_ANORMAL'
  | 'HEURE_SUSPECTE'
  | 'PRATICIEN_VOLUME_ELEVE'
  | 'ADHERENT_MULTI_PRATICIENS'
  | 'MEDICAMENTS_INCOMPATIBLES'
  | 'PATTERN_SUSPECT';

export interface FrequenceAnalyse {
  demandesAujourdhui: number;
  demandesSemaine: number;
  demandesMois: number;
  moyenneMensuelle: number;
  estAnormale: boolean;
  raisonAnomalie?: string;
}

export interface MontantAnalyse {
  montantDemande: number;
  montantMoyen: number;
  ecartType: number;
  scoreZ: number;
  estAnormal: boolean;
}

/**
 * Demande similaire pour détection de doublons
 */
export interface DemandeSimilaire {
  id: string;
  dateSoin: string;
  montant: number;
  typeSoin: string;
  similarite: number;
}

/**
 * Configuration règle de fraude depuis la DB
 */
export interface RegleFraudeConfig {
  id: string;
  code: string;
  nom: string;
  description: string;
  scoreBase: number;
  seuilActivation: number;
  severite: string;
  typeSoin: string | null;
  estActive: boolean;
}

/**
 * Calculate risk level from fraud score
 */
export function getNiveauRisque(score: number): NiveauRisque {
  if (score >= 80) {
    return 'critique';
  }
  if (score >= 60) {
    return 'eleve';
  }
  if (score >= 40) {
    return 'moyen';
  }
  return 'faible';
}

/**
 * Get recommended action based on risk level
 */
export function getActionRecommandee(
  niveauRisque: NiveauRisque,
  regles: RegleFraudeActivee[]
): ActionRecommandee {
  // Always block if critical rules triggered
  const hasCritical = regles.some((r) => r.severite === 'critique');
  if (hasCritical || niveauRisque === 'critique') {
    return 'bloquer';
  }

  if (niveauRisque === 'eleve') {
    return 'revue_approfondie';
  }

  if (niveauRisque === 'moyen') {
    return 'revue_standard';
  }

  return 'auto_approuver';
}
