/**
 * Workflows Hooks for SoinFlow
 *
 * Hooks for managing workflows: info requests, escalations, validations
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';

// Types
export interface WorkflowStep {
  id: string;
  stepNumber: number;
  type: 'info_request' | 'approval' | 'review' | 'notification';
  assignedTo: string | null;
  assignedRole: string | null;
  status: 'pending' | 'in_progress' | 'completed' | 'cancelled' | 'expired';
  requiredAction: string;
  responseData?: Record<string, unknown>;
  completedAt?: string;
  completedBy?: string;
  dueDate?: string;
}

export interface Workflow {
  id: string;
  demandeId: string;
  type: 'info_request' | 'escalation' | 'multi_validation';
  status: 'pending' | 'in_progress' | 'completed' | 'cancelled' | 'expired';
  currentStep: number;
  steps: WorkflowStep[];
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  demande?: {
    numero: string;
    montant: number;
    typeSoin: string;
  };
}

export interface InfoRequestData {
  demandeId: string;
  reason: string;
  documentsRequis: string[];
  message: string;
  dueDate: string;
}

export interface InfoResponseData {
  workflowId: string;
  documents?: string[];
  message: string;
}

export interface EscalationData {
  demandeId: string;
  reason: string;
  priority: 'normal' | 'high' | 'urgent';
  escalateTo: 'supervisor' | 'manager' | 'director';
  notes: string;
}

export interface EscalationResolveData {
  workflowId: string;
  action: 'approve' | 'reject' | 'return';
  notes: string;
  newStatus?: string;
}

export interface ValidationData {
  workflowId: string;
  approved: boolean;
  notes: string;
}

// Labels
export const WORKFLOW_TYPE_LABELS: Record<Workflow['type'], string> = {
  info_request: 'Demande d\'info',
  escalation: 'Escalade',
  multi_validation: 'Validation',
};

export const WORKFLOW_STATUS_LABELS: Record<Workflow['status'], string> = {
  pending: 'En attente',
  in_progress: 'En cours',
  completed: 'Termine',
  cancelled: 'Annule',
  expired: 'Expire',
};

export const WORKFLOW_STATUS_COLORS: Record<Workflow['status'], string> = {
  pending: 'bg-gray-100 text-gray-800',
  in_progress: 'bg-blue-100 text-blue-800',
  completed: 'bg-green-100 text-green-800',
  cancelled: 'bg-red-100 text-red-800',
  expired: 'bg-yellow-100 text-yellow-800',
};

export const PRIORITY_LABELS: Record<string, string> = {
  normal: 'Normal',
  high: 'Haute',
  urgent: 'Urgente',
};

export const PRIORITY_COLORS: Record<string, string> = {
  normal: 'bg-gray-100 text-gray-800',
  high: 'bg-orange-100 text-orange-800',
  urgent: 'bg-red-100 text-red-800',
};

// Hooks

/**
 * Get pending workflows for current user
 */
export function usePendingWorkflows() {
  return useQuery({
    queryKey: ['workflows', 'pending'],
    queryFn: async () => {
      const response = await apiClient.get<{ success: boolean; data: Workflow[] }>(
        '/sante/workflows/pending/my'
      );
      if (response.success && response.data) {
        return response.data.data;
      }
      return [];
    },
    refetchInterval: 30000, // Refresh every 30 seconds
  });
}

/**
 * Get workflows for a specific demande
 */
export function useDemandeWorkflows(demandeId: string | null) {
  return useQuery({
    queryKey: ['workflows', 'demande', demandeId],
    queryFn: async () => {
      if (!demandeId) return [];
      const response = await apiClient.get<{ success: boolean; data: Workflow[] }>(
        `/sante/workflows/demande/${demandeId}`
      );
      if (response.success && response.data) {
        return response.data.data;
      }
      return [];
    },
    enabled: !!demandeId,
  });
}

/**
 * Get single workflow
 */
export function useWorkflow(workflowId: string | null) {
  return useQuery({
    queryKey: ['workflows', workflowId],
    queryFn: async () => {
      if (!workflowId) return null;
      const response = await apiClient.get<{ success: boolean; data: Workflow }>(
        `/sante/workflows/${workflowId}`
      );
      if (response.success && response.data) {
        return response.data.data;
      }
      return null;
    },
    enabled: !!workflowId,
  });
}

/**
 * Start info request workflow
 */
export function useStartInfoRequest() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: InfoRequestData) => {
      const response = await apiClient.post<{ success: boolean; data: Workflow }>(
        '/sante/workflows/info-request',
        data
      );
      if (!response.success) {
        throw new Error(response.error?.message || 'Erreur lors de la creation');
      }
      return response.data?.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workflows'] });
      queryClient.invalidateQueries({ queryKey: ['sante-demandes'] });
    },
  });
}

/**
 * Submit info response
 */
export function useSubmitInfoResponse() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: InfoResponseData) => {
      const response = await apiClient.post<{ success: boolean; data: Workflow }>(
        '/sante/workflows/info-response',
        data
      );
      if (!response.success) {
        throw new Error(response.error?.message || 'Erreur lors de la soumission');
      }
      return response.data?.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workflows'] });
    },
  });
}

/**
 * Start escalation workflow
 */
export function useStartEscalation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: EscalationData) => {
      const response = await apiClient.post<{ success: boolean; data: Workflow }>(
        '/sante/workflows/escalation',
        data
      );
      if (!response.success) {
        throw new Error(response.error?.message || 'Erreur lors de l\'escalade');
      }
      return response.data?.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workflows'] });
      queryClient.invalidateQueries({ queryKey: ['sante-demandes'] });
    },
  });
}

/**
 * Resolve escalation
 */
export function useResolveEscalation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: EscalationResolveData) => {
      const response = await apiClient.post<{ success: boolean; data: Workflow }>(
        '/sante/workflows/escalation/resolve',
        data
      );
      if (!response.success) {
        throw new Error(response.error?.message || 'Erreur lors de la resolution');
      }
      return response.data?.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workflows'] });
      queryClient.invalidateQueries({ queryKey: ['sante-demandes'] });
    },
  });
}

/**
 * Start multi-level validation
 */
export function useStartValidation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: { demandeId: string; montant: number }) => {
      const response = await apiClient.post<{ success: boolean; data: Workflow }>(
        '/sante/workflows/validation/start',
        data
      );
      if (!response.success) {
        throw new Error(response.error?.message || 'Erreur lors du demarrage');
      }
      return response.data?.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workflows'] });
      queryClient.invalidateQueries({ queryKey: ['sante-demandes'] });
    },
  });
}

/**
 * Submit validation decision
 */
export function useSubmitValidation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: ValidationData) => {
      const response = await apiClient.post<{ success: boolean; data: Workflow }>(
        '/sante/workflows/validation/submit',
        data
      );
      if (!response.success) {
        throw new Error(response.error?.message || 'Erreur lors de la validation');
      }
      return response.data?.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workflows'] });
      queryClient.invalidateQueries({ queryKey: ['sante-demandes'] });
    },
  });
}

/**
 * Format date for display
 */
export function formatWorkflowDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString('fr-TN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Check if workflow has action required from current user
 */
export function hasActionRequired(workflow: Workflow, userId: string, userRole: string): boolean {
  const currentStep = workflow.steps.find((s) => s.stepNumber === workflow.currentStep);
  if (!currentStep || currentStep.status !== 'in_progress') {
    return false;
  }
  return currentStep.assignedTo === userId || currentStep.assignedRole === userRole;
}
