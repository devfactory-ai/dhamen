/**
 * Types for familles d'actes and actes referentiel (REQ-009)
 */

export interface FamilleActe {
  id: string;
  code: string;
  label: string;
  ordre: number;
  isActive: boolean;
  createdAt: string;
}

export type TypeCalcul = 'taux' | 'forfait';

export interface ActeReferentielComplet {
  id: string;
  code: string;
  label: string;
  tauxRemboursement: number;
  plafondActe: number | null;
  isActive: boolean;
  familleId: string | null;
  typeCalcul: TypeCalcul;
  valeurBase: number | null;
  codeAssureur: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ActeAvecFamille extends ActeReferentielComplet {
  familleCode: string;
  familleLabel: string;
}

export interface ActesGroupeParFamille {
  famille: FamilleActe;
  actes: ActeReferentielComplet[];
}
