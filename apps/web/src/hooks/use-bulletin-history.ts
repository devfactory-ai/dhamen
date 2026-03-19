import { useQuery } from '@tanstack/react-query';
import { apiClient, API_BASE_URL } from '@/lib/api-client';

export interface HistoryBulletin {
  id: string;
  bulletinNumber: string;
  bulletinDate: string;
  careType: string;
  status: 'approved' | 'reimbursed' | 'rejected';
  totalAmount: number;
  reimbursedAmount: number | null;
  validatedAt: string | null;
  paymentDate: string | null;
  hasScan: boolean;
  adherentId: string | null;
  adherentFirstName: string | null;
  adherentLastName: string | null;
  adherentMatricule: string | null;
  actesCount: number;
}

export interface HistoryActe {
  id: string;
  code: string | null;
  label: string;
  amount: number;
  tauxRemboursement: number | null;
  montantRembourse: number | null;
  remboursementBrut: number | null;
  plafondDepasse: boolean;
  acteRefId: string | null;
}

export interface HistoryBulletinDetail {
  id: string;
  bulletinNumber: string;
  bulletinDate: string;
  status: string;
  careType: string;
  careDescription: string | null;
  providerName: string | null;
  providerSpecialty: string | null;
  totalAmount: number;
  reimbursedAmount: number | null;
  rejectionReason: string | null;
  scanUrl: string | null;
  scanFilename: string | null;
  validatedAt: string | null;
  validatedBy: string | null;
  approvedDate: string | null;
  paymentDate: string | null;
  paymentMethod: string | null;
  paymentReference: string | null;
  agentNotes: string | null;
  createdAt: string;
  adherent: {
    id: string | null;
    firstName: string | null;
    lastName: string | null;
    matricule: string | null;
    nationalId: string | null;
    email: string | null;
    plafondGlobal: number;
    plafondConsomme: number;
    plafondRestant: number;
  };
  beneficiary: { name: string; relationship: string | null } | null;
  actes: HistoryActe[];
  totaux: {
    totalDeclare: number;
    totalRembourse: number;
    nbActes: number;
    nbPlafondDepasse: number;
  };
}

export interface HistoryStats {
  totalBulletins: number;
  totalDeclared: number;
  totalReimbursed: number;
  byStatus: Record<string, number>;
  byCareType: Array<{ careType: string; count: number; totalReimbursed: number }>;
  monthly: Array<{ month: string; count: number; totalReimbursed: number }>;
}

export interface HistoryFilters {
  adherentId?: string;
  dateFrom?: string;
  dateTo?: string;
  careType?: string;
  status?: string;
  search?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  page: number;
  limit: number;
}

function buildQueryString(filters: HistoryFilters): string {
  const params = new URLSearchParams();
  params.set('page', String(filters.page));
  params.set('limit', String(filters.limit));
  if (filters.adherentId) params.set('adherentId', filters.adherentId);
  if (filters.dateFrom) params.set('dateFrom', filters.dateFrom);
  if (filters.dateTo) params.set('dateTo', filters.dateTo);
  if (filters.careType) params.set('careType', filters.careType);
  if (filters.status) params.set('status', filters.status);
  if (filters.search) params.set('search', filters.search);
  if (filters.sortBy) params.set('sortBy', filters.sortBy);
  if (filters.sortOrder) params.set('sortOrder', filters.sortOrder);
  return params.toString();
}

export function useHistoryList(filters: HistoryFilters) {
  return useQuery({
    queryKey: ['bulletins-history', filters],
    queryFn: async () => {
      const qs = buildQueryString(filters);
      const response = await apiClient.get(`/bulletins-soins/history?${qs}`);
      if (!response.success) {
        throw new Error(response.error?.message || 'Erreur chargement historique');
      }
      const raw = response as unknown as {
        success: boolean;
        data: HistoryBulletin[];
        meta: { page: number; limit: number; total: number; totalPages: number };
      };
      return { data: raw.data ?? [], meta: raw.meta };
    },
  });
}

export function useHistoryStats(dateFrom?: string, dateTo?: string) {
  return useQuery({
    queryKey: ['bulletins-history-stats', dateFrom, dateTo],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (dateFrom) params.set('dateFrom', dateFrom);
      if (dateTo) params.set('dateTo', dateTo);
      const qs = params.toString();
      const response = await apiClient.get(`/bulletins-soins/history/stats${qs ? `?${qs}` : ''}`);
      if (!response.success) {
        throw new Error(response.error?.message || 'Erreur chargement statistiques');
      }
      return response.data as HistoryStats;
    },
  });
}

export function useHistoryDetail(bulletinId: string | null) {
  return useQuery({
    queryKey: ['bulletins-history-detail', bulletinId],
    queryFn: async () => {
      if (!bulletinId) return null;
      const response = await apiClient.get(`/bulletins-soins/history/${bulletinId}`);
      if (!response.success) {
        throw new Error(response.error?.message || 'Erreur chargement detail');
      }
      return response.data as HistoryBulletinDetail;
    },
    enabled: !!bulletinId,
  });
}

export async function exportHistoryCSV(filters: Omit<HistoryFilters, 'page' | 'limit' | 'sortBy' | 'sortOrder'>, token: string | null) {
  const params = new URLSearchParams();
  if (filters.adherentId) params.set('adherentId', filters.adherentId);
  if (filters.dateFrom) params.set('dateFrom', filters.dateFrom);
  if (filters.dateTo) params.set('dateTo', filters.dateTo);
  if (filters.careType) params.set('careType', filters.careType);
  if (filters.status) params.set('status', filters.status);
  if (filters.search) params.set('search', filters.search);
  const qs = params.toString();

  const baseUrl = API_BASE_URL;
  const response = await fetch(`${baseUrl}/bulletins-soins/history/export${qs ? `?${qs}` : ''}`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    throw new Error('Erreur export CSV');
  }

  const blob = await response.blob();
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `historique-remboursements-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.URL.revokeObjectURL(url);
}
