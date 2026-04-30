import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';

interface PlafondAvecFamille {
  id: string;
  familleActeId: string | null;
  typeMaladie: string;
  montantPlafond: number;
  montantConsomme: number;
  familleCode: string | null;
  familleLabel: string | null;
  pourcentageConsomme: number;
  montantRestant: number;
  /** Plafond par acte/événement en millimes (ex: 150 DT pharmacie/jour) */
  perEventLimit?: number | null;
  /** Plafond journalier en millimes */
  dailyLimit?: number | null;
  /** true when this is the family-shared global plafond (from principal adherent) */
  isSharedFamily?: boolean;
}

interface PlafondsResume {
  global: PlafondAvecFamille | null;
  parFamille: PlafondAvecFamille[];
  totalConsomme: number;
  totalPlafond: number;
}

export type { PlafondAvecFamille, PlafondsResume };

/**
 * Hook to fetch plafond consumption for an adherent.
 * Returns global plafond and per-act-family breakdown with progress percentages.
 */
export function useAdherentPlafonds(adherentId: string | undefined, annee?: number) {
  const year = annee || new Date().getFullYear();
  return useQuery({
    queryKey: ['adherent-plafonds', adherentId, year],
    queryFn: async (): Promise<PlafondsResume> => {
      const response = await apiClient.get<PlafondsResume>(
        `/adherents/${adherentId}/plafonds`,
        { params: { annee: year } }
      );
      if (!response.success) {
        throw new Error(response.error?.message || 'Erreur chargement plafonds');
      }
      if (!response.data) {
        throw new Error('Données plafonds manquantes');
      }
      return response.data;
    },
    enabled: !!adherentId,
  });
}
