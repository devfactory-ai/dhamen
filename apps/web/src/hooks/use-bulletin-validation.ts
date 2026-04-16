import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { toast } from 'sonner';

interface ValidateBulletinParams {
  id: string;
  reimbursed_amount: number;
  notes?: string;
}

export function useBulletinValidation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, reimbursed_amount, notes }: ValidateBulletinParams) => {
      const response = await apiClient.post(`/bulletins-soins/agent/${id}/validate`, {
        reimbursed_amount,
        notes,
      });
      if (!response.success) throw new Error(response.error?.message);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agent-bulletins'] });
      queryClient.invalidateQueries({ queryKey: ['agent-batches'] });
      // Refresh adherent data so plafond_consomme is up to date
      queryClient.invalidateQueries({ queryKey: ['adherents'] });
      queryClient.invalidateQueries({ queryKey: ['adherent-plafonds'] });
      toast.success('Bulletin validé avec succès');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Erreur lors de la validation');
    },
  });
}
