/**
 * Appeals Hook
 * React Query hook for managing claim appeals
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';

export interface Appeal {
  id: string;
  claim_id: string;
  adherent_id: string;
  reason: AppealReason;
  description: string;
  documents_json: string | null;
  status: AppealStatus;
  resolution_type: string | null;
  resolution_notes: string | null;
  resolution_amount: number | null;
  priority: 'low' | 'normal' | 'high' | 'urgent';
  submitted_at: string;
  reviewed_at: string | null;
  resolved_at: string | null;
  reviewer_id: string | null;
  escalated_to: string | null;
  internal_notes: string | null;
  adherent_response: string | null;
  created_at: string;
  updated_at: string;
  // Joined fields
  claim_reference?: string;
  claim_care_type?: string;
  claim_amount?: number;
  claim_approved_amount?: number;
  claim_status?: string;
  adherent_name?: string;
  adherent_number?: string;
  adherent_email?: string;
  reviewer_name?: string;
}

export type AppealReason =
  | 'coverage_dispute'
  | 'amount_dispute'
  | 'rejection_dispute'
  | 'document_missing'
  | 'calculation_error'
  | 'medical_necessity'
  | 'other';

export type AppealStatus =
  | 'submitted'
  | 'under_review'
  | 'additional_info_requested'
  | 'escalated'
  | 'approved'
  | 'partially_approved'
  | 'rejected'
  | 'withdrawn';

export interface AppealComment {
  id: string;
  appeal_id: string;
  user_id: string;
  comment_type: string;
  content: string;
  is_visible_to_adherent: number;
  created_at: string;
  user_name?: string;
}

export interface AppealsResponse {
  success: boolean;
  data: Appeal[];
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface AppealWithComments extends Appeal {
  documents: string[];
  comments: AppealComment[];
}

export interface AppealStats {
  overview: {
    total: number;
    submitted: number;
    under_review: number;
    additional_info_requested: number;
    escalated: number;
    approved: number;
    partially_approved: number;
    rejected: number;
    withdrawn: number;
    urgent_count: number;
    high_priority_count: number;
    avg_resolution_days: number | null;
  };
  byReason: Array<{ reason: string; count: number }>;
}

export interface AppealFilters {
  status?: AppealStatus;
  reason?: AppealReason;
  priority?: string;
  reviewerId?: string;
  adherentId?: string;
  claimId?: string;
  dateFrom?: string;
  dateTo?: string;
  search?: string;
}

export function useAppeals(page = 1, limit = 20, filters: AppealFilters = {}) {
  return useQuery({
    queryKey: ['appeals', page, limit, filters],
    queryFn: async () => {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: limit.toString(),
        ...Object.fromEntries(
          Object.entries(filters).filter(([, v]) => v !== undefined && v !== '')
        ),
      });
      const response = await apiClient.get<AppealsResponse>(`/appeals?${params}`);
      return response.data;
    },
  });
}

export function useMyAppeals(page = 1, limit = 20) {
  return useQuery({
    queryKey: ['my-appeals', page, limit],
    queryFn: async () => {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: limit.toString(),
      });
      const response = await apiClient.get<AppealsResponse>(`/appeals/my-appeals?${params}`);
      return response.data;
    },
  });
}

export function useAppeal(id: string) {
  return useQuery({
    queryKey: ['appeal', id],
    queryFn: async () => {
      const response = await apiClient.get<{ success: boolean; data: AppealWithComments }>(
        `/appeals/${id}`
      );
      return response.data.data;
    },
    enabled: !!id,
  });
}

export function useAppealStats() {
  return useQuery({
    queryKey: ['appeal-stats'],
    queryFn: async () => {
      const response = await apiClient.get<{ success: boolean; data: AppealStats }>(
        '/appeals/stats'
      );
      return response.data.data;
    },
  });
}

export function useCreateAppeal() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: {
      claimId: string;
      reason: AppealReason;
      description: string;
      documents?: string[];
    }) => {
      const response = await apiClient.post<{ success: boolean; data: Appeal }>('/appeals', data);
      return response.data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['appeals'] });
      queryClient.invalidateQueries({ queryKey: ['my-appeals'] });
      queryClient.invalidateQueries({ queryKey: ['appeal-stats'] });
    },
  });
}

export function useUpdateAppealStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      status,
      internalNotes,
      priority,
    }: {
      id: string;
      status: AppealStatus;
      internalNotes?: string;
      priority?: string;
    }) => {
      const response = await apiClient.patch<{ success: boolean; data: Appeal }>(
        `/appeals/${id}/status`,
        { status, internalNotes, priority }
      );
      return response.data.data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['appeals'] });
      queryClient.invalidateQueries({ queryKey: ['appeal', variables.id] });
      queryClient.invalidateQueries({ queryKey: ['appeal-stats'] });
    },
  });
}

export function useResolveAppeal() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      status,
      resolutionType,
      resolutionNotes,
      resolutionAmount,
    }: {
      id: string;
      status: 'approved' | 'partially_approved' | 'rejected';
      resolutionType: string;
      resolutionNotes: string;
      resolutionAmount?: number;
    }) => {
      const response = await apiClient.post<{ success: boolean; data: Appeal }>(
        `/appeals/${id}/resolve`,
        { status, resolutionType, resolutionNotes, resolutionAmount }
      );
      return response.data.data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['appeals'] });
      queryClient.invalidateQueries({ queryKey: ['appeal', variables.id] });
      queryClient.invalidateQueries({ queryKey: ['appeal-stats'] });
      queryClient.invalidateQueries({ queryKey: ['claims'] });
    },
  });
}

export function useAssignReviewer() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, reviewerId }: { id: string; reviewerId: string }) => {
      const response = await apiClient.post<{ success: boolean; data: { assigned: boolean } }>(
        `/appeals/${id}/assign`,
        { reviewerId }
      );
      return response.data.data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['appeals'] });
      queryClient.invalidateQueries({ queryKey: ['appeal', variables.id] });
    },
  });
}

export function useEscalateAppeal() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      escalatedTo,
      reason,
    }: {
      id: string;
      escalatedTo: string;
      reason: string;
    }) => {
      const response = await apiClient.post<{ success: boolean; data: { escalated: boolean } }>(
        `/appeals/${id}/escalate`,
        { escalatedTo, reason }
      );
      return response.data.data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['appeals'] });
      queryClient.invalidateQueries({ queryKey: ['appeal', variables.id] });
      queryClient.invalidateQueries({ queryKey: ['appeal-stats'] });
    },
  });
}

export function useAddAppealComment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      content,
      commentType,
      isVisibleToAdherent,
    }: {
      id: string;
      content: string;
      commentType: string;
      isVisibleToAdherent?: boolean;
    }) => {
      const response = await apiClient.post<{ success: boolean; data: AppealComment }>(
        `/appeals/${id}/comments`,
        { content, commentType, isVisibleToAdherent }
      );
      return response.data.data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['appeal', variables.id] });
    },
  });
}

export function useRespondToAppeal() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      response,
      documents,
    }: {
      id: string;
      response: string;
      documents?: string[];
    }) => {
      const apiResponse = await apiClient.post<{ success: boolean; data: { responded: boolean } }>(
        `/appeals/${id}/respond`,
        { response, documents }
      );
      return apiResponse.data.data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['appeals'] });
      queryClient.invalidateQueries({ queryKey: ['my-appeals'] });
      queryClient.invalidateQueries({ queryKey: ['appeal', variables.id] });
    },
  });
}

export function useWithdrawAppeal() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const response = await apiClient.post<{ success: boolean; data: { withdrawn: boolean } }>(
        `/appeals/${id}/withdraw`
      );
      return response.data.data;
    },
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: ['appeals'] });
      queryClient.invalidateQueries({ queryKey: ['my-appeals'] });
      queryClient.invalidateQueries({ queryKey: ['appeal', id] });
      queryClient.invalidateQueries({ queryKey: ['appeal-stats'] });
    },
  });
}

// Helper functions
export function getAppealReasonLabel(reason: AppealReason): string {
  const labels: Record<AppealReason, string> = {
    coverage_dispute: 'Contestation de couverture',
    amount_dispute: 'Contestation du montant',
    rejection_dispute: 'Contestation du rejet',
    document_missing: 'Documents manquants',
    calculation_error: 'Erreur de calcul',
    medical_necessity: 'Nécessité médicale',
    other: 'Autre',
  };
  return labels[reason] || reason;
}

export function getAppealStatusLabel(status: AppealStatus): string {
  const labels: Record<AppealStatus, string> = {
    submitted: 'Soumis',
    under_review: 'En cours d\'examen',
    additional_info_requested: 'Informations demandées',
    escalated: 'Escaladé',
    approved: 'Approuvé',
    partially_approved: 'Partiellement approuvé',
    rejected: 'Rejeté',
    withdrawn: 'Retiré',
  };
  return labels[status] || status;
}

export function getAppealStatusVariant(status: AppealStatus): 'default' | 'secondary' | 'destructive' | 'outline' | 'success' | 'warning' | 'info' {
  const variants: Record<AppealStatus, 'default' | 'secondary' | 'destructive' | 'outline' | 'success' | 'warning' | 'info'> = {
    submitted: 'info',
    under_review: 'warning',
    additional_info_requested: 'warning',
    escalated: 'destructive',
    approved: 'success',
    partially_approved: 'success',
    rejected: 'destructive',
    withdrawn: 'secondary',
  };
  return variants[status] || 'default';
}
