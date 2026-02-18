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
}

export interface InsurerUpdate {
  name?: string;
  taxId?: string;
  address?: string;
  phone?: string;
  email?: string;
  config?: Partial<InsurerConfig>;
  isActive?: boolean;
}

export interface InsurerFilters {
  isActive?: boolean;
  search?: string;
}
