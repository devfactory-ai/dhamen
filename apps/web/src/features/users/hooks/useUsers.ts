import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import type { UserPublic } from '@dhamen/shared';

interface UsersResponse {
  users: UserPublic[];
  total: number;
}

interface CreateUserData {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  role: string;
  phone?: string;
  providerId?: string;
  insurerId?: string;
}

interface UpdateUserData {
  firstName?: string;
  lastName?: string;
  phone?: string;
  role?: string;
  isActive?: boolean;
}

export function useUsers(page = 1, limit = 20) {
  return useQuery({
    queryKey: ['users', page, limit],
    queryFn: async () => {
      const response = await apiClient.get<UsersResponse>('/users', {
        params: { page, limit },
      });
      if (!response.success) {
        throw new Error(response.error?.message || 'Erreur lors du chargement des utilisateurs');
      }
      return response.data;
    },
  });
}

export function useUser(id: string) {
  return useQuery({
    queryKey: ['users', id],
    queryFn: async () => {
      const response = await apiClient.get<UserPublic>(`/users/${id}`);
      if (!response.success) {
        throw new Error(response.error?.message || 'Erreur lors du chargement de l\'utilisateur');
      }
      return response.data;
    },
    enabled: !!id,
  });
}

export function useCreateUser() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: CreateUserData) => {
      const response = await apiClient.post<UserPublic>('/users', data);
      if (!response.success) {
        throw new Error(response.error?.message || 'Erreur lors de la création de l\'utilisateur');
      }
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
    },
  });
}

export function useUpdateUser() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: UpdateUserData }) => {
      const response = await apiClient.put<UserPublic>(`/users/${id}`, data);
      if (!response.success) {
        throw new Error(response.error?.message || 'Erreur lors de la mise à jour de l\'utilisateur');
      }
      return response.data;
    },
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      queryClient.invalidateQueries({ queryKey: ['users', id] });
    },
  });
}

export function useDeleteUser() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const response = await apiClient.delete(`/users/${id}`);
      if (!response.success) {
        throw new Error(response.error?.message || 'Erreur lors de la suppression de l\'utilisateur');
      }
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
    },
  });
}
