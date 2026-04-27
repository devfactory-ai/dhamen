/**
 * Adherent (insured person) types
 */

export type Gender = 'M' | 'F';

export interface Adherent {
  id: string;
  nationalIdEncrypted: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  gender: Gender | null;
  phoneEncrypted: string | null;
  email: string | null;
  address: string | null;
  city: string | null;
  lat: number | null;
  lng: number | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  // Extended fields
  matricule?: string | null;
  plafondGlobal?: number | null;
  plafondConsomme?: number | null;
  companyId?: string | null;
  companyName?: string | null;
  isActive?: boolean;
  lieuNaissance?: string | null;
  etatCivil?: string | null;
  dateMarriage?: string | null;
  dateDebutAdhesion?: string | null;
  dateFinAdhesion?: string | null;
  rang?: number | null;
  postalCode?: string | null;
  rue?: string | null;
  mobile?: string | null;
  banque?: string | null;
  rib?: string | null;
  regimeSocial?: string | null;
  handicap?: boolean;
  fonction?: string | null;
  maladiChronique?: boolean;
  matriculeConjoint?: string | null;
  typePieceIdentite?: string | null;
  dateEditionPiece?: string | null;
  contreVisiteObligatoire?: boolean;
  etatFiche?: string | null;
  credit?: number | null;
  contractNumber?: string | null;
  parentAdherentId?: string | null;
  codeType?: string | null;
}

export interface AdherentPublic {
  id: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  gender: Gender | null;
  email: string | null;
  city: string | null;
  createdAt: string;
}

export interface AdherentCreate {
  nationalId: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  gender?: Gender;
  phone?: string;
  email?: string;
  address?: string;
  city?: string;
  lat?: number;
  lng?: number;
}

export interface AdherentUpdate {
  firstName?: string;
  lastName?: string;
  phone?: string;
  email?: string;
  address?: string;
  city?: string;
  lat?: number;
  lng?: number;
}

export interface AdherentFilters {
  city?: string;
  search?: string;
}

export type CodeType = 'A' | 'C' | 'E';
export type CodeSituationFam = 'C' | 'M' | 'D' | 'V';

export interface AdherentFamille extends Adherent {
  codeType: CodeType | null;
  parentAdherentId: string | null;
  rangPres: number;
  codeSituationFam: CodeSituationFam | null;
}

export interface FamilleComplete {
  principal: AdherentFamille;
  conjoint: AdherentFamille | null;
  enfants: AdherentFamille[];
}
