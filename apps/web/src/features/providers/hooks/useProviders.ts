import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';

export interface Provider {
  id: string;
  name: string;
  type: string;
  licenseNo: string;
  speciality: string | null;
  mfNumber: string | null;
  address: string;
  city: string;
  phone: string | null;
  email: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

interface ProvidersResponse {
  providers: Provider[];
  total: number;
}

/** Map backend type → frontend display key */
const BACKEND_TO_FRONTEND_TYPE: Record<string, string> = {
  pharmacist: 'PHARMACY',
  doctor: 'DOCTOR',
  lab: 'LAB',
  clinic: 'CLINIC',
  hospital: 'HOSPITAL',
  dentist: 'DENTIST',
  optician: 'OPTICIAN',
  kinesitherapeute: 'KINESITHERAPEUTE',
};

interface CreateProviderData {
  name: string;
  type: string;
  licenseNo: string;
  speciality?: string;
  mfNumber?: string;
  address: string;
  city: string;
  phone?: string;
  email?: string;
}

export function useProviders(page = 1, limit = 20, type?: string) {
  return useQuery({
    queryKey: ['providers', page, limit, type],
    queryFn: async () => {
      const response = await apiClient.get<Provider[]>('/providers', {
        params: { page, limit, type },
      });
      if (!response.success) {
        throw new Error(response.error?.message || 'Erreur lors du chargement des praticiens');
      }
      // apiClient returns { success, data: [...], meta: {...} }
      const rawData = Array.isArray(response.data) ? response.data : [];
      const meta = (response as unknown as { meta?: { total: number } }).meta;
      const providers = rawData.map((p) => ({
        ...p,
        type: BACKEND_TO_FRONTEND_TYPE[p.type] || p.type,
      }));
      return { providers, total: meta?.total || providers.length };
    },
  });
}

export function useProvider(id: string) {
  return useQuery({
    queryKey: ['providers', id],
    queryFn: async () => {
      const response = await apiClient.get<Provider>(`/providers/${id}`);
      if (!response.success) {
        throw new Error(response.error?.message || 'Erreur lors du chargement du praticien');
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
        throw new Error(response.error?.message || 'Erreur lors de la création du praticien');
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
        throw new Error(response.error?.message || 'Erreur lors de la mise à jour du praticien');
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
        throw new Error(response.error?.message || 'Erreur lors de la suppression du praticien');
      }
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['providers'] });
    },
  });
}
