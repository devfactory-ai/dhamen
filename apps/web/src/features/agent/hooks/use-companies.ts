import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';

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

interface CompaniesResponse {
  data: Company[];
  meta: { page: number; limit: number; total: number };
}

export function useCompanies(search?: string) {
  return useQuery({
    queryKey: ['companies', 'agent', search],
    queryFn: async () => {
      const params: Record<string, string | number> = {
        isActive: 'true',
        limit: 100,
      };
      if (search) {
        params.search = search;
      }
      const response = await apiClient.get<CompaniesResponse>('/companies', { params });
      if (!response.success) {
        throw new Error(response.error?.message || 'Erreur lors du chargement des entreprises');
      }
      return response.data;
    },
  });
}
