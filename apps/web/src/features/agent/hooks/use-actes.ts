import { apiClient } from '@/lib/api-client';
import { useQuery } from '@tanstack/react-query';

interface ActeReferentiel {
  id: string;
  code: string;
  label: string;
  taux_remboursement: number;
  plafond_acte: number | null;
  famille_id: string | null;
  type_calcul: 'taux' | 'forfait';
  valeur_base: number | null;
  code_assureur: string | null;
}

interface FamilleActe {
  id: string;
  code: string;
  label: string;
  ordre: number;
}

export interface ActesGroupeParFamille {
  famille: FamilleActe;
  actes: ActeReferentiel[];
}

/**
 * Hook to fetch actes referentiel grouped by famille.
 * Returns families sorted by ordre, each containing their associated actes.
 */
export function useActesGroupes() {
  return useQuery({
    queryKey: ['actes-referentiel', 'groupes'],
    queryFn: async (): Promise<ActesGroupeParFamille[]> => {
      const response = await apiClient.get<ActesGroupeParFamille[]>(
        '/bulletins-soins/agent/actes-referentiel/groupes'
      );
      if (!response.success) {
        throw new Error(response.error?.message || 'Erreur chargement referentiel');
      }
      return response.data || [];
    },
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Hook to fetch the flat list of actes referentiel.
 */
export function useActesReferentiel() {
  return useQuery({
    queryKey: ['actes-referentiel'],
    queryFn: async (): Promise<ActeReferentiel[]> => {
      const response = await apiClient.get<ActeReferentiel[]>(
        '/bulletins-soins/agent/actes-referentiel'
      );
      if (!response.success) {
        throw new Error(response.error?.message || 'Erreur chargement referentiel');
      }
      return response.data || [];
    },
    staleTime: 5 * 60 * 1000,
  });
}
