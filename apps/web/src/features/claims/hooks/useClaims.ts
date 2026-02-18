import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';

export interface Claim {
  id: string;
  claimNumber: string;
  adherentId: string;
  adherentName?: string;
  adherentNationalId?: string;
  providerId: string;
  providerName?: string;
  insurerId: string;
  insurerName?: string;
  type: 'PHARMACY' | 'CONSULTATION' | 'LAB' | 'HOSPITALIZATION';
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'PAID';
  amount: number;
  coveredAmount: number;
  copayAmount: number;
  prescriptionDate: string | null;
  serviceDate: string;
  diagnosis: string | null;
  notes: string | null;
  rejectionReason: string | null;
  fraudScore: number | null;
  processedAt: string | null;
  processedBy: string | null;
  createdAt: string;
  updatedAt: string;
}

interface ClaimsResponse {
  claims: Claim[];
  total: number;
}

interface CreateClaimData {
  adherentId: string;
  type: string;
  amount: number;
  prescriptionDate?: string;
  serviceDate: string;
  diagnosis?: string;
  notes?: string;
  items?: Array<{
    code: string;
    description: string;
    quantity: number;
    unitPrice: number;
  }>;
}

interface ProcessClaimData {
  status: 'APPROVED' | 'REJECTED';
  coveredAmount?: number;
  rejectionReason?: string;
  notes?: string;
}

export function useClaims(page = 1, limit = 20, filters?: { status?: string; type?: string }) {
  return useQuery({
    queryKey: ['claims', page, limit, filters],
    queryFn: async () => {
      const response = await apiClient.get<ClaimsResponse>('/claims', {
        params: { page, limit, ...filters },
      });
      if (!response.success) {
        throw new Error(response.error?.message || 'Erreur lors du chargement des PEC');
      }
      return response.data;
    },
  });
}

export function useClaim(id: string) {
  return useQuery({
    queryKey: ['claims', id],
    queryFn: async () => {
      const response = await apiClient.get<Claim>(`/claims/${id}`);
      if (!response.success) {
        throw new Error(response.error?.message || 'Erreur lors du chargement de la PEC');
      }
      return response.data;
    },
    enabled: !!id,
  });
}

export function useCreateClaim() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: CreateClaimData) => {
      const response = await apiClient.post<Claim>('/claims', data);
      if (!response.success) {
        throw new Error(response.error?.message || 'Erreur lors de la création de la PEC');
      }
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['claims'] });
    },
  });
}

export function useProcessClaim() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: ProcessClaimData }) => {
      const response = await apiClient.put<Claim>(`/claims/${id}/process`, data);
      if (!response.success) {
        throw new Error(response.error?.message || 'Erreur lors du traitement de la PEC');
      }
      return response.data;
    },
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ['claims'] });
      queryClient.invalidateQueries({ queryKey: ['claims', id] });
    },
  });
}

export function useClaimStats() {
  return useQuery({
    queryKey: ['claims', 'stats'],
    queryFn: async () => {
      const response = await apiClient.get<{
        total: number;
        pending: number;
        approved: number;
        rejected: number;
        totalAmount: number;
        coveredAmount: number;
      }>('/claims/stats');
      if (!response.success) {
        throw new Error(response.error?.message || 'Erreur lors du chargement des statistiques');
      }
      return response.data;
    },
  });
}
