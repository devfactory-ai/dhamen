/**
 * Insurer types
 */

export interface ReconciliationConfig {
  cycle: 'weekly' | 'biweekly' | 'monthly';
  dayOfWeek?: number;
  dayOfMonth?: number;
  retentionRate: number;
  autoGenerate: boolean;
  pdfTemplate: string;
}

export interface FraudThresholds {
  reviewThreshold: number;
  blockThreshold: number;
}

export interface InsurerConfig {
  reconciliation: ReconciliationConfig;
  fraudThresholds: FraudThresholds;
  defaultReimbursementRate: number;
}

export type TypeAssureur = 'cnam' | 'mutuelle' | 'compagnie' | 'reassureur' | 'autre';

export interface Insurer {
  id: string;
  name: string;
  code: string;
  taxId: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  configJson: InsurerConfig;
  isActive: boolean;
  typeAssureur: TypeAssureur;
  matriculeFiscal: string | null;
  matriculeValide: boolean;
  dateDebutConvention: string | null;
  dateFinConvention: string | null;
  tauxCouverture: number | null;
  conventionExpireBientot: boolean;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface InsurerCreate {
  name: string;
  code: string;
  taxId?: string;
  address?: string;
  phone?: string;
  email?: string;
  config?: Partial<InsurerConfig>;
  typeAssureur?: TypeAssureur;
  matriculeFiscal?: string;
  dateDebutConvention?: string;
  dateFinConvention?: string;
  tauxCouverture?: number;
}

export interface InsurerUpdate {
  name?: string;
  taxId?: string;
  address?: string;
  phone?: string;
  email?: string;
  config?: Partial<InsurerConfig>;
  isActive?: boolean;
  typeAssureur?: TypeAssureur;
  matriculeFiscal?: string;
  dateDebutConvention?: string;
  dateFinConvention?: string;
  tauxCouverture?: number;
}

export interface InsurerFilters {
  isActive?: boolean;
  search?: string;
  typeAssureur?: TypeAssureur;
}
