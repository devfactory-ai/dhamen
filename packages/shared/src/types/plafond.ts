/**
 * Types for plafonds bénéficiaire (REQ-009)
 * Tracks reimbursement ceilings per bénéficiaire (adhérent/conjoint/enfant)
 */

export type TypeMaladie = 'ordinaire' | 'chronique';

export interface PlafondBeneficiaire {
  id: string;
  adherentId: string;
  contractId: string;
  annee: number;
  familleActeId: string | null;
  typeMaladie: TypeMaladie;
  montantPlafond: number;
  montantConsomme: number;
  createdAt: string;
  updatedAt: string;
}

/** @deprecated Use PlafondBeneficiaire */
export type PlafondPrestataire = PlafondBeneficiaire;

export interface PlafondAvecFamille extends PlafondBeneficiaire {
  familleCode: string | null;
  familleLabel: string | null;
  pourcentageConsomme: number;
  montantRestant: number;
  /** true when this is the family-shared global plafond (from principal adherent) */
  isSharedFamily?: boolean;
}

export interface PlafondsResume {
  global: PlafondAvecFamille | null;
  parFamille: PlafondAvecFamille[];
  totalConsomme: number;
  totalPlafond: number;
}
