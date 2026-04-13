/**
 * Fraud Detection Hooks for SoinFlow
 *
 * Hooks for fraud alerts, anomalies, and investigation
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';

// Types
export interface FraudAlert {
  id: string;
  demandeId: string;
  demande?: {
    numero: string;
    montant: number;
    typeSoin: string;
    praticienNom: string;
    adherentNom: string;
  };
  score: number;
  niveau: 'faible' | 'moyen' | 'eleve' | 'critique';
  reglesActivees: FraudRule[];
  analyseIA?: {
    score: number;
    confidence: number;
    reasoning: string;
    flags: string[];
  };
  statut: 'nouvelle' | 'en_investigation' | 'confirmée' | 'rejetée';
  investigateurId?: string;
  investigateurNom?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
  resolvedAt?: string;
}

export interface FraudRule {
  code: string;
  nom: string;
  description: string;
  severite: 'faible' | 'moyenne' | 'elevee';
  impactScore: number;
  details?: Record<string, unknown>;
}

export interface FraudStats {
  totalAlertes: number;
  nouvelles: number;
  enInvestigation: number;
  confirmées: number;
  rejetées: number;
  scoreMoyen: number;
  montantSuspect: number;
  parNiveau: {
    faible: number;
    moyen: number;
    eleve: number;
    critique: number;
  };
  tendance: Array<{
    date: string;
    alertes: number;
    montant: number;
  }>;
}

export interface FraudPattern {
  id: string;
  nom: string;
  description: string;
  occurrences: number;
  montantTotal: number;
  scoreMoyen: number;
  praticiens?: string[];
  adherents?: string[];
  periode: string;
}

export const FRAUD_NIVEAU_LABELS: Record<string, string> = {
  faible: 'Faible',
  moyen: 'Moyen',
  eleve: 'Élevé',
  critique: 'Critique',
};

export const FRAUD_NIVEAU_COLORS: Record<string, string> = {
  faible: 'bg-yellow-100 text-yellow-800',
  moyen: 'bg-orange-100 text-orange-800',
  eleve: 'bg-red-100 text-red-800',
  critique: 'bg-red-200 text-red-900',
};

export const FRAUD_STATUT_LABELS: Record<string, string> = {
  nouvelle: 'Nouvelle',
  en_investigation: 'En investigation',
  confirmée: 'Confirmée',
  rejetée: 'Rejetée',
};

export const FRAUD_STATUT_COLORS: Record<string, string> = {
  nouvelle: 'bg-blue-100 text-blue-800',
  en_investigation: 'bg-purple-100 text-purple-800',
  confirmée: 'bg-red-100 text-red-800',
  rejetée: 'bg-green-100 text-green-800',
};

// Hooks

/**
 * Get fraud statistics
 */
export function useFraudStats() {
  return useQuery({
    queryKey: ['fraud-stats'],
    queryFn: async () => {
      const response = await apiClient.get<FraudStats>(
        '/sante/fraud/stats'
      );
      if (response.success && response.data) {
        return response.data;
      }
      // Return default stats if API not available
      return {
        totalAlertes: 0,
        nouvelles: 0,
        enInvestigation: 0,
        confirmées: 0,
        rejetées: 0,
        scoreMoyen: 0,
        montantSuspect: 0,
        parNiveau: { faible: 0, moyen: 0, eleve: 0, critique: 0 },
        tendance: [],
      } as FraudStats;
    },
    refetchInterval: 60000, // Refresh every minute
  });
}

/**
 * Get fraud alerts list
 */
export function useFraudAlerts(filters?: {
  niveau?: string;
  statut?: string;
  page?: number;
  limit?: number;
}) {
  return useQuery({
    queryKey: ['fraud-alerts', filters],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (filters?.niveau) params.append('niveau', filters.niveau);
      if (filters?.statut) params.append('statut', filters.statut);
      if (filters?.page) params.append('page', String(filters.page));
      if (filters?.limit) params.append('limit', String(filters.limit));

      const response = await apiClient.get<{ alerts: FraudAlert[]; meta: { page: number; limit: number; total: number } }>(
        `/sante/fraud/alerts?${params.toString()}`
      );

      if (response.success && response.data) {
        return response.data;
      }
      return { alerts: [], meta: { page: 1, limit: 20, total: 0 } };
    },
  });
}

/**
 * Get single fraud alert
 */
export function useFraudAlert(alertId: string | null) {
  return useQuery({
    queryKey: ['fraud-alert', alertId],
    queryFn: async () => {
      if (!alertId) return null;
      const response = await apiClient.get<FraudAlert>(
        `/sante/fraud/alerts/${alertId}`
      );
      if (response.success && response.data) {
        return response.data;
      }
      return null;
    },
    enabled: !!alertId,
  });
}

/**
 * Start investigation
 */
export function useStartInvestigation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (alertId: string) => {
      const response = await apiClient.post<FraudAlert>(
        `/sante/fraud/alerts/${alertId}/investigate`
      );
      if (!response.success) {
        throw new Error(response.error?.message || 'Erreur');
      }
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['fraud-alerts'] });
      queryClient.invalidateQueries({ queryKey: ['fraud-stats'] });
    },
  });
}

/**
 * Resolve fraud alert
 */
export function useResolveFraudAlert() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: {
      alertId: string;
      resolution: 'confirmée' | 'rejetée';
      notes: string;
      actions?: string[];
    }) => {
      const response = await apiClient.post<FraudAlert>(
        `/sante/fraud/alerts/${data.alertId}/resolve`,
        {
          resolution: data.resolution,
          notes: data.notes,
          actions: data.actions,
        }
      );
      if (!response.success) {
        throw new Error(response.error?.message || 'Erreur');
      }
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['fraud-alerts'] });
      queryClient.invalidateQueries({ queryKey: ['fraud-stats'] });
    },
  });
}

/**
 * Get detected patterns
 */
export function useFraudPatterns() {
  return useQuery({
    queryKey: ['fraud-patterns'],
    queryFn: async () => {
      const response = await apiClient.get<FraudPattern[]>(
        '/sante/fraud/patterns'
      );
      if (response.success && response.data) {
        return response.data;
      }
      return [];
    },
  });
}

/**
 * Get alerts for a specific demande
 */
export function useDemandeAlerts(demandeId: string | null) {
  return useQuery({
    queryKey: ['fraud-alerts-demande', demandeId],
    queryFn: async () => {
      if (!demandeId) return [];
      const response = await apiClient.get<FraudAlert[]>(
        `/sante/fraud/demande/${demandeId}`
      );
      if (response.success && response.data) {
        return response.data;
      }
      return [];
    },
    enabled: !!demandeId,
  });
}

/**
 * Format score with color
 */
export function getScoreColor(score: number): string {
  if (score >= 80) return 'text-red-600';
  if (score >= 60) return 'text-orange-600';
  if (score >= 40) return 'text-yellow-600';
  return 'text-green-600';
}

/**
 * Get niveau from score
 */
export function getNiveauFromScore(score: number): FraudAlert['niveau'] {
  if (score >= 80) return 'critique';
  if (score >= 60) return 'eleve';
  if (score >= 40) return 'moyen';
  return 'faible';
}
