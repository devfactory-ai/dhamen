/**
 * SoinFlow Paiements hooks for gestionnaire
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';

// ============================================
// Types
// ============================================

export type PaiementStatut = 'en_attente' | 'valide' | 'paye' | 'annule';
export type PaiementMethode = 'virement' | 'cheque' | 'espece' | 'compensation';

export interface Paiement {
  id: string;
  numeroPaiement: string;
  demandeId: string;
  beneficiaireType: 'adherent' | 'praticien';
  beneficiaireId: string;
  montant: number;
  statut: PaiementStatut;
  methode: PaiementMethode | null;
  reference: string | null;
  dateValeur: string | null;
  traitePar: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

interface PaiementsResponse {
  success: boolean;
  data: Paiement[];
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

interface PaiementResponse {
  success: boolean;
  data: Paiement;
}

interface PaiementsStatsResponse {
  success: boolean;
  data: {
    totalPaiements: number;
    montantTotal: number;
    parStatut: Record<string, { count: number; total: number }>;
  };
}

interface PaiementsFilters {
  statut?: PaiementStatut;
  beneficiaireType?: 'adherent' | 'praticien';
  dateDebut?: string;
  dateFin?: string;
}

// ============================================
// Queries
// ============================================

export function usePaiements(
  page = 1,
  limit = 20,
  filters: PaiementsFilters = {}
) {
  return useQuery({
    queryKey: ['sante-paiements', page, limit, filters],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set('page', page.toString());
      params.set('limit', limit.toString());
      if (filters.statut) params.set('statut', filters.statut);
      if (filters.beneficiaireType) params.set('beneficiaireType', filters.beneficiaireType);
      if (filters.dateDebut) params.set('dateDebut', filters.dateDebut);
      if (filters.dateFin) params.set('dateFin', filters.dateFin);

      const response = await apiClient.get<PaiementsResponse>(
        `/sante/paiements?${params.toString()}`
      );
      if (!response.success) {
        throw new Error(response.error?.message || 'Failed to fetch paiements');
      }
      return response.data;
    },
  });
}

export function usePaiementById(id: string | null) {
  return useQuery({
    queryKey: ['sante-paiement', id],
    queryFn: async () => {
      if (!id) return null;
      const response = await apiClient.get<PaiementResponse>(
        `/sante/paiements/${id}`
      );
      if (!response.success) {
        throw new Error(response.error?.message || 'Failed to fetch paiement');
      }
      return response.data.data;
    },
    enabled: !!id,
  });
}

export function usePaiementsStats() {
  return useQuery({
    queryKey: ['sante-paiements-stats'],
    queryFn: async () => {
      const response = await apiClient.get<PaiementsStatsResponse>('/sante/paiements/stats');
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

export function useUpdatePaiementStatut() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      data,
    }: {
      id: string;
      data: { statut: PaiementStatut; methode?: PaiementMethode; reference?: string; notes?: string };
    }) => {
      const response = await apiClient.patch<PaiementResponse>(
        `/sante/paiements/${id}/statut`,
        data
      );
      if (!response.success) {
        throw new Error(response.error?.message || 'Failed to update paiement');
      }
      return response.data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sante-paiements'] });
      queryClient.invalidateQueries({ queryKey: ['sante-paiement'] });
      queryClient.invalidateQueries({ queryKey: ['sante-paiements-stats'] });
    },
  });
}

export function useBatchPaiements() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: {
      action: 'valider' | 'payer';
      paiementIds: string[];
      methode?: PaiementMethode;
      reference?: string;
    }) => {
      const response = await apiClient.post<{ success: boolean; data: { processed: number } }>(
        '/sante/paiements/batch',
        data
      );
      if (!response.success) {
        throw new Error(response.error?.message || 'Failed to process batch');
      }
      return response.data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sante-paiements'] });
      queryClient.invalidateQueries({ queryKey: ['sante-paiements-stats'] });
    },
  });
}

// ============================================
// Helpers
// ============================================

export const PAIEMENT_STATUTS_LABELS: Record<PaiementStatut, string> = {
  en_attente: 'En attente',
  valide: 'Valide',
  paye: 'Paye',
  annule: 'Annule',
};

export const PAIEMENT_STATUTS_COLORS: Record<PaiementStatut, string> = {
  en_attente: 'bg-yellow-100 text-yellow-800',
  valide: 'bg-blue-100 text-blue-800',
  paye: 'bg-green-100 text-green-800',
  annule: 'bg-gray-100 text-gray-800',
};

export const PAIEMENT_METHODES_LABELS: Record<PaiementMethode, string> = {
  virement: 'Virement',
  cheque: 'Cheque',
  espece: 'Espece',
  compensation: 'Compensation',
};
