/**
 * SoinFlow Bordereaux hooks for gestionnaire
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';

// ============================================
// Types
// ============================================

export type BordereauStatut = 'genere' | 'valide' | 'envoye' | 'paye' | 'annule' | 'archive';

export interface Bordereau {
  id: string;
  numeroBordereau: string;
  periodeDebut: string;
  periodeFin: string;
  nombreDemandes: number;
  montantTotal: number;
  statut: BordereauStatut;
  dateGeneration: string;
  dateValidation: string | null;
  dateEnvoi: string | null;
  datePaiement: string | null;
  generePar: string;
  validePar: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface BordereauLigne {
  id: string;
  numeroBulletin: string;
  adherentNom: string;
  matricule: string | null;
  typeSoin: string;
  dateSoin: string;
  montantDemande: number;
  montantRembourse: number;
  status: string;
}

export interface BordereauAvecLignes extends Bordereau {
  lignes: BordereauLigne[];
}

interface BordereauxResponse {
  success: boolean;
  data: Bordereau[];
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

interface BordereauResponse {
  success: boolean;
  data: BordereauAvecLignes;
}

interface BordereauxStatsResponse {
  success: boolean;
  data: {
    totalBordereaux: number;
    totalDemandes: number;
    montantTotal: number;
    parStatut: Record<string, { count: number; total: number }>;
  };
}

interface BordereauxFilters {
  statut?: BordereauStatut;
  dateDebut?: string;
  dateFin?: string;
  search?: string;
}

// ============================================
// Queries
// ============================================

export function useBordereaux(
  page = 1,
  limit = 20,
  filters: BordereauxFilters = {}
) {
  return useQuery({
    queryKey: ['sante-bordereaux', page, limit, filters],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set('page', page.toString());
      params.set('limit', limit.toString());
      if (filters.statut) params.set('statut', filters.statut);
      if (filters.dateDebut) params.set('dateDebut', filters.dateDebut);
      if (filters.dateFin) params.set('dateFin', filters.dateFin);
      if (filters.search) params.set('search', filters.search);

      const response = await apiClient.get<Bordereau[]>(
        `/sante/bordereaux?${params.toString()}`
      );
      if (!response.success) {
        throw new Error(response.error?.message || 'Failed to fetch bordereaux');
      }
      // The API returns { success, data: [...], meta: {...} } at top level
      const raw = response as unknown as { success: boolean; data: Bordereau[]; meta: { page: number; limit: number; total: number; totalPages: number } };
      return { data: raw.data ?? [], meta: raw.meta ?? { page: 1, limit: 20, total: 0, totalPages: 1 } };
    },
  });
}

export function useBordereauById(id: string | null) {
  return useQuery({
    queryKey: ['sante-bordereau', id],
    queryFn: async () => {
      if (!id) return null;
      const response = await apiClient.get<BordereauAvecLignes>(
        `/sante/bordereaux/${id}`
      );
      if (!response.success) {
        throw new Error(response.error?.message || 'Failed to fetch bordereau');
      }
      return response.data;
    },
    enabled: !!id,
  });
}

export function useBordereauStats() {
  return useQuery({
    queryKey: ['sante-bordereaux-stats'],
    queryFn: async () => {
      const response = await apiClient.get<{ totalBordereaux: number; totalDemandes: number; montantTotal: number; parStatut: Record<string, { count: number; total: number }> }>('/sante/bordereaux/stats');
      if (!response.success) {
        throw new Error(response.error?.message || 'Failed to fetch stats');
      }
      return response.data;
    },
  });
}

// ============================================
// Mutations
// ============================================

export function useCreateBordereau() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: { periodeDebut: string; periodeFin: string; notes?: string }) => {
      const response = await apiClient.post<Bordereau>(
        '/sante/bordereaux',
        data
      );
      if (!response.success) {
        throw new Error(response.error?.message || 'Failed to create bordereau');
      }
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sante-bordereaux'] });
      queryClient.invalidateQueries({ queryKey: ['sante-bordereaux-stats'] });
    },
  });
}

export function useUpdateBordereauStatut() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: { statut: BordereauStatut; notes?: string } }) => {
      const response = await apiClient.patch<Bordereau>(
        `/sante/bordereaux/${id}/statut`,
        data
      );
      if (!response.success) {
        throw new Error(response.error?.message || 'Failed to update bordereau');
      }
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sante-bordereaux'] });
      queryClient.invalidateQueries({ queryKey: ['sante-bordereau'] });
      queryClient.invalidateQueries({ queryKey: ['sante-bordereaux-stats'] });
    },
  });
}

// ============================================
// Helpers
// ============================================

export function useBulkArchiveBordereaux() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (ids: string[]) => {
      const response = await apiClient.post<{ archived: number }>(
        '/sante/bordereaux/bulk-archive',
        { ids }
      );
      if (!response.success) {
        throw new Error(response.error?.message || 'Failed to archive bordereaux');
      }
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sante-bordereaux'] });
      queryClient.invalidateQueries({ queryKey: ['sante-bordereaux-stats'] });
    },
  });
}

export function useBulkDeleteBordereaux() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (ids: string[]) => {
      const response = await apiClient.post<{ deleted: number }>(
        '/sante/bordereaux/bulk-delete',
        { ids }
      );
      if (!response.success) {
        throw new Error(response.error?.message || 'Failed to delete bordereaux');
      }
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sante-bordereaux'] });
      queryClient.invalidateQueries({ queryKey: ['sante-bordereaux-stats'] });
    },
  });
}

export const BORDEREAU_STATUTS_LABELS: Record<BordereauStatut, string> = {
  genere: 'Généré',
  valide: 'Validé',
  envoye: 'Envoyé',
  paye: 'Payé',
  annule: 'Annulé',
  archive: 'Archivé',
};

export const BORDEREAU_STATUTS_COLORS: Record<BordereauStatut, string> = {
  genere: 'bg-blue-100 text-blue-800',
  valide: 'bg-green-100 text-green-800',
  envoye: 'bg-purple-100 text-purple-800',
  paye: 'bg-emerald-100 text-emerald-800',
  annule: 'bg-gray-100 text-gray-800',
  archive: 'bg-amber-100 text-amber-800',
};
