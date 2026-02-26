/**
 * SoinFlow Garanties/Formules hooks
 *
 * Manage guarantee formulas and coverage rules
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';

// ============================================
// Types
// ============================================

export interface SanteFormule {
  id: string;
  code: string;
  nom: string;
  description?: string;
  plafondGlobal: number | null;
  tarifMensuel: number;
  estActif: boolean;
  nbAdherents: number;
  createdAt: string;
}

export interface SanteCouverture {
  id: string;
  formuleId: string;
  typeSoin: string;
  tauxCouverture: number;
  plafond: number | null;
  delaiCarence: number; // en jours
  estActif: boolean;
}

export interface FormuleDetail extends SanteFormule {
  couvertures: SanteCouverture[];
}

export interface FormuleCreateInput {
  code: string;
  nom: string;
  description?: string;
  plafondGlobal?: number;
  tarifMensuel: number;
  couvertures: Array<{
    typeSoin: string;
    tauxCouverture: number;
    plafond?: number;
    delaiCarence?: number;
  }>;
}

export interface FormuleUpdateInput {
  nom?: string;
  description?: string;
  plafondGlobal?: number | null;
  tarifMensuel?: number;
  estActif?: boolean;
}

// ============================================
// Hooks
// ============================================

/**
 * Fetch all formules
 */
export function useFormules(includeInactive = false) {
  return useQuery({
    queryKey: ['sante-formules', includeInactive],
    queryFn: async () => {
      const response = await apiClient.get<{ success: boolean; data: SanteFormule[] }>(
        `/sante/garanties/formules?includeInactive=${includeInactive}`
      );

      if (!response.success) {
        throw new Error(response.error?.message || 'Failed to fetch formules');
      }

      return response.data?.data || [];
    },
  });
}

/**
 * Fetch single formule with couvertures
 */
export function useFormuleById(id: string | null) {
  return useQuery({
    queryKey: ['sante-formule', id],
    queryFn: async () => {
      if (!id) return null;

      const response = await apiClient.get<{ success: boolean; data: FormuleDetail }>(
        `/sante/garanties/formules/${id}`
      );

      if (!response.success) {
        throw new Error(response.error?.message || 'Failed to fetch formule');
      }

      return response.data?.data;
    },
    enabled: !!id,
  });
}

/**
 * Create new formule
 */
export function useCreateFormule() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: FormuleCreateInput) => {
      const response = await apiClient.post<{ success: boolean; data: SanteFormule }>(
        '/sante/garanties/formules',
        data
      );

      if (!response.success) {
        throw new Error(response.error?.message || 'Failed to create formule');
      }

      return response.data?.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sante-formules'] });
    },
  });
}

/**
 * Update formule
 */
export function useUpdateFormule() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: FormuleUpdateInput }) => {
      const response = await apiClient.patch<{ success: boolean; data: SanteFormule }>(
        `/sante/garanties/formules/${id}`,
        data
      );

      if (!response.success) {
        throw new Error(response.error?.message || 'Failed to update formule');
      }

      return response.data?.data;
    },
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ['sante-formules'] });
      queryClient.invalidateQueries({ queryKey: ['sante-formule', id] });
    },
  });
}

/**
 * Delete formule
 */
export function useDeleteFormule() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const response = await apiClient.delete(`/sante/garanties/formules/${id}`);

      if (!response.success) {
        throw new Error(response.error?.message || 'Failed to delete formule');
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sante-formules'] });
    },
  });
}

/**
 * Update couverture
 */
export function useUpdateCouverture() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      formuleId,
      couvertureId,
      data,
    }: {
      formuleId: string;
      couvertureId: string;
      data: Partial<SanteCouverture>;
    }) => {
      const response = await apiClient.patch<{ success: boolean; data: SanteCouverture }>(
        `/sante/garanties/formules/${formuleId}/couvertures/${couvertureId}`,
        data
      );

      if (!response.success) {
        throw new Error(response.error?.message || 'Failed to update couverture');
      }

      return response.data?.data;
    },
    onSuccess: (_, { formuleId }) => {
      queryClient.invalidateQueries({ queryKey: ['sante-formule', formuleId] });
    },
  });
}

/**
 * Add couverture to formule
 */
export function useAddCouverture() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      formuleId,
      data,
    }: {
      formuleId: string;
      data: Omit<SanteCouverture, 'id' | 'formuleId' | 'estActif'>;
    }) => {
      const response = await apiClient.post<{ success: boolean; data: SanteCouverture }>(
        `/sante/garanties/formules/${formuleId}/couvertures`,
        data
      );

      if (!response.success) {
        throw new Error(response.error?.message || 'Failed to add couverture');
      }

      return response.data?.data;
    },
    onSuccess: (_, { formuleId }) => {
      queryClient.invalidateQueries({ queryKey: ['sante-formule', formuleId] });
    },
  });
}

// ============================================
// Helpers
// ============================================

export const TYPE_SOIN_OPTIONS = [
  { value: 'pharmacie', label: 'Pharmacie' },
  { value: 'consultation', label: 'Consultation' },
  { value: 'hospitalisation', label: 'Hospitalisation' },
  { value: 'optique', label: 'Optique' },
  { value: 'dentaire', label: 'Dentaire' },
  { value: 'laboratoire', label: 'Laboratoire' },
  { value: 'kinesitherapie', label: 'Kinesitherapie' },
];

export function formatMontant(millimes: number): string {
  return (millimes / 1000).toFixed(3) + ' TND';
}

export function formatTaux(taux: number): string {
  return taux.toFixed(0) + '%';
}

export function formatDelaiCarence(jours: number): string {
  if (jours === 0) return 'Aucun';
  if (jours === 1) return '1 jour';
  if (jours < 30) return `${jours} jours`;
  const mois = Math.floor(jours / 30);
  return mois === 1 ? '1 mois' : `${mois} mois`;
}
