/**
 * Pre-Authorization Hooks
 * React Query hooks for managing prior authorization requests
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';

export interface PreAuthorization {
  id: string;
  authorization_number: string | null;
  adherent_id: string;
  provider_id: string;
  insurer_id: string;
  contract_id: string | null;
  care_type: PreAuthCareType;
  procedure_code: string | null;
  procedure_description: string;
  diagnosis_code: string | null;
  diagnosis_description: string | null;
  medical_justification: string;
  prescribing_doctor: string | null;
  prescription_date: string | null;
  estimated_amount: number;
  approved_amount: number | null;
  coverage_rate: number | null;
  requested_care_date: string | null;
  validity_start_date: string | null;
  validity_end_date: string | null;
  status: PreAuthStatus;
  decision_reason: string | null;
  decision_notes: string | null;
  reviewer_id: string | null;
  medical_reviewer_id: string | null;
  claim_id: string | null;
  documents_json: string | null;
  priority: 'low' | 'normal' | 'high' | 'urgent';
  is_emergency: number;
  submitted_at: string | null;
  reviewed_at: string | null;
  decided_at: string | null;
  used_at: string | null;
  created_at: string;
  updated_at: string;
  // Joined fields
  adherent_name?: string;
  adherent_number?: string;
  adherent_email?: string;
  adherent_phone?: string;
  adherent_dob?: string;
  provider_name?: string;
  provider_specialty?: string;
  provider_address?: string;
  insurer_name?: string;
  contract_name?: string;
  coverage_type?: string;
  reviewer_name?: string;
  medical_reviewer_name?: string;
  linked_claim_reference?: string;
}

export type PreAuthCareType =
  | 'hospitalization'
  | 'surgery'
  | 'mri'
  | 'scanner'
  | 'specialized_exam'
  | 'dental_prosthesis'
  | 'optical'
  | 'physical_therapy'
  | 'chronic_treatment'
  | 'expensive_medication'
  | 'other';

export type PreAuthStatus =
  | 'draft'
  | 'pending'
  | 'under_review'
  | 'additional_info'
  | 'medical_review'
  | 'approved'
  | 'partially_approved'
  | 'rejected'
  | 'expired'
  | 'cancelled'
  | 'used';

export interface PreAuthHistory {
  id: string;
  pre_auth_id: string;
  user_id: string;
  action: string;
  old_status: string | null;
  new_status: string | null;
  comment: string | null;
  is_internal: number;
  created_at: string;
  user_name?: string;
}

export interface PreAuthWithHistory extends PreAuthorization {
  documents: string[];
  history: PreAuthHistory[];
}

export interface PreAuthRule {
  id: string;
  insurer_id: string;
  care_type: PreAuthCareType;
  procedure_code: string | null;
  max_auto_approve_amount: number | null;
  requires_medical_review: number;
  requires_documents: number;
  min_days_advance: number;
  default_validity_days: number;
  is_active: number;
  created_at: string;
  updated_at: string;
}

export interface PreAuthsResponse {
  success: boolean;
  data: PreAuthorization[];
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface PreAuthStats {
  overview: {
    total: number;
    draft: number;
    pending: number;
    under_review: number;
    additional_info: number;
    medical_review: number;
    approved: number;
    partially_approved: number;
    rejected: number;
    expired: number;
    cancelled: number;
    used: number;
    urgent_count: number;
    emergency_count: number;
    total_estimated_amount: number;
    total_approved_amount: number;
    avg_decision_days: number | null;
  };
  byCareType: Array<{
    care_type: string;
    count: number;
    total_estimated: number;
    total_approved: number;
  }>;
}

export interface PreAuthFilters {
  status?: PreAuthStatus;
  careType?: PreAuthCareType;
  priority?: string;
  adherentId?: string;
  providerId?: string;
  reviewerId?: string;
  dateFrom?: string;
  dateTo?: string;
  search?: string;
  isEmergency?: boolean;
}

export function usePreAuthorizations(page = 1, limit = 20, filters: PreAuthFilters = {}) {
  return useQuery({
    queryKey: ['pre-authorizations', page, limit, filters],
    queryFn: async () => {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: limit.toString(),
        ...Object.fromEntries(
          Object.entries(filters).filter(([, v]) => v !== undefined && v !== '')
        ),
      });
      const response = await apiClient.get<PreAuthsResponse>(`/pre-authorizations?${params}`);
      if (!response.success) {
        throw new Error(response.error?.message || 'Failed to fetch pre-authorizations');
      }
      return response.data;
    },
  });
}

export function useProviderPreAuthorizations(page = 1, limit = 20, filters: PreAuthFilters = {}) {
  return useQuery({
    queryKey: ['pre-authorizations-provider', page, limit, filters],
    queryFn: async () => {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: limit.toString(),
        ...Object.fromEntries(
          Object.entries(filters).filter(([, v]) => v !== undefined && v !== '')
        ),
      });
      const response = await apiClient.get<PreAuthsResponse>(`/pre-authorizations/provider?${params}`);
      if (!response.success) {
        throw new Error(response.error?.message || 'Failed to fetch provider pre-authorizations');
      }
      return response.data;
    },
  });
}

export function usePreAuthorization(id: string) {
  return useQuery({
    queryKey: ['pre-authorization', id],
    queryFn: async () => {
      const response = await apiClient.get<{ data: PreAuthWithHistory }>(
        `/pre-authorizations/${id}`
      );
      if (!response.success) {
        throw new Error(response.error?.message || 'Failed to fetch pre-authorization');
      }
      return response.data.data;
    },
    enabled: !!id,
  });
}

export function usePreAuthStats() {
  return useQuery({
    queryKey: ['pre-authorization-stats'],
    queryFn: async () => {
      const response = await apiClient.get<{ data: PreAuthStats }>(
        '/pre-authorizations/stats'
      );
      if (!response.success) {
        throw new Error(response.error?.message || 'Failed to fetch pre-authorization stats');
      }
      return response.data.data;
    },
  });
}

export function usePreAuthRules(insurerId?: string) {
  return useQuery({
    queryKey: ['pre-authorization-rules', insurerId],
    queryFn: async () => {
      const params = insurerId ? `?insurerId=${insurerId}` : '';
      const response = await apiClient.get<{ data: PreAuthRule[] }>(
        `/pre-authorizations/rules${params}`
      );
      if (!response.success) {
        throw new Error(response.error?.message || 'Failed to fetch pre-authorization rules');
      }
      return response.data.data;
    },
  });
}

export function useCreatePreAuth() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: {
      adherentId: string;
      providerId: string;
      contractId?: string;
      careType: PreAuthCareType;
      procedureCode?: string;
      procedureDescription: string;
      diagnosisCode?: string;
      diagnosisDescription?: string;
      medicalJustification: string;
      prescribingDoctor?: string;
      prescriptionDate?: string;
      estimatedAmount: number;
      requestedCareDate?: string;
      documents?: string[];
      priority?: 'low' | 'normal' | 'high' | 'urgent';
      isEmergency?: boolean;
    }) => {
      const response = await apiClient.post<{ data: PreAuthorization }>(
        '/pre-authorizations',
        data
      );
      if (!response.success) {
        throw new Error(response.error?.message || 'Failed to create pre-authorization');
      }
      return response.data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pre-authorizations'] });
      queryClient.invalidateQueries({ queryKey: ['pre-authorizations-provider'] });
      queryClient.invalidateQueries({ queryKey: ['pre-authorization-stats'] });
    },
  });
}

export function useUpdatePreAuth() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      ...data
    }: {
      id: string;
      procedureCode?: string;
      procedureDescription?: string;
      diagnosisCode?: string;
      diagnosisDescription?: string;
      medicalJustification?: string;
      prescribingDoctor?: string;
      prescriptionDate?: string;
      estimatedAmount?: number;
      requestedCareDate?: string;
      documents?: string[];
      priority?: 'low' | 'normal' | 'high' | 'urgent';
      isEmergency?: boolean;
    }) => {
      const response = await apiClient.put<{ data: PreAuthorization }>(
        `/pre-authorizations/${id}`,
        data
      );
      if (!response.success) {
        throw new Error(response.error?.message || 'Failed to update pre-authorization');
      }
      return response.data.data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['pre-authorizations'] });
      queryClient.invalidateQueries({ queryKey: ['pre-authorization', variables.id] });
    },
  });
}

export function useSubmitPreAuth() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const response = await apiClient.post<{ data: PreAuthorization }>(
        `/pre-authorizations/${id}/submit`
      );
      if (!response.success) {
        throw new Error(response.error?.message || 'Failed to submit pre-authorization');
      }
      return response.data.data;
    },
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: ['pre-authorizations'] });
      queryClient.invalidateQueries({ queryKey: ['pre-authorizations-provider'] });
      queryClient.invalidateQueries({ queryKey: ['pre-authorization', id] });
      queryClient.invalidateQueries({ queryKey: ['pre-authorization-stats'] });
    },
  });
}

export function useReviewPreAuth() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      status,
      notes,
    }: {
      id: string;
      status: 'under_review' | 'additional_info' | 'medical_review';
      notes?: string;
    }) => {
      const response = await apiClient.post<{ data: PreAuthorization }>(
        `/pre-authorizations/${id}/review`,
        { status, notes }
      );
      if (!response.success) {
        throw new Error(response.error?.message || 'Failed to review pre-authorization');
      }
      return response.data.data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['pre-authorizations'] });
      queryClient.invalidateQueries({ queryKey: ['pre-authorization', variables.id] });
      queryClient.invalidateQueries({ queryKey: ['pre-authorization-stats'] });
    },
  });
}

export function useRequestInfoPreAuth() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      requestedInfo,
    }: {
      id: string;
      requestedInfo: string;
    }) => {
      const response = await apiClient.post<{ data: { infoRequested: boolean } }>(
        `/pre-authorizations/${id}/request-info`,
        { requestedInfo }
      );
      if (!response.success) {
        throw new Error(response.error?.message || 'Failed to request info');
      }
      return response.data.data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['pre-authorizations'] });
      queryClient.invalidateQueries({ queryKey: ['pre-authorization', variables.id] });
    },
  });
}

export function useProvideInfoPreAuth() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      additionalInfo,
      documents,
    }: {
      id: string;
      additionalInfo: string;
      documents?: string[];
    }) => {
      const response = await apiClient.post<{ data: { infoProvided: boolean } }>(
        `/pre-authorizations/${id}/provide-info`,
        { additionalInfo, documents }
      );
      if (!response.success) {
        throw new Error(response.error?.message || 'Failed to provide info');
      }
      return response.data.data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['pre-authorizations'] });
      queryClient.invalidateQueries({ queryKey: ['pre-authorizations-provider'] });
      queryClient.invalidateQueries({ queryKey: ['pre-authorization', variables.id] });
    },
  });
}

export function useApprovePreAuth() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      approvedAmount,
      coverageRate,
      validityStartDate,
      validityEndDate,
      decisionNotes,
      isPartial,
    }: {
      id: string;
      approvedAmount: number;
      coverageRate?: number;
      validityStartDate: string;
      validityEndDate: string;
      decisionNotes?: string;
      isPartial?: boolean;
    }) => {
      const response = await apiClient.post<{ data: PreAuthorization }>(
        `/pre-authorizations/${id}/approve`,
        { approvedAmount, coverageRate, validityStartDate, validityEndDate, decisionNotes, isPartial }
      );
      if (!response.success) {
        throw new Error(response.error?.message || 'Failed to approve pre-authorization');
      }
      return response.data.data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['pre-authorizations'] });
      queryClient.invalidateQueries({ queryKey: ['pre-authorization', variables.id] });
      queryClient.invalidateQueries({ queryKey: ['pre-authorization-stats'] });
    },
  });
}

export function useRejectPreAuth() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      decisionReason,
      decisionNotes,
    }: {
      id: string;
      decisionReason: string;
      decisionNotes?: string;
    }) => {
      const response = await apiClient.post<{ data: PreAuthorization }>(
        `/pre-authorizations/${id}/reject`,
        { decisionReason, decisionNotes }
      );
      if (!response.success) {
        throw new Error(response.error?.message || 'Failed to reject pre-authorization');
      }
      return response.data.data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['pre-authorizations'] });
      queryClient.invalidateQueries({ queryKey: ['pre-authorization', variables.id] });
      queryClient.invalidateQueries({ queryKey: ['pre-authorization-stats'] });
    },
  });
}

export function useCancelPreAuth() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      reason,
    }: {
      id: string;
      reason: string;
    }) => {
      const response = await apiClient.post<{ data: { cancelled: boolean } }>(
        `/pre-authorizations/${id}/cancel`,
        { reason }
      );
      if (!response.success) {
        throw new Error(response.error?.message || 'Failed to cancel pre-authorization');
      }
      return response.data.data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['pre-authorizations'] });
      queryClient.invalidateQueries({ queryKey: ['pre-authorizations-provider'] });
      queryClient.invalidateQueries({ queryKey: ['pre-authorization', variables.id] });
      queryClient.invalidateQueries({ queryKey: ['pre-authorization-stats'] });
    },
  });
}

export function useAssignPreAuthReviewer() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      reviewerId,
      isMedicalReviewer,
    }: {
      id: string;
      reviewerId: string;
      isMedicalReviewer?: boolean;
    }) => {
      const response = await apiClient.post<{ data: { assigned: boolean } }>(
        `/pre-authorizations/${id}/assign`,
        { reviewerId, isMedicalReviewer }
      );
      if (!response.success) {
        throw new Error(response.error?.message || 'Failed to assign reviewer');
      }
      return response.data.data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['pre-authorizations'] });
      queryClient.invalidateQueries({ queryKey: ['pre-authorization', variables.id] });
    },
  });
}

export function useUsePreAuth() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      claimId,
    }: {
      id: string;
      claimId: string;
    }) => {
      const response = await apiClient.post<{ data: { used: boolean } }>(
        `/pre-authorizations/${id}/use`,
        { claimId }
      );
      if (!response.success) {
        throw new Error(response.error?.message || 'Failed to mark pre-authorization as used');
      }
      return response.data.data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['pre-authorizations'] });
      queryClient.invalidateQueries({ queryKey: ['pre-authorizations-provider'] });
      queryClient.invalidateQueries({ queryKey: ['pre-authorization', variables.id] });
      queryClient.invalidateQueries({ queryKey: ['pre-authorization-stats'] });
    },
  });
}

export function useAddPreAuthComment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      comment,
      isInternal,
    }: {
      id: string;
      comment: string;
      isInternal?: boolean;
    }) => {
      const response = await apiClient.post<{ data: PreAuthHistory }>(
        `/pre-authorizations/${id}/comments`,
        { comment, isInternal }
      );
      if (!response.success) {
        throw new Error(response.error?.message || 'Failed to add comment');
      }
      return response.data.data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['pre-authorization', variables.id] });
    },
  });
}

export function useSavePreAuthRule() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: {
      careType: PreAuthCareType;
      procedureCode?: string;
      maxAutoApproveAmount?: number;
      requiresMedicalReview?: boolean;
      requiresDocuments?: boolean;
      minDaysAdvance?: number;
      defaultValidityDays?: number;
      isActive?: boolean;
    }) => {
      const response = await apiClient.post<{ data: PreAuthRule }>(
        '/pre-authorizations/rules',
        data
      );
      if (!response.success) {
        throw new Error(response.error?.message || 'Failed to save rule');
      }
      return response.data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pre-authorization-rules'] });
    },
  });
}

export function useDeletePreAuthRule() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (ruleId: string) => {
      const response = await apiClient.delete<{ data: { deleted: boolean } }>(
        `/pre-authorizations/rules/${ruleId}`
      );
      if (!response.success) {
        throw new Error(response.error?.message || 'Failed to delete rule');
      }
      return response.data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pre-authorization-rules'] });
    },
  });
}

// Helper functions
export function getCareTypeLabel(careType: PreAuthCareType): string {
  const labels: Record<PreAuthCareType, string> = {
    hospitalization: 'Hospitalisation',
    surgery: 'Chirurgie',
    mri: 'IRM',
    scanner: 'Scanner',
    specialized_exam: 'Examen spécialisé',
    dental_prosthesis: 'Prothèse dentaire',
    optical: 'Optique',
    physical_therapy: 'Kinésithérapie',
    chronic_treatment: 'Traitement chronique',
    expensive_medication: 'Médicament coûteux',
    other: 'Autre',
  };
  return labels[careType] || careType;
}

export function getPreAuthStatusLabel(status: PreAuthStatus): string {
  const labels: Record<PreAuthStatus, string> = {
    draft: 'Brouillon',
    pending: 'En attente',
    under_review: 'En cours d\'examen',
    additional_info: 'Info demandée',
    medical_review: 'Revue médicale',
    approved: 'Approuvé',
    partially_approved: 'Partiellement approuvé',
    rejected: 'Rejeté',
    expired: 'Expiré',
    cancelled: 'Annulé',
    used: 'Utilisé',
  };
  return labels[status] || status;
}

export function getPreAuthStatusVariant(
  status: PreAuthStatus
): 'default' | 'secondary' | 'destructive' | 'outline' | 'success' | 'warning' | 'info' {
  const variants: Record<
    PreAuthStatus,
    'default' | 'secondary' | 'destructive' | 'outline' | 'success' | 'warning' | 'info'
  > = {
    draft: 'secondary',
    pending: 'info',
    under_review: 'warning',
    additional_info: 'warning',
    medical_review: 'warning',
    approved: 'success',
    partially_approved: 'success',
    rejected: 'destructive',
    expired: 'secondary',
    cancelled: 'secondary',
    used: 'default',
  };
  return variants[status] || 'default';
}

export function getPreAuthActionLabel(action: string): string {
  const labels: Record<string, string> = {
    created: 'Créé',
    submitted: 'Soumis',
    status_changed: 'Statut modifié',
    info_requested: 'Info demandée',
    info_provided: 'Info fournie',
    assigned: 'Assigné',
    reviewed: 'Examiné',
    approved: 'Approuvé',
    rejected: 'Rejeté',
    modified: 'Modifié',
    cancelled: 'Annulé',
    expired: 'Expiré',
    used: 'Utilisé',
    comment: 'Commentaire',
  };
  return labels[action] || action;
}
