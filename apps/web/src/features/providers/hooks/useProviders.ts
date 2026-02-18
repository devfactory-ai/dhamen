import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';

export interface Provider {
  id: string;
  name: string;
  type: 'PHARMACY' | 'DOCTOR' | 'LAB' | 'CLINIC';
  registrationNumber: string;
  taxId: string | null;
  address: string;
  city: string;
  postalCode: string | null;
  phone: string;
  email: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

interface ProvidersResponse {
  providers: Provider[];
  total: number;
}

interface CreateProviderData {
  name: string;
  type: string;
  registrationNumber: string;
  taxId?: string;
  address: string;
  city: string;
  postalCode?: string;
  phone: string;
  email?: string;
}

export function useProviders(page = 1, limit = 20, type?: string) {
  return useQuery({
    queryKey: ['providers', page, limit, type],
    queryFn: async () => {
      const response = await apiClient.get<ProvidersResponse>('/providers', {
        params: { page, limit, type },
      });
      if (!response.success) {
        throw new Error(response.error?.message || 'Erreur lors du chargement des prestataires');
      }
      return response.data;
    },
  });
}

export function useProvider(id: string) {
  return useQuery({
    queryKey: ['providers', id],
    queryFn: async () => {
      const response = await apiClient.get<Provider>(`/providers/${id}`);
      if (!response.success) {
        throw new Error(response.error?.message || 'Erreur lors du chargement du prestataire');
      }
      return response.data;
    },
    enabled: !!id,
  });
}

export function useCreateProvider() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: CreateProviderData) => {
      const response = await apiClient.post<Provider>('/providers', data);
      if (!response.success) {
        throw new Error(response.error?.message || 'Erreur lors de la création du prestataire');
      }
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['providers'] });
    },
  });
}

export function useUpdateProvider() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<CreateProviderData> & { isActive?: boolean } }) => {
      const response = await apiClient.put<Provider>(`/providers/${id}`, data);
      if (!response.success) {
        throw new Error(response.error?.message || 'Erreur lors de la mise à jour du prestataire');
      }
      return response.data;
    },
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ['providers'] });
      queryClient.invalidateQueries({ queryKey: ['providers', id] });
    },
  });
}

export function useDeleteProvider() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const response = await apiClient.delete(`/providers/${id}`);
      if (!response.success) {
        throw new Error(response.error?.message || 'Erreur lors de la suppression du prestataire');
      }
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['providers'] });
    },
  });
}
