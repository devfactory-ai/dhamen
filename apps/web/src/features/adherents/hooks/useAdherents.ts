import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';

export interface Adherent {
  id: string;
  insurerId: string;
  insurerName?: string;
  contractId: string | null;
  memberNumber: string;
  nationalId: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  gender: 'M' | 'F';
  phone: string | null;
  email: string | null;
  address: string | null;
  city: string | null;
  relationship: 'PRIMARY' | 'SPOUSE' | 'CHILD' | 'PARENT';
  primaryAdherentId: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AyantDroitData {
  lienParente: 'C' | 'E'; // C=Conjoint, E=Enfant
  nationalId?: string;
  typePieceIdentite?: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  gender?: string;
  phone?: string;
  email?: string;
}

export interface CreateAdherentData {
  // Identité
  nationalId: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  gender?: string;
  lieuNaissance?: string;
  etatCivil?: string;
  dateMarriage?: string;
  // Contact
  phone?: string;
  mobile?: string;
  email?: string;
  // Adresse
  rue?: string;
  address?: string;
  city?: string;
  postalCode?: string;
  // Entreprise & couverture
  companyId?: string;
  matricule?: string;
  plafondGlobal?: number;
  dateDebutAdhesion?: string;
  dateFinAdhesion?: string;
  rang?: number;
  isActive?: boolean;
  // Renseignements
  banque?: string;
  rib?: string;
  regimeSocial?: string;
  handicap?: boolean;
  fonction?: string;
  maladiChronique?: boolean;
  matriculeConjoint?: string;
  // Nouveaux champs Acorad
  typePieceIdentite?: string;
  dateEditionPiece?: string;
  contreVisiteObligatoire?: boolean;
  etatFiche?: string;
  credit?: number;
  // Contrat
  contractNumber?: string;
  // Ayants droit
  ayantsDroit?: AyantDroitData[];
}

export type UpdateAdherentData = Partial<Omit<CreateAdherentData, 'nationalId' | 'companyId'>>;

export function useAdherents(page = 1, limit = 20, search?: string, companyId?: string, isActive?: 'true' | 'false', dossierComplet?: 'true' | 'false', contractType?: 'group' | 'individual') {
  return useQuery({
    queryKey: ['adherents', page, limit, search, companyId, isActive, dossierComplet, contractType],
    queryFn: async () => {
      const response = await apiClient.get<Adherent[]>('/adherents', {
        params: { page, limit, search, companyId, isActive, dossierComplet, contractType },
      });
      if (!response.success) {
        throw new Error(response.error?.message || 'Erreur lors du chargement des adhérents');
      }
      // The API returns { success, data: [...], meta: {...} } — meta is a sibling of data
      const raw = response as unknown as { data: Adherent[]; meta: { page: number; limit: number; total: number; totalPages: number } };
      return { data: raw.data, meta: raw.meta };
    },
  });
}

export function useAdherent(id: string) {
  return useQuery({
    queryKey: ['adherents', id],
    queryFn: async () => {
      const response = await apiClient.get<Adherent>(`/adherents/${id}`);
      if (!response.success) {
        throw new Error(response.error?.message || 'Erreur lors du chargement de l\'adhérent');
      }
      return response.data;
    },
    enabled: !!id,
  });
}

export function useSearchAdherent(nationalId: string) {
  return useQuery({
    queryKey: ['adherents', 'search', nationalId],
    queryFn: async () => {
      const response = await apiClient.get<Adherent>('/adherents/search', {
        params: { nationalId },
      });
      if (!response.success) {
        throw new Error(response.error?.message || 'Adhérent non trouvé');
      }
      return response.data;
    },
    enabled: nationalId.length >= 8,
  });
}

export function useNextMatricule(companyId?: string) {
  return useQuery({
    queryKey: ['adherents', 'next-matricule', companyId],
    queryFn: async () => {
      const response = await apiClient.get<{ matricule: string }>('/adherents/next-matricule', {
        params: { companyId },
      });
      if (!response.success) return '0001';
      return response.data?.matricule ?? '0001';
    },
    enabled: !!companyId,
  });
}

export interface AdherentSearchResult {
  id: string;
  matricule: string;
  firstName: string;
  lastName: string;
  email: string | null;
  companyName: string | null;
  plafondGlobal: number | null;
  plafondConsomme: number | null;
  contractType: 'individual' | 'family' | 'corporate' | null;
}

export function useSearchAdherents(query: string) {
  return useQuery({
    queryKey: ['adherents', 'autocomplete', query],
    queryFn: async () => {
      const response = await apiClient.get<AdherentSearchResult[]>('/adherents/search', {
        params: { q: query },
      });
      if (!response.success) {
        throw new Error(response.error?.message || 'Erreur de recherche');
      }
      return response.data;
    },
    enabled: query.length >= 2,
  });
}

export interface AdherentBulletin {
  id: string;
  dateSoins: string;
  status: string;
  declaredAmount: number;
  reimbursedAmount: number;
  actesCount: number;
  createdAt: string;
}

export function useAdherentBulletins(adherentId: string, page = 1, limit = 5) {
  return useQuery({
    queryKey: ['adherents', adherentId, 'bulletins', page, limit],
    queryFn: async () => {
      const response = await apiClient.get<AdherentBulletin[]>(`/adherents/${adherentId}/bulletins`, {
        params: { page, limit },
      });
      if (!response.success) {
        throw new Error(response.error?.message || 'Erreur lors du chargement des bulletins');
      }
      const raw = response as unknown as { data: AdherentBulletin[]; meta: { page: number; limit: number; total: number; totalPages: number } };
      return { data: raw.data, meta: raw.meta };
    },
    enabled: !!adherentId,
  });
}

export function useCreateAdherent() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: CreateAdherentData) => {
      const response = await apiClient.post<Adherent>('/adherents', data);
      if (!response.success) {
        throw new Error(response.error?.message || 'Erreur lors de la création de l\'adhérent');
      }
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['adherents'] });
    },
  });
}

export function useUpdateAdherent() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: UpdateAdherentData }) => {
      const response = await apiClient.put<Adherent>(`/adherents/${id}`, data);
      if (!response.success) {
        throw new Error(response.error?.message || 'Erreur lors de la mise à jour de l\'adhérent');
      }
      return response.data;
    },
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ['adherents'] });
      queryClient.invalidateQueries({ queryKey: ['adherents', id] });
    },
  });
}

export function useDeleteAdherent() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const response = await apiClient.delete(`/adherents/${id}`);
      // 204 No Content returns a parse error — treat it as success
      if (!response.success && response.error?.code !== 'PARSE_ERROR') {
        throw new Error(response.error?.message || 'Erreur lors de la suppression de l\'adhérent');
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['adherents'] });
    },
  });
}

export function useBulkDeleteAdherents() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (ids: string[]) => {
      const response = await apiClient.post('/adherents/bulk-delete', { ids });
      if (!response.success) {
        throw new Error(response.error?.message || 'Erreur lors de la suppression');
      }
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['adherents'] });
    },
  });
}
