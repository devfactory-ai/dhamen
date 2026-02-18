import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';

export interface Adherent {
  id: string;
  insurerId: string;
  insurerName?: string;
  contractId: string | null;
  memberNumber: string;
  nationalId: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  gender: 'M' | 'F';
  phone: string | null;
  email: string | null;
  address: string | null;
  city: string | null;
  relationship: 'PRIMARY' | 'SPOUSE' | 'CHILD' | 'PARENT';
  primaryAdherentId: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

interface AdherentsResponse {
  adherents: Adherent[];
  total: number;
}

interface CreateAdherentData {
  insurerId: string;
  contractId?: string;
  nationalId: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  gender: string;
  phone?: string;
  email?: string;
  address?: string;
  city?: string;
  relationship?: string;
  primaryAdherentId?: string;
}

export function useAdherents(page = 1, limit = 20, search?: string) {
  return useQuery({
    queryKey: ['adherents', page, limit, search],
    queryFn: async () => {
      const response = await apiClient.get<AdherentsResponse>('/adherents', {
        params: { page, limit, search },
      });
      if (!response.success) {
        throw new Error(response.error?.message || 'Erreur lors du chargement des adhérents');
      }
      return response.data;
    },
  });
}

export function useAdherent(id: string) {
  return useQuery({
    queryKey: ['adherents', id],
    queryFn: async () => {
      const response = await apiClient.get<Adherent>(`/adherents/${id}`);
      if (!response.success) {
        throw new Error(response.error?.message || 'Erreur lors du chargement de l\'adhérent');
      }
      return response.data;
    },
    enabled: !!id,
  });
}

export function useSearchAdherent(nationalId: string) {
  return useQuery({
    queryKey: ['adherents', 'search', nationalId],
    queryFn: async () => {
      const response = await apiClient.get<Adherent>(`/adherents/search`, {
        params: { nationalId },
      });
      if (!response.success) {
        throw new Error(response.error?.message || 'Adhérent non trouvé');
      }
      return response.data;
    },
    enabled: nationalId.length >= 8,
  });
}

export function useCreateAdherent() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: CreateAdherentData) => {
      const response = await apiClient.post<Adherent>('/adherents', data);
      if (!response.success) {
        throw new Error(response.error?.message || 'Erreur lors de la création de l\'adhérent');
      }
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['adherents'] });
    },
  });
}

export function useUpdateAdherent() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<CreateAdherentData> & { isActive?: boolean } }) => {
      const response = await apiClient.put<Adherent>(`/adherents/${id}`, data);
      if (!response.success) {
        throw new Error(response.error?.message || 'Erreur lors de la mise à jour de l\'adhérent');
      }
      return response.data;
    },
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ['adherents'] });
      queryClient.invalidateQueries({ queryKey: ['adherents', id] });
    },
  });
}

export function useDeleteAdherent() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const response = await apiClient.delete(`/adherents/${id}`);
      if (!response.success) {
        throw new Error(response.error?.message || 'Erreur lors de la suppression de l\'adhérent');
      }
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['adherents'] });
    },
  });
}
