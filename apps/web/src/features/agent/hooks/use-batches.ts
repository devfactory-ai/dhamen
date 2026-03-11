import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';

interface Batch {
  id: string;
  name: string;
  status: string;
  company_id: string;
  created_by: string;
  created_at: string;
  bulletins_count: number;
  total_amount: number;
}

export function useBatches(companyId: string | null, status = 'open') {
  return useQuery({
    queryKey: ['batches', companyId, status],
    queryFn: async () => {
      const response = await apiClient.get<Batch[]>('/bulletins-soins/agent/batches', {
        params: { companyId: companyId!, status },
      });
      if (!response.success) {
        throw new Error(response.error?.message || 'Erreur lors du chargement des lots');
      }
      return response.data;
    },
    enabled: !!companyId,
  });
}

export function useCreateBatch() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: { name: string; companyId: string }) => {
      const response = await apiClient.post<{ id: string; name: string; companyId: string; status: string }>(
        '/bulletins-soins/agent/batches',
        data
      );
      if (!response.success) {
        throw new Error(response.error?.message || 'Erreur lors de la creation du lot');
      }
      return response.data;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['batches', variables.companyId] });
    },
  });
}
