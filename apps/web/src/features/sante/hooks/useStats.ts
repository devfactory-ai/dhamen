/**
 * SoinFlow Statistics hooks
 *
 * Provides KPIs and dashboard data for gestionnaires
 */
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';

// ============================================
// Types
// ============================================

export interface SanteKPIs {
  // Demandes
  demandesTotal: number;
  demandesEnCours: number;
  demandesApprouvees: number;
  demandesRejetees: number;
  demandesAujourdhui: number;
  delaiMoyenTraitement: number; // en heures

  // Montants
  montantTotalDemande: number;
  montantTotalRembourse: number;
  montantEnAttente: number;
  tauxRemboursementMoyen: number;

  // Fraude
  alertesFraude: number;
  scoreRisqueMoyen: number;

  // Adherents
  adherentsActifs: number;
  nouveauxAdherents: number; // ce mois

  // Praticiens
  praticiensActifs: number;
  praticiensConventionnes: number;
}

export interface StatsTendance {
  date: string;
  demandes: number;
  montantRembourse: number;
  montantDemande: number;
}

export interface StatsParTypeSoin {
  typeSoin: string;
  count: number;
  montantTotal: number;
  montantRembourse: number;
  pourcentage: number;
}

export interface StatsParStatut {
  statut: string;
  count: number;
  pourcentage: number;
}

export interface TopPraticien {
  id: string;
  nom: string;
  specialite: string;
  nbDemandes: number;
  montantTotal: number;
}

export interface SanteDashboardData {
  kpis: SanteKPIs;
  tendances: StatsTendance[];
  parTypeSoin: StatsParTypeSoin[];
  parStatut: StatsParStatut[];
  topPraticiens: TopPraticien[];
}

// ============================================
// Hooks
// ============================================

/**
 * Fetch dashboard KPIs
 */
export function useSanteKPIs() {
  return useQuery({
    queryKey: ['sante-kpis'],
    queryFn: async () => {
      const response = await apiClient.get<{ success: boolean; data: SanteKPIs }>(
        '/sante/stats/kpis'
      );

      if (!response.success) {
        throw new Error(response.error?.message || 'Failed to fetch KPIs');
      }

      return response.data?.data;
    },
    refetchInterval: 60000, // Refresh every minute
  });
}

/**
 * Fetch tendances over time
 */
export function useSanteTendances(period: 'week' | 'month' | 'year' = 'month') {
  return useQuery({
    queryKey: ['sante-tendances', period],
    queryFn: async () => {
      const response = await apiClient.get<{ success: boolean; data: StatsTendance[] }>(
        `/sante/stats/tendances?period=${period}`
      );

      if (!response.success) {
        return [];
      }

      return response.data?.data || [];
    },
  });
}

/**
 * Fetch stats par type de soin
 */
export function useStatsParTypeSoin(period: 'week' | 'month' | 'year' = 'month') {
  return useQuery({
    queryKey: ['sante-stats-type-soin', period],
    queryFn: async () => {
      const response = await apiClient.get<{ success: boolean; data: StatsParTypeSoin[] }>(
        `/sante/stats/par-type-soin?period=${period}`
      );

      if (!response.success) {
        return [];
      }

      return response.data?.data || [];
    },
  });
}

/**
 * Fetch stats par statut
 */
export function useStatsParStatut() {
  return useQuery({
    queryKey: ['sante-stats-statut'],
    queryFn: async () => {
      const response = await apiClient.get<{ success: boolean; data: StatsParStatut[] }>(
        '/sante/stats/par-statut'
      );

      if (!response.success) {
        return [];
      }

      return response.data?.data || [];
    },
  });
}

/**
 * Fetch top praticiens
 */
export function useTopPraticiens(limit = 10) {
  return useQuery({
    queryKey: ['sante-top-praticiens', limit],
    queryFn: async () => {
      const response = await apiClient.get<{ success: boolean; data: TopPraticien[] }>(
        `/sante/stats/top-praticiens?limit=${limit}`
      );

      if (!response.success) {
        return [];
      }

      return response.data?.data || [];
    },
  });
}

/**
 * Fetch complete dashboard data
 */
export function useSanteDashboard(period: 'week' | 'month' | 'year' = 'month') {
  return useQuery({
    queryKey: ['sante-dashboard', period],
    queryFn: async () => {
      const response = await apiClient.get<{ success: boolean; data: SanteDashboardData }>(
        `/sante/stats/dashboard?period=${period}`
      );

      if (!response.success) {
        throw new Error(response.error?.message || 'Failed to fetch dashboard');
      }

      return response.data?.data;
    },
    refetchInterval: 60000,
  });
}

// ============================================
// Helpers
// ============================================

export function formatMontant(millimes: number): string {
  return (millimes / 1000).toFixed(3) + ' TND';
}

export function formatPourcentage(value: number): string {
  return value.toFixed(1) + '%';
}

export function formatDelai(heures: number): string {
  if (heures < 1) {
    return `${Math.round(heures * 60)} min`;
  }
  if (heures < 24) {
    return `${heures.toFixed(1)} h`;
  }
  return `${(heures / 24).toFixed(1)} j`;
}

export const TYPE_SOIN_COLORS: Record<string, string> = {
  pharmacie: '#10b981',
  consultation: '#3b82f6',
  hospitalisation: '#ef4444',
  optique: '#8b5cf6',
  dentaire: '#f59e0b',
  laboratoire: '#06b6d4',
  kinesitherapie: '#ec4899',
};

export const STATUT_COLORS: Record<string, string> = {
  soumise: '#6b7280',
  en_examen: '#f59e0b',
  info_requise: '#f97316',
  approuvee: '#10b981',
  en_paiement: '#3b82f6',
  payee: '#059669',
  rejetee: '#ef4444',
};

export const STATUT_LABELS: Record<string, string> = {
  soumise: 'Soumise',
  en_examen: 'En examen',
  info_requise: 'Info requise',
  approuvee: 'Approuvee',
  en_paiement: 'En paiement',
  payee: 'Payee',
  rejetee: 'Rejetee',
};
