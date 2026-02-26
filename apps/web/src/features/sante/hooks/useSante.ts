/**
 * SoinFlow hooks for gestionnaire
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import type {
  SanteDemande,
  SanteDemandeAvecDetails,
  SanteStatutDemande,
  SanteTypeSoin,
  SanteSourceDemande,
} from '@dhamen/shared';

// ============================================
// Types
// ============================================

interface SanteDemandesResponse {
  success: boolean;
  data: SanteDemande[];
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

interface SanteDemandeResponse {
  success: boolean;
  data: SanteDemandeAvecDetails;
}

interface SanteStatsResponse {
  success: boolean;
  data: {
    total: number;
    parStatut: Record<string, number>;
    parTypeSoin: Record<string, number>;
    montantTotal: number;
    montantRembourse: number;
  };
}

interface UpdateStatutData {
  statut: SanteStatutDemande;
  montantRembourse?: number;
  motifRejet?: string;
  notesInternes?: string;
}

interface DemandesFilters {
  statut?: SanteStatutDemande;
  source?: SanteSourceDemande;
  typeSoin?: SanteTypeSoin;
  adherentId?: string;
  praticienId?: string;
  dateDebut?: string;
  dateFin?: string;
}

// ============================================
// Queries
// ============================================

export function useSanteDemandes(
  page = 1,
  limit = 20,
  filters: DemandesFilters = {}
) {
  return useQuery({
    queryKey: ['sante-demandes', page, limit, filters],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set('page', page.toString());
      params.set('limit', limit.toString());
      if (filters.statut) params.set('statut', filters.statut);
      if (filters.source) params.set('source', filters.source);
      if (filters.typeSoin) params.set('typeSoin', filters.typeSoin);
      if (filters.adherentId) params.set('adherentId', filters.adherentId);
      if (filters.dateDebut) params.set('dateDebut', filters.dateDebut);
      if (filters.dateFin) params.set('dateFin', filters.dateFin);

      const response = await apiClient.get<SanteDemandesResponse>(
        `/sante/demandes?${params.toString()}`
      );
      if (!response.success) {
        throw new Error(response.error?.message || 'Failed to fetch demandes');
      }
      return response.data;
    },
  });
}

export function useSanteDemandeById(id: string | null) {
  return useQuery({
    queryKey: ['sante-demande', id],
    queryFn: async () => {
      if (!id) return null;
      const response = await apiClient.get<SanteDemandeResponse>(
        `/sante/demandes/${id}`
      );
      if (!response.success) {
        throw new Error(response.error?.message || 'Failed to fetch demande');
      }
      return response.data.data;
    },
    enabled: !!id,
  });
}

export function useSanteStats() {
  return useQuery({
    queryKey: ['sante-stats'],
    queryFn: async () => {
      const response = await apiClient.get<SanteStatsResponse>('/sante/demandes/stats');
      if (!response.success) {
        throw new Error(response.error?.message || 'Failed to fetch stats');
      }
      return response.data.data;
    },
  });
}

// ============================================
// Mutations
// ============================================

export function useUpdateSanteDemandeStatut() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: UpdateStatutData }) => {
      const response = await apiClient.patch<SanteDemandeResponse>(
        `/sante/demandes/${id}/statut`,
        data
      );
      if (!response.success) {
        throw new Error(response.error?.message || 'Failed to update demande');
      }
      return response.data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sante-demandes'] });
      queryClient.invalidateQueries({ queryKey: ['sante-stats'] });
    },
  });
}

// ============================================
// Helper exports
// ============================================

export const SANTE_TYPE_SOINS_LABELS: Record<SanteTypeSoin, string> = {
  pharmacie: 'Pharmacie',
  consultation: 'Consultation',
  hospitalisation: 'Hospitalisation',
  optique: 'Optique',
  dentaire: 'Dentaire',
  laboratoire: 'Laboratoire',
  kinesitherapie: 'Kinésithérapie',
  autre: 'Autre',
};

export const SANTE_STATUTS_LABELS: Record<SanteStatutDemande, string> = {
  soumise: 'Soumise',
  en_examen: 'En examen',
  info_requise: 'Info requise',
  approuvee: 'Approuvée',
  en_paiement: 'En paiement',
  payee: 'Payée',
  rejetee: 'Rejetée',
};

export const SANTE_STATUTS_COLORS: Record<SanteStatutDemande, string> = {
  soumise: 'bg-blue-100 text-blue-800',
  en_examen: 'bg-yellow-100 text-yellow-800',
  info_requise: 'bg-orange-100 text-orange-800',
  approuvee: 'bg-green-100 text-green-800',
  en_paiement: 'bg-purple-100 text-purple-800',
  payee: 'bg-emerald-100 text-emerald-800',
  rejetee: 'bg-red-100 text-red-800',
};

export type { SanteDemande, SanteDemandeAvecDetails, DemandesFilters };
