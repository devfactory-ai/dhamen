import { useState, useCallback, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';

interface BulletinInQueue {
  id: string;
  bulletin_number: string;
  bulletin_date: string;
  adherent_matricule: string;
  adherent_first_name: string;
  adherent_last_name: string;
  adherent_national_id: string | null;
  beneficiary_name: string | null;
  provider_name: string | null;
  care_type: string;
  care_description: string | null;
  total_amount: number;
  reimbursed_amount: number | null;
  status: string;
  scan_url: string | null;
  actes: Array<{
    id: string;
    code: string | null;
    label: string;
    amount: number;
    taux_remboursement: number | null;
    montant_rembourse: number | null;
    ref_prof_sant: string | null;
    nom_prof_sant: string | null;
  }>;
}

interface UseBatchValidationQueueOptions {
  batchId: string | null;
}

export function useBatchValidationQueue({ batchId }: UseBatchValidationQueueOptions) {
  const queryClient = useQueryClient();
  const [currentIndex, setCurrentIndex] = useState(0);

  // Fetch all bulletins in this batch
  const { data: bulletins = [], isLoading } = useQuery({
    queryKey: ['batch-bulletins', batchId],
    queryFn: async () => {
      if (!batchId) return [];
      const response = await apiClient.get<BulletinInQueue[]>(`/bulletins-soins/agent?batchId=${batchId}&status=draft,in_batch,approved,rejected,processing`);
      if (!response.success) throw new Error(response.error?.message);

      // For each bulletin, fetch full detail with actes
      const detailed: BulletinInQueue[] = [];
      for (const b of (response.data || [])) {
        const detail = await apiClient.get<BulletinInQueue>(`/bulletins-soins/agent/${b.id}`);
        if (detail.success && detail.data) {
          detailed.push(detail.data);
        }
      }
      return detailed;
    },
    enabled: !!batchId,
  });

  const currentBulletin = bulletins[currentIndex] || null;

  const progress = useMemo(() => {
    const validated = bulletins.filter(b => b.status === 'approved').length;
    const rejected = bulletins.filter(b => b.status === 'rejected').length;
    const pending = bulletins.filter(b => !['approved', 'rejected'].includes(b.status)).length;
    return { validated, rejected, pending, total: bulletins.length };
  }, [bulletins]);

  const goToNext = useCallback(() => {
    // Find next unvalidated bulletin
    for (let i = currentIndex + 1; i < bulletins.length; i++) {
      if (!['approved', 'rejected'].includes(bulletins[i]!.status)) {
        setCurrentIndex(i);
        return;
      }
    }
    // Wrap around to find from beginning
    for (let i = 0; i < currentIndex; i++) {
      if (!['approved', 'rejected'].includes(bulletins[i]!.status)) {
        setCurrentIndex(i);
        return;
      }
    }
    // All processed — stay at current
  }, [currentIndex, bulletins]);

  const goToPrevious = useCallback(() => {
    if (currentIndex > 0) setCurrentIndex(currentIndex - 1);
  }, [currentIndex]);

  const goToIndex = useCallback((index: number) => {
    if (index >= 0 && index < bulletins.length) setCurrentIndex(index);
  }, [bulletins.length]);

  const refreshBulletins = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['batch-bulletins', batchId] });
  }, [queryClient, batchId]);

  const isComplete = progress.pending === 0 && progress.total > 0;

  return {
    bulletins,
    currentIndex,
    currentBulletin,
    progress,
    isLoading,
    goToNext,
    goToPrevious,
    goToIndex,
    refreshBulletins,
    isComplete,
  };
}
