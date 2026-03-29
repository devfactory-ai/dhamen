import { useState, useCallback, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';

interface BulletinActe {
  id: string;
  code: string | null;
  label: string;
  amount: number;
  taux_remboursement: number | null;
  montant_rembourse: number | null;
  ref_prof_sant: string | null;
  nom_prof_sant: string | null;
}

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
  actes: BulletinActe[];
  plafond_global?: number | null;
  plafond_consomme?: number | null;
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

      // Step 1: Get bulletin list for this batch
      const response = await apiClient.get(
        `/bulletins-soins/agent?batchId=${batchId}&status=draft,in_batch,approved,rejected,processing`
      );
      if (!response.success) {
        console.error('[batch-queue] list error:', response.error);
        throw new Error(response.error?.message || 'Failed to fetch batch bulletins');
      }

      const list = (response.data || []) as Array<{ id: string }>;
      if (list.length === 0) return [];

      // Step 2: Fetch detail (with actes) for each bulletin
      const detailed: BulletinInQueue[] = [];
      for (const item of list) {
        try {
          const detail = await apiClient.get(`/bulletins-soins/agent/${item.id}`);
          if (detail.success && detail.data) {
            const d = detail.data as Record<string, unknown>;
            detailed.push({
              id: (d.id as string) || item.id,
              bulletin_number: (d.bulletin_number as string) || '',
              bulletin_date: (d.bulletin_date as string) || '',
              adherent_matricule: (d.adherent_matricule as string) || '',
              adherent_first_name: (d.adherent_first_name as string) || '',
              adherent_last_name: (d.adherent_last_name as string) || '',
              adherent_national_id: (d.adherent_national_id as string) || null,
              beneficiary_name: (d.beneficiary_name as string) || null,
              provider_name: (d.provider_name as string) || null,
              care_type: (d.care_type as string) || 'consultation',
              care_description: (d.care_description as string) || null,
              total_amount: (d.total_amount as number) || 0,
              reimbursed_amount: (d.reimbursed_amount as number) || null,
              status: (d.status as string) || 'draft',
              scan_url: (d.scan_url as string) || null,
              actes: ((d.actes as BulletinActe[]) || []),
              plafond_global: (d.plafond_global as number) || null,
              plafond_consomme: (d.plafond_consomme as number) || null,
            });
          }
        } catch (err) {
          console.error(`[batch-queue] detail error for ${item.id}:`, err);
        }
      }
      return detailed;
    },
    enabled: !!batchId,
    refetchOnWindowFocus: false,
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
