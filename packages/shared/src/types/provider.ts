/**
 * Healthcare provider types
 */

export const PROVIDER_TYPES = ['pharmacist', 'doctor', 'lab', 'clinic'] as const;

export type ProviderType = (typeof PROVIDER_TYPES)[number];

export interface Provider {
  id: string;
  type: ProviderType;
  name: string;
  licenseNo: string;
  speciality: string | null;
  address: string;
  city: string;
  lat: number | null;
  lng: number | null;
  phone: string | null;
  email: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface ProviderCreate {
  type: ProviderType;
  name: string;
  licenseNo: string;
  speciality?: string;
  address: string;
  city: string;
  lat?: number;
  lng?: number;
  phone?: string;
  email?: string;
}

export interface ProviderUpdate {
  name?: string;
  speciality?: string;
  address?: string;
  city?: string;
  lat?: number;
  lng?: number;
  phone?: string;
  email?: string;
  isActive?: boolean;
}

export interface ProviderFilters {
  type?: ProviderType;
  city?: string;
  isActive?: boolean;
  search?: string;
}
