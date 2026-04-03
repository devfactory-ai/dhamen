import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';

interface PraticienProfil {
  id: string;
  name: string;
  type: string;
  license_no: string | null;
  speciality: string | null;
  mf_number: string | null;
  address: string | null;
  city: string | null;
  phone: string | null;
  email: string | null;
  is_active: boolean;
  created_at: string;
}

interface PraticienActe {
  id: string;
  bulletinNumber: string;
  status: string;
  careType: string;
  careDate: string;
  totalAmount: number;
  reimbursedAmount: number | null;
  createdAt: string;
  adherentName: string;
  adherentNationalId: string;
  companyName: string;
}

interface PraticienStats {
  totalActes: number;
  enAttente: number;
  approuves: number;
  rejetes: number;
  montantTotal: number;
  montantRembourse: number;
}

export function usePraticienProfil() {
  return useQuery({
    queryKey: ['praticien-profil'],
    queryFn: async () => {
      const response = await apiClient.get<PraticienProfil>('/praticien/profil');
      if (!response.success) throw new Error(response.error?.message);
      return response.data;
    },
  });
}

export function usePraticienActes(page = 1, limit = 20, status?: string) {
  return useQuery({
    queryKey: ['praticien-actes', page, limit, status],
    queryFn: async () => {
      const params = new URLSearchParams({ page: String(page), limit: String(limit) });
      if (status && status !== 'all') params.set('status', status);
      const response = await apiClient.get<PraticienActe[]>(`/praticien/actes?${params}`);
      if (!response.success) throw new Error(response.error?.message);
      return {
        data: Array.isArray(response.data) ? response.data : [],
        meta: (response as any).meta || { page, limit, total: 0 },
      };
    },
  });
}

export function usePraticienStats() {
  return useQuery({
    queryKey: ['praticien-stats'],
    queryFn: async () => {
      const response = await apiClient.get<PraticienStats>('/praticien/stats');
      if (!response.success) throw new Error(response.error?.message);
      return response.data;
    },
    staleTime: 30000,
  });
}

export type { PraticienProfil, PraticienActe, PraticienStats };
