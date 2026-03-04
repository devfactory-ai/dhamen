import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';

export interface Claim {
  id: string;
  numeroDemande: string;
  adherentId: string;
  adherent?: { firstName: string; lastName: string };
  praticien?: { nom: string } | null;
  praticienId: string | null;
  typeSoin: 'pharmacie' | 'consultation' | 'hospitalisation' | 'optique' | 'dentaire' | 'laboratoire' | 'kinesitherapie' | 'autre';
  statut: 'soumise' | 'en_examen' | 'info_requise' | 'approuvee' | 'en_paiement' | 'payee' | 'rejetee';
  montantDemande: number;
  montantRembourse: number | null;
  montantResteCharge: number | null;
  estTiersPayant: boolean;
  montantPraticien: number | null;
  dateSoin: string;
  scoreFraude: number | null;
  motifRejet: string | null;
  notesInternes: string | null;
  createdAt: string;
  updatedAt: string;
}

interface CreateClaimData {
  adherentId: string;
  typeSoin: string;
  montantDemande: number;
  dateSoin: string;
  praticienId?: string;
}

interface ProcessClaimData {
  statut: 'approuvee' | 'rejetee' | 'en_examen' | 'info_requise';
  montantRembourse?: number;
  motifRejet?: string;
  notesInternes?: string;
}

export function useClaims(page = 1, limit = 20, filters?: { statut?: string; typeSoin?: string }) {
  return useQuery({
    queryKey: ['sante-demandes', page, limit, filters],
    queryFn: async () => {
      const params: Record<string, string | number> = { page, limit };
      if (filters?.statut) params.statut = filters.statut;
      if (filters?.typeSoin) params.typeSoin = filters.typeSoin;

      // apiClient.get returns the full JSON body: { success, data: [...], meta: {...} }
      const response = await apiClient.get<Claim[]>('/sante/demandes', { params });
      if (!response.success) {
        throw new Error(response.error?.message || 'Erreur lors du chargement des PEC');
      }
      // Access meta from paginated response
      const fullResponse = response as unknown as { data: Claim[]; meta: { total: number } };
      return {
        claims: fullResponse.data ?? [],
        total: fullResponse.meta?.total ?? 0,
      };
    },
  });
}

export function useClaim(id: string) {
  return useQuery({
    queryKey: ['sante-demandes', id],
    queryFn: async () => {
      const response = await apiClient.get<Claim>(`/sante/demandes/${id}`);
      if (!response.success) {
        throw new Error(response.error?.message || 'Erreur lors du chargement de la PEC');
      }
      return response.data;
    },
    enabled: !!id,
  });
}

export function useCreateClaim() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: CreateClaimData) => {
      const response = await apiClient.post<Claim>('/sante/demandes', data);
      if (!response.success) {
        throw new Error(response.error?.message || 'Erreur lors de la création de la PEC');
      }
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sante-demandes'] });
    },
  });
}

export function useProcessClaim() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: ProcessClaimData }) => {
      const response = await apiClient.patch<Claim>(`/sante/demandes/${id}/statut`, data);
      if (!response.success) {
        throw new Error(response.error?.message || 'Erreur lors du traitement de la PEC');
      }
      return response.data;
    },
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ['sante-demandes'] });
      queryClient.invalidateQueries({ queryKey: ['sante-demandes', id] });
    },
  });
}

export function useClaimStats() {
  return useQuery({
    queryKey: ['sante-demandes', 'stats'],
    queryFn: async () => {
      const response = await apiClient.get<{
        total: number;
        parStatut: Record<string, number>;
        montantTotal: number;
        montantRembourse: number;
      }>('/sante/demandes/stats');
      if (!response.success) {
        throw new Error(response.error?.message || 'Erreur lors du chargement des statistiques');
      }
      return response.data;
    },
  });
}
