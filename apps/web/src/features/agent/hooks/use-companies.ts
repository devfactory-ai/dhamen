import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { getUser } from '@/lib/auth';

interface Company {
  id: string;
  name: string;
  matricule_fiscal: string;
  address: string | null;
  city: string | null;
  sector: string | null;
  employee_count: number | null;
  is_active: number;
}

export function useCompanies(search?: string) {
  const user = getUser();

  return useQuery({
    queryKey: ['companies', 'agent', user?.insurerId, search],
    queryFn: async () => {
      const params: Record<string, string | number> = {
        limit: 100,
      };
      if (user?.insurerId) {
        params.insurerId = user.insurerId;
      }
      if (search) {
        params.search = search;
      }
      const response = await apiClient.get<Company[]>('/companies', { params });
      if (!response.success) {
        throw new Error(response.error?.message || 'Erreur lors du chargement des entreprises');
      }
      return response.data;
    },
  });
}
