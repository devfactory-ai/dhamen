import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { refreshPermissions } from '@/lib/auth';

interface RoleSummary {
  id: string;
  label: string;
  description: string;
  isProtected: boolean;
  userCount: number;
  permissionsSummary: {
    resources: number;
    totalActions: number;
  };
}

interface LabeledItem {
  id: string;
  label: string;
}

interface RolesListResponse {
  roles: RoleSummary[];
  resources: LabeledItem[];
  actions: LabeledItem[];
}

interface RolePermissionsResponse {
  role: {
    id: string;
    label: string;
    description: string;
    isProtected: boolean;
  };
  permissions: Record<string, Record<string, boolean>>;
  resources: LabeledItem[];
  actions: LabeledItem[];
}

interface AssignRoleResponse {
  userId: string;
  previousRole: string;
  newRole: string;
  message: string;
}

export function useRoles() {
  return useQuery({
    queryKey: ['roles'],
    queryFn: async () => {
      const response = await apiClient.get<RolesListResponse>('/roles');
      if (!response.success) {
        throw new Error(response.error?.message || 'Erreur lors du chargement des rôles');
      }
      return response.data;
    },
  });
}

export function useRolePermissions(roleId: string | null) {
  return useQuery({
    queryKey: ['roles', roleId, 'permissions'],
    queryFn: async () => {
      const response = await apiClient.get<RolePermissionsResponse>(
        `/roles/${roleId}/permissions`
      );
      if (!response.success) {
        throw new Error(response.error?.message || 'Erreur lors du chargement des permissions');
      }
      return response.data;
    },
    enabled: !!roleId,
  });
}

export function useAssignRole() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: string }) => {
      const response = await apiClient.post<AssignRoleResponse>('/roles/assign', {
        userId,
        role,
      });
      if (!response.success) {
        throw new Error(response.error?.message || 'Erreur lors du changement de rôle');
      }
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      queryClient.invalidateQueries({ queryKey: ['roles'] });
    },
  });
}

export function useUpdatePermissions() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ roleId, permissions, password }: { roleId: string; permissions: { resource: string; action: string; is_granted: boolean }[]; password?: string }) => {
      const response = await apiClient.put<{ roleId: string; updated: number }>(
        `/roles/${roleId}/permissions`,
        { permissions, ...(password ? { password } : {}) }
      );
      if (!response.success) {
        throw new Error(response.error?.message || 'Erreur lors de la mise à jour des permissions');
      }
      return response.data;
    },
    onSuccess: async (_, { roleId }) => {
      queryClient.invalidateQueries({ queryKey: ['roles'] });
      queryClient.invalidateQueries({ queryKey: ['roles', roleId, 'permissions'] });
      // Refresh current user's permissions from server so changes apply immediately
      await refreshPermissions();
    },
  });
}

export function useCreateRole() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: { name: string; description: string; duplicateFromId?: string }) => {
      const response = await apiClient.post<{ id: string; name: string }>('/roles', data);
      if (!response.success) {
        throw new Error(response.error?.message || 'Erreur lors de la création du rôle');
      }
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['roles'] });
    },
  });
}

export function useDeleteRole() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (roleId: string) => {
      const response = await apiClient.delete<{ roleId: string; deleted: boolean }>(
        `/roles/${roleId}`
      );
      if (!response.success) {
        throw new Error(response.error?.message || 'Erreur lors de la suppression du rôle');
      }
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['roles'] });
    },
  });
}

export function useToggleRoleStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ roleId, isActive }: { roleId: string; isActive: boolean }) => {
      const response = await apiClient.put<{ roleId: string; isActive: boolean; usersCount: number }>(
        `/roles/${roleId}/statut`,
        { isActive }
      );
      if (!response.success) {
        throw new Error(response.error?.message || 'Erreur lors du changement de statut');
      }
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['roles'] });
    },
  });
}
