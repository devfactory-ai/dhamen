import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';

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
