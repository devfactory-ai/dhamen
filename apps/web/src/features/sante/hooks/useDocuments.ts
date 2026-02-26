/**
 * Documents Hooks for SoinFlow
 *
 * Hooks for document upload, download, and OCR processing
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';

// Types
export interface SanteDocument {
  id: string;
  demandeId: string;
  typeDocument: string;
  r2Key: string;
  nomFichier: string;
  mimeType: string;
  tailleOctets: number;
  ocrStatus: 'pending' | 'processing' | 'completed' | 'failed' | null;
  ocrResultJson: string | null;
  uploadedBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface OcrResult {
  confidence: number;
  montantTotal: number;
  lignes: Array<{
    code: string;
    designation: string;
    quantite: number;
    prixUnitaire: number;
    montant: number;
  }>;
  metadata?: Record<string, unknown>;
}

export const DOCUMENT_TYPE_LABELS: Record<string, string> = {
  ordonnance: 'Ordonnance',
  facture: 'Facture',
  bulletin_soin: 'Bulletin de soin',
  carte_assure: 'Carte assuré',
  piece_identite: 'Pièce d\'identité',
  compte_rendu: 'Compte rendu médical',
  resultats_labo: 'Résultats laboratoire',
  autre: 'Autre',
};

export const DOCUMENT_TYPE_ICONS: Record<string, string> = {
  ordonnance: '📋',
  facture: '🧾',
  bulletin_soin: '📄',
  carte_assure: '💳',
  piece_identite: '🪪',
  compte_rendu: '📝',
  resultats_labo: '🔬',
  autre: '📎',
};

// Hooks

/**
 * Get documents for a demande
 */
export function useDemandeDocuments(demandeId: string | null) {
  return useQuery({
    queryKey: ['sante-documents', demandeId],
    queryFn: async () => {
      if (!demandeId) return [];
      const response = await apiClient.get<{ success: boolean; data: SanteDocument[] }>(
        `/sante/documents/demande/${demandeId}`
      );
      if (response.success && response.data) {
        return response.data.data;
      }
      return [];
    },
    enabled: !!demandeId,
  });
}

/**
 * Get single document
 */
export function useDocument(documentId: string | null) {
  return useQuery({
    queryKey: ['sante-document', documentId],
    queryFn: async () => {
      if (!documentId) return null;
      const response = await apiClient.get<{ success: boolean; data: SanteDocument }>(
        `/sante/documents/${documentId}`
      );
      if (response.success && response.data) {
        return response.data.data;
      }
      return null;
    },
    enabled: !!documentId,
  });
}

/**
 * Upload document
 */
export function useUploadDocument() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: {
      file: File;
      demandeId: string;
      typeDocument: string;
    }) => {
      const formData = new FormData();
      formData.append('file', data.file);
      formData.append('demandeId', data.demandeId);
      formData.append('typeDocument', data.typeDocument);

      const response = await apiClient.upload<SanteDocument>(
        '/sante/documents/upload',
        formData
      );

      if (!response.success) {
        throw new Error(response.error?.message || 'Erreur lors de l\'upload');
      }

      return response.data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['sante-documents', variables.demandeId] });
    },
  });
}

/**
 * Trigger OCR processing
 */
export function useOcrDocument() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (documentId: string) => {
      const response = await apiClient.post<{ message: string; data: OcrResult }>(
        `/sante/documents/${documentId}/ocr`
      );

      if (!response.success) {
        throw new Error(response.error?.message || 'Erreur OCR');
      }

      return response.data?.data;
    },
    onSuccess: (_, documentId) => {
      queryClient.invalidateQueries({ queryKey: ['sante-document', documentId] });
      queryClient.invalidateQueries({ queryKey: ['sante-documents'] });
    },
  });
}

/**
 * Delete document
 */
export function useDeleteDocument() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (documentId: string) => {
      const response = await apiClient.delete(`/sante/documents/${documentId}`);

      if (!response.success) {
        throw new Error(response.error?.message || 'Erreur lors de la suppression');
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sante-documents'] });
    },
  });
}

/**
 * Download document
 */
export async function downloadDocument(documentId: string, filename: string) {
  const response = await fetch(
    `${apiClient.getBaseUrl()}/sante/documents/${documentId}/download`,
    {
      headers: {
        Authorization: `Bearer ${localStorage.getItem('accessToken')}`,
      },
    }
  );

  if (!response.ok) {
    throw new Error('Erreur lors du téléchargement');
  }

  const blob = await response.blob();
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  window.URL.revokeObjectURL(url);
  document.body.removeChild(a);
}

/**
 * Get preview URL for document
 */
export function getDocumentPreviewUrl(documentId: string): string {
  return `${apiClient.getBaseUrl()}/sante/documents/${documentId}/download`;
}

/**
 * Format file size
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

/**
 * Check if file is an image
 */
export function isImageFile(mimeType: string): boolean {
  return mimeType.startsWith('image/');
}

/**
 * Check if file is a PDF
 */
export function isPdfFile(mimeType: string): boolean {
  return mimeType === 'application/pdf';
}
