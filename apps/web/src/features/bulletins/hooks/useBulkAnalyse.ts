import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';

// ---- Types ----

export interface OcrJob {
  id: string;
  company_id: string;
  batch_id: string | null;
  status: 'uploading' | 'processing_ocr' | 'extracting' | 'completed' | 'failed';
  total_files: number;
  total_bulletins_extracted: number;
  bulletins_ready: number;
  bulletins_pending: number;
  file_urls: string | null;
  error_message: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}

export interface ValidationError {
  field: string;
  code: string;
  message: string;
  value?: string;
}

export interface BulletinActe {
  id: string;
  code: string;
  label: string;
  amount: number;
  ref_prof_sant: string;
  nom_prof_sant: string;
  care_type: string;
}

export interface PendingBulletin {
  id: string;
  adherent_matricule: string | null;
  adherent_first_name: string | null;
  adherent_last_name: string | null;
  bulletin_date: string | null;
  bulletin_number: string | null;
  beneficiary_name: string | null;
  beneficiary_relationship: string | null;
  status: string;
  validation_status: string | null;
  validation_errors: string | null;
  validation_attempts: number;
  total_amount: number | null;
  company_id: string | null;
  ocr_job_id: string | null;
  created_at: string;
  actes: BulletinActe[];
}

// ---- Hooks ----

/**
 * Mutation: upload files for bulk OCR analysis
 */
export function useBulkAnalyseMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ files, companyId, batchId, grouping }: { files: File[]; companyId: string; batchId?: string; grouping?: Record<string, string[]> }) => {
      const formData = new FormData();
      formData.append('companyId', companyId);
      if (batchId) formData.append('batchId', batchId);
      if (grouping) formData.append('grouping', JSON.stringify(grouping));
      for (const file of files) {
        formData.append('files', file);
      }

      const res = await apiClient.upload<{
        jobId: string;
        totalFiles: number;
        totalExtracted: number;
        bulletinIds: string[];
      }>('/bulletins-soins/agent/analyse-bulk', formData);

      if (!res.success) throw new Error(res.error?.message || 'Erreur analyse en masse');
      return res.data!;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ocr-jobs'] });
      queryClient.invalidateQueries({ queryKey: ['pending-corrections'] });
    },
  });
}

/**
 * Query: poll OCR job status
 */
export function useOcrJobQuery(jobId: string | null) {
  return useQuery({
    queryKey: ['ocr-jobs', jobId],
    queryFn: async () => {
      const res = await apiClient.get<{ job: OcrJob; bulletins: PendingBulletin[] }>(
        `/bulletins-soins/agent/ocr-jobs/${jobId}`
      );
      if (!res.success) throw new Error(res.error?.message);
      return res.data!;
    },
    enabled: !!jobId,
    refetchInterval: (query) => {
      const data = query.state.data;
      if (!data) return 3000;
      const job = data.job;
      // Stop polling once job is completed/failed or all bulletins processed
      if (job.status === 'completed' || job.status === 'failed') return false;
      const totalProcessed = job.bulletins_ready + job.bulletins_pending;
      if (totalProcessed >= job.total_bulletins_extracted && job.total_bulletins_extracted > 0) return false;
      return 3000;
    },
  });
}

/**
 * Query: list OCR jobs
 */
export function useOcrJobsListQuery(companyId?: string, page = 1) {
  return useQuery({
    queryKey: ['ocr-jobs', 'list', companyId, page],
    queryFn: async () => {
      const params = new URLSearchParams({ page: String(page), limit: '20' });
      if (companyId) params.append('companyId', companyId);
      const res = await apiClient.get<OcrJob[]>(
        `/bulletins-soins/agent/ocr-jobs?${params.toString()}`
      ) as unknown as {
        success: boolean;
        data: OcrJob[];
        meta: { page: number; limit: number; total: number; totalPages: number };
        error?: { message: string };
      };
      if (!res.success) throw new Error(res.error?.message);
      return { data: res.data, meta: res.meta };
    },
  });
}

/**
 * Query: list bulletins pending correction
 */
export function usePendingCorrectionsQuery(companyId?: string, page = 1) {
  return useQuery({
    queryKey: ['pending-corrections', companyId, page],
    queryFn: async () => {
      const params = new URLSearchParams({ page: String(page), limit: '20' });
      if (companyId) params.append('companyId', companyId);
      const res = await apiClient.get<PendingBulletin[]>(
        `/bulletins-soins/agent/pending-corrections?${params.toString()}`
      ) as unknown as {
        success: boolean;
        data: PendingBulletin[];
        meta: { page: number; limit: number; total: number; totalPages: number };
        error?: { message: string };
      };
      if (!res.success) throw new Error(res.error?.message);
      return { data: res.data, meta: res.meta };
    },
  });
}

/**
 * Mutation: correct a bulletin and re-enqueue for validation
 */
export function useCorrectionMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ bulletinId, corrections }: {
      bulletinId: string;
      corrections: {
        adherent_matricule?: string;
        adherent_first_name?: string;
        adherent_last_name?: string;
        bulletin_date?: string;
        company_id?: string;
        bulletin_number?: string;
        beneficiary_name?: string;
        beneficiary_relationship?: string;
        actes?: Array<{ id: string; ref_prof_sant?: string; nom_prof_sant?: string; label?: string; amount?: number; code?: string; care_type?: string }>;
      };
    }) => {
      const res = await apiClient.put<{ id: string; validation_status: string }>(
        `/bulletins-soins/agent/${bulletinId}/correct`,
        corrections
      );
      if (!res.success) throw new Error(res.error?.message || 'Erreur correction');
      return res.data!;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pending-corrections'] });
      queryClient.invalidateQueries({ queryKey: ['ocr-jobs'] });
    },
  });
}

/**
 * Mutation: retry an OCR job (re-enqueue all bulletins from R2 files)
 */
export function useRetryOcrJobMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (jobId: string) => {
      const res = await apiClient.post<{ jobId: string; totalBulletins: number; bulletinIds: string[] }>(
        `/bulletins-soins/agent/ocr-jobs/${jobId}/retry`
      );
      if (!res.success) throw new Error(res.error?.message || 'Erreur retry');
      return res.data!;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ocr-jobs'] });
      queryClient.invalidateQueries({ queryKey: ['pending-corrections'] });
    },
  });
}

/**
 * Mutation: update a draft bulletin
 */
export function useUpdateDraftMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ bulletinId, data }: { bulletinId: string; data: Record<string, unknown> }) => {
      const res = await apiClient.put<{ id: string }>(
        `/bulletins-soins/agent/${bulletinId}/update-draft`,
        data
      );
      if (!res.success) throw new Error(res.error?.message || 'Erreur mise à jour');
      return res.data!;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ocr-jobs'] });
      queryClient.invalidateQueries({ queryKey: ['pending-corrections'] });
    },
  });
}
