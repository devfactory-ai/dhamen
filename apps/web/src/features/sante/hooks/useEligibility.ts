/**
 * Eligibility check hooks for SoinFlow
 */
import { useQuery, useMutation } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';

// ============================================
// Types
// ============================================

export interface EligibilityCheckResult {
  eligible: boolean;
  adherent: {
    id: string;
    matricule: string;
    nom: string;
    prenom: string;
    dateNaissance: string;
    estActif: boolean;
  };
  formule: {
    id: string;
    code: string;
    nom: string;
    plafondGlobal: number | null;
  } | null;
  plafonds: Array<{
    typeSoin: string;
    montantPlafond: number;
    montantConsommé: number;
    montantRestant: number;
    pourcentageUtilise: number;
  }>;
  contrat?: {
    id: string;
    numero: string;
    dateDebut: string;
    dateFin: string;
    estActif: boolean;
  };
  warnings: string[];
}

interface EligibilityCheckParams {
  matricule?: string;
  nationalId?: string;
  careType?: string;
  amount?: number;
}

// ============================================
// Hooks
// ============================================

/**
 * Check eligibility by matricule or national ID
 */
export function useCheckEligibility() {
  return useMutation({
    mutationFn: async (params: EligibilityCheckParams) => {
      const queryParams = new URLSearchParams();
      if (params.matricule) queryParams.set('matricule', params.matricule);
      if (params.nationalId) queryParams.set('nationalId', params.nationalId);
      if (params.careType) queryParams.set('careType', params.careType);
      if (params.amount) queryParams.set('amount', params.amount.toString());

      const response = await apiClient.get<{ success: boolean; data: EligibilityCheckResult }>(
        `/sante/eligibility/check?${queryParams.toString()}`
      );

      if (!response.success) {
        throw new Error(response.error?.message || 'Verification echouee');
      }

      return response.data?.data;
    },
  });
}

/**
 * Get adherent profile with coverage info
 */
export function useAdherentProfil(adherentId: string | null) {
  return useQuery({
    queryKey: ['sante-profil', adherentId],
    queryFn: async () => {
      if (!adherentId) return null;

      const response = await apiClient.get<{
        success: boolean;
        data: {
          adherent: {
            id: string;
            matricule: string;
            dateNaissance: string;
            estActif: boolean;
          };
          formule: {
            id: string;
            code: string;
            nom: string;
            plafondGlobal: number | null;
            tarifMensuel: number;
          } | null;
          plafonds: Array<{
            typeSoin: string;
            montantPlafond: number;
            montantConsommé: number;
            montantRestant: number;
            pourcentageUtilise: number;
          }>;
        };
      }>(`/sante/profil/${adherentId}`);

      if (!response.success) {
        throw new Error(response.error?.message || 'Failed to fetch profil');
      }

      return response.data?.data;
    },
    enabled: !!adherentId,
  });
}

/**
 * Get eligibility history for an adherent
 */
export function useEligibilityHistory(adherentId: string | null, limit = 10) {
  return useQuery({
    queryKey: ['sante-eligibility-history', adherentId, limit],
    queryFn: async () => {
      if (!adherentId) return [];

      const response = await apiClient.get<{
        success: boolean;
        data: Array<{
          id: string;
          careType: string;
          amount: number;
          eligible: boolean;
          checkDate: string;
          reasons: string[];
        }>;
      }>(`/sante/eligibility/history/${adherentId}?limit=${limit}`);

      if (!response.success) {
        return [];
      }

      return response.data?.data || [];
    },
    enabled: !!adherentId,
  });
}

// ============================================
// Helper exports
// ============================================

export const TYPE_SOIN_LABELS: Record<string, string> = {
  pharmacie: 'Pharmacie',
  consultation: 'Consultation',
  hospitalisation: 'Hospitalisation',
  optique: 'Optique',
  dentaire: 'Dentaire',
  laboratoire: 'Laboratoire',
  kinesitherapie: 'Kinesitherapie',
  global: 'Global',
};

export function formatAmount(millimes: number): string {
  return (millimes / 1000).toFixed(3) + ' TND';
}

export function getPlafondColor(pourcentage: number): string {
  if (pourcentage >= 90) return 'text-red-600';
  if (pourcentage >= 70) return 'text-orange-500';
  if (pourcentage >= 50) return 'text-yellow-500';
  return 'text-green-600';
}

export function getPlafondBgColor(pourcentage: number): string {
  if (pourcentage >= 90) return 'bg-red-500';
  if (pourcentage >= 70) return 'bg-orange-500';
  if (pourcentage >= 50) return 'bg-yellow-500';
  return 'bg-green-500';
}
