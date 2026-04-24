import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';

interface FamilleMembre {
  id: string;
  matricule: string | null;
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  gender: string | null;
  email: string | null;
  phone: string | null;
  nationalId: string | null;
  typePieceIdentite: string | null;
  codeType: 'A' | 'C' | 'E';
  rangPres: number;
  codeSituationFam: string | null;
  parentAdherentId: string | null;
  plafondGlobal: number | null;
}

interface FamilleComplete {
  principal: FamilleMembre;
  conjoint: FamilleMembre | null;
  enfants: FamilleMembre[];
}

export type { FamilleMembre, FamilleComplete };

/**
 * Hook to fetch the complete family composition for an adherent.
 * Returns the principal, conjoint (if any), and children sorted by rang.
 */
export function useAdherentFamille(adherentId: string | undefined) {
  return useQuery({
    queryKey: ['adherent-famille', adherentId],
    queryFn: async (): Promise<FamilleComplete> => {
      const response = await apiClient.get<FamilleComplete>(
        `/adherents/${adherentId}/famille`
      );
      if (!response.success) {
        throw new Error(response.error?.message || 'Erreur chargement famille');
      }
      if (!response.data) {
        throw new Error('Données famille manquantes');
      }
      return response.data;
    },
    enabled: !!adherentId,
  });
}
