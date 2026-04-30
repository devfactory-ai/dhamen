import { useEffect, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useOcrJobsStore } from '@/stores/ocr-jobs';
import { apiClient } from '@/lib/api-client';
import { toast } from 'sonner';
import type { OcrJob, PendingBulletin } from '@/features/bulletins/hooks/useBulkAnalyse';

/**
 * Global OCR job tracker — renders nothing visible.
 * Polls all active OCR jobs from the Zustand store and triggers
 * browser + toast notifications when a job completes.
 * Mount once in App.tsx alongside Toaster.
 */
export function OcrJobTracker() {
  const { activeJobs, removeJob, markNotified } = useOcrJobsStore();
  const queryClient = useQueryClient();

  // Poll all active (non-notified) jobs
  const pendingJobs = activeJobs.filter((j) => !j.notified);

  // Single query that polls all pending jobs in parallel
  const { data: jobResults } = useQuery({
    queryKey: ['ocr-jobs-global', pendingJobs.map((j) => j.jobId)],
    queryFn: async () => {
      const results = await Promise.allSettled(
        pendingJobs.map(async (job) => {
          const res = await apiClient.get<{ job: OcrJob; bulletins: PendingBulletin[] }>(
            `/bulletins-soins/agent/ocr-jobs/${job.jobId}`
          );
          if (!res.success) return null;
          return { jobId: job.jobId, ...res.data! };
        })
      );
      return results
        .filter((r): r is PromiseFulfilledResult<{ jobId: string; job: OcrJob; bulletins: PendingBulletin[] } | null> =>
          r.status === 'fulfilled' && r.value !== null
        )
        .map((r) => r.value!);
    },
    enabled: pendingJobs.length > 0,
    refetchInterval: pendingJobs.length > 0 ? 4000 : false,
  });

  const sendBrowserNotification = useCallback((title: string, body: string) => {
    if (!('Notification' in window)) return;
    if (Notification.permission === 'granted') {
      new Notification(title, { body, icon: '/icons/icon-192x192.png' });
    }
  }, []);

  // Check completed jobs and notify
  useEffect(() => {
    if (!jobResults) return;

    for (const result of jobResults) {
      if (!result) continue;
      const { jobId, job, bulletins } = result;
      const isComplete = job.status === 'completed' || job.status === 'failed';
      const allProcessed =
        job.total_bulletins_extracted > 0 &&
        job.bulletins_ready + job.bulletins_pending >= job.total_bulletins_extracted;

      if (isComplete || allProcessed) {
        const readyCount = bulletins.filter(
          (b) => b.validation_status === 'ready_for_validation'
        ).length;
        const errorCount = bulletins.filter(
          (b) => b.validation_status === 'pending_correction'
        ).length;

        // Toast notification (always visible in-app)
        if (job.status === 'failed' && bulletins.length === 0) {
          toast.error(`Analyse OCR échouée — aucun bulletin extrait`, {
            action: {
              label: 'Voir',
              onClick: () => {
                window.location.href = '/bulletins/saisie';
              },
            },
            duration: 10000,
          });
        } else {
          const msg = `${readyCount} bulletin(s) prêt(s)${errorCount > 0 ? `, ${errorCount} à corriger` : ''}`;
          toast.success(`Analyse OCR terminée — ${msg}`, {
            action: {
              label: 'Voir les bulletins',
              onClick: () => {
                window.location.href = '/bulletins/saisie';
              },
            },
            duration: 10000,
          });
        }

        // Browser notification (works even if tab is in background)
        sendBrowserNotification(
          'Analyse OCR terminée',
          `${bulletins.length} bulletin(s) analysé(s) — ${job.status === 'failed' ? 'avec erreurs' : 'prêt(s) à vérifier'}`
        );

        // Mark as notified so we stop polling this job
        markNotified(jobId);
        // Invalidate bulletin queries so other pages see fresh data
        queryClient.invalidateQueries({ queryKey: ['ocr-jobs'] });
        queryClient.invalidateQueries({ queryKey: ['pending-corrections'] });
        queryClient.invalidateQueries({ queryKey: ['bulletins'] });
      }
    }
  }, [jobResults, markNotified, sendBrowserNotification, queryClient]);

  // Request browser notification permission proactively (once)
  useEffect(() => {
    if (pendingJobs.length > 0 && 'Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }, [pendingJobs.length]);

  // Cleanup: remove jobs older than 24h
  useEffect(() => {
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    for (const job of activeJobs) {
      if (new Date(job.createdAt).getTime() < cutoff) {
        removeJob(job.jobId);
      }
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // This component renders nothing
  return null;
}
