/**
 * Reconciliation types
 */

export const RECONCILIATION_STATUSES = ['generated', 'sent', 'paid'] as const;

export type ReconciliationStatus = (typeof RECONCILIATION_STATUSES)[number];

export interface Reconciliation {
  id: string;
  insurerId: string;
  periodStart: string;
  periodEnd: string;
  totalClaims: number;
  totalAmount: number;
  totalCovered: number;
  totalRetentions: number;
  totalNetPayable: number;
  pdfPath: string | null;
  status: ReconciliationStatus;
  createdAt: string;
  paidAt: string | null;
}

export interface ReconciliationProvider {
  providerId: string;
  providerName: string;
  providerType: string;
  claimCount: number;
  totalAmount: number;
  coveredAmount: number;
  retentions: number;
  netPayable: number;
}

export interface ReconciliationCreate {
  insurerId: string;
  periodStart: string;
  periodEnd: string;
}

export interface ReconciliationUpdate {
  status?: ReconciliationStatus;
  paidAt?: string;
}

export interface ReconciliationFilters {
  insurerId?: string;
  status?: ReconciliationStatus;
  dateFrom?: string;
  dateTo?: string;
}

export interface ReconciliationWithDetails extends Reconciliation {
  insurer?: {
    id: string;
    name: string;
    code: string;
  };
  providers?: ReconciliationProvider[];
}
