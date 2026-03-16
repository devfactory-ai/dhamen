/**
 * Types for plafonds prestataire (REQ-009)
 */

export type TypeMaladie = 'ordinaire' | 'chronique';

export interface PlafondPrestataire {
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

export interface PlafondAvecFamille extends PlafondPrestataire {
  familleCode: string | null;
  familleLabel: string | null;
  pourcentageConsomme: number;
  montantRestant: number;
}

export interface PlafondsResume {
  global: PlafondAvecFamille | null;
  parFamille: PlafondAvecFamille[];
  totalConsomme: number;
  totalPlafond: number;
}
