import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';

export interface Insurer {
  id: string;
  name: string;
  code: string;
  type: 'INSURANCE' | 'MUTUAL';
  registrationNumber: string;
  taxId: string | null;
  address: string;
  city: string;
  postalCode: string | null;
  phone: string;
  email: string | null;
  website: string | null;
  logoUrl: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

interface InsurersResponse {
  insurers: Insurer[];
  total: number;
}

interface CreateInsurerData {
  name: string;
  code: string;
  type: string;
  registrationNumber: string;
  taxId?: string;
  address: string;
  city: string;
  postalCode?: string;
  phone: string;
  email?: string;
  website?: string;
}

export function useInsurers(page = 1, limit = 20) {
  return useQuery({
    queryKey: ['insurers', page, limit],
    queryFn: async () => {
      const response = await apiClient.get<InsurersResponse>('/insurers', {
        params: { page, limit },
      });
      if (!response.success) {
        throw new Error(response.error?.message || 'Erreur lors du chargement des assureurs');
      }
      return response.data;
    },
  });
}

export function useInsurer(id: string) {
  return useQuery({
    queryKey: ['insurers', id],
    queryFn: async () => {
      const response = await apiClient.get<Insurer>(`/insurers/${id}`);
      if (!response.success) {
        throw new Error(response.error?.message || 'Erreur lors du chargement de l\'assureur');
      }
      return response.data;
    },
    enabled: !!id,
  });
}

export function useCreateInsurer() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: CreateInsurerData) => {
      const response = await apiClient.post<Insurer>('/insurers', data);
      if (!response.success) {
        throw new Error(response.error?.message || 'Erreur lors de la création de l\'assureur');
      }
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['insurers'] });
    },
  });
}

export function useUpdateInsurer() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<CreateInsurerData> & { isActive?: boolean } }) => {
      const response = await apiClient.put<Insurer>(`/insurers/${id}`, data);
      if (!response.success) {
        throw new Error(response.error?.message || 'Erreur lors de la mise à jour de l\'assureur');
      }
      return response.data;
    },
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ['insurers'] });
      queryClient.invalidateQueries({ queryKey: ['insurers', id] });
    },
  });
}

export function useDeleteInsurer() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const response = await apiClient.delete(`/insurers/${id}`);
      if (!response.success) {
        throw new Error(response.error?.message || 'Erreur lors de la suppression de l\'assureur');
      }
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['insurers'] });
    },
  });
}
