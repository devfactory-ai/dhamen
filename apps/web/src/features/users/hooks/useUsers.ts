import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import type { UserPublic } from '@dhamen/shared';



interface CreateUserData {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  role: string;
  phone?: string;
  providerId?: string;
  insurerId?: string;
  companyId?: string;
  mfaEnabled?: boolean;
}

interface UpdateUserData {
  firstName?: string;
  lastName?: string;
  phone?: string;
  role?: string;
  companyId?: string | null;
  isActive?: boolean;
  mfaEnabled?: boolean;
}

export function useUsers(page = 1, limit = 20, search?: string, role?: string, isActive?: string) {
  return useQuery({
    queryKey: ['users', page, limit, search, role, isActive],
    queryFn: async () => {
      const params: Record<string, string | number> = { page, limit };
      if (search) params.search = search;
      if (role) params.role = role;
      if (isActive) params.isActive = isActive;
      const response = await apiClient.get<{ data: UserPublic[]; meta: { total: number } }>('/users', {
        params,
      });
      if (!response.success) {
        throw new Error(response.error?.message || 'Erreur lors du chargement des utilisateurs');
      }
      return {
        users: response.data.data ?? [],
        total: response.data.meta?.total ?? 0,
      };
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
      const response = await apiClient.patch<UserPublic>(`/users/${id}`, data);
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

export function useBulkDeleteUsers() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (ids: string[]) => {
      const response = await apiClient.post<{ deleted: number; deactivated?: number; hardDeleted?: number }>('/users/bulk-delete', { ids });
      if (!response.success) {
        throw new Error(response.error?.message || 'Erreur lors de la suppression');
      }
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
    },
  });
}

// --- User permissions ---

export interface PermissionOverride {
  id: string;
  resource: string;
  action: string;
  isGranted: boolean;
  reason: string;
  expiresAt: string | null;
  grantedByName: string;
  createdAt: string;
}

interface UserPermissionsResponse {
  user: { id: string; firstName: string; lastName: string; role: string };
  rolePermissions: Record<string, Record<string, boolean>>;
  overrides: PermissionOverride[];
}

export function useUserPermissions(userId: string | null) {
  return useQuery({
    queryKey: ['user-permissions', userId],
    queryFn: async () => {
      const response = await apiClient.get<UserPermissionsResponse>(`/users/${userId}/permissions`);
      if (!response.success) {
        throw new Error(response.error?.message || 'Erreur lors du chargement des permissions');
      }
      return response.data;
    },
    enabled: !!userId,
  });
}

interface AddOverrideData {
  resource: string;
  action: string;
  isGranted: boolean;
  reason: string;
  expiresAt?: string | null;
}

export function useAddPermissionOverride() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ userId, data }: { userId: string; data: AddOverrideData }) => {
      const response = await apiClient.post(`/users/${userId}/permissions`, data);
      if (!response.success) {
        throw new Error(response.error?.message || 'Erreur lors de l\'ajout de la surcharge');
      }
      return response.data;
    },
    onSuccess: (_, { userId }) => {
      queryClient.invalidateQueries({ queryKey: ['user-permissions', userId] });
    },
  });
}

export function useRemovePermissionOverride() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ userId, permId }: { userId: string; permId: string }) => {
      const response = await apiClient.delete(`/users/${userId}/permissions/${permId}`);
      if (!response.success) {
        throw new Error(response.error?.message || 'Erreur lors de la suppression de la surcharge');
      }
      return response.data;
    },
    onSuccess: (_, { userId }) => {
      queryClient.invalidateQueries({ queryKey: ['user-permissions', userId] });
    },
  });
}
