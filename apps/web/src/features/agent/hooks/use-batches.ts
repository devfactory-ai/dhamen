import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';

export interface Batch {
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

/**
 * Export a batch as CTRL recap CSV (9 columns)
 * Downloads the file via Blob + temporary link
 */
export function useExportBatchCSV() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ batchId, force = false, token }: { batchId: string; force?: boolean; token: string | null }) => {
      const baseUrl = import.meta.env.VITE_API_URL || '/api/v1';
      const qs = force ? '?force=true' : '';
      const response = await fetch(`${baseUrl}/bulletins-soins/agent/batches/${batchId}/export${qs}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        if (response.status === 409) {
          throw new Error('Lot deja exporte');
        }
        if (response.status === 404) {
          throw new Error('Lot non trouve');
        }
        if (response.status === 403) {
          throw new Error('Acces non autorise');
        }
        throw new Error('Erreur export CSV');
      }

      // Extract filename from Content-Disposition header
      const disposition = response.headers.get('Content-Disposition');
      let filename = `dhamen_ctrl_${batchId}_${new Date().toISOString().slice(0, 10)}.csv`;
      if (disposition) {
        const match = disposition.match(/filename="?([^"]+)"?/);
        if (match?.[1]) {
          filename = match[1];
        }
      }

      // Download via Blob
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['batches'] });
    },
  });
}

/**
 * Export a batch as detailed bordereau CSV (12 columns, one row per acte)
 * Downloads the file via Blob + temporary link
 */
export function useExportBatchDetailCSV() {
  return useMutation({
    mutationFn: async ({ batchId, token }: { batchId: string; token: string | null }) => {
      const baseUrl = import.meta.env.VITE_API_URL || '/api/v1';
      const response = await fetch(`${baseUrl}/bulletins-soins/agent/batches/${batchId}/export-detail`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        if (response.status === 404) {
          throw new Error('Lot non trouve');
        }
        if (response.status === 403) {
          throw new Error('Acces non autorise');
        }
        throw new Error('Erreur export detaille');
      }

      // Extract filename from Content-Disposition header
      const disposition = response.headers.get('Content-Disposition');
      let filename = `dhamen_detail_${batchId}_${new Date().toISOString().slice(0, 10)}.csv`;
      if (disposition) {
        const match = disposition.match(/filename="?([^"]+)"?/);
        if (match?.[1]) {
          filename = match[1];
        }
      }

      // Download via Blob
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    },
  });
}
