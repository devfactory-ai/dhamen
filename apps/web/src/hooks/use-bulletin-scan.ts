import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { toast } from 'sonner';

interface UploadScanParams {
  bulletinId: string;
  file: File;
}

export function useBulletinScanUpload() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ bulletinId, file }: UploadScanParams) => {
      const formData = new FormData();
      formData.append('scan', file);

      const response = await apiClient.upload(`/bulletins-soins/agent/${bulletinId}/upload-scan`, formData);
      if (!response.success) throw new Error(response.error?.message);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agent-bulletins'] });
      toast.success('Scan uploade avec succes');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Erreur lors de l\'upload du scan');
    },
  });
}

export function getBulletinScanUrl(bulletinId: string): string {
  return `/api/v1/bulletins-soins/agent/${bulletinId}/scan`;
}
