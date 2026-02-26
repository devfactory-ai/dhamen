/**
 * Reports Hooks for SoinFlow
 *
 * Hooks for generating and managing reports
 */
import { useQuery, useMutation } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';

// Types
export interface ReportTemplate {
  id: string;
  code: string;
  nom: string;
  description: string;
  categorie: 'demandes' | 'paiements' | 'praticiens' | 'adherents' | 'fraude' | 'statistiques';
  parametres: ReportParameter[];
  formats: ('pdf' | 'excel' | 'csv')[];
}

export interface ReportParameter {
  code: string;
  label: string;
  type: 'date' | 'dateRange' | 'select' | 'multiSelect' | 'text' | 'number';
  required: boolean;
  options?: { value: string; label: string }[];
  defaultValue?: unknown;
}

export interface GeneratedReport {
  id: string;
  templateId: string;
  templateNom: string;
  format: 'pdf' | 'excel' | 'csv';
  statut: 'en_cours' | 'termine' | 'erreur';
  parametres: Record<string, unknown>;
  fileUrl?: string;
  fileSize?: number;
  createdAt: string;
  completedAt?: string;
  erreur?: string;
  createdBy: {
    id: string;
    nom: string;
  };
}

export interface ReportStats {
  totalGenerated: number;
  parFormat: {
    pdf: number;
    excel: number;
    csv: number;
  };
  parCategorie: Record<string, number>;
  derniersRapports: GeneratedReport[];
}

export const REPORT_CATEGORIE_LABELS: Record<string, string> = {
  demandes: 'Demandes de soins',
  paiements: 'Paiements',
  praticiens: 'Praticiens',
  adherents: 'Adherents',
  fraude: 'Detection fraude',
  statistiques: 'Statistiques',
};

export const REPORT_FORMAT_LABELS: Record<string, string> = {
  pdf: 'PDF',
  excel: 'Excel',
  csv: 'CSV',
};

export const REPORT_FORMAT_ICONS: Record<string, string> = {
  pdf: '📄',
  excel: '📊',
  csv: '📋',
};

// Default templates (fallback if API not available)
const DEFAULT_TEMPLATES: ReportTemplate[] = [
  {
    id: 'tpl-1',
    code: 'demandes-periode',
    nom: 'Rapport des demandes par periode',
    description: 'Liste des demandes de soins avec details et statuts',
    categorie: 'demandes',
    parametres: [
      {
        code: 'dateRange',
        label: 'Periode',
        type: 'dateRange',
        required: true,
      },
      {
        code: 'statut',
        label: 'Statut',
        type: 'multiSelect',
        required: false,
        options: [
          { value: 'en_attente', label: 'En attente' },
          { value: 'approuvee', label: 'Approuvee' },
          { value: 'rejetee', label: 'Rejetee' },
          { value: 'payee', label: 'Payee' },
        ],
      },
      {
        code: 'typeSoin',
        label: 'Type de soin',
        type: 'multiSelect',
        required: false,
        options: [
          { value: 'pharmacie', label: 'Pharmacie' },
          { value: 'consultation', label: 'Consultation' },
          { value: 'analyse', label: 'Analyses' },
          { value: 'hospitalisation', label: 'Hospitalisation' },
          { value: 'radiologie', label: 'Radiologie' },
        ],
      },
    ],
    formats: ['pdf', 'excel', 'csv'],
  },
  {
    id: 'tpl-2',
    code: 'paiements-praticiens',
    nom: 'Paiements par praticien',
    description: 'Detail des paiements effectues par praticien',
    categorie: 'paiements',
    parametres: [
      {
        code: 'dateRange',
        label: 'Periode',
        type: 'dateRange',
        required: true,
      },
      {
        code: 'praticienId',
        label: 'Praticien',
        type: 'select',
        required: false,
        options: [],
      },
    ],
    formats: ['pdf', 'excel'],
  },
  {
    id: 'tpl-3',
    code: 'statistiques-mensuelles',
    nom: 'Statistiques mensuelles',
    description: 'Resume statistique mensuel des activites',
    categorie: 'statistiques',
    parametres: [
      {
        code: 'mois',
        label: 'Mois',
        type: 'date',
        required: true,
      },
    ],
    formats: ['pdf', 'excel'],
  },
  {
    id: 'tpl-4',
    code: 'fraude-alertes',
    nom: 'Alertes de fraude',
    description: 'Liste des alertes de fraude detectees',
    categorie: 'fraude',
    parametres: [
      {
        code: 'dateRange',
        label: 'Periode',
        type: 'dateRange',
        required: true,
      },
      {
        code: 'niveau',
        label: 'Niveau',
        type: 'multiSelect',
        required: false,
        options: [
          { value: 'faible', label: 'Faible' },
          { value: 'moyen', label: 'Moyen' },
          { value: 'eleve', label: 'Eleve' },
          { value: 'critique', label: 'Critique' },
        ],
      },
    ],
    formats: ['pdf', 'excel'],
  },
  {
    id: 'tpl-5',
    code: 'adherents-consommation',
    nom: 'Consommation par adherent',
    description: 'Detail de la consommation par adherent',
    categorie: 'adherents',
    parametres: [
      {
        code: 'dateRange',
        label: 'Periode',
        type: 'dateRange',
        required: true,
      },
      {
        code: 'assureurId',
        label: 'Assureur',
        type: 'select',
        required: false,
        options: [],
      },
    ],
    formats: ['pdf', 'excel', 'csv'],
  },
  {
    id: 'tpl-6',
    code: 'praticiens-activite',
    nom: 'Activite des praticiens',
    description: 'Resume de l\'activite par praticien',
    categorie: 'praticiens',
    parametres: [
      {
        code: 'dateRange',
        label: 'Periode',
        type: 'dateRange',
        required: true,
      },
      {
        code: 'typePraticien',
        label: 'Type de praticien',
        type: 'multiSelect',
        required: false,
        options: [
          { value: 'pharmacie', label: 'Pharmacie' },
          { value: 'medecin', label: 'Medecin' },
          { value: 'laboratoire', label: 'Laboratoire' },
          { value: 'clinique', label: 'Clinique' },
          { value: 'radiologie', label: 'Radiologie' },
        ],
      },
    ],
    formats: ['pdf', 'excel'],
  },
];

// Hooks

/**
 * Get report templates
 */
export function useReportTemplates(categorie?: string) {
  return useQuery({
    queryKey: ['report-templates', categorie],
    queryFn: async () => {
      const params = categorie ? `?categorie=${categorie}` : '';
      const response = await apiClient.get<{
        success: boolean;
        data: ReportTemplate[];
      }>(`/sante/reports/templates${params}`);

      if (response.success && response.data) {
        return response.data.data;
      }
      // Return default templates if API not available
      return categorie
        ? DEFAULT_TEMPLATES.filter((t) => t.categorie === categorie)
        : DEFAULT_TEMPLATES;
    },
  });
}

/**
 * Get generated reports
 */
export function useGeneratedReports(filters?: {
  templateId?: string;
  format?: string;
  page?: number;
  limit?: number;
}) {
  return useQuery({
    queryKey: ['generated-reports', filters],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (filters?.templateId) params.append('templateId', filters.templateId);
      if (filters?.format) params.append('format', filters.format);
      if (filters?.page) params.append('page', String(filters.page));
      if (filters?.limit) params.append('limit', String(filters.limit));

      const response = await apiClient.get<{
        success: boolean;
        data: {
          reports: GeneratedReport[];
          meta: { page: number; limit: number; total: number };
        };
      }>(`/sante/reports?${params.toString()}`);

      if (response.success && response.data) {
        return response.data.data;
      }
      return { reports: [], meta: { page: 1, limit: 20, total: 0 } };
    },
  });
}

/**
 * Get report stats
 */
export function useReportStats() {
  return useQuery({
    queryKey: ['report-stats'],
    queryFn: async () => {
      const response = await apiClient.get<{
        success: boolean;
        data: ReportStats;
      }>('/sante/reports/stats');

      if (response.success && response.data) {
        return response.data.data;
      }
      return {
        totalGenerated: 0,
        parFormat: { pdf: 0, excel: 0, csv: 0 },
        parCategorie: {},
        derniersRapports: [],
      } as ReportStats;
    },
  });
}

/**
 * Generate a report
 */
export function useGenerateReport() {
  return useMutation({
    mutationFn: async (data: {
      templateId: string;
      format: 'pdf' | 'excel' | 'csv';
      parametres: Record<string, unknown>;
    }) => {
      const response = await apiClient.post<{
        success: boolean;
        data: GeneratedReport;
      }>('/sante/reports/generate', data);

      if (!response.success) {
        throw new Error(response.error?.message || 'Erreur lors de la generation');
      }
      return response.data?.data;
    },
  });
}

/**
 * Download a report
 */
export async function downloadReport(reportId: string, filename: string): Promise<void> {
  const response = await apiClient.get<{ success: boolean; data: { url: string } }>(
    `/sante/reports/${reportId}/download`
  );

  if (response.success && response.data?.data?.url) {
    // Create a temporary link and click it
    const link = document.createElement('a');
    link.href = response.data.data.url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  } else {
    throw new Error('Impossible de telecharger le rapport');
  }
}

/**
 * Delete a report
 */
export function useDeleteReport() {
  return useMutation({
    mutationFn: async (reportId: string) => {
      const response = await apiClient.delete<{ success: boolean }>(
        `/sante/reports/${reportId}`
      );

      if (!response.success) {
        throw new Error(response.error?.message || 'Erreur lors de la suppression');
      }
      return true;
    },
  });
}

/**
 * Format file size for display
 */
export function formatFileSize(bytes?: number): string {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let size = bytes;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }
  return `${size.toFixed(1)} ${units[unitIndex]}`;
}
