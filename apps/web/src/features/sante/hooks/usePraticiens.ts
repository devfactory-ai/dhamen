/**
 * Praticiens hooks for SoinFlow
 */
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';

// ============================================
// Types
// ============================================

export interface SantePraticien {
  id: string;
  nom: string;
  prenom?: string;
  specialite: string;
  adresse?: string;
  ville?: string;
  codePostal?: string;
  telephone?: string;
  email?: string;
  conventionnement: 'conventionne' | 'non_conventionne' | 'partiellement';
  tauxRemboursement?: number;
  horaires?: string;
  latitude?: number;
  longitude?: number;
  estActif: boolean;
  createdAt: string;
}

interface PraticiensFilters {
  specialite?: string;
  ville?: string;
  conventionnement?: string;
  search?: string;
}

interface PraticiensResponse {
  success: boolean;
  data: SantePraticien[];
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

// ============================================
// Hooks
// ============================================

/**
 * Fetch praticiens list with filters
 */
export function usePraticiens(
  page = 1,
  limit = 20,
  filters: PraticiensFilters = {}
) {
  return useQuery({
    queryKey: ['sante-praticiens', page, limit, filters],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set('page', page.toString());
      params.set('limit', limit.toString());
      if (filters.specialite) params.set('specialite', filters.specialite);
      if (filters.ville) params.set('ville', filters.ville);
      if (filters.conventionnement) params.set('conventionnement', filters.conventionnement);
      if (filters.search) params.set('search', filters.search);

      const response = await apiClient.get<PraticiensResponse>(
        `/sante/praticiens?${params.toString()}`
      );

      if (!response.success) {
        throw new Error(response.error?.message || 'Failed to fetch praticiens');
      }

      return response.data;
    },
  });
}

/**
 * Fetch single praticien by ID
 */
export function usePraticienById(id: string | null) {
  return useQuery({
    queryKey: ['sante-praticien', id],
    queryFn: async () => {
      if (!id) return null;

      const response = await apiClient.get<{ success: boolean; data: SantePraticien }>(
        `/sante/praticiens/${id}`
      );

      if (!response.success) {
        throw new Error(response.error?.message || 'Failed to fetch praticien');
      }

      return response.data?.data;
    },
    enabled: !!id,
  });
}

/**
 * Fetch specialites for filter
 */
export function useSpecialites() {
  return useQuery({
    queryKey: ['sante-specialites'],
    queryFn: async () => {
      const response = await apiClient.get<{ success: boolean; data: string[] }>(
        '/sante/praticiens/specialites'
      );

      if (!response.success) {
        return [];
      }

      return response.data?.data || [];
    },
  });
}

/**
 * Fetch villes for filter
 */
export function useVilles() {
  return useQuery({
    queryKey: ['sante-villes'],
    queryFn: async () => {
      const response = await apiClient.get<{ success: boolean; data: string[] }>(
        '/sante/praticiens/villes'
      );

      if (!response.success) {
        return [];
      }

      return response.data?.data || [];
    },
  });
}

// ============================================
// Helper exports
// ============================================

export const CONVENTIONNEMENT_LABELS: Record<string, string> = {
  conventionne: 'Conventionne',
  non_conventionne: 'Non conventionne',
  partiellement: 'Partiellement conventionne',
};

export const CONVENTIONNEMENT_COLORS: Record<string, string> = {
  conventionne: 'bg-green-100 text-green-800',
  non_conventionne: 'bg-red-100 text-red-800',
  partiellement: 'bg-yellow-100 text-yellow-800',
};

export const SPECIALITES_COMMON = [
  'Medecine generale',
  'Cardiologie',
  'Dermatologie',
  'Gynecologie',
  'Ophtalmologie',
  'ORL',
  'Pediatrie',
  'Psychiatrie',
  'Radiologie',
  'Stomatologie',
  'Pharmacie',
  'Laboratoire',
  'Kinesitherapie',
  'Dentaire',
];

export type { PraticiensFilters };
