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
